import { act, renderHook } from '@testing-library/react-native';

import {
  FakeWebSocket,
  type Frame,
  installFakeWebSocket,
  lastSocket,
  wsProblem,
} from '../../../__mocks__/fakeWebSocket';
import { refreshSession } from '../../features/auth/api/refreshToken';
import { saveTokens } from '../../features/auth/tokenStorage';
import { AppError } from '../errors';
import { _resetSocketForTests } from './socketClient';
import { useSocket } from './useSocket';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

jest.mock('../../features/auth/api/refreshToken', () => ({
  refreshSession: jest.fn(),
  _resetActiveRefreshPromise: jest.fn(),
}));

const mockedRefreshSession = jest.mocked(refreshSession);

const WS_URL = 'ws://api.test/api/ws';
const ROOM = 'chat:event:ev-1';
const OTHER_ROOM = 'chat:event:ev-2';
const AUTH_ACK: Frame = { type: 'auth', payload: {} };
const auth = (token: string): Frame => ({ type: 'auth', token });
const MESSAGE = { type: 'message' as const, room: ROOM, payload: { text: 'hola' } };
const TEN_MINUTES = 10 * 60_000;
// Base wait before each reconnection attempt: 1 s, doubling, capped at 30 s.
const BACKOFF_BASES = [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000];

let restoreWebSocket: () => void;

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
  const hook = await renderHook(() => useSocket());
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

beforeEach(async () => {
  jest.useFakeTimers();
  restoreWebSocket = installFakeWebSocket();
  _resetSocketForTests();
  mockedRefreshSession.mockReset();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
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

    expect(lastSocket().sent).toEqual([auth('access-1')]);
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

    expect(lastSocket().sent).toEqual([auth('access-1')]);

    await serverSends(AUTH_ACK);

    expect(lastSocket().sent).toEqual([
      auth('access-1'),
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
    expect(lastSocket().sent).toEqual([auth('access-1')]);
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
    await saveTokens({ accessToken: 'access-2', refreshToken: 'refresh-2' });

    await networkDrops();
    await flush(1000);

    expect(sockets()).toHaveLength(2);

    await serverOpens();

    expect(lastSocket().sent).toEqual([auth('access-2')]);
    expect(result.current.status).toBe('reconnecting');

    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
    expect(lastSocket().sent).toEqual([
      auth('access-2'),
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
  const TOKENS_2 = {
    access_token: 'access-2',
    refresh_token: 'refresh-2',
    token_type: 'bearer' as const,
    expires_in: 900,
  };

  function refreshSucceeds() {
    mockedRefreshSession.mockImplementation(async () => {
      await saveTokens({ accessToken: 'access-2', refreshToken: 'refresh-2' });
      return TOKENS_2;
    });
  }

  it('4401: renova la sessió un sol cop i reconnecta amb el token nou', async () => {
    refreshSucceeds();
    const { result } = await mountConnected();

    await serverCloses(4401);
    await flush(1000);

    expect(mockedRefreshSession).toHaveBeenCalledTimes(1);
    expect(sockets()).toHaveLength(2);

    await serverOpens();

    expect(lastSocket().sent).toEqual([auth('access-2')]);

    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
  });

  it('4401 un altre cop després de renovar: closed amb INVALID_SESSION i cap bucle de reconnexions', async () => {
    refreshSucceeds();
    const { result } = await mountConnected();
    await serverCloses(4401);
    await flush(1000);
    await serverOpens();

    await serverCloses(4401);
    await flush(TEN_MINUTES);

    expect(result.current.status).toBe('closed');
    expect(result.current.error?.code).toBe('INVALID_SESSION');
    expect(mockedRefreshSession).toHaveBeenCalledTimes(1);
    expect(sockets()).toHaveLength(2);
  });

  it('4401 i la renovació falla: closed amb INVALID_SESSION sense reconnectar', async () => {
    mockedRefreshSession.mockResolvedValue(null);
    const { result } = await mountConnected();

    await serverCloses(4401);
    await flush(TEN_MINUTES);

    expect(mockedRefreshSession).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('closed');
    expect(result.current.error?.code).toBe('INVALID_SESSION');
    expect(sockets()).toHaveLength(1);
  });

  it('4429 (massa connexions): closed sense cap reintent', async () => {
    const { result } = await mount();
    await serverOpens();

    await serverCloses(4429);
    await flush(TEN_MINUTES);

    expect(result.current.status).toBe('closed');
    expect(sockets()).toHaveLength(1);
    expect(mockedRefreshSession).not.toHaveBeenCalled();
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
    expect(lastSocket().sent).toEqual([auth('access-1')]);
  });
});
