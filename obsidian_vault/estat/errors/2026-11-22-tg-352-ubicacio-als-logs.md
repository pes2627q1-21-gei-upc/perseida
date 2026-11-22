---
titol: "TG-352: la ubicació de la usuària als logs d'httpx"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352"]
font: "Review de la PR 1 de TG-352 (subagent reviewer-arquitectura, 22/11/2026)"
fase: review
capa: backend
regressio: "backend/tests/unit/infrastructure/meeting_points/test_spotwise_client.py::test_tg352_the_location_sent_to_spotwise_is_not_logged"
commit: "ec9fbfea"
llico: cap
etiquetes: [error-testing]
---

# TG-352: la ubicació de la usuària als logs d'httpx

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Cada crida a Spotwise escrivia a INFO `HTTP Request: GET http://...?lat=..&lon=..`: la posició de la usuària, arrodonida a uns 100 m, quedava als logs del servidor.

## Causa

httpx registra la URL completa de cada petició al nivell INFO, i el logger arrel del backend és a INFO ([[0022-logging-json-global-amb-stdlib]]). Fins ara cap URL de servei extern portava dades personals, i ningú ho havia vist.

## Correcció

`configure_logging` posa els loggers `httpx` i `httpcore` a WARNING. La correcció és global: protegeix totes les integracions.

## Test de regressió

`backend/tests/unit/infrastructure/meeting_points/test_spotwise_client.py::test_tg352_the_location_sent_to_spotwise_is_not_logged`.

## Lliçó

Cap: la correcció és a la configuració global de logs i el test en vigila la regressió.
