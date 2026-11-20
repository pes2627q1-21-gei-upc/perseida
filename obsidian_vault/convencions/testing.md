---
titol: "Estratègia de proves"
tipus: convencio
estat: vigent
data: "2026-11-20"
us: ["TG-85", "TG-35", "TG-353", "TG-360", "TG-359", "TG-628", "TG-450", "TG-652", "TG-385", "TG-362"]
font: "memòria §2.5, §2.9.3; .github/workflows/ci.yml (PR #24, PR #80); ADR-0028 (TG-353); TG-359; decisió de la persona responsable a TG-628 (17/11/2026); review de la PR #109 (TG-64, tasca #450, 2026-11-18); TG-652; TG-385 (exclusió dels estils de Stryker, aprovada per la persona responsable el 18/11/2026); TG-362 (tasca TG-381: pytest-randomly i pytest-xdist; tasca TG-382: quarantena sense reintents, 20/11/2026)"
etiquetes: [convencio, testing, tdd, cobertura, mutation, nfr]
---

# Estratègia de proves

## Regla

TDD estricte a tot el backend i el frontend ([[0028-tdd-estricte-i-politica-de-testing-avancada]]): el test en vermell s'escriu **abans** del codi. Les proves segueixen la piràmide 60/30/10. Cap US arriba a Done sense les seves proves.

