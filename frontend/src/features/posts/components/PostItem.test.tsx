import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { EVENT_ID, makePost } from '../../../../__mocks__/posts';
import i18n from '../../../shared/i18n';
import { saveTokens } from '../../auth/tokenStorage';
import { formatEventDateTime } from '../../events/formatEvent';
import type { Post } from '../api/posts';
import { PostItem } from './PostItem';

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

let client: QueryClient;

interface Call {
  method: string;
  pathname: string;
  body: unknown;
}

function mockFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const text = await request.text();
    const call = {
      method: request.method,
      pathname: new URL(request.url).pathname,
      body: text ? JSON.parse(text) : undefined,
    };
    calls.push(call);
    return respond(call);
  });
  return calls;
}

async function renderItem(post: Post, own: boolean) {
  return render(
    <QueryClientProvider client={client}>
      <PostItem eventId={EVENT_ID} post={post} own={own} />
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

describe('PostItem', () => {
  it('shows the author, the date and the text (TG-628 criterion 2)', async () => {
    const post = makePost(1);
    await renderItem(post, false);

    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText(formatEventDateTime(post.created_at, i18n.language))).toBeTruthy();
    expect(screen.getByText('Publicació 1')).toBeTruthy();
    expect(screen.queryByText('editada')).toBeNull();
  });

  it('names an author without a profile name with a generic name and a short tag', async () => {
    const author = { id: '01a1bd9a-0000-7000-8000-00000000c0de', name: null };
    await renderItem(makePost(1, { author }), false);

    expect(screen.getByText('Usuari/a #00c0de')).toBeTruthy();
  });

  it('says when the post was edited', async () => {
    await renderItem(makePost(1, { edited_at: '2026-11-17T11:00:00Z' }), false);

    expect(screen.getByText('editada')).toBeTruthy();
  });

  it('shows markup and addresses as plain text, never as a link (criterion 6, ADR-0024)', async () => {
    const text = '<b>Hola</b> https://example.com';
    await renderItem(makePost(1, { text }), false);

    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('offers no edit or delete on the posts of other people', async () => {
    await renderItem(makePost(1), false);

    expect(screen.queryByRole('button', { name: 'Edita' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Esborra' })).toBeNull();
  });

  it('edits an own post inline and goes back to the text after saving (criterion 3)', async () => {
    const calls = mockFetch(() => jsonResponse(makePost(1, { text: 'Corregit' })));
    await renderItem(makePost(1), true);

    await fireEvent.press(screen.getByRole('button', { name: 'Edita' }));
    const field = screen.getByLabelText('La teva publicació');
    expect(field.props.value).toBe('Publicació 1');
    await fireEvent.changeText(field, 'Corregit');
    await fireEvent.press(screen.getByRole('button', { name: 'Desa' }));

    await waitFor(() => expect(screen.queryByLabelText('La teva publicació')).toBeNull());
    expect(calls[0]).toMatchObject({
      method: 'PATCH',
      pathname: `/api/posts/${makePost(1).id}`,
      body: { text: 'Corregit' },
    });
  });

  it('leaves the edit without saving on cancel', async () => {
    const calls = mockFetch(() => jsonResponse(makePost(1)));
    await renderItem(makePost(1), true);

    await fireEvent.press(screen.getByRole('button', { name: 'Edita' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel·la' }));

    expect(screen.queryByLabelText('La teva publicació')).toBeNull();
    expect(screen.getByText('Publicació 1')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('asks for confirmation before deleting and does nothing on cancel (criterion 4)', async () => {
    const calls = mockFetch(() => new Response(null, { status: 204 }));
    await renderItem(makePost(1), true);

    await fireEvent.press(screen.getByRole('button', { name: 'Esborra' }));
    expect(screen.getByText('Vols esborrar aquesta publicació? No es pot desfer.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel·la' }));

    expect(screen.queryByText('Vols esborrar aquesta publicació? No es pot desfer.')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('deletes the post once confirmed (criterion 4)', async () => {
    const calls = mockFetch(() => new Response(null, { status: 204 }));
    await renderItem(makePost(1), true);

    await fireEvent.press(screen.getByRole('button', { name: 'Esborra' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Esborra' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'DELETE', pathname: `/api/posts/${makePost(1).id}` });
  });

  it('announces a failed delete with the translated message', async () => {
    mockFetch(() => problemResponse(403, 'POST_FORBIDDEN'));
    await renderItem(makePost(1), true);

    await fireEvent.press(screen.getByRole('button', { name: 'Esborra' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Esborra' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Només qui ha escrit aquesta publicació la pot editar o esborrar.',
    );
  });
});
