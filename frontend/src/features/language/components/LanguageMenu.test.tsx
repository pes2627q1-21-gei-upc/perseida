import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { jsonResponse, mockUserProfile, problemResponse } from '../../../../__mocks__/profile';
import i18n from '../../../shared/i18n';
import * as tokenStorage from '../../auth/tokenStorage';
import { LanguageMenu } from './LanguageMenu';

// SecureStore is native: an in-memory map stands in for the device storage.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

let queryClient: QueryClient;

async function renderMenu() {
  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageMenu />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity } } });
  jest
    .spyOn(tokenStorage, 'getTokens')
    .mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(async () => {
  queryClient.clear();
  jest.restoreAllMocks();
  await i18n.changeLanguage('ca');
});

function accountAnswers(language: 'ca' | 'es' | 'en') {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () =>
      jsonResponse({ ...mockUserProfile, preferred_language: language }),
    );
}

const openMenu = async () =>
  await fireEvent.press(screen.getByRole('button', { name: 'Idioma: CA, Català' }));

describe('LanguageMenu (TG-92)', () => {
  it('TG-92 Criteri 3: closed, it shows the globe and the code of the current language', async () => {
    await renderMenu();

    const button = screen.getByRole('button', { name: 'Idioma: CA, Català' });
    expect(button).toBeCollapsed();
    expect(screen.getByText('CA')).toBeOnTheScreen();
    expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
  });

  it('TG-92 Criteri 3 i 8: open, it lists the three languages by their own name with the current one checked', async () => {
    await renderMenu();

    await openMenu();

    expect(screen.getByRole('button', { name: 'Idioma: CA, Català' })).toBeExpanded();
    expect(screen.getByLabelText('Idioma').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Català' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Castellano' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked();
  });

  it('shows Catalan when the active language is one the app does not know', async () => {
    await i18n.changeLanguage('fr');

    await renderMenu();

    expect(screen.getByText('CA')).toBeOnTheScreen();
  });

  it('closes when the button is pressed again', async () => {
    await renderMenu();
    await openMenu();

    await openMenu();

    expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
  });

  it('TG-92 Criteri 4 i 5: choosing a language changes the texts, closes the menu and saves it', async () => {
    const fetchSpy = accountAnswers('es');
    await renderMenu();
    await openMenu();

    await fireEvent.press(screen.getByRole('radio', { name: 'Castellano' }));

    expect(i18n.language).toBe('es');
    expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
    expect(screen.getByText('ES')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Idioma: ES, Castellano' })).toBeOnTheScreen();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const request = fetchSpy.mock.calls[0][0] as Request;
    expect(request.method).toBe('PATCH');
    await expect(request.json()).resolves.toEqual({ preferred_language: 'es' });
  });

  it('TG-92 Criteri 9: announces the change to the screen reader, in the new language', async () => {
    accountAnswers('es');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    await renderMenu();
    await openMenu();

    await fireEvent.press(screen.getByRole('radio', { name: 'Castellano' }));

    expect(announce).toHaveBeenCalledWith('Idioma cambiado a Castellano');
  });

  it('does not announce anything when the current language is chosen again', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    await renderMenu();
    await openMenu();

    await fireEvent.press(screen.getByRole('radio', { name: 'Català' }));

    expect(announce).not.toHaveBeenCalled();
  });

  it('TG-92 Criteri 9: the button explains what it does and the status texts are live regions', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined));
    await renderMenu();

    expect(screen.getByRole('button', { name: 'Idioma: CA, Català' }).props.accessibilityHint).toBe(
      "Obre la llista d'idiomes",
    );

    await openMenu();
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));

    const saving = await screen.findByText(i18n.t('profile.languageMenu.saving'));
    expect(saving.props.accessibilityLiveRegion).toBe('polite');
  });

  it('choosing the current language only closes the menu', async () => {
    const fetchSpy = accountAnswers('ca');
    await renderMenu();
    await openMenu();

    await fireEvent.press(screen.getByRole('radio', { name: 'Català' }));

    expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('announces that the language is being saved', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined));
    await renderMenu();
    await openMenu();

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));

    expect(await screen.findByText(i18n.t('profile.languageMenu.saving'))).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('TG-92 Criteri 6: if saving fails the change stays, an error shows and it can be retried', async () => {
    let fail = true;
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        fail ? problemResponse(503, 'DATABASE_UNAVAILABLE') : jsonResponse(mockUserProfile),
      );
    await renderMenu();
    await openMenu();
    await fireEvent.press(screen.getByRole('radio', { name: 'Castellano' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(i18n.t('profile.languageMenu.error'));
    expect(i18n.language).toBe('es');
    expect(screen.getByText('ES')).toBeOnTheScreen();

    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: i18n.t('profile.retry') }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeOnTheScreen());
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
