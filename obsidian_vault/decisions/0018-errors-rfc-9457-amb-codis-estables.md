---
titol: "Errors transversals: RFC 9457 amb codis estables traduïts al frontend"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-205"]
font: "sessió de treball del 2026-10-07 (TG-205); decisions de la persona responsable"
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

## Enllaços

- [[backend-hexagonal]]
- [[frontend]]
- [[0016-ports-i-entitats-riques-al-domini]]
