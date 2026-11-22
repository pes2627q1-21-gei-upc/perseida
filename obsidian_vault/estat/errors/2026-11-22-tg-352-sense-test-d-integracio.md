---
titol: "TG-352: cache i servei extern sense test d'integració"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Review de la PR 1 de TG-352 (subagent reviewer-arquitectura, 22/11/2026)"
fase: review
capa: backend
regressio: "backend/tests/integration/test_meeting_points_api.py"
commit: "2c567454"
llico: skill
etiquetes: [error-testing]
---

# TG-352: cache i servei extern sense test d'integració

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

`/api/meeting-points` només tenia tests amb `FakeCache` i dependències substituïdes. No es provava la ruta real: lifespan, `get_meeting_point_service`, `RedisCache` i la serialització de la cache.

## Causa

L'encàrrec al subagent `qa-tester` demanava tests unitaris i d'API, però no un test d'integració. La [[definition-of-done]] i la skill `backend-adaptador` l'exigeixen quan es toquen la persistència, la cache o un servei extern.

## Correcció

`backend/tests/integration/test_meeting_points_api.py`, amb Redis real i respx: un miss crida Spotwise i desa amb TTL 300, un hit no crida, el 503 no desa res i, sense token, respon el mock.

## Test de regressió

`backend/tests/integration/test_meeting_points_api.py` (5 tests, entre ells `test_tg352_a_miss_calls_spotwise_and_caches_for_300_seconds`).

## Lliçó

Mateixa causa que [[2026-11-22-tg-352-copia-openapi-desfasada]]: vegeu-hi la lliçó.
