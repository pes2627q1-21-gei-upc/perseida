---
titol: "Component: redis"
tipus: component
estat: vigent
data: "2026-10-07"
us: ["TG-85", "TG-37", "TG-46", "TG-87"]
font: "infra/README.md, backend/README.md, memòria §3.4.2, .env.example"
etiquetes: [component, redis, cache, pubsub]
---

# redis

## Responsabilitat

Cache amb TTL i mecanisme publish/subscribe per distribuir missatges del xat entre connexions WebSocket. **No guarda res de manera definitiva**: si es perdés el contingut, es reconstruiria amb la següent petició, perquè tot allò important ja és a [[postgres]]. Patró lazy: la primera petició crida l'API externa i en desa el resultat; les següents el serveixen de la cache (p. ex. l'APOD).

## Tecnologia i versió

Redis 8 (versió fixada).

## Interfícies

- Qui el crida: [[api]].
- A qui crida: ningú.

## Configuració

Variables de `.env.example`: `REDIS_HOST`, `REDIS_PORT`. Veure `.env.example`.

## Decisions relacionades

- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0003-un-sol-proces-fastapi]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-46 (cache APOD)
- TG-87 (Redis)

## Estat d'implementació

planificat

## Enllaços

- [[arquitectura-fisica]], [[backend-hexagonal]], [[serveis-externs]]
- [[api]], [[postgres]]
