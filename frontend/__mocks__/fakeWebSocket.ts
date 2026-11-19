// Fake WebSocket for the real-time tests (TG-461). It records every socket the code opens and the
// frames it sends (parsed JSON), and lets the test play the server: open, frames and close codes.
// Protocol of the server: ADR-0030. Not named `websocket.ts`: a root `__mocks__` file with the
// name of a package would silently replace that package in every test.

export type Frame = Record<string, unknown>;

interface SocketEvent {
  type: string;
}

interface MessageEvent extends SocketEvent {
  data: string;
}

interface CloseEvent extends SocketEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}

type Listener = (event: SocketEvent) => void;

export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  /** Every socket created since the last `installFakeWebSocket()`, oldest first. */
  static instances: FakeWebSocket[] = [];

  readonly CONNECTING = FakeWebSocket.CONNECTING;
  readonly OPEN = FakeWebSocket.OPEN;
  readonly CLOSING = FakeWebSocket.CLOSING;
  readonly CLOSED = FakeWebSocket.CLOSED;

  readonly url: string;
  readyState: number = FakeWebSocket.CONNECTING;
  /** Frames the client sent, parsed, in order. */
  readonly sent: Frame[] = [];
  /** Code the client passed to `close()`, or undefined while it has not closed the socket. */
  closedByClientWith?: number;

  onopen: ((event: SocketEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: SocketEvent) => void) | null = null;

  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Like a real socket, sending before it is open throws (InvalidStateError). */
  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error('InvalidStateError: the WebSocket is not open');
    }
    this.sent.push(JSON.parse(data) as Frame);
  }

  /** Client-initiated close. As in a real socket, the close event arrives afterwards. */
  close(code = 1000, reason = ''): void {
    if (this.readyState === FakeWebSocket.CLOSING || this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.closedByClientWith = code;
    this.readyState = FakeWebSocket.CLOSING;
    void Promise.resolve().then(() => this.finishClose(code, reason, true));
  }

  // ---- The test plays the server with these ----

  /** The handshake succeeds. */
  serverOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatch('open', { type: 'open' });
  }

  /** The server sends a JSON text frame. */
  serverSend(frame: Frame): void {
    const event: MessageEvent = { type: 'message', data: JSON.stringify(frame) };
    this.dispatch('message', event);
  }

  /** The server closes the connection with `code` (4401, 4429, 1001, 1011, 1013...). */
  serverClose(code: number, reason = ''): void {
    this.finishClose(code, reason, true);
  }

  /** The network drops (or the handshake fails): error event and abnormal close 1006. */
  networkFailure(): void {
    this.dispatch('error', { type: 'error' });
    this.finishClose(1006, '', false);
  }

  /** Frames of a given type the client sent. */
  sentOfType(type: string): Frame[] {
    return this.sent.filter((frame) => frame.type === type);
  }

  private finishClose(code: number, reason: string, wasClean: boolean): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    const event: CloseEvent = { type: 'close', code, reason, wasClean };
    this.dispatch('close', event);
  }

  private dispatch(type: 'open' | 'message' | 'close' | 'error', event: SocketEvent): void {
    switch (type) {
      case 'open':
        this.onopen?.(event);
        break;
      case 'message':
        this.onmessage?.(event as MessageEvent);
        break;
      case 'close':
        this.onclose?.(event as CloseEvent);
        break;
      case 'error':
        this.onerror?.(event);
        break;
    }
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

/** Puts the fake in `globalThis.WebSocket`; returns the function that puts the original back. */
export function installFakeWebSocket(): () => void {
  const original = globalThis.WebSocket;
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  return () => {
    globalThis.WebSocket = original;
    FakeWebSocket.instances = [];
  };
}

/** The most recent socket the code opened. */
export function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!socket) throw new Error('The code has not opened any WebSocket');
  return socket;
}

/** Body of an error frame (RFC 9457 problem, ADR-0030), as the server sends it. */
export function wsProblem(status: number, code: string) {
  return {
    type: 'about:blank',
    title: 'Error',
    status,
    detail: 'technical detail that must not reach the user',
    code,
    correlation_id: 'c-1',
  };
}
