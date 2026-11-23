import * as SecureStore from 'expo-secure-store';

import { getSavedLanguage, saveLanguage } from './languageStorage';

// SecureStore is native: an in-memory map stands in for the device storage.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

afterEach(async () => {
  await SecureStore.deleteItemAsync('perseida.language');
  jest.clearAllMocks();
});

describe('languageStorage', () => {
  it('TG-92 Criteri 5: stores the language on the device and reads it back', async () => {
    await saveLanguage('es');

    expect(await getSavedLanguage()).toBe('es');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('perseida.language', 'es');
  });

  it('returns null when no language was saved', async () => {
    expect(await getSavedLanguage()).toBeNull();
  });

  it('returns null for a stored value that is not a supported language', async () => {
    await SecureStore.setItemAsync('perseida.language', 'fr');

    expect(await getSavedLanguage()).toBeNull();
  });

  it('returns null when the device storage fails', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('keychain locked'));

    expect(await getSavedLanguage()).toBeNull();
  });
});
