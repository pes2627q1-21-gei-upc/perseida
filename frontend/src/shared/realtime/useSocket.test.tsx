import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import {
  FakeWebSocket,
  type Frame,
  installFakeWebSocket,
  lastSocket,
  wsProblem,
} from '../../../__mocks__/fakeWebSocket';
import { AppError } from '../errors';
import type { SocketAuth } from '.';
import { _resetSocketForTests, getSocketState, reconnect } from './socketClient';
import { useSocket } from './useSocket';

const WS_URL = 'ws://api.test/api/ws';
const ROOM = 'chat:event:ev-1';
const OTHER_ROOM = 'chat:event:ev-2';
const AUTH_ACK: Frame = { type: 'auth', payload: {} };
const authFrame = (token: string): Frame => ({ type: 'auth', token });
const MESSAGE = { type: 'message' as const, room: ROOM, payload: { text: 'hola' } };
const TEN_MINUTES = 10 * 60_000;
// TG-654: 2 x the server heartbeat of 30 s (ADR-0030); per-attempt ack timeout = config.requestTimeoutMs.
const DEAD_AFTER_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
// Base wait before each reconnection attempt: 1 s, doubling, capped at 30 s.
const BACKOFF_BASES = [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000];

let restoreWebSocket: () => void;
/** What the fake session hands out on the next getToken(); refresh() renews it to access-2. */
let token: string | null;
let auth: ReturnType<typeof makeAuth>;

/** Fake SocketAuth injected into useSocket: shared/realtime does not import features/auth. */
function makeAuth() {
  return {
    getToken: jest.fn(async (): Promise<string | null> => token),
    refresh: jest.fn(async (): Promise<void> => {
      token = 'access-2';
    }),
  } satisfies SocketAuth;
}

/** Lets pending promises and the timers due in `ms` run, inside act (fake timers). */
async function flush(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function serverOpens(socket = lastSocket()) {
  await act(async () => socket.serverOpen());
  await flush();
}

async function serverSends(frame: Frame, socket = lastSocket()) {
  await act(async () => socket.serverSend(frame));
  await flush();
}

async function serverCloses(code: number, socket = lastSocket()) {
  await act(async () => socket.serverClose(code));
  await flush();
}

async function networkDrops(socket = lastSocket()) {
  await act(async () => socket.networkFailure());
  await flush();
}

const sockets = () => FakeWebSocket.instances;
const lastSent = (socket = lastSocket()) => socket.sent[socket.sent.length - 1];

/** Mounts a consumer of useSocket without completing the handshake. */
async function mount() {
  const hook = await renderHook(() => useSocket(auth));
  await flush();
  return hook;
}

/** Mounts a consumer and completes the handshake: open + auth ack. */
async function mountConnected() {
  const hook = await mount();
  await serverOpens();
  await serverSends(AUTH_ACK);
  return hook;
}

/**
 * Calls `send(MESSAGE)` inside act. The promise is wrapped in an object (an async function would
 * flatten it) and gets a no-op handler so an early rejection is not reported as unhandled.
 */
async function startSending(send: (frame: typeof MESSAGE) => Promise<unknown>) {
  let sending!: Promise<unknown>;
  await act(async () => {
    sending = send(MESSAGE);
    sending.catch(() => undefined);
  });
  return { sending };
}

/** The connection ended for good because the session is not valid (ADR-0030, 4401). */
function expectInvalidSession(current: { status: string; error: AppError | null }) {
  expect(current.status).toBe('closed');
  expect(current.error).toBeInstanceOf(AppError);
  expect(current.error?.kind).toBe('http');
  expect(current.error?.code).toBe('INVALID_SESSION');
  expect(current.error?.status).toBe(401);
  expect(current.error?.retryable).toBe(false);
}

/** Awaits a promise that must reject with an AppError and returns that error. */
async function rejectionOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('The promise resolved, but a rejection with an AppError was expected');
}

beforeEach(() => {
  jest.useFakeTimers();
  restoreWebSocket = installFakeWebSocket();
  _resetSocketForTests();
  token = 'access-1';
  auth = makeAuth();
});

