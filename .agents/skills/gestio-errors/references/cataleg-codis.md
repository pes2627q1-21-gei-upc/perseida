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

## Codis del client (TG-120)

Els genera el frontend, no el backend. Text en català aprovat per la persona responsable (TG-120); es i en afegits a TG-91 (`frontend/locales/`) i aprovats a la review de la PR #50.

| Code | Status | Classe / origen | Recuperable | ca | es | en | Origen |
|---|---|---|---|---|---|---|---|
| `NETWORK_ERROR` | — | `AppError` `kind: 'network'` (cap resposta del servidor) | Sí | No hi ha connexió. Comprova la xarxa i torna-ho a provar. | No hay conexión. Comprueba la red e inténtalo de nuevo. | No connection. Check your network and try again. | frontend `shared/errors/toAppError.ts` |
| `INVALID_RESPONSE` | 200 sense cos vàlid | `AppError` `kind: 'http'` (resposta il·legible) | No | Alguna cosa ha anat malament. No s'ha pogut carregar el contingut. | Algo ha salido mal. No se ha podido cargar el contenido. | Something went wrong. We couldn't load the content. | frontend `features/apod/api/getApodToday.ts` |
| `GOOGLE_SIGN_IN_EXPO_GO` | — | `AppError` `kind: 'http'` (client, `status: 0`) | No | L'inici de sessió amb Google no funciona a Expo Go. Usa l'app instal·lada (build de desenvolupament). | El inicio de sesión con Google no funciona en Expo Go. Usa la app instalada (build de desarrollo). | Google sign-in doesn't work in Expo Go. Use the installed app (development build). | frontend `features/auth/googleAuth.ts` (TG-342) |
| `GOOGLE_SIGN_IN_UNAVAILABLE` | — | `AppError` `kind: 'http'` (client, `status: 0`) | No | L'inici de sessió amb Google encara no està disponible. | El inicio de sesión con Google aún no está disponible. | Google sign-in isn't available yet. | frontend `features/auth/googleAuth.ts` (sense client id; TG-342) |

