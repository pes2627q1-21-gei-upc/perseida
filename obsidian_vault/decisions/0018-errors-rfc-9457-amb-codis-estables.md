---
titol: "Errors transversals: RFC 9457 amb codis estables traduïts al frontend"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-205", "TG-304"]
font: "sessió de treball del 2026-10-07 (TG-205); decisions de la persona responsable; tasca TG-304 de Taiga (2026-10-09)"
etiquetes: [adr, backend, frontend, errors, i18n]
---

# ADR-0018 · Errors transversals: RFC 9457 amb codis estables traduïts al frontend

## Context

L'app serà trilingüe (ca/es/en) i el frontend no ha de mostrar mai JSON ni missatges crus. Cal un contracte d'errors únic entre backend i frontend, i que el backend no filtri detalls interns.

## Decisió

- Jerarquia: `DomainError(code)` i subclasses (`NotFoundError`, `BusinessRuleViolation`, `ConflictError`, `ValidationError`) al domini; `ApplicationError` (`UnauthorizedError`, `ForbiddenError`) a `application`. Cap `HTTPException` fora d'`infrastructure`.
- Els *exception handlers* d'`infrastructure` responen amb **RFC 9457** (`application/problem+json`): `type`, `title`, `status`, `detail`, `instance`, `code` i, si cal, `errors`. El `code` és estable en SCREAMING_SNAKE (p. ex. `EVENT_NOT_FOUND`).
- Els 500 no exposen detalls interns: porten `correlation_id` i queden al log estructurat.
- **El frontend tradueix per `code`** amb i18next (ca/es/en), amb un missatge genèric de reserva, i el mostra sempre com a *toast*; mai JSON, traça ni text cru. Els errors de xarxa i *offline* també usen toast.
- La seguretat es resol al backend; el frontend només presenta.

## Concreció (TG-304)

Detall d'implementació de la decisió anterior, confirmat a la tasca TG-304 (US TG-44). No canvia la decisió.

- **Signatura:** `DomainError(code, message=None)` i `ApplicationError(code, message=None)`; si falta el missatge, val el `code`. `ApplicationError` no hereta de `DomainError`. El `message` és tècnic (logs i `detail`), mai per a l'usuari.
- **Status només a `infrastructure`:** mapa `STATUS_BY_ERROR` resolt per MRO. `NotFoundError` 404, `ConflictError` 409, `ValidationError` i `BusinessRuleViolation` 422, `UnauthorizedError` 401, `ForbiddenError` 403, `ExternalServiceError` 503 (classe d'`application` per a proveïdors externs caiguts sense cache); la resta de `DomainError`/`ApplicationError` 400.
- **Cos:** `type` sempre `about:blank`; `title` és la frase HTTP estàndard; `correlation_id` a tots els errors; `errors[]` només en validació, amb `{field, message, type}` per camp i `code` `VALIDATION_ERROR` (422).
- **Altres handlers:** errors HTTP de Starlette (`NOT_FOUND`, `METHOD_NOT_ALLOWED`, `HTTP_<status>`) i excepcions inesperades (500 `INTERNAL_ERROR`, `detail` genèric, sense traça ni nom de classe).
- **Correlació:** capçalera `X-Correlation-ID` a totes les respostes, generada amb `uuid4` per petició; un valor entrant només es respecta si compleix `[A-Za-z0-9._-]{1,128}`, per evitar injecció als logs.
- **Fora d'abast:** el logging estructurat complet i el *healthcheck* amb PostgreSQL i Redis són de TG-49.

Guia d'ús: secció «Errors» de `backend/README.md` i catàleg de codis a la skill `gestio-errors`.

## Conseqüències

### Positives

- Contracte únic, estable i internacionalitzable; el backend no depèn de l'idioma.
- Els errors no filtren informació interna.

### Negatives (assumides)

- Cal mantenir un catàleg de codis i les seves traduccions.

## Alternatives descartades

- JSON propi `{code, message}`: no segueix un estàndard.
- Backend que localitza el missatge: acobla l'API als textos de la UI.

## US de Taiga relacionades

- TG-205 (subagents i skills agnòstiques)
- TG-304 (jerarquia d'errors i handler RFC 9457 base, dins de TG-44)

## Enllaços

- [[backend-hexagonal]]
- [[frontend]]
- [[0016-ports-i-entitats-riques-al-domini]]
