---
titol: "ADR-0030: Protocol WebSocket i revocació de sessió per pub/sub"
tipus: adr
estat: proposada
data: "2026-11-07"
us: ["TG-63"]
font: "US TG-63 de Taiga i tasques #420-#432; backend/app/domain/realtime; backend/app/application/realtime"
etiquetes: [adr, backend, websocket, redis, pubsub, seguretat]
---

# ADR-0030 · Protocol WebSocket i revocació de sessió per pub/sub

## Context

El xat i els esdeveniments en temps real (US #64 i #65) necessiten un endpoint WebSocket dins l'únic procés FastAPI ([[0003-un-sol-proces-fastapi]]), sobre Redis pub/sub ([[0005-redis-nomes-com-a-cache-lazy]]) i autenticat amb la sessió pròpia ([[0008-google-oauth2-pkce-jwks-i-sessio-propia]]). `CurrentSessionDep` fa servir `HTTPBearer`, que no funciona amb WebSocket, i el token no pot anar a la URL perquè acabaria als logs del proxy. Una sessió revocada (logout o suspensió) ha de perdre la connexió a l'instant.

## Decisió

Un endpoint `/api/ws` amb un embolcall JSON únic, un catàleg d'errors compartit i la revocació anunciada pel mateix pub/sub.

**Embolcall.** Tots els frames, en tots dos sentits, són `{type, room?, payload, id}` amb `type` entre `auth`, `subscribe`, `unsubscribe`, `message`, `error`, `ping` i `pong`. `room` valida `^[a-z0-9_-]+(:[a-z0-9_-]+)*$` i té com a màxim 64 caràcters. Un frame il·legible, fora de l'embolcall o amb `type` desconegut rep un frame `error` i la connexió continua oberta.

**Autenticació.** El primer frame és `{"type":"auth","token":"<access token>"}`; el servidor el valida amb `AuthService.authenticate` i respon l'eco `{"type":"auth","payload":{}}` (cap tipus `ready`). Qualsevol altre primer frame, un token no vàlid o el timeout (`WS_AUTH_TIMEOUT_SECONDS`) tanquen amb 4401. El token no és mai a la URL ni als logs.

**Acusaments.** `subscribe`, `unsubscribe` i `message` es responen amb l'eco del mateix `type`, `room` i `id` amb `payload: {}`. L'emissor d'un `message` no el rep pel pub/sub; un `message` a una sala no subscrita és l'error `NOT_SUBSCRIBED`.

**Canals Redis.** Les sales viuen a `room:<room>`, de manera que cap sala no pot coincidir amb `session-revoked:<sub>`. Cada missatge publicat porta l'identificador de la connexió emissora per descartar-lo a l'origen.

**Heartbeat.** El servidor envia `ping` cada `WS_HEARTBEAT_SECONDS`; sense `pong` al tic següent, tanca amb 1001. En cada tic revalida l'access token amb `SessionStore.exists`: caducat o revocat tanca amb 4401.

**Revocació.** `SessionStore` publica a `session-revoked:<sub>` (via el port `PubSub`) un JSON amb el `sid` revocat, o `null` per a `revoke_all`. El WebSocket s'hi subscriu en autenticar-se i tanca amb 4401 si el `sid` és el seu o és `null`. Si la publicació falla, la revocació del token es manté, es registra un avís i l'error no es propaga: el WebSocket es tancarà a la revalidació següent.

**Codis de tancament.** 4401 sessió no autenticada, revocada o caducada; 1013 Redis cau a mitja connexió; 1011 error intern; 1001 heartbeat sense resposta.

**Catàleg d'errors.** El frame `error` porta un `payload` RFC 9457 (`type`, `title`, `status`, `detail`, `code`) amb codis estables ([[0018-errors-rfc-9457-amb-codis-estables]]): `VALIDATION_ERROR`, `UNKNOWN_FRAME_TYPE`, `NOT_SUBSCRIBED`, `PUBSUB_UNAVAILABLE`, `INTERNAL_ERROR`, `FORBIDDEN` i `RATE_LIMITED`. Els reutilitzen #64 i #65, i qualsevol canvi s'ha de comunicar a aquestes US.

**Servidor.** uvicorn només accepta el handshake si hi ha una llibreria WebSocket instal·lada; sense ella respon 404 encara que els tests amb `TestClient` passin. Es fixa `websockets==17.4` a `backend/pyproject.toml` i un test d'integració comprova el `101` contra un uvicorn real.

## Conseqüències

### Positives

- Cap mecanisme de revocació nou: s'aprofiten l'índex `user_sessions:<sub>`, el `sid` i el port `PubSub`.
- Un sol contracte per a tots els tipus de sala; #64 i #65 només afegeixen sales.
- El domini i l'aplicació no importen FastAPI ni Redis.

### Negatives (assumides)

- Si Redis cau, la revocació en viu no arriba i el tancament depèn del heartbeat (com a màxim `WS_HEARTBEAT_SECONDS`).
- Sense `message` persistit ni garantia d'entrega: els missatges publicats mentre un client és desconnectat es perden.

## Alternatives descartades

- Token a la query string: acaba als logs del proxy i de l'aplicació.
- `Authorization` al handshake: els navegadors i React Native Web no permeten capçaleres als WebSocket.
- Revocació per sondeig periòdic només: la sessió revocada duraria fins al tic següent.

## US de Taiga relacionades

- TG-63

## Enllaços

[[0003-un-sol-proces-fastapi]] · [[0005-redis-nomes-com-a-cache-lazy]] · [[0008-google-oauth2-pkce-jwks-i-sessio-propia]] · [[0018-errors-rfc-9457-amb-codis-estables]] · [[redis]] · [[api]] · [[nginx-proxy-manager]]
