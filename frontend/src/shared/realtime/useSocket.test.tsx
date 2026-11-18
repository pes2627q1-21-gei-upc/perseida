import { act, renderHook } from '@testing-library/react-native';

import {
  FakeWebSocket,
  type Frame,
  installFakeWebSocket,
  lastSocket,
  wsProblem,
} from '../../../__mocks__/fakeWebSocket';
import { AppError } from '../errors';
import type { SocketAuth } from '.';
import { _resetSocketForTests, getSocketState } from './socketClient';
import { useSocket } from './useSocket';

const WS_URL = 'ws://api.test/api/ws';
const ROOM = 'chat:event:ev-1';
const OTHER_ROOM = 'chat:event:ev-2';
const AUTH_ACK: Frame = { type: 'auth', payload: {} };
const authFrame = (token: string): Frame => ({ type: 'auth', token });
const MESSAGE = { type: 'message' as const, room: ROOM, payload: { text: 'hola' } };
const TEN_MINUTES = 10 * 60_000;
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
        author_id: 'u-2',
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
  it('sense connexió oberta (abans de l’ack de l’auth) es rebutja amb NETWORK_ERROR sense enviar res', async () => {
    const { result } = await mount();
    await serverOpens();
    const { sending } = await startSending(result.current.send);
    const error = await rejectionOf(sending);

    expect(error.code).toBe('NETWORK_ERROR');
    expect(lastSocket().sent).toEqual([authFrame('access-1')]);
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

  it.each([
    [403, 'FORBIDDEN', false],
    [429, 'RATE_LIMITED', true],
    [503, 'PUBSUB_UNAVAILABLE', true],
  ])(
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

describe('useSocket: send després d’una caiguda (TG-461)', () => {
  it('es rebutja amb NETWORK_ERROR sense enviar res mentre espera per reconnectar', async () => {
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

    expect(outcome).toBeInstanceOf(AppError);
    expect((outcome as AppError).code).toBe('NETWORK_ERROR');
    expect(dropped.sent).toEqual([authFrame('access-1')]);
    expect(sockets()).toHaveLength(1);
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
