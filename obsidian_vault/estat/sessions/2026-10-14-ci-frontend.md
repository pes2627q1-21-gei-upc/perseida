---
titol: "Sessió 2026-10-14: CI del frontend (TG-35)"
tipus: sessio
estat: vigent
data: 2026-10-14
us: ["TG-35"]
font: "PR #24 (feature/ci-frontend-workflow); tasques #258 a #262 de Taiga; review de la PR #24"
etiquetes: [sessio, frontend, ci, github-actions, jest, tg-35]
---

# Sessió 2026-10-14 · CI del frontend (TG-35)

## Objectiu

Afegir al workflow de CI un job `frontend` que executi lint, tipus i tests del frontend a cada push i pull request cap a `develop` i `main`.

## Què s'ha fet

- Job `frontend` a `.github/workflows/ci.yml`, al costat de `changes` i `backend`: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm tsc` i `pnpm test --coverage --ci`, cada ordre en un pas separat.
- Filtre de rutes (`frontend/**` i el workflow) amb la mateixa condició que el backend: job omès si no hi ha canvis a la PR i execució sempre en un push.
- Node 22.23.3 fixat al workflow i memòria cau de pnpm.
- Test de fum `frontend/__tests__/smoke.test.ts` i `coverageReporters` (`lcov`, `text`) a `jest.config.js`; l'informe `lcov.info` es publica com a artefacte `frontend-coverage`.
- README del frontend (ca, es, en): seccions «Run and test» i «Continuous integration».
- Resolució de la review de la PR #24: pnpm fixat a `packageManager` de `frontend/package.json` (el workflow el llegeix amb `package_json_file`), `coverage/` afegit a `ignorePatterns` d'ESLint, `coverageDirectory` redundant eliminat, format de `ci.yml` i notes del vault.

## Decisions preses

- El filtre per ruta va dins del workflow i no a `paths:`, com al backend, perquè un check requerit no quedi *pending* ([[2026-10-14-ci-backend]]).
- La versió de pnpm es declara a `packageManager` (font única per a local i CI); la de Node continua només al workflow.
- Cap decisió que mereixi una ADR nova.

## Canvis al vault

- [[arquitectura-fisica]]: tercer job `frontend` a la CI.
- [[frontend]]: Jest i CI del frontend ja existeixen.
- [[qualitat]]: secció "CI del frontend (implementada)".
- [[testing]]: execució a la CI i artefactes de cobertura.

## Pendent / següents passos

- [ ] Fusionar la PR #24 cap a `develop` (aprovació d'una persona que no sigui l'autora).
- [ ] Tasca #261: validar la CI amb PR d'acceptació, un cop fusionada la PR.
- [ ] TG-33: exigir els checks `backend` i `frontend` a la protecció de branques.
- [ ] Acordar amb l'equip les versions de Node i pnpm.
- [ ] Comprovar a una segona execució que la memòria cau de pnpm es restaura.
- [ ] SonarQube Cloud i Quality Gate (US [#194](https://tree.taiga.io/project/alexga03-astronomia-pes/t/194)); tests de components i mocks de l'API (US #83).

## US de Taiga

- TG-35
