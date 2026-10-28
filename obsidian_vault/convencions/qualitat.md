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

> [!note] Què falta
> SonarQube Cloud i el Quality Gate encara no són al workflow: arriben amb la US [#194](https://tree.taiga.io/project/alexga03-astronomia-pes/t/194). Fins llavors, la CI (backend i frontend) només cobreix lint, format, tipus i tests.

## SonarQube Cloud

> [!info] Descripció objectiu
> El que segueix descriu el workflow objectiu. Ara per ara el workflow només fa lint, format, tipus i tests als dos jobs; vegeu "CI del backend (implementada)" i "CI del frontend (implementada)" més amunt.

El workflow de CI, a cada PR cap a `develop` o `main`, executa per ordre: (1) format, linters i tipus; (2) tests amb cobertura; (3) anàlisi de SonarQube Cloud; (4) comprovació del Quality Gate. Si falla, la PR no es pot fusionar. També s'analitzen `develop` i `main` després de cada fusió. El token és el secret `SONAR_TOKEN`.

Quality Gate, aplicat al codi nou de cada PR:

- 0 bugs i 0 vulnerabilitats noves.
- Tots els security hotspots revisats.
- Duplicació ≤ 3 %.
- Cobertura de tests del codi nou ≥ 90 % (llindar del Quality Gate de SonarQube Cloud, elevat del 70 % original per [[0028-tdd-estricte-i-politica-de-testing-avancada]]; la política completa, amb un 80 % global, és a [[testing]]).
- Qualificació A en mantenibilitat, fiabilitat i seguretat.

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
