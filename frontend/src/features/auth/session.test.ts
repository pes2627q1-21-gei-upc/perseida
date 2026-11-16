import { QueryClient } from '@tanstack/react-query';
import { queryClient } from '../../shared/api/queryClient';
import { clearSession } from './session';
import { getTokens, saveTokens } from './tokenStorage';

// SecureStore is native: mock store stands in for device keychain
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

describe('clearSession helper (#232)', () => {
  beforeEach(async () => {
    queryClient.clear();
    await saveTokens({ accessToken: 'test-acc', refreshToken: 'test-ref' });
    queryClient.setQueryData(['test-query'], { data: 'sample' });
  });

  afterEach(async () => {
    await clearSession();
    jest.clearAllMocks();
  });

  it('TG-43 Criteri 7: wipes tokens from secure store and purges query cache', async () => {
    expect(await getTokens()).not.toBeNull();
    expect(queryClient.getQueryData(['test-query'])).toEqual({ data: 'sample' });

    await clearSession();

    expect(await getTokens()).toBeNull();
    expect(queryClient.getQueryData(['test-query'])).toBeUndefined();
  });

  it('TG-43 Criteri 7: purges a custom query client if provided', async () => {
    const customQc = new QueryClient();
    customQc.setQueryData(['custom-key'], { value: 123 });

    await clearSession(customQc);

    expect(customQc.getQueryData(['custom-key'])).toBeUndefined();
  });
});
