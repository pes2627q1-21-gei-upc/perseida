---
titol: "Component: redis"
tipus: component
estat: vigent
data: "2026-10-16"
us: ["TG-85", "TG-37", "TG-46", "TG-87"]
font: "infra/README.md, backend/README.md, memòria §3.4.2, .env.example; Taiga: backlog (llistat de US, 2026-10-07); Taiga TG-87 (2026-10-16)"
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

Variables de `.env.example`: `REDIS_HOST`, `REDIS_PORT` (el backend construeix `redis://host:port`) i `CACHE_DEFAULT_TTL_SECONDS` (TTL per defecte, 3600 s). Veure `.env.example`.

## Ports i adaptadors

- Ports al domini (`app/domain/shared/ports.py`), seguint [[0016-ports-i-entitats-riques-al-domini]]: `Cache` (`get`, `set` amb `ttl_seconds` opcional per clau) i `PubSub` (`publish`, `subscribe`).
- Adaptadors a `app/infrastructure/cache/` (`RedisCache`, `RedisPubSub`); el client es crea i es tanca al `lifespan` ([[0017-injeccio-de-dependencies-i-services-singleton]]).
- Cache lazy: `get_or_load` (`app/application/shared/cache.py`). Si Redis cau, `RedisCache` registra un avís i actua com una fallada: es torna a la font, sense HTTP 500.
- Pub/sub: si Redis falla, `ExternalServiceError` amb el codi `PUBSUB_UNAVAILABLE` (503), segons [[0018-errors-rfc-9457-amb-codis-estables]].

## Convenció de claus

Qui crida fa servir `<domini>:<id>` i `RedisCache` ho desa com `cache:<domini>:<id>`, p. ex. `cache:apod:2026-10-05`. Cada funcionalitat fixa el TTL del seu recurs.

## Decisions relacionades

- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0003-un-sol-proces-fastapi]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-46 (cache APOD)
- TG-87 (Redis)

## Estat d'implementació

Client, ports, cache lazy i pub/sub implementats al backend (TG-87), amb tests d'integració contra Redis real. Pendent: el servei `cache` al Docker Compose (TG-37).

## Enllaços

- [[arquitectura-fisica]], [[backend-hexagonal]], [[serveis-externs]]
- [[api]], [[postgres]]
