---
titol: "Sessió 2026-11-11: domini del xat d'esdeveniment (TG-64)"
tipus: sessio
estat: vigent
data: "2026-11-11"
us: ["TG-64"]
font: "Taiga US #64 i tasques #435 i #437; backend/app/domain/chat"
etiquetes: [sessio, backend, xat, domini]
---

# Sessió 2026-11-11 · Domini del xat d'esdeveniment (TG-64)

## Objectiu

Fer les tasques #435 (tests en vermell) i #437 (entitats i ports) de la US #64, només la capa de domini.

## Què s'ha fet

- Commit `build:` amb `hypothesis==6.170.15` com a dependència de desenvolupament (ja era al `uv.lock` de rebot, de schemathesis).
- Commit `test:` amb `tests/unit/domain/chat/test_models.py`: exemples i dues propietats del límit de 1000 caràcters.
- Commit `feat:` amb `EventChatRoom`, `ChatMessage`, `ModerationResult`, `ChatMessagePage`, `ChatRoomSummary`, els ports `ChatRepository`, `MessageModerator`, `SendRateLimiter` i `EventSubscriptions`, els codis d'error i el contracte d'import-linter «The chat does not import other features».
- [[model-de-domini]] actualitzat amb la secció «Xat d'esdeveniment».

## Decisions preses (Oriol)

- **hypothesis** s'afegeix amb versió fixada.
- **Neteja del text:** strip i eliminar caràcters de control (excepte `\n` i `\t`); mai truncar; el límit es comprova després de netejar.
- **Atributs:** `EventChatRoom(id, event_id, created_at)` i `ChatMessage(id, room_id, author_id, text, sent_at)`.
- **Cursor de l'històric:** l'id del missatge (UUIDv7 és ordenable per temps).

## Pendent / següents passos

- [ ] #439 i següents: `ChatService` i els codis d'accés, rate limit i esdeveniment inexistent; llavors el contracte d'import-linter ha d'incloure `app.application.chat`.
- [ ] El codi d'«esdeveniment no existeix» no està fixat: el defineix el service.
- [x] Mutation testing d'`app/domain/chat/` fet a Docker: 35/35 mutants morts. `[tool.mutmut]` ara inclou el xat.
- [x] Cobertura del codi nou al 100 %: `ports.py` es cobreix amb fakes en memòria (`tests/unit/domain/chat/fakes.py`), que reutilitzarà #439.

## US de Taiga

- TG-64
