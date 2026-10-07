# Catàleg de codis d'error

Convenció: `SCREAMING_SNAKE`, forma `<ENTITAT>_<MOTIU>` (p. ex. `EVENT_NOT_FOUND`). El `code` és contracte estable entre backend i frontend: no es reanomena. Els textos ca/es/en els proporciona l'humà (preguntar). Només l'exemple és il·lustratiu; la resta de files s'afegeixen quan l'humà aprova cada codi.

## Taula plantilla

| Code | Status | Classe | Recuperable | ca | es | en | Origen |
|---|---|---|---|---|---|---|---|
| `EVENT_NOT_FOUND` (exemple) | 404 | `NotFoundError` | No | (pendent, preguntar) | (pendent) | (pendent) | domain/event |
| `<ENTITAT>_<MOTIU>` | `<status>` | `<classe>` | Sí/No | | | | `<mòdul>` |

## Fitxa per afegir un codi

1. Nom i status (confirmats per l'humà).
2. Classe de la jerarquia (`NotFoundError`, `BusinessRuleViolation`, `ConflictError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`).
3. Recuperable? (decideix l'acció "Reintentar" del toast).
4. Textos ca/es/en aprovats.
5. Clau i18n al frontend + test de presència dels 3 idiomes.
6. Fila a aquesta taula.

## Errors d'APIs externes (a decidir amb l'humà per cada proveïdor)

| Proveïdor | Si cau, amb cache | Si cau, sense cache |
|---|---|---|
| NASA (APOD...) | Retorna la cache (Redis), sense 500 | Error controlat amb codi propi (status a confirmar) |
| Altres (meteo, contaminació lumínica, Spotwise, Kev-4B, FCM, JWKS) | Pregunta a l'humà | Pregunta a l'humà |

Els comportaments per proveïdor no consten al vault més enllà del patró general (dada de la cache en lloc d'un 500): no n'inventis de nous.
