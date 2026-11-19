import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import type { Language } from '../../../shared/i18n';
import { withSession } from '../../auth/api/authorized';

export type QuizToday = components['schemas']['QuizTodayResponse'];
export type QuizResult = components['schemas']['QuizResultResponse'];

export interface QuizAnswer {
  /** UTC day of the question (`date` of QuizToday). */
  date: string;
  questionId: string;
  /** Position of the chosen option, 0-3. */
  chosenOption: number;
}

function invalidResponse(status: number): AppError {
  // 2xx without a body: treat as an unusable response, not as a crash.
  return new AppError({ kind: 'http', code: 'INVALID_RESPONSE', status, retryable: false });
}

/** Today's question in `lang`, with the result if the person already answered (contracte-quiz). */
export async function getQuizToday(lang: Language): Promise<QuizToday> {
  return withSession(async (headers) => {
    const { data, response } = await api.GET('/api/quiz/today', {
      params: { query: { lang } },
      headers,
    });
    if (!data) throw invalidResponse(response.status);
    return data;
  });
}

/** Stores the answer to today's question and returns the result, with the texts in `lang`. */
export async function answerQuizToday(lang: Language, answer: QuizAnswer): Promise<QuizResult> {
  return withSession(async (headers) => {
    const { data, response } = await api.POST('/api/quiz/today/answer', {
      params: { query: { lang } },
      headers,
      body: {
        date: answer.date,
        question_id: answer.questionId,
        chosen_option: answer.chosenOption,
      },
    });
    if (!data) throw invalidResponse(response.status);
    return data;
  });
}
