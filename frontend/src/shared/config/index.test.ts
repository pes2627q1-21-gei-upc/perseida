// TG-654 F6: a trailing slash in EXPO_PUBLIC_API_BASE_URL must not leak into the URLs built from it.

const ORIGINAL = process.env.EXPO_PUBLIC_API_BASE_URL;

/** A fresh copy of the config module, read with `value` as the API base URL. */
function configWith(value: string | undefined) {
  if (value === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = value;
  let loaded!: typeof import('./index');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('./index') as typeof import('./index');
  });
  return loaded.config;
}

afterEach(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL;
});

describe('config: URL base de l’API (TG-654)', () => {
  it.each([
    ['https://api.test', 'https://api.test', 'wss://api.test/api/ws'],
    ['https://api.test/', 'https://api.test', 'wss://api.test/api/ws'],
    ['https://api.test//', 'https://api.test', 'wss://api.test/api/ws'],
    ['http://api.test/', 'http://api.test', 'ws://api.test/api/ws'],
  ])('%s: apiBaseUrl %s i wsUrl %s', (input, apiBaseUrl, wsUrl) => {
    const config = configWith(input);

    expect(config.apiBaseUrl).toBe(apiBaseUrl);
    expect(config.wsUrl).toBe(wsUrl);
  });

  it('sense la variable, apiBaseUrl és buit i wsUrl no té barres dobles', () => {
    const config = configWith(undefined);

    expect(config.apiBaseUrl).toBe('');
    expect(config.wsUrl).toBe('/api/ws');
  });

  it('manté el timeout de petició de 10 s', () => {
    expect(configWith('https://api.test').requestTimeoutMs).toBe(10_000);
  });
});
