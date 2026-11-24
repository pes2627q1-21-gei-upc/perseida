---
titol: "TG-65: Stryker quedava sota el llindar a la integració del xat"
tipus: error-testing
estat: obert
data: 2026-11-24
us: [TG-65]
font: "CI runs 45446259997 i 45465198435; commit aa95385d"
fase: ci-mutants
capa: frontend
regressio: "frontend/src/features/direct-chat/components/ConversationsScreen.test.tsx::latest message previews and empty-message state; frontend/src/features/direct-chat/hooks/useDirectTyping.lifecycle.test.tsx::does not send a stop signal on unmount if typing never started"
commit: aa95385d
llico: skill
etiquetes: [error-testing, tg-65, frontend, mutation-testing]
---

# El mutation score de la capa d'integració del xat no arribava al 70 %

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

La CI dels runs `45446259997` i `45465198435` va donar `67,66 %` i `69,86 %`. El run més recent té 346 morts, 4 timeout, 145 supervivents, 6 sense cobertura i 0 errors: falta un mutant comptable per arribar al llindar del `70 %`. La CI ha resolt i utilitzat la base real `origin/feature/TG-65-front-conversation-core`.

## Causa

Faltaven assertions sobre les previsualitzacions de missatge a la llista, l'estat d'una conversa sense missatges i la neteja de l'indicador d'escriptura quan el hook es desmunta abans de començar a escriure.

## Correcció

El commit test-only `aa95385d` afegeix quatre regressions; les proves dirigides passen (2 suites, 23 tests), però la CI `45465198435` encara queda per sota del llindar. L'execució local de Stryker va fer servir `origin/develop` com a base perquè no va resoldre la base real de la PR, per tant el seu `77,29 %` no és comparable amb el diff apilat de #154. Cal un altre test-only canvi i una CI verda abans de tancar aquest error.

## Test de regressió

`frontend/src/features/direct-chat/components/ConversationsScreen.test.tsx::shows the latest message preview from the other participant without a sender prefix`, `frontend/src/features/direct-chat/components/ConversationsScreen.test.tsx::prefixes the latest message preview when it was sent by the current user`, `frontend/src/features/direct-chat/components/ConversationsScreen.test.tsx::shows the empty-message state when the conversation has no latest message` i `frontend/src/features/direct-chat/hooks/useDirectTyping.lifecycle.test.tsx::does not send a stop signal on unmount if typing never started`.

## Lliçó

`skill`: abans de validar Stryker en una PR apilada, confirmar que el diff es calcula contra la base real de la PR; no acceptar el resultat d'una comparació contra `develop`.
