import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import type { Language } from '../../../shared/i18n';
import {
  answerQuizToday,
  getQuizToday,
  type QuizAnswer,
  type QuizResult,
  type QuizToday,
} from '../api/quiz';

export const quizKeys = {
  all: ['quiz'] as const,
  today: (lang: Language) => [...quizKeys.all, 'today', lang] as const,
};

/** The question changed on the server (new UTC day): the screen loads the new one. */
export const QUESTION_CHANGED_CODES: ReadonlySet<string> = new Set([
  'QUIZ_EXPIRED',
  'QUIZ_QUESTION_MISMATCH',
]);

/** After these errors the cached question is out of date and is loaded again. */
const RELOAD_CODES: ReadonlySet<string> = new Set([
  ...QUESTION_CHANGED_CODES,
  'QUIZ_ALREADY_ANSWERED',
]);

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Today's question in `lang`. It changes once a day (UTC); online only. */
export function useQuizToday(lang: Language) {
  return useQuery<QuizToday, AppError>({
    queryKey: quizKeys.today(lang),
    queryFn: () => getQuizToday(lang),
    staleTime: FIVE_MINUTES_MS,
    // One retry, and only when the error is transient (network, 408, 429, 5xx).
    retry: (failureCount, error) => failureCount < 1 && error.retryable,
  });
}

/**
 * Sends the answer. On success the result goes into the cached question, so the screen
 * shows it without a new request; the other languages are marked stale. After
 * QUIZ_EXPIRED, QUIZ_QUESTION_MISMATCH or QUIZ_ALREADY_ANSWERED the question is reloaded.
 */
export function useAnswerQuiz(lang: Language) {
  const client = useQueryClient();
  return useMutation<QuizResult, AppError, QuizAnswer>({
    mutationFn: (answer) => answerQuizToday(lang, answer),
    onSuccess: (result) => {
      client.setQueryData<QuizToday>(quizKeys.today(lang), (today) =>
        today ? { ...today, result } : today,
      );
      void client.invalidateQueries({
        queryKey: quizKeys.all,
        predicate: (query) => query.queryKey[2] !== lang,
      });
    },
    onError: (error) => {
      if (RELOAD_CODES.has(error.code)) void client.invalidateQueries({ queryKey: quizKeys.all });
    },
  });
}
