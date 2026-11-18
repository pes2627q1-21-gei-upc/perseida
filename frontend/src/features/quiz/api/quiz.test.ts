import { problemResponse, jsonResponse } from '../../../../__mocks__/apod';
import { QUIZ_DATE, quizQuestion, rightResult } from '../../../../__mocks__/quiz';
import { AppError } from '../../../shared/errors';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';
import { answerQuizToday, getQuizToday } from './quiz';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

function sentRequest(spy: jest.SpyInstance): Request {
  return spy.mock.calls[0][0] as Request;
}

beforeEach(async () => {
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(async () => {
  await clearTokens();
  jest.restoreAllMocks();
});

describe('getQuizToday', () => {
  it('TG-61 asks for the question of the day in the language of the app, with the session', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(quizQuestion));

    await expect(getQuizToday('es')).resolves.toEqual(quizQuestion);

    const request = sentRequest(fetchSpy);
    expect(request.method).toBe('GET');
    expect(request.url).toBe('http://api.test/api/quiz/today?lang=es');
    expect(request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('rejects with a non-retryable AppError when a 200 comes without a body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));

    const failure = await getQuizToday('ca').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  });
});

describe('answerQuizToday', () => {
  it('TG-61 sends the date, the question and the chosen option and returns the result', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(rightResult, 201));

    const result = await answerQuizToday('ca', {
      date: QUIZ_DATE,
      questionId: quizQuestion.question_id,
      chosenOption: 1,
    });

    expect(result).toEqual(rightResult);
    const request = sentRequest(fetchSpy);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('http://api.test/api/quiz/today/answer?lang=ca');
    expect(request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(await request.json()).toEqual({
      date: QUIZ_DATE,
      question_id: quizQuestion.question_id,
      chosen_option: 1,
    });
  });

  it('passes on the quiz error codes as AppError', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(409, 'QUIZ_EXPIRED'));

    const failure = await answerQuizToday('ca', {
      date: QUIZ_DATE,
      questionId: quizQuestion.question_id,
      chosenOption: 1,
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'QUIZ_EXPIRED', status: 409, retryable: false });
  });

  it('rejects with a non-retryable AppError when a 201 comes without a body', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 201 }));

    const failure = await answerQuizToday('ca', {
      date: QUIZ_DATE,
      questionId: quizQuestion.question_id,
      chosenOption: 1,
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  });
});
