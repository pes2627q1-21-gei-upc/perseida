import { act, renderHook } from '@testing-library/react-native';
import * as Crypto from 'expo-crypto';

import {
  type Frame,
  FakeWebSocket,
  installFakeWebSocket,
  lastSocket,
  wsProblem,
} from '../../../../__mocks__/fakeWebSocket';
import { AppError } from '../../../shared/errors';
import { _resetSocketForTests } from '../../../shared/realtime/socketClient';
import { useSocket } from '../../../shared/realtime/useSocket';
import { socketAuth } from '../../auth/socketAuth';
import { useChatSocket } from './useChatSocket';

// The chat feature hands the auth feature's SocketAuth to the shared connection (feature ->
// feature is allowed); here it is a fake with a fixed token.
jest.mock('../../auth/socketAuth', () => ({
  socketAuth: { getToken: jest.fn(), refresh: jest.fn() },
}));

// TG-654: the idempotency key of a message is made up on the client with Crypto.randomUUID().
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'uuid-1'),
}));

const EVENT_ID = '7d1f0c2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';
const ROOM = `chat:event:${EVENT_ID}`;
const OTHER_EVENT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER_ROOM = `chat:event:${OTHER_EVENT_ID}`;
const AUTH_ACK: Frame = { type: 'auth', payload: {} };
const OTHERS_MESSAGE = {
  id: 'm-9',
  room_id: 'r-1',
  author: { id: 'u-2', name: 'Bob' },
  text: 'Es veu Júpiter!',
  sent_at: '2026-11-18T21:00:00Z',
};

let restoreWebSocket: () => void;
let handlers: { onMessage: jest.Mock; onRevoked: jest.Mock; onError: jest.Mock };

