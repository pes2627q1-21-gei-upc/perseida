---
name: testing-integracio
description: Tests d'integració de Perseida - serveis reals del docker-compose de la CI (PostgreSQL/PostGIS i Redis), aïllament per transacció o esquema, respx per a HTTP extern, stubs/fakes propis per port, control del temps, WebSocket, migracions upgrade-downgrade-upgrade i contracte OpenAPI. Usa-la quan un canvi toqui persistència, cache, clients externs, l'API, WebSocket o migracions.
---

# Testing: integració

La integració és el ~30 % de la piràmide (60/30/10). Verifica que els adaptadors parlen bé amb l'exterior; la lògica de negoci es prova abans, amb unitaris (`testing-tdd`). El test d'integració també s'escriu **primer, en vermell**.

Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents. Convenció: `obsidian_vault/convencions/testing.md`.

> [!note] Estat de les eines
> Instal·lades: pytest, pytest-asyncio, pytest-cov, respx i httpx. El job de CI del backend ja aixeca PostgreSQL (PostGIS) i Redis com a *service containers* (`.github/workflows/ci.yml`). **Instal·lats (TG-360)**: schemathesis (`tests/integration/test_api_contract.py`), test de la còpia d'OpenAPI (`tests/unit/infrastructure/test_openapi_copy.py`), test de migracions (`tests/integration/test_alembic.py`) i import-linter (`uv run lint-imports`), tots a la CI. **Previstos (US #359, #361 i #362)**: `freezegun`/`time-machine`, pytest-randomly i pytest-xdist; no els afegeixis sense preguntar a la persona.

## Quan usar-la / quan NO

- Usa-la: repositoris SQLModel, consultes PostGIS, cache Redis, clients NASA/FCM/Google JWKS/Spotwise/Kev-4B, routers, WebSocket, migracions Alembic.
- NO: regles de negoci (unitari al domini), services (fakes dels ports), UI (RNTL; E2E amb Maestro/Playwright és a la política, previst US #359-#362).

## Protocol de dubtes (OBLIGATORI)

No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes d'aquesta skill:

1. Quin criteri d'acceptació (`TG-NN`) i quin comportament extern es verifica? Hi ha resposta enregistrada a `backend/tests/fixtures/`?
2. Aïllament entre tests: transacció revertida o esquema per test? (Pregunta si el repo encara no ho fixa.)
3. Quin ha de ser el comportament si l'extern cau (cache, error controlat, timeout)? Quins TTL?
4. Cal congelar el temps? Quina llibreria (previst: `freezegun` o `time-machine`)? Pregunta abans d'afegir-la.
5. Llindars de rendiment (proximitat <= 150 ms, cache <= 200 ms): mediana de quantes peticions?

## Passos

1. Llegeix el criteri i decideix el nivell: si es pot provar amb un fake del port, és unitari, no integració.
2. **ROIG:** escriu el test d'integració i comprova que falla pel motiu correcte; commit `test:` abans del `feat:`.
3. Implementa l'adaptador mínim (`backend-adaptador`) fins al verd.
4. Mesura la cobertura i, si cal, el rendiment (NFR).
5. `ruff`, `mypy` strict i `pytest`.

## Serveis reals, no mocks del que és nostre

- **PostgreSQL/PostGIS i Redis reals** (docker-compose en local, *service containers* a la CI). No es simula la BD amb SQLite ni Redis amb un mock: les consultes PostGIS, els índexs i el comportament de `asyncpg` només es verifiquen contra el motor real.
- **Aïllament:** cada test en una transacció que es fa `rollback`, o en un esquema propi; Redis amb prefix de clau per test o `FLUSHDB` d'una BD dedicada. Cap test depèn de dades deixades per un altre (compatibilitat amb `pytest-randomly`/`xdist`, previstos).
- **Dades:** factories (`backend/tests/factories/`) i fixtures sintètiques; mai dades personals.
- Valida les consultes crítiques: roundtrip entitat -> BD -> entitat, restriccions úniques, **sense N+1** (compta queries) i `EXPLAIN`.

## Externs: `respx` i stubs per port

- HTTP extern (NASA, Google JWKS, Spotwise, Kev-4B...): `respx` amb respostes de `backend/tests/fixtures/`. Cobreix èxit, cache hit/miss, extern caigut **amb** cache (dades de la cache, sense 500), **sense** cache (error controlat `ExternalServiceError`) i timeout.
- Serveis que no es poden cridar de veritat (FCM, moderació local): **stub/fake propi del port**, a `backend/tests/fakes/`, que implementa el mateix `Protocol`. Un test de contracte compartit corre contra el fake i contra l'adaptador real perquè no divergeixin.
- Mai es fa cap crida de xarxa real als tests.

## Temps

Els tests que depenen de l'hora (TTL, ratxes diàries, finestres horàries, last-write-wins) no usen `sleep` ni el rellotge real: injecta el rellotge com a dependència (preferit) o congela el temps amb `freezegun`/`time-machine` (previst; pregunta abans d'afegir-ne una).

