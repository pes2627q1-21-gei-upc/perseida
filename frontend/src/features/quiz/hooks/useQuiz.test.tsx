import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { nextQuizQuestion, QUIZ_DATE, quizQuestion, rightResult } from '../../../../__mocks__/quiz';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { quizKeys, useAnswerQuiz, useQuizToday } from './useQuiz';

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