> [!info] Estat de la implantació
> La política és vigent per a l'equip des del 2026-10-28. Des de TG-360 (US #360) i TG-359 (US #359) són a la CI els tests de contracte (schemathesis i còpia d'OpenAPI), l'arquitectura (import-linter), les migracions reversibles, els llindars de cobertura bloquejants (backend i frontend) i el mutation testing sobre el diff (mutmut i Stryker). Des de TG-362 (tasca TG-381), els tests del backend s'executen en ordre aleatori (pytest-randomly) i, a la CI, en paral·lel (pytest-xdist); des de la tasca TG-382, els tests inestables van en quarantena en un pas no bloquejant. L'automatització de la resta d'eines marcades com a «previst» (E2E, bandit/pip-audit/`pnpm audit`) és pendent i va a les US #361 i #362 del backlog. Fins llavors, les comprova la persona en local i el revisor a la PR.

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
| Mutation | Que els tests detecten errors; obligatori al domini, només fitxers canviats (al frontend, només les seves línies canviades), score ≥ 70 % | mutmut (backend), Stryker (frontend) | Instal·lat (TG-359) |
| Contracte | OpenAPI: casos generats (cap 5xx, respostes segons l'esquema, errors RFC 9457) i còpia `frontend/openapi/openapi.json` igual a l'esquema del backend; el job `frontend` falla si `schema.d.ts` no està regenerat | schemathesis, `pytest`, `pnpm api:generate` | Instal·lat |
| Arquitectura | Capes del backend; import-linter bloquejant | `backend/tests/architecture`; import-linter (`[tool.importlinter]` a `pyproject.toml`) | Instal·lat |
| E2E | Fluxos crítics | Maestro, Playwright | Previst |
| Accessibilitat | Queries per rol/etiqueta als tests; lint d'a11y | RNTL; `eslint-plugin-jsx-a11y` | RNTL instal·lat; lint previst |
| Robustesa | Ordre aleatori i execució en paral·lel; quarantena sense reintents | pytest-randomly, pytest-xdist, marcador `quarantine` | Instal·lat (TG-362) |
| Seguretat | Anàlisi estàtica i dependències | bandit, pip-audit, `pnpm audit` | Previst |
| Migracions | Cada revisió fa upgrade -> downgrade -> upgrade i l'esquema torna a ser el mateix (coherent amb el rollback d'[[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]) | Alembic + pytest | Instal·lat |

### Contracte, arquitectura i migracions (TG-360)

- **schemathesis** (`tests/integration/test_api_contract.py`): l'app corre en procés (ASGI, amb el lifespan) sobre PostgreSQL i Redis reals; Google i la NASA, simulats amb `respx`; els endpoints privats s'autentiquen amb un login real amb un token de Google signat amb una clau de prova. Llavor fixa (`360`) i 25 exemples per operació. El check propi `tests/integration/problem_check.py` exigeix `application/problem+json` i els camps `type`, `title`, `status`, `detail`, `code` a tot 4xx/5xx. A `GET /api/apod` s'accepta el 422 de dates fora de rang com a resposta esperada del check `positive_data_acceptance`: el límit superior (avui) no es pot escriure a OpenAPI.
- **Còpia d'OpenAPI**: `tests/unit/infrastructure/test_openapi_copy.py` compara `create_app().openapi()` amb `frontend/openapi/openapi.json`. Per regenerar-la: `cd backend && uv run python -m scripts.export_openapi && cd ../frontend && pnpm api:generate`. El job `frontend` fa `pnpm api:generate` i falla si `src/shared/api/schema.d.ts` canvia.
- **import-linter** (`uv run lint-imports`, pas obligatori del job `backend`): el domini no importa FastAPI, SQLModel/SQLAlchemy, Redis, asyncpg ni httpx; l'aplicació no importa `app.infrastructure` ni FastAPI; capes `infrastructure` -> `application` -> `domain`. El test propi `tests/architecture/test_layer_dependencies.py` es manté (llista blanca, imports relatius i aïllament users/auth).
- **Migracions** (`tests/integration/test_alembic.py::test_every_revision_can_be_undone`): per a cada revisió, instantània de l'esquema, `upgrade`, `downgrade` a l'anterior i comparació. **En local fa `downgrade base` i esborra la base de dades a la qual apunta `POSTGRES_HOST`**; només s'executa si `POSTGRES_HOST` està definit. Amb `pytest-xdist` cada worker té la seva base de dades, de manera que el test només desfà la del seu worker.
- En local, els tests d'integració i de contracte necessiten PostgreSQL/PostGIS i Redis (`POSTGRES_*`, `REDIS_*`); sense aquestes variables es salten.

### Ordre aleatori i paral·lelisme (TG-362)

- **Ordre aleatori (`pytest-randomly`)**: és actiu a totes les sessions del backend, en local i a la CI. La primera línia de la sortida diu la llavor: `Using --randomly-seed=1234567890`. Per reproduir una fallada que depèn de l'ordre, torna a executar amb la mateixa llavor: `uv run pytest -p randomly --randomly-seed=1234567890` (amb el mateix `-n` si la fallada va sortir en paral·lel). Per depurar sense aleatorietat, `-p no:randomly`. No s'ha de desactivar als `addopts` (ho vigila `tests/architecture/test_test_tooling.py`).
- **Paral·lelisme (`pytest-xdist`)**: la CI executa `uv run pytest -n auto`. En local, els tests van en sèrie per defecte; per provar-los en paral·lel, `uv run pytest -n 4` (o `-n 8`).
- **Aïllament per worker** (`tests/conftest.py`, `tests/integration/conftest.py`, `tests/integration/workers.py`): cada worker `gwN` fa servir la base de dades `<POSTGRES_DB>_gwN`, que es crea i es migra (`alembic upgrade head`) abans del primer test d'integració (els unitaris no s'hi connecten), i l'índex de Redis `15 - N`. Sense xdist es fan servir `POSTGRES_DB` i l'índex 15; ara també l'app i tots els clients de prova hi van (abans, una part dels tests escrivia a l'índex 0). L'índex 0 (dades de desenvolupament) no es buida mai, i per això hi ha com a màxim 15 workers: amb més, la sessió s'atura amb un missatge que demana reduir `-n` (a les màquines de més de 15 nuclis, `-n auto` no serveix). Les bases de dades `_gwN` es conserven entre execucions locals: si un test troba files que no són seves (restes d'una execució anterior a una correcció), esborra-les un cop (`DROP DATABASE <POSTGRES_DB>_gwN`) i tornaran a crear-se netes. A la CI cada execució comença amb una base de dades nova.
- **Regles per als tests nous**: cap test pot dependre de l'ordre ni de dades d'un altre test. Cada test esborra el que crea, i els clients de Redis i els *engines* de base de dades es creen a partir de `RedisSettings`/`DatabaseSettings`, mai amb host, port o índex escrits a mà. Els ids dels `parametrize` han de ser estables entre processos (res de `uuid` generats en importar el mòdul).

### Tests inestables

Un test inestable es posa en quarantena (marcat i exclòs del bloc obligatori, amb una tasca a Taiga) i es corregeix; **no es fan reintents automàtics** per tapar-lo. `pytest-rerunfailures`, `flaky` i `--reruns` estan prohibits (ho vigila `tests/architecture/test_test_tooling.py`), perquè amaguen condicions de carrera reals.

Com es posa un test en quarantena (TG-362, tasca TG-382):

1. Reprodueix la fallada amb la llavor de la sortida (secció anterior) per confirmar que és intermitent i no un error real del codi.
2. Obre una tasca a Taiga per arreglar-lo.
3. Marca el test amb el codi de la tasca:
   ```python
   @pytest.mark.quarantine(reason="TG-NNN falla de manera intermitent en paral·lel")
   def test_...():
   ```
   El `reason` és obligatori i ha de contenir `TG-<número>`. Sense ell, la recollida de pytest s'atura amb un error (plugin `tests/quarantine.py`).
4. A la CI, el pas bloquejant executa `pytest -n auto -m "not quarantine"`, i el pas «Tests en quarantena (no bloquejant)», `pytest -n auto -m quarantine --no-cov` amb `continue-on-error`. Aquest segon pas no compta per a la cobertura i, si no hi ha cap test en quarantena, acaba en verd.
5. Quan la tasca s'arregla, es treu el marcador a la mateixa PR del `fix:`.

En local: `uv run pytest -m quarantine` executa només els tests en quarantena.

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

| Mesura | Llindar | Mecanisme de bloqueig |
|---|---|---|
| Global backend | ≥ 80 % | Pas de CI (`--cov-fail-under=80`) i en local amb `uv run pytest --cov-fail-under=80` |
| Codi nou backend a la PR | ≥ 90 % | `diff-cover` a la CI (`--fail-under=90`) |
| Global frontend | ≥ 80 % | Jest `coverageThreshold` a `jest.config.js` (amb `pnpm test --coverage`) |
| Codi nou frontend a la PR | ≥ 90 % | Quality Gate de SonarQube Cloud ([[qualitat]]) |
| Frontend: components purament visuals | Exclosos | Cobertura centrada en lògica, hooks i serveis |
| Mutation score (fitxers canviats; al frontend, les seves línies canviades) | ≥ 70 % | `mutmut` (backend) i `Stryker` (frontend) a la CI |

La CI de la PR falla si no es compleixen els llindars establerts (implantat a TG-359):
- **Backend:** a la CI, el pas de pytest executa `uv run pytest --cov-report=xml:coverage.xml --cov-fail-under=80` (en local es pot comprovar amb `uv run pytest --cov-fail-under=80`). A més, a cada PR el pas de CI executa `uv run diff-cover coverage.xml --compare-branch=origin/${{ github.base_ref }} --fail-under=90` per garantir que el codi afegit o modificat té com a mínim un 90 % de cobertura de línies.
- **Frontend:** `pnpm test --coverage --ci` valida el `coverageThreshold` del 80 % definit a `frontend/jest.config.js` (línies, sentències, funcions i branques). El llindar de codi nou (≥ 90 %) s'assegura mitjançant el Quality Gate de SonarQube Cloud ([[0012-sonarqube-cloud-i-quality-gate]]).

> [!note] Llindars anteriors
> Els llindars per capa (domini ≥ 80 %, aplicació ≥ 70 %, infraestructura ≥ 50 %, global ≥ 70 %, hooks ≥ 70 %, codi nou ≥ 70 %) i la piràmide 70/30 d'[[0019-tests-despres-del-codi]] queden substituïts per aquesta política.

### Mutation testing sobre el diff (TG-359)

El mutation testing audita que els tests detectin canvis intencionats en el codi, avaluant exclusivament els fitxers canviats a la PR per mantenir un temps d'execució àgil a la CI:

- **Backend (`mutmut`):** configurat a `backend/pyproject.toml` (`source_paths = ["app/domain"]`, `also_copy = ["app/application", "app/infrastructure", "tests/"]`, `pytest_add_cli_args = ["-o", "addopts="]` i `pytest_add_cli_args_test_selection = ["tests/unit/domain"]`). S'executa amb `uv run python scripts/run_mutmut_diff.py --base-branch <branca>`, que detecta fitxers de `app/domain` modificats respecte a la branca base (`origin/develop` per defecte, o `origin/${{ github.base_ref }}` a la CI). Exclou els fitxers `ports.py` (TG-450): només defineixen `Protocol` sense lògica i cap test unitari els executa, de manera que mutmut s'aturava sense mutants provables; el filtre és pel nom exacte del fitxer, de manera que la resta del domini (p. ex. `transports.py`) continua subjecta al 70 %. Calcula el mutation score amb la fórmula `(killed + timeout) / (killed + timeout + survived + no_tests + suspicious)`, on els mutants sense tests associats (`no_tests`) computen com a supervivents; si es generen mutants però no se'n prova cap, el pas falla. Si no s'ha tocat el domini, passa automàticament sense computar mutacions innecessàries.
- **Frontend (`Stryker`):** configurat a `frontend/stryker.config.json` amb el runner `@stryker-mutator/jest-runner`, `coverageAnalysis: "perTest"` i `thresholds: { high: 80, low: 70, break: 70 }`. Per evitar col·lisions d'escaneig amb el Haste map de React Native/Jest, `frontend/jest.config.js` ignora `.stryker-tmp`. S'executa amb `pnpm test:mutation` (`node scripts/run-stryker-diff.mjs --base-branch <branca>`), que filtra els fitxers de lògica a `frontend/src/` i, dins de cada fitxer, només muta les línies afegides o canviades a la PR (rangs `fitxer:inici-final` de Stryker, calculats amb `git diff -U0`; un fitxer nou entra sencer). Així, tocar dues línies d'un component existent no fa mutar-ne tot el codi anterior (decisió de la persona responsable a TG-628, 17/11/2026, que esmena [[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]]; l'script té tests amb `node --test`, que la CI executa). Exclou fitxers de test (`.test.`, `.spec.`), tipus (`.d.ts`), fitxers de barril (`index.ts`) i components visuals purs (`src/shared/ui/`). Si el score cau per sota del 70 %, el procés falla per `break: 70`. Si no s'ha modificat lògica, el pas finalitza amb èxit immediatament. Un mutant que penja es talla als 15 s (`timeoutMS: 15000`) i compta com a `timeout`; el job `frontend` de la CI té 60 min (`timeout-minutes: 60`), perquè a TG-646 934 mutants van tardar uns 28 min i el job de 30 min es va cancel·lar (TG-652). Per no arribar-hi, les PR grans del frontend es divideixen (vegeu [[gitflow]]).

