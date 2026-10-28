---
titol: "Sessió 2026-10-17: gestió d'errors i respostes HTTP de l'APOD"
tipus: sessio
estat: vigent
data: "2026-10-17"
us: ["TG-47"]
font: "treball de la tasca TG-115 de la US TG-47 (branca feature/TG-47-endpoint-apod-dia-i-historic); decisions de la persona responsable; backend/app/infrastructure/apod, backend/app/infrastructure/api"
etiquetes: [sessio, backend, tg-47, apod, errors]
---

> [!note] Superada per l'ADR-0028
> La regla «tests després del codi» que se segueix en aquesta sessió es va substituir a final de l'Sprint 1 pel TDD estricte ([[0028-tdd-estricte-i-politica-de-testing-avancada]]).

# Sessió 2026-10-17 · Gestió d'errors i respostes HTTP de l'APOD

## Objectiu

Tancar els errors de `GET /api/apod` sobre el controlador de TG-114 ([[2026-10-16-tg-114-controlador-rest-apod]]), seguint [[0018-errors-rfc-9457-amb-codis-estables]]. Els punts eren quatre:
- exigir el format estricte `YYYY-MM-DD`;
- fixar el codi propi del 503;
- resoldre els pendents de `ProblemDetails`;
- provar els errors de l'endpoint.

Adaptador real (TG-46), proves d'integració (TG-116) i frontend (TG-48) queden fora.

## Què s'ha fet

- **Format estricte de la data** (criteri 1), a `infrastructure/apod/router.py`.
  - El tipus `IsoDate` és `dt.date` amb un `BeforeValidator` que exigeix `fullmatch` de `[0-9]{4}-[0-9]{2}-[0-9]{2}`.
  - Abans, el mode lax de Pydantic acceptava el timestamp Unix (`1760659200`) i el datetime (`2026-10-17T00:00:00`) i tornava 200.
  - Ara aquests casos donen 422 `VALIDATION_ERROR` amb `errors[]` al camp `date`.
  - El domini no s'ha tocat.
- **Codi `APOD_UNAVAILABLE`** (503, `ExternalServiceError`, recuperable).
  - Constant a `app/application/apod/errors.py`, perquè la reutilitzi l'adaptador de TG-46.
  - La descripció de la resposta 503 de l'OpenAPI el cita.
  - Fila nova al catàleg de la skill `gestio-errors`, amb els textos ca/es/en aprovats. S'ha editat a `.agents/skills/` i s'ha sincronitzat a `.claude/skills/` amb `sync-skills.mjs`.
- **`ProblemDetails.errors`**: ara és `list[FieldError]` amb `default_factory=list`.
  - A l'OpenAPI surt com a `array` no obligatori, sense `null`.
  - Així és fidel a `problem_response`, que omet la clau fora dels errors de validació.
- **Tests**, escrits després del codi ([[0019-tests-despres-del-codi]]):
  - `tests/unit/infrastructure/apod/test_apod_errors.py` munta una app amb només el router i `register_error_handlers`, amb `dependency_overrides`, `FakeApodProvider` i el rellotge de l'`ApodService` fixat. Cobreix:
    - 12 formats invàlids, inclosos el timestamp i el datetime;
    - data futura i data anterior a l'inici;
    - els límits vàlids 1995-06-16 i avui;
    - el 503 `APOD_UNAVAILABLE` amb el fake caigut, amb data i sense.
  - A cada error es comproven el status, el `code`, `application/problem+json`, el `correlation_id` i la capçalera `X-Correlation-ID`.
  - `tests/unit/infrastructure/test_problem_schema.py` comprova que el cos de `problem_response` valida contra `ProblemDetails`, amb `errors[]` i sense.
  - `tests/unit/infrastructure/test_openapi.py` comprova que el 503 cita el codi.
- **Qualitat**, executat des de `backend/`:
  - `uv run ruff check .`: OK.
  - `uv run ruff format --check .`: OK.
  - `uv run mypy app tests`: OK.
  - `uv run pytest`: 196 passed, 1 skipped, cobertura del 99 %.

## Decisions preses

- La validació del format va a `infrastructure`, no al domini. El format de transport no és regla de negoci ([[0016-ports-i-entitats-riques-al-domini]]).
- El codi i els textos d'`APOD_UNAVAILABLE` els ha aprovat la persona responsable; el status és el que dona `ExternalServiceError` a `STATUS_BY_ERROR` ([[0018-errors-rfc-9457-amb-codis-estables]]).
- La constant viu a `application/apod`, al costat d'`ExternalServiceError`. Així `infrastructure` la pot importar sense trencar el sentit de les dependències.
- L'app de proves no porta `CorrelationIdMiddleware`, perquè la consigna era muntar-la només amb el router i els handlers. `problem_response` genera el `correlation_id` i la capçalera igualment. El flux complet amb el middleware és de TG-116.

> [!warning] Per a TG-46 (Xavi)
> - Quan la NASA falli i no hi hagi dada a la cache, l'adaptador ha de llançar `ExternalServiceError(APOD_UNAVAILABLE, ...)`, important la constant de `app/application/apod/errors.py`.
> - El `message` d'`ExternalServiceError` surt al `detail` de la resposta. No hi posis `str(exc)` de l'excepció de httpx: conté la URL amb l'`api_key` (criteri 5). Suggeriment: un missatge fix (p. ex. «NASA APOD API unavailable») i el detall tècnic al log, sense la clau.

## Canvis al vault

- Aquesta nota.
- [[2026-10-16-tg-114-controlador-rest-apod]]:
  - s'hi ha corregit la branca;
  - s'hi han tancat els pendents de TG-115;
  - s'hi ha reescrit el pendent de TG-46.
- No s'ha tocat cap ADR ni nota d'arquitectura.

## Pendent / següents passos

- [ ] **TG-48 (frontend):** afegir la clau i18n `errors.APOD_UNAVAILABLE` (ca/es/en) amb els textos del catàleg, i el seu test.
- [ ] TG-46 (Xavi): substituir `get_apod_provider()` per l'adaptador real i usar `APOD_UNAVAILABLE` (vegeu l'avís de més amunt).
- [ ] TG-116: proves d'integració sobre l'app completa.
- [ ] Obrir la PR cap a `develop` (la persona).

### Punts oberts (sense implementar)

- **Dates sense APOD:** la NASA té dies sense publicació. Cal decidir quin error o resposta dona l'API en aquests casos (probablement en definir l'adaptador, TG-46).
- **Desfasament UTC:** «avui» es calcula en UTC, però la NASA publica segons l'hora de l'est dels EUA. Entre la mitjanit UTC i la publicació, la data d'avui pot no tenir APOD encara.

## US de Taiga

- TG-47
