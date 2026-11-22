import { act, cleanup, renderHook } from '@testing-library/react-native';

import type { ServerFrame } from '../../../shared/realtime';
import { useDirectTyping } from './useDirectTyping';

let mockStatus = 'open';
let mockListener: ((frame: ServerFrame) => void) | undefined;
jest.mock('../../../shared/realtime', () => ({
  useSocket: () => ({
    status: mockStatus,
    sendEphemeral: jest.fn(),
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