Missatges genèrics (TG-91, clau `errors.<CODE>` a `frontend/locales/`): els errors **recuperables** sense text propi fan servir `errors.INTERNAL_ERROR` (el text d'`INTERNAL_ERROR` de dalt). Els **no recuperables** sense text propi fan servir `errors.GENERIC_FINAL`: «Alguna cosa ha anat malament.» / «Algo ha salido mal.» / «Something went wrong.» (decidit per la persona responsable a TG-91; no convida a reintentar perquè no hi ha botó de reintent). `NOT_FOUND`, `APOD_UNAVAILABLE`, `INTERNAL_ERROR` i `GENERIC_FINAL` també tenen clau al frontend.

## Codis de l'APOD (TG-113, TG-115)

| Code | Status | Classe | Recuperable | ca | es | en | Origen |
|---|---|---|---|---|---|---|---|
| `APOD_DATE_IN_FUTURE` | 422 | `ValidationError` | Sí | Aquesta data encara no ha arribat. Tria la d'avui o una d'anterior. | Esta fecha aún no ha llegado. Elige la de hoy o una anterior. | This date hasn't arrived yet. Choose today or an earlier date. | domain/apod |
| `APOD_DATE_BEFORE_START` | 422 | `ValidationError` | Sí | L'APOD només està disponible a partir del 16 de juny de 1995. | El APOD solo está disponible a partir del 16 de junio de 1995. | APOD is only available from June 16, 1995 onwards. | domain/apod |
| `APOD_UNAVAILABLE` | 503 | `ExternalServiceError` | Sí | Ara mateix no hem pogut carregar l'APOD. Torna-ho a provar d'aquí a una estona. | Ahora mismo no hemos podido cargar el APOD. Vuelve a intentarlo en un rato. | We couldn't load the APOD right now. Please try again in a while. | application/apod (constant `APOD_UNAVAILABLE`; l'adaptador de TG-46 la llança) |
| `USER_EMAIL_EMPTY` | 422 | `ValidationError` | Sí | (pendent, preguntar) | (pendent) | (pendent) | domain/users |
| `USER_EMAIL_INVALID` | 422 | `ValidationError` | Sí | (pendent, preguntar) | (pendent) | (pendent) | domain/users (correu massa llarg o amb espais o caràcters de control) |
| `APOD_MEDIA_URL_INVALID` | 422 | `ValidationError` | No | (pendent, preguntar) | (pendent) | (pendent) | domain/apod (l'URL del mitjà no és https) |
| `USER_GOOGLE_SUB_EMPTY` | 422 | `ValidationError` | Sí | (pendent, preguntar) | (pendent) | (pendent) | domain/users |

## Codis dels esdeveniments (TG-351)

| Code | Status | Classe | Recuperable | ca | es | en | Origen |
|---|---|---|---|---|---|---|---|
| `EVENT_ENDS_BEFORE_START` | 422 | `ValidationError` | No | (pendent, preguntar) | (pendent) | (pendent) | domain/events (`ends_at` anterior a `starts_at`) |
| `EVENT_SOURCE_UNAVAILABLE` | 503 | `ExternalServiceError` | Sí | (no arriba al client) | (no arriba al client) | (no arriba al client) | infrastructure/events (TG-50; una font d'esdeveniments ha fallat: `EventService` l'absorbeix, ho registra i serveix el que hi ha a PostgreSQL, ADR-0031) |

## Codis de Redis pub/sub i WebSocket (TG-87, TG-63)

| Code | Status | Classe | Recuperable | ca | es | en | Origen |
|---|---|---|---|---|---|---|---|
| `PUBSUB_UNAVAILABLE` | 503 | `ExternalServiceError` | Sí | El xat no està disponible ara mateix. Torna-ho a provar. | El chat no está disponible ahora mismo. Inténtalo de nuevo. | Chat is unavailable right now. Please try again. | infrastructure/cache |
| `UNKNOWN_FRAME_TYPE` | 422 | frame `error` del WebSocket | Sí | No entenem aquest missatge. | No entendemos este mensaje. | We don't understand this message. | application/realtime (TG-63) |
| `NOT_SUBSCRIBED` | 409 | frame `error` del WebSocket | Sí | Primer t'has d'unir a la sala. | Primero debes unirte a la sala. | You need to join the room first. | application/realtime (TG-63) |
| `FORBIDDEN` | 403 | frame `error` del WebSocket | No | No tens permís per fer això. | No tienes permiso para hacer esto. | You don't have permission to do that. | application/realtime (TG-63; l'emeten #64 i #65) |
| `RATE_LIMITED` | 429 | `RateLimitedError` (REST) i frame `error` del WebSocket | Sí | Massa missatges seguits. Espera una mica. | Demasiados mensajes seguidos. Espera un poco. | Too many messages. Please wait a moment. | application/realtime (TG-63; límit de sales) i application/chat (TG-442; límit d'enviament per REST) |
| `CHAT_INVALID_CURSOR` | 422 | `ValidationError` | No | El cursor de l'historial no és vàlid. | El cursor del historial no es válido. | The history cursor is not valid. | application/chat (TG-442) |
| `CHAT_INVALID_LIMIT` | 422 | `ValidationError` | No | El límit de l'historial no és vàlid. | El límite del historial no es válido. | The history limit is not valid. | application/chat (TG-442) |

## Codis d'autenticació (TG-44)

Textos aprovats per la persona responsable (TG-44). Un compte banejat respon `ACCOUNT_SUSPENDED`. Claus i18n del frontend pendents (xat i inici de sessió).

| Code | Status | Classe | Recuperable | ca | es | en | Origen |
|---|---|---|---|---|---|---|---|
| `INVALID_GOOGLE_TOKEN` | 401 | `UnauthorizedError` | Sí | No hem pogut verificar el teu compte de Google. Torna a iniciar sessió. | No hemos podido verificar tu cuenta de Google. Vuelve a iniciar sesión. | We couldn't verify your Google account. Please sign in again. | application/auth |
| `INVALID_SESSION` | 401 | `UnauthorizedError` | No | La teva sessió ha caducat. Torna a iniciar sessió. | Tu sesión ha caducado. Vuelve a iniciar sesión. | Your session has expired. Please sign in again. | application/auth |
| `ACCOUNT_SUSPENDED` | 403 | `ForbiddenError` | No | El teu compte està suspès. | Tu cuenta está suspendida. | Your account is suspended. | application/auth |
| `ACCOUNT_DELETED` | 403 | `ForbiddenError` | No | Aquest compte s'ha eliminat. | Esta cuenta ha sido eliminada. | This account has been deleted. | application/auth |
| `IDENTITY_PROVIDER_UNAVAILABLE` | 503 | `ExternalServiceError` | Sí | Google no està disponible ara mateix. Torna-ho a provar d'aquí a una estona. | Google no está disponible ahora mismo. Vuelve a intentarlo en un rato. | Google is unavailable right now. Please try again in a while. | application/auth |
| `SESSION_UNAVAILABLE` | 503 | `ExternalServiceError` | Sí | No podem comprovar la teva sessió ara mateix. Torna-ho a provar d'aquí a una estona. | No podemos comprobar tu sesión ahora mismo. Vuelve a intentarlo en un rato. | We can't check your session right now. Please try again in a while. | infrastructure/auth (Redis no disponible) |
| `EMAIL_ALREADY_REGISTERED` | 409 | `ConflictError` | No | Aquest correu ja està associat a un altre compte. | Este correo ya está asociado a otra cuenta. | This email is already linked to another account. | infrastructure/users |

## Codis del quiz diari (TG-60)

Textos aprovats per la persona responsable (TG-60, 09/11/2026). Contracte a `obsidian_vault/arquitectura/contracte-quiz.md`.

| Code | Status | Classe | Recuperable | ca | es | en | Origen |
|---|---|---|---|---|---|---|---|
| `QUIZ_ALREADY_ANSWERED` | 409 | `ConflictError` | No | Ja has respost la pregunta d'avui. Torna demà per a una de nova! | Ya has respondido la pregunta de hoy. ¡Vuelve mañana para una nueva! | You've already answered today's question. Come back tomorrow for a new one! | domain/quiz |
| `QUIZ_EXPIRED` | 409 | `ConflictError` | Sí | Aquesta pregunta ja ha caducat. Carrega la d'avui. | Esta pregunta ya ha caducado. Carga la de hoy. | This question has expired. Load today's question. | domain/quiz |
| `QUIZ_QUESTION_MISMATCH` | 422 | `ValidationError` | Sí | Aquesta no és la pregunta d'avui. Torna-ho a provar. | Esta no es la pregunta de hoy. Inténtalo de nuevo. | This isn't today's question. Please try again. | domain/quiz |

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
| Fonts d'esdeveniments (Launch Library 2, USNO, Skyfield, catàleg) | Es serveixen els esdeveniments desats a PostgreSQL; la font no es torna a cridar en 15 min | Igual: `EVENT_SOURCE_UNAVAILABLE` no arriba al client, mai un 5xx (TG-50, ADR-0031) |
| Altres (meteo, contaminació lumínica, Spotwise, Kev-4B, FCM) | Pregunta a l'humà | Pregunta a l'humà |

Les files de NASA i Google JWKS fixen el comportament acordat per aquests proveïdors; per als altres no n'hi ha cap d'acordat: no n'inventis de nous i pregunta a l'humà.
