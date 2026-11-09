---
titol: "Qualitat del codi i Quality Gate"
tipus: convencio
estat: vigent
data: "2026-10-28"
us: ["TG-85", "TG-34", "TG-35", "TG-342"]
font: "memòria §2.4; .github/workflows/ci.yml (PR #18, PR #24); frontend/package.json (script typecheck, TG-342)"
etiquetes: [convencio, qualitat, ruff, mypy, eslint, sonarqube]
---

# Qualitat del codi i Quality Gate

## Regla

La qualitat es construeix de manera contínua i es fa complir automàticament. Les regles són les mateixes per a tot l'equip: viuen en fitxers de configuració versionats al monorepo (`pyproject.toml`, configuració d'ESLint i de Prettier), es poden executar en local abans de fer commit i la CI les executa obligatòriament a cada PR.

## Anàlisi estàtica

| Àmbit | Eina | Regla |
|---|---|---|
| Backend | `ruff` (linter i formatador) | PEP 8, errors i males pràctiques, ordenació d'imports, complexitat ciclomàtica màxima de 10 per funció |
| Backend | `mypy` en mode estricte | Models de domini, esquemes de dades i serveis de l'API |
| Frontend | ESLint | Regles recomanades per a TypeScript, React i React Hooks |
| Frontend | Prettier | Format unificat |
| Frontend | TypeScript `strict` | Sense tipus implícits ni no verificats |

## CI del backend (implementada)

Des de TG-34, `.github/workflows/ci.yml` executa el job `backend` a cada PR i a cada push cap a `develop` o `main`, amb les mateixes ordres que en local (des de `backend/`): `uv sync --locked`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .` i `uv run pytest --cov-report=xml:coverage.xml`. L'informe de cobertura es descarrega de l'execució, a *Artifacts*, amb el nom `backend-coverage`.

## CI del frontend (implementada)

Des de TG-35, el mateix workflow executa el job `frontend` a cada PR i a cada push cap a `develop` o `main`, amb les mateixes ordres que en local (des de `frontend/`): `pnpm install --frozen-lockfile`, `pnpm lint` (ESLint amb Prettier), `pnpm typecheck` i `pnpm test --coverage --ci`. Cada ordre és un pas separat perquè es vegi quina falla. L'script de tipus es diu `typecheck` i no `tsc`: `expo-doctor`, que EAS Build executa abans de compilar, avisa quan un script de `package.json` té el nom d'un binari de `node_modules/.bin`. Node (al workflow) i pnpm (a `packageManager` de `frontend/package.json`) estan fixats. L'informe `lcov.info` es descarrega de l'execució, a *Artifacts*, amb el nom `frontend-coverage`. El job no necessita secrets ni serveis.

## SonarQube Cloud (implementat a TG-194)

El workflow de CI, a cada PR cap a `develop` o `main`, executa el job `sonar` després dels jobs de `backend` i `frontend`. Aquest job descarrega els informes de cobertura (`backend/coverage.xml` i `frontend/coverage/lcov.info`) i executa l'escaneig de SonarQube Cloud amb `-Dsonar.qualitygate.wait=true`. Si el Quality Gate no se supera, el job falla i la PR no es pot fusionar.

- **Organització:** `pes2627q1-21-gei-upc`
- **Projecte:** `pes2627q1-21-gei-upc_perseida`
- **Panell d'accés:** [Panell de SonarQube Cloud](https://sonarcloud.io/project/overview?id=pes2627q1-21-gei-upc_perseida)
- **Token:** El secret `SONAR_TOKEN` als Secrets de GitHub Actions.

### Quality Gate (`perseida`)

Aplicat al codi nou (**New Code**) de cada PR:

- **Fiabilitat (Bugs):** Qualificació **A** (0 bugs nous).
- **Seguretat (Vulnerabilitats):** Qualificació **A** (0 vulnerabilitats noves).
- **Mantenibilitat (Code Smells):** Qualificació **A**.
- **Security Hotspots:** 100 % revisats.
- **Duplicació de línies:** ≤ 3.0 %.
- **Cobertura en codi nou:** ≥ 70 % (o ≥ 90 % segons política TDD avançada; excloent rutes i components visuals purs: `frontend/src/shared/ui/**`, `frontend/src/app/**`).

### Com interpretar fallades i analitzar línies no cobertes

1. **Navegació a fallades:** Des del fil de la PR, el bot de SonarQube o el check fallit enllaça directament al resum de l'anàlisi.
2. **Línies no cobertes:** Al panell del projecte, entra a la pestanya **Measures** → **Coverage** (o fes clic directament sobre el percentatge vermell de New Code). Clicant sobre cada fitxer s'obre la vista de codi amb franges vermelles a les línies no executades pels tests.
3. **Resolució:** Afegeix les proves unitàries o d'integració que cobreixin les branques/línies assenyalades abans de fer un nou push a la branca de la PR.

### Resolució d'incidències d'importació d'informes

- **Rutes no resoltes (*Could not resolve path*):** Comprova que `backend/coverage.xml` té `relative_files = true` a `pyproject.toml` i que `frontend/coverage/lcov.info` té camins relatius al monorepo.
- **PRs sense canvis a backend o frontend:** El job `sonar` tolera l'absència d'un dels informes si el job corresponent s'ha saltat mitjançant `continue-on-error: true` i condicions `if` sobre la detecció de canvis.

Quan falla, l'autor corregeix i torna a pujar. Un fals positiu es marca a SonarQube Cloud amb un comentari que ho justifica i el revisor ho valida; els security hotspots els revisa l'autor i els confirma el revisor.

## Peer review

La plantilla de PR inclou una llista que el revisor valida: arquitectura hexagonal, tests per al codi nou, claredat i nomenclatura, eficiència de les consultes PostgreSQL/PostGIS, absència de secrets, avisos de SonarQube Cloud i actualització del vault. El codi generat amb IA segueix el mateix procés.

## Seguiment

A cada sprint retrospective es revisen les mètriques de SonarQube Cloud (deute tècnic, code smells, duplicació i cobertura) i s'acorden millores.

## Enllaços

- [[testing]]: proves i llindars de cobertura.
- [[definition-of-done]]: el Quality Gate forma part de la DoD.
- [[gitflow]]: protecció de branques que fa obligatòria la CI.
- [[0012-sonarqube-cloud-i-quality-gate]]
- [[0013-uv-i-pnpm-com-a-gestors-de-dependencies]]
