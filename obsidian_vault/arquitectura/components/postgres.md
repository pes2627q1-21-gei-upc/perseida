---
titol: "Component: postgres"
tipus: component
estat: vigent
data: "2026-11-25"
us: ["TG-85", "TG-37", "TG-40", "TG-41", "TG-70", "TG-46", "TG-64", "TG-654"]
font: "infra/README.md, backend/README.md, memòria §3.4.2, .env.example; Taiga: backlog (llistat de US, 2026-10-07); Taiga TG-46 (2026-10-22); TG-64, tasques #448 i #450 (persistència del xat, 2026-11-18); TG-654 (client_message_id, 2026-11-19); TG-70, tasques #496 i #498 (zones d'observació, 2026-11-25)"
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
| `observation_zones` | Zones d'observació: `id` (UUIDv7), `name`, `latitude`, `longitude`, `created_at`, `updated_at` | `ck_observation_zones_latitude_range`, `ck_observation_zones_longitude_range`, índex GiST `ix_observation_zones_location` sobre `(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography)` (la mateixa expressió que `astronomical_events`, TG-50) | `5b8d2f6e9a14_create_observation_zones` | TG-70 |

Segueix [[0023-convencions-del-model-de-dades]]: clau `uuid` generada per `uuidv7()` i `media_type` com a `VARCHAR` amb `CHECK`. El model és `ApodTable` (`app/infrastructure/persistence/apod_table.py`), d'infraestructura; l'entitat `Apod` del domini continua sent Pydantic pura ([[0016-ports-i-entitats-riques-al-domini]]). `SqlApodRepository` desa amb `ON CONFLICT (apod_date) DO NOTHING`: si la data ja hi és, es queda la primera fila. Si la NASA cau, `latest(until)` dona l'últim APOD desat per servir-lo com a APOD d'avui ([[serveis-externs]]).

## Zones d'observació: càrrega inicial

La taula `observation_zones` es omple amb 9 zones de Catalunya (TG-70, criteri 5). Són al fitxer editable `backend/app/infrastructure/observation_zones/zones.json`, dins d'`app/` perquè el Dockerfile ja el copia a la imatge.

- **Com es carrega:** `backend/entrypoint.sh` executa `python -m app.infrastructure.observation_zones.load_zones` després d'`alembic upgrade head`, a cada arrencada i només si `RUN_MIGRATIONS` no és `false`. La càrrega és idempotent: `INSERT ... ON CONFLICT (id) DO UPDATE` de nom i coordenades. Una migració de seed no serveix, perquè només s'executa una vegada i les zones afegides més endavant al fitxer no arribarien a la BD.
- **Validació:** `read_zones` construeix cada entrada amb les entitats del domini; una edició fora de rang fa fallar la càrrega en lloc de deixar dades brutes. El test `test_zones_file.py` valida el fitxer real (ids uuid7 únics, noms únics, font https, dins de Catalunya).
- **Font:** coordenades de la infotaula de la Viquipèdia en català (CC BY-SA), amb l'URL de cada zona al camp `source_url` del JSON. No hi ha columna de font a la BD.
- **Criteri de selecció:** segell Starlight del Montsec, Pirineu i Aigüestortes, muntanyes de Prades i Montsant, i la ruta d'observatoris de femturisme.cat. Abast: Catalunya.
- **Afegir una zona:** afegeix una entrada al JSON amb un uuid7 nou, `name`, `latitude`, `longitude` i `source_url`, i desplega. Corregir el nom o les coordenades d'una zona existent l'actualitza.
- **Treure una zona del JSON no l'esborra de la BD**, a propòsit, per evitar esborrats accidentals.

> [!warning] Precisió de les coordenades
> Pujalt té només 2 decimals (uns 1 km). Saldes, Prades i La Morera de Montsant són el poble, no el punt d'observació. El Garraf té més contaminació lumínica que la resta.

## Decisions relacionades

- [[0006-postgresql-postgis-font-de-veritat]]
- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0002-docker-compose-en-lloc-de-kubernetes]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-40 (PostgreSQL async amb SQLModel)
- TG-41 (Alembic)
- TG-70 (PostGIS i taula `observation_zones`: `SqlObservationZoneRepository.find_within` filtra amb `ST_DWithin` sobre l'expressió indexada, perquè sigui un `Index Cond`, i ordena per `ST_Distance`; vegeu [[model-de-domini#Zona d'observació (implementat al backend)]])
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
