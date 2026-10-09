---
titol: "Redis només com a cache lazy i pub/sub"
tipus: adr
estat: acceptada
data: "2026-10-07"
us: ["TG-85", "TG-87", "TG-46", "TG-63"]
font: "memòria §3.4.1, §3.4.2; incepció 2 §6 (02-10-2026); Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [adr, redis, cache, pubsub]
---

# ADR-0005 · Redis només com a cache lazy i pub/sub

## Context

Algunes dades depenen d'APIs externes i no canvien constantment (per exemple l'APOD de la NASA). Cal també distribuir els missatges del xat entre connexions WebSocket dins del mateix procés (memòria §3.4.1 i §3.4.2).

## Decisió

Redis 8 actua exclusivament com a memòria cau amb TTL i com a mecanisme de publish/subscribe del xat. S'aplica el patró lazy: la primera petició que arriba fa la crida externa i en desa el resultat a Redis, i les següents el serveixen directament de la cau. Res del que hi ha a Redis és imprescindible; tot el que importa es persisteix a PostgreSQL.

## Conseqüències

### Positives

- S'elimina la necessitat de cues de tasques i de processos en segon pla per precarregar dades.
- Si es perdés el contingut de Redis, es reconstruiria automàticament amb la petició següent que el necessités.
- Si l'API externa cau, es retornen les dades en cache en lloc d'un HTTP 500.

### Negatives (assumides)

- No consten a les fonts.

## Alternatives descartades

- Cues de tasques i processos de precàrrega de dades en segon pla: no calen amb el patró lazy; la incepció 2 diu que el patró ha permès prescindir-ne.

## US de Taiga relacionades

- TG-87 (configuració de Redis com a cache amb TTL, patró lazy, i pub/sub)
- TG-46 (obtenció sota demanda de l'APOD amb cache a Redis i persistència a PostgreSQL)
- TG-63 (endpoint WebSocket integrat a l'API amb Redis pub/sub)
- TG-85 (vault d'Obsidian)

## Enllaços

- [[redis]]
- [[postgres]]
- [[backend-hexagonal]]
- [[serveis-externs]]
- [[0003-un-sol-proces-fastapi]]
- [[0006-postgresql-postgis-font-de-veritat]]
