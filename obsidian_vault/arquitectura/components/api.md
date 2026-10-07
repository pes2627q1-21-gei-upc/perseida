---
titol: "Component: api"
tipus: component
estat: vigent
data: "2026-10-07"
us: ["TG-85", "TG-37", "TG-39", "TG-40", "TG-41", "TG-44", "TG-46", "TG-88"]
font: "infra/README.md, backend/README.md, memòria §3.4.1, .env.example; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [component, api, fastapi, backend]
---

# api

## Responsabilitat

Un únic procés FastAPI que fa tres coses: atén l'API REST de l'app i del panell d'admin, gestiona el xat en temps real per WebSocket (amb pub/sub de Redis) i executa un planificador APScheduler in-process (notificacions programades, reinici de ràtxes diàries, purga de contingut caducat com els posts de 24 h). Abans de difondre una publicació o un missatge de xat consulta [[moderation]] de manera síncrona. No serveix media ni TLS (és feina de [[nginx-proxy-manager]]) i no guarda res essencial a Redis.

## Tecnologia i versió

Python, FastAPI (async), SQLModel (SQLAlchemy), Alembic, APScheduler, `uv`. Imatge `perseida-api:<git-sha>`. Alembic s'executa automàticament a l'entrypoint del contenidor, abans d'arrencar el servidor. Estructura hexagonal: [[backend-hexagonal]]. Les versions de Python i de les llibreries no consten als documents consultats.

## Interfícies

- Qui el crida: [[nginx-proxy-manager]] (`proxy_pass`), que rep REST/WSS de l'app Android i del navegador d'admin; Spotwise, per `GET /api/events/active` i `/upcoming` ([[contracte-spotwise]]).
- A qui crida: [[postgres]] (font de veritat), [[redis]] (cache i pub/sub), [[moderation]] (HTTP síncron), NASA, APIs de meteorologia i contaminació lumínica, FCM, i Google (JWKS) ([[serveis-externs]]). Comparteix el volum de media amb nginx-proxy-manager.

## Configuració

Variables de `.env.example` que li afecten: `APP_ENV`, `JWT_SECRET`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `REDIS_HOST`, `REDIS_PORT`. El `.env` el renderitza el CD des dels secrets de GitHub; mai es versiona. Veure `.env.example`.

## Decisions relacionades

- [[0003-un-sol-proces-fastapi]]
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]]
- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0007-moderacio-local-kev-4b-sincrona]]
- [[0008-google-oauth2-pkce-jwks-i-sessio-propia]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-39 (esquelet FastAPI hexagonal)
- TG-40 (PostgreSQL async amb SQLModel)
- TG-41 (Alembic)
- TG-44 (JWKS)
- TG-46 (cache APOD)
- TG-88 (APScheduler)

## Estat d'implementació

planificat

## Enllaços

- [[arquitectura-fisica]], [[visio-general]], [[backend-hexagonal]]
- [[postgres]], [[redis]], [[nginx-proxy-manager]], [[moderation]]