/** Lets pending promises and the timers due in `ms` run, inside act (fake timers). */
async function flush(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function serverOpens() {
  const socket = lastSocket();
  await act(async () => socket.serverOpen());
  await flush();
}

async function serverSends(frame: Frame) {
  const socket = lastSocket();
  await act(async () => socket.serverSend(frame));
  await flush();
}

async function serverCloses(code: number) {
  const socket = lastSocket();
  await act(async () => socket.serverClose(code));
  await flush();
}

const lastSent = () => lastSocket().sent[lastSocket().sent.length - 1];

/** Mounts useChatSocket for ROOM and completes the handshake: open + auth ack. */
async function mountChatConnected() {
  const hook = await renderHook(() => useChatSocket(ROOM, handlers));
  await flush();
  await serverOpens();
  await serverSends(AUTH_ACK);
  return hook;
}

/**
 * Calls `sendMessage(text)` inside act. The promise is wrapped in an object (an async function
 * would flatten it) and gets a no-op handler so an early rejection is not reported as unhandled.
 */
async function startSending(sendMessage: (text: string) => Promise<unknown>, text: string) {
  let sending!: Promise<unknown>;
  await act(async () => {
    sending = sendMessage(text);
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

beforeEach(() => {
  jest.useFakeTimers();
  restoreWebSocket = installFakeWebSocket();
  _resetSocketForTests();
  handlers = { onMessage: jest.fn(), onRevoked: jest.fn(), onError: jest.fn() };
  jest.mocked(socketAuth.getToken).mockReset().mockResolvedValue('access-1');
  jest.mocked(socketAuth.refresh).mockReset().mockResolvedValue(undefined);
  jest.mocked(Crypto.randomUUID).mockReset().mockReturnValue('uuid-1');
});

afterEach(() => {
  _resetSocketForTests();
  restoreWebSocket();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('useChatSocket (TG-461, US TG-64)', () => {
  it('en muntar es subscriu a la sala chat:event:<id> de l’esdeveniment', async () => {
    await mountChatConnected();

    expect(lastSocket().sentOfType('subscribe')).toEqual([
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
    ]);
  });

  it('en desmuntar es dessubscriu de la sala (amb la connexió encara en ús per un altre consumidor)', async () => {
    const chat = await mountChatConnected();
    await renderHook(() => useSocket(socketAuth));
    await flush();

    await chat.unmount();
    await flush();

    expect(lastSocket().sentOfType('unsubscribe')).toEqual([
      { type: 'unsubscribe', room: ROOM, id: expect.any(String) },
    ]);
  });

  it('crida onMessage amb el payload dels missatges d’altres usuaris de la sala', async () => {
    await mountChatConnected();

    await serverSends({ type: 'message', room: ROOM, payload: OTHERS_MESSAGE });

    expect(handlers.onMessage).toHaveBeenCalledTimes(1);
    expect(handlers.onMessage).toHaveBeenCalledWith(OTHERS_MESSAGE);
  });

  it('no crida onMessage amb els missatges d’una altra sala', async () => {
    await mountChatConnected();

    await serverSends({ type: 'message', room: 'chat:event:una-altra', payload: OTHERS_MESSAGE });

    expect(handlers.onMessage).not.toHaveBeenCalled();
  });

  it('sendMessage envia el text a la sala i retorna l’id i el sent_at de l’ack', async () => {
    const { result } = await mountChatConnected();

    const { sending } = await startSending(result.current.sendMessage, 'hola');
    const sent = lastSent();

    expect(sent).toEqual({
      type: 'message',
      room: ROOM,
      payload: { text: 'hola', client_message_id: 'uuid-1' },
      id: expect.any(String),
    });

    await serverSends({
      type: 'message',
      room: ROOM,
      id: sent?.id,
      payload: { id: 'm-1', sent_at: '2026-11-18T20:00:00Z' },
    });

    await expect(sending).resolves.toEqual({ id: 'm-1', sent_at: '2026-11-18T20:00:00Z' });
  });

  // TG-654: 429/503 (retryable) are retried by the shared connection; the others reject at once.
  it.each([[422, 'CHAT_MESSAGE_REJECTED', false]])(
    'sendMessage es rebutja amb un AppError %s %s quan el servidor respon un frame error',
    async (status, code, retryable) => {
      const { result } = await mountChatConnected();
      const { sending } = await startSending(result.current.sendMessage, 'hola');

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
      expect(handlers.onMessage).not.toHaveBeenCalled();
    },
  );

  it('crida onRevoked quan el servidor revoca la sala (unsubscribe sense id)', async () => {
    await mountChatConnected();

    await serverSends({ type: 'unsubscribe', room: ROOM, payload: {} });

    expect(handlers.onRevoked).toHaveBeenCalledTimes(1);
    expect(handlers.onMessage).not.toHaveBeenCalled();
  });

  it('exposa status: connecting fins a l’ack de l’auth i open després', async () => {
    const { result } = await renderHook(() => useChatSocket(ROOM, handlers));
    await flush();

    expect(result.current.status).toBe('connecting');

    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
    expect(result.current.error).toBeNull();
  });

  it('exposa reconnect, que torna a obrir la connexió quan ha quedat closed', async () => {
    const { result } = await renderHook(() => useChatSocket(ROOM, handlers));
    await flush();
    await serverOpens();
    await serverCloses(4429);

    expect(result.current.status).toBe('closed');

    await act(async () => result.current.reconnect());
    await flush(1000);

    expect(FakeWebSocket.instances).toHaveLength(2);

    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
    expect(lastSocket().sentOfType('subscribe')).toEqual([
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
    ]);
  });

  it('es connecta amb el token de socketAuth de la feature auth', async () => {
    await mountChatConnected();

    expect(socketAuth.getToken).toHaveBeenCalledTimes(1);
    expect(lastSocket().sent[0]).toEqual({ type: 'auth', token: 'access-1' });
  });

  it('ignora els frames amb id (respostes a peticions): no crida onMessage ni onRevoked', async () => {
    await mountChatConnected();

    await serverSends({ type: 'message', room: ROOM, id: 'x-1', payload: OTHERS_MESSAGE });
    await serverSends({ type: 'unsubscribe', room: ROOM, id: 'x-2', payload: {} });

    expect(handlers.onMessage).not.toHaveBeenCalled();
    expect(handlers.onRevoked).not.toHaveBeenCalled();
  });

  it('un frame de la sala que no és message ni unsubscribe no crida onRevoked ni onMessage', async () => {
    await mountChatConnected();

    await serverSends({ type: 'error', room: ROOM, payload: wsProblem(403, 'FORBIDDEN') });

    expect(handlers.onRevoked).not.toHaveBeenCalled();
    expect(handlers.onMessage).not.toHaveBeenCalled();
  });

  it('si canvia la sala, es dessubscriu de la sala vella i se subscriu a la nova', async () => {
    const { rerender } = await renderHook(
      ({ room }: { room: string }) => useChatSocket(room, handlers),
      { initialProps: { room: ROOM } },
    );
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);

    await rerender({ room: OTHER_ROOM });
    await flush();

    expect(lastSocket().sentOfType('unsubscribe')).toEqual([
      { type: 'unsubscribe', room: ROOM, id: expect.any(String) },
    ]);
    expect(lastSocket().sentOfType('subscribe')).toEqual([
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
      { type: 'subscribe', room: OTHER_ROOM, id: expect.any(String) },
    ]);
  });

  it('si canvien els handlers, no es torna a subscriure però usa els nous', async () => {
    const first = { onMessage: jest.fn(), onRevoked: jest.fn() };
    const second = { onMessage: jest.fn(), onRevoked: jest.fn() };
    const { rerender } = await renderHook(
      ({ current }: { current: typeof first }) => useChatSocket(ROOM, current),
      { initialProps: { current: first } },
    );
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);

    await rerender({ current: second });
    await flush();
    await serverSends({ type: 'message', room: ROOM, payload: OTHERS_MESSAGE });
    await serverSends({ type: 'unsubscribe', room: ROOM, payload: {} });

    expect(lastSocket().sentOfType('subscribe')).toHaveLength(1);
    expect(lastSocket().sentOfType('unsubscribe')).toHaveLength(0);
    expect(second.onMessage).toHaveBeenCalledWith(OTHERS_MESSAGE);
    expect(second.onRevoked).toHaveBeenCalledTimes(1);
    expect(first.onMessage).not.toHaveBeenCalled();
    expect(first.onRevoked).not.toHaveBeenCalled();
  });

  it('sendMessage després de canviar la sala envia a la sala nova', async () => {
    const { result, rerender } = await renderHook(
      ({ room }: { room: string }) => useChatSocket(room, handlers),
      { initialProps: { room: ROOM } },
    );
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);
    await rerender({ room: OTHER_ROOM });
    await flush();

    await startSending(result.current.sendMessage, 'hola');

    expect(lastSent()).toEqual({
      type: 'message',
      room: OTHER_ROOM,
      payload: { text: 'hola', client_message_id: 'uuid-1' },
      id: expect.any(String),
    });
  });
});

describe('useChatSocket: errors de la sala a onError (TG-461, TG-64)', () => {
  /** The `subscribe` this client sent for ROOM (its id is what the server's answer carries). */
  const subscribeFrame = () => lastSocket().sentOfType('subscribe')[0];

  it.each([
    [403, 'FORBIDDEN', false],
    [404, 'CHAT_ROOM_NOT_FOUND', false],
    [404, 'EVENT_NOT_FOUND', false],
    [422, 'VALIDATION_ERROR', false],
    [429, 'RATE_LIMITED', true],
    [503, 'PUBSUB_UNAVAILABLE', true],
  ])(
    'un error %s %s al subscribe arriba a onError com a AppError (retryable %s)',
    async (status, code, retryable) => {
      await mountChatConnected();

      await serverSends({
        type: 'error',
        room: ROOM,
        id: subscribeFrame()?.id,
        payload: wsProblem(status, code),
      });

      expect(handlers.onError).toHaveBeenCalledTimes(1);
      const error: unknown = handlers.onError.mock.calls[0]?.[0];
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).kind).toBe('http');
      expect((error as AppError).code).toBe(code);
      expect((error as AppError).status).toBe(status);
      expect((error as AppError).correlationId).toBe('c-1');
      expect((error as AppError).retryable).toBe(retryable);
      expect(handlers.onMessage).not.toHaveBeenCalled();
      expect(handlers.onRevoked).not.toHaveBeenCalled();
    },
  );

  it('l’ack d’un subscribe correcte no crida onError (ni onMessage ni onRevoked)', async () => {
    await mountChatConnected();

    await serverSends({ type: 'subscribe', room: ROOM, id: subscribeFrame()?.id, payload: {} });

    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onMessage).not.toHaveBeenCalled();
    expect(handlers.onRevoked).not.toHaveBeenCalled();
  });

  it('els errors d’una altra sala no arriben a onError', async () => {
    await mountChatConnected();

    await serverSends({
      type: 'error',
      room: OTHER_ROOM,
      id: subscribeFrame()?.id,
      payload: wsProblem(403, 'FORBIDDEN'),
    });

    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('l’error d’un sendMessage rebutja la promesa i no passa per onError', async () => {
    const { result } = await mountChatConnected();
    const { sending } = await startSending(result.current.sendMessage, 'hola');

    await serverSends({
      type: 'error',
      room: ROOM,
      id: lastSent()?.id,
      payload: wsProblem(422, 'CHAT_MESSAGE_REJECTED'),
    });
    const error = await rejectionOf(sending);

    expect(error.code).toBe('CHAT_MESSAGE_REJECTED');
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('onError és opcional: sense handler, un error de la sala no fa petar res', async () => {
    const withoutOnError = { onMessage: jest.fn(), onRevoked: jest.fn() };
    const { result } = await renderHook(() => useChatSocket(ROOM, withoutOnError));
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);

    await serverSends({
      type: 'error',
      room: ROOM,
      id: subscribeFrame()?.id,
      payload: wsProblem(403, 'FORBIDDEN'),
    });

    expect(result.current.status).toBe('open');
    expect(withoutOnError.onMessage).not.toHaveBeenCalled();
    expect(withoutOnError.onRevoked).not.toHaveBeenCalled();
  });

  it('si canvia onError entre renders, no es torna a subscriure però usa el nou', async () => {
    const first = { onMessage: jest.fn(), onRevoked: jest.fn(), onError: jest.fn() };
    const second = { onMessage: jest.fn(), onRevoked: jest.fn(), onError: jest.fn() };
    const { rerender } = await renderHook(
      ({ current }: { current: typeof first }) => useChatSocket(ROOM, current),
      { initialProps: { current: first } },
    );
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);

    await rerender({ current: second });
    await flush();
    await serverSends({
      type: 'error',
      room: ROOM,
      id: subscribeFrame()?.id,
      payload: wsProblem(403, 'FORBIDDEN'),
    });

    expect(lastSocket().sentOfType('subscribe')).toHaveLength(1);
    expect(lastSocket().sentOfType('unsubscribe')).toHaveLength(0);
    expect(second.onError).toHaveBeenCalledTimes(1);
    expect(first.onError).not.toHaveBeenCalled();
  });
});

describe('useChatSocket: sendMessage idempotent (TG-654 F5)', () => {
  const ACK = { id: 'm-1', sent_at: '2026-11-18T20:00:00Z' };
  const KEY = '0198a1b2-c3d4-4e5f-8a6b-7c8d9e0f1a2b';

  it('sendMessage(text) genera la clau amb Crypto.randomUUID() i la posa al payload', async () => {
    jest.mocked(Crypto.randomUUID).mockReturnValue('11111111-2222-4333-8444-555555555555');
    const { result } = await mountChatConnected();

    await startSending(result.current.sendMessage, 'hola');

    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(lastSent()).toEqual({
      type: 'message',
      room: ROOM,
      payload: { text: 'hola', client_message_id: '11111111-2222-4333-8444-555555555555' },
      id: expect.any(String),
    });
  });

  it('cada missatge nou rep una clau nova', async () => {
    jest.mocked(Crypto.randomUUID).mockReturnValueOnce('uuid-a').mockReturnValueOnce('uuid-b');
    const { result } = await mountChatConnected();

    await startSending(result.current.sendMessage, 'un');
    await startSending(result.current.sendMessage, 'dos');

    const keys = lastSocket()
      .sentOfType('message')
      .map((frame) => (frame.payload as { client_message_id: string }).client_message_id);
    expect(keys).toEqual(['uuid-a', 'uuid-b']);
  });

  it('si es passa clientMessageId, el reutilitza i no en genera cap', async () => {
    const { result } = await mountChatConnected();
    const send = result.current.sendMessage as (text: string, key?: string) => Promise<unknown>;

    await startSending((text) => send(text, KEY), 'hola');

    expect(Crypto.randomUUID).not.toHaveBeenCalled();
    expect(lastSent()).toEqual({
      type: 'message',
      room: ROOM,
      payload: { text: 'hola', client_message_id: KEY },
      id: expect.any(String),
    });
  });

  it('un reintent manual amb la mateixa clau envia el mateix client_message_id i retorna {id, sent_at}', async () => {
    const { result } = await mountChatConnected();
    const send = result.current.sendMessage as (text: string, key?: string) => Promise<unknown>;
    await startSending((text) => send(text, KEY), 'hola');

    const second = await startSending((text) => send(text, KEY), 'hola');
    const frames = lastSocket().sentOfType('message');
    await serverSends({
      type: 'message',
      room: ROOM,
      id: frames[1]?.id,
      payload: { ...ACK, extra: 'ignored' },
    });

    expect(frames).toHaveLength(2);
    expect(frames[0]?.payload).toEqual(frames[1]?.payload);
    await expect(second.sending).resolves.toEqual(ACK);
  });
});

describe('useChatSocket: missatges duplicats (TG-654 F5)', () => {
  const message = (id: string) => ({ ...OTHERS_MESSAGE, id });
  const deliver = async (id: string) =>
    act(async () => lastSocket().serverSend({ type: 'message', room: ROOM, payload: message(id) }));

  it('descarta un missatge amb un id ja entregat a la mateixa sala (p. ex. la republicació d’un reintent)', async () => {
    await mountChatConnected();

    await deliver('m-1');
    await deliver('m-1');
    await deliver('m-2');

    expect(handlers.onMessage.mock.calls.map(([m]) => (m as { id: string }).id)).toEqual([
      'm-1',
      'm-2',
    ]);
  });

  it('el duplicat s’ignora també després d’una reconnexió', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    await mountChatConnected();
    await deliver('m-1');
    await act(async () => lastSocket().networkFailure());
    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);

    await deliver('m-1');

    expect(handlers.onMessage).toHaveBeenCalledTimes(1);
  });

  it('el mateix id en una altra sala no es descarta (el Set és per sala)', async () => {
    const other = { onMessage: jest.fn(), onRevoked: jest.fn(), onError: jest.fn() };
    await mountChatConnected();
    await renderHook(() => useChatSocket(OTHER_ROOM, other));
    await flush();
    await deliver('m-1');
    await act(async () =>
      lastSocket().serverSend({ type: 'message', room: OTHER_ROOM, payload: message('m-1') }),
    );

    expect(handlers.onMessage).toHaveBeenCalledTimes(1);
    expect(other.onMessage).toHaveBeenCalledTimes(1);
  });

  it('recorda només els últims 200 ids per sala: el 201è desplaça el més vell', async () => {
    await mountChatConnected();
    for (let n = 0; n <= 200; n += 1) await deliver(`m-${n}`); // m-0 ... m-200: 201 ids
    expect(handlers.onMessage).toHaveBeenCalledTimes(201);

    await deliver('m-1'); // still among the last 200
    await deliver('m-200');
    expect(handlers.onMessage).toHaveBeenCalledTimes(201);

    await deliver('m-0'); // the oldest was displaced: it is delivered again
    expect(handlers.onMessage).toHaveBeenCalledTimes(202);
    expect((handlers.onMessage.mock.calls[201]?.[0] as { id: string }).id).toBe('m-0');
  });
});

