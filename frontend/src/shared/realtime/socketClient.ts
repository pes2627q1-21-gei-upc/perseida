// The app's single WebSocket connection (ADR-0030, US TG-64). It opens with the first consumer
// and closes with the last one; every feature shares it and joins its own rooms.
//
// Protocol: the first frame is `auth` with the access token, and nothing else is sent until the
// server echoes it. Pings are answered with pongs. Requests carry an `id` and the server answers
// with the same `id` (ack or `error`). On a dropped connection it retries with exponential backoff
// and joins its rooms again; 4401 renews the session once, and 4429 (too many connections) stops.
// A connection that stays silent for DEAD_AFTER_MS is dead (the server pings every 30 s): it is
// closed and treated like a drop.
// In the background the socket is closed (the OS would freeze it anyway) and nothing is retried;
// coming back to the foreground connects at once, with the backoff reset. `inactive` (iOS fires it
// for the control centre or Face ID) does nothing: the connection stays as it is.
// send() queues the request in memory (at most OUTBOX_MAX; beyond that it is rejected at once):
// it goes out once the connection is authenticated, with a fixed `id` and the same payload on
// every retry (the server deduplicates), is sent again after
// MAX_SEND_ATTEMPTS-bounded timeouts, drops and retryable errors, and gives up with SEND_UNCERTAIN
// when the last attempt got no answer, since the server may have processed it.
// The session comes from outside (SocketAuth), so shared/ does not depend on any feature.

import { AppState, type AppStateStatus } from 'react-native';

import { config } from '../config';
import { AppError, isAppError, networkError, problemToAppError } from '../errors';

/** The session the connection authenticates with; the auth feature provides it. */
export interface SocketAuth {
  /** The current access token, read on every connection; null when there is no session. */
  getToken: () => Promise<string | null>;
  /**
   * Renews the session after a 4401; rejects when it cannot be renewed. An AppError rejection
   * becomes the connection's error; any other one means INVALID_SESSION.
   */
  refresh: () => Promise<void>;
}

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface SocketState {
  status: SocketStatus;
  /** Why the connection is closed or failing; null while it works. */
  error: AppError | null;
}

/** A frame from the server: `{type, room?, payload, id?}` (ADR-0030). */
export interface ServerFrame {
  type: string;
  room?: string;
  id?: string;
  payload?: Record<string, unknown>;
}

/** A request to a room that the server acknowledges (the client adds the `id`). */
export interface OutgoingFrame {
  type: 'message';
  room: string;
  payload: Record<string, unknown>;
}

export type FrameHandler = (frame: ServerFrame) => void;

const CLOSE_NORMAL = 1000;
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_TOO_MANY_CONNECTIONS = 4429;
const MAX_ATTEMPTS = 8;
const FIRST_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;
/** 2 x WS_HEARTBEAT_SECONDS (30 s on the server, ADR-0030): without any frame, the link is dead. */
const DEAD_AFTER_MS = 60_000;
const MAX_SEND_ATTEMPTS = 3;
/** Requests waiting in memory; a send() beyond it is rejected at once with NETWORK_ERROR. */
const OUTBOX_MAX = 50;

let state: SocketState = { status: 'closed', error: null };
const stateListeners = new Set<() => void>();

let consumers = 0;
/** The SocketAuth of the first consumer; later consumers share the connection as it is. */
let auth: SocketAuth | null = null;
let socket: WebSocket | null = null;
let authenticated = false;
/** Reconnection attempts since the last successful authentication. */
let attempts = 0;
/** Whether the session was already renewed after a 4401 since the last authentication. */
let sessionRenewed = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let deadTimer: ReturnType<typeof setTimeout> | undefined;
let appStateSubscription: { remove: () => void } | null = null;
/** Bumped on every shutdown, so async work started before it does not touch a newer connection. */
let generation = 0;
/** Whether the socket was suspended by a `background`; only then does `active` reconnect. */
let suspendedByBackground = false;
let lastId = 0;

/** Handlers of each joined room; the room stays joined on the server while it has any. */
const rooms = new Map<string, Set<{ handler: FrameHandler }>>();
/**
 * The subscribe requests not answered yet, id -> room. A frame with an id that is neither one of
 * these nor a pending request is the late answer of a request that already settled (e.g. an earlier
 * attempt of a send, or the join of a room that was left before its answer): it is dropped, so it
 * never reaches a room as if joining it had failed.
 */
