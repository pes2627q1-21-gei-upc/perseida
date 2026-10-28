---
titol: "Estratègia de proves"
tipus: convencio
estat: vigent
data: "2026-10-28"
us: ["TG-85", "TG-35", "TG-353"]
font: "memòria §2.5, §2.9.3; .github/workflows/ci.yml (PR #24); ADR-0028 (TG-353)"
etiquetes: [convencio, testing, tdd, cobertura, mutation, nfr]
---

# Estratègia de proves

## Regla

TDD estricte a tot el backend i el frontend ([[0028-tdd-estricte-i-politica-de-testing-avancada]]): el test en vermell s'escriu **abans** del codi. Les proves segueixen la piràmide 60/30/10. Cap US arriba a Done sense les seves proves.

> [!info] Estat de la implantació
> La política és vigent per a l'equip des del 2026-10-28. L'automatització a la CI de les eines marcades com a «previst» (llindars de cobertura bloquejants, mutation testing, schemathesis, import-linter, E2E, randomly/xdist, bandit/pip-audit/`pnpm audit`, test de migracions) és pendent i va a les US #359-#362 del backlog. Fins llavors, les comprova la persona en local i el revisor a la PR.

## TDD

1. **Roig:** s'escriu el test derivat d'un criteri d'acceptació i es comprova que falla pel motiu correcte.
2. **Commit `test:`** amb el test en vermell, **abans** del `feat:`/`fix:`.
3. **Verd:** el codi mínim que el fa passar, sense tocar el test.
4. **Refactor** amb els tests en verd (`refactor:`).

- Cada PR inclou tests unitaris dels components modificats.
- Un bug comença amb un test de regressió que el reprodueix i falla; queda a la suite.
- L'ordre `test:` abans de `feat:` és una regla d'equip documentada a les skills, els subagents i la plantilla de PR; **no hi ha cap script de CI que el verifiqui**: el revisor ho mira a l'historial de la PR.
- Skills: `testing-tdd` (cicle), `testing-integracio`, `testing-mutation`, `testing-property-based`. Detall al [[assistents-ia]].

## Nivells