afterEach(() => {
  _resetSocketForTests();
  restoreWebSocket();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('useSocket: connexió i autenticació (TG-461, US TG-64, ADR-0030)', () => {
  it('en muntar obre ws://api.test/api/ws i el primer frame és exactament l’auth amb el token desat', async () => {
    const { result } = await mount();

    expect(sockets()).toHaveLength(1);
    expect(lastSocket().url).toBe(WS_URL);
    expect(result.current.status).toBe('connecting');

    await serverOpens();

    expect(lastSocket().sent).toEqual([authFrame('access-1')]);
  });

  it('continua a connecting fins a l’ack de l’auth i llavors passa a open sense error', async () => {
    const { result } = await mount();
    await serverOpens();

    expect(result.current.status).toBe('connecting');

    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
    expect(result.current.error).toBeNull();
  });

  it('no envia cap altre frame abans de l’ack de l’auth: la subscripció espera en cua', async () => {
    const { result } = await mount();
    await act(async () => {
      result.current.subscribe(ROOM, jest.fn());
    });
    await serverOpens();

    expect(lastSocket().sent).toEqual([authFrame('access-1')]);

    await serverSends(AUTH_ACK);

    expect(lastSocket().sent).toEqual([
      authFrame('access-1'),
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
    ]);
  });

  it('respon cada ping del servidor amb un pong amb el mateix id', async () => {
    await mountConnected();

    await serverSends({ type: 'ping', id: 'p-1' });

    expect(lastSent()).toEqual({ type: 'pong', id: 'p-1' });
  });
});

describe('useSocket: subscripcions (TG-461)', () => {
  it('amb la connexió oberta, subscribe envia el frame de seguida', async () => {
    const { result } = await mountConnected();

    await act(async () => {
      result.current.subscribe(ROOM, jest.fn());
    });

    expect(lastSent()).toEqual({ type: 'subscribe', room: ROOM, id: expect.any(String) });
  });

  it('un segon subscriptor a la mateixa sala no duplica el subscribe i l’unsubscribe només surt quan marxa l’últim', async () => {
    const { result } = await mountConnected();
    let leaveFirst = () => {};
    let leaveSecond = () => {};

    await act(async () => {
      leaveFirst = result.current.subscribe(ROOM, jest.fn());
      leaveSecond = result.current.subscribe(ROOM, jest.fn());
    });

    expect(lastSocket().sentOfType('subscribe')).toEqual([
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
    ]);

    await act(async () => leaveFirst());

    expect(lastSocket().sentOfType('unsubscribe')).toEqual([]);

    await act(async () => leaveSecond());

    expect(lastSocket().sentOfType('unsubscribe')).toEqual([
      { type: 'unsubscribe', room: ROOM, id: expect.any(String) },
    ]);
  });

  it('lliura a onFrame els missatges d’altres usuaris de la sala i no els d’altres sales', async () => {
    const { result } = await mountConnected();
    const onFrame = jest.fn();
    await act(async () => {
      result.current.subscribe(ROOM, onFrame);
    });
    const fromOther: Frame = {
      type: 'message',
      room: ROOM,
      payload: {
        id: 'm-9',
        room_id: 'r-1',
        author: { id: 'u-2', name: 'Bob' },
        text: 'bona nit',
        sent_at: '2026-11-18T21:00:00Z',
      },
    };

    await serverSends(fromOther);
    await serverSends({ ...fromOther, room: OTHER_ROOM });

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(fromOther);
  });

  it('lliura a onFrame de la sala l’error d’un subscribe', async () => {
    const { result } = await mountConnected();
    const onFrame = jest.fn();
    await act(async () => {
      result.current.subscribe(ROOM, onFrame);
    });
    const error: Frame = {
      type: 'error',
      id: lastSent()?.id,
      room: ROOM,
      payload: wsProblem(403, 'FORBIDDEN'),
    };

    await serverSends(error);

    expect(onFrame).toHaveBeenCalledWith(error);
  });
});

describe('useSocket: send (TG-461)', () => {
  // TG-654 (contract change approved by the person, replaces "send without connection ->
  // NETWORK_ERROR"): the frame waits in memory and goes out once the connection is authenticated.
  it('abans de l’ack de l’auth, send encua el frame: no es rebutja i no surt res fins que hi ha connexió autenticada', async () => {
    const { result } = await mount();
    await serverOpens();

    const { sending } = await startSending(result.current.send);

    expect(lastSocket().sent).toEqual([authFrame('access-1')]);

    await serverSends(AUTH_ACK);
    const sent = lastSent();

    expect(sent).toEqual({ ...MESSAGE, id: expect.any(String) });

    const ack: Frame = {
      type: 'message',
      room: ROOM,
      id: sent?.id,
      payload: { id: 'm-1', sent_at: '2026-11-18T20:00:00Z' },
    };
    await serverSends(ack);

    await expect(sending).resolves.toEqual(ack);
  });

  it('envia el frame amb un id i es resol amb l’ack del servidor', async () => {
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);
    const sent = lastSent();

    expect(sent).toEqual({ ...MESSAGE, id: expect.any(String) });

    const ack: Frame = {
      type: 'message',
      room: ROOM,
      id: sent?.id,
      payload: { id: 'm-1', sent_at: '2026-11-18T20:00:00Z' },
    };
    await serverSends(ack);

    await expect(sending).resolves.toEqual(ack);
  });

  // TG-654: only an error that is not retryable rejects at once; 429/503 are retried (see below).
  it.each([[403, 'FORBIDDEN', false]])(
    'un frame error %s %s amb l’id del frame el rebutja amb un AppError (retryable %s)',
    async (status, code, retryable) => {
      const { result } = await mountConnected();
      const { sending } = await startSending(result.current.send);

      await serverSends({
        type: 'error',
        id: lastSent()?.id,
        room: ROOM,
        payload: wsProblem(status, code),
      });
      const error = await rejectionOf(sending);

      expect(error.kind).toBe('http');
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
      expect(error.correlationId).toBe('c-1');
      expect(error.retryable).toBe(retryable);
    },
  );
});

describe('useSocket: reconnexió amb espera exponencial (TG-461)', () => {
  it.each([0, 1])(
    'amb Math.random = %s cada espera és entre base/2 i base (1 s, 2 s, 4 s... fins a 30 s) i l’estat és reconnecting',
    async (random) => {
      jest.spyOn(Math, 'random').mockReturnValue(random);
      const { result } = await mountConnected();

      await networkDrops();

      expect(result.current.status).toBe('reconnecting');
      for (const base of BACKOFF_BASES.slice(0, 7)) {
        const before = sockets().length;
        await flush(base / 2 - 1);
        expect(sockets()).toHaveLength(before);
        expect(result.current.status).toBe('reconnecting');
        await flush(base / 2 + 1);
        expect(sockets()).toHaveLength(before + 1);
        await networkDrops();
      }
    },
  );

  it('en reconnectar torna a autenticar-se amb el token fresc i resubscriu les sales actives', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await act(async () => {
      result.current.subscribe(ROOM, jest.fn());
    });
    token = 'access-2';

    await networkDrops();
    await flush(1000);

    expect(sockets()).toHaveLength(2);

    await serverOpens();

    expect(lastSocket().sent).toEqual([authFrame('access-2')]);
    expect(result.current.status).toBe('reconnecting');

    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
    expect(lastSocket().sent).toEqual([
      authFrame('access-2'),
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
    ]);
  });

  it('el comptador d’intents es reinicia quan es torna a connectar bé', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    await mountConnected();
    await networkDrops();
    await flush(1000);
    await networkDrops(); // first attempt fails
    await flush(2000);
    await serverOpens(); // second attempt succeeds
    await serverSends(AUTH_ACK);
    const before = sockets().length;

    await networkDrops();
    await flush(1000);

    expect(sockets()).toHaveLength(before + 1);
  });

  it('després de 8 intents fallits seguits queda closed amb NETWORK_ERROR reintentable i no n’hi ha cap més', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await networkDrops();

    for (const base of BACKOFF_BASES) {
      await flush(base);
      await networkDrops();
    }

    expect(sockets()).toHaveLength(1 + BACKOFF_BASES.length);
    expect(result.current.status).toBe('closed');
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error?.code).toBe('NETWORK_ERROR');
    expect(result.current.error?.retryable).toBe(true);

    await flush(TEN_MINUTES);

    expect(sockets()).toHaveLength(1 + BACKOFF_BASES.length);
  });

  it('reconnect() reprèn la connexió després de quedar closed', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await networkDrops();
    for (const base of BACKOFF_BASES) {
      await flush(base);
      await networkDrops();
    }
    const before = sockets().length;

    await act(async () => result.current.reconnect());
    await flush(1000);

    expect(sockets()).toHaveLength(before + 1);

    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
  });

  it('reconnect() des de closed passa l’estat a connecting, no a reconnecting', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await networkDrops();
    for (const base of BACKOFF_BASES) {
      await flush(base);
      await networkDrops();
    }

    await act(async () => result.current.reconnect());

    expect(result.current.status).toBe('connecting');

    await flush(1000);
    await serverOpens();

    expect(result.current.status).toBe('connecting');
  });

  it('en tornar a open després d’una reconnexió bona, error torna a ser null', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await networkDrops();
    for (const base of BACKOFF_BASES) {
      await flush(base);
      await networkDrops();
    }

    expect(result.current.error?.code).toBe('NETWORK_ERROR');

    await act(async () => result.current.reconnect());
    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
    expect(result.current.error).toBeNull();
  });
});

describe('useSocket: neteja i connexió compartida (TG-461)', () => {
  it('en desmuntar l’últim consumidor tanca el socket amb 1000 i no reconnecta', async () => {
    const { unmount } = await mountConnected();
    const socket = lastSocket();

    await unmount();
    await flush(TEN_MINUTES);

    expect(socket.closedByClientWith).toBe(1000);
    expect(sockets()).toHaveLength(1);
  });

  it('en desmuntar durant l’espera de reconnexió cancel·la el reintent pendent', async () => {
    const { unmount } = await mountConnected();
    await networkDrops();

    await unmount();
    await flush(TEN_MINUTES);

    expect(sockets()).toHaveLength(1);
  });

  it('dos consumidors comparteixen una sola connexió i desmuntar-ne un no la tanca', async () => {
    const first = await mountConnected();
    const second = await mount();
    const socket = lastSocket();

    expect(sockets()).toHaveLength(1);
    expect(second.result.current.status).toBe('open');

    await first.unmount();
    await flush();

    expect(socket.closedByClientWith).toBeUndefined();
    expect(second.result.current.status).toBe('open');

    await second.unmount();
    await flush();

    expect(socket.closedByClientWith).toBe(1000);
  });
});

