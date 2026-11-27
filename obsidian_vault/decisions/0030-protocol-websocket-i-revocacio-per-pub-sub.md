---
titol: "ADR-0030: Protocol WebSocket i revocació de sessió per pub/sub"
tipus: adr
estat: acceptada
data: "2026-11-26"
us: ["TG-63", "TG-64", "TG-654", "TG-469"]
font: "US TG-63 de Taiga i tasques #420-#432; backend/app/domain/realtime; backend/app/application/realtime; aprovació de la PR 78; Taiga: issue TG-654 (idempotència i reintents del xat, 2026-11-19); TG-469 (autor {id, name} al missatge del xat, 2026-11-21)"
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

## Actualització (TG-64)

El xat d'esdeveniment (#64) ha afegit un punt d'extensió sense canviar el protocol:

- **Handlers per prefix de sala.** `RealtimeSession` rep un registre `prefix -> RoomHandler` (port a `app/application/realtime/room_handler.py`: `subscribe`, `unsubscribe` i `message`, amb `RoomRequest(sub, conn_id, room)`). El prefix més llarg que encaixa decideix; les sales sense handler es comporten exactament com abans. L'endpoint resol els handlers amb `get_room_handlers` (un joc per connexió), que construeix els services des de `app.state` quan arriba el primer frame de xat. El de xat és `ChatWsHandler` (`chat:event:`) a `infrastructure/chat`.
- **`FORBIDDEN` el donen els handlers de sala.** Subscriure's o enviar un `message` sense estar subscrit a l'esdeveniment és `FORBIDDEN`, i el handler decideix abans del `NOT_SUBSCRIBED` genèric. La connexió continua oberta.
- **`message` exigeix haver-se unit a la sala.** En una sala amb handler, un `message` d'una connexió que no ha fet `subscribe` a la sala rep `NOT_SUBSCRIBED` (409) i no es desa ni es difon res. Qui no pot unir-se continua rebent `FORBIDDEN`: la sessió pregunta primer al handler amb `subscribe` (el mateix permís que per unir-se) i només si l'accepta respon `NOT_SUBSCRIBED`. Després d'un `unsubscribe` també cal tornar a unir-se. Canvi de contracte respecte de la primera versió, on n'hi havia prou amb ser subscriptor de l'esdeveniment.
- **Errors de sala.** Qualsevol `DomainError`/`ApplicationError` d'un handler passa al frame `error` amb el seu `code` si és al catàleg (nous: `CHAT_MESSAGE_EMPTY`, `CHAT_MESSAGE_TOO_LONG`, `CHAT_MESSAGE_REJECTED`, `CHAT_ROOM_NOT_FOUND`, `EVENT_NOT_FOUND`, `DATABASE_UNAVAILABLE`, `INVALID_SESSION`, `ACCOUNT_SUSPENDED`, `ACCOUNT_DELETED`); un `ExternalServiceError` desconegut és `PUBSUB_UNAVAILABLE` i la resta `INTERNAL_ERROR`. El missatge cru de l'excepció no arriba mai al client: el `detail` és el títol HTTP genèric i el text localitzat surt del `code`. Una excepció inesperada d'un handler (un bug) també respon `INTERNAL_ERROR` (amb avís al log) sense tancar la connexió; `ConnectionClosed` i `CancelledError` no s'hi capturen.
- **Ack amb dades.** En una sala amb handler, l'ack d'un `message` porta `payload = {id, sent_at}` del missatge desat (en lloc de `{}`); el difós als altres és el DTO complet (`id`, `room_id`, `author {id, name}`, `text`, `sent_at`; `author.name` és el nom del perfil de qui envia, o `null` si no en té, i el correu no hi surt mai) publicat pel servei, que és qui desa, modera i difon (la sessió no republica).
- **`origin`.** El servei posa l'id de la connexió emissora a `from` del sobre (`ChatService.send_message(..., origin=conn_id)`), de manera que la sessió emissora no fa eco del seu missatge; amb `origin=None` el sobre no té emissor.
- **Sala perduda: `unsubscribe` del servidor.** Quan un usuari es dona de baixa de l'esdeveniment (`DELETE /api/events/{id}/subscription`), `SubscriptionService.unsubscribe(user_id, event_id, *, google_sub)` desa la baixa i després publica `{"room": "chat:event:<id>"}` a `room-revoked:<google_sub>` (via `PubSub`; el router passa `session.sub`). Cada connexió s'hi subscriu en autenticar-se: si és unida a la sala, la deixa i envia al client `{"type":"unsubscribe","room":...,"payload":{}}` sense tancar el socket ni tocar altres sales o usuaris; un `room` absent, no text o no unit s'ignora. Un `message` posterior és `FORBIDDEN` (el handler ja no el deixa unir-se) o `NOT_SUBSCRIBED` en una sala sense permís al handler. Si la publicació falla, la baixa es manté, es registra un avís i no es propaga: la connexió conservaria la unió i el handler ja refusa els seus `message` (`FORBIDDEN`), però continuaria rebent els missatges de la sala fins que es reconnecti. El **catàleg de frames** admet doncs que el servidor enviï `unsubscribe` (a més de l'eco de l'ack). Cada connexió té un canal pub/sub més (`room-revoked:<sub>`): fins a `WS_MAX_ROOMS + 2` per socket.
- El `sub` de la sessió és el `google_sub`: el handler resol l'usuari amb `UserService.get_profile`, com el REST.
- **Client (TG-64, TG-469):** el client tracta l'ack de `subscribe` com el moment en què la subscripció és activa (el servidor només l'envia quan ho és) i posa l'historial al dia amb cada ack (primera unió, reunió i reconnexió), no en obrir la connexió: demanar-lo en obrir podria perdre missatges publicats abans que la subscripció fos activa.

