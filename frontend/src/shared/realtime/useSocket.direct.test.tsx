import { act, renderHook } from '@testing-library/react-native';

import { installFakeWebSocket, lastSocket } from '../../../__mocks__/fakeWebSocket';
import { _resetSocketForTests } from './socketClient';
import { useSocket } from './useSocket';

const auth = { getToken: jest.fn(async () => 'test-token'), refresh: jest.fn(async () => {}) };
const message = {
  id: '01900000-0000-7000-8000-000000000004',
  conversation_id: '01900000-0000-7000-8000-000000000003',
  sender_id: '01900000-0000-7000-8000-000000000002',
  text: 'Hola',
  sent_at: '2026-11-22T12:00:00Z',
};
const typing = { conversation_id: message.conversation_id, is_typing: true };
let restoreWebSocket: () => void;

beforeEach(() => {
  jest.useFakeTimers();
  restoreWebSocket = installFakeWebSocket();
  _resetSocketForTests();
});
afterEach(() => {
  _resetSocketForTests();
  restoreWebSocket();
  jest.useRealTimers();
});

async function connected() {
  const hook = await renderHook(() => useSocket(auth));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    lastSocket().serverOpen();
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    lastSocket().serverSend({ type: 'auth', payload: {} });
  });
  return hook;
}

describe('roomless direct chat frames (TG-65 criterion 5)', () => {
  it.each([
    ['dm.message', message],
    ['dm.typing', typing],
  ])('delivers a %s event without sending a room subscribe', async (type, payload) => {
    const { result } = await connected();
    const listener = jest.fn();
    const unsubscribe = result.current.subscribePrivate(listener);
    await act(async () => {
      lastSocket().serverSend({ type, payload });
    });
    expect(listener).toHaveBeenCalledWith({ type, payload });
    expect(lastSocket().sentOfType('subscribe')).toHaveLength(0);
    unsubscribe();
  });

  it('delivers private events to each active listener and stops after unsubscribe', async () => {
    const { result } = await connected();
    const first = jest.fn();
    const second = jest.fn();
    const stopFirst = result.current.subscribePrivate(first);
    const stopSecond = result.current.subscribePrivate(second);
    await act(async () => {
      lastSocket().serverSend({ type: 'dm.message', payload: message });
    });
    stopFirst();
    await act(async () => {
      lastSocket().serverSend({ type: 'dm.typing', payload: typing });
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    stopSecond();
  });

  it('does not treat a send acknowledgement as a new private message', async () => {
    const { result } = await connected();
    const listener = jest.fn();
    const stop = result.current.subscribePrivate(listener);
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.send({
        type: 'dm.send',
        payload: {
          conversation_id: message.conversation_id,
          text: message.text,
          client_message_id: 'client-id',
        },
      });
    });
    const sent = lastSocket().sentOfType('dm.send')[0];
    await act(async () => {
      lastSocket().serverSend({
        type: 'dm.send',
        id: sent?.id,
        payload: { id: message.id, sent_at: message.sent_at },
      });
    });
    await expect(pending).resolves.toMatchObject({
      payload: { id: message.id, sent_at: message.sent_at },
    });
    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('does not deliver unrelated roomless frames to private listeners', async () => {
    const { result } = await connected();
    const listener = jest.fn();
    const stop = result.current.subscribePrivate(listener);
    await act(async () => {
      lastSocket().serverSend({ type: 'unknown', payload: {} });
    });
    expect(listener).not.toHaveBeenCalled();
    stop();
  });
});
