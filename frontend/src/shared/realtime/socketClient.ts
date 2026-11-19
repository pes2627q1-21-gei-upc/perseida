// The app's single WebSocket connection (ADR-0030, US TG-64). It opens with the first consumer
// and closes with the last one; every feature shares it and joins its own rooms.
//
// Protocol: the first frame is `auth` with the access token, and nothing else is sent until the
// server echoes it. Pings are answered with pongs. Requests carry an `id` and the server answers
// with the same `id` (ack or `error`). On a dropped connection it retries with exponential backoff
// and joins its rooms again; 4401 renews the session once, and 4429 (too many connections) stops.
// The session comes from outside (SocketAuth), so shared/ does not depend on any feature.

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

let state: SocketState = { status: 'closed', error: null };
const stateListeners = new Set<() => void>();

let consumers = 0;
/** The SocketAuth of the first consumer; later consumers share the connection as it is. */
let auth: SocketAuth | null = null;
let socket: WebSocket | null = null;
let authenticated = false;
/** Reconnection attempts since the last successful authentication. */
let attempts = 0;
/** Whether the session was already renewed after a 4401 since the last successful authentication. */
let sessionRenewed = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
/** Bumped on every shutdown, so async work started before it does not touch a newer connection. */
let generation = 0;
let lastId = 0;

/** Handlers of each joined room; the room stays joined on the server while it has any. */
const rooms = new Map<string, Set<{ handler: FrameHandler }>>();
/** Requests waiting for the server's answer, by `id`. */
const pending = new Map<
  string,
  { resolve: (frame: ServerFrame) => void; reject: (error: AppError) => void }
>();

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
  current.onopen = () => current.send(JSON.stringify({ type: 'auth', token }));
  // A socket this client closed itself (or replaced) no longer matters: its late frames and its
  // close event are ignored.
  current.onmessage = (event: MessageEvent) => {
    if (socket === current) handleFrame(event.data);
  };
  current.onclose = (event: CloseEvent) => {
    if (socket === current) handleClose(event.code);
  };
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

  const request = frame.id ? pending.get(frame.id) : undefined;
  if (frame.id && request) {
    pending.delete(frame.id);
    if (frame.type === 'error') {
      request.reject(errorOfFrame(frame));
    } else {
      request.resolve(frame);
    }
    return;
  }

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

function onAuthenticated(): void {
  authenticated = true;
  attempts = 0;
  sessionRenewed = false;
  setState({ status: 'open', error: null });
  rooms.forEach((_, room) => sendFrame({ type: 'subscribe', room, id: nextId() }));
}

function handleClose(code: number): void {
  socket = null;
  authenticated = false;
  rejectPending();

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

function scheduleRetry(): void {
  attempts += 1;
  const base = Math.min(FIRST_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
  setState({ status: 'reconnecting' });
  // Jitter: wait between half the base and the base, so clients do not all come back at once.
  retryTimer = setTimeout(connect, base / 2 + (base / 2) * Math.random());
}

function stop(error: AppError): void {
  setState({ status: 'closed', error });
}

function invalidSession(): AppError {
  return new AppError({ kind: 'http', code: 'INVALID_SESSION', status: 401, retryable: false });
}

function rejectPending(): void {
  pending.forEach(({ reject }) => reject(networkError()));
  pending.clear();
}

function shutdown(): void {
  generation += 1;
  clearTimeout(retryTimer);
  const current = socket;
  socket = null;
  authenticated = false;
  current?.close(CLOSE_NORMAL);
  rejectPending();
  setState({ status: 'closed' });
}

/** A consumer starts using the connection; the first one opens it with its `session`. */
export function retainSocket(session: SocketAuth): void {
  consumers += 1;
  if (consumers > 1) return;
  auth = session;
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
    if (authenticated) sendFrame({ type: 'subscribe', room, id: nextId() });
  }
  entries.add(entry);

  return () => {
    const current = rooms.get(room);
    if (!current?.delete(entry) || current.size > 0) return;
    rooms.delete(room);
    if (authenticated) sendFrame({ type: 'unsubscribe', room, id: nextId() });
  };
}

/**
 * Sends `frame` and resolves with the server's ack, or rejects with the AppError of its `error`
 * frame. Without an authenticated connection it rejects with NETWORK_ERROR and sends nothing.
 */
export function send(frame: OutgoingFrame): Promise<ServerFrame> {
  if (!authenticated) return Promise.reject(networkError());
  const id = nextId();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    sendFrame({ ...frame, id });
  });
}

/** Closes everything and forgets every room and consumer (test isolation only). */
export function _resetSocketForTests(): void {
  consumers = 0;
  shutdown();
  auth = null;
  rooms.clear();
  state = { status: 'closed', error: null };
}
