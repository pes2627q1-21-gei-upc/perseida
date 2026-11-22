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
  jest.clearAllTimers();
  jest.useRealTimers();
});

function receive(conversationId: string, isTyping: boolean) {
  act(() =>
    mockListener?.({
      type: 'dm.typing',
      payload: { conversation_id: conversationId, is_typing: isTyping },
    }),
  );
}

describe('useDirectTyping (TG-65)', () => {
  it('sends the current conversation typing state', async () => {
    const { result } = await renderHook(() => useDirectTyping(CONVERSATION));
    act(() => result.current.setTyping(true));
    expect(mockSendEphemeral).toHaveBeenCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: CONVERSATION, is_typing: true },
    });
    act(() => result.current.setTyping(false));
    expect(mockSendEphemeral).toHaveBeenLastCalledWith({
      type: 'dm.typing',
      payload: { conversation_id: CONVERSATION, is_typing: false },
    });
  });

  it('shows typing only for this conversation and clears immediately on false', async () => {
    const { result } = await renderHook(() => useDirectTyping(CONVERSATION));
    receive(OTHER, true);
    expect(result.current.isTyping).toBe(false);
    receive(CONVERSATION, true);
    expect(result.current.isTyping).toBe(true);
    receive(CONVERSATION, false);
    expect(result.current.isTyping).toBe(false);
  });

  it('expires typing five seconds after the latest true event', async () => {
    const { result } = await renderHook(() => useDirectTyping(CONVERSATION));
    receive(CONVERSATION, true);
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    receive(CONVERSATION, true);
    act(() => {
      jest.advanceTimersByTime(4999);
    });
    expect(result.current.isTyping).toBe(true);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.isTyping).toBe(false);
  });

  it('ignores message and malformed typing events', async () => {
    const { result } = await renderHook(() => useDirectTyping(CONVERSATION));
    act(() => mockListener?.({ type: 'dm.message', payload: { conversation_id: CONVERSATION } }));
    act(() =>
      mockListener?.({
        type: 'dm.typing',
        payload: { conversation_id: CONVERSATION, is_typing: 'true' },
      }),
    );
    expect(result.current.isTyping).toBe(false);
  });

  it('clears state on switching conversations and unsubscribes on unmount', async () => {
    const { result, rerender, unmount } = await renderHook(
      ({ conversationId }: { conversationId: string }) => useDirectTyping(conversationId),
      { initialProps: { conversationId: CONVERSATION } },
    );
    receive(CONVERSATION, true);
    expect(result.current.isTyping).toBe(true);
    await rerender({ conversationId: OTHER });
    expect(result.current.isTyping).toBe(false);
    await unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
