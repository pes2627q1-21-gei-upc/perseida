---
titol: "TG-352: una ruta imbricada no declarada al layout de pestanyes no s'obre"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Verd de la PR 3 de TG-352 (subagents qa-tester i frontend, 22/11/2026)"
fase: roig-inesperat
capa: frontend
regressio: "frontend/src/features/navigation/__tests__/meetingPointsRoute.test.tsx"
commit: "31a690e4"
llico: cap
etiquetes: [error-testing]
---

# TG-352: una ruta imbricada no declarada al layout de pestanyes no s'obre

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Amb el fitxer `src/app/(app)/meeting-points/[eventId].tsx` creat, `router.push('/meeting-points/<id>')` tornava a l'inici. Declarar la ruta a `HIDDEN_ROUTES` trencava `navigationConfig.test.ts`, que només admet fitxers de primer nivell o carpetes amb `_layout`.

## Causa

El layout `(app)/_layout.tsx` és un `Tabs` d'expo-router: una subruta imbricada sense `_layout` propi i no declarada com a `Tabs.Screen` no es pot obrir. `HIDDEN_ROUTES` estava pensada només per a rutes de primer nivell.

## Correcció

Llista nova `HIDDEN_NESTED_ROUTES = ['meeting-points/[eventId]']` a `navigationConfig.ts`; el layout amaga `[...HIDDEN_ROUTES, ...HIDDEN_NESTED_ROUTES]` de la barra (decisió de Raquel, 22/11/2026).

## Test de regressió

`frontend/src/features/navigation/__tests__/meetingPointsRoute.test.tsx`: la ruta s'obre amb la URL inicial i amb `router.push`, i la barra només mostra les 5 pestanyes.

## Lliçó

Cap per ara. El mateix podria afectar `/outings/*` (TG-629), que no és a cap de les dues llistes; Raquel ho provarà a l'app abans d'obrir les PR. Si es confirma, cal una regla a [[frontend]] sobre on es declaren les rutes imbricades.
