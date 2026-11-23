---
titol: "TG-352: els punts de trobada es tornaven a demanar a cada muntatge"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Review de la PR 2 de TG-352 (subagent reviewer-arquitectura, 22/11/2026)"
fase: review
capa: frontend
regressio: "frontend/src/features/meeting-points/hooks/useMeetingPoints.test.tsx (test de frescor de 5 minuts)"
commit: "97c4ef10"
llico: cap
etiquetes: [error-testing]
---

# TG-352: els punts de trobada es tornaven a demanar a cada muntatge

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Un segon muntatge de `useMeetingPoints` dins dels 5 minuts tornava a cridar `/api/meeting-points`. Cada crida que no troba la cache del backend gasta una de les 60 crides per minut a Spotwise ([[contracte-spotwise#Integració a Perseida (TG-352)]]).

## Causa

`useMeetingPoints` no tenia `staleTime`, i TanStack Query el posa a 0 per defecte. Altres hooks del repo (p. ex. `useEvents`) ja el fixen.

## Correcció

`staleTime` de 5 minuts, igual que el TTL de la cache del backend.

## Test de regressió

`frontend/src/features/meeting-points/hooks/useMeetingPoints.test.tsx`: un nou muntatge a 4:59 no fa cap crida; a 5:01, sí (commit `97c4ef10`).

## Lliçó

Cap: la skill `frontend-crida-api` ja demana triar el `staleTime` de cada query; error puntual.