describe('useSocket: tancaments del servidor (TG-461, ADR-0030)', () => {
  it('4401: renova la sessió un sol cop i reconnecta amb el token nou', async () => {
    const { result } = await mountConnected();

    await serverCloses(4401);
    await flush(1000);

    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(sockets()).toHaveLength(2);

    await serverOpens();

    expect(lastSocket().sent).toEqual([authFrame('access-2')]);

    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
  });

  it('4401 un altre cop després de renovar: closed amb INVALID_SESSION i cap bucle de reconnexions', async () => {
    const { result } = await mountConnected();
    await serverCloses(4401);
    await flush(1000);
    await serverOpens();

    await serverCloses(4401);
    await flush(TEN_MINUTES);

    expect(result.current.status).toBe('closed');
    expectInvalidSession(result.current);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(sockets()).toHaveLength(2);
  });

  it('4401 de nou després d’una auth correcta: el comptador es reinicia, renova un altre cop i reconnecta', async () => {
    auth.refresh
      .mockImplementationOnce(async () => {
        token = 'access-2';
      })
      .mockImplementationOnce(async () => {
        token = 'access-3';
      });
    const { result } = await mountConnected();
    await serverCloses(4401);
    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK); // the renewed session is accepted

    await serverCloses(4401); // later on, the token expires again
    await flush(1000);

    expect(auth.refresh).toHaveBeenCalledTimes(2);
    expect(sockets()).toHaveLength(3);

    await serverOpens();

    expect(lastSocket().sent).toEqual([authFrame('access-3')]);

    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
  });

  it('4401 i refresh() es rebutja: closed amb INVALID_SESSION sense reconnectar', async () => {
    auth.refresh.mockRejectedValue(new Error('refresh failed'));
    const { result } = await mountConnected();

    await serverCloses(4401);
    await flush(TEN_MINUTES);

    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('closed');
    expectInvalidSession(result.current);
    expect(sockets()).toHaveLength(1);
  });

  it('4401 i refresh() es rebutja amb un AppError: closed amb aquest mateix error, sense reconnectar', async () => {
    const unavailable = new AppError({
      kind: 'http',
      code: 'SESSION_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
    auth.refresh.mockRejectedValue(unavailable);
    const { result } = await mountConnected();

    await serverCloses(4401);
    await flush(TEN_MINUTES);

    expect(result.current.status).toBe('closed');
    expect(result.current.error).toBe(unavailable);
    expect(sockets()).toHaveLength(1);
  });

  it('4429 (massa connexions): closed sense cap reintent', async () => {
    const { result } = await mount();
    await serverOpens();

    await serverCloses(4429);
    await flush(TEN_MINUTES);

    expect(result.current.status).toBe('closed');
    expect(sockets()).toHaveLength(1);
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('4429 exposa un AppError TOO_MANY_CONNECTIONS (http, 429, no reintentable)', async () => {
    const { result } = await mount();
    await serverOpens();

    await serverCloses(4429);

    expect(result.current.status).toBe('closed');
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error?.kind).toBe('http');
    expect(result.current.error?.code).toBe('TOO_MANY_CONNECTIONS');
    expect(result.current.error?.status).toBe(429);
    expect(result.current.error?.retryable).toBe(false);
  });
});

describe('useSocket: sala revocada pel servidor (TG-461, ADR-0030 actualització TG-64)', () => {
  it('lliura a onFrame l’unsubscribe sense id i la sala no es resubscriu en reconnectar', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    const onFrame = jest.fn();
    await act(async () => {
      result.current.subscribe(ROOM, onFrame);
    });
    const revocation: Frame = { type: 'unsubscribe', room: ROOM, payload: {} };

    await serverSends(revocation);

    expect(onFrame).toHaveBeenCalledWith(revocation);

    await networkDrops();
    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
    expect(lastSocket().sent).toEqual([authFrame('access-1')]);
  });

  it('rebre un message d’una sala no la treu de les sales que es resubscriuen en reconnectar', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await act(async () => {
      result.current.subscribe(ROOM, jest.fn());
    });
    await serverSends({
      type: 'message',
      room: ROOM,
      payload: { id: 'm-9', text: 'bona nit', sent_at: '2026-11-18T21:00:00Z' },
    });

    await networkDrops();
    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(lastSocket().sentOfType('subscribe')).toEqual([
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
    ]);
  });
});

describe('useSocket: SocketAuth injectat (TG-461; shared/realtime no importa features/auth)', () => {
  it('crida auth.getToken() a cada connexió i s’autentica amb el token que retorna', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    await mountConnected();

    expect(auth.getToken).toHaveBeenCalledTimes(1);

    token = 'access-2';
    await networkDrops();
    await flush(1000);
    await serverOpens();

    expect(auth.getToken).toHaveBeenCalledTimes(2);
    expect(lastSocket().sent).toEqual([authFrame('access-2')]);
  });

  it('si getToken() retorna null en muntar, no obre cap socket i queda closed amb INVALID_SESSION', async () => {
    token = null;

    const { result } = await mount();
    await flush(TEN_MINUTES);

    expect(sockets()).toHaveLength(0);
    expectInvalidSession(result.current);
  });

  it('si getToken() retorna null en reconnectar, no obre cap socket i queda closed amb INVALID_SESSION', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    token = null;

    await networkDrops();
    await flush(TEN_MINUTES);

    expect(sockets()).toHaveLength(1);
    expectInvalidSession(result.current);
  });

  it('la connexió usa l’auth del primer consumidor: el d’un segon consumidor no el substitueix', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const otherAuth = {
      getToken: jest.fn(async (): Promise<string | null> => 'access-other'),
      refresh: jest.fn(async (): Promise<void> => undefined),
    } satisfies SocketAuth;
    await mountConnected();
    await renderHook(() => useSocket(otherAuth));
    await flush();

    await networkDrops();
    await flush(1000);
    await serverOpens();

    expect(lastSocket().sent).toEqual([authFrame('access-1')]);
    expect(otherAuth.getToken).not.toHaveBeenCalled();
  });

  it('mentre auth.refresh() no acaba després d’un 4401, l’estat és reconnecting i no s’obre cap socket', async () => {
    let finishRefresh = () => {};
    auth.refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = () => {
            token = 'access-2';
            resolve();
          };
        }),
    );
    const { result } = await mountConnected();

    await serverCloses(4401);
    await flush(TEN_MINUTES);

    expect(result.current.status).toBe('reconnecting');
    expect(sockets()).toHaveLength(1);

    await act(async () => finishRefresh());
    await flush(1000);
    await serverOpens();

    expect(lastSocket().sent).toEqual([authFrame('access-2')]);
  });
});

describe('useSocket: send després d’una caiguda (TG-461, TG-654)', () => {
  // TG-654 (contract change): it used to reject with NETWORK_ERROR; now it waits for the connection.
  it('s’encua sense enviar res mentre espera per reconnectar i surt en tornar a autenticar-se', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    const dropped = lastSocket();
    await networkDrops();
    let outcome: unknown = 'pending';

    const { sending } = await startSending(result.current.send);
    sending.then(
      () => (outcome = 'resolved'),
      (error: unknown) => (outcome = error),
    );
    await flush();

    expect(outcome).toBe('pending');
    expect(dropped.sent).toEqual([authFrame('access-1')]);
    expect(sockets()).toHaveLength(1);

    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(lastSocket().sentOfType('message')).toEqual([{ ...MESSAGE, id: expect.any(String) }]);
  });
});

describe('socketClient: estat inicial i _resetSocketForTests (TG-461)', () => {
  it('abans del primer consumidor l’estat és closed sense error', () => {
    // A fresh copy of the module, never touched by _resetSocketForTests or any other test.
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('./socketClient') as typeof import('./socketClient');

      expect(fresh.getSocketState()).toEqual({ status: 'closed', error: null });
    });
  });

  it('_resetSocketForTests torna a l’estat inicial: closed sense error, sense consumidors ni sales', async () => {
    const { result } = await mount();
    await act(async () => {
      result.current.subscribe(ROOM, jest.fn());
    });
    await serverOpens();
    await serverCloses(4429);

    expect(getSocketState().error).not.toBeNull();

    await act(async () => _resetSocketForTests());

    expect(getSocketState()).toEqual({ status: 'closed', error: null });

    await mountConnected();

    expect(sockets()).toHaveLength(2);
    expect(lastSocket().sentOfType('subscribe')).toEqual([]);
  });
});

