---
titol: "Sessió 2026-10-31: tests de contracte i d'arquitectura (TG-360)"
tipus: sessio
estat: vigent
data: "2026-10-31"
us: ["TG-360"]
font: "Taiga US #360; backend/tests, backend/pyproject.toml, .github/workflows/ci.yml; ADR-0028 i ADR-0025"
etiquetes: [sessio, testing, contracte, schemathesis, import-linter, migracions]
---

# Sessió 2026-10-31 · Tests de contracte i d'arquitectura (TG-360)

## Objectiu

Implantar les peces «previstes» de contracte, arquitectura i migracions de [[0028-tdd-estricte-i-politica-de-testing-avancada]] i que s'executin sols a la CI.

## Què s'ha fet

- **Dependències** de desenvolupament fixades: `schemathesis==4.32.7` i `import-linter==2.15` ([[0013-uv-i-pnpm-com-a-gestors-de-dependencies]]).
- **Còpia d'OpenAPI:** test que compara `create_app().openapi()` amb `frontend/openapi/openapi.json` i script `backend/scripts/export_openapi.py`. La còpia ja estava desfasada (faltaven tres `maxLength`) i s'ha regenerat.
- **import-linter:** tres contractes a `backend/pyproject.toml` (domini sense frameworks, aplicació sense infraestructura ni FastAPI, capes) i un test que els executa; pas `uv run lint-imports` a la CI. El test AST propi no s'ha tocat.
- **Migracions:** test que per a cada revisió fa `upgrade`, `downgrade` a l'anterior i compara l'esquema (coherent amb el rollback d'[[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]).
- **schemathesis** en procés (ASGI amb lifespan) sobre PostgreSQL i Redis reals, Google i NASA amb `respx`, autenticació amb un login real amb token de prova, llavor fixa i neteja de dades; check propi per als errors RFC 9457 ([[0018-errors-rfc-9457-amb-codis-estables]]).
- **CI:** `lint-imports` al job `backend`; `pnpm api:generate` + `git diff --exit-code` de `schema.d.ts` al job `frontend`.

## Troballes del fuzzing (corregides)

- Cos JSON malformat a `/api/auth/google` i `/api/auth/refresh` responia 400 no documentat: ara és a l'OpenAPI.
- `/api/auth/logout` accepta la petició sense token (és idempotent), però l'esquema deia que `Authorization` era obligatori: ara el Bearer és opcional a l'esquema.
- `GET /api/apod`: el 422 per dates fora de rang és vàlid i declarat, però no expressable com a restricció d'esquema; s'accepta al check `positive_data_acceptance` d'aquella operació.

## Proves de negatiu (criteri 10)

- Còpia d'OpenAPI: el test va fallar amb la còpia desfasada abans de regenerar-la.
- import-linter: `import fastapi` temporal al domini → contracte trencat i test en vermell; revertit → verd.
- Migracions: `downgrade()` de `ff2baaa95c59` amb `pass` → «downgrade of … does not restore the schema»; revertit → verd.
- Client regenerat: canvi a `openapi.json` sense regenerar → `git diff --exit-code` surt amb 1; regenerat → 0.
- Check RFC 9457: tests unitaris amb respostes falses (no `problem+json`, camp absent, `status` diferent).
- schemathesis: abans de corregir els dos defectes de l'esquema, el test de contracte era en vermell.

## Canvis al vault

- [[testing]]: files Contracte, Arquitectura i Migracions a «Instal·lat», nota d'estat, secció «Contracte, arquitectura i migracions (TG-360)» i com executar-ho en local.
- Aquesta nota.

## Pendent

- La cobertura bloquejant, mutation, E2E, robustesa i seguretat segueixen a #359, #361 i #362.
