---
titol: "Sessió 2026-11-09: llindars de cobertura bloquejants i mutation testing (TG-359)"
tipus: sessio
estat: vigent
data: "2026-11-09"
us: ["TG-359"]
font: "Taiga US #359 (tasques #368, #369, #370, #371, #372); backend/pyproject.toml, frontend/jest.config.js, frontend/stryker.config.json, .github/workflows/ci.yml; ADR-0028"
etiquetes: [sessio, testing, cobertura, diff-cover, mutation, mutmut, stryker, ci]
---

# Sessió 2026-11-09 · Llindars de cobertura bloquejants i mutation testing (TG-359)

## Objectiu

Automatitzar a la CI els llindars de cobertura bloquejants (backend i frontend) i el mutation testing sobre el diff (mutmut i Stryker) amb llindar de score ≥ 70 %, fent complir automàticament la política de testing d'[[0028-tdd-estricte-i-politica-de-testing-avancada]] i l'estratègia de [[testing]].

## Tasques dutes a terme

### 1. Backend: cobertura bloquejant (Tasca #368)
- Afegit `--cov-fail-under=80` a `backend/pyproject.toml` (`[tool.pytest.ini_options] addopts`): `uv run pytest` falla automàticament si la cobertura global del backend és inferior al 80 %.
- Instal·lat `diff-cover==11.0.1` com a dependència de desenvolupament (`pyproject.toml` i `uv.lock`).
- Configurat `[tool.diff_cover]` a `backend/pyproject.toml` amb `fail_under = 90`.
- Afegit pas a `.github/workflows/ci.yml`: `Verificar cobertura del codi nou al backend (diff-cover >= 90%)` que executa `uv run diff-cover coverage.xml --compare-branch=origin/${{ github.base_ref }} --fail-under=90`.

### 2. Frontend: cobertura bloquejant (Tasca #369)
- Configurat `coverageThreshold` global al 80 % a `frontend/jest.config.js` (`branches: 80`, `functions: 80`, `lines: 80`, `statements: 80`), alineat amb l'ADR-0028 i la Definition of Done.
- El pas existent `pnpm test --coverage --ci` al job `frontend` de la CI fa fallar immediatament la suite si la cobertura global cau del 80 % (cobertura real actual: 95,37 %).
- El llindar de cobertura per al codi nou (≥ 90 %) queda garantit pel Quality Gate de SonarQube Cloud ([[0012-sonarqube-cloud-i-quality-gate]]).

### 3. Backend: mutation testing al domini sobre el diff (Tasca #370)
- Instal·lat `mutmut==3.8.1` a `backend/pyproject.toml` i sincronitzat `uv.lock`.
- Configurada la secció `[tool.mutmut]` a `pyproject.toml` amb `source_paths = ["app/domain"]`, `also_copy = ["app/application", "app/infrastructure", "tests/"]`, `pytest_add_cli_args = ["-o", "addopts="]` i `pytest_add_cli_args_test_selection = ["tests/unit/domain"]`.
- Creat l'script `backend/scripts/run_mutmut_diff.py`:
  - Detecta fitxers canviats a `app/domain` respecte a `--base-branch` (`origin/develop` per defecte, o `origin/${{ github.base_ref }}` a la CI).
  - Executa mutmut exclusivament sobre els fitxers modificats configurant `cfg.only_mutate` programàticament.
  - Avalua les estadístiques exigint un mutation score ≥ 70 % mitjançant la fórmula `(killed + timeout) / (killed + timeout + survived + no_tests + suspicious)`, on els mutants sense tests associats (`no_tests`) computen com a supervivents. Si s'han generat mutants però no se n'ha provat cap, el pas falla.
  - Si `git diff` falla, surt amb codi d'error 1 (sense deixar la porta oberta).
  - Gestiona UTF-8 a la sortida estàndard per a sistemes com Windows.
  - Si no hi ha fitxers de domini afectats a la PR, finalitza en verd sense consum innecessari de temps de CI.
- Integrat pas al job `backend` de `.github/workflows/ci.yml`: `Mutation testing al domini del backend (mutmut >= 70%)`.