/** A promise the test settles by hand, to hold getToken() or refresh() half-way. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useSocket: getToken() rebutjat (TG-461; es tracta com si no hi hagués sessió)', () => {
  // Jest fails the test by itself if the rejection is left unhandled (it reports the reason).
  it('en muntar: closed amb INVALID_SESSION, sense obrir cap socket ni deixar cap rebuig sense gestionar', async () => {
    auth.getToken.mockRejectedValue(new Error('SecureStore unavailable'));

    const { result } = await mount();
    await flush(TEN_MINUTES);

    expect(sockets()).toHaveLength(0);
    expectInvalidSession(result.current);
  });

  it('en reconnectar: closed amb INVALID_SESSION, sense obrir cap socket ni deixar cap rebuig sense gestionar', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    auth.getToken.mockRejectedValue(new Error('SecureStore unavailable'));

    await networkDrops();
    await flush(TEN_MINUTES);

    expect(sockets()).toHaveLength(1);
    expectInvalidSession(result.current);
  });
});

describe('useSocket: frames d’un socket substituït (TG-461)', () => {
  it('l’eco d’auth que arriba al socket vell no autentica el nou ni hi envia els subscribe', async () => {
    const first = await mount();
    const old = lastSocket();
    await serverOpens(old);
    await first.unmount();

    const { result } = await mount();
    const fresh = lastSocket();
    await act(async () => {
      result.current.subscribe(ROOM, jest.fn());
    });
    await serverOpens(fresh);
    await serverSends(AUTH_ACK, old); // the old socket's echo, still on its way

    expect(fresh).not.toBe(old);
    expect(result.current.status).toBe('connecting');
    expect(fresh.sent).toEqual([authFrame('access-1')]);

    await serverSends(AUTH_ACK, fresh);

    expect(result.current.status).toBe('open');
    expect(fresh.sent).toEqual([
      authFrame('access-1'),
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
    ]);
  });
});

describe('useSocket: feina asíncrona que acaba després de desmuntar (TG-461)', () => {
  it('si es desmunta mentre getToken() no ha acabat, en acabar no obre cap socket', async () => {
    const token1 = deferred<string | null>();
    auth.getToken.mockReturnValueOnce(token1.promise);
    const { unmount } = await mount();

    await unmount();
    await act(async () => token1.resolve('access-1'));
    await flush(TEN_MINUTES);

    expect(sockets()).toHaveLength(0);
    expect(getSocketState().status).toBe('closed');
  });

  it('desmuntar i tornar a muntar mentre getToken() no ha acabat no duplica la connexió', async () => {
    const token1 = deferred<string | null>();
    auth.getToken.mockReturnValueOnce(token1.promise);
    const first = await mount();
    await first.unmount();

    await mount();
    await act(async () => token1.resolve('access-1'));
    await flush();

    expect(sockets()).toHaveLength(1);
  });

  it('si es desmunta mentre auth.refresh() no ha acabat (4401), en acabar no obre cap socket', async () => {
    const renewal = deferred<void>();
    auth.refresh.mockReturnValueOnce(renewal.promise);
    const { unmount } = await mountConnected();
    await serverCloses(4401);

    await unmount();
    await act(async () => renewal.resolve());
    await flush(TEN_MINUTES);

    expect(sockets()).toHaveLength(1);
    expect(getSocketState()).toEqual({ status: 'closed', error: null });
  });

  it('si es desmunta mentre auth.refresh() no ha acabat i després es rebutja, l’estat no canvia', async () => {
    const renewal = deferred<void>();
    auth.refresh.mockReturnValueOnce(renewal.promise);
    const { unmount } = await mountConnected();
    await serverCloses(4401);

    await unmount();
    await act(async () => renewal.reject(new Error('refresh failed')));
    await flush(TEN_MINUTES);

    expect(getSocketState()).toEqual({ status: 'closed', error: null });
  });
});

describe('useSocket: send pendent quan la connexió s’acaba (TG-461, TG-654)', () => {
  /** Settles `sending` into a value the test can inspect without awaiting it forever. */
  async function outcomeOf(sending: Promise<unknown>) {
    let outcome: unknown = 'pending';
    sending.then(
      () => (outcome = 'resolved'),
      (error: unknown) => (outcome = error),
    );
    await flush();
    return outcome;
  }

  // TG-654 (contract change approved by the person, replaces "rejects with NETWORK_ERROR"): a
  // connection that drops before the ack is not final, so the same frame is sent again, with the
  // same id, once the client authenticates again.
  it.each([
    ['la xarxa cau (1006)', (socket: FakeWebSocket) => socket.networkFailure()],
    ['el servidor tanca amb 1013', (socket: FakeWebSocket) => socket.serverClose(1013)],
  ])('no es rebutja quan %s abans de l’ack: es reenvia amb el mateix id', async (_label, close) => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);
    const first = lastSent();

    await act(async () => close(lastSocket()));
    expect(await outcomeOf(sending)).toBe('pending');
    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(lastSocket().sentOfType('message')).toEqual([first]);

    await serverSends({
      type: 'message',
      room: ROOM,
      id: first?.id,
      payload: { id: 'm-1', sent_at: '2026-11-18T20:00:00Z' },
    });
    expect(await outcomeOf(sending)).toBe('resolved');
  });

  // TG-654 F3: the last consumer leaves, the connection ends for good.
  it('es rebutja amb SEND_UNCERTAIN (network, reintentable) quan es desmunta l’últim consumidor després d’haver-lo enviat', async () => {
    const { result, unmount } = await mountConnected();
    const { sending } = await startSending(result.current.send);

    await unmount();
    const outcome = await outcomeOf(sending);

    expect(outcome).toBeInstanceOf(AppError);
    expect((outcome as AppError).code).toBe('SEND_UNCERTAIN');
    expect((outcome as AppError).kind).toBe('network');
    expect((outcome as AppError).retryable).toBe(true);
  });

  it('es rebutja amb NETWORK_ERROR quan es desmunta l’últim consumidor sense haver-lo pogut enviar mai', async () => {
    const { result, unmount } = await mount();
    const { sending } = await startSending(result.current.send);

    await unmount();
    const outcome = await outcomeOf(sending);

    expect(outcome).toBeInstanceOf(AppError);
    expect((outcome as AppError).code).toBe('NETWORK_ERROR');
  });
});

describe('useSocket: estat després de desmuntar l’últim consumidor (TG-461)', () => {
  it('l’estat queda closed i una connexió nova no hereta les sales que ja s’han deixat', async () => {
    const { result, unmount } = await mountConnected();
    let leave = () => {};
    await act(async () => {
      leave = result.current.subscribe(ROOM, jest.fn());
    });
    const old = lastSocket();

    await unmount();
    await act(async () => leave()); // what a consumer's own cleanup does

    expect(getSocketState().status).toBe('closed');
    expect(old.sentOfType('unsubscribe')).toEqual([]);

    await mountConnected();

    expect(sockets()).toHaveLength(2);
    expect(lastSocket().sentOfType('subscribe')).toEqual([]);
  });
});

