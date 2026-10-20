---
titol: "Component: redis"
tipus: component
estat: vigent
data: "2026-10-20"
us: ["TG-85", "TG-37", "TG-44", "TG-46", "TG-87"]
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

Variables de `.env.example`: `REDIS_HOST` i `REDIS_PORT` (el backend construeix `redis://host:port`). Opcionals, amb valor per defecte al codi i fora del `.env.example` de l'arrel (no cal donar-les d'alta a GitHub Actions): `CACHE_DEFAULT_TTL_SECONDS` (TTL per defecte, 3600 s) i `REDIS_SOCKET_TIMEOUT_SECONDS` (timeout de connexió i de socket, 2 s; si Redis es penja, la cache respon com un miss en lloc de bloquejar la petició). Veure `backend/.env.example`.

## Ports i adaptadors

- Ports al domini (`app/domain/shared/ports.py`), seguint [[0016-ports-i-entitats-riques-al-domini]]: `Cache` (`get`, `set` amb `ttl_seconds` opcional per clau) i `PubSub` (`publish`, `subscribe`).
- Adaptadors a `app/infrastructure/cache/` (`RedisCache`, `RedisPubSub`); el client es crea i es tanca al `lifespan` ([[0017-injeccio-de-dependencies-i-services-singleton]]).
- Cache lazy: `get_or_load` (`app/application/shared/cache.py`). Si Redis cau, `RedisCache` registra un avís i actua com una fallada: es torna a la font, sense HTTP 500.
- Pub/sub: si Redis falla, `ExternalServiceError` amb el codi `PUBSUB_UNAVAILABLE` (503), segons [[0018-errors-rfc-9457-amb-codis-estables]].
- Sessions (TG-44): el port `SessionStore` (`save`, `exists`, `delete`) i l'adaptador `RedisSessionStore` (`app/infrastructure/auth/`) desen cada token emès. A diferència de la cache, si Redis falla llança `SESSION_UNAVAILABLE` (503) en lloc de comportar-se com un *miss*.

## Convenció de claus

Qui crida fa servir `<domini>:<id>` i `RedisCache` ho desa com `cache:<domini>:<id>`, p. ex. `cache:apod:2026-10-05`. Cada funcionalitat fixa el TTL del seu recurs.

Les sessions no passen per la cache: es desen com `session:<type>:<jti>` (`type` és `access` o `refresh`) amb un TTL igual a la caducitat del token. Si Redis es reinicia, les sessions es perden i els usuaris tornen a iniciar sessió ([[0008-google-oauth2-pkce-jwks-i-sessio-propia]]).

## Decisions relacionades

- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0003-un-sol-proces-fastapi]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-46 (cache APOD)
- TG-44 (sessions a Redis)
- TG-87 (Redis)

## Estat d'implementació

Client, ports, cache lazy i pub/sub implementats al backend (TG-87), amb tests d'integració contra Redis real. Pendent: el servei `redis` al Docker Compose (TG-37).

## Enllaços

- [[arquitectura-fisica]], [[backend-hexagonal]], [[serveis-externs]]
- [[api]], [[postgres]]
