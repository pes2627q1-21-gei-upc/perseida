---
titol: "TG-352: còpia de l'OpenAPI del frontend desfasada en afegir un endpoint"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Verificació de la PR 1 de TG-352 (subagent backend, 22/11/2026)"
fase: ci-mutants
capa: backend
regressio: "backend/tests/unit/infrastructure/test_openapi_copy.py::test_frontend_openapi_copy_matches_backend_schema"
commit: "ebad9fbb"
llico: skill
etiquetes: [error-testing]
---

# TG-352: còpia de l'OpenAPI del frontend desfasada en afegir un endpoint

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Després d'afegir `GET /api/meeting-points`, `test_frontend_openapi_copy_matches_backend_schema` fallava: `frontend/openapi/openapi.json` no tenia la ruta nova. La CI de la PR 1 hauria quedat vermella.

## Causa

L'encàrrec al subagent `backend` deia «no toquis res del frontend», tot i que regenerar la còpia de l'OpenAPI forma part de canviar un endpoint ([[testing]], skill `testing-integracio`). L'agent principal no va copiar a l'encàrrec aquest pas, que la skill ja preveu.

## Correcció

S'ha regenerat la còpia a la mateixa PR: `uv run python -m scripts.export_openapi` i `pnpm api:generate` (commit `ebad9fbb`).

## Test de regressió

`backend/tests/unit/infrastructure/test_openapi_copy.py::test_frontend_openapi_copy_matches_backend_schema`, que ja existia i és el que l'ha detectat.

## Lliçó

Mateixa causa que [[2026-11-22-tg-352-sense-limit-cap-a-spotwise]] i [[2026-11-22-tg-352-sense-test-d-integracio]]: l'encàrrec al subagent no porta els passos que la skill de domini ja demana. Com que la causa es repeteix, la lliçó és obligatòria: la skill `implementar-us` (fase 7) diu ara que l'encàrrec al subagent porta la checklist de la skill de domini (preguntes del client extern, test d'integració, regenerar l'OpenAPI) i que no se'n pot limitar l'abast si deixa fora un pas obligatori (decisió de Raquel, 22/11/2026).
