---
titol: "TG-87: Redis cache lazy i pub/sub"
tipus: sessio
estat: vigent
data: "2026-10-16"
us: ["TG-87"]
font: "backend/README.md, backend/app/infrastructure/cache, backend/tests; Taiga TG-87"
etiquetes: [sessio, backend, redis, cache, pubsub]
---

# Sessió 2026-10-16 · Redis cache lazy i pub/sub

## Objectiu

Implementar TG-87: Redis com a cache amb TTL (patró lazy) i com a bus pub/sub per al WebSocket, amb ports al domini i adaptadors a infraestructura.

## Què s'ha fet

- `RedisSettings` (`REDIS_HOST`, `REDIS_PORT`, `CACHE_DEFAULT_TTL_SECONDS`) i client async al `lifespan` (TG-144).
- Ports `Cache` i `PubSub`, `RedisCache` amb prefix `cache:` i TTL per defecte o per clau (TG-145).
- `get_or_load` i tolerància a fallades de Redis (TG-146).
- `RedisPubSub` amb publicació i subscripció per canal (TG-147).
- Tests d'integració contra Redis 8 real, que ja és a la CI (TG-148).
- Secció Redis als README de `backend/` (en, ca, es) i actualització de [[redis]] (TG-149).

## Decisions preses

- Cap ADR nova: tot encaixa a [[0005-redis-nomes-com-a-cache-lazy]], [[0016-ports-i-entitats-riques-al-domini]] i [[0017-injeccio-de-dependencies-i-services-singleton]].
- Variables `REDIS_HOST` + `REDIS_PORT` (no una `REDIS_URL`), TTL per defecte de 3600 s, i `redis==8.1.0` ja era a les dependències.
- Codi d'error nou `PUBSUB_UNAVAILABLE` (503), segons [[0018-errors-rfc-9457-amb-codis-estables]]; aprovat per la persona i registrat al catàleg de `gestio-errors` amb textos ca/es/en.

## Canvis al vault

- [[redis]]: ports, convenció de claus i estat d'implementació.

## Pendent / següents passos

- [ ] Servei `cache` (Redis 8, healthcheck) al Docker Compose, de TG-37; el `.env.example` de l'arrel diu `REDIS_HOST=redis` i TG-37 anomena el servei `cache`.
- [ ] TG-143: verificar el servei de Compose quan es fusioni TG-37.
- [ ] Claus i18n ca/es/en de `PUBSUB_UNAVAILABLE` al frontend (el catàleg ho exigeix) quan hi hagi la feina del xat (TG-63).

## US de Taiga

- TG-87
