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

**Codis de tancament.** 4401 sessió no autenticada, revocada o caducada; 1013 Redis cau a mitja connexió; 1011 error intern; 1001 heartbeat sense resposta; 1003 frame binari; 4429 massa connexions simultànies de l'usuari.

**Límits.** Cada connexió admet com a màxim `WS_MAX_ROOMS` sales (20) i frames de com a màxim `WS_MAX_FRAME_BYTES` (65536). Una subscripció a una sala nova passat el límit es respon amb `RATE_LIMITED` sense crear-la (tornar a subscriure's a una sala ja unida no compta). Un frame massa gran és `VALIDATION_ERROR` un cop autenticat, o tanca amb 4401 si és el primer; no es processa. Un JSON massa imbricat (`RecursionError`) es tracta com a JSON invàlid. Després de subscriure's al canal de revocació es torna a comprovar l'access token, per tancar la finestra entre l'autenticació i la subscripció. Un enviament que supera `WS_SEND_TIMEOUT_SECONDS` (5 s) sota el lock d'enviament tanca la connexió amb 1013: un client que no llegeix no pot bloquejar la sessió ni el heartbeat. Cada usuari pot tenir com a màxim `WS_MAX_CONNECTIONS_PER_USER` connexions simultànies (3); la que ho supera, un cop autenticada, es tanca amb 4429 abans de subscriure's a res ni enviar l'eco `auth`, i no ocupa cap lloc. El comptador és en memòria (`ConnectionLimiter`, un sol procés: [[0003-un-sol-proces-fastapi]]) i s'allibera en acabar la sessió per qualsevol motiu. Es rebutja la nova en lloc de tancar la més antiga perquè un client que reconnecta no n'expulsi d'altres i el límit sigui previsible. `RATE_LIMITED` l'emet aquesta US pel límit de sales; `FORBIDDEN` i els permisos per sala els emeten #64 i #65.

**Catàleg d'errors.** El frame `error` porta un `payload` RFC 9457 (`type`, `title`, `status`, `detail`, `code`, `correlation_id`) amb codis estables ([[0018-errors-rfc-9457-amb-codis-estables]]): `VALIDATION_ERROR`, `UNKNOWN_FRAME_TYPE`, `NOT_SUBSCRIBED`, `PUBSUB_UNAVAILABLE`, `INTERNAL_ERROR`, `FORBIDDEN` i `RATE_LIMITED`, amb els textos ca/es/en al catàleg de la skill `gestio-errors`. El `correlation_id` és el de la petició del handshake (`X-Correlation-ID` o generat), igual per a tots els errors d'una connexió i present als logs; el tancament amb 1011 no porta cos, i el seu `correlation_id` queda només al log. Els reutilitzen #64 i #65, i qualsevol canvi s'ha de comunicar a aquestes US.

**Servidor.** uvicorn només accepta el handshake si hi ha una llibreria WebSocket instal·lada; sense ella respon 404 encara que els tests amb `TestClient` passin. Es fixa `websockets==17.4` a `backend/pyproject.toml` i un test d'integració comprova el `101` contra un uvicorn real. L'entrypoint fixa `UVICORN_WS_MAX_SIZE` al valor de `WS_MAX_FRAME_BYTES` (65536 per defecte): uvicorn rebutja els missatges que el superen amb el codi 1009 abans que arribin a l'aplicació.

## Conseqüències

### Positives

- Cap mecanisme de revocació nou: s'aprofiten l'índex `user_sessions:<sub>`, el `sid` i el port `PubSub`.
- Un sol contracte per a tots els tipus de sala; #64 i #65 només afegeixen sales.
- El domini i l'aplicació no importen FastAPI, Starlette ni Redis (contracte d'import-linter).

### Negatives (assumides)

- Si Redis cau, la revocació en viu no arriba i el tancament depèn del heartbeat (com a màxim `WS_HEARTBEAT_SECONDS`).
- Sense `message` persistit ni garantia d'entrega: els missatges publicats mentre un client és desconnectat es perden.
- Mentre #64 i #65 no afegeixin permisos per sala, qualsevol usuari autenticat es pot subscriure i publicar a qualsevol sala amb un nom vàlid (`FORBIDDEN` està definit però encara no s'emet). L'endpoint és infraestructura genèrica, no s'hi han de lligar sales sensibles abans d'aquests permisos.
- Sense límit de freqüència de frames `message` per connexió: només hi ha el límit de mida (`WS_MAX_FRAME_BYTES`) i de sales (`WS_MAX_ROOMS`). El rate limit de frames queda per a #64 i #65.
- Cada `subscribe` obre una connexió pub/sub de Redis pròpia, més la de revocació: fins a `WS_MAX_ROOMS + 1` (21) per socket. Amb `WS_MAX_CONNECTIONS_PER_USER` (3) un sol usuari en pot ocupar fins a 63, i amb molts usuaris es pot arribar al `maxclients` de Redis, que també serveix les sessions ([[0008-google-oauth2-pkce-jwks-i-sessio-propia]]). El límit per usuari ho acota però no ho elimina. Feina futura: una sola connexió pub/sub per socket i un límit global de connexions.
- El límit per usuari és en memòria i per procés: si l'API passés a diverses rèpliques, cada una tindria el seu comptador.
- `mutmut` genera 0 mutants al domini realtime (només hi ha constants de mòdul, cossos de classe i f-strings, que no muta); el llindar del 70 % s'ha comprovat amb 39 mutants manuals (vegeu la nota de sessió i la PR), sense un script reproduïble al repositori.
- En el contenidor, els missatges que superen `WS_MAX_FRAME_BYTES` es tanquen amb 1009 a uvicorn; no reben el frame `VALIDATION_ERROR` ni el tancament 4401 de l'aplicació. Una ordre uvicorn alternativa ha de mantenir aquest límit.

## Alternatives descartades

- Token a la query string: acaba als logs del proxy i de l'aplicació.
- `Authorization` al handshake: els navegadors i React Native Web no permeten capçaleres als WebSocket.
- Revocació per sondeig periòdic només: la sessió revocada duraria fins al tic següent.

## US de Taiga relacionades

- TG-63

## Enllaços

[[0003-un-sol-proces-fastapi]] · [[0005-redis-nomes-com-a-cache-lazy]] · [[0008-google-oauth2-pkce-jwks-i-sessio-propia]] · [[0018-errors-rfc-9457-amb-codis-estables]] · [[redis]] · [[api]] · [[nginx-proxy-manager]]
