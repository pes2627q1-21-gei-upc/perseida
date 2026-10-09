---
name: gestio-errors
description: Gestió d'errors transversal de Perseida (backend i frontend) - jerarquia DomainError/ApplicationError, catàleg de codis estables, handlers RFC 9457, correlation id, errors d'APIs externes i contracte amb l'app (AppError, i18n ca/es/en, toast, ErrorBoundary, offline). Usa-la en crear o canviar un error, un codi, un handler, un toast o qualsevol camí d'error.
---

# Gestió d'errors (backend + frontend)

Defineix com es llancen, es transporten i es mostren els errors, de domini fins a la UI. Un sol contracte: el `code` estable és la clau entre backend i frontend.

Segueix el protocol `vault-context` (AGENTS.md) i les ADR vigents.

> [!note] Estat
> La part de backend (jerarquia, handlers RFC 9457 i correlation id) ja és implementada (TG-304): llegeix `backend/app/*/shared/errors.py` i `backend/app/infrastructure/api/`. La part de frontend continua sent orientativa. Versions de llibreries: versió fixada amb `uv`/`pnpm`; pregunta/verifica abans de fixar-ne cap.

## Quan usar-la / quan NO

Usa-la quan:
- crees o canvies un `DomainError`/`ApplicationError`, un `code` o un exception handler;
- un endpoint pot fallar (nou o existent) o cal definir-ne les respostes d'error a l'OpenAPI;
- integres una API externa (NASA, FCM, Google JWKS, Spotwise, Kev-4B...) i cal decidir què passa si cau;
- afegeixes al frontend el tractament d'un `code`, un toast, l'`ErrorBoundary` o el comportament offline.

NO la usis per: la lògica de negoci en si (`backend-entitat-domini`), l'estructura d'un service (`backend-service`) o el disseny visual del toast més enllà de les regles d'aquí (`ui-ux-pro-max`, `frontend-design`).

## Protocol de dubtes (OBLIGATORI)

