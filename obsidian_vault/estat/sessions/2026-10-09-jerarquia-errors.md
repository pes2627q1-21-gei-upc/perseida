---
titol: "Sessió 2026-10-09: jerarquia d'errors i handler RFC 9457 base"
tipus: sessio
estat: vigent
data: 2026-10-09
us: ["TG-304", "TG-44"]
font: "tasca TG-304 de Taiga (dins de TG-44); decisions confirmades per la persona responsable durant la sessió"
etiquetes: [sessio, backend, errors, tg-304]
---

# Sessió 2026-10-09 · Jerarquia d'errors i handler RFC 9457 base

## Objectiu

Deixar la peça compartida d'errors que necessiten TG-44 i TG-45 i que ampliarà TG-49, seguint [[0018-errors-rfc-9457-amb-codis-estables]]: jerarquia a `domain` i `application`, handlers RFC 9457 i correlation id.

## Què s'ha fet

- `DomainError` i subclasses a `app/domain/shared/errors.py`; `ApplicationError`, `UnauthorizedError`, `ForbiddenError` i `ExternalServiceError` a `app/application/shared/errors.py`.
- `app/infrastructure/api/`: middleware `X-Correlation-ID`, `problem_response` i `register_error_handlers(app)` (cridat des de `create_app()`).
- Handlers per a `DomainError`, `ApplicationError`, errors de validació de FastAPI, errors HTTP de Starlette i excepcions inesperades (500 `INTERNAL_ERROR` sense detalls).
- Tests unitaris i d'integració després del codi ([[0019-tests-despres-del-codi]]); cobertura del codi nou al 100 %. Un test de regressió va destapar un bug (títol de status no estàndard) i s'ha corregit.
- README del backend (ca, es, en) amb la secció «Errors»; skill `gestio-errors` i catàleg de codis actualitzats.

## Decisions preses

Concrecions de l'ADR-0018 (no en canvien la decisió; vegeu la secció «Concreció (TG-304)»): signatura amb `message` opcional, status només a `infrastructure` per MRO, `type` `about:blank`, `title` amb la frase HTTP, `correlation_id` a tots els errors, `errors[]` com `{field, message, type}` i capçalera `X-Correlation-ID` validada.

## Criteris d'acceptació i proves

| Criteri de la tasca | Prova |
|---|---|
| Status, `Content-Type`, camps i `code` per a cada classe | `tests/integration/test_error_handlers.py` (parametritzat sobre les classes) |
| El 500 no filtra traça ni nom de classe | `tests/integration/test_error_handlers.py` (`RuntimeError`) |
| `mypy`, `ruff` i test d'arquitectura | `tests/architecture/test_layer_dependencies.py` i les ordres de [[qualitat]] |
| Documentat a README i vault | `backend/README*.md`, [[0018-errors-rfc-9457-amb-codis-estables]], [[api]], [[backend-hexagonal]] |

## Canvis al vault

- [[0018-errors-rfc-9457-amb-codis-estables]]: secció «Concreció (TG-304)».
- [[api]]: secció «Errors i correlació».
- [[backend-hexagonal]]: mòduls `shared` i `api`.
- [[estat-actual]].

## Pendent / següents passos

- [ ] Obrir la PR cap a `develop` (la persona) i avisar l'equip de TG-44 (tasca #283) quan es fusioni.
- [ ] No hi ha workflow de CI del backend a `.github/workflows/`: els linters i els tests s'han executat en local.
- [ ] TG-49: logging estructurat complet i `/health` amb PostgreSQL i Redis.

## US de Taiga

- TG-304 (dins de TG-44)
