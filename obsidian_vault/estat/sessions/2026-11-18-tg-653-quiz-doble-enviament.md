---
titol: "Sessió 2026-11-18 · Doble enviament del quiz"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-653", "TG-61", "TG-629"]
font: "issue TG-653 a Taiga; CI de la PR #108 (dry run de Stryker)"
etiquetes: [sessio, frontend, quiz, testing]
---

# Sessió 2026-11-18 · Doble enviament del quiz

## Objectiu

Treure el doble enviament de la resposta del quiz diari, que trencava el dry run de Stryker de la PR #108 (TG-629).

## Què s'ha fet

- Issue TG-653 (Bug) creada a Taiga.
- Test de regressió a `QuizScreen.test.tsx`: dos tocs a «Envia la resposta» dins d'un sol `act`, abans que la pantalla torni a renderitzar. Vermell sense la correcció (dos `POST`) i verd amb la correcció.
- `QuizScreen.tsx`: un `useRef` bloqueja el segon enviament de seguida i el torna a permetre quan la resposta acaba (`onSettled`), perquè `answer.isPending` només canvia al render següent.
- Lint, prettier, `tsc` i els 37 tests de `src/features/quiz` en verd en local.

## Decisions preses

Cap ADR nova: és una correcció dins de [[frontend]].

## Canvis al vault

- Aquesta sessió.

## Pendent / següents passos

- [ ] PR cap a `develop` i revisió d'una persona que no sigui l'autora.
- [ ] Quan es fusioni, merge de `develop` a `feature/TG-629-sortides-frontend` (PR #108).

## US de Taiga

- TG-653
