---
titol: "Component: postgres"
tipus: component
estat: vigent
data: "2026-11-26"
us: ["TG-65", "TG-85", "TG-37", "TG-40", "TG-41", "TG-70", "TG-46", "TG-64", "TG-654"]
font: "infra/README.md, backend/README.md, memòria §3.4.2, .env.example; Taiga: backlog (llistat de US, 2026-10-07); Taiga TG-46 (2026-10-22); TG-64, tasques #448 i #450 (persistència del xat, 2026-11-18); TG-654 (client_message_id, 2026-11-19)"
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
| `apod` | APOD rebuts de la NASA: `id` (UUIDv7), `apod_date`, `title`, `explanation`, `media_type`, `media_url`, `copyright` (opcional) | `pk_apod`, `uq_apod_apod_date` (una fila per data), `ck_apod_media_type` (`image`/`video`) | `8b892a8ae4b4_create_apod` | TG-46 |
| `event_chat_rooms` | Sala de xat d'un esdeveniment: `id` (UUIDv7), `event_id`, `created_at` | `uq_event_chat_rooms_event_id` (una sala per esdeveniment), FK a `astronomical_events` `ON DELETE CASCADE` | `b3e9a6d2c581_create_chat` | TG-450 |
| `chat_messages` | Missatges de les sales: `id` (UUIDv7), `room_id`, `author_id`, `text`, `sent_at`, `client_message_id` | FK a la sala i a `users` `ON DELETE CASCADE`, `ck_chat_messages_text_length`, índex `(room_id, sent_at DESC, id DESC)`, `UNIQUE(author_id, client_message_id)` | `b3e9a6d2c581_create_chat`, `e7a3c5b9d104_add_chat_client_message_id` | TG-450, TG-654 |
| `direct_conversations` | Conversa entre dues persones: parella ordenada `user_a_id < user_b_id`, `created_at`, marques de lectura | `pair_ordered`, `uq_direct_conversations_pair`, índex per `user_b_id` | `a65d1ec70001_direct_chat` | TG-65 |
| `direct_messages` | Missatges directes: `id`, `conversation_id`, `sender_id`, `text`, `sent_at`, `client_message_id` | `text_not_empty`, `UNIQUE(sender_id, client_message_id)`, índex d'historial per conversa | `a65d1ec70001_direct_chat` | TG-65 |
| `user_blocks` | Bloquejos direccionals entre usuaris | `not_self` | `a65d1ec70001_direct_chat` | TG-65 |
| `direct_message_outbox` | Intent de difusió durable, una fila per missatge: `message_id`, `origin`, `delivered_at`, `attempts` | PK i FK a `direct_messages` `ON DELETE CASCADE`; índex parcial `ix_direct_message_outbox_pending (attempts, message_id) WHERE delivered_at IS NULL` | `a65d1ec70002_direct_outbox`, `a65d1ec70003_outbox_attempts` | TG-65, [[0034-outbox-xat-directe]] |

Segueix [[0023-convencions-del-model-de-dades]]: clau `uuid` generada per `uuidv7()` i `media_type` com a `VARCHAR` amb `CHECK`. El model és `ApodTable` (`app/infrastructure/persistence/apod_table.py`), d'infraestructura; l'entitat `Apod` del domini continua sent Pydantic pura ([[0016-ports-i-entitats-riques-al-domini]]). `SqlApodRepository` desa amb `ON CONFLICT (apod_date) DO NOTHING`: si la data ja hi és, es queda la primera fila. Si la NASA cau, `latest(until)` dona l'últim APOD desat per servir-lo com a APOD d'avui ([[serveis-externs]]).

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
- TG-448 i TG-450 (taules del xat d'esdeveniment, [[model-de-domini#Persistència del xat]] i [[chat]])

## Estat d'implementació

implementat

> [!note] Abast validat
> TG-40 incorpora la configuració, l'engine i les sessions asíncrones de SQLModel/SQLAlchemy. TG-41 incorpora Alembic amb migracions asíncrones i activa PostGIS amb una migració reversible. La prova d'integració amb PostgreSQL/PostGIS real s'ha executat localment i passa; la suite completa passa amb 224 tests i 5 omesos. La validació dins del contenidor queda pendent de la infraestructura de la TG-36.

> [!note]
> No hi ha còpies de seguretat automàtiques (limitació acceptada, vegeu [[arquitectura-fisica]]).

## Enllaços

- [[arquitectura-fisica]], [[model-de-domini]], [[backend-hexagonal]]
- [[api]], [[redis]]
