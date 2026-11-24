---
titol: "TG-65: Stryker quedava sota el llindar a la integració del xat"
tipus: error-testing
estat: corregit
data: 2026-11-24
us: [TG-65]
font: "CI runs 45446259997, 45465198435 i 45471190997; commits aa95385d i 569b9ab2"
fase: ci-mutants
capa: frontend
regressio: "frontend/src/features/direct-chat/components/ConversationsScreen.test.tsx::latest message previews and empty-message state; frontend/src/features/direct-chat/components/ConversationsScreen.announce.test.tsx::does not expose a zero announcement on the initial Android result; frontend/src/features/direct-chat/hooks/useDirectTyping.lifecycle.test.tsx::does not send a stop signal on unmount if typing never started"
commit: 569b9ab2
llico: skill
etiquetes: [error-testing, tg-65, frontend, mutation-testing]
---

# El mutation score de la capa d'integració del xat no arribava al 70 %

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Els runs `45446259997` i `45465198435` van donar `67,66 %` i `69,86 %`. La CI final `45471190997` passa amb `71,26 %` (356 morts, 1 timeout, 138 supervivents, 6 sense cobertura i 0 errors), sobre la base real `origin/feature/TG-65-front-conversation-core`.

## Causa

Faltaven assertions sobre les previsualitzacions de missatge a la llista, l'estat d'una conversa sense missatges i la neteja de l'indicador d'escriptura quan el hook es desmunta abans de començar a escriure.

## Correcció

Els commits test-only `aa95385d` i `569b9ab2` afegeixen regressions per a previsualitzacions, estat buit, neteja del typing i anuncis accessibles per plataforma. Les proves dirigides passen (3 suites, 29 tests). Stryker dirigit sobre les línies 67 i 114 de `ConversationsScreen.tsx` dona `94,74 %` (18 morts, 1 supervivent, 0 timeout i 0 sense cobertura) i mata 7 dels 8 supervivents inicials d'aquestes línies. El supervivent `total === 0 → true` no s'ha declarat equivalent ni exclòs. La CI completa `45471190997` passa el llindar de mutació i el SonarQube Quality Gate; l'execució local anterior amb `origin/develop` no és comparable amb el diff apilat de #154.

## Test de regressió

`frontend/src/features/direct-chat/components/ConversationsScreen.test.tsx::shows the latest message preview from the other participant without a sender prefix`, `frontend/src/features/direct-chat/components/ConversationsScreen.test.tsx::prefixes the latest message preview when it was sent by the current user`, `frontend/src/features/direct-chat/components/ConversationsScreen.test.tsx::shows the empty-message state when the conversation has no latest message`, `frontend/src/features/direct-chat/components/ConversationsScreen.announce.test.tsx::does not expose a zero announcement on the initial Android result` and `frontend/src/features/direct-chat/hooks/useDirectTyping.lifecycle.test.tsx::does not send a stop signal on unmount if typing never started`.

## Lliçó

`skill`: abans de validar Stryker en una PR apilada, confirmar que el diff es calcula contra la base real de la PR; no acceptar el resultat d'una comparació contra `develop`.