## Actualització (TG-654)

El client reintenta els `message` sense ack (caiguda, connexió morta, timeout) i per això el servidor és idempotent. Canvi de contracte del frame `message` d'una sala de xat:

- **`client_message_id` obligatori.** El `payload` del `message` ha de portar `client_message_id`, un UUID en forma canònica (`str(uuid.UUID(x)) == x`); si falta o no ho és, `VALIDATION_ERROR` abans de cridar el servei. El client el genera una sola vegada per missatge i el reutilitza en tots els reintents (també el `id` del frame). Els clients anteriors a aquest canvi reben `VALIDATION_ERROR` en enviar fins que s'actualitzin.
- **Una clau per autor.** `chat_messages.client_message_id` (`uuid`, `NOT NULL`) amb `UNIQUE(author_id, client_message_id)`. La migració `e7a3c5b9d104` (penja de la d'assoliments `e7a3c5b9d201`) omple amb `gen_random_uuid()` les files existents abans de fer-la `NOT NULL`; el *downgrade* treu l'índex i la columna ([[0025-cd-per-ssh-amb-rollback-i-downgrade-de-migracions]]).
- **Duplicat idèntic** (mateix autor i clau, mateixa sala i mateix text net): no es modera, no compta al límit de freqüència i no es desa; respon l'ack original (`{id, sent_at}`). El servei **torna a publicar** el missatge desat només si no s'ha publicat amb èxit en els últims 10 s (`REPUBLISH_COOLDOWN_SECONDS`): un missatge desat amb `PUBSUB_UNAVAILABLE` no queda marcat i arriba en viu en reintentar-lo, però reenviar la mateixa clau en bucle no fa un *fan-out* per cada frame. El port `RepublishGuard` (`was_published_recently`, `mark_published`) l'implementa `RedisRepublishGuard` amb la clau `chat:republished:<author_id>:<client_message_id>` i un TTL de 10 s; un error en marcar després d'un `publish` reeixit s'ignora amb un avís, i un error en consultar és `PUBSUB_UNAVAILABLE`. Perdre la clau només permet una republicació de més ([[0005-redis-nomes-com-a-cache-lazy]]). El límit és orientatiu sota cursa: consultar i marcar no és atòmic, de manera que dos reintents simultanis fora de la finestra de 10 s poden publicar tots dos; com a molt hi ha un frame duplicat amb el mateix `id`, que el client descarta. Si algun dia cal «màxim un cada 10 s» estricte, es reserva la clau amb `SET NX EX` abans de publicar i s'esborra si la publicació falla. Si el primer `publish` sí que havia arribat i el cooldown ha passat, els altres subscriptors el reben dues vegades amb el mateix `id`: els clients el descarten per `id`.
- **Mateixa clau amb text o sala diferents:** `CHAT_IDEMPOTENCY_CONFLICT` (409, no reintentable) i no es desa res.
- **Cursa de reenviaments.** `add_message` fa `INSERT ... ON CONFLICT (author_id, client_message_id) DO NOTHING RETURNING` i, si no insereix, rellegeix i retorna el desat; el servei publica i respon amb aquest. Si el desat que guanya la cursa té una altra sala o un altre text, el resultat és el mateix 409 que en seqüència (el límit i la moderació ja s'han gastat). Un `id` de PK repetit continua sent un `IntegrityError`.
- **La clau no s'exposa:** el frame que reben els altres subscriptors no porta `client_message_id` (`message.model_dump(exclude={"client_message_id"})`); tampoc l'ack ni el REST.
- **Client** (vegeu [[frontend#Temps real: connexió WebSocket compartida (TG-64)]]): cua de reintents en memòria (tres intents) i `SEND_UNCERTAIN` si no hi ha cap resposta. Una cua persistent que sobrevisqui al tancament de l'app (outbox, [[0011-client-offline-sqlite-last-write-wins]]) queda fora d'abast.

## Actualització (TG-65)

El xat directe afegeix frames i un canal sense canviar l'embolcall:

- **Frames `dm.*`.** El catàleg de `type` admet `dm.send` (client a servidor; ack amb `{id, sent_at}`), `dm.message` (servidor a client, el DTO del missatge) i `dm.typing` (en tots dos sentits, `{conversation_id, is_typing}`, efímer). Els errors són els del catàleg (`VALIDATION_ERROR`, `RATE_LIMITED`, `USER_BLOCKED`, `CONVERSATION_NOT_FOUND`, ...) i la connexió continua oberta.
- **Canal fix per usuari.** Cada connexió s'hi subscriu en autenticar-se a `direct-user:<user_id>`, intern i fora del protocol de sales. Per tant el màxim de canals per socket passa a ser `WS_MAX_ROOMS + 3`: sales, revocació de sessió, revocació de sala i `direct-user`. El límit de sales (`WS_MAX_ROOMS`) no el compta.

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
- Cada `subscribe` obre una connexió pub/sub de Redis pròpia, més la de revocació: fins a `WS_MAX_ROOMS + 2` (22) per socket (revocació de sessió i de sala). Amb `WS_MAX_CONNECTIONS_PER_USER` (3) un sol usuari en pot ocupar fins a 66, i amb molts usuaris es pot arribar al `maxclients` de Redis, que també serveix les sessions ([[0008-google-oauth2-pkce-jwks-i-sessio-propia]]). El límit per usuari ho acota però no ho elimina. Feina futura: una sola connexió pub/sub per socket i un límit global de connexions.
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
