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

## Pendent

- [ ] Un test (`test_tg65_send_checks_in_the_documented_order`) falla per un defecte del fake `_LoggedMessages` (`tests/fakes/direct_chat.py`): `add` crida `find_by_client_id` sobrecarregat i el log té un `"find"` extra abans de `"deliver"`.
- [ ] Idempotència amb la mateixa clau per a una altra conversa o text: no definit; ara es retorna el missatge existent.
- [ ] Capes 2 a 10: adaptadors, API, frontend; ADR-0034 i README a la capa 4.

## US de Taiga

- TG-65 (tasques TG-401 i TG-402)
