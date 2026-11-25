---
titol: "TG-59: dos tests de la secció de fites buscaven el contingut abans que acabés la càrrega"
tipus: error-testing
estat: corregit
data: "2026-11-25"
us: ["TG-59"]
font: "Dry run de Stryker (pnpm test:mutation) a la sessió de TG-59, 25/11/2026"
fase: ci-mutants
capa: frontend
regressio: "frontend/src/features/achievements/components/AchievementsSection.test.tsx (criteri 1 i criteri 8)"
commit:
llico: convencio
etiquetes: [error-testing]
---

# TG-59: dos tests de la secció de fites buscaven el contingut abans que acabés la càrrega

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

`pnpm test:mutation` s'aturava amb «There were failed tests in the initial test run» a `AchievementsSection.test.tsx` (`Unable to find an element with role: button`). Amb `pnpm jest` sol els tests passaven, així que el fallo només es veia sota Stryker, que va més lent.

## Causa

`AchievementsSection` pinta el títol (`header`) i el panell de càrrega des del primer moment. Els tests esperaven amb `findByRole('header')` o `findByTestId('glass-panel')`, que ja existeixen durant la càrrega, i després cercaven els botons o els candaus, que només arriben amb les dades. El test passava per sort de temps.

## Correcció

Tots dos tests esperen primer una cosa que només existeix amb les dades (`await screen.findByText('Primera llum')`) i després fan les comprovacions síncrones.

## Test de regressió

Els mateixos tests, `AchievementsSection.test.tsx`, repetits tres cops amb Jest sol i després amb el dry run de Stryker.

## Lliçó

Convenció: en un test d'una pantalla que carrega dades, l'espera (`findBy*`) ha de ser sobre contingut que només apareix amb les dades, mai sobre el títol, el contenidor ni el panell de càrrega. Si es repeteix, s'afegeix a [[testing]].
