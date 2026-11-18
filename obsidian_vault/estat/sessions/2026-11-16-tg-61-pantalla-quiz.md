---
titol: "Sessió 2026-11-16: pantalla del quiz diari (TG-61, tasques #600-#614)"
tipus: sessio
estat: vigent
data: "2026-11-16"
us: ["TG-61"]
font: "Taiga: TG-61 i tasques #600-#614; contracte del quiz (TG-60, PR #80)"
etiquetes: [sessio, frontend, quiz, gamificacio, sessio-usuari]
---

# Sessió 2026-11-16 · Pantalla del quiz diari (TG-61)

## Objectiu

Fer la pantalla del quiz diari sobre el backend de TG-60, ja fusionat a `develop` ([[contracte-quiz]]).

## Què s'ha fet

- **Sessió als endpoints privats:** `withSession` (`features/auth/api/authorized.ts`). És la primera pantalla que en necessita: posa el `Bearer`, renova la sessió un cop amb un 401 i, sense sessió, falla amb `INVALID_SESSION`.
- **API i hooks:** `getQuizToday` i `answerQuizToday` (`features/quiz/api/quiz.ts`), `useQuizToday` i `useAnswerQuiz` (`features/quiz/hooks/useQuiz.ts`), amb una entrada de cache per idioma.
- **Pantalla:** `QuizScreen` (ruta `/(app)/quiz`), amb `QuizQuestionView`, `QuizOption`, `QuizResultView` i `QuizStatus`. Accés des de l'inici temporal.
- **Textos:** `quiz.*`, `home.quizLink` i `errors.QUIZ_*` en ca/es/en.
- **Tests:** `authorized.test.ts`, `quiz.test.ts`, `useQuiz.test.tsx` i `QuizScreen.test.tsx`, un per criteri.

## Decisions

- Una sola pregunta al dia (contracte de TG-60): la US es va reescriure abans de començar, ja que l'esborrany parlava de 5 preguntes.
- L'accés a la pestanya de Gamificació queda per quan hi hagi la #385.

## Pendent

- Prova en un mòbil amb l'APK contra el backend real (tasca #612).
