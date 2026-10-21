---
titol: "Component: api"
tipus: component
estat: vigent
data: "2026-10-20"
us: ["TG-85", "TG-36", "TG-37", "TG-39", "TG-40", "TG-41", "TG-44", "TG-46", "TG-88", "TG-304"]
font: "infra/README.md, backend/Dockerfile, .github/workflows/backend-docker.yml, backend/README.md, memòria §3.4.1, .env.example; Taiga: US TG-44"
etiquetes: [component, api, fastapi, backend, docker, ghcr]
---

# api

## Responsabilitat

Un únic procés FastAPI que fa tres coses: atén l'API REST de l'app i del panell d'admin, gestiona el xat en temps real per WebSocket (amb pub/sub de Redis) i executa un planificador APScheduler in-process (notificacions programades, reinici de ràtxes diàries, purga de contingut caducat com els posts de 24 h). Abans de difondre una publicació o un missatge de xat consulta [[moderation]] de manera síncrona. No serveix media ni TLS (és feina de [[nginx-proxy-manager]]) i no guarda res essencial a Redis.

## Tecnologia i versió

Python 3.14, FastAPI (async), SQLModel (SQLAlchemy), Alembic, APScheduler, `uv`. Imatge `perseida-api:<git-sha>` publicada a GHCR (`ghcr.io/pes2627q1-21-gei-upc/perseida-api`).

### Contenidorització i empaquetament (TG-36)
- **Multi-stage build**: etapa `builder` amb `uv sync --frozen --no-dev` creant un entorn virtual aïllat a `/app/.venv`, i etapa `runner` neta basada en `python:3.14-slim` on s'elimina `pip` i no hi ha eines de compilació.
- **Seguretat**: execució sota usuari no privilegiat `appuser` (UID/GID fix `1001`, shell `/sbin/nologin`, sense home).
- **Entorn**: `PYTHONUNBUFFERED=1` per a emissió immediata de logs a stdout, `PYTHONDONTWRITEBYTECODE=1` i `PATH="/app/.venv/bin:$PATH"`.
- **Pipeline CI/CD**: `.github/workflows/backend-docker.yml` amb Buildx, memòria cau GHA (`mode=max`) i generació d'etiquetes immutables (`sha-XXXXXXX`), de branca (`develop`/`main`/`release/*`) i SemVer (`vX.Y.Z`).

Alembic s'executarà a l'entrypoint del contenidor un cop implementat a TG-41. Estructura hexagonal: [[backend-hexagonal]].

## Interfícies

- Qui el crida: [[nginx-proxy-manager]] (`proxy_pass`), que rep REST/WSS de l'app Android i del navegador d'admin; Spotwise, per `GET /api/events/active` i `/upcoming` ([[contracte-spotwise]]).
- A qui crida: [[postgres]] (font de veritat), [[redis]] (cache i pub/sub), [[moderation]] (HTTP síncron), NASA, APIs de meteorologia i contaminació lumínica, FCM, i Google (JWKS) ([[serveis-externs]]). Comparteix el volum de media amb nginx-proxy-manager.

## Errors i correlació

Tot error surt com a `application/problem+json` (RFC 9457) amb `code` estable i `correlation_id`; el 500 no exposa detalls interns. Cada resposta porta la capçalera `X-Correlation-ID` (generada amb `uuid4` o reutilitzada si el valor entrant és vàlid). Jerarquia a `app/domain/shared/errors.py` i `app/application/shared/errors.py`; handlers i middleware a `app/infrastructure/api/`. Detall a [[0018-errors-rfc-9457-amb-codis-estables]].

## Autenticació (TG-44)

Valida el token de Google via JWKS i emet una sessió pròpia (dos JWT HS256: *access* 15 min i *refresh* 30 dies), registrada a [[redis]] com a `session:<type>:<jti>` (i indexada per usuari a `user_sessions:<sub>`, amb un `sid` comú a l'access i al refresh) perquè es pugui revocar a l'instant, per sessió o per usuari. Endpoints `POST /api/auth/google` i `POST /api/auth/refresh`; els endpoints privats usen `CurrentSessionDep`. L'estat del compte arriba pel port `AccountGateway` (implementació provisional fins a TG-45). Format, caducitats i conseqüències a [[0008-google-oauth2-pkce-jwks-i-sessio-propia]]; guia d'ús a la secció «Authentication» de `backend/README.md`.

## Configuració

Variables de `.env.example` que li afecten: `APP_ENV`, `JWT_SECRET` (mínim 32 caràcters), `GOOGLE_CLIENT_ID`, `ACCESS_TOKEN_MINUTES` i `REFRESH_TOKEN_DAYS` (opcionals, 15 i 30; no són a `.env.example` perquè el CD no les exigeixi), `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `REDIS_HOST`, `REDIS_PORT`, `SCHEDULER_ENABLED` (per defecte `true`) i `SCHEDULER_TIMEZONE` (per defecte `UTC`; un fus desconegut falla a l'arrencada). El `.env` el renderitza el CD des dels secrets de GitHub; mai es versiona. Veure `.env.example`.

## Decisions relacionades

- [[0003-un-sol-proces-fastapi]]
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]
- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0007-moderacio-local-kev-4b-sincrona]]
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]]
- [[0018-errors-rfc-9457-amb-codis-estables]]
- [[0022-logging-json-global-amb-stdlib]]

## US de Taiga relacionades

- TG-36 (Imatge Docker del backend i publicació a GHCR)
- TG-37 (Docker Compose amb cinc serveis)
- TG-39 (esquelet FastAPI hexagonal)
- TG-40 (PostgreSQL async amb SQLModel)
- TG-41 (Alembic)
- TG-44 (JWKS)
- TG-46 (cache APOD)
- TG-88 (APScheduler; infraestructura implementada, vegeu [[backend-hexagonal]])
- TG-304 (Jerarquia d'errors i handler RFC 9457)

## Estat d'implementació

- **Codi base FastAPI (TG-39)**: implementat (capes domain, application, infrastructure i mòdul health).
- **Gestió d'errors i correlació (TG-304)**: implementat (RFC 9457, X-Correlation-ID).
- **Persistència PostgreSQL (TG-40)**: implementat.
- **Planificador APScheduler (TG-88)**: infraestructura implementada (vegeu [[backend-hexagonal]]).
- **Contenidorització i pipeline GHCR (TG-36)**: implementat (Dockerfile multi-stage, workflow GitHub Actions, proves locals a `infra/scripts/test-backend-docker.sh`).
- **Validació de tokens de Google i sessió pròpia (TG-44)**: implementat (JWKS, JWT HS256, sessions a Redis, `/api/auth/google`, `/api/auth/refresh`, `CurrentSessionDep`); el compte és provisional fins a TG-45.
- **Migracions Alembic (TG-41)**: pendent.
- **Resta de serveis (xat, moderació, purga i notificacions programades)**: planificat.

## Enllaços

- [[arquitectura-fisica]], [[visio-general]], [[backend-hexagonal]]
- [[postgres]], [[redis]], [[nginx-proxy-manager]], [[moderation]]
