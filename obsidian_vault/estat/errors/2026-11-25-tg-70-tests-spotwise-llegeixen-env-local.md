---
titol: "Tests de Spotwise que fallen en local si backend/.env té el token"
tipus: error-testing
estat: obert
data: "2026-11-25"
us: ["TG-70", "TG-352"]
font: "Suite completa del backend en local durant TG-70 (2026-11-25)"
fase: roig-inesperat
capa: infrastructure
regressio:
commit:
llico: cap
etiquetes: [error-testing, backend, spotwise, entorn]
---

# Els tests del mock de Spotwise fallen en local quan `backend/.env` té `SPOTWISE_API_TOKEN`

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Amb `uv run pytest` a `backend/` i un `backend/.env` amb el token de Spotwise, fallen `tests/integration/test_meeting_points_api.py::test_tg352_without_token_the_mock_answers_without_calling_spotwise` i `tests/integration/test_api_contract.py::test_api_keeps_its_openapi_contract[GET /api/meeting-points]` (`RESPX: ... /api/espais/ ... not mocked!`). Exportar `SPOTWISE_API_TOKEN=` buit no ho evita. També falla a `develop` amb el mateix `.env` i passa sense; a la CI no hi ha `.env`. No té relació amb el canvi de TG-70.

## Causa

`SpotwiseSettings` (`app/infrastructure/meeting_points/config.py`) llegeix `env_file=".env"`, i els tests que esperen el mock sense token no aïllen aquest fitxer: el resultat depèn de l'entorn local.

## Correcció

Cap encara (fora de l'abast de TG-70). Opció: que aquests tests forcin la configuració sense token (p. ex. `SpotwiseSettings(_env_file=None)` o sobreescriure la dependència).

## Test de regressió

Els dos tests citats, executats amb un `backend/.env` que tingui el token.

## Lliçó

Cap fins que es corregeixi; en local, per provar la suite completa, cal fer-ho sense el token a `backend/.env`.
