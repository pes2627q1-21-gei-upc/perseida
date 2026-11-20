---
titol: "ADR-0033: Xat per esdeveniment, model sala-missatge i flux d'enviament"
tipus: adr
estat: proposada
data: "2026-11-20"
us: ["TG-64", "TG-654", "TG-469", "TG-470"]
font: "US TG-64 de Taiga i tasca TG-470; codi a backend/app/{domain,application,infrastructure}/chat; ADR-0030 (actualitzacions TG-64 i TG-654); TG-469 (autor al DTO)"
etiquetes: [adr, backend, xat, websocket, redis, postgres, moderacio]
---

# ADR-0033 · Xat per esdeveniment, model sala-missatge i flux d'enviament

## Context

La US #64 demana un xat per a cada esdeveniment astronòmic, en temps real, només per a qui el segueix, amb historial i moderació abans de difondre ([[0007-moderacio-local-kev-4b-sincrona]]). El protocol WebSocket i la revocació per pub/sub ja són decidits ([[0030-protocol-websocket-i-revocacio-per-pub-sub]]); falten el model de dades, les regles d'accés i l'ordre en què un missatge travessa validació, moderació, base de dades i Redis. Hi ha tres restriccions: PostgreSQL és la font de veritat i Redis no guarda res definitiu ([[0006-postgresql-postgis-font-de-veritat]], [[0005-redis-nomes-com-a-cache-lazy]]); el client reintenta els enviaments que no reben ack; i el moderador Kev-4B (#81) encara no existeix.

## Decisió

**Model sala-missatge.** Una taula `event_chat_rooms` amb `event_id` com a FK real a `astronomical_events` (`ON DELETE CASCADE`) i `UNIQUE`: cada esdeveniment té 0..1 sala, que es crea sota demanda. `chat_messages` penja de la sala i de l'autor (`users`), tots dos `ON DELETE CASCADE`. Els missatges són immutables (cap edició ni esborrat). Les claus són UUIDv7 i `sent_at` és UTC i el posa el servidor ([[0023-convencions-del-model-de-dades]]). Detall a [[model-de-domini#Persistència del xat]].

