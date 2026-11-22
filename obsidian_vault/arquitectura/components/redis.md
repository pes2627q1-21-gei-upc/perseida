---
titol: "Component: redis"
tipus: component
estat: vigent
data: "2026-11-21"
us: ["TG-85", "TG-37", "TG-44", "TG-46", "TG-87", "TG-143", "TG-63", "TG-49", "TG-64", "TG-654", "TG-470", "TG-362"]
font: "infra/README.md, backend/README.md, memòria §3.4.2, .env.example; Taiga: backlog (llistat de US, 2026-10-07); Taiga TG-87 (2026-10-16); Taiga TG-46 (2026-10-22); Taiga TG-143 (2026-10-22); TG-362 (tasca TG-381, review de la PR #131, 2026-11-21)"
etiquetes: [component, redis, cache, pubsub]
---

# redis

## Responsabilitat

Cache amb TTL i mecanisme publish/subscribe per distribuir missatges del xat entre connexions WebSocket. **No guarda res de manera definitiva**: si es perdés el contingut, es reconstruiria amb la següent petició, perquè tot allò important ja és a [[postgres]]. Patró lazy: la primera petició crida l'API externa i en desa el resultat; les següents el serveixen de la cache (p. ex. l'APOD).

## Tecnologia i versió

Redis 8 (versió fixada).

## Interfícies

- Qui el crida: [[api]]. El healthcheck hi fa `PING` amb un límit de 2 s: si Redis és caigut, `components.redis` és `down` però `status` continua `ok`, perquè l'app funciona sense cache (TG-49).
- A qui crida: ningú.

## Configuració

