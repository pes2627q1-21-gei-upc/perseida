---
titol: "Sessió 2026-11-20 · Ordre aleatori, tests en paral·lel i quarantena al backend (TG-362, tasques TG-381 i TG-382)"
tipus: sessio
estat: vigent
data: "2026-11-20"
us: ["TG-362", "TG-381", "TG-382"]
font: "US TG-362 i tasca TG-381 a Taiga; pla aprovat per la persona responsable el 20/11/2026"
etiquetes: [sessio, testing, ci, xdist, randomly, quarantena, backend]
---

# Sessió 2026-11-20 · Ordre aleatori, tests en paral·lel i quarantena al backend (TG-362, tasques TG-381 i TG-382)

## Objectiu

Primera tasca de TG-362 (TG-381). L'objectiu és que els tests del backend s'executin en ordre aleatori, amb la llavor a la sortida (criteri 1), i en paral·lel amb `pytest -n auto` sense que els workers xoquin a PostgreSQL ni a Redis (criteri 2). També cal documentar-ho (criteri 7, la part que toca a aquesta tasca).

## Què s'ha fet

- `pytest-randomly==5.1.0` i `pytest-xdist==3.8.0` al grup `dev` de `backend/pyproject.toml`.
- Aïllament per worker:
  - `tests/conftest.py` apunta `POSTGRES_DB` a `<base>_gwN` i `REDIS_DB` a l'índex `15 - N`.
  - `tests/integration/conftest.py` crea la base de dades del worker i la migra, només quan s'executen tests d'integració. Així ni els unitaris ni mutmut, que no té `alembic.ini` a `mutants/`, es connecten.
  - Les funcions pures són a `tests/integration/workers.py`.
- `RedisSettings.redis_db` (opcional, per defecte 0): la URL de Redis porta l'índex.
- Les fixtures de Redis dels tests ja no tenen l'índex 15 escrit a mà. Comproven que el client va a l'índex del worker i mai al 0.
- La CI executa `uv run pytest -n auto`. En local els tests continuen en sèrie per defecte.
- Tests que depenien de l'ordre o del procés, arreglats:
  - ids de `parametrize` amb `uuid` generats en importar el mòdul (xdist recollia tests diferents a cada worker);
  - `test_post_repository` no esborrava les usuàries i els esdeveniments que creava (ara té guarda `row_counts`).
- Verificat amb contenidors d'un sol ús: suite en sèrie, `-n 4` dues vegades i `-n 8` amb llavors diferents, 2085 tests en verd. La cobertura amb xdist és la mateixa que en sèrie.
- **TG-382 (quarantena, criteri 3):**
  - Marcador `quarantine(reason)` registrat a `pyproject.toml`. El plugin `tests/quarantine.py` (activat des de `tests/conftest.py`) atura la recollida si el `reason` no conté `TG-<número>`.
  - CI: el pas bloquejant exclou `-m "not quarantine"`; un pas nou, «Tests en quarantena (no bloquejant)», els executa amb `continue-on-error` i `--no-cov`, i tolera l'exit 5 (cap test en quarantena).
  - Guardes a `tests/architecture/test_test_tooling.py`: marcador registrat, cap `pytest-rerunfailures`/`flaky`/`--reruns`, passos de la CI i comportament del plugin.
  - Verificat: 2099 tests en verd amb `-m "not quarantine"`, cobertura 99,71 %.

## Decisions preses

Totes les ha aprovat la persona responsable en aquesta sessió.

- **Una base de dades i un índex de Redis per worker.** Es descarten els esquemes i els prefixos de claus, perquè obligarien a tocar l'adaptador de Redis.
- **`-n auto` només a la CI.** En local, en sèrie i amb `-n` opcional.
- **Tests que depenen de l'ordre.** Els que surtin s'arreglen a la mateixa PR, amb commits `fix:`.
- **Quarantena amb tasca obligatòria (TG-382).** El `reason` del marcador ha de citar la tasca TG-NNN; si no, la recollida falla.
- **Divisió de TG-362 en dues PR.**
  - TG-381 i TG-382 (robustesa dels tests).
  - TG-383 i TG-384 (seguretat de les dependències).
  - No es toca lògica de domini ni del frontend, de manera que mutmut i Stryker no hi pesen.

## Canvis al vault

- [[testing]]: secció «Ordre aleatori i paral·lelisme (TG-362)» (reproduir una fallada amb la llavor, aïllament per worker, regles per als tests nous); estat de la fila «Robustesa»; ordre del job `backend`; ja no diu que `test_alembic` sigui incompatible amb xdist.
- [[testing]] (TG-382): secció «Tests inestables» amb el procediment de quarantena i la prohibició dels reintents; fila «Robustesa» com a instal·lada; avís d'estat d'implantació.

## Pendent / següents passos

- [ ] PR cap a `develop`, revisada per una persona que no sigui l'autora, i CI verda.
- [ ] TG-383 i TG-384, a la segona PR (TG-384 depèn de TG-338).
- [ ] Quan s'acabi la US, actualitzar l'abast de [[0028-tdd-estricte-i-politica-de-testing-avancada|ADR-0028]].

## US de Taiga

- TG-362 (tasques TG-381 i TG-382)