#### Estils visuals als components del frontend (TG-385)

Els components de `features/*/components` i les rutes sí que es muten, perquè hi ha lògica (condicions, textos i claus i18n, rols d'accessibilitat). Els seus **estils** no: canviar un padding, un color o un radi no és un comportament que un test unitari hagi de fixar, i aquests mutants (sobretot `ObjectLiteral`, `StringLiteral` i `ArrayDeclaration`) fan baixar el score sense dir res dels tests.

- Els estils d'un component van en una funció `createStyles(theme)` al final del fitxer, amb tokens del tema, entre `// Stryker disable all` i `// Stryker restore all` i un comentari que n'explica el motiu. El JSX només fa referència a `styles.x`, de manera que la lògica del JSX es continua mutant.
- Un valor visual que ha de quedar al JSX (pes d'una icona, mida d'un `ActivityIndicator`, un padding calculat amb les *safe areas*) porta `// Stryker disable next-line <Mutador>: <motiu>` just a la línia anterior a la propietat.
- Mai s'exclou lògica: condicions, textos, claus i18n, `accessibilityRole`, `testID` ni valors que un test pot observar (per exemple, l'espai que es reserva per a la barra de pestanyes, que té test).
- Exemples: `features/profile/components/ProfileScreen.tsx`, `features/navigation/components/ComingSoonTab.tsx` i el marc de la barra a `src/app/(app)/_layout.tsx`.

