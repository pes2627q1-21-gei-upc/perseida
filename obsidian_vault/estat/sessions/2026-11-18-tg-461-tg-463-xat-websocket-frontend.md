---
titol: "Sessió 2026-11-18: hook WebSocket compartit i useChatSocket (TG-461 i TG-463)"
tipus: sessio
estat: vigent
data: "2026-11-18"
us: ["TG-64"]
font: "Taiga: US TG-64, tasques #461 i #463; ADR-0030"
etiquetes: [sessio, frontend, xat, websocket]
---

# Sessió 2026-11-18 · Hook WebSocket compartit i xat (TG-461 i TG-463)

## Objectiu

Connexió en temps real del frontend: autenticació amb el primer frame, reconnexió amb espera exponencial, ping/pong, subscripció per sala i el hook `useChatSocket`, reutilitzable pel xat directe (#65).

## Què s'ha fet

- **Tests en vermell (TG-461, commits `test:`):** `useSocket` i `useChatSocket` amb un WebSocket fals i rellotges falsos (auth, ack, backoff, resubscripció, ping/pong, acks i errors, revocació, 4401 i 4429, neteja en desmuntar).
- **Codi en verd (TG-463):** `shared/realtime` (`socketClient`, `useSocket`), `features/auth/socketAuth`, `features/chat/hooks/useChatSocket`, `wsUrl` a la configuració i `problemToAppError` extret de `toAppError`.
- **Nou codi d'error `TOO_MANY_CONNECTIONS`** (tancament 4429) als tres locales, al catàleg d'errors i a les skills (còpia sincronitzada).
- **Mutation testing en tres rondes:** 82 % → 89 % → 94 % amb tests nous per als supervivents que eren comportaments reals.

## Decisions preses

- **Connexió única amb recompte de consumidors** (singleton de mòdul), sense `Provider` ni canvis al layout.
- **Reconnexió:** 1 s ×2, màxim 30 s, *jitter* i vuit intents; després `closed` i `reconnect()` manual.
- **4401:** un sol refresc per autenticació correcta, i sense bucle; **4429:** sense reintent, amb el codi `TOO_MANY_CONNECTIONS`.
- **Sessió injectada** (`SocketAuth`) perquè `shared/` no depengui de `features/`; va canviar el contracte després dels primers tests i els tests es van reescriure en un commit `test:` abans del `refactor:`.
- **`getToken()` rebutjat** es tracta com la manca de sessió (`closed` amb `INVALID_SESSION`).
- **Refresc alineat amb el REST** (després de la revisió d'arquitectura): si `refreshSession()` falla per xarxa o servidor i la sessió continua desada, la connexió tanca amb `SESSION_UNAVAILABLE` (reintentable), com `withSession`; sense sessió, `INVALID_SESSION`.
- **`onError` a `useChatSocket`:** els errors en unir-se a la sala (`FORBIDDEN`…) arriben a la pantalla com a `AppError`; abans es perdien.
- **Guarda d'`onmessage`:** un frame d'un socket ja substituït s'ignora.
- Text de `TOO_MANY_CONNECTIONS` aprovat per la persona responsable (`retryable: false`).
- **Historial:** el commit `932e614` és `refactor:` però canvia el contracte (la sessió injectada) i fa passar els tests de `28a3e8b`; s'ha deixat així i s'explica a la PR en lloc de reescriure l'historial.
- **Deute tècnic:** detecció de connexió morta i `AppState`, fora d'aquesta PR.

## Canvis al vault

- `arquitectura/frontend.md`: secció «Temps real: connexió WebSocket compartida (TG-64)».

## Pendent / següents passos

- [ ] Pantalles de llista de sales i de sala, i18n i accessibilitat (TG-469), amb els tests de pantalles abans.
- [ ] Integrar els missatges en temps real amb TanStack Query i decidir el `staleTime` de l'històric (TG-469).
- [ ] Nota global del flux d'un missatge i actualitzar `api` i `redis` (TG-470).

## US de Taiga

- TG-64
- TG-461
- TG-463
