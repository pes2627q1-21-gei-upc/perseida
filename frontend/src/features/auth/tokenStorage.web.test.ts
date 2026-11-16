import type * as TokenStorage from './tokenStorage';

const PAIR = { accessToken: 'access-1', refreshToken: 'refresh-1' };

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: jest.fn((key: string) => data.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => void data.set(key, value)),
    removeItem: jest.fn((key: string) => void data.delete(key)),
  };
}

function setGlobal(name: 'sessionStorage' | 'localStorage', value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/** A fresh copy of the module: what a page reload gives (module memory is lost). */
function loadModule(): typeof TokenStorage {
  let module: typeof TokenStorage | undefined;
  jest.isolateModules(() => {
    module = jest.requireActual<typeof TokenStorage>('./tokenStorage.web');
  });
  return module as typeof TokenStorage;
}

let session: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  session = fakeStorage();
  setGlobal('sessionStorage', session);
  setGlobal('localStorage', fakeStorage());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'sessionStorage');
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('tokenStorage (web)', () => {
  it('reads back the pair it saved', async () => {
    const { saveTokens, getTokens } = loadModule();

    await saveTokens(PAIR);

    expect(await getTokens()).toEqual(PAIR);
  });

  it('survives a page reload: a fresh module still finds the session', async () => {
    await loadModule().saveTokens(PAIR);

    expect(await loadModule().getTokens()).toEqual(PAIR);
  });

  it('returns null when there is no session in this tab', async () => {
    expect(await loadModule().getTokens()).toBeNull();
  });

  it('returns null if only one of the two tokens is stored', async () => {
    session.data.set('perseida.accessToken', 'orphan');

    expect(await loadModule().getTokens()).toBeNull();
  });

  it('clearTokens wipes the session, also after a reload', async () => {
    await loadModule().saveTokens(PAIR);
    const reloaded = loadModule();

    await reloaded.clearTokens();

    expect(await reloaded.getTokens()).toBeNull();
    expect(session.data.size).toBe(0);
  });

  it('uses sessionStorage only, never localStorage', async () => {
    const local = fakeStorage();
    setGlobal('localStorage', local);

    await loadModule().saveTokens(PAIR);

    expect(local.setItem).not.toHaveBeenCalled();
    expect(session.setItem).toHaveBeenCalledTimes(2);
  });

  it('hands out copies, so callers cannot change the stored pair', async () => {
    const { saveTokens, getTokens } = loadModule();
    await saveTokens(PAIR);

    const tokens = await getTokens();
    if (tokens) tokens.accessToken = 'tampered';

    expect(await getTokens()).toEqual(PAIR);
  });

  it('keeps the session in memory when sessionStorage is not available', async () => {
    setGlobal('sessionStorage', undefined);
    const { saveTokens, getTokens } = loadModule();

    await saveTokens(PAIR);

    expect(await getTokens()).toEqual(PAIR);
    expect(await loadModule().getTokens()).toBeNull();
  });

  it('keeps working when sessionStorage throws (blocked by the browser)', async () => {
    const blocked = {
      getItem: jest.fn(() => {
        throw new Error('blocked');
      }),
      setItem: jest.fn(() => {
        throw new Error('blocked');
      }),
      removeItem: jest.fn(() => {
        throw new Error('blocked');
      }),
    };
    setGlobal('sessionStorage', blocked);
    const { saveTokens, getTokens, clearTokens } = loadModule();

    await saveTokens(PAIR);
    expect(await getTokens()).toEqual(PAIR);
    await clearTokens();

    expect(await getTokens()).toBeNull();
  });
});
