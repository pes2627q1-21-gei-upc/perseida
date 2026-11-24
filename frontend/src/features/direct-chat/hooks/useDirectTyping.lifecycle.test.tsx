import { act, cleanup, renderHook } from '@testing-library/react-native';

import type { ServerFrame } from '../../../shared/realtime';
import { useDirectTyping } from './useDirectTyping';

let mockStatus = 'open';
const mockSend = jest.fn();
let mockListener: ((frame: ServerFrame) => void) | undefined;
jest.mock('../../../shared/realtime', () => ({
  useSocket: () => ({
    status: mockStatus,
    sendEphemeral: mockSend,
    subscribePrivate: (listener: (frame: ServerFrame) => void) => {
      mockListener = listener;
      return () => {
        mockListener = undefined;
      };
    },
  }),
}));
jest.mock('../../auth/socketAuth', () => ({ socketAuth: {} }));

const A = '01900000-0000-7000-8000-000000000001';
const B = '01900000-0000-7000-8000-000000000002';

beforeEach(() => {
  jest.useFakeTimers();
  mockStatus = 'open';
  mockSend.mockReset();
  mockListener = undefined;
});
afterEach(async () => {
  await cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function typing(conversationId: string) {
  await act(async () => {
    mockListener?.({
      type: 'dm.typing',
      payload: { conversation_id: conversationId, is_typing: true },
    });
  });
}

describe('typing lifecycle (TG-65)', () => {
  it('does not restore a previous typing indication after leaving and returning', async () => {
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useDirectTyping(id), {
      initialProps: { id: A },
    });
    await typing(A);
    expect(result.current.isTyping).toBe(true);
    await rerender({ id: B });
    expect(result.current.isTyping).toBe(false);
    await rerender({ id: A });
    expect(result.current.isTyping).toBe(false);
  });

  it('does not restore a typing indication when the connection reconnects', async () => {
    const { result, rerender } = await renderHook(() => useDirectTyping(A));
    await typing(A);
    expect(result.current.isTyping).toBe(true);
    mockStatus = 'reconnecting';
    await rerender(undefined);
    expect(result.current.isTyping).toBe(false);
    mockStatus = 'open';
    await rerender(undefined);
    expect(result.current.isTyping).toBe(false);
    await typing(A);
    expect(result.current.isTyping).toBe(true);
  });
});

describe('typing output lifecycle (TG-65)', () => {
  it('does not send typing while the connection is reconnecting', async () => {
    mockStatus = 'reconnecting';
    const { result } = await renderHook(() => useDirectTyping(A));
    await act(async () => result.current.setTyping(true));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does not send a stop signal before typing starts or repeat a stop', async () => {
    const { result } = await renderHook(() => useDirectTyping(A));
    await act(async () => result.current.setTyping(false));
    expect(mockSend).not.toHaveBeenCalled();
    await act(async () => {
      result.current.setTyping(true);
      result.current.setTyping(false);
      result.current.setTyping(false);
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenLastCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: A, is_typing: false },
    });
  });

  it('extends the idle deadline after every keystroke without spamming true', async () => {
    const { result } = await renderHook(() => useDirectTyping(A));
    await act(async () => result.current.setTyping(true));
    await act(async () => {
      jest.advanceTimersByTime(3000);
      result.current.setTyping(true);
    });
    await act(async () => jest.advanceTimersByTime(2000));
    expect(mockSend).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(3000));
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenLastCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: A, is_typing: false },
    });
  });

  it('stops the previous conversation when switching and uses the new ID afterwards', async () => {
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useDirectTyping(id), {
      initialProps: { id: A },
    });
    await act(async () => result.current.setTyping(true));
    await rerender({ id: B });
    expect(mockSend).toHaveBeenLastCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: A, is_typing: false },
    });
    await act(async () => result.current.setTyping(true));
    expect(mockSend).toHaveBeenLastCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: B, is_typing: true },
    });
  });

  it('stops on unmount and cancels its pending idle timer', async () => {
    const { result, unmount } = await renderHook(() => useDirectTyping(A));
    await act(async () => result.current.setTyping(true));
    await unmount();
    expect(mockSend).toHaveBeenLastCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: A, is_typing: false },
    });
    await act(async () => jest.advanceTimersByTime(5000));
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('does not send a stop signal on unmount if typing never started', async () => {
    const { unmount } = await renderHook(() => useDirectTyping(A));

    await unmount();

    expect(mockSend).not.toHaveBeenCalled();
  });
});