No inventis res. Si falta qualsevol dada o hi ha més d'una opció raonable, ATURA'T abans d'escriure codi i pregunta a l'humà (si ets un subagent que no pot preguntar: retorna a l'agent principal un bloc `PREGUNTES PER A L'HUMÀ` amb les preguntes numerades i les opcions). Mai assumeixis un valor per defecte en silenci.

Preguntes d'aquesta skill (abans d'escriure):
1. És un **codi d'error nou**? Si és així, quin nom (SCREAMING_SNAKE, `<ENTITAT>_<MOTIU>`)? Ja n'hi ha un d'equivalent al catàleg?
2. Quin **status HTTP** té (400, 401, 403, 404, 409, 422, 502, 503...)? Proposa'n un i demana confirmació si hi ha dubte.
3. Quins són els **missatges en ca/es/en**? Pregunta els textos a l'humà; no els redactis tu en silenci. Si no te'ls dona, deixa'ls marcats com a pendents.
4. És **recuperable**? (l'usuari pot reintentar o corregir-ho / només informar). Això decideix el toast (amb acció "Reintentar" o sense) i si el reintent és segur.
5. Si és un error d'API externa: hi ha **fallback de cache**? Quin TTL i què es mostra si no n'hi ha? (la política de TTL no és a la skill: pregunta.)
6. Els camps de log (si el repo encara no els fixa). La capçalera (`X-Correlation-ID`), `type` (`about:blank`) i la signatura ja estan decidits (TG-304): no els tornis a preguntar.

## Passos

1. **Classifica** l'error:
   - Regla de negoci violada, entitat inexistent, conflicte, entrada invàlida -> `DomainError` (subclasses `NotFoundError`, `BusinessRuleViolation`, `ConflictError`, `ValidationError`) a `domain/shared/errors.py`.
   - No autenticat / no autoritzat -> `ApplicationError` (`UnauthorizedError`, `ForbiddenError`) a `application/shared/errors.py`.
   - Fallada tècnica (BD, xarxa, API externa) -> excepció d'infrastructure, tractada a l'adaptador (veure "APIs externes"); mai surt crua cap al client.
2. **Registra el codi** al catàleg (taula a [references/cataleg-codis.md](references/cataleg-codis.md)): codi, status, classe, missatges ca/es/en, recuperable, origen.
3. **Llença'l des del domini/application** amb `code` estable; el domini no coneix HTTP ni `HTTPException`.
4. **Handler** a `infrastructure/api/error_handlers.py`: tradueix la jerarquia a resposta RFC 9457 (vegeu més avall). Cap `HTTPException` fora d'infrastructure.
5. **OpenAPI**: documenta les respostes d'error de l'endpoint perquè `openapi-typescript` generi els tipus.
6. **Frontend**: afegeix les claus i18n de cada `code` (ca/es/en) i comprova el mapatge (vegeu més avall).
7. **Tests** (després del codi) i **checklist**.

## Backend

### Jerarquia

- `DomainError(code, message=None)`: `code` estable; `message` tècnic per a logs i `detail`, no per a l'usuari final (si falta, val el `code`). `ApplicationError` té la mateixa signatura i **no** hereta de `DomainError`.
- `ApplicationError`: `UnauthorizedError` (401), `ForbiddenError` (403), `ExternalServiceError` (503, proveïdor extern caigut sense cache).
- Status (confirmat, TG-304), a `STATUS_BY_ERROR` d'`infrastructure/api/error_handlers.py`, resolt per MRO: `NotFoundError` 404; `ConflictError` 409; `ValidationError` i `BusinessRuleViolation` 422; `UnauthorizedError` 401; `ForbiddenError` 403; `ExternalServiceError` 503; `DomainError`/`ApplicationError` base 400. Les classes d'error no porten el status: el domini no coneix HTTP.

### Resposta RFC 9457 (`application/problem+json`)

Camps: `type`, `title`, `status`, `detail`, `instance`, `code` (extensió pròpia, estable), `correlation_id` (a tots els errors) i `errors?` (llista per camp en validació).

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Event 42 does not exist",
  "instance": "/api/events/42",
  "code": "EVENT_NOT_FOUND",
  "correlation_id": "5c0e0b8e-6d57-4f7b-9d0e-0d6a1f6f4c11"
}
```

`type` sempre és `about:blank`; `title` és la frase HTTP estàndard del status (mai el nom de la classe); `detail` és el `message` de l'error.

### Handlers (implementats a TG-304)

`infrastructure/api/error_handlers.py` exposa `register_error_handlers(app)` (cridat des de `create_app()`) i `problem_response(...)` a `infrastructure/api/problem.py` construeix el cos i fixa `Content-Type: application/problem+json`. Handlers:

- `DomainError` / `ApplicationError`: status per MRO (vegeu "Jerarquia"), `detail = message`.
- Errors de validació de FastAPI: 422 `VALIDATION_ERROR`, `errors[]` amb un `{field, message, type}` per camp (`field` sense el prefix `body`/`query`/`path`/`header`/`cookie`).
- Errors HTTP de Starlette (ruta inexistent, mètode no permès...): conserven status i capçaleres; `code` `NOT_FOUND`, `METHOD_NOT_ALLOWED` o `HTTP_<status>`.
- `Exception`: 500 `INTERNAL_ERROR`, `detail` fix «Unexpected error», sense traça ni nom de classe; la traça va al log amb el `correlation_id`.

### Correlation id i logging

- `CorrelationIdMiddleware` (`infrastructure/api/correlation.py`) assigna un id per petició i el posa a la capçalera `X-Correlation-ID` de **totes** les respostes i al cos de tot error (`correlation_id`). Un valor entrant només es respecta si compleix `[A-Za-z0-9._-]{1,128}`; si no, es genera un `uuid4`.
- Logs: clau/valor amb `correlation_id`, `code`, `status`, ruta (el logging estructurat complet és de #49). Mai dades personals, tokens ni secrets als logs.
- **500**: cos genèric amb `code` `INTERNAL_ERROR` i `correlation_id`; la traça només al log; mai al client.

### APIs externes

Un adaptador (infrastructure) que cridi una API externa (NASA, FCM, JWKS, Spotwise, Kev-4B...):
- té `timeout` explícit i captura els errors de xarxa/HTTP de `httpx`;
- si l'API cau i hi ha dada a la cache (Redis), **retorna la dada de la cache, no un 500** (requisit NFR "caiguda d'APIs externes: dades de la cau, sense HTTP 500");
- si no hi ha cache, tradueix a un error controlat amb `code` propi (p. ex. 502/503, status a confirmar) amb missatge localitzable, no a un 500 genèric;
- registra el fallback al log amb `correlation_id`; el domini no veu mai excepcions de `httpx`.

Detall: [references/cataleg-codis.md](references/cataleg-codis.md).

## Frontend (contracte)

L'app és "tonta": no decideix res, només mostra bé l'error.

1. **Client**: `openapi-fetch` + middleware: si la resposta és `problem+json`, es converteix en `AppError` (`code`, `status`, `correlationId?`, `fieldErrors?`, `retryable`) a `src/shared/errors`. Errors de xarxa/timeout -> `AppError` de tipus xarxa/offline.
2. **Mapatge `code` -> i18n** amb i18next (ca/es/en): clau per `code` (p. ex. `errors.EVENT_NOT_FOUND`); `code` desconegut -> missatge genèric ("Alguna cosa ha anat malament"). **Mai** JSON, traça ni `detail` cru a la UI.
3. **Toast** propi, estètica Frutiger Cosmo, animació amb `react-native-reanimated`, accessible (`role="alert"`), amb acció "Reintentar" només si `retryable`. Respecta `reduced motion`.
4. **ErrorBoundary** per a errors de renderitzat: pantalla/toast amable amb el missatge genèric i opció de reintentar.
5. **Formularis**: errors per camp (de `errors[]`) al camp; errors globals al toast.
6. **Offline/xarxa**: toast d'error de xarxa; la cua/cache SQLite segueix ADR-0011 (outbox, last-write-wins). Quina UX tenen les mutacions encuades fallides: pregunta a l'humà.
7. Tots els textos nous, en ca/es/en (test que ho verifica).

## Tests (després del codi)

- Domini: l'entitat llança el `DomainError` amb el `code` esperat (sense mocks).
- Handlers: `httpx.AsyncClient` comprova status, `Content-Type: application/problem+json`, camps i `code`; el 500 no filtra detalls ni traça i porta `correlation_id`.
- API externa caiguda (`respx`): retorna la cache, sense 500; sense cache, l'error controlat.
- Endpoints privats sense sessió: 401/403.
- Frontend (Jest + RNTL): middleware -> `AppError`; mapatge `code` -> text per als 3 idiomes; `code` desconegut -> genèric; toast amb `role="alert"`; tots els `code` del catàleg tenen clau ca/es/en.

Nota: tests després del codi (ADR-0019, que supera la part TDD d'ADR-0004). Si l'humà prefereix TDD, segueix-lo.

## Checklist final

- [ ] Codi registrat al catàleg (taula) i sense duplicats.
- [ ] Status HTTP confirmat per l'humà (si la classe ja és a `STATUS_BY_ERROR`, hereta el seu).
- [ ] Missatges ca/es/en proporcionats per l'humà i afegits als 3 idiomes.
- [ ] Marcat com a recuperable o no, i coherent amb el toast.
- [ ] Cap `HTTPException` fora d'infrastructure; el domini no coneix HTTP.
- [ ] Resposta `application/problem+json` amb `code`; OpenAPI actualitzada.
- [ ] 500 sense detalls interns, amb `correlation_id` i log estructurat.
- [ ] APIs externes: timeout, fallback de cache, sense 500 si cauen.
- [ ] Frontend: cap missatge cru a la UI, `AppError`, toast `role="alert"`, fallback genèric.
- [ ] Tests escrits (domini, handlers, respx, frontend) i cobertura als llindars de `convencions/testing.md`.
- [ ] Vault actualitzat si el catàleg o el contracte canvien l'arquitectura.

## Què NO fer

- No retornis mai traces, SQL, noms de classes ni `detail` intern al client.
- No usis `HTTPException` fora d'infrastructure ni facis `except Exception: pass`.
- No canviïs un `code` existent (és contracte estable); afegeix-ne un de nou i deprecia l'antic.
- No posis lògica de seguretat ni de negoci al client.
- No hardcodegis textos d'error al frontend ni a l'API: el text és a l'i18n per `code`.
- No redactis els missatges ca/es/en sense preguntar.
- No tornis un 500 per la caiguda d'una API externa si hi ha dada a la cache.
- No fixis versions de llibreries sense verificar-ho amb `uv`/`pnpm`.