**Accés només per a subscriptors.** Tota operació (obrir la sala, historial, subscriure's pel WebSocket, enviar) comprova primer que l'esdeveniment existeix (`EVENT_NOT_FOUND`, 404) i després que l'usuari hi està subscrit (`FORBIDDEN`, 403, port `EventSubscriptions`); només llavors es crea la sala. Una baixa de l'esdeveniment treu la usuària de la sala en viu (canal `room-revoked:<google_sub>`, [[0030-protocol-websocket-i-revocacio-per-pub-sub]]).

**Flux d'enviament.** `ChatService.send_message` fa, en aquest ordre, i s'atura al primer error (res del que ve després s'executa):

1. Validar: esdeveniment i subscripció, i el text net (retallat i sense caràcters de control ni invisibles perillosos; buit és `CHAT_MESSAGE_EMPTY`, de més de 1000 caràcters `CHAT_MESSAGE_TOO_LONG`; mai es trunca).
2. Idempotència: si l'autor ja ha desat un missatge amb el mateix `client_message_id`, no es limita, no es modera i no es desa de nou (vegeu sota).
3. Límit de freqüència per usuari (`RATE_LIMITED`, 429).
4. Moderar amb el port `MessageModerator`; si no s'aprova, `CHAT_MESSAGE_REJECTED` (422) i no es desa res.
5. Desar a PostgreSQL (`INSERT ... ON CONFLICT (author_id, client_message_id) DO NOTHING` i relectura).
6. Publicar a Redis (canal `room:chat:event:<event_id>`, sobre `{from, frame}` amb l'id de la connexió emissora perquè no es faci eco a si mateixa).
7. Acusar l'emissor amb `{id, sent_at}` del missatge desat.

**Desar abans de publicar.** Si la publicació falla, el missatge ja és a PostgreSQL (surt a l'historial) i el servei respon `PUBSUB_UNAVAILABLE` (503). Així mai es difon un missatge que no s'hagi desat, i una caiguda de Redis no el fa perdre. No hi ha atomicitat entre PostgreSQL i Redis; el reintent amb la mateixa clau el torna a publicar.

**Idempotència per `client_message_id` (TG-654).** El client genera un UUID per missatge i el reutilitza en els reintents. `UNIQUE(author_id, client_message_id)` el fa complir a la base de dades, també sota cursa. Un duplicat idèntic (mateixa sala i mateix text net) respon l'ack original; es torna a publicar només si no s'ha publicat amb èxit en els últims 10 s (`RepublishGuard`, clau Redis `chat:republished:<author_id>:<client_message_id>`), de manera que un missatge desat amb `PUBSUB_UNAVAILABLE` arriba en viu en reintentar-lo però un bucle de reintents no fa *fan-out*. La mateixa clau amb una altra sala o un altre text és `CHAT_IDEMPOTENCY_CONFLICT` (409). La clau no s'exposa als altres subscriptors ni al REST.

**Historial amb cursor opac.** `GET /api/events/{id}/chat/messages` retorna del més nou al més antic, amb `limit` d'1 a 50 (per defecte 50; si no, `CHAT_INVALID_LIMIT`) i `before`, el `next_cursor` de la pàgina anterior. El cursor és la clau `(sent_at, id)` codificada en base64url, estricta (un cursor mal format és `CHAT_INVALID_CURSOR`) i opac per al client. La consulta demana `limit + 1` files i l'índex `(room_id, sent_at DESC, id DESC)` serveix filtre i ordre; no hi ha `OFFSET`.

**Límit de freqüència a Redis.** `RedisSendRateLimiter`: comptador de finestra fixa atòmic (script Lua `INCR` + `EXPIRE`) a `ratelimit:chat:<user_id>`, compartit entre processos. Per defecte, 10 missatges cada 10 s; es configura amb `CHAT_RATE_LIMIT_MESSAGES` i `CHAT_RATE_LIMIT_WINDOW_SECONDS`. `CHAT_MESSAGE_MAX_LENGTH` (per defecte i màxim 1000) permet abaixar la longitud permesa. Si Redis no respon, `PUBSUB_UNAVAILABLE`.

**Moderador provisional.** Mentre #81 no existeix, el port `MessageModerator` té un únic adaptador, `ApproveAllModerator`, que aprova tot. #81 el substitueix per un adaptador de Kev-4B ([[moderation]]) sense tocar el servei ni els endpoints: només canvia el cablejat a `infrastructure/chat/dependencies.py`.

**Autor als DTO (TG-469).** Cada missatge porta `author {id, name}`. `name` surt de `users.display_name` (el nom del perfil) i pot ser `null`; mai és el correu. El repositori l'obté amb un `JOIN` a `users` (una sola consulta per pàgina, mai una per missatge).

**Llista de sales.** `GET /api/chat/rooms` retorna les sales dels esdeveniments subscrits amb el darrer missatge. L'esdeveniment sense sala encara no hi surt: el client construeix la llista creuant les seves subscripcions (`GET /api/me/subscriptions`) amb aquestes sales, de manera que la subscripció decideix què es mostra i la sala es crea en obrir-la (`PUT /api/events/{id}/chat/room`, idempotent).

## Conseqüències

### Positives

- Un esdeveniment, una sala: la integritat la dona la base de dades (FK + `UNIQUE`), no el codi.
- Cap missatge difós sense desar; reintents segurs i sense duplicats a l'historial.
- Paginació estable i barata amb l'índex de l'historial, també si arriben missatges nous mentre es pagina.
- El servei es desenvolupa amb TDD estricte ([[0028-tdd-estricte-i-politica-de-testing-avancada]]): el test en vermell va en un commit `test:` abans del `feat:`.
- La moderació real (#81) entra per un port ja existent, sense canviar el flux.

### Negatives (assumides)

- Sense moderació real fins a #81: tots els missatges s'aproven.
- No hi ha atomicitat PostgreSQL-Redis; un missatge desat amb `PUBSUB_UNAVAILABLE` pot arribar als altres només en un reintent, o mai si l'emissor no reintenta (però surt a l'historial). Un subscriptor pot rebre un duplicat amb el mateix `id`, que el client descarta.
- El límit de freqüència és de finestra fixa: a la frontera entre dues finestres es poden enviar fins a dues rafegades seguides.
- Els missatges són immutables i no hi ha esborrat per l'autor; només el cascada en esborrar l'usuari, la sala o l'esdeveniment.
- Cada missatge i cada historial fan consultes a `event_subscriptions`; el cost és baix amb l'índex però no nul.

## Alternatives descartades

- Una sala per esdeveniment sense taula pròpia (només `event_id` als missatges): no permet la llista de sales amb el darrer missatge sense agrupar tot l'historial ni modelar l'estat de la sala.
- Claus polimòrfiques (`room_id` sense FK, per reutilitzar-les al xat directe de #65): perd la integritat referencial; el xat directe tindrà el seu propi model.
- Paginació per `OFFSET`: cost lineal i resultats inestables si arriben missatges mentre es pagina.
- Publicar abans de desar: una fallada de PostgreSQL deixaria missatges difosos que no consten a l'historial.
- Moderar després de difondre: contradiu [[0007-moderacio-local-kev-4b-sincrona]].
- Idempotència només al client (deduplicar per `id`): no evita files repetides quan un ack es perd.
- Rate limit en memòria per procés: no es comparteix entre processos; Redis ja és al sistema i el servei ja n'depèn per al pub/sub.

## US de Taiga relacionades

- TG-64 (xat d'esdeveniment), TG-654 (idempotència i reintents), TG-469 (pantalles i autor als DTO), TG-470 (documentació)

## Enllaços

[[0004-arquitectura-hexagonal-i-tdd-al-domini]] · [[0005-redis-nomes-com-a-cache-lazy]] · [[0006-postgresql-postgis-font-de-veritat]] · [[0018-errors-rfc-9457-amb-codis-estables]] · [[0023-convencions-del-model-de-dades]] · [[0028-tdd-estricte-i-politica-de-testing-avancada]] · [[0030-protocol-websocket-i-revocacio-per-pub-sub]] · [[chat]] · [[model-de-domini]] · [[redis]] · [[moderation]] · [[api]]
