---
titol: "Sessió 2026-10-07: configuració del projecte backend"
tipus: sessio
estat: vigent
data: 2026-10-07
us: ["TG-31"]
font: "treball de la US TG-31 (commits TG-170 a TG-177 de la branca feature/#31)"
etiquetes: [sessio, backend, tg-31]
---

# Sessió 2026-10-07 · Configuració del projecte backend

## Objectiu

Deixar `backend/` com a projecte Python amb gestor de dependències, linter i type checker (US TG-31), seguint [[0013-uv-i-pnpm-com-a-gestors-de-dependencies]] i les convencions de [[qualitat]] i [[testing]].

## Què s'ha fet

- TG-170: projecte inicialitzat amb `uv` i Python 3.14 (`.python-version`, `pyproject.toml`, `uv.lock`).
- TG-171: dependències de desenvolupament amb versions fixades.
- TG-172: `ruff` (lint i format) configurat.
- TG-173: `mypy` en mode estricte.
- TG-174: `pytest` amb `pytest-asyncio` i cobertura (`--cov=app --cov-report=term-missing`).
- TG-175: estructura `app/` (`domain`, `application`, `infrastructure`) i `tests/` (`fixtures`, `factories`, `moderation_dataset`).
- TG-177: README del backend (ca, es, en) amb l'stack actualitzat i les ordres d'executar i testejar ja verificades; `pytest-xdist` retirat de la taula de tests.
- TG-176: sense commit propi a la branca.

## Decisions preses

Cap decisió nova; s'apliquen [[0013-uv-i-pnpm-com-a-gestors-de-dependencies]] i [[0004-arquitectura-hexagonal-i-tdd-al-domini]].

## Canvis al vault

- Aquesta nota i l'actualització de [[estat-actual]].

## Pendent / següents passos

- [ ] Obrir la PR cap a `develop` (CI en verd i aprovació d'una persona que no sigui l'autora).

## US de Taiga

- TG-31

## Enllaços

- [[estat-actual]]
- [[0013-uv-i-pnpm-com-a-gestors-de-dependencies]]
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]