describe('useSocket: abans de l’ack de l’auth (TG-461)', () => {
  it('un frame que no és auth no autentica: continua connecting i no respon; send queda pendent i en el tancament definitiu es rebutja amb NETWORK_ERROR', async () => {
    const { result } = await mount();
    await serverOpens();

    await serverSends({ type: 'ping', id: 'p-1' });
    await serverSends({ type: 'subscribe', room: ROOM, id: '1', payload: {} });

    expect(result.current.status).toBe('connecting');
    expect(lastSocket().sent).toEqual([authFrame('access-1')]);

    // TG-654: without an authenticated connection send waits in the queue (it is not rejected)
    const { sending } = await startSending(result.current.send);
    let outcome: unknown = 'pending';
    sending.then(
      () => (outcome = 'resolved'),
      (reason: unknown) => (outcome = reason),
    );
    await flush();

    expect(outcome).toBe('pending');
    expect(lastSocket().sent).toEqual([authFrame('access-1')]);

    // the connection ends for good before the message ever went out
    await serverCloses(4429);
    const error = await rejectionOf(sending);

    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('deixar l’última sala sense estar autenticat no envia unsubscribe', async () => {
    const { result } = await mount();
    await serverOpens();
    let leave = () => {};
    await act(async () => {
      leave = result.current.subscribe(ROOM, jest.fn());
    });

    await act(async () => leave());
    await serverSends(AUTH_ACK);

    expect(lastSocket().sent).toEqual([authFrame('access-1')]);
  });
});

describe('useSocket: reconnect() quan l’estat no és closed (TG-461)', () => {
  it('amb la connexió oberta no fa res', async () => {
    const { result } = await mountConnected();

    await act(async () => result.current.reconnect());
    // TG-654: 60 s without any frame is a dead connection, so the quiet stretch stops just short.
    await flush(DEAD_AFTER_MS - 1);

    expect(sockets()).toHaveLength(1);
    expect(lastSocket().closedByClientWith).toBeUndefined();
    expect(result.current.status).toBe('open');
  });

  it('mentre espera per reconnectar no avança el reintent ni canvia l’estat', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await networkDrops();

    await act(async () => result.current.reconnect());
    await flush(999);

    expect(sockets()).toHaveLength(1);
    expect(result.current.status).toBe('reconnecting');
  });
});

// ---- TG-654: connexió morta, cua de send, AppState i casos límit ---------------------------------

/** Awaits `promise` into a value the test can inspect without waiting for it forever. */
async function outcomeOf(promise: Promise<unknown>) {
  let outcome: unknown = 'pending';
  promise.then(
    () => (outcome = 'resolved'),
    (error: unknown) => (outcome = error),
  );
  await flush();
  return outcome;
}

const messagesSent = (socket = lastSocket()) => socket.sentOfType('message');

describe('useSocket: connexió morta (TG-654 F1, ADR-0030: 2 x heartbeat de 30 s)', () => {
  it('sense cap frame del servidor en 60 000 ms tanca el socket amb 1000 i passa a reconnecting; 59 999 ms no fan res', async () => {
    const { result } = await mountConnected();
    const socket = lastSocket();

    await flush(DEAD_AFTER_MS - 1);

    expect(socket.closedByClientWith).toBeUndefined();
    expect(result.current.status).toBe('open');

    await flush(1);

    expect(socket.closedByClientWith).toBe(1000);
    expect(result.current.status).toBe('reconnecting');
  });

  it('després de tancar-lo reconnecta pel backoff existent, es torna a autenticar i resubscriu les sales', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await act(async () => {
      result.current.subscribe(ROOM, jest.fn());
    });
    await flush(DEAD_AFTER_MS);

    expect(sockets()).toHaveLength(1);

    await flush(1000);
    await serverOpens();

    expect(sockets()).toHaveLength(2);
    expect(lastSent()).toEqual(authFrame('access-1'));

    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
    expect(lastSocket().sentOfType('subscribe')).toEqual([
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
    ]);
  });

  it('el compta des de l’open(): sense ni tan sols l’ack de l’auth també es dona per morta', async () => {
    const { result } = await mount();
    await serverOpens();
    const socket = lastSocket();

    await flush(DEAD_AFTER_MS - 1);
    expect(socket.closedByClientWith).toBeUndefined();
    await flush(1);

    expect(socket.closedByClientWith).toBe(1000);
    expect(result.current.status).toBe('reconnecting');
  });

  it.each([
    ['un ping', { type: 'ping', id: 'p-1' }],
    ['l’ack d’una subscripció', { type: 'subscribe', room: ROOM, id: 'x-1', payload: {} }],
    ['un missatge d’una sala', { type: 'message', room: ROOM, payload: { id: 'm-9' } }],
    ['un frame que ningú espera', { type: 'whatever', payload: {} }],
  ] as [string, Frame][])(
    'qualsevol frame (%s) rearma el comptador de 60 s',
    async (_label, frame) => {
      await mountConnected();
      const socket = lastSocket();
      await flush(DEAD_AFTER_MS - 1000);

      await serverSends(frame);
      await flush(DEAD_AFTER_MS - 1);

      expect(socket.closedByClientWith).toBeUndefined();

      await flush(1);

      expect(socket.closedByClientWith).toBe(1000);
    },
  );

  it('el frame d’auth (primer frame) també rearma el comptador', async () => {
    await mount();
    await serverOpens();
    await flush(DEAD_AFTER_MS - 1000);
    const socket = lastSocket();

    await serverSends(AUTH_ACK);
    await flush(DEAD_AFTER_MS - 1);

    expect(socket.closedByClientWith).toBeUndefined();
  });

  it('en desmuntar l’últim consumidor no queda cap timer viu (ni el de connexió morta)', async () => {
    const baseline = jest.getTimerCount();
    const { unmount } = await mountConnected();

    await unmount();
    await flush();

    expect(jest.getTimerCount()).toBe(baseline);
  });

  it('quan la connexió es tanca per sempre (4429) no queda cap timer viu', async () => {
    const baseline = jest.getTimerCount();
    const { result } = await mountConnected();

    await serverCloses(4429);

    expect(result.current.status).toBe('closed');
    expect(jest.getTimerCount()).toBe(baseline);
  });

  it('un socket que ja s’ha tancat no el tanca una segona vegada el comptador vell', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    await mountConnected();
    const first = lastSocket();
    await networkDrops();
    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);
    const second = lastSocket();

    await flush(DEAD_AFTER_MS - 1);

    expect(first.closedByClientWith).toBeUndefined();
    expect(second.closedByClientWith).toBeUndefined();
  });
});

