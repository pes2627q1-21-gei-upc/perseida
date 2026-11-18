import { act, renderHook } from '@testing-library/react-native';

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

const EVENT_ID = '7d1f0c2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';
const ROOM = `chat:event:${EVENT_ID}`;
const OTHER_EVENT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER_ROOM = `chat:event:${OTHER_EVENT_ID}`;
const AUTH_ACK: Frame = { type: 'auth', payload: {} };
const OTHERS_MESSAGE = {
  id: 'm-9',
  room_id: 'r-1',
  author_id: 'u-2',
  text: 'Es veu Júpiter!',
  sent_at: '2026-11-18T21:00:00Z',
};

let restoreWebSocket: () => void;
let handlers: { onMessage: jest.Mock; onRevoked: jest.Mock };

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

/** Mounts useChatSocket for EVENT_ID and completes the handshake: open + auth ack. */
async function mountChatConnected() {
  const hook = await renderHook(() => useChatSocket(EVENT_ID, handlers));
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
  handlers = { onMessage: jest.fn(), onRevoked: jest.fn() };
  jest.mocked(socketAuth.getToken).mockReset().mockResolvedValue('access-1');
  jest.mocked(socketAuth.refresh).mockReset().mockResolvedValue(undefined);
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
      payload: { text: 'hola' },
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

  it.each([
    [429, 'RATE_LIMITED', true],
    [422, 'CHAT_MESSAGE_REJECTED', false],
    [503, 'PUBSUB_UNAVAILABLE', true],
  ])(
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
    const { result } = await renderHook(() => useChatSocket(EVENT_ID, handlers));
    await flush();

    expect(result.current.status).toBe('connecting');

    await serverOpens();
    await serverSends(AUTH_ACK);

    expect(result.current.status).toBe('open');
    expect(result.current.error).toBeNull();
  });

  it('exposa reconnect, que torna a obrir la connexió quan ha quedat closed', async () => {
    const { result } = await renderHook(() => useChatSocket(EVENT_ID, handlers));
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

  it('si canvia eventId, es dessubscriu de la sala vella i se subscriu a la nova', async () => {
    const { rerender } = await renderHook(
      ({ eventId }: { eventId: string }) => useChatSocket(eventId, handlers),
      { initialProps: { eventId: EVENT_ID } },
    );
    await flush();
    await serverOpens();
    await serverSends(AUTH_ACK);

    await rerender({ eventId: OTHER_EVENT_ID });
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
      ({ current }: { current: typeof first }) => useChatSocket(EVENT_ID, current),
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
});