describe('useChatSocket: joining the room again (TG-469)', () => {
  it('a new join attempt leaves the room and joins it again, with the same handlers', async () => {
    const { rerender } = await renderHook(
      ({ attempt }: { attempt: number }) => useChatSocket(ROOM, handlers, attempt),
      { initialProps: { attempt: 0 } },
    );
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);

    await rerender({ attempt: 1 });
    await flush();

    expect(lastSocket().sentOfType('unsubscribe')).toEqual([
      { type: 'unsubscribe', room: ROOM, id: expect.any(String) },
    ]);
    expect(lastSocket().sentOfType('subscribe')).toEqual([
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
      { type: 'subscribe', room: ROOM, id: expect.any(String) },
    ]);
    await serverSends({ type: 'message', room: ROOM, payload: OTHERS_MESSAGE });
    expect(handlers.onMessage).toHaveBeenCalledWith(OTHERS_MESSAGE);
  });

  it('the same attempt does not join the room again', async () => {
    const { rerender } = await renderHook(
      ({ attempt }: { attempt: number }) => useChatSocket(ROOM, handlers, attempt),
      { initialProps: { attempt: 2 } },
    );
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);

    await rerender({ attempt: 2 });
    await flush();

    expect(lastSocket().sentOfType('subscribe')).toHaveLength(1);
    expect(lastSocket().sentOfType('unsubscribe')).toEqual([]);
  });
});

