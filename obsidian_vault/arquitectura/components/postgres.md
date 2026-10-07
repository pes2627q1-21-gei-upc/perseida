---
titol: "Component: postgres"
tipus: component
estat: vigent
data: "2026-10-07"
us: ["TG-85", "TG-37", "TG-40", "TG-41", "TG-70"]
font: "infra/README.md, backend/README.md, memòria §3.4.2, .env.example; Taiga: backlog (llistat de US, 2026-10-07)"
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

## Decisions relacionades

- [[0006-postgresql-postgis-font-de-veritat]]
- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0002-docker-compose-en-lloc-de-kubernetes]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-40 (PostgreSQL async amb SQLModel)
- TG-41 (Alembic)
- TG-70 (PostGIS)

## Estat d'implementació

planificat

> [!note]
> No hi ha còpies de seguretat automàtiques (limitació acceptada, vegeu [[arquitectura-fisica]]).

## Enllaços

- [[arquitectura-fisica]], [[model-de-domini]], [[backend-hexagonal]]
- [[api]], [[redis]]