> [!note] Execució de mutmut en local amb Docker
> `mutmut` requereix Docker a Windows natiu (o entorns sense Unix natiu) per l'aïllament de processos de Python. Per executar-lo en local des de `backend/`, amb accés al `.git` del repo i venv propi del contenidor:
> ```bash
> docker run --rm -v "$(pwd)/..:/workspace" -w /workspace/backend -e UV_PROJECT_ENVIRONMENT=/tmp/venv python:3.14.9-slim sh -c "apt-get update -qq && apt-get install -y -qq git && pip install -q uv && git config --global --add safe.directory '*' && uv run python scripts/run_mutmut_diff.py"
> ```

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

En local: per comprovar el llindar global del 80 %, `uv run pytest --cov-fail-under=80` (backend) i `pnpm test --coverage` (frontend; el llindar de `coverageThreshold` només s'activa amb `--coverage`); per comprovar mutation testing sobre el diff local: l'ordre unificada de Docker per a `mutmut` (backend) o `pnpm test:mutation` (frontend). O amb Docker Compose.

A la CI, GitHub Actions executa els tests a cada PR cap a `develop` o `main` i a cada push a aquestes branques, amb filtres per ruta i memòria cau de dependències:

| Job | Ordre de tests | Informe de cobertura (artefacte) |
|---|---|---|
| `backend` | `uv run pytest -n auto --cov-report=xml:coverage.xml` (en paral·lel i en ordre aleatori), amb PostgreSQL (PostGIS) i Redis com a *service containers* | `backend-coverage` (`coverage.xml`) |
| `frontend` | `pnpm test --coverage --ci` (Jest amb el preset `jest-expo`) | `frontend-coverage` (`lcov.info`) |

Cada job té un test de fum perquè el comandament de tests no falli sense cap test (`backend/tests/test_smoke.py` i `frontend/__tests__/smoke.test.ts`). Vegeu [[qualitat]] per a l'anàlisi estàtica de la CI.

## Enllaços

- [[qualitat]]: Quality Gate i anàlisi estàtica.
- [[definition-of-done]]: proves com a part de la DoD.
- [[gitflow]]: ordre dels commits `test:` i `feat:`.
- [[0028-tdd-estricte-i-politica-de-testing-avancada]]: decisió vigent.
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]
- [[0019-tests-despres-del-codi]]: substituïda.
