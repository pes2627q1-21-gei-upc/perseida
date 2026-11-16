import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { saveTokens } from '../tokenStorage';
import { authStrings } from '../strings';
import { LogoutButton } from './LogoutButton';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

let client: QueryClient;

async function renderButton() {
  return render(
    <QueryClientProvider client={client}>
      <LogoutButton />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  // gcTime Infinity: no 5-minute garbage-collection timer left behind after the test.
  client = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('LogoutButton', () => {
  it('is a button named «Tanca la sessió» (US #45 criterion 9)', async () => {
    await renderButton();

    expect(screen.getByRole('button', { name: authStrings.logout })).toBeOnTheScreen();
  });

  it('signs out and goes to /login when pressed', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 204 }));
    await renderButton();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.logout }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('is busy and ignores a second tap while the sign-out is in progress', async () => {
    let finish: (response: Response) => void = () => {};
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    await renderButton();
    const button = screen.getByRole('button', { name: authStrings.logout });

    await fireEvent.press(button);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: authStrings.logout, busy: true }),
      ).toBeOnTheScreen(),
    );
    await fireEvent.press(button);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    finish(new Response(null, { status: 204 }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
  });
});
