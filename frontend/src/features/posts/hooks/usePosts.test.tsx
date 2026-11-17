import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { EVENT_ID, makePost } from '../../../../__mocks__/posts';
import { AppError } from '../../../shared/errors';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { postKeys, useCreatePost, useDeletePost, useEventPosts, useUpdatePost } from './usePosts';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

const POST_ID = makePost(1).id;
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

interface Call {
  method: string;
  url: URL;
  auth: string | null;
  body: unknown;
}

/** Records every request and answers with `respond`. */
function mockFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const text = await request.text();
    const call = {
      method: request.method,
      url: new URL(request.url),
      auth: request.headers.get('authorization'),
      body: text ? JSON.parse(text) : undefined,
    };
    calls.push(call);
    return respond(call);
  });
  return calls;
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('postKeys', () => {
  it('centralises the query keys of the posts feature', () => {
    expect(postKeys.list(EVENT_ID)).toEqual(['posts', 'list', EVENT_ID]);
  });
});

describe('useEventPosts', () => {
  it('lists the posts of the event with the session token (TG-628 criteria 2 and 5)', async () => {
    const calls = mockFetch(() => jsonResponse({ items: [makePost(1)], next_cursor: null }));

    const { result } = await renderHook(() => useEventPosts(EVENT_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.items).toEqual([makePost(1)]);
    expect(result.current.hasNextPage).toBe(false);
    expect(calls[0]?.url.pathname).toBe(`/api/events/${EVENT_ID}/posts`);
    expect(calls[0]?.url.searchParams.has('cursor')).toBe(false);
    expect(calls[0]?.auth).toBe('Bearer access-1');
  });

  it('asks for the next page with the cursor of the previous one (TG-628 criterion 2)', async () => {
    const calls = mockFetch(({ url }) =>
      url.searchParams.get('cursor') === 'c1'
        ? jsonResponse({ items: [makePost(1)], next_cursor: null })
        : jsonResponse({ items: [makePost(2)], next_cursor: 'c1' }),
    );

    const { result } = await renderHook(() => useEventPosts(EVENT_ID), { wrapper });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages.flatMap((page) => page.items)).toEqual([
      makePost(2),
      makePost(1),
    ]);
    expect(calls[1]?.url.searchParams.get('cursor')).toBe('c1');
    expect(result.current.hasNextPage).toBe(false);
  });

  it('returns the problem+json as an AppError and does not retry a final error', async () => {
    const calls = mockFetch(() => problemResponse(404, 'EVENT_NOT_FOUND'));

    const { result } = await renderHook(() => useEventPosts(EVENT_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error?.code).toBe('EVENT_NOT_FOUND');
    expect(calls).toHaveLength(1);
  });

  it('fails with INVALID_SESSION without calling the API when there is no session (criterion 5)', async () => {
    await clearTokens();
    const calls = mockFetch(() => jsonResponse({ items: [], next_cursor: null }));

    const { result } = await renderHook(() => useEventPosts(EVENT_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('INVALID_SESSION');
    expect(calls).toHaveLength(0);
  });

  it('retries a transient error once', async () => {
    const calls = mockFetch(() => problemResponse(503, 'INTERNAL_ERROR'));

    const { result } = await renderHook(() => useEventPosts(EVENT_ID), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls).toHaveLength(2);
  });
});

describe('post mutations', () => {
  it('creates a post and refreshes the list of the event (TG-628 criterion 1)', async () => {
    const created = makePost(3, { text: 'Es veu Júpiter' });
    const calls = mockFetch(({ method }) =>
      method === 'POST'
        ? jsonResponse(created, 201)
        : jsonResponse({ items: [created], next_cursor: null }),
    );
    const list = await renderHook(() => useEventPosts(EVENT_ID), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

    const { result } = await renderHook(() => useCreatePost(EVENT_ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('Es veu Júpiter');
    });

    const post = calls.find((call) => call.method === 'POST');
    expect(post?.url.pathname).toBe(`/api/events/${EVENT_ID}/posts`);
    expect(post?.body).toEqual({ text: 'Es veu Júpiter' });
    expect(post?.auth).toBe('Bearer access-1');
    expect(result.current.data).toEqual(created);
    await waitFor(() => expect(calls.filter((call) => call.method === 'GET')).toHaveLength(2));
  });

  it('edits a post with PATCH and refreshes the list (TG-628 criterion 3)', async () => {
    const edited = makePost(1, { text: 'Corregit', edited_at: '2026-11-17T11:00:00Z' });
    const calls = mockFetch(() => jsonResponse(edited));
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = await renderHook(() => useUpdatePost(EVENT_ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ postId: POST_ID, text: 'Corregit' });
    });

    expect(calls[0]?.method).toBe('PATCH');
    expect(calls[0]?.url.pathname).toBe(`/api/posts/${POST_ID}`);
    expect(calls[0]?.body).toEqual({ text: 'Corregit' });
    expect(calls[0]?.auth).toBe('Bearer access-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: postKeys.list(EVENT_ID) });
  });

  it('deletes a post with DELETE and refreshes the list (TG-628 criterion 4)', async () => {
    const calls = mockFetch(() => new Response(null, { status: 204 }));
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = await renderHook(() => useDeletePost(EVENT_ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(POST_ID);
    });

    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url.pathname).toBe(`/api/posts/${POST_ID}`);
    expect(calls[0]?.auth).toBe('Bearer access-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: postKeys.list(EVENT_ID) });
  });

  it('rejects with the AppError of the server and keeps the list as it was (403)', async () => {
    mockFetch(() => problemResponse(403, 'POST_FORBIDDEN'));
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    const { result } = await renderHook(() => useDeletePost(EVENT_ID), { wrapper });
    let error: unknown;
    await act(async () => {
      error = await result.current.mutateAsync(POST_ID).catch((e: unknown) => e);
    });

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('POST_FORBIDDEN');
    expect(invalidate).not.toHaveBeenCalled();
  });
});
