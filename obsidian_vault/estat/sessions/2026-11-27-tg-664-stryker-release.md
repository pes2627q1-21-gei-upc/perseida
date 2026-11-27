---
titol: "Sessió 2026-11-27: Stryker de la release 0.3.0 arriba al timeout (TG-664)"
tipus: sessio
estat: vigent
data: "2026-11-27"
us: ["TG-664"]
font: "PR #176 (run 46035022604 de la CI, cancel·lat als 60 min); .github/workflows/ci.yml; frontend/scripts/run-stryker-diff.mjs; acceptació del Scrum Master per arreglar-ho a release/0.3.0"
etiquetes: [sessio, ci, testing, stryker, release]
---

# Sessió 2026-11-27 · Stryker de la release 0.3.0 arriba al timeout

## Objectiu

Desbloquejar la PR #176 (`release/0.3.0` → `main`), que tenia la CI cancel·lada per timeout.

## Què s'ha fet

- **Diagnòstic:** backend, proxy, lint i tests del frontend van passar en uns 4 min. El pas «Mutation testing al frontend (Stryker >= 70%)» va arribar al `timeout-minutes: 60` del job `frontend`, i `sonar` es va saltar. Amb `--pr-number`, `run-stryker-diff.mjs` diffejava contra `origin/main` i, com que la release porta tot l'sprint, analitzava 176 fitxers que ja s'havien mutat a cada PR `feature/*` → `develop`.
- **Arreglo a `.github/workflows/ci.yml`:** quan `github.head_ref` és `release/*`, Stryker diffeja contra `origin/develop` sense `--pr-number`, perquè l'API tornaria `main`. Respecte a `develop`, la release no canvia cap fitxer de `frontend/src`. Les PR `feature/*` i `hotfix/*` continuen com abans. `head_ref`, `base_ref` i el número de la PR passen per `env` per evitar injecció d'ordres amb el nom de la branca.
- El Scrum Master va acceptar fer el bugfix de CI directament a `release/0.3.0`.

## Decisions preses

Cap ADR nova. Regla de CI: una PR de release només muta els canvis fets a la mateixa release.

## Canvis al vault

- [[qualitat]]: base del diff de Stryker per a les PR `release/*` → `main`.

## Pendent / següents passos

- [ ] Comprovar que la CI de la PR #176 queda verda.
- [ ] Portar el canvi a `develop` quan es fusioni la release.
- [ ] Tancar TG-664 a Taiga.

## US de Taiga

- TG-664
