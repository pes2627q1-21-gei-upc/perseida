import { act, renderHook } from '@testing-library/react-native';

import { installFakeWebSocket, lastSocket } from '../../../__mocks__/fakeWebSocket';
import { _resetSocketForTests } from './socketClient';
import { useSocket } from './useSocket';

const auth = { getToken: jest.fn(async () => 'test-token'), refresh: jest.fn(async () => {}) };
const payload = { conversation_id: '01900000-0000-7000-8000-000000000003', is_typing: true };
let restore: () => void;

beforeEach(() => {
  jest.useFakeTimers();
  restore = installFakeWebSocket();
  _resetSocketForTests();
});
afterEach(() => {
  _resetSocketForTests();
  restore();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function openSocket() {
  await act(async () => {
    lastSocket().serverOpen();
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    lastSocket().serverSend({ type: 'auth', payload: {} });
  });
}

describe('ephemeral typing transport (TG-65)', () => {
  it('sends the typing frame without a request id or room after authentication', async () => {
    const { result } = await renderHook(() => useSocket(auth));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await openSocket();
    await act(async () => result.current.sendEphemeral({ type: 'dm.typing', payload }));
    expect(lastSocket().sentOfType('dm.typing')).toEqual([{ type: 'dm.typing', payload }]);
  });

  it('does not queue typing before authentication', async () => {
    const { result } = await renderHook(() => useSocket(auth));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await act(async () => result.current.sendEphemeral({ type: 'dm.typing', payload }));
    await openSocket();
    expect(lastSocket().sentOfType('dm.typing')).toEqual([]);
  });

  it('does not replay typing after a disconnect and reconnection', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { result } = await renderHook(() => useSocket(auth));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await openSocket();
    await act(async () => result.current.sendEphemeral({ type: 'dm.typing', payload }));
    await act(async () => {
      lastSocket().networkFailure();
    });
    await act(async () => result.current.sendEphemeral({ type: 'dm.typing', payload }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    await openSocket();
    expect(lastSocket().sentOfType('dm.typing')).toEqual([]);
  });
});
