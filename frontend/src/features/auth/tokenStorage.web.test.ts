import { clearTokens, getTokens, saveTokens } from './tokenStorage.web';

afterEach(async () => {
  await clearTokens();
});

describe('tokenStorage (web)', () => {
  it('keeps the pair in memory and reads it back', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    expect(await getTokens()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('returns null when there is no session in this tab', async () => {
    expect(await getTokens()).toBeNull();
  });

  it('clearTokens wipes the session', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    await clearTokens();

    expect(await getTokens()).toBeNull();
  });

  it('hands out copies, so callers cannot change the stored pair', async () => {
    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    const tokens = await getTokens();
    if (tokens) tokens.accessToken = 'tampered';

    expect(await getTokens()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('never touches localStorage or sessionStorage', async () => {
    const setItem = jest.fn();
    Object.defineProperty(globalThis, 'localStorage', { value: { setItem }, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: { setItem }, configurable: true });

    await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    expect(setItem).not.toHaveBeenCalled();
  });
});