describe('useSocket: cua de send en memòria (TG-654 F2)', () => {
  /** The first message frame the client wrote; its `id` identifies the request. */
  const firstMessage = () => messagesSent()[0];
  const ACK_PAYLOAD = { id: 'm-1', sent_at: '2026-11-18T20:00:00Z' };

  it('envia el missatge després dels subscribe de les sales, quan la connexió queda autenticada', async () => {
    const { result } = await mount();
    await act(async () => {
      result.current.subscribe(ROOM, jest.fn());
    });
    await startSending(result.current.send);
    await serverOpens();

    await serverSends(AUTH_ACK);

    expect(lastSocket().sent.map((frame) => frame.type)).toEqual(['auth', 'subscribe', 'message']);
  });

  it('un intent sense ack en 10 s es reintenta amb el mateix id i el mateix payload; 9 999 ms no fan res', async () => {
    const { result } = await mountConnected();
    await startSending(result.current.send);
    const first = firstMessage();

    await flush(REQUEST_TIMEOUT_MS - 1);

    expect(messagesSent()).toHaveLength(1);

    await flush(1);

    expect(messagesSent()).toEqual([first, first]);
  });

  it('un ack que arriba després d’un reintent resol la promesa i ja no es reenvia res més', async () => {
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);
    await flush(REQUEST_TIMEOUT_MS);
    const id = firstMessage()?.id;

    await serverSends({ type: 'message', room: ROOM, id, payload: ACK_PAYLOAD });

    expect(await outcomeOf(sending)).toBe('resolved');

    await flush(REQUEST_TIMEOUT_MS * 3);

    expect(messagesSent()).toHaveLength(2);
  });

  it('esgotats 3 intents sense cap resposta es rebutja amb SEND_UNCERTAIN (network, reintentable)', async () => {
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);

    await flush(REQUEST_TIMEOUT_MS * 2);
    expect(messagesSent()).toHaveLength(3);
    expect(await outcomeOf(sending)).toBe('pending');

    await flush(REQUEST_TIMEOUT_MS);
    const outcome = await outcomeOf(sending);

    expect(messagesSent()).toHaveLength(3);
    expect(outcome).toBeInstanceOf(AppError);
    expect((outcome as AppError).code).toBe('SEND_UNCERTAIN');
    expect((outcome as AppError).kind).toBe('network');
    expect((outcome as AppError).retryable).toBe(true);
  });

  it('un ack posterior al rebuig no fa res ni llença', async () => {
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);
    const id = firstMessage()?.id;
    await flush(REQUEST_TIMEOUT_MS * 3);
    expect(await outcomeOf(sending)).toBeInstanceOf(AppError);

    await serverSends({ type: 'message', room: ROOM, id, payload: ACK_PAYLOAD });

    expect(getSocketState().status).toBe('open');
  });

  it.each([
    [429, 'RATE_LIMITED'],
    [503, 'PUBSUB_UNAVAILABLE'],
  ])(
    'un error %s %s (retryable) es reintenta esperant 1 s i després 2 s (amb jitter entre base/2 i base) amb el mateix id',
    async (status, code) => {
      for (const random of [0, 1]) {
        _resetSocketForTests();
        jest.spyOn(Math, 'random').mockReturnValue(random);
        const { result, unmount } = await mountConnected();
        await startSending(result.current.send);
        const first = firstMessage();
        const problem = (): Frame => ({
          type: 'error',
          id: first?.id,
          room: ROOM,
          payload: wsProblem(status, code),
        });

        await serverSends(problem());
        await flush(1000 / 2 + (1000 / 2) * random - 1);
        expect(messagesSent()).toHaveLength(1);
        await flush(1);
        expect(messagesSent()).toEqual([first, first]);

        await serverSends(problem());
        await flush(2000 / 2 + (2000 / 2) * random - 1);
        expect(messagesSent()).toHaveLength(2);
        await flush(1);
        expect(messagesSent()).toEqual([first, first, first]);

        await unmount();
      }
    },
  );

  it('en esgotar els 3 intents amb una resposta d’error reintentable a l’últim, es rebutja amb aquell error del servidor', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);
    const id = firstMessage()?.id;
    const problem = (): Frame => ({
      type: 'error',
      id,
      room: ROOM,
      payload: wsProblem(429, 'RATE_LIMITED'),
    });

    await serverSends(problem());
    await flush(1000);
    await serverSends(problem());
    await flush(2000);
    await serverSends(problem());
    const error = await rejectionOf(sending);

    expect(messagesSent()).toHaveLength(3);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.status).toBe(429);
    expect(error.retryable).toBe(true);
  });

  it('si l’últim intent no va tenir resposta (tot i haver rebut un error abans) es rebutja amb SEND_UNCERTAIN', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);
    const id = firstMessage()?.id;

    await serverSends({
      type: 'error',
      id,
      room: ROOM,
      payload: wsProblem(503, 'PUBSUB_UNAVAILABLE'),
    });
    await flush(1000); // second attempt, it answers nothing
    await flush(REQUEST_TIMEOUT_MS); // third attempt, it answers nothing either
    await flush(REQUEST_TIMEOUT_MS);
    const error = await rejectionOf(sending);

    expect(messagesSent()).toHaveLength(3);
    expect(error.code).toBe('SEND_UNCERTAIN');
  });

  it('un error no reintentable (FORBIDDEN) es rebutja de seguida amb aquell AppError i no es reenvia', async () => {
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);

    await serverSends({
      type: 'error',
      id: firstMessage()?.id,
      room: ROOM,
      payload: wsProblem(403, 'FORBIDDEN'),
    });
    const error = await rejectionOf(sending);
    await flush(REQUEST_TIMEOUT_MS * 2);

    expect(error.code).toBe('FORBIDDEN');
    expect(messagesSent()).toHaveLength(1);
  });

  it('si la connexió es tanca abans de l’ack es reenvia en reautenticar-se amb el mateix id i el mateix payload', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await startSending(result.current.send);
    const first = firstMessage();

    await networkDrops();
    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(messagesSent()).toEqual([first]);
    expect(sockets()).toHaveLength(2);
  });

  it('si la connexió es dona per morta abans de l’ack es reenvia en reautenticar-se amb el mateix id', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await flush(DEAD_AFTER_MS - 5000); // a quiet connection, 5 s before it counts as dead
    await startSending(result.current.send);
    const first = firstMessage();

    await flush(5000);

    expect(lastSocket().closedByClientWith).toBe(1000);

    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(messagesSent()).toEqual([first]);
    expect(sockets()).toHaveLength(2);
  });

  it('en resoldre amb l’ack no queda cap timer viu del send', async () => {
    const { result, unmount } = await mountConnected();
    const baseline = jest.getTimerCount();
    const { sending } = await startSending(result.current.send);

    await serverSends({
      type: 'message',
      room: ROOM,
      id: firstMessage()?.id,
      payload: ACK_PAYLOAD,
    });
    await sending;
    await flush();

    expect(jest.getTimerCount()).toBe(baseline);
    await unmount();
  });

  it('en desmuntar amb un send pendent no queda cap timer viu', async () => {
    const baseline = jest.getTimerCount();
    const { result, unmount } = await mountConnected();
    const { sending } = await startSending(result.current.send);

    await unmount();
    await outcomeOf(sending);

    expect(jest.getTimerCount()).toBe(baseline);
  });
});

describe('useSocket: final definitiu de la connexió amb enviaments pendents (TG-654 F3)', () => {
  it('4429: un missatge ja enviat es rebutja amb SEND_UNCERTAIN', async () => {
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);

    await serverCloses(4429);
    const error = await rejectionOf(sending);

    expect(error.code).toBe('SEND_UNCERTAIN');
    expect(error.kind).toBe('network');
  });

  it('4429: un missatge que mai no va sortir (encara sense auth) es rebutja amb NETWORK_ERROR', async () => {
    const { result } = await mount();
    await serverOpens();
    const { sending } = await startSending(result.current.send);

    await serverCloses(4429);
    const error = await rejectionOf(sending);

    expect(error.code).toBe('NETWORK_ERROR');
    expect(messagesSent()).toHaveLength(0);
  });

  it('4401 final (segon 4401 després de renovar): els pendents es rebutgen, ja enviats amb SEND_UNCERTAIN', async () => {
    const { result } = await mountConnected();
    await serverCloses(4401);
    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);
    const { sending } = await startSending(result.current.send);

    await serverCloses(4401);
    await serverOpens();
    await serverCloses(4401);
    const error = await rejectionOf(sending);

    expect(getSocketState().status).toBe('closed');
    expect(error.code).toBe('SEND_UNCERTAIN');
  });

  it('després de 8 intents de reconnexió fallits (closed) es rebuja un missatge que mai no va sortir amb NETWORK_ERROR', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    await networkDrops();
    const { sending } = await startSending(result.current.send);

    for (const base of BACKOFF_BASES) {
      await flush(base);
      await networkDrops();
    }
    const error = await rejectionOf(sending);

    expect(getSocketState().status).toBe('closed');
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('després de 8 intents fallits, un missatge que sí havia sortit es rebutja amb SEND_UNCERTAIN', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);
    await networkDrops();

    for (const base of BACKOFF_BASES) {
      await flush(base);
      await networkDrops();
    }
    const error = await rejectionOf(sending);

    expect(getSocketState().status).toBe('closed');
    expect(error.code).toBe('SEND_UNCERTAIN');
  });
});

