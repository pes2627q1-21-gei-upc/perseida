---
titol: "Sessió 2026-11-19: connexió WebSocket morta, AppState, reintents i idempotència del xat (TG-654)"
tipus: sessio
estat: vigent
data: "2026-11-19"
us: ["TG-654", "TG-64"]
font: "Taiga: issue TG-654 (deute tècnic de la revisió de la PR 116); ADR-0030"
etiquetes: [sessio, frontend, backend, xat, websocket]
---

# Sessió 2026-11-19 · Connexió morta, AppState, reintents i idempotència (TG-654)

## Objectiu

Tancar el deute tècnic de la revisió de la PR 116: el client WebSocket no detectava una connexió morta, no reaccionava a `AppState` i els `send` podien quedar pendents per sempre. La persona va ampliar l'abast als reintents automàtics i a la idempotència al servidor perquè els reintents no dupliquin missatges.

## Què s'ha fet

- **Backend (TDD, commits `test:` abans dels `feat:`):** `client_message_id` obligatori al domini, el port i el servei; `UNIQUE(author_id, client_message_id)` i migració `e7a3c5b9d104` amb *backfill*; `add_message` amb `ON CONFLICT` explícit que retorna el desat; duplicat idèntic → ack i nova publicació sense moderar ni comptar al límit; text o sala diferents → 409 `CHAT_IDEMPOTENCY_CONFLICT`; el handler exigeix un UUID canònic.
- **Client (`shared/realtime`):** vigilant de connexió morta (60 s), cua de `send` en memòria amb tres intents i `SEND_UNCERTAIN`, `AppState` (tanca en segon pla, reconnecta en tornar), `new WebSocket()` que llança, JSON no objecte i `reconnect()` sense consumidors.
- **Xat:** `sendMessage(text, clientMessageId)` i deduplicació per `id` a `useChatSocket`.
- **Altres:** `apiBaseUrl` sense barra final; regla d'ESLint que impedeix que `shared/` importi de `features/`; textos `SEND_UNCERTAIN` i `CHAT_IDEMPOTENCY_CONFLICT` als tres locales i al catàleg d'errors.

## Decisions preses

Totes a petició de la persona responsable durant la sessió; el detall és a l'[[0030-protocol-websocket-i-revocacio-per-pub-sub#Actualització (TG-654)|actualització de l'ADR-0030]].

- Clau `client_message_id` **obligatòria** (UUID de `expo-crypto`), amb columna `NOT NULL` i *backfill* de les files existents.
- Duplicat idèntic: ack i **republicació sempre**; els receptors deduplicant per `id`. La clau no s'exposa als altres subscriptors.
- Cua de reintents **en memòria** a `shared/realtime` (tres intents, reintenta errors reintentables amb espera d'1 s i 2 s); outbox persistent fora d'abast.
- Si el reintent esgotat no ha tingut resposta: `SEND_UNCERTAIN` reintentable.
- Segon pla: es tanca el socket i es reconnecta en tornar; **només `background`**, no `inactive` (iOS).
- **Límit de republicació** després de la revisió d'arquitectura: un duplicat idèntic només es torna a publicar si no s'ha publicat amb èxit en 10 s (`RepublishGuard` a Redis), per no deixar que una clau repetida en bucle faci un *fan-out* per frame.
- **Cursa amb text diferent:** 409 també quan el guanyador de l'`INSERT ... ON CONFLICT` no coincideix.
- Stacked PR: es va decidir partir en dues només si Stryker passava de ~400 mutants; amb 185 mutants no calia, i es va obrir una única PR amb backend i frontend.
- Dos tests de TG-461 i TG-448 canvien de contracte (un `send` sense connexió s'encua; reintentar el mateix objecte ja no és un conflicte de PK) i es van reescriure en commits `test:` amb el motiu; el commit del test de TG-448 es va reordenar abans dels `feat:` per respectar ADR-0028.
- La migració del `client_message_id` penja de la d'assoliments de `develop` (hi havia dues capçaleres d'Alembic); el test d'assoliments baixa fins a la seva revisió base en lloc de `-1`.

## Canvis al vault

- [[0030-protocol-websocket-i-revocacio-per-pub-sub]]: secció «Actualització (TG-654)».
- [[frontend]]: connexió morta, `AppState`, enviaments fiables, deduplicació i límit de `shared/`.
- [[model-de-domini]] i [[postgres]]: columna i índex únic de `chat_messages`.

## Pendent / següents passos

- [ ] Una cua persistent que sobrevisqui al tancament de l'app (outbox, [[0011-client-offline-sqlite-last-write-wins]]), si l'equip ho vol.
- [ ] Un error o ack tardà amb l'`id` d'un `send` ja resolt o rebutjat arriba al gestor de la sala (cas rar, no tractat).
- [ ] `pnpm lint` global informa de ~9600 errors `Delete ␍` (CRLF al directori de treball de Windows); no ve d'aquests canvis.

## US de Taiga

- TG-654
- TG-64
