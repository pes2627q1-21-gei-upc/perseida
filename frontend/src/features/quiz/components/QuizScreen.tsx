import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '../../../shared/errors';
import { DEFAULT_LANGUAGE, type Language, SUPPORTED_LANGUAGES } from '../../../shared/i18n';
import { SkyBackground } from '../../../shared/ui';
import { QUESTION_CHANGED_CODES, useAnswerQuiz, useQuizToday } from '../hooks/useQuiz';
import { QuizQuestionView } from './QuizQuestionView';
import { QuizResultView } from './QuizResultView';
import { QuizStatus } from './QuizStatus';

function appLanguage(code: string): Language {
  return SUPPORTED_LANGUAGES.find((language) => language === code) ?? DEFAULT_LANGUAGE;
}

/**
 * Daily quiz screen (TG-61): the question, or the result once answered. It asks for the
 * question in the language of the app. Retrying after an error shows the loading state again.
 */
export function QuizScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = appLanguage(i18n.language);
  const { data, error, isFetching, refetch } = useQuizToday(lang);
  const answer = useAnswerQuiz(lang);
  const sendError = answer.error;
  const questionChanged = sendError !== null && QUESTION_CHANGED_CODES.has(sendError.code);
  // `answer.isPending` only changes on the next render: a second press before it would send
  // the answer again (TG-653). The ref blocks it at once and lets it go when the answer settles.
  const sending = useRef(false);

  function submit(date: string, questionId: string, chosenOption: number) {
    if (sending.current) return;
    sending.current = true;
    answer.mutate(
      { date, questionId, chosenOption },
      {
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  }

  function goBack() {
    // Opened from a link there is nowhere to go back to: go home instead.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  let content;
  if (error && !isFetching) {
    // Also when there is an older question in the cache: a failed reload (after
    // QUIZ_ALREADY_ANSWERED, QUIZ_EXPIRED or QUIZ_QUESTION_MISMATCH, or a new day) must
    // not leave it on screen as if it were current.
    const onRetry = error.retryable ? () => void refetch() : undefined;
    content = <QuizStatus state="error" code={error.code} onRetry={onRetry} />;
  } else if (data?.result) {
    content = <QuizResultView question={data} result={data.result} onBack={goBack} />;
  } else if (data) {
    content = (
      <QuizQuestionView
        // A new question (new day) starts with no option chosen.
        key={data.question_id}
        question={data}
        sending={answer.isPending}
        onBack={goBack}
        onSubmit={(chosenOption) => submit(data.date, data.question_id, chosenOption)}
        notice={questionChanged ? t('quiz.questionChanged') : undefined}
        error={
          sendError && !questionChanged && sendError.code !== 'QUIZ_ALREADY_ANSWERED'
            ? errorMessage(t, sendError.code, true)
            : undefined
        }
      />
    );
  } else {
    content = <QuizStatus state="loading" />;
  }

  return <SkyBackground>{content}</SkyBackground>;
}