describe('useChatSocket: the room is joined (TG-469)', () => {
  /** The `id` of the last subscribe to ROOM, the one the server answers. */
  const subscribeId = () => lastSocket().sentOfType('subscribe').at(-1)?.id;

  it('calls onJoined when the server acknowledges the subscribe, and only then', async () => {
    const onJoined = jest.fn();
    await renderHook(() => useChatSocket(ROOM, { ...handlers, onJoined }));
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);
    expect(onJoined).not.toHaveBeenCalled();

    await serverSends({ type: 'subscribe', id: subscribeId(), room: ROOM });

    expect(onJoined).toHaveBeenCalledTimes(1);
  });

  it('does not call onJoined for a refused join, a message or a revocation', async () => {
    const onJoined = jest.fn();
    await renderHook(() => useChatSocket(ROOM, { ...handlers, onJoined }));
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);

    await serverSends({
      type: 'error',
      id: subscribeId(),
      room: ROOM,
      payload: wsProblem(429, 'RATE_LIMITED'),
    });
    await serverSends({ type: 'message', room: ROOM, payload: OTHERS_MESSAGE });
    await serverSends({ type: 'unsubscribe', room: ROOM });

    expect(onJoined).not.toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalledTimes(1);
  });

  it('calls onJoined again when the room is joined again after a reconnection', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const onJoined = jest.fn();
    await renderHook(() => useChatSocket(ROOM, { ...handlers, onJoined }));
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);
    await serverSends({ type: 'subscribe', id: subscribeId(), room: ROOM });

    await serverCloses(1006);
    await flush(1000);
    await serverOpens();
    await serverSends(AUTH_ACK);
    expect(onJoined).toHaveBeenCalledTimes(1);

    await serverSends({ type: 'subscribe', id: subscribeId(), room: ROOM });

    expect(onJoined).toHaveBeenCalledTimes(2);
  });

  it('onJoined is optional', async () => {
    await mountChatConnected();

    await expect(
      serverSends({ type: 'subscribe', id: subscribeId(), room: ROOM }),
    ).resolves.toBeUndefined();
  });

  describe('sala agnòstica (TG-65): la sala és un paràmetre, no un eventId', () => {
    const DM_ROOM = 'dm:user:u-1';

    it('se subscriu a la sala que rep, sigui quina sigui, i en lliura els missatges', async () => {
      await renderHook(() => useChatSocket(DM_ROOM, handlers));
      await flush();
      await serverOpens();
      await serverSends(AUTH_ACK);

      expect(lastSocket().sentOfType('subscribe')).toEqual([
        { type: 'subscribe', room: DM_ROOM, id: expect.any(String) },
      ]);

      await serverSends({ type: 'message', room: DM_ROOM, payload: OTHERS_MESSAGE });

      expect(handlers.onMessage).toHaveBeenCalledWith(OTHERS_MESSAGE);
    });

    it('sendMessage envia a la sala rebuda, amb el payload extra fusionat', async () => {
      const { result } = await renderHook(() => useChatSocket(DM_ROOM, handlers));
      await flush();
      await serverOpens();
      await serverSends(AUTH_ACK);

      await act(async () => {
        void result.current.sendMessage('Hola', 'cid-1', { conversation_id: 'c-1' });
      });
      await flush();

      expect(lastSent()).toEqual({
        type: 'message',
        room: DM_ROOM,
        id: expect.any(String),
        payload: { text: 'Hola', client_message_id: 'cid-1', conversation_id: 'c-1' },
      });
    });

    it('sense payload extra, el payload és només el text i la clau d’idempotència', async () => {
      const { result } = await renderHook(() => useChatSocket(DM_ROOM, handlers));
      await flush();
      await serverOpens();
      await serverSends(AUTH_ACK);

      await act(async () => {
        void result.current.sendMessage('Hola', 'cid-1');
      });
      await flush();

      expect(lastSent()).toEqual({
        type: 'message',
        room: DM_ROOM,
        id: expect.any(String),
        payload: { text: 'Hola', client_message_id: 'cid-1' },
      });
    });
  });
});
