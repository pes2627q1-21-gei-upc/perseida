// Simulated quiz API responses for the quiz tests (TG-61). Same shape as the contract
// (obsidian_vault/arquitectura/contracte-quiz.md) and the OpenAPI of the backend.

export const QUIZ_DATE = '2026-11-16';

export const quizQuestion = {
  date: QUIZ_DATE,
  question_id: '01a1bd9a-c800-7585-87a8-98fa50903257',
  language: 'ca',
  statement: 'Quin és el planeta més calent del sistema solar?',
  options: ['Mercuri', 'Venus', 'Mart', 'Júpiter'],
  result: null,
} as const;

export const nextQuizQuestion = {
  ...quizQuestion,
  date: '2026-11-17',
  question_id: '01a1bd9a-c801-7d0e-8f1c-1a2b3c4d5e6f',
  statement: 'Quin planeta té més llunes conegudes?',
  options: ['Júpiter', 'Saturn', 'Urà', 'Neptú'],
} as const;

export const rightResult = {
  chosen_option: 1,
  correct: true,
  correct_option: 1,
  explanation: "Venus, tot i que Mercuri és més a prop del Sol: l'atmosfera reté la calor.",
  source_url: 'https://science.nasa.gov/venus/facts',
  answered_at: '2026-11-16T10:00:00Z',
} as const;

export const wrongResult = { ...rightResult, chosen_option: 0, correct: false } as const;

export const answeredQuestion = { ...quizQuestion, result: wrongResult } as const;
