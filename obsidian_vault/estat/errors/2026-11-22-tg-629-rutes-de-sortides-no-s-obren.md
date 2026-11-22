---
titol: "TG-629: les rutes de sortides no s'obrien i tornaven a l'inici"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-629", "TG-352"]
font: "Review de la PR 3 de TG-352 (subagent reviewer-arquitectura) i test guardià nou (subagent qa-tester), 22/11/2026"
fase: review
capa: frontend
regressio: "frontend/src/features/navigation/__tests__/outingsRoutes.test.tsx i navigationConfig.test.ts (rutes imbricades)"
commit: "32c8ccc1"
llico: convencio
etiquetes: [error-testing]
---

# TG-629: les rutes de sortides no s'obrien i tornaven a l'inici

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Amb el router real i el layout de pestanyes, `router.push` cap a `/outings`, `/outings/new`, `/outings/<id>` i `/outings/<id>/edit` tornava a `/`. Cap test ho veia: `routes.test.tsx` renderitzava les rutes soles i `MapScreen.test` simulava el router.

## Causa

`src/app/(app)/outings/` no té `_layout` i les seves rutes no estaven declarades al layout de pestanyes `(app)/_layout.tsx`. Amb expo-router 58, una ruta imbricada no declarada no s'obre. És la mateixa causa que [[2026-11-22-tg-352-ruta-imbricada-sense-declarar]], que ja va passar a TG-629 i que el test guardià no detectava.

## Correcció

Les quatre rutes es declaren a `HIDDEN_NESTED_ROUTES`, la llista de rutes imbricades que el layout amaga de la barra (TG-352). El test guardià de `navigationConfig.test.ts` busca ara totes les rutes dins de carpetes sense `_layout` i exigeix que hi siguin.

## Test de regressió

- `frontend/src/features/navigation/__tests__/outingsRoutes.test.tsx`: `router.push` a les quatre rutes amb l'`AppLayout` real.
- `frontend/src/features/navigation/navigationConfig.test.ts`: el bloc «routes inside a folder with no layout of its own».

## Lliçó

Convenció: [[frontend#Navegació per pestanyes i perfil (TG-385)]] diu ara on es declara una ruta imbricada i que el test guardià les comprova totes. Com que la causa s'ha repetit dues vegades, el test guardià fa la regla obligatòria.
