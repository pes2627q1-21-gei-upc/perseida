---
titol: "TG-65: Stryker no cobria els límits del marcador de lectura"
tipus: error-testing
estat: corregit
data: 2026-11-24
us: [TG-65]
font: "CI runs 45449386085 i 45453950290; commit 0dba3327"
fase: ci-mutants
capa: frontend
regressio: "frontend/src/features/direct-chat/hooks/useDirectConversation.test.tsx::TG-65 criteria 9 and 11 does not mark read for an empty history page array; TG-65 criterion 11 marks an incoming live message read by its ID after history loads"
commit: 0dba3327
llico: cap
etiquetes: [error-testing, tg-65, frontend, mutation-testing]
---

# La cobertura de mutació no comprovava els límits del marcador de lectura

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

El run `45449386085` va donar `58,33 %`, per sota del llindar del `70 %`.

## Causa

Els tests no exercitaven una llista de pàgines buida ni el camí que marca com a llegit un missatge nou rebut en temps real després de refrescar l'historial.

## Correcció

El commit `0dba3327` afegeix regressions per als dos casos. La CI del run `45453950290` passa amb `91,67 %`: 7 mutants morts, 4 timeouts, 1 supervivent i cap mutant sense cobertura o amb error. El supervivent `if (newestMessage) → if (true)` és equivalent: amb l'historial buit, l'accés a `.id` rebutja la promesa i el `.catch` evita enviar la petició de lectura. La verificació local va donar `83,33 %` (10 morts i 2 supervivents equivalents).

## Test de regressió

`frontend/src/features/direct-chat/hooks/useDirectConversation.test.tsx::TG-65 criteria 9 and 11 does not mark read for an empty history page array` i `frontend/src/features/direct-chat/hooks/useDirectConversation.test.tsx::TG-65 criterion 11 marks an incoming live message read by its ID after history loads`.

## Lliçó

`cap`: els casos límit de l'historial i el missatge en viu han de tenir assertions sobre l'ID exacte enviat o l'absència de petició.
