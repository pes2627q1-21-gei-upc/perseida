import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { apodImage, apodVideo, jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { AppError } from '../../../shared/errors';
import { apodKeys, useApodToday } from './useApodToday';

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  // retryDelay 0 so the single retry does not slow the tests down.
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe('useApodToday', () => {
  it('starts loading and then returns the APOD (criteria 1 and 4)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodImage));

    const { result } = await renderHook(() => useApodToday(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(apodImage);
  });

  it('exposes the media type so the screen can render an image or a video (criteria 2 and 3)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(apodVideo));

    const { result } = await renderHook(() => useApodToday(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.media_type).toBe('video');
    expect(result.current.data?.copyright).toBeUndefined();
  });

  it('retries once on a transient error and then recovers (criterion 5)', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => problemResponse(503, 'EXTERNAL_UNAVAILABLE'))
      .mockImplementation(async () => jsonResponse(apodImage));

    const { result } = await renderHook(() => useApodToday(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('ends in error with an AppError after the retry fails (criterion 5)', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(503, 'EXTERNAL_UNAVAILABLE'));

    const { result } = await renderHook(() => useApodToday(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(AppError);
    expect(result.current.error).toMatchObject({ code: 'EXTERNAL_UNAVAILABLE', retryable: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(404, 'NOT_FOUND'));

    const { result } = await renderHook(() => useApodToday(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.error?.retryable).toBe(false);
  });

  it('reports a network failure as a retryable AppError', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('Network request failed');
    });

    const { result } = await renderHook(() => useApodToday(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ kind: 'network', retryable: true });
  });

  it('refetch loads the data again after an error (retry button, criterion 5)', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => problemResponse(404, 'NOT_FOUND'))
      .mockImplementation(async () => jsonResponse(apodImage));
    const { result } = await renderHook(() => useApodToday(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    await result.current.refetch();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(apodImage);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('serves the cached APOD without a new request while it is fresh', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(apodImage));
    const first = await renderHook(() => useApodToday(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    const second = await renderHook(() => useApodToday(), { wrapper });

    expect(second.result.current.data).toEqual(apodImage);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses a centralised query key', () => {
    expect(apodKeys.today()).toEqual(['apod', 'today']);
  });
});
