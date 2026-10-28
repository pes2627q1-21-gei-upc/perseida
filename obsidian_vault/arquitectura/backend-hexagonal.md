---
titol: "Backend: arquitectura hexagonal"
tipus: arquitectura
estat: vigent
data: "2026-10-21"
us: ["TG-85", "TG-39", "TG-40", "TG-41", "TG-45", "TG-46", "TG-88", "TG-205", "TG-304"]
font: "backend/README.md, memòria §3.4.1; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [arquitectura, backend, hexagonal]
---

# Backend: arquitectura hexagonal

Un **únic procés FastAPI** (async) integra tres responsabilitats ([[0003-un-sol-proces-fastapi]]): API REST per a l'app i el panell d'admin, WebSocket per al xat en temps real (amb pub/sub de Redis) i planificador APScheduler in-process (notificacions programades, reinici de ràtxes diàries i purga de contingut caducat).

> [!note] Estat d'implementació
> El backend ja disposa d'una aplicació FastAPI asíncrona amb les capes de domini, aplicació i infraestructura, un mòdul de salut i una infraestructura inicial de persistència PostgreSQL asíncrona. TG-40 està en revisió a la PR #15. La integració amb una instància real de PostgreSQL, PostGIS i les migracions Alembic s'han de validar en els passos corresponents.

## Capes

```mermaid
flowchart LR
    subgraph Infrastructure
        API[Controllers<br/>REST / WebSocket]
        DB[(Repositories<br/>PostgreSQL + PostGIS)]
        RC[(Redis)]
        EXT[NASA / weather<br/>clients]
        MOD[Kev-4B client]
        FCM[FCM client]
    end
    subgraph Application
        SVC[Services<br/>use cases]
    end
    subgraph Domain
        DOM[Entities and rules<br/>streaks, achievements,<br/>zone scoring, moderation]
        PORTS{{Ports}}
    end
    API --> SVC --> DOM
    SVC --> PORTS
    DB -.implements.-> PORTS
    RC -.implements.-> PORTS
    EXT -.implements.-> PORTS
    MOD -.implements.-> PORTS
    FCM -.implements.-> PORTS
```

- `domain`: entitats riques (validen invariants i multiplicitats), value objects, errors de domini i **ports**. Sense dependència de frameworks, BD ni serveis externs; l'única llibreria externa permesa és Pydantic ([[0016-ports-i-entitats-riques-al-domini]]). Els tests s'escriuen després del codi ([[0019-tests-despres-del-codi]]; vegeu [[0004-arquitectura-hexagonal-i-tdd-al-domini]]).
- `application`: casos d'ús com a **services singleton** injectats amb `Depends` ([[0017-injeccio-de-dependencies-i-services-singleton]]); orquestren el domini a través dels ports.
- `infrastructure`: tot el que toca l'exterior: endpoints, WebSockets, persistència, Redis, clients externs i *exception handlers* ([[0018-errors-rfc-9457-amb-codis-estables]]). Implementa els ports del domini.

Les dependències només van cap endins (`infrastructure` → `application` → `domain`) i cada capa s'organitza per mòduls (`app/<capa>/<mòdul>/`).

**Mòduls de funcionalitat independents:** dues funcionalitats (p. ex. `auth` i `users`) no s'importen entre elles a `domain` ni a `application`. El que comparteixen viu als mòduls `shared`: `AccountStatus` a `app/domain/shared/account.py` i els codis d'error comuns (`INVALID_SESSION`, `ACCOUNT_SUSPENDED`, `ACCOUNT_DELETED`) a `app/application/shared/error_codes.py`. A `infrastructure`, `main.py` les compon (p. ex. entrega `UserAccountGateway` a `build_auth_service`), de manera que `auth` no depèn de `users`; la regla la vigila `backend/tests/architecture`.

