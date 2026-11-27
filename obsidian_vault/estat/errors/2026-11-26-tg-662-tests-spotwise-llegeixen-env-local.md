---
titol: "Tests de Spotwise que fallen en local si backend/.env té el token"
tipus: error-testing
estat: corregit
data: "2026-11-26"
us: ["TG-662", "TG-352"]
font: "Suite completa del backend en local durant TG-70 (2026-11-25)"
fase: roig-inesperat
capa: infrastructure
regressio:
commit: "TG-662 test(backend): els tests del mock de Spotwise no llegeixen el backend/.env local"
llico: convencio
etiquetes: [error-testing, backend, spotwise, entorn]
---

# Els tests del mock de Spotwise fallen en local quan `backend/.env` té `SPOTWISE_API_TOKEN`

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Amb `uv run pytest` a `backend/` i un `backend/.env` amb el token de Spotwise, fallen `tests/integration/test_meeting_points_api.py::test_tg352_without_token_the_mock_answers_without_calling_spotwise` i `tests/integration/test_api_contract.py::test_api_keeps_its_openapi_contract[GET /api/meeting-points]` (`RESPX: ... /api/espais/ ... not mocked!`). Exportar `SPOTWISE_API_TOKEN=` buit no ho evita. També falla a `develop` amb el mateix `.env` i passa sense; a la CI no hi ha `.env`. Trobat durant TG-70, sense relació amb aquell canvi.

## Causa

`SpotwiseSettings` (`app/infrastructure/meeting_points/config.py`) llegeix `env_file=".env"`, i els tests que esperen el mock sense token no aïllen aquest fitxer: el resultat depèn de l'entorn local.

## Correcció

TG-662: la fixture `_env` de `test_meeting_points_api.py` i la de `test_api_contract.py` posen `SpotwiseSettings.model_config["env_file"] = None` amb `monkeypatch.setitem`, de manera que el token no arriba des de `backend/.env`. La del contracte també esborra `SPOTWISE_API_TOKEN` de l'entorn.

## Test de regressió

Els dos tests citats, executats amb un `backend/.env` que tingui el token: sense el canvi el primer falla; amb el canvi passen (7 passats).

## Lliçó

Un test que depèn de l'absència d'una variable no ha de llegir el `.env` local: la fixture ha d'anul·lar `env_file` de la configuració, perquè `delenv` o una variable buida no n'hi ha prou (`env_ignore_empty`).