describe('useSocket: AppState (TG-654 F4)', () => {
  /** Captures the AppState listeners the client registers, like useQuiz.test.tsx does. */
  function captureAppState() {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    const remove = jest.fn();
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove } as never;
    });
    // The RN preset's AppState.addEventListener is a jest.fn: the spy inherits its call history.
    spy.mockClear();
    const emit = (state: AppStateStatus) => act(async () => listeners.forEach((l) => l(state)));
    return { spy, remove, listeners, emit };
  }

  it('registra un sol listener `change` amb el primer consumidor i el treu amb l’últim', async () => {
    const app = captureAppState();

    const first = await mount();
    const second = await mount();

    expect(app.spy).toHaveBeenCalledTimes(1);
    expect(app.spy).toHaveBeenCalledWith('change', expect.any(Function));

    await first.unmount();
    expect(app.remove).not.toHaveBeenCalled();

    await second.unmount();
    expect(app.remove).toHaveBeenCalledTimes(1);
  });

  // TG-654 (changed: `inactive` used to close too): on iOS `inactive` also fires with the control
  // centre or Face ID, which must not cost the connection. Only `background` suspends it.
  it('background tanca el socket amb 1000, passa a reconnecting i no programa cap reintent', async () => {
    const app = captureAppState();
    const { result } = await mountConnected();
    const socket = lastSocket();

    await app.emit('background');
    await flush();

    expect(socket.closedByClientWith).toBe(1000);
    expect(result.current.status).toBe('reconnecting');

    await flush(TEN_MINUTES);

    expect(sockets()).toHaveLength(1);
    expect(result.current.status).toBe('reconnecting');
  });

  it('inactive no tanca ni reconnecta: la connexió segueix oberta', async () => {
    const app = captureAppState();
    const { result } = await mountConnected();
    const socket = lastSocket();
    await app.emit('inactive');
    await flush(DEAD_AFTER_MS - 1);

    expect(socket.closedByClientWith).toBeUndefined();
    expect(result.current.status).toBe('open');
    expect(sockets()).toHaveLength(1);

    await app.emit('active'); // coming back from inactive changes nothing either
    await flush();

    expect(sockets()).toHaveLength(1);
    expect(socket.closedByClientWith).toBeUndefined();
  });

  it('active reconnecta de seguida (sense esperar el backoff), reautentica i resubscriu les sales', async () => {
    const app = captureAppState();
    const { result } = await mountConnected();
    await act(async () => {
      result.current.subscribe(ROOM, jest.fn());
    });
    await app.emit('background');
    await flush();

    await app.emit('active');
    await flush();

    expect(sockets()).toHaveLength(2);

    await serverOpens();
    expect(lastSent()).toEqual(authFrame('access-1'));
    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
    expect(lastSocket().sentOfType('subscribe')).toEqual([
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
    ]);
  });

  it('active posa els intents a 0 i cancel·la l’espera del backoff pendent', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const app = captureAppState();
    const { result } = await mountConnected();
    await networkDrops(); // waits 1 s
    await flush(1000);
    await networkDrops(); // waits 2 s
    await flush(2000);
    await networkDrops(); // waits 4 s, attempts = 3
    expect(sockets()).toHaveLength(3);

    // TG-654: only a real `background` makes `active` reconnect at once
    await app.emit('background');
    await flush();
    await app.emit('active');
    await flush();

    expect(sockets()).toHaveLength(4);

    await serverOpens();
    await serverSends(AUTH_ACK);
    await flush(4000); // the old pending retry must not open another socket

    expect(sockets()).toHaveLength(4);

    await networkDrops();
    await flush(1000); // first level of the backoff again

    expect(sockets()).toHaveLength(5);
    expect(result.current.status).toBe('reconnecting');
  });

  it('active amb la connexió oberta no fa res', async () => {
    const app = captureAppState();
    await mountConnected();
    const socket = lastSocket();

    await app.emit('active');
    await flush();

    expect(sockets()).toHaveLength(1);
    expect(socket.closedByClientWith).toBeUndefined();
  });

  it('un send pendent no es perd en passar a segon pla: es reenvia amb el mateix id en tornar', async () => {
    const app = captureAppState();
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);
    const first = lastSent();

    await app.emit('background');
    await flush();

    expect(await outcomeOf(sending)).toBe('pending');

    await app.emit('active');
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(messagesSent()).toEqual([first]);
  });

  it('un send fet amb l’app en segon pla s’encua i surt en tornar a primer pla', async () => {
    const app = captureAppState();
    const { result } = await mountConnected();
    await app.emit('background');
    await flush();

    const { sending } = await startSending(result.current.send);

    expect(await outcomeOf(sending)).toBe('pending');

    await app.emit('active');
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(messagesSent()).toEqual([{ ...MESSAGE, id: expect.any(String) }]);
  });

  it('no queda cap timer viu en segon pla (ni el de connexió morta)', async () => {
    const baseline = jest.getTimerCount();
    const app = captureAppState();
    const { unmount } = await mountConnected();

    await app.emit('background');
    await flush();
    await unmount();
    await flush();

    expect(jest.getTimerCount()).toBe(baseline);
  });
});

describe('useSocket: casos límit (TG-654 F6)', () => {
  it('un new WebSocket() que llança es tracta com una caiguda: backoff i reconnecting, no es queda a connecting', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    globalThis.WebSocket = jest.fn(() => {
      throw new Error('SecurityError');
    }) as unknown as typeof WebSocket;

    const { result } = await mount();

    expect(result.current.status).toBe('reconnecting');

    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    await flush(1000);

    expect(sockets()).toHaveLength(1);
    expect(lastSocket().url).toBe(WS_URL);
  });

  it.each([
    ['null', null],
    ['un número', 3],
    ['un string', 'x'],
  ])(
    'un frame JSON primitiu (%s) s’ignora sense petar, també abans de l’auth',
    async (_label, primitive) => {
      const { result } = await mount();
      await serverOpens();
      const socket = lastSocket();

      await act(async () => socket.serverSend(primitive as unknown as Frame));
      expect(result.current.status).toBe('connecting');
      await serverSends(AUTH_ACK);
      await act(async () => socket.serverSend(primitive as unknown as Frame));
      await serverSends({ type: 'ping', id: 'p-1' });

      expect(result.current.status).toBe('open');
      expect(lastSent()).toEqual({ type: 'pong', id: 'p-1' });
    },
  );

  it('reconnect() sense consumidors no obre cap socket', async () => {
    await act(async () => reconnect());
    await flush(TEN_MINUTES);

    expect(sockets()).toHaveLength(0);
    expect(getSocketState().status).toBe('closed');
  });
});

describe('useSocket: cua acotada (TG-654, OUTBOX_MAX = 50)', () => {
  const OUTBOX_MAX = 50;

  it('un send amb 50 enviaments pendents es rebutja a l’instant amb NETWORK_ERROR sense encuar-se ni enviar-se; els 50 primers no es veuen afectats', async () => {
    const { result } = await mountConnected();
    const pending: Promise<unknown>[] = [];
    for (let n = 0; n < OUTBOX_MAX; n += 1) {
      pending.push((await startSending(result.current.send)).sending);
    }
    expect(messagesSent()).toHaveLength(OUTBOX_MAX);

    const { sending: extra } = await startSending(result.current.send);
    const error = await outcomeOf(extra); // at once: nothing to advance

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('NETWORK_ERROR');
    expect(messagesSent()).toHaveLength(OUTBOX_MAX); // it never went out
    for (const first of pending) expect(await outcomeOf(first)).toBe('pending');
  });

  it('en resoldre’s un dels 50 queda lloc per a un de nou', async () => {
    const { result } = await mountConnected();
    for (let n = 0; n < OUTBOX_MAX; n += 1) await startSending(result.current.send);
    await serverSends({
      type: 'message',
      room: ROOM,
      id: messagesSent()[0]?.id,
      payload: { id: 'm-1', sent_at: '2026-11-18T20:00:00Z' },
    });

    const { sending } = await startSending(result.current.send);

    expect(await outcomeOf(sending)).toBe('pending');
    expect(messagesSent()).toHaveLength(OUTBOX_MAX + 1);
  });
});

