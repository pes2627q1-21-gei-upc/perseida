# Catàleg de codis d'error

Convenció: `SCREAMING_SNAKE`, forma `<ENTITAT>_<MOTIU>` (p. ex. `EVENT_NOT_FOUND`). El `code` és contracte estable entre backend i frontend: no es reanomena. Els textos ca/es/en els aprova l'humà (preguntar). Només s'afegeixen files quan l'humà aprova cada codi.

## Codis transversals (TG-304)

Els genera el handler base, no un `DomainError`. Textos aprovats per la persona responsable (TG-304).

| Code | Status | Classe / origen | Recuperable | ca | es | en | Origen |
|---|---|---|---|---|---|---|---|
| `INTERNAL_ERROR` | 500 | Excepció inesperada | Sí | Alguna cosa ha anat malament. Torna-ho a provar. | Algo ha salido mal. Inténtalo de nuevo. | Something went wrong. Please try again. | infrastructure/api |
| `VALIDATION_ERROR` | 422 | `RequestValidationError` (amb `errors[]`) | Sí | Revisa les dades introduïdes. | Revisa los datos introducidos. | Please check the data you entered. | infrastructure/api |
| `NOT_FOUND` | 404 | Ruta inexistent | No | No s'ha trobat el que busques. | No se ha encontrado lo que buscas. | We couldn't find what you were looking for. | infrastructure/api |
| `METHOD_NOT_ALLOWED` | 405 | Mètode HTTP no permès | No | Aquesta acció no està permesa. | Esta acción no está permitida. | This action is not allowed. | infrastructure/api |
| `HTTP_<status>` | `<status>` | Altres errors HTTP de Starlette | Segons status | (missatge genèric) | (mensaje genérico) | (generic message) | infrastructure/api |

## Codis de l'APOD (TG-113, TG-115)

| Code | Status | Classe | Recuperable | ca | es | en | Origen |
|---|---|---|---|---|---|---|---|
| `APOD_DATE_IN_FUTURE` | 422 | `ValidationError` | Sí | Aquesta data encara no ha arribat. Tria la d'avui o una d'anterior. | Esta fecha aún no ha llegado. Elige la de hoy o una anterior. | This date hasn't arrived yet. Choose today or an earlier date. | domain/apod |
| `APOD_DATE_BEFORE_START` | 422 | `ValidationError` | Sí | L'APOD només està disponible a partir del 16 de juny de 1995. | El APOD solo está disponible a partir del 16 de junio de 1995. | APOD is only available from June 16, 1995 onwards. | domain/apod |
| `APOD_UNAVAILABLE` | 503 | `ExternalServiceError` | Sí | Ara mateix no hem pogut carregar l'APOD. Torna-ho a provar d'aquí a una estona. | Ahora mismo no hemos podido cargar el APOD. Vuelve a intentarlo en un rato. | We couldn't load the APOD right now. Please try again in a while. | application/apod (constant `APOD_UNAVAILABLE`; l'adaptador de TG-46 la llança) |

## Taula plantilla

| Code | Status | Classe | Recuperable | ca | es | en | Origen |
|---|---|---|---|---|---|---|---|
| `EVENT_NOT_FOUND` (exemple) | 404 | `NotFoundError` | No | (pendent, preguntar) | (pendent) | (pendent) | domain/event |
| `<ENTITAT>_<MOTIU>` | `<status>` | `<classe>` | Sí/No | | | | `<mòdul>` |

## Fitxa per afegir un codi

1. Nom i status (confirmats per l'humà).
2. Classe de la jerarquia (`NotFoundError`, `BusinessRuleViolation`, `ConflictError`, `ValidationError`, `UnauthorizedError`, `ForbiddenError`, `ExternalServiceError`); el status el dona `STATUS_BY_ERROR`.
3. Recuperable? (decideix l'acció "Reintentar" del toast).
4. Textos ca/es/en aprovats.
5. Clau i18n al frontend + test de presència dels 3 idiomes.
6. Fila a aquesta taula.

## Errors d'APIs externes (a decidir amb l'humà per cada proveïdor)

| Proveïdor | Si cau, amb cache | Si cau, sense cache |
|---|---|---|
| NASA (APOD...) | Retorna la cache (Redis), sense 500 | `ExternalServiceError` (503) amb codi propi |
| Google JWKS | Claus en memòria | `ExternalServiceError` `IDENTITY_PROVIDER_UNAVAILABLE` (503, US #44) |
| Altres (meteo, contaminació lumínica, Spotwise, Kev-4B, FCM) | Pregunta a l'humà | Pregunta a l'humà |

Les files de NASA i Google JWKS fixen el comportament acordat per aquests proveïdors; per als altres no n'hi ha cap d'acordat: no n'inventis de nous i pregunta a l'humà.