const joins = new Map<string, string>();
/** A send() that has not been answered for good yet. */
interface Outgoing {
  id: string;
  frame: OutgoingFrame;
  /** Times it went out; 0 while it has never left the client. */
  attempts: number;
  /** The ack timeout of the attempt in flight, or the wait before the next one. */
  timer?: ReturnType<typeof setTimeout>;
  /** Whether `timer` is the wait before the next attempt (not the ack timeout of one in flight). */
  waitingToRetry?: boolean;
  resolve: (frame: ServerFrame) => void;
  reject: (error: AppError) => void;
}
/** Requests waiting for the server's answer, by `id`. */
const outbox = new Map<string, Outgoing>();

function setState(next: Partial<SocketState>): void {
  state = { ...state, ...next };
  stateListeners.forEach((listener) => listener());
}

export function getSocketState(): SocketState {
  return state;
}

export function subscribeToSocketState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

const nextId = () => String(++lastId);

function sendFrame(frame: Record<string, unknown>): void {
  socket?.send(JSON.stringify(frame));
}

/**
 * Reads the token (fresh on every connection) and opens the socket. Without a session, or when the
 * token cannot be read, it stops with INVALID_SESSION.
 */
function connect(): void {
  suspendedByBackground = false;
  const startedIn = generation;
  void auth!
    .getToken()
    .catch(() => null)
    .then((token) => {
      if (startedIn !== generation) return;
      if (token) open(token);
      else stop(invalidSession());
    });
}

function open(token: string): void {
  let current: WebSocket;
  try {
    current = new WebSocket(config.wsUrl);
  } catch {
    handleClose(1006); // The platform refused to create it: the same as a connection that dropped.
    return;
  }
  socket = current;
  authenticated = false;
  armDeadTimer();
  current.onopen = () => current.send(JSON.stringify({ type: 'auth', token }));
  // A socket this client closed itself (or replaced) no longer matters: its late frames and its
  // close event are ignored.
  current.onmessage = (event: MessageEvent) => {
    if (socket !== current) return;
    armDeadTimer(); // Any frame proves the link is alive.
    handleFrame(event.data);
  };
  current.onclose = (event: CloseEvent) => {
    if (socket === current) handleClose(event.code);
  };
}

function armDeadTimer(): void {
  clearTimeout(deadTimer);
  deadTimer = setTimeout(() => {
    socket?.close(CLOSE_NORMAL);
    handleClose(1006);
  }, DEAD_AFTER_MS);
}

function handleFrame(data: unknown): void {
  let frame: ServerFrame;
  try {
    const parsed: unknown = JSON.parse(String(data));
    if (typeof parsed !== 'object' || parsed === null) return;
    frame = parsed as ServerFrame;
  } catch {
    return; // The server only sends JSON objects as text; anything else is ignored.
  }

  if (!authenticated) {
    if (frame.type === 'auth') onAuthenticated();
    return;
  }
  if (frame.type === 'ping') {
    sendFrame({ type: 'pong', id: frame.id });
    return;
  }

  const request = frame.id ? outbox.get(frame.id) : undefined;
  if (request) {
    if (frame.type !== 'error') {
      settle(request, (entry) => entry.resolve(frame));
    } else if (errorOfFrame(frame).retryable) {
      attemptFailed(request, errorOfFrame(frame));
    } else {
      settle(request, (entry) => entry.reject(errorOfFrame(frame)));
    }
    return;
  }

  if (frame.id && !joins.delete(frame.id)) return;
  if (!frame.room) return;
  const handlers = rooms.get(frame.room);
  // An `unsubscribe` the client did not ask for (no `id`) means the server revoked the room.
  if (frame.type === 'unsubscribe' && !frame.id) rooms.delete(frame.room);
  handlers?.forEach(({ handler }) => handler(frame));
}

/** The AppError of an `error` frame, whose payload is an RFC 9457 problem (ADR-0030). */
export function errorOfFrame(frame: ServerFrame): AppError {
  const problem = frame.payload ?? {};
  return problemToAppError(problem, Number(problem.status));
}

/** Asks the server to join `room`, remembering the id of the request to know its answer. */
function join(room: string): void {
  const id = nextId();
  joins.set(id, room);
  sendFrame({ type: 'subscribe', room, id });
}

