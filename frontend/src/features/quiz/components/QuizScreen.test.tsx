import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import {
  answeredQuestion,
  nextQuizQuestion,
  quizQuestion,
  rightResult,
  wrongResult,
} from '../../../../__mocks__/quiz';
import QuizRoute from '../../../app/(app)/quiz';
import { clearTokens, saveTokens } from '../../auth/tokenStorage';

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const LOADING = 'Carregant la pregunta del dia';
const SUBMIT = 'Envia la resposta';
const NETWORK_ERROR_TEXT = 'No hi ha connexió. Comprova la xarxa i torna-ho a provar.';
const SESSION_UNAVAILABLE_TEXT =
  "No podem comprovar la teva sessió ara mateix. Torna-ho a provar d'aquí a una estona.";

type Route = (request: Request) => Promise<Response> | Response;

/** Answers GET /api/quiz/today and POST /api/quiz/today/answer with the given handlers. */
function mockApi(today: Route[], answer: Route[] = []) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const request = input as Request;
    const queue = request.method === 'POST' ? answer : today;
    const handler = queue.length > 1 ? queue.shift()! : queue[0];
    return handler(request);
  });
}

function postedBodies(spy: jest.SpyInstance): Promise<unknown[]> {
  return Promise.all(
    spy.mock.calls
      .map(([input]) => input as Request)
      .filter((request) => request.method === 'POST')
      .map((request) => request.clone().json()),
  );
}

let client: QueryClient;

async function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>
        <QuizRoute />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function option(name: string) {
  return screen.getByRole('radio', { name });
}

beforeEach(async () => {
  client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 }, mutations: { gcTime: Infinity } },
  });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(async () => {
  client.clear();
  await clearTokens();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
});

