---
titol: "Component: api"
tipus: component
estat: vigent
data: "2026-11-23"
us: ["TG-85", "TG-36", "TG-37", "TG-39", "TG-40", "TG-41", "TG-44", "TG-45", "TG-46", "TG-88", "TG-304", "TG-38", "TG-63", "TG-60", "TG-628", "TG-629", "TG-363", "TG-49", "TG-53", "TG-51", "TG-64", "TG-470", "TG-65", "TG-352"]
font: "infra/README.md, backend/Dockerfile, .github/workflows/backend-docker.yml, backend/README.md, memòria §3.4.1, .env.example; Taiga: US TG-44; Taiga: US TG-628; backend/app/infrastructure/api/cors.py (TG-363); Taiga: US TG-53; Taiga: US TG-51; TG-65 i backend/app/infrastructure/direct_chat (23/11/2026)"
etiquetes: [component, api, fastapi, backend, docker, ghcr]
---

# api

## Responsabilitat

Un únic procés FastAPI que fa tres coses: atén l'API REST de l'app i del panell d'admin, gestiona el xat en temps real per WebSocket (amb pub/sub de Redis) i executa un planificador APScheduler in-process (notificacions programades, reinici de ràtxes diàries, purga de contingut caducat com els posts de 24 h). Abans de difondre una publicació o un missatge de xat consulta [[moderation]] de manera síncrona. No serveix media ni TLS (és feina de [[nginx-proxy-manager]]) i no guarda res essencial a Redis.

## Tecnologia i versió

Python 3.14, FastAPI (async), SQLModel (SQLAlchemy), Alembic, APScheduler, `uv`. Imatge `perseida-api:<git-sha>` publicada a GHCR (`ghcr.io/pes2627q1-21-gei-upc/perseida-api`).

### Contenidorització i empaquetament (TG-36)
- **Multi-stage build**: etapa `builder` amb `uv sync --frozen --no-dev` creant un entorn virtual aïllat a `/app/.venv`, i etapa `runner` neta basada en `python:3.14.9-slim` on s'elimina `pip` i no hi ha eines de compilació.
- **Seguretat**: execució sota usuari no privilegiat `appuser` (UID/GID fix `1001`, shell `/sbin/nologin`, sense home).
- **Entorn**: `PYTHONUNBUFFERED=1` per a emissió immediata de logs a stdout, `PYTHONDONTWRITEBYTECODE=1` i `PATH="/app/.venv/bin:$PATH"`.
- **Pipeline CI/CD**: `.github/workflows/backend-docker.yml` amb Buildx, memòria cau GHA (`mode=max`) i generació d'etiquetes immutables (`sha-XXXXXXX`), de branca (`develop`/`main`/`release/*`) i SemVer (`vX.Y.Z`).

