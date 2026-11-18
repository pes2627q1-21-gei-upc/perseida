import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { myOuting, otherOuting } from '../../../../__mocks__/outings';
import { saveTokens } from '../../auth/tokenStorage';
import { OutingsScreen } from './OutingsScreen';

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

let client: QueryClient;
let fetchSpy: jest.SpyInstance;

function requestsTo(path: string) {
  return fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => new URL(request.url).pathname === path);
}

async function renderScreen(props: { eventId?: string } = {}) {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <OutingsScreen {...props} />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  mockRouter.canGoBack.mockReturnValue(true);
  fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => jsonResponse([myOuting, otherOuting]));
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('OutingsScreen of the person', () => {
  it('has the title of the screen as a header', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Les meves sortides' })).toBeOnTheScreen();
  });

  it('asks for the outings of the session, with its token, and lists them', async () => {
    await renderScreen();

    expect(await screen.findByText(myOuting.title)).toBeOnTheScreen();
    expect(screen.getByText(otherOuting.title)).toBeOnTheScreen();
    const [request] = requestsTo('/api/outings');
    expect(new URL(request.url).searchParams.get('mine')).toBe('true');
    expect(new URL(request.url).searchParams.has('event_id')).toBe(false);
    expect(request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('says it is loading, in a way a screen reader announces', async () => {
    fetchSpy.mockImplementation(() => new Promise(() => undefined));

    await renderScreen();

    expect(screen.getByLabelText('Carregant sortides')).toBeOnTheScreen();
  });

  it('says there are no outings yet', async () => {
    fetchSpy.mockImplementation(async () => jsonResponse([]));

    await renderScreen();

    expect(await screen.findByText('Encara no has creat cap sortida.')).toBeOnTheScreen();
  });

  it('opens the outing the person taps', async () => {
    await renderScreen();

    await fireEvent.press(await screen.findByText(myOuting.title));

    expect(mockRouter.push).toHaveBeenCalledWith(`/outings/${myOuting.id}`);
  });

  it('creates a new outing from the button', async () => {
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: 'Crea una sortida' }));

    expect(mockRouter.push).toHaveBeenCalledWith('/outings/new');
  });
});

describe('OutingsScreen of an event', () => {
  it('has the title of the screen and asks for the outings of the event', async () => {
    await renderScreen({ eventId: 'event-1' });

    expect(screen.getByRole('header', { name: "Sortides de l'esdeveniment" })).toBeOnTheScreen();
    await screen.findByText(myOuting.title);
    const [request] = requestsTo('/api/outings');
    expect(new URL(request.url).searchParams.get('event_id')).toBe('event-1');
    expect(new URL(request.url).searchParams.has('mine')).toBe(false);
  });

  it('says there are no outings for the event yet', async () => {
    fetchSpy.mockImplementation(async () => jsonResponse([]));

    await renderScreen({ eventId: 'event-1' });

    expect(
      await screen.findByText('Encara no hi ha cap sortida per a aquest esdeveniment.'),
    ).toBeOnTheScreen();
  });

  it('creates a new outing linked to the event', async () => {
    await renderScreen({ eventId: 'event-1' });

    await fireEvent.press(await screen.findByRole('button', { name: 'Crea una sortida' }));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/outings/new',
      params: { eventId: 'event-1' },
    });
  });
});

describe('OutingsScreen errors and navigation', () => {
  it('shows the text of the error code and invites to try again when it is transient', async () => {
    fetchSpy.mockImplementation(async () => problemResponse(503, 'SESSION_UNAVAILABLE'));

    await renderScreen();

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Torna-ho a provar' })).toBeOnTheScreen();
  });

  it('asks again when the person tries again', async () => {
    fetchSpy.mockImplementationOnce(async () => problemResponse(503, 'SESSION_UNAVAILABLE'));
    fetchSpy.mockImplementationOnce(async () => problemResponse(503, 'SESSION_UNAVAILABLE'));
    await renderScreen();
    await screen.findByRole('alert');
    fetchSpy.mockImplementation(async () => jsonResponse([myOuting]));

    await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));

    expect(await screen.findByText(myOuting.title)).toBeOnTheScreen();
  });

  it('offers no retry when the error is final', async () => {
    fetchSpy.mockImplementation(async () => problemResponse(401, 'INVALID_SESSION'));

    await renderScreen();

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).toBeNull();
  });

  it('goes back with the back button', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Torna' }));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('goes home when it was opened from a link and there is nowhere to go back to', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Torna' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
