---
titol: "Sessió 2026-11-07: endpoint WebSocket amb Redis pub/sub (TG-63)"
tipus: sessio
estat: vigent
data: "2026-11-07"
us: ["TG-63"]
font: "US TG-63 de Taiga (tasques #389, #420-#433); backend/app/{domain,application,infrastructure}/realtime"
etiquetes: [sessio, backend, websocket, redis, pubsub, tg-63]
---

# Sessió 2026-11-07 · Endpoint WebSocket amb Redis pub/sub (TG-63)

## Objectiu

Portar la US TG-63 a una branca llesta per a PR: `/api/ws` autenticat pel primer frame, sales sobre Redis pub/sub, heartbeat i revocació de sessió en viu.

## Què s'ha fet

- TDD estricte per tasca (`test:` abans de `feat:`): domini (`Frame`, `FrameType`, canals), `RealtimeSession` a `application`, `RedisSessionStore` que publica a `session-revoked:<sub>`, router `/api/ws` amb config i cablejat a `create_app`.
- Proves amb Redis real (dos clients, revocació, Redis caigut amb un proxy TCP que es pot tallar) i amb un uvicorn real (handshake `101`).
- Revisió d'arquitectura: una troballa ALTA (subscripcions il·limitades) i diverses MITJANES. Corregides: límit de sales (`WS_MAX_ROOMS`), mida de frame (`WS_MAX_FRAME_BYTES`), JSON imbricat, frame binari (1003) i finestra de revocació.
- `websockets==17.4` afegit: sense llibreria WebSocket, uvicorn respon 404 al handshake en producció tot i que els tests amb `TestClient` passen.
- `mutmut==3.8.1` com a dependència de desenvolupament.
- README del backend (ca, es, en), README d'`infra/` i notes del vault.

## Decisions preses

- [[0030-protocol-websocket-i-revocacio-per-pub-sub]] (acceptada): embolcall, codis de tancament, catàleg d'errors i revocació per pub/sub.
- Acusament = eco del mateix `type`; sales a `room:<room>`; heartbeat 1001 sense `pong` amb revalidació de l'access token a cada tic; `message` a sala no subscrita → `NOT_SUBSCRIBED`.
- `RedisSessionStore` publica la revocació sempre, també amb l'índex buit (la descripció de #425 deia que no; desviació coneguda).
- Autorització per sala (`FORBIDDEN`) i rate limit de frames: per a #64 i #65.

## Canvis al vault

- ADR-0030 nova; notes [[redis]], [[api]] i [[nginx-proxy-manager]]; ADR-0003 enllaça l'ADR nova; aquesta sessió.

## Pendent / següents passos

- [ ] PR cap a `develop`, aprovació d'una altra persona, CI i Quality Gate.
- [ ] Acceptar l'ADR-0030 a la PR.

Resolt a la mateixa sessió: el timeout d'enviament sota el `Lock` (`WS_SEND_TIMEOUT_SECONDS`, tanca amb 1013) i el buidat de `_tasks`; el `101` a través d'un NPM real en local (#430); l'avís a #64 i #65 amb el catàleg d'errors i les variables `WS_*`.

## Excepció de mutation testing

`mutmut==3.8.1` no genera cap mutant a `app/domain/realtime/`: només muta cossos de funcions i aquí hi ha constants, un enum, camps de Pydantic i dues funcions que retornen un f-string. El llindar del 70 % s'ha comprovat amb 39 mutants manuals sobre `models.py` (37 morts i 2 equivalents), un 100 % sobre els no equivalents. Aquest script no és al repo.

## US de Taiga

- TG-63