- **Entrypoint i migracions (TG-36, #218)**: l'script `backend/entrypoint.sh` actua com a `ENTRYPOINT` del contenidor; executa automàticament les migracions d'Alembic (`alembic upgrade head`) abans d'iniciar FastAPI/Uvicorn (desactivable amb la variable d'entorn `RUN_MIGRATIONS=false`, emprat per la sonda de rollback del CD a [[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions|ADR-0025]]), i s'atura amb error si la base de dades no és accessible.

Estructura hexagonal: [[backend-hexagonal]].

## Interfícies

- Qui el crida: [[nginx-proxy-manager]] (`proxy_pass`), que rep REST/WSS de l'app Android i del navegador d'admin; Spotwise, per `GET /api/events/active` i `/upcoming` ([[contracte-spotwise]]). El llistat filtrable de l'app és `GET /api/events` (TG-51), públic; filtres i errors a [[contracte-esdeveniments]].
- A qui crida: [[postgres]] (font de veritat), [[redis]] (cache i pub/sub), [[moderation]] (HTTP síncron), NASA, APIs de meteorologia i contaminació lumínica, FCM, i Google (JWKS) ([[serveis-externs]]). Comparteix el volum de media amb nginx-proxy-manager.

## Healthcheck (TG-49)

`GET /api/health` és públic i respon sempre 200 amb `status` i `components` (`ok`/`down`). Comprova `app`, `postgres` (`SELECT 1`), `redis` (`PING`) i `scheduler` si està activat, en paral·lel i amb un límit de 2 s per comprovació: una que tarda més o falla compta com a `down` i l'endpoint no es penja. `status` és `down` només si cau un component crític (`app`, `postgres` o `scheduler`); [[redis]] no ho és, perquè només és cache ([[0005-redis-nomes-com-a-cache-lazy]]). El CD fa rollback si `status` no és `ok` ([[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]). Les comprovacions implementen el port `HealthCheck` (propietat `critical`) i el `HealthService` es construeix al lifespan.

## Errors i correlació

Tot error surt com a `application/problem+json` (RFC 9457) amb `code` estable i `correlation_id`; el 500 no exposa detalls interns. Cada resposta porta la capçalera `X-Correlation-ID` (generada amb `uuid4` o reutilitzada si el valor entrant és vàlid). Jerarquia a `app/domain/shared/errors.py` i `app/application/shared/errors.py`; handlers i middleware a `app/infrastructure/api/`. Detall a [[0018-errors-rfc-9457-amb-codis-estables]].

## Autenticació i usuaris (TG-44, TG-45)

Valida el token de Google via JWKS i emet una sessió pròpia (dos JWT HS256: *access* 15 min i *refresh* 30 dies), registrada a [[redis]] com a `session:<type>:<jti>` (i indexada per usuari a `user_sessions:<sub>`, amb un `sid` comú a l'access i al refresh) perquè es pugui revocar a l'instant, per sessió o per usuari. Endpoints:

| Endpoint | Què fa |
|---|---|
| `POST /api/auth/google` | Canvia l'`id_token` de Google per una sessió; dona d'alta l'usuari al primer accés (`language` opcional). 401, 403, 409 `EMAIL_ALREADY_REGISTERED`, 503 |
| `POST /api/auth/refresh` | Renova la sessió; el refresh és d'un sol ús |
| `POST /api/auth/logout` | Revoca la sessió sencera pel `sid`; 204 i idempotent |
| `GET /api/users/me` | Perfil de l'usuari autenticat; 401 sense sessió, 403 si el compte és suspès o esborrat |

Els endpoints privats usen `CurrentSessionDep`. L'estat del compte arriba pel port `AccountGateway`, que implementa `UserAccountGateway` sobre [[postgres]] (taules `users` i `user_identities`, [[0023-convencions-del-model-de-dades]]). Format, caducitats, alta concurrent i conseqüències a [[0008-google-oauth2-pkce-jwks-i-sessio-propia]]; guia d'ús a la secció «Authentication» de `backend/README.md`.

## Quiz diari (TG-60)

| Endpoint | Què fa |
|---|---|
| `GET /api/quiz/today` | Pregunta del dia (UTC) en l'idioma demanat o el preferit, sense la solució; inclou el resultat si ja s'ha respost |
| `POST /api/quiz/today/answer` | Desa la resposta i retorna el resultat. 201, 409 `QUIZ_ALREADY_ANSWERED` o `QUIZ_EXPIRED`, 422 `QUIZ_QUESTION_MISMATCH` |

`QuizService` (`app/application/quiz/`) guarda la pregunta del dia a [[redis]] (`cache:quiz:daily:<data>:<idioma>`) fins a mitjanit UTC; el banc i les respostes són a [[postgres]] ([[model-de-domini#Quiz diari (implementat)]]). Contracte a [[contracte-quiz]]; guia a la secció «Daily quiz» de `backend/README.md`.

## Sortides d'observació (TG-629)

Privats, amb sessió; l'usuària s'obté de la sessió com a `GET /api/users/me`, amb els mateixos 401, 403 i 503. Model a [[model-de-domini#Sortida d'observació (implementat)]].

| Endpoint | Què fa |
|---|---|
| `POST /api/outings` | Crea una sortida de la usuària de la sessió. `201` amb la sortida i la capçalera `Location`; `422` si les dades no són vàlides |
| `GET /api/outings` | Sortides que encara no han començat, per `starts_at` i `id`. Filtres opcionals `event_id` i `mine=true` («les meves sortides», decisió de Raquel, 17/11/2026) |
| `GET /api/outings/{id}` | Detall amb l'autora (`id`, `display_name`, `avatar_url`); `404 OUTING_NOT_FOUND` |
| `PATCH /api/outings/{id}` | Només l'autora (`403 OUTING_FORBIDDEN`). Canvien només els camps enviats; només `event_id` pot ser null |
| `DELETE /api/outings/{id}` | Només l'autora; `204` |

Codis de `422`: `VALIDATION_ERROR` (format: rang de la ubicació, data sense zona, camp que no pot ser null), `OUTING_TITLE_EMPTY`, `OUTING_TITLE_TOO_LONG`, `OUTING_DESCRIPTION_TOO_LONG`, `OUTING_ENDS_BEFORE_START`, `OUTING_STARTS_IN_PAST` i `OUTING_EVENT_NOT_FOUND`. La longitud dels textos la mira només el domini, un cop netejats, perquè l'app rebi el codi concret (decisió de Raquel, 17/11/2026).

## Punts de trobada (TG-352)

`GET /api/meeting-points?profile=watch_party|study&lat=&lon=`: privat, amb sessió (mateixos 401, 403 i 503 que `/api/users/me`). Recomana biblioteques i cafeteries a prop de la ubicació de la usuària (no de l'esdeveniment) amb el servei d'espais de Spotwise ([[contracte-spotwise#Servei consumit per Perseida]]). No està lligat a cap esdeveniment, perquè també el fa servir el formulari de sortides (decisió de Raquel, 22/11/2026).

- `422 VALIDATION_ERROR` si falta un paràmetre, el perfil no existeix o la ubicació és fora de rang.
- `503 MEETING_POINTS_UNAVAILABLE` si Spotwise falla (timeout de 5 s, error de connexió, 4xx, 5xx o resposta il·legible); mai `500`.
- `MeetingPointService` (`app/application/meeting_points/`) desa el resultat a [[redis]] 5 min (`meeting_points:<perfil>:<lat>:<lon>`, coordenades arrodonides a 3 decimals).

## Seguretat (TG-45)

Cada resposta porta capçaleres de seguretat (`SecurityHeadersMiddleware`: `nosniff`, CSP `default-src 'none'`, `X-Frame-Options`, `no-store` a `/api/auth` i `/api/users`, HSTS darrere HTTPS); tot l'accés a dades usa paràmetres lligats i un test d'arquitectura prohibeix SQL fet amb cadenes; les entrades externes (nom, avatar, correu, URL de l'APOD) es netegen i es validen al domini. Regles, estat de les dependències i llista de comprovació a [[seguretat]]; decisió a [[0024-defensa-en-profunditat-contra-injeccio-sql-i-xss]].

CORS (TG-363): `CORSMiddleware` amb orígens explícits, mai `*` (`app/infrastructure/api/cors.py`). Per defecte admet els orígens HTTPS de DuckDNS (`https://perseida.duckdns.org:40431`, `https://perseida.duckdns.org`; mai `http://…:40430`, que *Force SSL* redirigeix i que una pàgina manipulada a la xarxa podria fer servir amb la sessió de l'usuari) i els ports locals d'Expo i de l'API (`8081`, `19006` i `8000` a `localhost`/`127.0.0.1`); `CORS_ALLOWED_ORIGINS` els substitueix i `CORS_ALLOWED_ORIGIN_REGEX` n'hi afegeix. Admet credencials, els mètodes `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` i `HEAD`, les capçaleres `Authorization` i `Content-Type`, i exposa `X-Correlation-ID`. És el middleware més intern (Security → Correlation → CORS → routers): el preflight es respon abans dels routers i porta el correlation id i les capçaleres de seguretat.

## Configuració

Variables de `.env.example` que li afecten: `APP_ENV`, `JWT_SECRET` (mínim 32 caràcters), `GOOGLE_CLIENT_IDS` (llista separada per comes dels clients OAuth: web, Android i iOS), `ACCESS_TOKEN_MINUTES` i `REFRESH_TOKEN_DAYS` (opcionals al backend, 15 i 30; a `infra/.env.example` hi són i el CD les exigeix), `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `REDIS_HOST`, `REDIS_PORT`, `SCHEDULER_ENABLED` (per defecte `true`) i `SCHEDULER_TIMEZONE` (per defecte `UTC`; un fus desconegut falla a l'arrencada). El `.env` el renderitza el CD des dels secrets de GitHub; mai es versiona. Veure `.env.example`.

APOD (TG-46): `NASA_API_KEY` (obligatòria, secret; sense ella l'API no arrenca; en local val `DEMO_KEY`), i `NASA_CONNECT_TIMEOUT_SECONDS` i `NASA_TIMEOUT_SECONDS` (opcionals, 3 i 10 s). Detall a [[serveis-externs]].

## Decisions relacionades

- [[0003-un-sol-proces-fastapi]]
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]
- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0007-moderacio-local-kev-4b-sincrona]]
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]]
- [[0018-errors-rfc-9457-amb-codis-estables]]
- [[0022-logging-json-global-amb-stdlib]]
- [[0033-xat-per-esdeveniment-sala-missatge-i-flux]]

## Publicacions d'esdeveniment (TG-628)

| Endpoint | Què fa |
|---|---|
| `POST /api/events/{event_id}/posts` | Crea una publicació de text de l'usuària de la sessió. 201, 404 `EVENT_NOT_FOUND`, 422 `POST_TEXT_EMPTY` o `POST_TEXT_TOO_LONG` |
| `GET /api/events/{event_id}/posts` | Llista paginada per cursor, de la més nova a la més antiga. 404 `EVENT_NOT_FOUND`, 422 `INVALID_CURSOR` |
| `PATCH /api/posts/{post_id}` | Edita el text (només l'autora). 403 `POST_FORBIDDEN`, 404 `POST_NOT_FOUND`, 422, 429 `RATE_LIMITED` |
| `DELETE /api/posts/{post_id}` | Esborra (només l'autora). 204, 403, 404, 422 si l'identificador no és vàlid, 429 `RATE_LIMITED` |

Tots demanen sessió (`CurrentSessionDep`) i tots els errors són `application/problem+json`. Els dos de `/api/events/{event_id}/posts` també poden rebre el 429 `RATE_LIMITED` del proxy (el bloc `/api/events/` de `rate-limit.conf`); `PATCH` i `DELETE` de `/api/posts/` tenen un límit per usuària a l'API (TG-645): 10 edicions o esborrats per finestra fixa de 60 s, amb un sol comptador per a tots dos (`POSTS_WRITE_RATE_LIMIT`, `POSTS_WRITE_RATE_LIMIT_WINDOW_SECONDS`). `PostService` el comprova abans de buscar la publicació, amb el port `PostWriteRateLimiter` i el `RedisSendRateLimiter` del xat (clau `ratelimit:posts:{user_id}`), i respon 429 `RATE_LIMITED`. No va al proxy perquè el NAT de la UPC amaga la IP del client i un límit per IP hi seria global (TG-643). Si [[redis]] no respon, deixa passar la petició i en registra un avís ([[0005-redis-nomes-com-a-cache-lazy]]). `RateLimitedError` i el codi `RATE_LIMITED` són a `app.application.shared` perquè els comparteixen el xat i les publicacions. Regles, taula i cursor a [[model-de-domini#Publicacions d'esdeveniment (implementat)]].

## Subscripcions a esdeveniments (TG-53)

| Endpoint | Què fa |
|---|---|
| `PUT /api/events/{event_id}/subscription` | Subscriu l'usuari de la sessió, sense cos. 201 si és nova, 200 si ja hi estava; 404 `EVENT_NOT_FOUND`, 409 `EVENT_ALREADY_ENDED`, 422 |
| `DELETE /api/events/{event_id}/subscription` | Dona de baixa, idempotent. 204; 422 si l'identificador no és vàlid |
| `GET /api/me/subscriptions` | Esdeveniments subscrits com a `EventResponse[]`, per `starts_at` i `id` |

Tots demanen sessió (`CurrentSessionDep` + `get_profile`: 401, 403 i 503) i tots els errors són `application/problem+json`. El `PUT` i el `DELETE` són sota `/api/events/`, així que comparteixen el 429 `RATE_LIMITED` del proxy (600 per minut entre tots els clients, [[nginx-proxy-manager]]); `GET /api/me/subscriptions` no. Regles i taula a [[model-de-domini#Subscripció a un esdeveniment (implementat al backend)]].

## Xat d'esdeveniment (TG-64)

Privats, amb sessió (401, 403 i 503 com `GET /api/users/me`). Només subscriptors de l'esdeveniment (`403 FORBIDDEN` si no ho són). Component i flux a [[chat]]; decisions a [[0033-xat-per-esdeveniment-sala-missatge-i-flux]].

| Endpoint | Què fa |
|---|---|
| `GET /api/chat/rooms` | Sales dels esdeveniments subscrits amb el darrer missatge |
| `PUT /api/events/{event_id}/chat/room` | Obre (o crea) la sala; idempotent, 200. 404 `EVENT_NOT_FOUND` |
| `GET /api/events/{event_id}/chat/messages` | Historial paginat per cursor opac (`before`, `limit` 1 a 50). 422 `CHAT_INVALID_LIMIT` o `CHAT_INVALID_CURSOR` |
| `WS /api/ws`, sala `chat:event:<event_id>` | Subscripció i enviament de missatges (`client_message_id` obligatori); errors `CHAT_MESSAGE_EMPTY`, `CHAT_MESSAGE_TOO_LONG`, `CHAT_MESSAGE_REJECTED`, `CHAT_IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`, `PUBSUB_UNAVAILABLE` |

Variables opcionals: `CHAT_RATE_LIMIT_MESSAGES`, `CHAT_RATE_LIMIT_WINDOW_SECONDS` i `CHAT_MESSAGE_MAX_LENGTH` (vegeu [[chat]]).

## Xat directe (TG-65)

A la branca de treball TG-65 els endpoints són privats i requereixen sessió. Errors RFC 9457 amb `code`; la integració i la revisió de la pila encara estan pendents.

| Endpoint | Funció |
|---|---|
| `POST /api/direct-conversations` | Cos `{user_id}`; crea (201) o recupera (200) la conversa de la parella |
| `GET /api/direct-conversations` | Converses amb perfil de l'altre usuari, vista prèvia i no llegits |
| `GET /api/direct-conversations/{id}/messages` | Historial amb `before` i `limit` (50 per defecte) |
| `POST /api/direct-conversations/{id}/read` | Cos `{last_message_id}`; avança la marca del participant fins al missatge carregat (204); un missatge aliè o inexistent retorna 404 |
| `PUT` / `DELETE /api/users/{id}/block` | Bloqueig i desbloqueig idempotents (204) |

A `/api/ws`, `dm.send` porta `conversation_id`, `text` i `client_message_id`; l'ack correlacionat retorna `id` i `sent_at` i confirma acceptació durable, no entrega. `dm.message` comunica el missatge; `dm.typing` és efímer i no es desa. Les connexions autenticades escolten un canal intern per usuari, no una sala subscrita arbitràriament pel client. Flux i límits a [[chat]] i [[0034-outbox-xat-directe]].

## US de Taiga relacionades

- TG-36 (Imatge Docker del backend i publicació a GHCR)
- TG-37 (Docker Compose amb cinc serveis)
- TG-39 (esquelet FastAPI hexagonal)
- TG-40 (PostgreSQL async amb SQLModel)
- TG-41 (Alembic)
- TG-44 (JWKS)
- TG-45 (model d'usuari, alta automàtica i tancament de sessió)
- TG-46 (cache APOD)
- TG-60 (quiz diari)
- TG-628 (publicacions de text en un esdeveniment)
- TG-53 (subscripció i baixa d'un esdeveniment)
- TG-88 (APScheduler; infraestructura implementada, vegeu [[backend-hexagonal]])
- TG-63 (endpoint WebSocket `/api/ws`)
- TG-64 (xat d'esdeveniment: REST i sales del WebSocket)
- TG-304 (Jerarquia d'errors i handler RFC 9457)
- TG-629 (sortides d'observació creades pels usuaris)

## Estat d'implementació

- **Codi base FastAPI (TG-39)**: implementat (capes domain, application, infrastructure i mòdul health).
- **Gestió d'errors i correlació (TG-304)**: implementat (RFC 9457, X-Correlation-ID).
- **Persistència PostgreSQL (TG-40)**: implementat.
- **Planificador APScheduler (TG-88)**: infraestructura implementada (vegeu [[backend-hexagonal]]).
- **Contenidorització i pipeline GHCR (TG-36)**: implementat (Dockerfile multi-stage, workflow GitHub Actions, proves locals a `infra/scripts/test-backend-docker.sh`).
- **Validació de tokens de Google i sessió pròpia (TG-44)**: implementat (JWKS, JWT HS256, sessions a Redis, `/api/auth/google`, `/api/auth/refresh`, `CurrentSessionDep`).
- **Usuari, alta automàtica i tancament de sessió (TG-45)**: implementat (`UserService`, `SqlUserRepository` amb alta concurrent segura, `/api/auth/logout`, `/api/users/me`, error `EMAIL_ALREADY_REGISTERED`).
- **WebSocket `/api/ws` (TG-63)**: implementat (`RealtimeSession` a `application/realtime`, router a `infrastructure/realtime`, embolcall `{type, room?, payload, id}`, autenticació pel primer frame, heartbeat i revocació per pub/sub; vegeu [[0030-protocol-websocket-i-revocacio-per-pub-sub]]). Requereix la llibreria `websockets` perquè uvicorn accepti el handshake. Les sales de xat d'esdeveniment són de TG-64 (vegeu [[chat]]); les del xat directe, de TG-65.
- **Quiz diari (TG-60)**: implementat (`QuizService`, banc de 100 preguntes, cache a Redis, `/api/quiz/today` i `/api/quiz/today/answer`).
- **Sortides d'observació (TG-629)**: backend implementat (`OutingService`, taula `outings`, `/api/outings`); l'app, pendent (tasques #640 i #641).
- **Publicacions d'esdeveniment (TG-628)**: implementat (`PostService`, `SqlPostRepository`, taula `posts` i els quatre endpoints).
- **Subscripcions a esdeveniments (TG-53)**: backend implementat (`SubscriptionService`, `SqlEventSubscriptionRepository`, taula `event_subscriptions` i els tres endpoints); l'app, implementada: estrella a cada fila del llistat i pestanya «Els meus» (vegeu [[frontend#Subscripcions a esdeveniments (TG-53)]]).
- **Punts de trobada amb Spotwise (TG-352)**: backend implementat (`MeetingPointService`, port `SpaceSearch`, `SpotwiseSpaceClient` i mock `ExampleSpaceSearch`, `/api/meeting-points`); l'app, pendent (PR 2 i 3 de l'stack).
- **Migracions Alembic (TG-41)**: pendent.
- **Xat d'esdeveniment (TG-64)**: backend implementat (`ChatService`, taules `event_chat_rooms` i `chat_messages`, tres endpoints REST i les sales `chat:event:<id>` del WebSocket; vegeu [[chat]]). El moderador és provisional (aprova tot) fins a #81.
- **Resta de serveis (moderació real, purga i notificacions programades)**: planificat.

## Enllaços

- [[arquitectura-fisica]], [[visio-general]], [[backend-hexagonal]]
- [[postgres]], [[redis]], [[nginx-proxy-manager]], [[moderation]], [[chat]]
