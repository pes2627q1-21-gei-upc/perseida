---
titol: "Sessió 2026-10-14: CI del backend (TG-34)"
tipus: sessio
estat: vigent
data: 2026-10-14
us: ["TG-34"]
font: "PR #18 (feature/ci-backend-workflow); tasques #248 a #255 de Taiga"
etiquetes: [sessio, backend, ci, github-actions, tg-34]
---

# Sessió 2026-10-14 · CI del backend (TG-34)

## Objectiu

Afegir un workflow de GitHub Actions que executi lint, format, tipus i tests del backend a cada push i pull request cap a `develop` i `main`.

## Què s'ha fet

- `.github/workflows/ci.yml` amb el job `changes` (`dorny/paths-filter`) i el job `backend` (nom fixat perquè TG-33 el pugui exigir com a check requerit).
- Triggers `pull_request` i `push` a `develop` i `main`; `concurrency` amb `cancel-in-progress` i `permissions: contents: read`.
- Instal·lació amb `astral-sh/setup-uv` (uv fixat, Python 3.14, cache) i `uv sync --locked`.
- Passos: `ruff check`, `ruff format --check`, `mypy` i `pytest` amb cobertura; informe com a artefacte `backend-coverage`.
- PostgreSQL (PostGIS 18) i Redis 8 com a *service containers* amb *healthcheck*; variables d'entorn de CI només amb valors efímers.
- Test mínim `backend/tests/test_smoke.py` perquè `pytest` no falli sense tests.
- README del backend (ca, es, en): secció "Integració contínua".
- La PR #18 passa en verd (jobs `changes` i `backend`).

## Decisions preses

- `paths-filter` dins del workflow i no `paths:` a nivell de workflow, perquè un check requerit quedaria *pending* si el workflow no s'executa; així el job es marca com a omès.
- Cap decisió que mereixi una ADR nova.

## Canvis al vault

- [[arquitectura-fisica]]: la CI del backend ja existeix.
- [[qualitat]]: secció "CI del backend".

## Pendent / següents passos

- [ ] Fusionar la PR #18 cap a `develop` (aprovació d'una persona que no sigui l'autora).
- [ ] TG-34 #253: validar la CI amb sis PR d'acceptació tancades sense fusionar.
- [ ] SonarQube Cloud i Quality Gate (US [#194](https://tree.taiga.io/project/alexga03-astronomia-pes/t/194)).
- [ ] TG-33: exigir el check `backend` a la protecció de branques.
- [ ] Comprovar a una segona execució que la cache d'`uv` es restaura.

## US de Taiga

- TG-34
