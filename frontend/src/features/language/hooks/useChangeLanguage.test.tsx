import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { mockUserProfile } from '../../../../__mocks__/profile';
import * as SecureStore from 'expo-secure-store';

import i18n from '../../../shared/i18n';
import { saveTokens } from '../../auth/tokenStorage';
import { profileKeys } from '../../profile';
import { getSavedLanguage } from '../languageStorage';
import { useChangeLanguage } from './useChangeLanguage';

// SecureStore is native: an in-memory map stands in for the device storage.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  // gcTime Infinity: no 5-minute garbage-collection timer left behind after the test.
  client = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(async () => {
  client.clear();
  jest.restoreAllMocks();
  await i18n.changeLanguage('ca');
});

function mockFetch(response: () => Response | Promise<Response>) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
}

const updated = { ...mockUserProfile, preferred_language: 'es' as const };

describe('useChangeLanguage', () => {
  it('TG-92 Criteri 4: the texts change at once, before the server answers', async () => {
    mockFetch(() => new Promise<Response>(() => undefined)); // never answers
    const { result } = await renderHook(() => useChangeLanguage(), { wrapper });

    await act(async () => {
      result.current.change('es');
    });

    expect(i18n.language).toBe('es');
    await waitFor(() => expect(result.current.isSaving).toBe(true));
  });

  it('TG-92 Criteri 5: saves the language on the device and sends it to the API', async () => {
    const spy = mockFetch(() => jsonResponse(updated));
    const { result } = await renderHook(() => useChangeLanguage(), { wrapper });

    await act(async () => {
      result.current.change('es');
    });

    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(await getSavedLanguage()).toBe('es');
    const request = spy.mock.calls[0][0] as Request;
    expect(request.method).toBe('PATCH');
    await expect(request.json()).resolves.toEqual({ preferred_language: 'es' });
    expect(result.current.error).toBeNull();
  });

  it('puts the updated profile in the cache of the profile screen', async () => {
    mockFetch(() => jsonResponse(updated));
    const { result } = await renderHook(() => useChangeLanguage(), { wrapper });

    await act(async () => {
      result.current.change('es');
    });

    await waitFor(() => expect(client.getQueryData(profileKeys.me())).toEqual(updated));
  });

  it('TG-92 Criteri 6: a failed save keeps the language and exposes the error', async () => {
    mockFetch(() => problemResponse(503, 'DATABASE_UNAVAILABLE'));
    const { result } = await renderHook(() => useChangeLanguage(), { wrapper });

    await act(async () => {
      result.current.change('es');
    });

    await waitFor(() =>
      expect(result.current.error).toMatchObject({ code: 'DATABASE_UNAVAILABLE' }),
    );
    expect(i18n.language).toBe('es');
    expect(await getSavedLanguage()).toBe('es');
    expect(result.current.isSaving).toBe(false);
  });

  it('TG-92 Criteri 6: retry sends the last chosen language again', async () => {
    let fail = true;
    const spy = mockFetch(() =>
      fail ? problemResponse(503, 'DATABASE_UNAVAILABLE') : jsonResponse(updated),
    );
    const { result } = await renderHook(() => useChangeLanguage(), { wrapper });
    await act(async () => {
      result.current.change('es');
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    fail = false;
    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(spy).toHaveBeenCalledTimes(2);
    const request = spy.mock.calls[1][0] as Request;
    await expect(request.json()).resolves.toEqual({ preferred_language: 'es' });
  });

  it('retry does nothing before any language was chosen', async () => {
    const spy = mockFetch(() => jsonResponse(updated));
    const { result } = await renderHook(() => useChangeLanguage(), { wrapper });

    await act(async () => {
      result.current.retry();
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('still saves to the account when the device cannot save the language', async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('keychain locked'));
    const spy = mockFetch(() => jsonResponse(updated));
    const { result } = await renderHook(() => useChangeLanguage(), { wrapper });

    await act(async () => {
      result.current.change('es');
    });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('sends two quick changes one after the other, so the account ends with the last one', async () => {
    const answers: ((response: Response) => void)[] = [];
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise<Response>((resolve) => answers.push(resolve)));
    const { result } = await renderHook(() => useChangeLanguage(), { wrapper });

    await act(async () => {
      result.current.change('es');
      result.current.change('en');
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(await (spy.mock.calls[0][0] as Request).json()).toEqual({ preferred_language: 'es' });

    await act(async () => {
      answers[0](jsonResponse({ ...mockUserProfile, preferred_language: 'es' }));
    });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(await (spy.mock.calls[1][0] as Request).json()).toEqual({ preferred_language: 'en' });

    await act(async () => {
      answers[1](jsonResponse({ ...mockUserProfile, preferred_language: 'en' }));
    });
    await waitFor(() =>
      expect(client.getQueryData<{ preferred_language: string }>(profileKeys.me())).toMatchObject({
        preferred_language: 'en',
      }),
    );
  });
});
