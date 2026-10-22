---
titol: "Component: postgres"
tipus: component
estat: vigent
data: "2026-10-22"
us: ["TG-85", "TG-37", "TG-40", "TG-41", "TG-70", "TG-46"]
font: "infra/README.md, backend/README.md, memòria §3.4.2, .env.example; Taiga: backlog (llistat de US, 2026-10-07); Taiga TG-46 (2026-10-22)"
etiquetes: [component, postgres, postgis, base-de-dades]
---

# postgres

## Responsabilitat

Font de veritat del sistema: guarda tot el que ha de sobreviure entre sessions (usuaris, esdeveniments astronòmics, historial de xat, fites desbloquejades, ràtxes i tokens de dispositiu per a notificacions). L'extensió PostGIS permet consultes de proximitat geogràfica per a la recomanació de zones d'observació i les notificacions basades en ubicació. No fa cache (és feina de [[redis]]).

## Tecnologia i versió

PostgreSQL 18 amb l'extensió PostGIS (versió fixada). Dades al volum `pgdata`. Esquema versionat amb Alembic, que aplica l'[[api]] a l'entrypoint.

## Interfícies

- Qui el crida: [[api]] (accés async via SQLModel/SQLAlchemy).
- A qui crida: ningú.

## Configuració

Variables de `.env.example`: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`. Els valors mai es versionen. Veure `.env.example`.

## Taules

| Taula | Contingut | Restriccions | Migració | US |
|---|---|---|---|---|
| `apod` | APOD rebuts de la NASA: `apod_date`, `title`, `explanation`, `media_type`, `media_url`, `copyright` (opcional) | `pk_apod`, `uq_apod_apod_date` (una fila per data) | `8b892a8ae4b4_create_apod` | TG-46 |

El model és `ApodTable` (`app/infrastructure/persistence/apod_table.py`), d'infraestructura; l'entitat `Apod` del domini continua sent Pydantic pura ([[0016-ports-i-entitats-riques-al-domini]]). `SqlApodRepository` desa amb `ON CONFLICT (apod_date) DO NOTHING`: si la data ja hi és, es queda la primera fila. Si la NASA cau, `latest(until)` dona l'últim APOD desat per servir-lo com a APOD d'avui ([[serveis-externs]]).

## Decisions relacionades

- [[0006-postgresql-postgis-font-de-veritat]]
- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0002-docker-compose-en-lloc-de-kubernetes]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-40 (PostgreSQL async amb SQLModel)
- TG-41 (Alembic)
- TG-70 (PostGIS)
- TG-46 (taula `apod`)

## Estat d'implementació

implementat

> [!note] Abast validat
> TG-40 incorpora la configuració, l'engine i les sessions asíncrones de SQLModel/SQLAlchemy. TG-41 incorpora Alembic amb migracions asíncrones i activa PostGIS amb una migració reversible. La prova d'integració amb PostgreSQL/PostGIS real s'ha executat localment i passa; la suite completa passa amb 224 tests i 5 omesos. La validació dins del contenidor queda pendent de la infraestructura de la TG-36.

> [!note]
> No hi ha còpies de seguretat automàtiques (limitació acceptada, vegeu [[arquitectura-fisica]]).

## Enllaços

- [[arquitectura-fisica]], [[model-de-domini]], [[backend-hexagonal]]
- [[api]], [[redis]]
