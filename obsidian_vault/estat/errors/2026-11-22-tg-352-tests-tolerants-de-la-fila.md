---
titol: "TG-352: tests de la fila de local massa tolerants"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Stryker de la PR 2 de TG-352 (subagent frontend, 22/11/2026)"
fase: ci-mutants
capa: frontend
regressio: "frontend/src/features/meeting-points/components/MeetingPointRow.test.tsx, MeetingPointList.test.tsx, api/meetingPoints.test.ts"
commit: "30d38f2b, 3a02e76c, aba83988"
llico: cap
etiquetes: [error-testing]
---

# TG-352: tests de la fila de local massa tolerants

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

El primer Stryker de la PR 2 (139 mutants) donava 88,17 %, amb supervivents de lògica a `MeetingPointRow.tsx` (línies 23, 25, 28, 53 i 96), `MeetingPointList.tsx` (41 i 50-51) i `meetingPoints.ts:32`. Un xip de més, un xip que només surt a l'etiqueta accessible o un separador buit a l'etiqueta no feien fallar cap test.

## Causa

Els tests de la fase vermella eren tolerants a propòsit, per no fixar textos ni maquetació abans del verd:

- el helper `says()` acceptava el text visible o dins de l'etiqueta, i només buscava xips concrets, no el conjunt exacte;
- no es comprovaven el `retryHint`, l'estat d'error amb `error=null` ni el `kind` de `INVALID_RESPONSE`;
- no es comprovava el separador de l'etiqueta.

## Correcció

Tests nous que fixen el conjunt exacte de xips visibles, l'etiqueta sense parts buides, el `retryHint`, l'error sense codi i `kind: 'http'`. Stryker: 98,92 % (1 supervivent equivalent a `MeetingPointList.tsx:50`, `'GENERIC_FINAL'` → `""`, amb el mateix text visible).

## Test de regressió

`MeetingPointRow.test.tsx` (helper `visibleChips` i tests de l'etiqueta), `MeetingPointList.test.tsx` (`retryHint` i `error=null`) i `meetingPoints.test.ts` (`kind`), commits `30d38f2b`, `3a02e76c` i `aba83988`.

## Lliçó

Cap: el mutation testing de la PR ha fet la seva feina i ha trobat els buits abans de la review. Si torna a passar, cal afegir a `testing-tdd` que els tests de components comproven el conjunt exacte del que es mostra, no només la presència.