describe('useSocket: error tardà durant l’espera del reintent (TG-654)', () => {
  it('un segon error reintentable amb el mateix id mentre espera el reintent s’ignora: el reenviament surt a l’hora del primer i els intents avancen un sol cop', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await mountConnected();
    const { sending } = await startSending(result.current.send);
    const id = messagesSent()[0]?.id;
    const problem = (): Frame => ({
      type: 'error',
      id,
      room: ROOM,
      payload: wsProblem(503, 'PUBSUB_UNAVAILABLE'),
    });

    await serverSends(problem()); // the wait of 1 s starts
    await flush(500);
    await serverSends(problem()); // late, same id: it must not move the wait
    await flush(499);
    expect(messagesSent()).toHaveLength(1);
    await flush(1);

    expect(messagesSent()).toHaveLength(2); // exactly one resend, on time

    await flush(REQUEST_TIMEOUT_MS); // second attempt: no answer, the third goes out
    expect(messagesSent()).toHaveLength(3);
    await flush(REQUEST_TIMEOUT_MS - 1);
    expect(await outcomeOf(sending)).toBe('pending');
    await flush(1);

    const error = await rejectionOf(sending);
    expect(error.code).toBe('SEND_UNCERTAIN');
    expect(messagesSent()).toHaveLength(3);
  });
});

describe('useSocket: 4401 i AppState (TG-654)', () => {
  /** Same capture as the AppState block above (it is local to that describe). */
  function captureActive() {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: jest.fn() } as never;
    });
    spy.mockClear();
    return (state: AppStateStatus) => act(async () => listeners.forEach((l) => l(state)));
  }

  it('active mentre una renovació de sessió (després d’un 4401) és en vol la cancel·la i sessionRenewed torna a false: un 4401 posterior renova de nou en lloc de tancar amb INVALID_SESSION', async () => {
    const emit = captureActive();
    const renewal = deferred<void>();
    auth.refresh.mockReturnValueOnce(renewal.promise);
    const { result } = await mountConnected();

    await serverCloses(4401);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('reconnecting');

    await emit('background'); // TG-654: `active` only acts after a real `background`
    await flush();
    await emit('active');
    await flush();

    expect(sockets()).toHaveLength(2); // connected at once, the renewal in flight is dropped

    await serverOpens(); // no auth ack yet: nothing has reset the flag
    await serverCloses(4401);

    expect(auth.refresh).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('reconnecting');
    expect(result.current.error).toBeNull();

    await act(async () => renewal.resolve()); // the cancelled renewal ends late: no effect
    await flush();

    expect(result.current.status).not.toBe('closed');
  });
});

describe('useSocket: active sense background previ no toca res (TG-654)', () => {
  // On iOS `inactive -> active` also fires with the control centre or Face ID: it must not
  // cut a running backoff, reset its counter or start a second session renewal.
  function captureAppStateEvents() {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: jest.fn() } as never;
    });
    spy.mockClear();
    return (state: AppStateStatus) => act(async () => listeners.forEach((l) => l(state)));
  }

  it('amb un backoff en curs, active (inactive -> active) no reconnecta abans d’hora ni reinicia el comptador d’intents', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const emit = captureAppStateEvents();
    const { result } = await mountConnected();
    await networkDrops(); // waits 1 s

    await emit('inactive');
    await emit('active');
    await flush(999);

    expect(sockets()).toHaveLength(1);
    expect(result.current.status).toBe('reconnecting');

    await flush(1);

    expect(sockets()).toHaveLength(2); // the backoff ended on time

    await networkDrops(); // attempts continue: now 2 s, not 1 s again
    await emit('active');
    await flush(1999);

    expect(sockets()).toHaveLength(2);

    await flush(1);

    expect(sockets()).toHaveLength(3);
  });

  it('amb una renovació 4401 en vol, active no crida auth.refresh una segona vegada ni obre cap socket fins que acabi la primera', async () => {
    const emit = captureAppStateEvents();
    const renewal = deferred<void>();
    auth.refresh.mockReturnValueOnce(renewal.promise);
    const { result } = await mountConnected();
    await serverCloses(4401);
    expect(auth.refresh).toHaveBeenCalledTimes(1);

    await emit('active');
    await flush(TEN_MINUTES);

    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(sockets()).toHaveLength(1);
    expect(result.current.status).toBe('reconnecting');

    await act(async () => renewal.resolve());
    await flush();

    expect(sockets()).toHaveLength(2); // the one renewal ended: now it connects
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('després d’un background real, active continua reconnectant de seguida', async () => {
    const emit = captureAppStateEvents();
    await mountConnected();

    await emit('background');
    await flush();
    await emit('inactive');
    await emit('active');
    await flush();

    expect(sockets()).toHaveLength(2);
  });
});

describe('useSocket: late answers of a send that is already settled (TG-469)', () => {
  it('do not reach the room: only the answer to its subscribe does', async () => {
    const { result } = await mountConnected();
    const onFrame = jest.fn();
    await act(async () => {
      result.current.subscribe(ROOM, onFrame);
    });
    const { sending } = await startSending(result.current.send);
    const sentId = lastSent()?.id;
    const ack: Frame = {
      type: 'message',
      room: ROOM,
      id: sentId,
      payload: { id: 'm-1', sent_at: '2026-11-18T20:00:00Z' },
    };
    await serverSends(ack);
    await expect(sending).resolves.toEqual(ack);

    // An earlier attempt answered after all, once the send had settled.
    await serverSends({
      type: 'error',
      id: sentId,
      room: ROOM,
      payload: wsProblem(503, 'PUBSUB_UNAVAILABLE'),
    });
    await serverSends(ack);

    expect(onFrame).not.toHaveBeenCalled();
  });
});

describe('useSocket: a join that is left before its answer (TG-469)', () => {
  it('its late answer does not reach the handlers of a later join of the same room', async () => {
    const { result } = await mountConnected();
    const first = jest.fn();
    let leave = () => {};
    await act(async () => {
      leave = result.current.subscribe(ROOM, first);
    });
    const staleId = lastSent()?.id;
    await act(async () => leave());

    const second = jest.fn();
    await act(async () => {
      result.current.subscribe(ROOM, second);
    });
    const freshId = lastSent()?.id;
    expect(freshId).not.toBe(staleId);

    // The server answers the first subscribe only now: it was refused.
    await serverSends({
      type: 'error',
      id: staleId,
      room: ROOM,
      payload: wsProblem(403, 'FORBIDDEN'),
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    // The answer to the join that is still wanted does arrive.
    const ack: Frame = { type: 'subscribe', id: freshId, room: ROOM };
    await serverSends(ack);

    expect(second).toHaveBeenCalledWith(ack);
  });

  it('leaving one room keeps the pending join of another room', async () => {
    const { result } = await mountConnected();
    const onOther = jest.fn();
    let leave = () => {};
    await act(async () => {
      result.current.subscribe(OTHER_ROOM, onOther);
    });
    const otherId = lastSent()?.id;
    await act(async () => {
      leave = result.current.subscribe(ROOM, jest.fn());
    });
    await act(async () => leave());

    const ack: Frame = { type: 'subscribe', id: otherId, room: OTHER_ROOM };
    await serverSends(ack);

    expect(onOther).toHaveBeenCalledWith(ack);
  });
});
