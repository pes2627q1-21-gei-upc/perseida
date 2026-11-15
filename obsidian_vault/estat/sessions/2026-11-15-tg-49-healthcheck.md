---
titol: "Sessió 2026-11-15 · Healthcheck amb PostgreSQL i Redis (TG-49)"
tipus: sessio
estat: vigent
data: "2026-11-15"
us: ["TG-49"]
font: "Taiga: US TG-49 i tasques #546-#548; pla aprovat per Manel en aquesta sessió (15/11/2026); commits i verificacions locals"
etiquetes: [sessio, backend, healthcheck, cd]
---

# Sessió 2026-11-15 · Healthcheck amb PostgreSQL i Redis (TG-49)

## Objectiu

Que `GET /api/health` reflecteixi l'estat real de [[postgres]] i [[redis]], perquè el CD faci rollback quan el backend no pot treballar ([[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]). Branca `feature/TG-49-healthcheck`.

## Què s'ha fet

| Criteri / tasca | Canvi i evidència |
| --- | --- |
| C1, #546 | `PostgresCheck` (`select(1)`, crític) a `backend/app/infrastructure/health/checks.py`. PostgreSQL caigut fa `status` `down`. |
| C2, #547 | `RedisCheck` (`PING`, no crític). El port `HealthCheck` té la propietat `critical` i `HealthReport.from_checks(..., optional=...)` només posa `down` l'estat general si cau un component crític. |
| C3, #546 | `HealthService(checks, timeout_seconds=2.0)` executa les comprovacions en paral·lel amb `asyncio.wait_for`: una de lenta o que falla compta com a `down` i l'endpoint respon en uns 2 s com a màxim. |
| C4 | La forma de la resposta no canvia i l'endpoint continua públic. `deploy.sh` no es toca. OpenAPI i `schema.d.ts` regenerats per l'exemple nou. |
| C5 | El `HealthService` es construeix al lifespan i `get_health_service` el llegeix d'`app.state`, com `auth_service` ([[0017-injeccio-de-dependencies-i-services-singleton]]). El servei no importa SQLAlchemy ni Redis. |
| C6, #548 | Commit `test:` (`13515ec`) en vermell abans del `feat:` (`6062658`) ([[0028-tdd-estricte-i-politica-de-testing-avancada]]). Tests de domini, servei, adaptadors i API; d'integració contra PostgreSQL i Redis reals (només a la CI) i amb ports tancats i un servidor que no respon. |
| C7, #548 | [[api]] (secció Healthcheck), [[redis]], actualització a l'ADR-0025, README d'`infra/` i del backend (en, ca, es). |

### Ordres i resultats (local, sense Docker)

- `uv run pytest`: 1074 passats i 137 saltats (els que necessiten PostgreSQL i Redis reals). Cobertura total del 96 %; mòdul `health` entre el 94 % i el 100 %. Les línies sense cobrir de `PostgresCheck` són la branca d'error, que a Linux (CI) sí que s'executa.
- `ruff check`, `ruff format --check`, `mypy`, `lint-imports` i `uv sync --locked`: nets.

## Decisions preses

Totes les ha aprovat Manel. Cap ADR nova.

- El scheduler continua sent crític, com abans.
- El límit de 2 s és un paràmetre de `HealthService` amb valor per defecte, perquè els tests no hagin d'esperar.
- L'ADR-0025 es completa amb un callout d'actualització, com l'ADR-0017, en lloc d'una ADR nova.

## Revisió d'arquitectura

Sense troballes crítiques ni altes. Les mitjanes estan aplicades: actualització de l'ADR-0025, README del backend (el mòdul `health` ja no és l'exemple de provider amb `lru_cache`), cota inferior al test del límit de 2 s, i comparació exacta del cos al test del cicle de vida del scheduler. L'historial s'ha reordenat perquè el `feat:` no deixi cap test en vermell.

## Pendents

- [ ] PR cap a `develop`, aprovació d'una altra persona, CI i Quality Gate verds, fusió.
- [ ] Mutation testing de `backend/app/domain/health/models.py` (ADR-0028): l'eina encara no hi és (US #359-#362).
- [ ] El primer desplegament amb TG-49 encara fa la sonda amb la imatge anterior, que no consulta PostgreSQL.
- [ ] Les branques de TG-49 i TG-363 toquen totes dues el frontmatter d'[[api]]: qui fusioni la segona haurà de resoldre el conflicte.
