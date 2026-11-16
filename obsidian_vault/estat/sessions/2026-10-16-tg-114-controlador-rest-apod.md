---
titol: "Sessió 2026-10-16: controlador REST i DTOs de l'APOD"
tipus: sessio
estat: vigent
data: "2026-10-16"
us: ["TG-47"]
font: "treball de la tasca TG-114 de la US TG-47 (branca feature/TG-47-endpoint-apod-dia-i-historic); decisions de la persona responsable; backend/app/infrastructure/apod"
etiquetes: [sessio, backend, tg-47, apod]
---

> [!note] Superada per l'ADR-0028
> La regla «tests després del codi» que se segueix en aquesta sessió es va substituir a final de l'Sprint 1 pel TDD estricte ([[0028-tdd-estricte-i-politica-de-testing-avancada]]).

# Sessió 2026-10-16 · Controlador REST i DTOs de l'APOD

## Objectiu

Exposar `GET /api/apod?date=YYYY-MM-DD` sobre l'`ApodService` de TG-113 (vegeu [[2026-10-14-domini-apod]]), seguint el patró del mòdul `health` ([[0017-injeccio-de-dependencies-i-services-singleton]]). Errors (TG-115), proves d'integració (TG-116) i adaptador real (TG-46) queden fora.

## Què s'ha fet

- Router `GET /api/apod` a `infrastructure/apod/router.py`, amb el paràmetre opcional `date` i `operation_id` `get_apod`.
- DTO `ApodResponse` amb `ApodResponse.from_apod`: `apod_date` -> `date` i `media_url` -> `url`.
- Respostes 422, 500 i 503 documentades a l'OpenAPI amb `ProblemDetails` (`application/problem+json`). El 503 no cita cap codi propi.
- `ProblemDetails` i `FieldError` a `infrastructure/api/schemas.py`, perquè la resta de rutes els puguin reutilitzar.
- Wiring a `infrastructure/apod/dependencies.py`: `get_apod_provider()` i `get_apod_service()` amb `@lru_cache`, i `ApodServiceDep`.
- `ProvisionalApodProvider` (`infrastructure/apod/provisional_provider.py`): resposta de mostra amb la data demanada, sense cap crida externa ni dades reals de la NASA, sense importar res de `tests/`.
- Router registrat a `create_app()` amb el prefix `/api`.
- OpenAPI sense `application/json` duplicat a les respostes d'error: `install_openapi_cleanup` (`infrastructure/api/openapi.py`) l'elimina de les respostes 4xx/5xx que ja tenen `application/problem+json`. S'ha provat primer l'opció local (només `content=` al router, sense `model=`), però deixa `ProblemDetails` sense registrar als components i el `$ref` queda penjat; per això s'ha usat la funció global. Test a `tests/unit/infrastructure/test_openapi.py`, que també comprova que `/api/health` no canvia.
- Proves unitàries del mapeig `from_apod` i del router (consulta sense data i amb data, paràmetre `date` a l'OpenAPI), amb `FakeApodProvider` i `dependency_overrides` sobre una app que només porta el router ([[0019-tests-despres-del-codi]]).

## Decisions preses

- Provider temporal en un fitxer propi, decidit per la persona. TG-46 només ha de canviar el cos de `get_apod_provider()` i esborrar `provisional_provider.py`; el router no es toca.
- Camps de la resposta `date` i `url`, com diu la US (criteri 4); això **difereix de `frontend/openapi/apod.provisional.json`**, que encara usa `apod_date` i `media_url`.
- Tests limitats al mapeig i al router; res de 422/503 ni de client sobre l'app completa (TG-115/TG-116).
- Els errors segueixen [[0018-errors-rfc-9457-amb-codis-estables]]: una data mal formada dona 422 `VALIDATION_ERROR` (handler genèric); les dates futures o anteriors al 16/06/1995, els codis `APOD_DATE_IN_FUTURE` i `APOD_DATE_BEFORE_START` del catàleg.

## Canvis al vault

- Aquesta nota. No s'ha tocat cap ADR ni nota d'arquitectura.

## Pendent / següents passos

- [ ] **TG-48 (frontend):** regenerar `frontend/openapi/apod.provisional.json`, `frontend/src/shared/api/schema.d.ts`, `frontend/src/features/apod/api/getApodToday.ts` i els mocks, amb `apod_date` -> `date` i `media_url` -> `url`. El frontend no s'ha tocat a TG-114.
- [ ] TG-46 (Xavi): substituir `get_apod_provider()` per l'adaptador real i usar la constant `APOD_UNAVAILABLE` (`app/application/apod/errors.py`) quan la NASA falli sense cache. El codi propi del 503 ja és fixat a TG-115.
- [x] TG-115: proves i gestió dels errors HTTP de l'APOD. Vegeu [[2026-10-17-tg-115-errors-apod]].
- [ ] TG-116: proves d'integració.
- [x] TG-115: `ProblemDetails.errors` documenta `anyOf [array, null]`, però les respostes reals ometen la clau quan no és un error de validació i mai envien `null`. Corregit a [[2026-10-17-tg-115-errors-apod]].
- [x] TG-115: afegir un test que comprovi que `ProblemDetails` valida el cos que construeix `problem_response`, perquè `problem.py` i `schemas.py` no es desincronitzin (les dues llistes de camps es mantenen a mà). Fet a [[2026-10-17-tg-115-errors-apod]].
- [ ] Obrir la PR cap a `develop` (la persona).

## US de Taiga

- TG-47
