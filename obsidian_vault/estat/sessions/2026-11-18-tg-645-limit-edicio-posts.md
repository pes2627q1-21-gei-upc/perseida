---
titol: "Sessió 2026-11-18 · Límit d'edició i esborrat de publicacions"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-645", "TG-628", "TG-643"]
font: "issue TG-645 a Taiga"
etiquetes: [sessio, backend, seguretat, posts]
---

# Sessió 2026-11-18 · Límit d'edició i esborrat de publicacions

## Objectiu

Posar un límit de peticions a `PATCH` i `DELETE /api/posts/{post_id}`, que no en tenien perquè el proxy només limita `/api/events/` (issue TG-645, seguiment de TG-628).

## Què s'ha fet

- Tests primer (TDD): service, router (429 i OpenAPI), configuració, cablejat de dependències i integració amb Redis del prefix de clau.
- `PostService.update_post` i `delete_post` comproven el límit per usuària abans de buscar la publicació, amb el port nou `PostWriteRateLimiter`, i responen 429 `RATE_LIMITED` en `application/problem+json`.
- Es reutilitza el `RedisSendRateLimiter` del xat amb un `key_prefix` nou (`ratelimit:posts:{user_id}`). `PostsSettings`: `POSTS_WRITE_RATE_LIMIT=10` i `POSTS_WRITE_RATE_LIMIT_WINDOW_SECONDS=60`.
- `RateLimitedError` i `RATE_LIMITED` passen a `app.application.shared` (el xat i el realtime els reexporten), perquè el contracte d'import-linter de les publicacions no deixa importar el xat.
- Corregit el text del 429 del proxy a l'OpenAPI de les publicacions (600 per minut entre tots els clients, ràfega de 100, TG-643). Còpia d'OpenAPI i tipus del frontend regenerats.
- ruff, mypy, lint-imports, 1459 tests (unitaris i integració del limitador) i diff-cover al 100 % en local. Revisió d'arquitectura sense troballes crítiques ni altes.

## Decisions preses

Aprovades per la persona; cap ADR nova:

- El límit va a l'API i no al proxy: amb el NAT de la UPC, un límit per IP hi seria global (TG-643).
- Un sol comptador per a `PATCH` i `DELETE`, de 10 per finestra fixa de 60 s.
- Si [[redis]] no respon, es deixa passar la petició amb un avís als logs ([[0005-redis-nomes-com-a-cache-lazy]]).

## Canvis al vault

- [[api]]: secció de publicacions d'esdeveniment.
- Aquesta sessió.

## Pendent / següents passos

- [ ] PR cap a `develop` i revisió d'una persona que no sigui l'autora.
- [ ] Seguiment opcional: moure `RedisSendRateLimiter` a `infrastructure/shared` (ara `infrastructure.posts` importa `infrastructure.chat`), i `Retry-After` al 429 de l'API.
- [ ] Límit per usuària de `POST /api/events/{event_id}/posts`, a coordinar amb la moderació (TG-81).

## US de Taiga

- TG-645
