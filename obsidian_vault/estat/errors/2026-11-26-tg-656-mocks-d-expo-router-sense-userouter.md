---
titol: "TG-656: mocks d'expo-router sense useRouter trenquen el xat directe"
tipus: error-testing
estat: corregit
data: 2026-11-26
us: [TG-656]
font: "Review de reviewer-arquitectura i pnpm test src/features/direct-chat"
fase: review
capa: frontend
regressio: "frontend/src/features/direct-chat/hooks/useDirectConversation.test.tsx (tota la suite)"
commit:
llico: cap
etiquetes: [error-testing, tg-656, frontend]
---

# Afegir useRouter al nucli compartit va trencar 35 tests del xat directe

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Després del `feat:`, `pnpm test src/features/direct-chat` donava 35 tests fallits: `TypeError: (0 , _expoRouter.useRouter) is not a function`. Només es van executar les suites de `chat`, `auth` i `app`, per això no es va veure fins a la review.

## Causa

`useLiveConversation` és compartit amb el xat directe i ara crida `useRouter()`. Dos tests de `direct-chat` mockegaven `expo-router` només amb `useIsFocused`.

## Correcció

Els dos mocks (`useDirectConversation.test.tsx` i `.inbox.test.tsx`) exposen també `useRouter`.

## Test de regressió

Les mateixes suites de `direct-chat`: fallen si el mock no té `useRouter`.

## Lliçó

`cap` com a regla nova: en tocar un hook compartit, s'executen les suites de tots els seus consumidors (`grep` de qui l'importa), no només les de la feature on s'edita.
