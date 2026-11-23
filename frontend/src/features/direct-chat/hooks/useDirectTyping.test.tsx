import { act, renderHook } from '@testing-library/react-native';

import type { ServerFrame } from '../../../shared/realtime';
import { useDirectTyping } from './useDirectTyping';

const mockSendEphemeral = jest.fn();
let mockListener: ((frame: ServerFrame) => void) | undefined;
const mockUnsubscribe = jest.fn();

jest.mock('../../../shared/realtime', () => ({
  useSocket: () => ({
    subscribePrivate: (handler: (frame: ServerFrame) => void) => {
      mockListener = handler;
      return mockUnsubscribe;
    },
    sendEphemeral: mockSendEphemeral,
    status: 'open',
  }),
}));
jest.mock('../../auth/socketAuth', () => ({ socketAuth: {} }));

const CONVERSATION = '01900000-0000-7000-8000-000000000003';
const OTHER = '01900000-0000-7000-8000-000000000004';

beforeEach(() => {
  jest.useFakeTimers();
  mockListener = undefined;
  mockSendEphemeral.mockReset();
  mockUnsubscribe.mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function receive(conversationId: string, isTyping: boolean) {
  await act(async () =>
    mockListener?.({
      type: 'dm.typing',
      payload: { conversation_id: conversationId, is_typing: isTyping },
    }),
  );
}

describe('useDirectTyping (TG-65)', () => {
  it('sends the current conversation typing state', async () => {
    const { result } = await renderHook(() => useDirectTyping(CONVERSATION));
    await act(async () => result.current.setTyping(true));
    expect(mockSendEphemeral).toHaveBeenCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: CONVERSATION, is_typing: true },
    });
    await act(async () => result.current.setTyping(false));
    expect(mockSendEphemeral).toHaveBeenLastCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: CONVERSATION, is_typing: false },
    });
  });

  it('limits typing updates to one every four seconds and stops immediately', async () => {
    const { result } = await renderHook(() => useDirectTyping(CONVERSATION));
    await act(async () => result.current.setTyping(true));
    await act(async () => {
      jest.advanceTimersByTime(3999);
      result.current.setTyping(true);
    });
    expect(mockSendEphemeral).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(1);
      result.current.setTyping(true);
    });
    expect(mockSendEphemeral).toHaveBeenCalledTimes(2);
    await act(async () => result.current.setTyping(false));
    expect(mockSendEphemeral).toHaveBeenLastCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: CONVERSATION, is_typing: false },
    });
    await act(async () => result.current.setTyping(true));
    expect(mockSendEphemeral).toHaveBeenCalledTimes(4);
  });

  it('sends false after five seconds without activity', async () => {
    const { result } = await renderHook(() => useDirectTyping(CONVERSATION));
    await act(async () => result.current.setTyping(true));
    await act(async () => { jest.advanceTimersByTime(4999); });
    expect(mockSendEphemeral).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(mockSendEphemeral).toHaveBeenLastCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: CONVERSATION, is_typing: false },
    });
  });

  it('shows typing only for this conversation and clears immediately on false', async () => {
    const { result } = await renderHook(() => useDirectTyping(CONVERSATION));
    await receive(OTHER, true);
    expect(result.current.isTyping).toBe(false);
    await receive(CONVERSATION, true);
    expect(result.current.isTyping).toBe(true);
    await receive(CONVERSATION, false);
    expect(result.current.isTyping).toBe(false);
  });

  it('expires typing five seconds after the latest true event', async () => {
    const { result } = await renderHook(() => useDirectTyping(CONVERSATION));
    await receive(CONVERSATION, true);
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    await receive(CONVERSATION, true);
    await act(async () => {
      jest.advanceTimersByTime(4999);
    });
    expect(result.current.isTyping).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.isTyping).toBe(false);
  });

  it('ignores message and malformed typing events', async () => {
    const { result } = await renderHook(() => useDirectTyping(CONVERSATION));
    await act(async () =>
      mockListener?.({ type: 'dm.message', payload: { conversation_id: CONVERSATION } }),
    );
    await act(async () =>
      mockListener?.({
        type: 'dm.typing',
        payload: { conversation_id: CONVERSATION, is_typing: 'true' },
      }),
    );
    expect(result.current.isTyping).toBe(false);
  });

  it('clears state on switching conversations and unsubscribes on unmount', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const { result, rerender, unmount } = await renderHook(
      ({ conversationId }: { conversationId: string }) => useDirectTyping(conversationId),
      { initialProps: { conversationId: CONVERSATION } },
    );
    await receive(CONVERSATION, true);
    expect(result.current.isTyping).toBe(true);
    await rerender({ conversationId: OTHER });
    expect(result.current.isTyping).toBe(false);
    setTimeoutSpy.mockClear();
    await receive(OTHER, true);
    const timerIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === 5000);
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    const typingTimer = setTimeoutSpy.mock.results[timerIndex]?.value;
    expect(typingTimer).toBeDefined();
    await unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(typingTimer);
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });
});
