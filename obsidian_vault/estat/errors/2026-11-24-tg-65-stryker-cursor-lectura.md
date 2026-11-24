---
titol: "TG-65: Stryker no cobria els límits del marcador de lectura"
tipus: error-testing
estat: corregit
data: 2026-11-24
us: [TG-65]
font: "CI runs 45449386085, 45453950290 i 45475096219; commit 0dba3327"
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

El run `45449386085` va donar `58,33 %`, per sota del llindar del `70 %`. Després del rebase de #163, la CI `45475096219` ha verificat el canvi sobre la base real i ha passat amb `83,33 %`.

## Causa

Els tests no exercitaven una llista de pàgines buida ni el camí que marca com a llegit un missatge nou rebut en temps real després de refrescar l'historial.

## Correcció

El commit `0dba3327` afegeix regressions per als dos casos. La CI original `45453950290` va passar amb `91,67 %` (7 morts, 4 timeouts, 1 supervivent). La CI post-rebase `45475096219` passa amb `83,33 %` (10 morts, 2 supervivents, 0 timeout, 0 sense cobertura/error); el backend i Sonar també passen. Els dos supervivents són la retirada de l'optional chaining i el canvi `if (newestMessage) → if (true)` quan `pages=[]`. En ambdós casos no s'arriba a cridar `markRead`: la fallada d'accés es captura a la cadena de promeses. No s'ha exclòs ni canviat cap mutant. La verificació local també va donar `83,33 %` (10 morts i 2 supervivents).

## Test de regressió

`frontend/src/features/direct-chat/hooks/useDirectConversation.test.tsx::TG-65 criteria 9 and 11 does not mark read for an empty history page array` i `frontend/src/features/direct-chat/hooks/useDirectConversation.test.tsx::TG-65 criterion 11 marks an incoming live message read by its ID after history loads`.

## Lliçó

`cap`: els casos límit de l'historial i el missatge en viu han de tenir assertions sobre l'ID exacte enviat o l'absència de petició.
