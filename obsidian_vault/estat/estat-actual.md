---
titol: Estat actual del projecte
tipus: estat
estat: vigent
data: 2026-10-13
us: ["TG-205", "TG-85", "TG-30", "TG-31", "TG-39", "TG-33", "TG-38", "TG-45", "TG-87", "TG-88", "TG-44", "TG-304", "TG-48"]
font: "memòria §2.1; sessions 2026-10-07, 2026-10-08, 2026-10-09 i 2026-10-13; Taiga: backlog (llistat de US i sprints, 2026-10-07; tasca TG-304, 2026-10-09)"
etiquetes: [estat, sprint, taiga]
---

# Estat actual (2026-10-13)

Instantània a data 2026-10-13. L'estat viu a Taiga; si hi ha diferències, guanya Taiga.

## Sprint

- **Sprint 1 (5/10/2026-28/10/2026): actiu.**
- Sprint 2: 29/10-29/11/2026. Sprint 3: 30/11-18/12/2026.

## US a data 2026-10-13

| Estat | US |
|---|---|
| Done | TG-30 (estructura del monorepo i guia d'arrencada), TG-31 (configuració del backend), TG-205 (subagents i skills agnòstiques) |
| In progress | TG-39 (esquelet FastAPI async amb les capes domain, application i infrastructure; Sprint 1), TG-85 (aquest vault), TG-48 (pantalla de l'APOD del dia a l'app mòbil; TG-117 en PR) |
| Ready | TG-33, TG-38, TG-45, TG-87, TG-88 |

La resta del backlog és a [[epiques-i-us]].

## Què ha lliurat TG-85 fins ara

- Estructura del vault, plantilles i convencions ([[definition-of-done]], [[actualitzacio-del-vault]]).
- Arquitectura i components, i 15 ADR de les decisions ja preses.
- Skills agnòstiques a `.agents/skills/` i `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`.
- Skill `vault-context` i hook `SessionStart` que injecta aquest índex i aquesta nota.
- Producte, estat i guies ([[llegir-el-vault-com-a-agent]]). Sessió: [[2026-10-07-base-del-vault]].

## Què ha lliurat TG-205 fins ara

- Cinc subagents i skills de backend, frontend i errors, agnòstics de l'eina, amb generador i check a CI. Detall a [[2026-10-07-subagents-i-skills-agnostics]].
- ADR 0016–0021 acceptades per l'equip ([[0019-tests-despres-del-codi]] supera part d'[[0004-arquitectura-hexagonal-i-tdd-al-domini]]).

## Què ha lliurat TG-31 fins ara

- Projecte `backend/` amb `uv` (Python 3.14, `uv.lock` versionat), `ruff`, `mypy` estricte i `pytest` amb cobertura.
- Estructura `app/` i `tests/` i README del backend amb les ordres verificades. Sessió: [[2026-10-07-configuracio-backend]].
- PR fusionada a `develop` (#11).

## Què ha lliurat TG-39

- Aplicació FastAPI async amb `create_app()` i `lifespan` (TG-179); `fastapi`, `pydantic` i `uvicorn` amb versió fixada i plugin `pydantic.mypy`.
- Mòdul de referència `health` a les tres capes: `HealthReport` i port `HealthCheck` al domini, `HealthService` a application, `ApplicationCheck`, `GET /health` i `get_health_service` (`@lru_cache`) a infrastructure (TG-180 a TG-182).
- Tests unitaris, d'integració (`httpx.AsyncClient` + `ASGITransport`) i d'arquitectura amb `ast` que verifica la regla de dependències entre capes (TG-183 a TG-185).
- README del backend (ca, es, en) amb diagrama de capes, estructura real i guia per afegir una funcionalitat (TG-186).
- ADR 0016–0021 acceptades i vault coherent amb elles. Sessió: [[2026-10-08-esquelet-fastapi]].
- Pendent: PR cap a `develop` (la fa la persona).

## Què ha lliurat TG-304 (tasca de TG-44)

- Jerarquia d'errors a `domain` i `application`, handlers RFC 9457 i middleware `X-Correlation-ID` a `infrastructure/api` ([[0018-errors-rfc-9457-amb-codis-estables]]).
- Tests amb cobertura del 100 % del codi nou; README, skill `gestio-errors` i vault actualitzats. Sessió: [[2026-10-09-jerarquia-errors]].
- PR #14 cap a `develop` revisada: els comentaris s'han aplicat i les converses estan resoltes ([[2026-10-13-revisio-pr-tg-304]]).
- Pendent: aprovació i fusió (una persona que no sigui l'autora); desbloqueja la tasca #283 de TG-44.

## Què ha lliurat TG-48 fins ara

- TG-117: servei de connexió amb `GET /api/apod` al frontend: client tipat (`openapi-fetch`) amb timeout, `AppError`/`toAppError` per a errors RFC 9457 i de xarxa, `getApodToday()` i hook `useApodToday()` (TanStack Query), amb 32 tests.
- El contracte OpenAPI és provisional (`frontend/openapi/apod.provisional.json`) fins que arribi TG-47.
- Sessió: [[2026-10-13-servei-apod-frontend]].
- Pendent: PR cap a `develop` (la fa la persona); TG-118 a TG-121.

## Millora de skills (TG-305, subtasca de TG-205)

- Skill `estetica-frutiger-cosmo` («Cel viu»: quatre temes i quatre modes, tokens, receptes, so i moviment) i skill `implementar-us` (de la US de Taiga a la verificació de criteris i DoD). Les skills `frontend-*` i els subagents `frontend` i `reviewer-arquitectura` hi remeten.
- Paleta, tipografia, escala, radis, ombra, breakpoints, icones (Phosphor), ubicació per a «Seguir Sol» i mode inicial validats; estats al tema `vermell` i alt contrast (només el del sistema) també decidits; els sons generats (`generar_so.py`) estan aprovats. No queda cap valor d'estètica pendent de validar. Sessió: [[2026-10-13-skills-estetica-i-implementar-us]].
- Tests Python de `contrast.py` i `generar_so.py` (29 proves) i pas a la CI (`skills-sync-check`). Tasca TG-305 en *Ready for test*; PR #17 pendent d'aprovació d'una altra persona. Pendent: prova real de `implementar-us` amb la primera US real.

## Pendent

- No hi ha workflow de CI del backend a `.github/workflows/`; fins que n'hi hagi, els linters i tests s'executen en local.
- TG-33 ha d'ampliar la plantilla de PR (`.github/pull_request_template.md`) amb la llista de revisió de la memòria §2.4.4: arquitectura hexagonal, tests per al codi nou, claredat i nomenclatura, eficiència de les consultes a PostgreSQL/PostGIS, secrets, avisos de SonarQube Cloud i vault.
- TG-47 (endpoint de l'APOD) depèn de TG-46; cal acordar amb qui la porta l'entitat i el port de l'APOD.

## Dependències

> [!note] Ordre tècnic (memòria §2.1)
> El monorepo i la CI/CD han d'existir abans que cap altra història sigui desplegable; el nucli del backend i la identitat, abans que cap funcionalitat de producte.

## Enllaços

- [[2026-10-13-skills-estetica-i-implementar-us]]
- [[2026-10-07-subagents-i-skills-agnostics]]
- [[llegir-el-vault-com-a-agent]]
- [[definition-of-done]]
- [[actualitzacio-del-vault]]
- [[2026-10-07-base-del-vault]]
- [[2026-10-07-configuracio-backend]]
- [[2026-10-08-esquelet-fastapi]]
- [[2026-10-09-jerarquia-errors]]
- [[2026-10-13-servei-apod-frontend]]
