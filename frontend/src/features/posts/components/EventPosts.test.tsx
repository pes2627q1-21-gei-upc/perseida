import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { EVENT_ID, makePost } from '../../../../__mocks__/posts';
import { saveTokens } from '../../auth/tokenStorage';
import { EventPosts } from './EventPosts';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

/** Same id as the author of `makePost`: those posts are the ones of the session. */
const ME = {
  id: '01a1bd9a-0000-7000-8000-0000000000aa',
  email: 'ana@example.com',
  display_name: 'Ana',
  avatar_url: null,
  preferred_language: 'ca',
  role: 'user',
};
const OTHER = { id: '01a1bd9a-0000-7000-8000-0000000000bb', name: 'Bru' };
const POSTS_PATH = `/api/events/${EVENT_ID}/posts`;

let client: QueryClient;

interface Call {
  method: string;
  url: URL;
  body: unknown;
}

/** `/api/users/me` answers with ME; every other request goes to `posts`. */
function mockApi(posts: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const text = await request.text();
    const call = {
      method: request.method,
      url: new URL(request.url),
      body: text ? JSON.parse(text) : undefined,
    };
    if (call.url.pathname === '/api/users/me') return jsonResponse(ME);
    calls.push(call);
    return posts(call);
  });
  return calls;
}

async function renderPosts() {
  return render(
    <QueryClientProvider client={client}>
      <EventPosts eventId={EVENT_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('EventPosts', () => {
  it('has a heading and the form to publish (TG-628 criterion 7)', async () => {
    mockApi(() => jsonResponse({ items: [], next_cursor: null }));
    await renderPosts();

    expect(screen.getByRole('header', { name: 'Publicacions' })).toBeTruthy();
    expect(screen.getByLabelText('La teva publicació')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publica' })).toBeTruthy();
  });

  it('shows a loading state while the posts arrive', async () => {
    mockApi(() => new Promise<Response>(() => undefined));
    await renderPosts();

    expect(screen.getByLabelText('Carregant les publicacions')).toBeTruthy();
  });

  it('says so when the event has no posts yet', async () => {
    mockApi(() => jsonResponse({ items: [], next_cursor: null }));
    await renderPosts();

    expect(
      await screen.findByText('Encara no hi ha publicacions. Comparteix la primera!'),
    ).toBeTruthy();
  });

  it('lists the posts and offers edit and delete only on the own ones (criteria 2 to 4)', async () => {
    mockApi(() =>
      jsonResponse({
        items: [makePost(2, { author: OTHER, text: 'De Bru' }), makePost(1)],
        next_cursor: null,
      }),
    );
    await renderPosts();

    expect(await screen.findByText('De Bru')).toBeTruthy();
    expect(screen.getByText('Publicació 1')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Edita' })).toHaveLength(1));
    expect(screen.getAllByRole('button', { name: 'Esborra' })).toHaveLength(1);
  });

  it('shows a transient error with a retry that loads the posts again', async () => {
    let fail = true;
    const calls = mockApi(() =>
      fail
        ? problemResponse(503, 'INTERNAL_ERROR')
        : jsonResponse({ items: [makePost(1)], next_cursor: null }),
    );
    await renderPosts();

    expect(await screen.findByRole('alert')).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));

    expect(await screen.findByText('Publicació 1')).toBeTruthy();
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it('shows a final error with its message and no retry', async () => {
    mockApi(() => problemResponse(404, 'EVENT_NOT_FOUND'));
    await renderPosts();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Aquest esdeveniment ja no existeix.',
    );
    expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).toBeNull();
  });

  it('loads the next page with the cursor (criterion 2)', async () => {
    const calls = mockApi(({ url }) =>
      url.searchParams.get('cursor') === 'c1'
        ? jsonResponse({ items: [makePost(1)], next_cursor: null })
        : jsonResponse({ items: [makePost(2)], next_cursor: 'c1' }),
    );
    await renderPosts();

    await fireEvent.press(await screen.findByRole('button', { name: "Carrega'n més" }));

    expect(await screen.findByText('Publicació 1')).toBeTruthy();
    expect(screen.getByText('Publicació 2')).toBeTruthy();
    expect(calls[1]?.url.searchParams.get('cursor')).toBe('c1');
    await waitFor(() => expect(screen.queryByRole('button', { name: "Carrega'n més" })).toBeNull());
  });

  it('publishes a post and shows it in the list (criterion 1)', async () => {
    const created = makePost(3, { text: 'Es veu Júpiter' });
    let items: unknown[] = [];
    const calls = mockApi(({ method }) => {
      if (method === 'POST') {
        items = [created];
        return jsonResponse(created, 201);
      }
      return jsonResponse({ items, next_cursor: null });
    });
    await renderPosts();

    await fireEvent.changeText(screen.getByLabelText('La teva publicació'), 'Es veu Júpiter');
    await fireEvent.press(screen.getByRole('button', { name: 'Publica' }));

    const list = await screen.findByTestId('event-posts-list');
    expect(await within(list).findByText('Es veu Júpiter')).toBeTruthy();
    expect(calls.find((call) => call.method === 'POST')?.url.pathname).toBe(POSTS_PATH);
  });
});
