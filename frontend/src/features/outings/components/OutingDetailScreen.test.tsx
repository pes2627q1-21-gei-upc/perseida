import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { myOuting } from '../../../../__mocks__/outings';
import { saveTokens } from '../../auth/tokenStorage';
import { OutingDetailScreen } from './OutingDetailScreen';

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn(),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const ME = {
  id: myOuting.author.id,
  email: 'raquel@example.com',
  display_name: 'Raquel',
  avatar_url: null,
  preferred_language: 'ca',
  role: 'user',
};
const SOMEONE_ELSE = { ...ME, id: '01a19288-a3f6-7576-a37b-8929dd7f0999' };

let client: QueryClient;
let fetchSpy: jest.SpyInstance;
let me: () => Response | Promise<Response>;
let remove: () => Response | Promise<Response>;

function requests(method: string, path: string) {
  return fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === method && new URL(request.url).pathname === path);
}

/** The dialog and the screen behind have each an "Esborra": the one that confirms is in the dialog. */
async function confirmDelete() {
  await fireEvent.press(
    within(screen.getByTestId('confirm-dialog')).getByRole('button', { name: 'Esborra' }),
  );
}

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <OutingDetailScreen id={myOuting.id} />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  mockRouter.canGoBack.mockReturnValue(true);
  me = () => jsonResponse(ME);
  remove = () => new Response(null, { status: 204 });
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const request = input as Request;
    const { pathname } = new URL(request.url);
    if (pathname === '/api/users/me') return me();
    if (pathname === `/api/outings/${myOuting.id}`) {
      return request.method === 'DELETE' ? remove() : jsonResponse(myOuting);
    }
    throw new Error(`unexpected request to ${request.method} ${pathname}`);
  });
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('OutingDetailScreen', () => {
  it('shows the outing and its author', async () => {
    await renderScreen();

    expect(await screen.findByRole('header', { name: myOuting.title })).toBeOnTheScreen();
    expect(screen.getByText(myOuting.description)).toBeOnTheScreen();
    expect(screen.getByText('Raquel')).toBeOnTheScreen();
  });

  it('says it is loading', async () => {
    fetchSpy.mockImplementation(() => new Promise(() => undefined));

    await renderScreen();

    expect(screen.getByLabelText('Carregant sortides')).toBeOnTheScreen();
  });

  it('shows the text of the 404 and offers no retry', async () => {
    fetchSpy.mockImplementation(async (input) => {
      const { pathname } = new URL((input as Request).url);
      return pathname === '/api/users/me'
        ? jsonResponse(ME)
        : problemResponse(404, 'OUTING_NOT_FOUND');
    });

    await renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Aquesta sortida no existeix o s'ha esborrat.",
    );
    expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).toBeNull();
  });

  describe('the author', () => {
    it('can edit the outing', async () => {
      await renderScreen();

      await fireEvent.press(await screen.findByRole('button', { name: 'Edita' }));

      expect(mockRouter.push).toHaveBeenCalledWith(`/outings/${myOuting.id}/edit`);
    });

    it('is asked before the outing is deleted, and nothing is deleted if they cancel', async () => {
      await renderScreen();

      await fireEvent.press(await screen.findByRole('button', { name: 'Esborra' }));
      expect(
        screen.getByRole('header', { name: 'Vols esborrar aquesta sortida?' }),
      ).toBeOnTheScreen();
      expect(screen.getByText('No es pot desfer.')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Cancel·la' }));

      expect(screen.queryByText('No es pot desfer.')).toBeNull();
      expect(requests('DELETE', `/api/outings/${myOuting.id}`)).toHaveLength(0);
      expect(mockRouter.back).not.toHaveBeenCalled();
    });

    it('deletes the outing once confirmed and goes back', async () => {
      await renderScreen();

      await fireEvent.press(await screen.findByRole('button', { name: 'Esborra' }));
      await confirmDelete();

      await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
      const [request] = requests('DELETE', `/api/outings/${myOuting.id}`);
      expect(request.headers.get('Authorization')).toBe('Bearer access-1');
    });

    it('goes to the outings of the person when there is nowhere to go back to', async () => {
      mockRouter.canGoBack.mockReturnValue(false);
      await renderScreen();

      await fireEvent.press(await screen.findByRole('button', { name: 'Esborra' }));
      await confirmDelete();

      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/outings'));
    });

    it('keeps the outing and says why when it cannot be deleted', async () => {
      remove = () => problemResponse(403, 'OUTING_FORBIDDEN');
      await renderScreen();

      await fireEvent.press(await screen.findByRole('button', { name: 'Esborra' }));
      await confirmDelete();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Només qui ha creat la sortida la pot canviar.',
      );
      expect(screen.queryByText('No es pot desfer.')).toBeNull();
      expect(mockRouter.back).not.toHaveBeenCalled();
    });
  });

  describe('anybody else', () => {
    it('sees the outing but has no buttons to change it', async () => {
      me = () => jsonResponse(SOMEONE_ELSE);
      await renderScreen();

      await screen.findByRole('header', { name: myOuting.title });
      await waitFor(() => expect(requests('GET', '/api/users/me')).toHaveLength(1));
      expect(screen.queryByRole('button', { name: 'Edita' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Esborra' })).toBeNull();
    });

    it('has no buttons either while it is not known who they are, or if that fails', async () => {
      me = () => problemResponse(401, 'INVALID_SESSION');
      await renderScreen();

      await screen.findByRole('header', { name: myOuting.title });
      expect(screen.queryByRole('button', { name: 'Edita' })).toBeNull();
    });
  });
});
