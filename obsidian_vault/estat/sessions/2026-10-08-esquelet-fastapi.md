---
titol: "Sessió 2026-10-08: esquelet de l'aplicació FastAPI"
tipus: sessio
estat: vigent
data: 2026-10-08
us: ["TG-39"]
font: "treball de la US TG-39 (commits TG-179 a TG-186 de la branca feature/#39); l'equip accepta les ADR 0016-0021"
etiquetes: [sessio, backend, tg-39]
---

# Sessió 2026-10-08 · Esquelet de l'aplicació FastAPI

## Objectiu

Deixar una aplicació FastAPI async amb les capes `domain`, `application` i `infrastructure` (US TG-39), amb el mòdul `health` com a exemple de referència, seguint [[0016-ports-i-entitats-riques-al-domini]] i [[0017-injeccio-de-dependencies-i-services-singleton]].

## Què s'ha fet

- TG-179: `fastapi`, `pydantic` i `uvicorn` amb versió exacta, plugin `pydantic.mypy` i `app/main.py` (`create_app()` + `lifespan` buit).
- TG-180: `HealthStatus`, `HealthReport`, port `HealthCheck` (domini) i `HealthService` (application).
- TG-181: `ApplicationCheck` i `GET /health` amb `HealthResponse`.
- TG-182: `get_health_service` (`@lru_cache`) i `HealthServiceDep`.
- TG-183: tests unitaris i `FakeHealthCheck`.
- TG-184: tests d'integració de l'API (`/health`, `dependency_overrides`, OpenAPI, `/docs`, lifespan).
- TG-185: test d'arquitectura amb `ast` (domain i application) i un segon test amb `tmp_path` que prova la detecció.
- TG-186: README del backend en ca/es/en.
- Els tests s'han escrit després del codi ([[0019-tests-despres-del-codi]]).

## Decisions preses

L'equip accepta les ADR [[0016-ports-i-entitats-riques-al-domini]], [[0017-injeccio-de-dependencies-i-services-singleton]], [[0018-errors-rfc-9457-amb-codis-estables]], [[0019-tests-despres-del-codi]], [[0020-frontend-expo-router-i-estetica-frutiger-cosmo]] i [[0021-subagents-agnostics-i-generador]]. [[0004-arquitectura-hexagonal-i-tdd-al-domini]] queda parcialment substituïda.

## Canvis al vault

- ADR 0016–0021 a `acceptada`; avís de «pendent de consens» retirat de [[0019-tests-despres-del-codi]] i de les referències a «proposada» a [[00-index]], [[backend-hexagonal]], `AGENTS.md`, els subagents i les skills (`gestio-errors`, `backend-port`).
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]: avís «Parcialment substituïda».
- [[testing]]: «TDD al domini» passa a «Quan s'escriuen els tests».
- [[estat-actual]]: TG-31 i TG-205 a Done, TG-39 a In progress.

## Pendent / següents passos

- [ ] Obrir la PR cap a `develop` (la persona).
- [ ] [[assistents-ia]] encara esmenta TDD al domini; revisar-ho.
- [ ] TG-49: afegir PostgreSQL i Redis als `HealthCheck`.

## US de Taiga

- TG-39
