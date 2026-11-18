import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { myOuting, otherOuting } from '../../../../__mocks__/outings';
import {
  outingKeys,
  useCreateOuting,
  useDeleteOuting,
  useOuting,
  useOutings,
  useUpdateOuting,
} from './useOutings';

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

function mockFetch(response: () => Response) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
}

const draft = {
  title: 'Perseides',
  description: '',
  starts_at: '2099-08-12T20:00:00Z',
  ends_at: '2099-08-13T02:00:00Z',
  location: { latitude: 42.05, longitude: 0.73 },
};

describe('outingKeys', () => {
  it('keeps every key of the outings under the same root', () => {
    expect(outingKeys.all).toEqual(['outings']);
    expect(outingKeys.list({ mine: true })).toEqual(['outings', 'list', { mine: true }]);
    expect(outingKeys.detail('a')).toEqual(['outings', 'detail', 'a']);
  });
});

describe('useOutings', () => {
  it('loads the outings of the filter', async () => {
    mockFetch(() => jsonResponse([myOuting, otherOuting]));

    const { result } = await renderHook(() => useOutings({ mine: true }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([myOuting, otherOuting]);
  });

  it('exposes the AppError of a failure and does not retry a final one', async () => {
    const spy = mockFetch(() => problemResponse(404, 'OUTING_NOT_FOUND'));

    const { result } = await renderHook(() => useOutings({}), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'OUTING_NOT_FOUND' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries once a transient failure', async () => {
    const spy = mockFetch(() => problemResponse(503, 'EXTERNAL_UNAVAILABLE'));

    const { result } = await renderHook(() => useOutings({}), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('useOuting', () => {
  it('loads one outing', async () => {
    mockFetch(() => jsonResponse(myOuting));

    const { result } = await renderHook(() => useOuting(myOuting.id), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(myOuting);
  });
});

describe('mutations refresh the outings', () => {
  const listKey = outingKeys.list({ mine: true });
  const detailKey = outingKeys.detail(myOuting.id);

  beforeEach(() => {
    client.setQueryData(listKey, [myOuting]);
    client.setQueryData(detailKey, myOuting);
  });

  it('creating one invalidates the lists', async () => {
    mockFetch(() => jsonResponse(myOuting, 201));
    const { result } = await renderHook(() => useCreateOuting(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(draft);
    });

    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('editing one invalidates the lists and the detail', async () => {
    mockFetch(() => jsonResponse(myOuting));
    const { result } = await renderHook(() => useUpdateOuting(myOuting.id), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: 'Nou' });
    });

    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('deleting one invalidates the lists', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    const { result } = await renderHook(() => useDeleteOuting(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(myOuting.id);
    });

    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('invalidates nothing when the call fails', async () => {
    mockFetch(() => problemResponse(403, 'OUTING_FORBIDDEN'));
    const { result } = await renderHook(() => useDeleteOuting(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(myOuting.id).catch(() => undefined);
    });

    expect(client.getQueryState(listKey)?.isInvalidated).toBe(false);
  });
});
