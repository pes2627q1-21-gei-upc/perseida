---
titol: "TG-352: el botó enrere de les subrutes tornava sempre a l'inici"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352", "TG-629"]
font: "Prova manual de Raquel a web (393×852), 22/11/2026"
fase: prova-manual
capa: frontend
regressio: "frontend/src/features/navigation/__tests__/backNavigation.test.tsx"
commit: "b90a8ee7, b82aa5aa"
llico: cap
etiquetes: [error-testing]
---

# TG-352: el botó enrere de les subrutes tornava sempre a l'inici

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

A la pantalla de punts de trobada, a l'edició d'una sortida i a les sortides d'un esdeveniment, el botó enrere tornava a l'inici i no a la pantalla d'on es venia (el mapa o la llista de sortides).

## Causa

El `Tabs` de `src/app/(app)/_layout.tsx` no tenia `backBehavior`. El valor per defecte, `firstRoute`, fa que `router.back()` dins del navegador de pestanyes vagi a la primera pestanya. Les subrutes amagades són pantalles del mateix `Tabs`, així que totes tornaven a l'inici. Els tests de rutes només comprovaven que s'obrien, no la tornada.

## Correcció

`backBehavior="history"` al `Tabs`: enrere segueix l'historial.

## Test de regressió

`frontend/src/features/navigation/__tests__/backNavigation.test.tsx`: amb l'`AppLayout` real, `/map` → punts de trobada, `/outings` → edició i `/map` → sortides d'un esdeveniment tornen, en fer enrere, a la pantalla d'origen.

## Lliçó

Cap: [[frontend#Navegació per pestanyes i perfil (TG-385)]] ja diu que les subrutes són pantalles del `Tabs`; el test de tornada en vigila la regressió.