Variables de `.env.example`: `REDIS_HOST` i `REDIS_PORT` (el backend construeix `redis://host:port/db`). Opcionals, amb valor per defecte al codi i fora del `.env.example` de l'arrel (no cal donar-les d'alta a GitHub Actions): `REDIS_DB` (base de dades lògica, 0..15, per defecte 0; l'app fa servir la 0), `CACHE_DEFAULT_TTL_SECONDS` (TTL per defecte, 3600 s) i `REDIS_SOCKET_TIMEOUT_SECONDS` (timeout de connexió i de socket, 2 s; si Redis es penja, la cache respon com un miss en lloc de bloquejar la petició). Veure `backend/.env.example`.

Tests (TG-362): fan servir els índexs 1..15, un per worker de pytest-xdist (`15 - N`; la 15 sense xdist), i **l'índex 0 no es buida mai**. Detall a [[testing]].

## Ports i adaptadors

- Ports al domini (`app/domain/shared/ports.py`), seguint [[0016-ports-i-entitats-riques-al-domini]]: `Cache` (`get`, `set` amb `ttl_seconds` opcional per clau) i `PubSub` (`publish`, `subscribe`).
- Adaptadors a `app/infrastructure/cache/` (`RedisCache`, `RedisPubSub`); el client es crea i es tanca al `lifespan` ([[0017-injeccio-de-dependencies-i-services-singleton]]).
- Cache lazy: `get_or_load` (`app/application/shared/cache.py`). Si Redis cau, `RedisCache` registra un avís i actua com una fallada: es torna a la font, sense HTTP 500.
- Pub/sub: si Redis falla, `ExternalServiceError` amb el codi `PUBSUB_UNAVAILABLE` (503), segons [[0018-errors-rfc-9457-amb-codis-estables]].
- Sessions (TG-44): el port `SessionStore` (`save`, `exists`, `delete`) i l'adaptador `RedisSessionStore` (`app/infrastructure/auth/`) desen cada token emès. A diferència de la cache, si Redis falla llança `SESSION_UNAVAILABLE` (503) en lloc de comportar-se com un *miss*.

- WebSocket (TG-63): el pub/sub porta dos tipus de canal, `room:<room>` per a les sales i `session-revoked:<sub>` per a la revocació de sessió. `RedisSessionStore` hi publica `{"sid": ...}` (`null` si es revoquen totes les sessions) i el WebSocket de l'usuari es tanca amb 4401. Si la publicació falla, la revocació del token es manté i el socket es tanca al tic de heartbeat següent. Protocol complet a [[0030-protocol-websocket-i-revocacio-per-pub-sub]].
- WebSocket (TG-459): tercer canal, `room-revoked:<google_sub>` amb `{"room": ...}`; `SubscriptionService` hi publica en esborrar una subscripció i les connexions de l'usuari deixen la sala de xat (`unsubscribe` al client). Si falla, la baixa es manté.

- Xat (TG-64): el missatge d'una sala d'esdeveniment es publica al canal `room:chat:event:<event_id>` (sala `chat:event:<event_id>`) amb un sobre `{from, frame}`; `from` és l'id de la connexió emissora, que no en fa eco. Es publica després de desar a [[postgres]]: si Redis falla, el missatge queda desat i l'error és `PUBSUB_UNAVAILABLE`. El límit de freqüència i la guarda de republicació hi usen les claus de la taula de sota; si Redis no respon, també `PUBSUB_UNAVAILABLE`. Flux a [[chat]] i decisions a [[0033-xat-per-esdeveniment-sala-missatge-i-flux]].

## Convenció de claus

Qui crida fa servir `<domini>:<id>` i `RedisCache` ho desa com `cache:<domini>:<id>`, p. ex. `cache:apod:2026-10-05`. Cada funcionalitat fixa el TTL del seu recurs.

| Clau | TTL | Qui la desa | US |
|---|---|---|---|
| `cache:apod:<AAAA-MM-DD>` | 24 h | `NasaApodProvider`, en llegir de la NASA o de [[postgres]] | TG-46 |
| `cache:apod:today:<AAAA-MM-DD>` | 15 min | `NasaApodProvider`: resultat d'avui mentre la NASA no l'ha publicat (l'últim publicat o el desat) | TG-46 |
| `cache:apod:unavailable:<AAAA-MM-DD\|latest>` | 15 min | `NasaApodProvider`: la crida a la NASA ha fallat i no es repeteix fins que caduqui | TG-46 |
| `ratelimit:chat:<user_id>` | finestra (10 s per defecte, `CHAT_RATE_LIMIT_WINDOW_SECONDS`) | `RedisSendRateLimiter`: comptador de finestra fixa (script Lua `INCR` + `EXPIRE`) dels missatges de xat de l'usuari; el límit per defecte és de 10 (`CHAT_RATE_LIMIT_MESSAGES`) | TG-64 |
| `chat:republished:<author_id>:<client_message_id>` | 10 s | `RedisRepublishGuard`: marca que un missatge s'ha publicat fa poc, perquè un reintent amb la mateixa clau no el torni a difondre | TG-654 |

Les sessions no passen per la cache: es desen com `session:<type>:<jti>` (`type` és `access` o `refresh`) amb un TTL igual a la caducitat del token. Un índex `user_sessions:<sub>` (set amb membres `<sid>:<type>:<jti>` i el TTL del token que viu més) permet revocar el parell d'una sessió o totes les d'un usuari; `delete` i la revocació són transaccions (`MULTI/EXEC`). Si Redis es reinicia, les sessions es perden i els usuaris tornen a iniciar sessió ([[0008-google-oauth2-pkce-jwks-i-sessio-propia]]).

## Decisions relacionades

- [[0005-redis-nomes-com-a-cache-lazy]]
- [[0003-un-sol-proces-fastapi]]
- [[0033-xat-per-esdeveniment-sala-missatge-i-flux]]

## US de Taiga relacionades

- TG-37 (Docker Compose amb cinc serveis)
- TG-46 (cache APOD)
- TG-44 (sessions a Redis)
- TG-87 (Redis)
- TG-143 (verificar el servei Redis del Compose i `REDIS_*`)
- TG-63 (endpoint WebSocket amb Redis pub/sub)
- TG-64 (xat d'esdeveniment: límit de freqüència i canals de sala), TG-654 (guarda de republicació)

## Estat d'implementació

Client, ports, cache lazy i pub/sub implementats al backend (TG-87), amb tests d'integració contra Redis real. Primer ús real: la cache de l'APOD (TG-46), amb un test que comprova que es serveix des de Redis en ≤ 200 ms. El servei és `cache` (`redis:8-alpine`, healthcheck) al Docker Compose de `infra/` (TG-37), amb l'àlies de xarxa `redis`; `REDIS_HOST=cache` als `.env.example` de l'arrel i d'`infra/` (TG-143).

## Enllaços

- [[arquitectura-fisica]], [[backend-hexagonal]], [[serveis-externs]]
- [[api]], [[postgres]], [[chat]]
