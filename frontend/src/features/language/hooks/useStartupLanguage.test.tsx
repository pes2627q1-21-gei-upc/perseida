import { renderHook, waitFor } from '@testing-library/react-native';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { mockUserProfile } from '../../../../__mocks__/profile';
import { queryClient } from '../../../shared/api/queryClient';
import i18n from '../../../shared/i18n';
import { saveTokens } from '../../auth/tokenStorage';
import { getSavedLanguage, saveLanguage } from '../languageStorage';
import { useStartupLanguage } from './useStartupLanguage';

// SecureStore is native: an in-memory map stands in for the device storage.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

beforeEach(async () => {
  queryClient.clear();
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(async () => {
  queryClient.clear();
  jest.restoreAllMocks();
  await i18n.changeLanguage('ca');
  // Nothing saved at the start of each test.
  jest.requireMock('expo-secure-store').deleteItemAsync('perseida.language');
});

function accountSpeaks(language: 'ca' | 'es' | 'en') {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () =>
      jsonResponse({ ...mockUserProfile, preferred_language: language }),
    );
}

function offline() {
  return jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
}

describe('useStartupLanguage', () => {
  it('TG-92 Criteri 5: with a session and a connection it uses the language of the account', async () => {
    await saveLanguage('es');
    accountSpeaks('en');

    await renderHook(() => useStartupLanguage(true));

    await waitFor(() => expect(i18n.language).toBe('en'));
    expect(await getSavedLanguage()).toBe('en');
  });

  it('TG-92 Criteri 5: with a session and no connection it uses the last language saved on the device', async () => {
    await saveLanguage('es');
    offline();

    await renderHook(() => useStartupLanguage(true));

    await waitFor(() => expect(i18n.language).toBe('es'));
  });

  it('applies the saved language without waiting for the account', async () => {
    await saveLanguage('es');
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined));

    await renderHook(() => useStartupLanguage(true));

    await waitFor(() => expect(i18n.language).toBe('es'));
  });

  it('uses the language of the account the first time, when the device has none saved', async () => {
    accountSpeaks('es');

    await renderHook(() => useStartupLanguage(true));

    await waitFor(() => expect(i18n.language).toBe('es'));
    expect(await getSavedLanguage()).toBe('es');
  });

  it('keeps the current language when there is nothing saved and the account cannot be read', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(503, 'DATABASE_UNAVAILABLE'));

    const { unmount } = await renderHook(() => useStartupLanguage(true));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(i18n.language).toBe('ca');
    expect(await getSavedLanguage()).toBeNull();
    unmount();
  });

  it('TG-92 Criteri 7: does nothing while there is no confirmed session', async () => {
    await saveLanguage('es');
    const spy = accountSpeaks('en');

    await renderHook(() => useStartupLanguage(false));

    expect(i18n.language).toBe('ca');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not undo a language the person chose while the account was still loading', async () => {
    let answer!: () => void;
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = () => resolve(jsonResponse({ ...mockUserProfile, preferred_language: 'es' }));
        }),
    );
    await renderHook(() => useStartupLanguage(true));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await saveLanguage('en');
    await i18n.changeLanguage('en');

    answer();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(i18n.language).toBe('en');
    expect(await getSavedLanguage()).toBe('en');
  });

  it('does not change the language after the screen is gone', async () => {
    let answer!: () => void;
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = () => resolve(jsonResponse({ ...mockUserProfile, preferred_language: 'en' }));
        }),
    );
    const { unmount } = await renderHook(() => useStartupLanguage(true));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    unmount();
    answer();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(i18n.language).toBe('ca');
  });
});