function onAuthenticated(): void {
  suspendedByBackground = false;
  authenticated = true;
  attempts = 0;
  sessionRenewed = false;
  setState({ status: 'open', error: null });
  rooms.forEach((_, room) => join(room));
  outbox.forEach(transmit);
}

function handleClose(code: number): void {
  clearTimeout(deadTimer);
  socket = null;
  authenticated = false;
  joins.clear(); // A closed socket answers nothing more: the rooms are joined again on open.
  suspendOutbox();

  if (code === CLOSE_UNAUTHORIZED) {
    renewSession();
  } else if (code === CLOSE_TOO_MANY_CONNECTIONS) {
    stop(
      new AppError({ kind: 'http', code: 'TOO_MANY_CONNECTIONS', status: 429, retryable: false }),
    );
  } else if (attempts >= MAX_ATTEMPTS) {
    stop(networkError());
  } else {
    scheduleRetry();
  }
}

/** 4401: renew the session once and reconnect with the new token; a second 4401 is final. */
function renewSession(): void {
  if (sessionRenewed) {
    stop(invalidSession());
    return;
  }
  sessionRenewed = true;
  setState({ status: 'reconnecting' });
  const startedIn = generation;
  void auth!.refresh().then(
    () => {
      if (startedIn === generation) connect();
    },
    // An AppError says why (e.g. SESSION_UNAVAILABLE, temporary); anything else means no session.
    (reason: unknown) => {
      if (startedIn === generation) stop(isAppError(reason) ? reason : invalidSession());
    },
  );
}

/**
 * Background: close the socket and wait, keeping the queue and the rooms (`inactive` does nothing).
 * Active: connect at once. The generation bump drops any token or renewal still in flight, and
 * `sessionRenewed` is cleared so that a later 4401 renews the session again.
 */
function onAppStateChange(next: AppStateStatus): void {
  if (next === 'active') {
    if (!suspendedByBackground || state.status !== 'reconnecting' || socket) return;
    clearTimeout(retryTimer);
    generation += 1;
    attempts = 0;
    sessionRenewed = false;
    connect();
  } else if (next === 'background' && state.status !== 'closed') {
    suspendedByBackground = true;
    clearTimeout(retryTimer);
    clearTimeout(deadTimer);
    generation += 1;
    const current = socket;
    socket = null;
    authenticated = false;
    suspendOutbox();
    current?.close(CLOSE_NORMAL);
    setState({ status: 'reconnecting' });
  }
}

