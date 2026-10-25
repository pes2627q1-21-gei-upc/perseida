# Perseida · Backend

[English](README.md) | **Català** | [Español](README.es.md)

> 🚧 **En construcció.** El projecte és al primer sprint. `app/` i `tests/` ja són reals (el mòdul `health` és l'exemple de referència), però la majoria de mòduls (persistència, autenticació, xat) encara no estan implementats.

Backend de **Perseida**, una aplicació mòbil multiplataforma de divulgació, exploració i seguiment de fenòmens astronòmics, desenvolupada com a projecte de PES (UPC-FIB). Exposa l'API REST i el xat en temps real que fan servir l'app mòbil i el panell d'administració, i integra les NASA Open APIs i altres proveïdors externs.

## Responsabilitats

Un únic procés FastAPI integra tres responsabilitats:

- **API REST** per a l'app mòbil i el panell d'administració (Swagger/OpenAPI sempre sincronitzat amb el codi).
- **WebSocket** per al xat en temps real (sales d'esdeveniment i 1-a-1), amb Redis pub/sub.
- **Planificador (APScheduler, dins del procés)** per a tasques periòdiques: notificacions programades, reinici de ràtxes diàries i purga de contingut caducat (publicacions multimèdia de 24 h).

Àrees funcionals principals: esdeveniments astronòmics (catàleg, filtres, mapa, subscripcions, exportació `.ics`), contingut diari de la NASA (APOD), gamificació (ràtxes, fites, quiz diari), comunitat (seguiment, xats d'esdeveniment, xats directes, votació de fotografies), recomanació de zones d'observació (meteorologia + contaminació lumínica + PostGIS), notificacions (FCM), moderació i administració.

## Stack tecnològic

| Àmbit | Tecnologia |
|---|---|
| Llenguatge | Python 3.14 |
| Framework | FastAPI (async) |
| ORM / migracions | SQLModel (SQLAlchemy) · Alembic (s'executa automàticament a l'entrypoint del contenidor) |
| Base de dades | PostgreSQL 18 + PostGIS (font de veritat) |
| Cache / pub-sub | Redis 8 (cache lazy amb TTL; res es persisteix només aquí) |
| Planificador | APScheduler |
| Autenticació | Google OAuth2 + PKCE · validació de tokens de Google via JWKS · sessió pròpia del backend (JWT) |
| Moderació | Microservei Kev-4B (model local, crida síncrona) |
| Dependències | `uv` (versions exactes, `uv.lock` versionat) |
| Qualitat | `ruff` (lint + format, complexitat màx. 10), `mypy` estricte, SonarQube Cloud |
| Tests | `pytest`, `pytest-asyncio`, `pytest-cov`, `httpx`, `respx` |

## Arquitectura: hexagonal

```mermaid
flowchart TB
    subgraph Infrastructure
        CTRL[Controllers<br/>rutes FastAPI]
        REPO[(Repositoris i clients<br/>PostgreSQL, Redis, NASA,<br/>Kev-4B, FCM)]
    end
    subgraph Application
        SVC["Services<br/>(casos d'ús)"]
    end
    subgraph Domain
        ENT[Entitats i regles<br/>ràtxes, fites,<br/>puntuació de zones, moderació]
        PORTS{{Ports}}
    end
    CTRL --> SVC
    SVC --> ENT
    SVC --> PORTS
    REPO -.implementa.-> PORTS
```

- `domain`: lògica de negoci sense dependència de frameworks, BD ni serveis externs (l'única llibreria externa permesa és Pydantic). Conté les entitats, els value objects, els errors de domini i els **ports** (`Protocol`) que descriuen què necessita el negoci de l'exterior ([ADR-0016](../obsidian_vault/decisions/0016-ports-i-entitats-riques-al-domini.md)).
- `application`: **services** (casos d'ús) que orquestren les entitats a través dels ports. Sense regles de negoci pròpies ni FastAPI, SQLModel, Redis o httpx.
- `infrastructure`: tot el que toca l'exterior: **controllers** (rutes FastAPI), **repositoris** i clients externs que implementen els ports, i el *composition root* (`dependencies.py`, `@lru_cache` + `Depends`, [ADR-0017](../obsidian_vault/decisions/0017-injeccio-de-dependencies-i-services-singleton.md)).

**Regla de dependències:** `domain` només importa la biblioteca estàndard, Pydantic i `app.domain`; `application` només això i `app.application`; `infrastructure` pot importar qualsevol capa. Ho verifica `tests/architecture/test_layer_dependencies.py`.

Patró per a dades externes (p. ex. APOD): la primera petició crida l'API externa i en desa el resultat a Redis (i a PostgreSQL quan cal); les següents se serveixen des de la cache. Si l'API externa cau, es retornen les dades de la cache en lloc d'un 500.

## Estructura

```
backend/
├── app/
│   ├── main.py            # app factory de FastAPI i lifespan
│   ├── domain/            # entities, value objects, ports
│   │   ├── shared/        # jerarquia DomainError
│   │   └── health/        # models i ports
│   ├── application/       # services
│   │   ├── shared/        # jerarquia ApplicationError
│   │   └── health/        # cas d'ús
│   └── infrastructure/    # routers, persistence, redis, clients
│       ├── api/           # handlers d'errors (RFC 9457) i correlation id
│       └── health/        # adaptadors, router i cablejat
├── tests/
│   ├── unit/              # domini i application, amb fakes
│   ├── integration/       # API amb httpx + ASGITransport
│   ├── architecture/      # regles de dependències entre capes
│   ├── fakes/             # ports en memòria per als tests
│   ├── fixtures/          # respostes enregistrades de NASA/meteo, dades geo
│   ├── factories/         # usuaris, esdeveniments, missatges, fites
│   └── moderation_dataset/# joc etiquetat d'avaluació de Kev-4B (ca/es/en)
├── pyproject.toml
└── uv.lock
```

`alembic/` (migracions) i `.env.example` arribaran amb la persistència.

### Afegir una funcionalitat

El mòdul `health` és l'exemple de referència. Per a un mòdul nou `<nom>`:

1. **Domini** (`app/domain/<nom>/`): entitats/value objects a `models.py` i els ports a `ports.py` (p. ex. `HealthReport` i el protocol `HealthCheck`).
2. **Application** (`app/application/<nom>/`): el service que usa els ports (`HealthService`), sense FastAPI.
3. **Infrastructure** (`app/infrastructure/<nom>/`): els adaptadors que implementen els ports (`checks.py`), el provider `get_<nom>_service` amb `@lru_cache` i `<Nom>ServiceDep` (`dependencies.py`), i el router amb el seu model de resposta (`router.py`).
4. Registra el router a `create_app()` (`app/main.py`).
5. **Tests**, després del codi: unitaris amb fakes (`tests/fakes/`), integració de l'API amb `dependency_overrides`; el test d'arquitectura continua verificant les capes.

## Errors

Contracte d'errors únic ([ADR-0018](../obsidian_vault/decisions/0018-errors-rfc-9457-amb-codis-estables.md)). El codi de domini i d'application llença errors tipats amb un `code` estable (`SCREAMING_SNAKE`, p. ex. `EVENT_NOT_FOUND`); només `infrastructure` coneix HTTP, així que no hi ha cap `HTTPException` fora d'ella.

| Error | Capa | Status |
|---|---|---|
| `NotFoundError` | `domain/shared/errors.py` | 404 |
| `ConflictError` | `domain/shared/errors.py` | 409 |
| `ValidationError`, `BusinessRuleViolation` | `domain/shared/errors.py` | 422 |
| `UnauthorizedError` | `application/shared/errors.py` | 401 |
| `ForbiddenError` | `application/shared/errors.py` | 403 |
| `ExternalServiceError` (proveïdor extern caigut, sense cache) | `application/shared/errors.py` | 503 |
| Altres `DomainError` / `ApplicationError` | | 400 |

```python
raise NotFoundError("EVENT_NOT_FOUND", "Event 42 does not exist")
raise UnauthorizedError("INVALID_SESSION")  # el missatge per defecte és el code
```

`DomainError(code, message=None)` i `ApplicationError(code, message=None)` comparteixen signatura; `message` és tècnic (logs i `detail`) i mai es mostra a l'usuari: el frontend tradueix pel `code`. El status es resol a `infrastructure/api/error_handlers.py` (`STATUS_BY_ERROR`, recorrent l'MRO de la classe), de manera que una subclasse nova hereta el del pare.

Tot error es respon com a `application/problem+json` (RFC 9457):

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

- `title` és la frase HTTP estàndard; `type` sempre és `about:blank`.
- Errors de validació de la petició: 422, `code` `VALIDATION_ERROR` i `errors[]` amb un `{field, message, type}` per camp (les branques d'una unió de Pydantic, com `x.int`, es retallen a `x`). Els errors 5xx es registren amb `warning`.
- Rutes inexistents i altres errors HTTP conserven el seu status amb `NOT_FOUND`, `METHOD_NOT_ALLOWED` o `HTTP_<status>`.
- Excepcions inesperades: 500 `INTERNAL_ERROR` amb un `detail` genèric; cap traça ni nom de classe surt del servidor (va al log amb el `correlation_id`).
- **Correlation id:** la capçalera `X-Correlation-ID` s'afegeix a totes les respostes. Un valor entrant només es reutilitza si compleix `[A-Za-z0-9._-]{1,128}`; si no, es genera un `uuid4`. El mateix id surt al cos com a `correlation_id`.

Afegir un codi: llença la classe existent amb el `code` nou des de `domain`/`application`, registra'l al [catàleg de codis](../.agents/skills/gestio-errors/references/cataleg-codis.md) i afegeix-ne els textos ca/es/en al frontend. Mai es reanomena un `code` publicat.

## Planificador

APScheduler (`AsyncIOScheduler`) s'executa dins del procés de l'API: s'inicia al *lifespan* de FastAPI i s'atura a l'aturada. No hi ha *job store*: les tasques es registren a l'arrencada.

| Variable | Per defecte | Significat |
|---|---|---|
| `SCHEDULER_ENABLED` | `true` | amb `false` no s'inicia el planificador ni apareix a `/api/health` |
| `SCHEDULER_TIMEZONE` | `UTC` | fus horari IANA del planificador |

**Registrar una tasca** (l'únic lloc): afegeix una línia a `register_jobs` de `app/infrastructure/scheduler/jobs.py`, amb el port `JobScheduler` (`app/domain/scheduler/ports.py`):

```python
def register_jobs(scheduler: JobScheduler) -> None:
    scheduler.add_interval_job("purge-expired-posts", purge_service.run, seconds=3600)
```

- La tasca és una `async def` sense arguments (construeix-ne el service amb els mateixos providers que l'API, [ADR-0017](../obsidian_vault/decisions/0017-injeccio-de-dependencies-i-services-singleton.md)); s'executa al bucle d'esdeveniments, per tant no ha de bloquejar.
- Cada tasca s'executa amb `max_instances=1` i `coalesce=True`: una tasca lenta no se solapa amb si mateixa i les execucions perdudes es fusionen.
- Una excepció es registra al log (JSON, camp `job` amb el nom) i no atura ni el planificador ni l'API.
- `/api/health` informa del component `scheduler` mentre està activat.
- Se suposa un únic procés d'API; amb diverses rèpliques caldria un bloqueig distribuït.

Els logs (també els d'uvicorn) s'escriuen a stderr com un objecte JSON per línia, amb `correlation_id` quan n'hi ha (`app/infrastructure/logging.py`). Un `SCHEDULER_TIMEZONE` desconegut falla a l'arrencada amb un error de configuració.

## Contractes de servei (Spotwise, grup 21B)

- **Proveïm:** `GET /api/events/active` i `GET /api/events/upcoming` retornen els esdeveniments astronòmics rellevants (títol, descripció breu, categoria com `lunar`, `solar`, `meteor_shower`).
- **Consumim:** la cerca d'espais de Spotwise (biblioteques i cafeteries de Barcelona) per suggerir punts de trobada als esdeveniments.

## Executar i testejar

Prerequisit: [`uv`](https://docs.astral.sh/uv/). La versió de Python (3.14.9) la fixa `.python-version` i `uv` la instal·la si cal.

```bash
cd backend                    # des de l'arrel del repositori
uv sync                       # instal·la les dependències (entorn virtual a .venv)
uv lock --check               # verifica que uv.lock està al dia amb pyproject.toml
uv run ruff check .           # lint
uv run ruff format --check .  # comprova el format sense modificar fitxers
uv run mypy .                 # tipatge estricte
uv run pytest                 # tests (amb cobertura)
uv run uvicorn app.main:app --reload  # arrenca l'API (http://127.0.0.1:8000/api/docs)
```

- Les dependències s'afegeixen amb `uv add` / `uv add --dev` i versió exacta (`==`); no s'usa `pip`.
- Tota la configuració (ruff, mypy, pytest, cobertura) és a `pyproject.toml`.

L'stack complet (API, PostgreSQL/PostGIS, Redis, moderació) s'arrenca amb Docker Compose des de [`../infra`](../infra/README.ca.md). Copia `.env.example` a `.env`; els secrets reals mai es versionen.

## Integració contínua

El workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) executa el job `backend` a cada pull request cap a `develop` o `main` i a cada push a `develop` o `main`. En una PR només s'executa si han canviat `backend/**` o el propi workflow; si no, el job queda com a omès (*skipped*) i no bloqueja la PR. Un push nou a la mateixa PR cancel·la l'execució anterior.

Ordres exactes (des de `backend/`, les mateixes que el workflow):

```bash
cd backend                                 # des de l'arrel del repositori
uv sync --locked                           # falla si uv.lock no està al dia
uv run ruff check .                        # lint
uv run ruff format --check .               # format
uv run mypy .                              # tipatge estricte
uv run pytest --cov-report=xml:coverage.xml  # tests + informe de cobertura
```

- **Cobertura:** l'informe es publica com a artefacte `backend-coverage` (`coverage.xml`). Per descarregar-lo: GitHub → pestanya **Actions** → l'execució → secció **Artifacts** al final de la pàgina de resum.
- **Serveis:** PostgreSQL (PostGIS 18) i Redis 8 s'aixequen sols com a service containers a la CI. No cal Docker Compose ni `.env`.

## Redis

Redis només és una cache amb TTL i el bus pub/sub del xat WebSocket; no hi viu res que hagi de sobreviure (la font de veritat és PostgreSQL). El client asíncron es crea al `lifespan` de FastAPI i es tanca en aturar l'aplicació. Configuració (vegeu `.env.example`):

- `REDIS_HOST`, `REDIS_PORT`: adreça del servidor (`redis://host:port`).
- `CACHE_DEFAULT_TTL_SECONDS`: TTL per defecte en segons (3600 si no es defineix).
- `REDIS_SOCKET_TIMEOUT_SECONDS`: timeout de connexió i de socket en segons (2 si no es defineix); un Redis penjat es comporta com un miss.

Per executar un Redis local: `docker run -d --name perseida-redis -p 6379:6379 redis:8` i `REDIS_HOST=localhost`.

**Ports** (`app/domain/shared/ports.py`): `Cache` (`get`, `set` amb un `ttl_seconds` opcional per clau) i `PubSub` (`publish`, `subscribe`). Els adaptadors Redis són a `app/infrastructure/cache/`; s'injecten amb `CacheDep` i `PubSubDep` (també funcionen en endpoints WebSocket).

**Cache lazy:** `get_or_load(cache, key, load, adapter, ttl_seconds=None)` (`app/application/shared/cache.py`) retorna el valor de la cache o crida `load`, el desa i el retorna. Si Redis cau, `RedisCache` registra un avís i es comporta com una fallada, de manera que la dada s'obté igualment de la font (cap HTTP 500).

**Convenció de claus:** qui crida fa servir `<domini>:<id>` i l'adaptador ho desa com `cache:<domini>:<id>`, p. ex. `cache:apod:2026-10-05`. Cada funcionalitat tria el seu TTL.

**Pub/sub:** `async with pubsub.subscribe(canal) as missatges:` dona els missatges publicats després d'entrar al bloc; tots els subscriptors del canal reben cada missatge i els d'altres canals no. Si Redis falla es llança `ExternalServiceError` (`PUBSUB_UNAVAILABLE`, HTTP 503).

Els tests d'integració (`tests/integration/test_redis.py`) s'executen si hi ha `REDIS_HOST`; la CI aixeca Redis 8.

## APOD (NASA)

`GET /api/apod` retorna la imatge astronòmica del dia de la NASA; `GET /api/apod?date=AAAA-MM-DD`, la d'aquella data. L'adaptador (`app/infrastructure/apod/nasa_provider.py`) la busca en aquest ordre:

1. **Redis** (`cache:apod:<data>`, TTL 24 h).
2. **PostgreSQL** (taula `apod`, una fila per data): s'hi desa cada APOD rebut de la NASA, i si hi és, es torna a posar a Redis.
3. **NASA**: la resposta es desa a PostgreSQL i a Redis. L'API de la NASA (`https://api.nasa.gov/planetary/apod`) ja no retorna l'APOD real (vegeu a sota), així que l'adaptador llegeix primer el **feed RSS** `https://science.nasa.gov/feed/apod-basic/` (no documentat; només conserva els últims **30 dies**, ignora qualsevol filtre de data i aquí no porta vídeos) i, si falla, l'API JSON com a alternativa (p. ex. dates de més de 30 dies).

Sense data, es busca el d'avui (UTC) a Redis i PostgreSQL; si no hi és, es demana a la NASA l'últim publicat. Si la NASA falla (error, timeout o resposta inservible), es retorna la dada guardada: l'APOD d'aquella data o, per a avui, l'últim desat. Sense res guardat, la resposta és 503 `APOD_UNAVAILABLE`. Si Redis cau, la petició continua amb PostgreSQL i la NASA.

Perquè no es cridi la NASA a cada petició, dues respostes es guarden a Redis **15 minuts** (`RETRY_AFTER_SECONDS`): el resultat d'avui mentre la NASA encara no l'ha publicat (`cache:apod:today:<data>`) i una crida fallida a la NASA (`cache:apod:unavailable:<data|latest>`), que no es repeteix fins que caduca.

Configuració (`.env`):

| Variable | Per defecte | Significat |
|---|---|---|
| `NASA_API_KEY` | (obligatòria) | Clau d'[api.nasa.gov](https://api.nasa.gov). En local val `DEMO_KEY` (amb límit de peticions). S'envia a la capçalera `X-Api-Key`, mai a la URL, perquè no surti als logs. |
| `NASA_CONNECT_TIMEOUT_SECONDS` | `3` | Timeout de connexió |
| `NASA_TIMEOUT_SECONDS` | `10` | Timeout total d'una petició (sense reintents) |
| `NASA_APOD_FEED_URL` | `https://science.nasa.gov/feed/apod-basic/` | Feed RSS de l'APOD (es prova primer). Opcional, només https. |
| `NASA_APOD_API_URL` | `https://api.nasa.gov/planetary/apod` | API JSON de la NASA (alternativa). Opcional, només https. |

L'API no arrenca sense `NASA_API_KEY`. En producció ve del secret de GitHub `NASA_API_KEY`; mai facis commit d'una clau real.

> Ara mateix l'API de la NASA respon amb un farciment en lloc de l'APOD (el logotip de NASA Science i un text genèric, observat el 2026-10-21; l'APOD s'ha mudat a science.nasa.gov). Per això el feed RSS va primer. El client continua rebutjant el farciment (també al feed), així que mai es desa.
>
> Límits del feed: només es guarden imatges (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`); una entrada de vídeo es descarta (`APOD_UNAVAILABLE` si l'API tampoc pot respondre). La data d'una entrada és el dia UTC de la publicació i el text d'`explanation` i `copyright` es converteix d'HTML a text pla. La fallada d'una crida es guarda 15 minuts només quan fallen el feed **i** l'API.

## Autenticació

L'app inicia la sessió amb Google (OAuth2 + PKCE) i envia l'`id_token` de Google al backend, que mai rep el codi d'autorització ni desa cap contrasenya ([ADR-0008](../obsidian_vault/decisions/0008-google-oauth2-pkce-jwks-i-sessio-propia.md)). El backend en comprova el token i emet una sessió pròpia.

**Flux:**

1. `POST /api/auth/google` amb `{"id_token": "<token de Google>", "language": "ca"}` (`language` és opcional).
2. `GoogleJwksVerifier` comprova la signatura RS256 amb les claus públiques de Google (JWKS, en memòria durant 1 hora; un `kid` desconegut provoca una descàrrega nova, com a màxim un cop per minut), l'emissor, l'audiència (un dels clients de `GOOGLE_CLIENT_IDS`), la caducitat i que el correu estigui verificat. Si no: 401 `INVALID_GOOGLE_TOKEN`. Si Google no respon i no hi ha claus en memòria: 503 `IDENTITY_PROVIDER_UNAVAILABLE`.
3. El port `AccountGateway` dona d'alta el compte al primer accés i retorna el seu estat: suspès o banejat → 403 `ACCOUNT_SUSPENDED`; esborrat → 403 `ACCOUNT_DELETED`.
4. El backend emet dos JWT signats amb HS256 i `JWT_SECRET`: un access token (15 minuts) i un refresh token (30 dies), amb les claims `sub` (el `google_sub`), `jti` (únic per token), `sid` (identificador de sessió, compartit per l'access i el refresh d'un parell i mantingut per `refresh`), `type` (`access` o `refresh`), `iat` i `exp`. Cadascun es registra a Redis com a `session:<type>:<jti>` amb un TTL igual a la seva durada, i s'apunta a l'índex de l'usuari `user_sessions:<sub>` (membres `<sid>:<type>:<jti>`).
5. Resposta `200`: `{"access_token", "refresh_token", "token_type": "bearer", "expires_in"}` (`expires_in` en segons).

Un token és vàlid només si la signatura i la caducitat són correctes **i** la seva clau existeix a Redis. Esborrar la clau revoca el token a l'instant; si Redis es reinicia, les sessions es perden i els usuaris tornen a iniciar sessió amb Google. Si Redis no està disponible, els endpoints responen 503 `SESSION_UNAVAILABLE`.

**Renovació:** `POST /api/auth/refresh` amb `{"refresh_token": "..."}` retorna un parell nou i esborra el refresh anterior de Redis; tornar-lo a usar retorna 401 `INVALID_SESSION`.

**Configuració** (`.env.example`; `AuthSettings` a `app/infrastructure/auth/config.py`):

| Variable | Significat |
|---|---|
| `GOOGLE_CLIENT_IDS` | Audiències (`aud`) acceptades del token de Google: els clients OAuth de l'app (web, Android, iOS), separats per comes |
| `JWT_SECRET` | Clau HS256, d'almenys 32 caràcters; mai no se'n versiona una de real |
| `ACCESS_TOKEN_MINUTES` | Durada de l'access token (15 per defecte) |
| `REFRESH_TOKEN_DAYS` | Durada del refresh token (30 per defecte) |

**Protegir un endpoint:** afegeix `CurrentSessionDep`. Llegeix `Authorization: Bearer <access token>` i retorna les `SessionClaims`. Sense capçalera, amb un token invàlid o revocat, o amb un refresh token, respon 401 `INVALID_SESSION`.

```python
from app.infrastructure.auth.dependencies import CurrentSessionDep


@router.get("/me")
async def me(session: CurrentSessionDep) -> MeResponse:
    return MeResponse(google_sub=session.sub)  # sub is the user's google_sub
```

**Usuaris i alta (US #45).** El port `AccountGateway` l'implementa `UserAccountGateway` (`app/infrastructure/users/`), que delega a `UserService.sign_in` (`app/application/users/`):

- **Primer accés:** un `google_sub` que no existeix crea l'usuari (rol `user`, nom i avatar del perfil de Google). L'`language` opcional del cos del login (`ca`, `es` o `en`; qualsevol altre valor o l'absència vol dir `ca`) només es desa llavors. L'insert és `INSERT … ON CONFLICT DO NOTHING`, de manera que dos primers accessos simultanis deixen un sol usuari.
- **Accés recurrent:** no es crea cap usuari nou; s'actualitza `last_login_at`.
- **Correu d'un altre compte:** si el correu ja pertany a un usuari vinculat a un altre `google_sub`, 409 `EMAIL_ALREADY_REGISTERED` (les identitats no es vinculen automàticament).
- **Esborrat, suspès o banejat:** 403 i no es crea ni s'actualitza res; el `google_sub` d'un compte esborrat queda reservat.

**Usuari actual:** `GET /api/users/me` retorna `id`, `email`, `display_name`, `avatar_url`, `preferred_language` i `role` del propietari de la sessió. 401 `INVALID_SESSION` sense sessió vàlida; 403 `ACCOUNT_SUSPENDED` o `ACCOUNT_DELETED` si el compte no es pot fer servir.

**Tancament de sessió:** `POST /api/auth/logout` (capçalera `Authorization: Bearer <token>`) revoca la sessió sencera, l'access i el refresh, amb el `sid` que comparteixen (`SessionStore.revoke_session`) i respon 204. És idempotent: un token caducat, invàlid o ja revocat, o cap token, també respon 204. La suspensió i el baneig (#78, #102) usen `SessionStore.revoke_all(sub)`; el refresh falla llavors amb 401 perquè la seva clau ja no hi és.

Als tests fes servir `FakeAccountGateway` (`tests/fakes/auth.py`); `tests/integration/test_auth_api.py` mostra el flux complet amb Google simulat amb `respx`.

Els codis d'error (`INVALID_GOOGLE_TOKEN`, `INVALID_SESSION`, `ACCOUNT_SUSPENDED`, `ACCOUNT_DELETED`, `IDENTITY_PROVIDER_UNAVAILABLE`, `SESSION_UNAVAILABLE`, `EMAIL_ALREADY_REGISTERED`) són a `app/application/auth/errors.py` i al catàleg d'errors. Els tres que també llança `users` (`INVALID_SESSION`, `ACCOUNT_SUSPENDED`, `ACCOUNT_DELETED`) es defineixen a `app/application/shared/error_codes.py` i `AccountStatus` a `app/domain/shared/account.py`, de manera que `auth` i `users` no s'importen mai entre ells a `domain` ni a `application` (`tests/architecture`); `main.py` els compon passant `UserAccountGateway` a `build_auth_service`.

## Testing i qualitat

- Piràmide de proves: ~70 % unitàries, ~30 % d'integració (PostgreSQL/PostGIS i Redis efímers, API amb `httpx.AsyncClient`, APIs externes simulades amb `respx`). No hi ha proves end-to-end a l'app mòbil.
- Objectius de cobertura: domini ≥ 80 %, aplicació ≥ 70 %, codi nou de cada PR ≥ 70 % (imposat pel Quality Gate de SonarQube Cloud).
- Llindars de requisits no funcionals verificats amb tests: recursos en cache ≤ 200 ms, consultes de proximitat ≤ 150 ms, endpoints privats rebutgen peticions sense sessió vàlida (401/403).

## Convencions

- GitFlow: `main` (producció, dispara CD), `develop` (integració, CI), `feature/*`, `release/*`, `hotfix/*`. Cap push directe a `main`/`develop`.
- Tota PR cap a `develop` necessita CI en verd i l'aprovació d'una persona diferent de l'autora.
- Definition of Done: criteris d'acceptació complerts, subtasques tancades, integrada a `develop` amb una PR revisada i amb les comprovacions superades.

## Relacionat

[Frontend](../frontend/README.ca.md) · [Infraestructura](../infra/README.ca.md) · [Obsidian vault](../obsidian_vault/README.ca.md)

## Equip

Manel Alaminos · Simona Duelt · Alex Garcia · Oriol Orbea · Javier Pascual · Raquel Rubio