Errors: la jerarquia viu als mòduls `shared` de cada capa (`DomainError` i subclasses a `app/domain/shared/`; `ApplicationError`, `UnauthorizedError`, `ForbiddenError` i `ExternalServiceError` a `app/application/shared/`). Només `infrastructure` coneix HTTP: `app/infrastructure/api/` té el middleware `X-Correlation-ID` i els *exception handlers* que els tradueixen a RFC 9457 (vegeu [[0018-errors-rfc-9457-amb-codis-estables]]).

## Planificador

El planificador és un **port** del domini (`JobScheduler`, `app/domain/scheduler/ports.py`) i APScheduler (`AsyncIOScheduler`) un **adaptador** d'infraestructura (`app/infrastructure/scheduler/`), d'acord amb [[0003-un-sol-proces-fastapi]] i [[0016-ports-i-entitats-riques-al-domini]]:

- S'inicia i s'atura al *lifespan* de FastAPI; sense *job store* persistent (les tasques es registren a l'arrencada).
- **Punt únic de registre:** `register_jobs` (`app/infrastructure/scheduler/jobs.py`); les US de cada funcionalitat (purga de 24 h, notificacions) només hi afegeixen línies.
- Cada tasca s'executa amb `max_instances=1` i `coalesce=True`; una excepció es registra (log JSON amb el camp `job`) sense aturar el planificador ni l'API.
- `SCHEDULER_ENABLED` (per defecte `true`) i `SCHEDULER_TIMEZONE` (per defecte `UTC`); l'endpoint de salut informa del component `scheduler` només si està activat.
- Un únic procés d'API: amb diverses rèpliques caldria un bloqueig distribuït amb Redis.
- Els logs de l'API (també els d'uvicorn) s'emeten com a JSON, una línia per registre i amb `correlation_id` quan n'hi ha, des de `app/infrastructure/logging.py` (vegeu [[0022-logging-json-global-amb-stdlib]]). Un fus horari desconegut falla a l'arrencada.

## Patró per a dades externes

Per exemple l'APOD: la primera petició crida l'API externa i desa el resultat a Redis (i a PostgreSQL si cal); les següents es serveixen de la cache. Si l'API externa cau, es retornen les dades en cache en lloc d'un 500 ([[0005-redis-nomes-com-a-cache-lazy]]).

## Stack

Python, FastAPI (async), SQLModel (SQLAlchemy) + Alembic (s'executa a l'entrypoint del contenidor), PostgreSQL 18 + PostGIS, Redis 8, APScheduler, `uv`. Autenticació: Google OAuth2 + PKCE, validació de tokens de Google via JWKS i sessió pròpia (JWT) ([[0008-google-oauth2-pkce-jwks-i-sessio-propia]]). Moderació: microservei Kev-4B amb crida síncrona ([[0007-moderacio-local-kev-4b-sincrona]]).

## Estructura planificada

```
backend/
├── app/
│   ├── domain/<module>/        # rich entities, value objects, errors, ports
│   ├── application/<module>/   # use cases (singleton services)
│   └── infrastructure/<module>/ # API routes, persistence, redis, external clients
├── alembic/               # migrations
├── tests/
│   ├── fixtures/          # recorded NASA/weather responses, geo data
│   ├── factories/         # users, events, messages, achievements
│   └── moderation_dataset/# labeled Kev-4B evaluation set (ca/es/en)
├── pyproject.toml
└── .env.example
```

## Qualitat i proves

`ruff` (complexitat màxima 10), `mypy` strict, SonarQube Cloud. Piràmide de tests ~70 % unitaris / ~30 % integració. Cobertura: domini ≥ 80 %, aplicació ≥ 70 %, codi nou de cada PR ≥ 70 %. Llindars NFR: recursos en cache ≤ 200 ms, consultes de proximitat ≤ 150 ms, endpoints privats rebutgen peticions sense sessió vàlida (401/403). Detalls a [[testing]] i [[qualitat]].

## Enllaços

- [[visio-general]], [[api]], [[postgres]], [[redis]], [[moderation]]
- [[serveis-externs]], [[contracte-spotwise]], [[model-de-domini]]