## API i WebSocket

- API: `httpx.AsyncClient(transport=ASGITransport(app=app))`; comprova 401/403 sense sessió a **tot** endpoint privat, format RFC 9457 i `code` (skill `gestio-errors`).
- WebSocket: connexió amb el client de test de Starlette/FastAPI; comprova autenticació, missatge d'ida i tornada, desconnexió neta i que els errors tenen un `code`.
- Pub/sub Redis: tots els subscriptors del canal reben el missatge i els d'altres canals no.

## Migracions

Cada migració nova es prova **upgrade -> downgrade -> upgrade** sobre PostgreSQL real, i el resultat ha de coincidir amb el model (cap diferència en autogenerar). Alineat amb el downgrade del CD (ADR-0025). Test automàtic a la CI: **instal·lat (TG-360)**, `tests/integration/test_alembic.py::test_every_revision_can_be_undone` (només s'executa amb `POSTGRES_HOST` definit; en local fa `downgrade base` i **esborra la base de dades** a la qual apunta).

## Contracte OpenAPI (instal·lat, TG-360)

- **schemathesis** contra l'OpenAPI (casos generats; cap 5xx ni resposta fora d'esquema; errors RFC 9457 amb el check propi `problem_check.py`): `tests/integration/test_api_contract.py`.
- Test que regenera l'OpenAPI i falla si difereix del versionat (`tests/unit/infrastructure/test_openapi_copy.py`; el frontend genera tipus amb `openapi-typescript`). Si canvies un endpoint: `cd backend && uv run python -m scripts.export_openapi && cd ../frontend && pnpm api:generate`.

## Rendiment (NFR)

Proximitat PostGIS <= 150 ms i cache <= 200 ms: **mediana** de diverses peticions consecutives, no una de sola.

## Checklist final

- [ ] Preguntes resoltes amb l'humà; res assumit en silenci.
- [ ] Test d'integració escrit en vermell abans del codi (`test:` abans de `feat:`).
- [ ] Serveis reals per a BD i Redis; `respx`/stub per a externs; cap xarxa real.
- [ ] Aïllament garantit: cap dependència entre tests ni de l'hora real.
- [ ] Camins d'error: extern caigut amb i sense cache, 401/403, 500 sense filtrar.
- [ ] Sense N+1; `EXPLAIN` de les consultes crítiques.
- [ ] Migració provada upgrade -> downgrade -> upgrade (si n'hi ha).
- [ ] Fixtures sintètiques, sense secrets ni dades personals.

## Què NO fer

- SQLite o mocks en lloc de PostgreSQL/Redis reals.
- Mockejar els nostres propis adaptadors a l'integració.
- `sleep` per esperar o `time.time()` real.
- Reintents automàtics per tapar un test inestable.
- Afegir dependències de test sense preguntar; fer push, merge o PR.
