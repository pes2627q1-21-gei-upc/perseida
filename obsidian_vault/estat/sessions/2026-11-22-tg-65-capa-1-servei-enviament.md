---
titol: "Sessió 2026-11-22: servei d'enviament del xat directe (TG-65, capa 1)"
tipus: sessio
estat: vigent
data: "2026-11-22"
us: ["TG-65", "TG-401", "TG-402"]
font: "Taiga: US #65, tasques #401 i #402"
etiquetes: [sessio, backend, xat, servei]
---

# Sessió 2026-11-22 · Servei d'enviament del xat directe (capa 1 de TG-65)

## Objectiu

Fer passar en verd els tests de `DirectChatService` (`open_conversation` i `send_message`) sense tocar-los (ADR-0028).

## Què s'ha fet

- **Refactors:** ports `MessageModerator`, `SendRateLimiter` i `ModerationResult` a `domain/shared`; cursor a `application/shared/cursor`; `CHAT_MESSAGE_REJECTED` a `domain/shared/moderation.py` i `PUBSUB_UNAVAILABLE` a `application/shared/error_codes.py` (el contracte d'import-linter del xat directe prohibeix importar `chat` i `realtime`).
- **Domini:** errors `USER_NOT_FOUND` i `USER_BLOCKED`; ports `ChatUserDirectory` i `DirectMessageBroadcaster`; `ValidationError` en lloc de `BusinessRuleViolation` per a `VALIDATION_ERROR` (petició de la review de la PR #132).
- **Aplicació:** `DirectChatService` (vegeu [[model-de-domini]], secció «Xat directe»).
- **Catàleg d'errors:** `USER_NOT_FOUND`, `USER_BLOCKED` i els textos de `CANNOT_MESSAGE_SELF` i `CONVERSATION_NOT_FOUND`, aprovats per Oriol Orbea.

## Decisions d'Oriol Orbea

- **Conflicte d'idempotència:** un `client_message_id` ja usat pel mateix remitent amb una altra conversa o un altre text netejat dona `ConflictError(DIRECT_IDEMPOTENCY_CONFLICT)` (409), abans del límit, la moderació, el desat i la difusió. Si coincideixen, es retorna l'existent i es torna a difondre.
- **Push best effort:** `PushNotifier.notify` no ha de fallar l'enviament; el servei captura qualsevol error, el registra i continua (patró de `_mark_published` del xat d'esdeveniment). El docstring del port ho recull.
- **Catàleg:** `DIRECT_IDEMPOTENCY_CONFLICT` (409) amb els textos ca/es/en de `CHAT_IDEMPOTENCY_CONFLICT`; `USER_NOT_FOUND` i `USER_BLOCKED` queden «No recuperable».
- El defecte del fake `_LoggedMessages` es va corregir amb el commit de tests previ.

## Pendent

- [ ] Capes 2 a 10: adaptadors, API, frontend; ADR-0034 i README a la capa 4.

## US de Taiga

- TG-65 (tasques TG-401 i TG-402)