| Nivell | Proporció objectiu | Eines |
|---|---|---|
| Unitàries | ≈ 60 % dels tests | Backend: pytest, pytest-asyncio. Frontend: Jest i React Native Testing Library |
| Integració | ≈ 30 % dels tests | httpx.AsyncClient, respx, PostgreSQL/PostGIS i Redis reals (docker-compose de la CI), stubs/fakes propis per port |
| E2E | ≈ 10 % dels tests, només fluxos crítics | Maestro (app mòbil) i Playwright (admin); **previst (US #359-#362)** |
| Acceptació | 100 % dels criteris verificats (automàtic o manual); ≥ 80 % amb test automatitzat | Tests automatitzats; la resta, llista de comprovació manual sobre la branca `release/*` |

## Tipus de test i eines

| Tipus | Què verifica | Eina | Estat |
|---|---|---|---|
| Unitari | Domini sense mocks; services amb fakes dels ports; hooks i components amb RNTL (queries per rol, `jest.mock` de hooks i client) | pytest, Jest, RNTL | Instal·lat |
| Integració | Adaptadors contra serveis reals; HTTP extern amb `respx`; stubs per port | pytest, httpx, respx, docker-compose | Instal·lat (service containers a la CI) |
| Temps | Rellotge injectat o temps congelat | `freezegun`/`time-machine` | Previst |
| Property-based | Invariants de la lògica crítica (ràtxes, puntuació de zones, proximitat, last-write-wins) | hypothesis (backend), fast-check (frontend) | Previst |
| Mutation | Que els tests detecten errors; obligatori al domini, només fitxers canviats, score ≥ 70 % | mutmut (backend), Stryker (frontend) | Previst |
| Contracte | OpenAPI: casos generats i test que no es pot regenerar sense diferències | schemathesis | Previst |
| Arquitectura | Capes del backend; import-linter bloquejant | `backend/tests/architecture`; import-linter | Test propi instal·lat; import-linter previst |
| E2E | Fluxos crítics | Maestro, Playwright | Previst |
| Accessibilitat | Queries per rol/etiqueta als tests; lint d'a11y | RNTL; `eslint-plugin-jsx-a11y` | RNTL instal·lat; lint previst |
| Robustesa | Ordre aleatori i execució en paral·lel; quarantena sense reintents | pytest-randomly, pytest-xdist | Previst |
| Seguretat | Anàlisi estàtica i dependències | bandit, pip-audit, `pnpm audit` | Previst |
| Migracions | upgrade -> downgrade -> upgrade sobre PostgreSQL real | Alembic + pytest | Previst (test a la CI) |

### Tests inestables

Un test inestable es posa en quarantena (marcat i exclòs del bloc obligatori, amb una incidència a Taiga) i es corregeix; **no es fan reintents automàtics** per tapar-lo.

## Proves d'acceptació

- **Regla general:** cada criteri d'acceptació d'una US té almenys un test automatitzat, unitari o d'integració, i el test es nomena amb la referència de la US que valida (traçabilitat criteri-prova).
- **Excepció:** els criteris que depenen de la interfície i no es poden automatitzar a nivell de component es verifiquen manualment, amb una llista de comprovació sobre la branca `release/*` abans de la sprint review.
- **Objectiu mesurable:** 100 % dels criteris verificats (de manera automàtica o manual) i ≥ 80 % amb test automatitzat.

> [!note] Lectura combinada de la memòria
> La memòria (§2.5.3) ho expressa en dos llocs: la taula de nivells («100 % verificats; ≥ 80 % amb test automatitzat») i el paràgraf «Proves d'acceptació» («cada criteri té almenys un test automatitzat»). Aquesta nota en recull la lectura combinada: l'automatització és la norma, la verificació manual és l'excepció acotada i els percentatges són l'objectiu mesurable. No cal tornar-ho a debatre.

## Jocs de prova

- `backend/tests/fixtures/`: respostes enregistrades de les APIs de la NASA i de meteorologia (JSON) i punts d'observació d'exemple.
- `backend/tests/factories/`: generadors d'usuaris, esdeveniments, missatges i fites.
- `backend/tests/fakes/`: fakes dels ports.
- `backend/tests/moderation_dataset/`: joc etiquetat per avaluar Kev-4B en català, castellà i anglès.
- `frontend/__mocks__/`: respostes simulades de l'API.

## Cobertura

| Mesura | Llindar |
|---|---|
| Global (backend i frontend) | ≥ 80 % |
| Codi nou de cada PR | ≥ 90 % |
| Frontend: components purament visuals | Exclosos |
| Mutation score (domini, fitxers canviats) | ≥ 70 % |

La CI de la PR ha de fallar si no es compleixen la cobertura global ni la del codi nou; la implantació és **prevista (US #359-#362)**. Mentrestant, es mesura amb `pytest-cov` (`uv run pytest` ja porta `--cov`) i `jest --coverage` i els revisa la persona. El Quality Gate de SonarQube Cloud s'alinea amb aquesta política: cobertura del codi nou ≥ 90 % (vegeu [[qualitat]] i [[0012-sonarqube-cloud-i-quality-gate]]).

> [!note] Llindars anteriors
> Els llindars per capa (domini ≥ 80 %, aplicació ≥ 70 %, infraestructura ≥ 50 %, global ≥ 70 %, hooks ≥ 70 %, codi nou ≥ 70 %) i la piràmide 70/30 d'[[0019-tests-despres-del-codi]] queden substituïts per aquesta política.

## Requisits no funcionals mesurables

| Requisit | Llindar | Verificació |
|---|---|---|
| Recursos servits des de Redis (APOD) | ≤ 200 ms | Integració amb pytest i httpx |
| Consultes geoespacials de proximitat | ≤ 150 ms | Integració sobre PostgreSQL/PostGIS |
| Endpoints privats sense sessió vàlida | 100 % rebutgen (401/403) | Integració de l'API |
| Validació de formularis | Feedback a la UI < 100 ms sense crida a xarxa | Jest i React Native Testing Library |
| Caiguda d'APIs externes | Dades de la cau, sense HTTP 500 | Integració amb respx |
| Seguretat i maduresa del codi nou | 0 secrets exposats, 0 bugs i 0 vulnerabilitats noves, qualificació A | Quality Gate |

Els tests de temps prenen la mediana de diverses peticions consecutives.

## Execució

En local: `uv run pytest` (backend) i `pnpm test` (frontend), o Docker Compose.

A la CI, GitHub Actions executa els tests a cada PR cap a `develop` o `main` i a cada push a aquestes branques, amb filtres per ruta i memòria cau de dependències:

| Job | Ordre de tests | Informe de cobertura (artefacte) |
|---|---|---|
| `backend` | `uv run pytest --cov-report=xml:coverage.xml`, amb PostgreSQL (PostGIS) i Redis com a *service containers* | `backend-coverage` (`coverage.xml`) |
| `frontend` | `pnpm test --coverage --ci` (Jest amb el preset `jest-expo`) | `frontend-coverage` (`lcov.info`) |

Cada job té un test de fum perquè el comandament de tests no falli sense cap test (`backend/tests/test_smoke.py` i `frontend/__tests__/smoke.test.ts`). Vegeu [[qualitat]] per a l'anàlisi estàtica de la CI.

## Enllaços

- [[qualitat]]: Quality Gate i anàlisi estàtica.
- [[definition-of-done]]: proves com a part de la DoD.
- [[gitflow]]: ordre dels commits `test:` i `feat:`.
- [[0028-tdd-estricte-i-politica-de-testing-avancada]]: decisió vigent.
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]
- [[0019-tests-despres-del-codi]]: substituïda.
