import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { nextQuizQuestion, QUIZ_DATE, quizQuestion, rightResult } from '../../../../__mocks__/quiz';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { msUntilNextUtcDay, quizKeys, useAnswerQuiz, useQuizToday } from './useQuiz';

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

const answer = { date: QUIZ_DATE, questionId: quizQuestion.question_id, chosenOption: 1 };

beforeEach(async () => {
  client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 }, mutations: { gcTime: Infinity } },
  });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(async () => {
  jest.useRealTimers();
  client.clear();
  await clearTokens();
  jest.restoreAllMocks();
});

describe('useQuizToday', () => {
  it('TG-61 loads the question of the day', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(quizQuestion));

    const { result } = await renderHook(() => useQuizToday('ca'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(quizQuestion);
  });

  it('retries once on a transient error', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => problemResponse(503, 'SESSION_UNAVAILABLE'))
      .mockImplementation(async () => jsonResponse(quizQuestion));

    const { result } = await renderHook(() => useQuizToday('ca'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('TG-61 loads the new question when the UTC day changes with the screen open', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-16T23:59:30Z'), advanceTimers: true });
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => jsonResponse(quizQuestion))
      .mockImplementation(async () => jsonResponse(nextQuizQuestion));
    const { result } = await renderHook(() => useQuizToday('ca'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(quizQuestion));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(45_000);
    });

    await waitFor(() => expect(result.current.data).toEqual(nextQuizQuestion));
  });

  it('TG-61 asks again when the app comes back on another UTC day, not on the same day', async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: jest.fn() } as never;
    });
    jest.useFakeTimers({ now: new Date('2026-11-16T10:00:00Z'), advanceTimers: true });
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => jsonResponse(quizQuestion))
      .mockImplementation(async () => jsonResponse(nextQuizQuestion));
    const { result } = await renderHook(() => useQuizToday('ca'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(quizQuestion));

    jest.setSystemTime(new Date('2026-11-16T20:00:00Z'));
    await act(async () => listeners.forEach((listener) => listener('active')));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-11-17T08:00:00Z'));
    await act(async () => listeners.forEach((listener) => listener('active')));

    await waitFor(() => expect(result.current.data).toEqual(nextQuizQuestion));
  });

  it('counts the time left until the next UTC midnight', () => {
    expect(msUntilNextUtcDay(Date.parse('2026-11-16T23:59:30Z'))).toBe(30_000);
    expect(msUntilNextUtcDay(Date.parse('2026-11-16T00:00:00Z'))).toBe(24 * 60 * 60 * 1000);
  });

  it('keeps one cache entry per language', () => {
    expect(quizKeys.today('ca')).toEqual(['quiz', 'today', 'ca']);
    expect(quizKeys.today('en')).not.toEqual(quizKeys.today('ca'));
  });
});

describe('useAnswerQuiz', () => {
  it('TG-61 stores the result in the question of the day, without a new request', async () => {
    client.setQueryData(quizKeys.today('ca'), quizQuestion);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(rightResult, 201));
    const { result } = await renderHook(() => useAnswerQuiz('ca'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(answer);
    });

    expect(client.getQueryData(quizKeys.today('ca'))).toEqual({
      ...quizQuestion,
      result: rightResult,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['QUIZ_EXPIRED', 'QUIZ_QUESTION_MISMATCH', 'QUIZ_ALREADY_ANSWERED'])(
    'TG-61 loads the question again after %s',
    async (code) => {
      client.setQueryData(quizKeys.today('ca'), quizQuestion);
      jest
        .spyOn(globalThis, 'fetch')
        .mockImplementationOnce(async () => problemResponse(409, code))
        .mockImplementation(async () => jsonResponse(nextQuizQuestion));
      const today = await renderHook(() => useQuizToday('ca'), { wrapper });
      const { result } = await renderHook(() => useAnswerQuiz('ca'), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(answer).catch(() => undefined);
      });

      await waitFor(() => expect(today.result.current.data).toEqual(nextQuizQuestion));
      await waitFor(() => expect(result.current.error?.code).toBe(code));
    },
  );

  it('keeps the question as it was after any other error', async () => {
    client.setQueryData(quizKeys.today('ca'), quizQuestion);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(503, 'SESSION_UNAVAILABLE'));
    const { result } = await renderHook(() => useAnswerQuiz('ca'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(answer).catch(() => undefined);
    });

    // The mutation state reaches the hook after the rejected promise: wait for it (CI is slower).
    await waitFor(() => expect(result.current.error?.code).toBe('SESSION_UNAVAILABLE'));
    expect(client.getQueryData(quizKeys.today('ca'))).toEqual(quizQuestion);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