### 4. Frontend: mutation testing a la lògica sobre el diff (Tasca #371)
- Instal·lats `@stryker-mutator/core@10.1.1` i `@stryker-mutator/jest-runner@10.1.1` a `frontend/package.json` (`pnpm-lock.yaml`).
- Creat `frontend/stryker.config.json` amb test runner `jest`, `coverageAnalysis: "perTest"` i llindars `{ high: 80, low: 70, break: 70 }`.
- Afegit `modulePathIgnorePatterns: ['<rootDir>/.stryker-tmp']` a `frontend/jest.config.js` per evitar col·lisions en l'escaneig d'Haste map de Jest amb els temporals de Stryker.
- Creat `frontend/scripts/run-stryker-diff.mjs` i afegit script `"test:mutation": "node scripts/run-stryker-diff.mjs"` a `frontend/package.json`:
  - Filtra els fitxers de lògica modificats a `frontend/src/` excloent tests (`.test.`, `.spec.`), tipus (`.d.ts`), fitxers de barril (`index.ts`) i components visuals purs (`src/shared/ui/`).
  - Executa Stryker només sobre els fitxers modificats (`pnpm stryker run --mutate <files>`).
  - Si `git diff` falla o si Stryker finalitza amb error o per senyal, l'script surt amb codi d'error.
  - Si el score és < 70 %, Stryker falla automàticament per `break: 70`.
  - Si no s'ha tocat lògica, finalitza en verd immediatament.
- Actualitzat el pas de checkout del frontend amb `fetch-depth: 0` i afegit el pas `Mutation testing al frontend (Stryker >= 70%)` a `.github/workflows/ci.yml`.

### 5. Documentació i actualització del vault (Tasca #372 i atenció de review)
- Actualitzat [[testing]]:
  - Canviat l'estat de Mutation a `Instal·lat (TG-359)`.
  - Actualitzada la taula i explicació dels mecanismes de bloqueig de cobertura (global al 80 % a backend i frontend, i codi nou al 90 %).
  - Detallada la subsecció `Mutation testing sobre el diff (TG-359)` amb la configuració, fórmula de score, exclusions i execució de `mutmut` i `Stryker`.
  - Afegida nota d'execució en local a Windows (requisit de WSL per a mutmut i codificació `PYTHONIOENCODING=utf-8`).
- Actualitzat [[qualitat]]: documentats els nous passos bloquejants de la CI de backend i frontend.
- Actualitzat [[definition-of-done]]: actualitzat el requisit de cobertura i mutation a la CI com a implementat i automatitzat.
- Actualitzada la skill `testing-mutation` (`.agents/skills/testing-mutation/SKILL.md`) i sincronitzada a `.claude/skills/`.
- Afegits a `.gitignore`: `mutants/`, `.mutmut-cache/`, `reports/` i `.stryker-tmp/`.
- Creada aquesta nota de sessió.

## Decisions d'enginyeria i aprenentatges

1. **Aïllament d'arguments de cobertura a mutmut:** `mutmut` executa la suite de proves per a cada mutant individualment. Si pytest manté `--cov-fail-under=80`, el test del mutant falla no per defecte de lògica sinó perquè un test individual no assoleix la cobertura global del projecte. S'ha solucionat netejant els addopts (`pytest_add_cli_args = ["-o", "addopts="]`) i acotant l'execució a `tests/unit/domain`.
2. **Còpia d'arbres a mutmut:** els tests de domini o utilitats importen classes de suport o protocols; afegir `also_copy = ["app/application", "app/infrastructure", "tests/"]` a `[tool.mutmut]` evita errors de resolució de mòduls a l'entorn aïllat de mutants.
3. **Mypy estricte i re-exports de mutmut:** mutmut no proveeix tipatge oficial i importa submòduls sense `__all__`. Per evitar errors `attr-defined` en mode estricte, s'importa des dels submòduls canònics (`mutmut.mutation.data`, `mutmut.stats`, `mutmut.utils.file_utils`) i s'ha configurat l'override pertinent a `pyproject.toml`.
4. **Resolució de mutants sense tests (`no_tests`):** Si s'afegeix un fitxer de domini nou sense proves, els mutants no s'han de descartar silenciosament. Comptar `no_tests` com a supervivents i forçar la fallada del pas si no se'n prova cap assegura el compliment estricte de la política de TDD de l'ADR-0028.
5. **Robustesa davant fallades de procés:** Tant a `run_mutmut_diff.py` com a `run-stryker-diff.mjs`, qualsevol fallada en obtenir el git diff o qualsevol interrupció anòmala del procés fill (senyals) surt explícitament amb codi d'error per evitar falsos positius a la CI.
6. **Conflicte d'Haste map amb Stryker:** `jest-expo` utilitza l'escaneig Haste map de React Native. Durant l'execució de Stryker es crea el directori `.stryker-tmp`, que duplicava mòduls i provocava fallades a Jest. L'exclusió a `modulePathIgnorePatterns` a `frontend/jest.config.js` resol la incidència.
7. **Git history complet a la CI:** Perquè tant `diff-cover` com els scripts de mutació puguin calcular el diff contra `origin/${{ github.base_ref }}`, el checkout requereix `fetch-depth: 0` tant al job `backend` com al job `frontend`.

## Enllaços

- [[testing]]
- [[qualitat]]
- [[0028-tdd-estricte-i-politica-de-testing-avancada]]
- [[definition-of-done]]
