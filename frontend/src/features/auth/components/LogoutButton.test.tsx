import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { saveTokens } from '../tokenStorage';
import i18n from '../../../shared/i18n';
import { LogoutButton } from './LogoutButton';

// Label of the button in Catalan, the language of the tests (jest.setup.js).
const LOGOUT = 'Tanca la sessió';

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

    expect(screen.getByRole('button', { name: LOGOUT })).toBeOnTheScreen();
  });

  it('signs out and goes to /login when pressed', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 204 }));
    await renderButton();

    await fireEvent.press(screen.getByRole('button', { name: LOGOUT }));

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
    const button = screen.getByRole('button', { name: LOGOUT });

    await fireEvent.press(button);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: LOGOUT, busy: true })).toBeOnTheScreen(),
    );
    await fireEvent.press(button);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    finish(new Response(null, { status: 204 }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
  });
});

describe('LogoutButton in the language of the app (US #93)', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('ca');
    });
  });

  it('TG-93 c2 c6 translates its label and hint and follows a change of language', async () => {
    await renderButton();

    await act(async () => {
      await i18n.changeLanguage('es');
    });
    expect(screen.getByRole('button', { name: 'Cierra la sesión' })).toBeOnTheScreen();

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    const button = screen.getByRole('button', { name: 'Sign out' });
    expect(button).toHaveProp(
      'accessibilityHint',
      'Signs out of this device and goes back to the sign-in screen',
    );
  });
});