function scheduleRetry(): void {
  attempts += 1;
  const base = Math.min(FIRST_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
  setState({ status: 'reconnecting' });
  retryTimer = setTimeout(connect, jitter(base));
}

/** Between half the base and the base, so clients do not all come back at once. */
function jitter(base: number): number {
  return base / 2 + (base / 2) * Math.random();
}

function stop(error: AppError): void {
  setState({ status: 'closed', error });
  rejectOutbox();
}

function invalidSession(): AppError {
  return new AppError({ kind: 'http', code: 'INVALID_SESSION', status: 401, retryable: false });
}

/** The server may have processed a request that already left, so its outcome is unknown. */
function sendUncertain(): AppError {
  return new AppError({ kind: 'network', code: 'SEND_UNCERTAIN', retryable: true });
}

function settle(entry: Outgoing, outcome: (entry: Outgoing) => void): void {
  clearTimeout(entry.timer);
  outbox.delete(entry.id);
  outcome(entry);
}

/** The connection ended for good: nothing queued will go out. */
function rejectOutbox(): void {
  outbox.forEach((entry) =>
    settle(entry, ({ reject, attempts }) =>
      reject(attempts > 0 ? sendUncertain() : networkError()),
    ),
  );
}

/** Writes the request (same `id` and payload every time) and waits `requestTimeoutMs` for it. */
function transmit(entry: Outgoing): void {
  entry.attempts += 1;
  entry.waitingToRetry = false;
  sendFrame({ ...entry.frame, id: entry.id });
  entry.timer = setTimeout(() => attemptFailed(entry, null), config.requestTimeoutMs);
}

/**
 * An attempt failed: `error` is the server's retryable answer, null when it never answered. The
 * next attempt follows at once after a silence, after a 1 s / 2 s wait after an error.
 */
function attemptFailed(entry: Outgoing, error: AppError | null): void {
  if (error && entry.waitingToRetry) return; // Already waiting for the next attempt.
  clearTimeout(entry.timer);
  if (entry.attempts >= MAX_SEND_ATTEMPTS) {
    settle(entry, ({ reject }) => reject(error ?? sendUncertain()));
  } else if (error) {
    entry.waitingToRetry = true;
    entry.timer = setTimeout(() => transmit(entry), jitter(FIRST_DELAY_MS * entry.attempts));
  } else {
    transmit(entry);
  }
}

/** The connection dropped: what is queued waits for the next authentication. */
function suspendOutbox(): void {
  outbox.forEach((entry) => {
    clearTimeout(entry.timer);
    entry.waitingToRetry = false;
    // Only an attempt in flight can be the last one, so there is nothing left to send again.
    if (entry.attempts >= MAX_SEND_ATTEMPTS) {
      settle(entry, ({ reject }) => reject(sendUncertain()));
    }
  });
}

function shutdown(): void {
  suspendedByBackground = false;
  generation += 1;
  appStateSubscription?.remove();
  appStateSubscription = null;
  clearTimeout(retryTimer);
  clearTimeout(deadTimer);
  const current = socket;
  socket = null;
  authenticated = false;
  joins.clear();
  current?.close(CLOSE_NORMAL);
  rejectOutbox();
  setState({ status: 'closed' });
}

/** A consumer starts using the connection; the first one opens it with its `session`. */
export function retainSocket(session: SocketAuth): void {
  consumers += 1;
  if (consumers > 1) return;
  auth = session;
  appStateSubscription = AppState.addEventListener('change', onAppStateChange);
  attempts = 0;
  sessionRenewed = false;
  setState({ status: 'connecting', error: null });
  connect();
}

/** A consumer stops using the connection; the last one closes it. */
export function releaseSocket(): void {
  consumers -= 1;
  if (consumers === 0) shutdown();
}

/** Opens the connection again after it ended up `closed` (e.g. a retry button). */
export function reconnect(): void {
  if (state.status !== 'closed' || consumers === 0) return;
  attempts = 0;
  sessionRenewed = false;
  setState({ status: 'connecting' });
  connect();
}

/**
 * Joins `room` and delivers its frames to `onFrame` (messages, errors of the room and the
 * server's revocation). Returns the function that leaves it. Joining before the connection is
 * authenticated is fine: the room is joined as soon as it is.
 */
export function subscribe(room: string, onFrame: FrameHandler): () => void {
  const entry = { handler: onFrame };
  let entries = rooms.get(room);
  if (!entries) {
    entries = new Set();
    rooms.set(room, entries);
    if (authenticated) join(room);
  }
  entries.add(entry);

  return () => {
    const current = rooms.get(room);
    if (!current?.delete(entry) || current.size > 0) return;
    rooms.delete(room);
    // An answer to a join of this room still on its way belongs to the room that was left.
    joins.forEach((joined, id) => {
      if (joined === room) joins.delete(id);
    });
    if (authenticated) sendFrame({ type: 'unsubscribe', room, id: nextId() });
  };
}

/**
 * Sends `frame` and resolves with the server's ack. Until the connection is authenticated the
 * request waits in memory. It rejects with the AppError of a non-retryable `error` frame, with the
 * last retryable one after MAX_SEND_ATTEMPTS, with SEND_UNCERTAIN when the last attempt got no
 * answer, and with NETWORK_ERROR / SEND_UNCERTAIN (never sent / already sent) when the connection
 * ends for good. A `closed` connection rejects with NETWORK_ERROR at once.
 */
export function send(frame: OutgoingFrame): Promise<ServerFrame> {
  if (state.status === 'closed' || outbox.size >= OUTBOX_MAX) return Promise.reject(networkError());
  return new Promise((resolve, reject) => {
    const entry: Outgoing = { id: nextId(), frame, attempts: 0, resolve, reject };
    outbox.set(entry.id, entry);
    if (authenticated) transmit(entry);
  });
}

/** Closes everything and forgets every room and consumer (test isolation only). */
export function _resetSocketForTests(): void {
  consumers = 0;
  suspendedByBackground = false;
  shutdown();
  auth = null;
  rooms.clear();
  joins.clear();
  state = { status: 'closed', error: null };
}
