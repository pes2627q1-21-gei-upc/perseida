import type * as LanguageStorage from './languageStorage';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: jest.fn((key: string) => data.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => void data.set(key, value)),
  };
}

function setLocalStorage(value: unknown) {
  Object.defineProperty(globalThis, 'localStorage', {
    value,
    configurable: true,
    writable: true,
  });
}

function loadModule(): typeof LanguageStorage {
  return jest.requireActual<typeof LanguageStorage>('./languageStorage.web');
}

let local: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  local = fakeStorage();
  setLocalStorage(local);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('languageStorage (web)', () => {
  it('TG-92 Criteri 5: keeps the language in localStorage and reads it back', async () => {
    const { getSavedLanguage, saveLanguage } = loadModule();

    await saveLanguage('en');

    expect(local.data.get('perseida.language')).toBe('en');
    expect(await getSavedLanguage()).toBe('en');
  });

  it('returns null when nothing was saved', async () => {
    expect(await loadModule().getSavedLanguage()).toBeNull();
  });

  it('returns null for a stored value that is not a supported language', async () => {
    local.data.set('perseida.language', 'fr');

    expect(await loadModule().getSavedLanguage()).toBeNull();
  });

  it('does not fail when the browser blocks localStorage', async () => {
    setLocalStorage({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const { getSavedLanguage, saveLanguage } = loadModule();

    await expect(saveLanguage('es')).resolves.toBeUndefined();
    await expect(getSavedLanguage()).resolves.toBeNull();
  });
});
