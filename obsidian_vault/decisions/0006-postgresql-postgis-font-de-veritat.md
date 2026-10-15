---
titol: "PostgreSQL amb PostGIS com a font de veritat"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-40", "TG-41"]
font: "memòria §3.4.2; backend/README.md; Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, postgres, postgis, alembic, base-de-dades]
---

# ADR-0006 · PostgreSQL amb PostGIS com a font de veritat

## Context

Cal persistir tota la informació que ha de sobreviure entre sessions: usuaris, esdeveniments astronòmics, historial de xat, fites desbloquejades, ràtxes i tokens de dispositiu per a notificacions. A més, la recomanació de zones d'observació i les notificacions basades en ubicació necessiten consultes geoespacials eficients de distància i proximitat (memòria §3.4.2).

## Decisió

PostgreSQL 18 amb l'extensió PostGIS és la font de veritat del sistema. L'esquema es versiona amb Alembic, que genera migracions versionades i reproduïbles a partir dels canvis als models, i les aplica automàticament a l'entrypoint del contenidor abans d'arrencar el servidor. L'accés és async amb SQLModel (SQLAlchemy).

## Conseqüències

### Positives

- Motor relacional madur amb garanties ACID.
- PostGIS permet les consultes geoespacials de proximitat (llindar de test: ≤ 150 ms).
- La base de dades sempre està al dia amb el codi desplegat, sense intervenció manual.

### Negatives (assumides)

- No hi ha còpies de seguretat automàtiques (limitació acceptada del projecte).

## Alternatives descartades

- No consta cap alternativa discutida a les fonts.

## US de Taiga relacionades

- TG-40 (connexió async a PostgreSQL amb SQLModel)
- TG-41 (Alembic)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[postgres]]
- [[arquitectura-fisica]]
- [[model-de-domini]]
- [[testing]]
- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0013-uv-i-pnpm-com-a-gestors-de-dependencies]]
