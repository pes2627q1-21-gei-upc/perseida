import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppError } from '../../../shared/errors';
import { fetchMessages } from '../api/directChat';
import { useDirectMessages } from './useDirectChat';

jest.mock('../api/directChat', () => ({ fetchMessages: jest.fn() }));
const CONVERSATION = '01900000-0000-7000-8000-000000000003';
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
  jest.clearAllMocks();
});
afterEach(() => client.clear());
const error = (retryable: boolean) =>
  new AppError({ kind: 'network', code: 'NETWORK_ERROR', retryable });

describe('TG-65 criteria 9 and 14: history retry boundary', () => {
  it('retries a transient failure once and can recover', async () => {
    jest
      .mocked(fetchMessages)
      .mockRejectedValueOnce(error(true))
      .mockResolvedValue({ messages: [], next_cursor: null });
    const { result, unmount } = await renderHook(() => useDirectMessages(CONVERSATION), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMessages).toHaveBeenCalledTimes(2);
    await unmount();
  });
  it('stops after one retry when a transient failure persists', async () => {
    jest.mocked(fetchMessages).mockRejectedValue(error(true));
    const { result, unmount } = await renderHook(() => useDirectMessages(CONVERSATION), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMessages).toHaveBeenCalledTimes(2);
    await unmount();
  });
  it('never retries a permanent failure', async () => {
    jest.mocked(fetchMessages).mockRejectedValue(error(false));
    const { result, unmount } = await renderHook(() => useDirectMessages(CONVERSATION), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMessages).toHaveBeenCalledTimes(1);
    await unmount();
  });
});