describe('Quiz screen', () => {
  it('TG-61 c7 shows the loading state until the question arrives', async () => {
    let respond!: (response: Response) => void;
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );

    await renderScreen();

    expect(screen.getByLabelText(LOADING)).toBeTruthy();
    await act(async () => {
      respond(jsonResponse(quizQuestion));
    });
    expect(await screen.findByText(quizQuestion.statement)).toBeTruthy();
    expect(screen.queryByLabelText(LOADING)).toBeNull();
  });

  it('TG-61 c2 c8 shows the question and its 4 options in the language of the app, unselected', async () => {
    const fetchSpy = mockApi([() => jsonResponse(quizQuestion)]);

    await renderScreen();

    expect(await screen.findByText(quizQuestion.statement)).toBeTruthy();
    for (const text of quizQuestion.options) {
      expect(option(text)).not.toBeChecked();
    }
    expect(screen.queryByText(rightResult.explanation)).toBeNull();
    expect((fetchSpy.mock.calls[0][0] as Request).url).toContain('lang=ca');
  });

  it('TG-61 c3 cannot send without an option and lets the person change it', async () => {
    mockApi([() => jsonResponse(quizQuestion)]);
    await renderScreen();
    await screen.findByText(quizQuestion.statement);

    expect(screen.getByRole('button', { name: SUBMIT })).toBeDisabled();

    await fireEvent.press(option('Mercuri'));
    await fireEvent.press(option('Venus'));

    expect(option('Venus')).toBeChecked();
    expect(option('Mercuri')).not.toBeChecked();
    expect(screen.getByRole('button', { name: SUBMIT })).toBeEnabled();
  });

  it('TG-61 c3 c4 sends the chosen option once and shows that it was right', async () => {
    let respond!: (response: Response) => void;
    const fetchSpy = mockApi(
      [() => jsonResponse(quizQuestion)],
      [
        () =>
          new Promise<Response>((resolve) => {
            respond = resolve;
          }),
      ],
    );
    await renderScreen();
    await screen.findByText(quizQuestion.statement);
    await fireEvent.press(option('Venus'));

    await fireEvent.press(screen.getByRole('button', { name: SUBMIT }));
    await fireEvent.press(screen.getByRole('button', { name: SUBMIT }));

    // TanStack Query tells the screen that the answer is pending on a later tick, not at once.
    await waitFor(() => expect(screen.getByRole('button', { name: SUBMIT })).toBeBusy());
    await act(async () => {
      respond(jsonResponse(rightResult, 201));
    });
    expect(await screen.findByRole('header', { name: "L'has encertada!" })).toBeTruthy();
    expect(screen.getByText('Venus · Resposta correcta i la teva resposta')).toBeTruthy();
    expect(screen.getByText(rightResult.explanation)).toBeTruthy();
    expect(await postedBodies(fetchSpy)).toEqual([
      { date: quizQuestion.date, question_id: quizQuestion.question_id, chosen_option: 1 },
    ]);
  });

  it('TG-653 sends the answer once when the button is pressed twice before the screen re-renders', async () => {
    let respond!: (response: Response) => void;
    const fetchSpy = mockApi(
      [() => jsonResponse(quizQuestion)],
      [
        () =>
          new Promise<Response>((resolve) => {
            respond = resolve;
          }),
      ],
    );
    await renderScreen();
    await screen.findByText(quizQuestion.statement);
    await fireEvent.press(option('Venus'));
    const submit = screen.getByRole('button', { name: SUBMIT });

    // Both presses happen before React renders the screen as busy (a slow phone, a quick tap):
    // nested in one act, React renders only when the outer act ends.
    await act(async () => {
      await Promise.all([fireEvent.press(submit), fireEvent.press(submit)]);
    });
    await act(async () => {
      respond(jsonResponse(rightResult, 201));
    });

    expect(await screen.findByRole('header', { name: "L'has encertada!" })).toBeTruthy();
    expect(await postedBodies(fetchSpy)).toEqual([
      { date: quizQuestion.date, question_id: quizQuestion.question_id, chosen_option: 1 },
    ]);
  });

  it('TG-61 c4 c9 marks the right option and the wrong one with words, not only colour', async () => {
    mockApi([() => jsonResponse(quizQuestion)], [() => jsonResponse(wrongResult, 201)]);
    await renderScreen();
    await screen.findByText(quizQuestion.statement);
    await fireEvent.press(option('Mercuri'));

    await fireEvent.press(screen.getByRole('button', { name: SUBMIT }));

    expect(await screen.findByRole('header', { name: "No l'has encertada" })).toBeTruthy();
    expect(screen.getByText('Venus · Resposta correcta')).toBeTruthy();
    expect(screen.getByText('Mercuri · La teva resposta')).toBeTruthy();
    expect(screen.getByText('Mart')).toBeTruthy();
  });

  it('TG-61 c4 opens the source of the answer', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockApi([() => jsonResponse(answeredQuestion)]);
    await renderScreen();

    await fireEvent.press(await screen.findByRole('link', { name: 'Llegeix la font' }));

    expect(openURL).toHaveBeenCalledWith(wrongResult.source_url);
  });

  it('TG-61 c5 shows the result straight away when the question is already answered', async () => {
    mockApi([() => jsonResponse(answeredQuestion)]);

    await renderScreen();

    expect(await screen.findByRole('header', { name: "No l'has encertada" })).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: SUBMIT })).toBeNull();
  });

  it('TG-61 c5 shows the result when the server says it was already answered', async () => {
    mockApi(
      [() => jsonResponse(quizQuestion), () => jsonResponse(answeredQuestion)],
      [() => problemResponse(409, 'QUIZ_ALREADY_ANSWERED')],
    );
    await renderScreen();
    await screen.findByText(quizQuestion.statement);
    await fireEvent.press(option('Venus'));

    await fireEvent.press(screen.getByRole('button', { name: SUBMIT }));

    expect(await screen.findByRole('header', { name: "No l'has encertada" })).toBeTruthy();
  });

  it.each(['QUIZ_EXPIRED', 'QUIZ_QUESTION_MISMATCH'])(
    'TG-61 c6 explains that the question changed and loads the new one after %s',
    async (code) => {
      mockApi(
        [() => jsonResponse(quizQuestion), () => jsonResponse(nextQuizQuestion)],
        [() => problemResponse(code === 'QUIZ_EXPIRED' ? 409 : 422, code)],
      );
      await renderScreen();
      await screen.findByText(quizQuestion.statement);
      await fireEvent.press(option('Venus'));

      await fireEvent.press(screen.getByRole('button', { name: SUBMIT }));

      expect(await screen.findByText(nextQuizQuestion.statement)).toBeTruthy();
      expect(
        screen.getByText('La pregunta ha canviat perquè ja és un altre dia. Aquesta és la nova.'),
      ).toBeTruthy();
      for (const text of nextQuizQuestion.options) {
        expect(option(text)).not.toBeChecked();
      }
    },
  );

  it('TG-61 c7 keeps the chosen option and lets the person send it again after an error', async () => {
    const fetchSpy = mockApi(
      [() => jsonResponse(quizQuestion)],
      [() => problemResponse(503, 'SESSION_UNAVAILABLE'), () => jsonResponse(rightResult, 201)],
    );
    await renderScreen();
    await screen.findByText(quizQuestion.statement);
    await fireEvent.press(option('Venus'));

    await fireEvent.press(screen.getByRole('button', { name: SUBMIT }));

    expect(await screen.findByText(SESSION_UNAVAILABLE_TEXT)).toBeTruthy();
    expect(option('Venus')).toBeChecked();

    await fireEvent.press(screen.getByRole('button', { name: SUBMIT }));

    expect(await screen.findByRole('header', { name: "L'has encertada!" })).toBeTruthy();
    expect(await postedBodies(fetchSpy)).toHaveLength(2);
  });

  it('TG-61 c7 shows a translated error with a retry when the question cannot be loaded', async () => {
    mockApi([
      () => {
        throw new TypeError('Network request failed');
      },
      () => {
        throw new TypeError('Network request failed');
      },
      () => jsonResponse(quizQuestion),
    ]);
    await renderScreen();

    expect(await screen.findByText(NETWORK_ERROR_TEXT)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));

    expect(await screen.findByText(quizQuestion.statement)).toBeTruthy();
  });

  it('TG-61 c7 shows a session error without retry when the session is gone', async () => {
    await clearTokens();
    jest.spyOn(globalThis, 'fetch');

    await renderScreen();

    expect(
      await screen.findByText('La teva sessió ha caducat. Torna a iniciar sessió.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('TG-61 c9 gives every option a touch target of at least 48 dp', async () => {
    mockApi([() => jsonResponse(quizQuestion)]);
    await renderScreen();
    await screen.findByText(quizQuestion.statement);

    for (const text of quizQuestion.options) {
      expect(option(text)).toHaveStyle({ minHeight: 48 });
    }
  });

  it('TG-61 goes back to the menu from the result with a button of the app', async () => {
    mockApi([() => jsonResponse(answeredQuestion)]);
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: "Torna a l'inici" }));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('TG-61 goes home when there is nowhere to go back to (opened from a link)', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    mockApi([() => jsonResponse(answeredQuestion)]);
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: "Torna a l'inici" }));

    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('TG-61 can also go back to the menu before answering', async () => {
    mockApi([() => jsonResponse(quizQuestion)]);
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: "Torna a l'inici" }));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['QUIZ_ALREADY_ANSWERED', 409],
    ['QUIZ_EXPIRED', 409],
    ['QUIZ_QUESTION_MISMATCH', 422],
  ])(
    'TG-61 c5-c7 shows the error with a retry when reloading after %s fails',
    async (code, status) => {
      const offline = () => {
        throw new TypeError('Network request failed');
      };
      mockApi(
        [
          () => jsonResponse(quizQuestion),
          offline,
          offline,
          () =>
            jsonResponse(code === 'QUIZ_ALREADY_ANSWERED' ? answeredQuestion : nextQuizQuestion),
        ],
        [() => problemResponse(status, code)],
      );
      await renderScreen();
      await screen.findByText(quizQuestion.statement);
      await fireEvent.press(option('Venus'));

      await fireEvent.press(screen.getByRole('button', { name: SUBMIT }));

      expect(await screen.findByText(NETWORK_ERROR_TEXT)).toBeTruthy();
      expect(screen.queryByRole('button', { name: SUBMIT })).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));

      if (code === 'QUIZ_ALREADY_ANSWERED') {
        expect(await screen.findByRole('header', { name: "No l'has encertada" })).toBeTruthy();
      } else {
        expect(await screen.findByText(nextQuizQuestion.statement)).toBeTruthy();
      }
    },
  );
});
