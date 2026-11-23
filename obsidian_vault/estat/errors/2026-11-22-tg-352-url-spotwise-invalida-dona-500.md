---
titol: "TG-352: una SPOTWISE_URL no vàlida donava 500"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Review de la PR 1 de TG-352 (subagent reviewer-arquitectura, 22/11/2026)"
fase: review
capa: backend
regressio: "backend/tests/unit/infrastructure/meeting_points/test_spotwise_examples.py::test_tg352_settings_reject_an_unusable_spotwise_url"
commit: "b0ecd30c"
llico: cap
etiquetes: [error-testing]
---

# TG-352: una SPOTWISE_URL no vàlida donava 500

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Amb una `SPOTWISE_URL` mal configurada, el client llençava `httpx.InvalidURL` i l'endpoint responia `500` en lloc de `503`.

## Causa

`httpx.InvalidURL` no hereta de `httpx.HTTPError` (httpx 0.28.1), i el client només capturava `HTTPError`. A més, la configuració acceptava qualsevol text com a URL.

## Correcció

Un validador a `SpotwiseSettings` exigeix l'esquema http o https i un host. Una URL inservible falla a l'arrencada, no a la primera petició.

## Test de regressió

`backend/tests/unit/infrastructure/meeting_points/test_spotwise_examples.py::test_tg352_settings_reject_an_unusable_spotwise_url` i `::test_tg352_settings_keep_a_valid_spotwise_url`.

## Lliçó

Cap: les altres URL externes (`LAUNCH_LIBRARY_URL`, NASA) ja es validen amb `safe_https_url`; aquesta era l'única que admet HTTP.
