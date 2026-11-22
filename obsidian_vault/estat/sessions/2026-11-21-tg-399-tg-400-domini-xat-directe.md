---
titol: "Sessió 2026-11-21: domini del xat directe 1-a-1 (TG-399 i TG-400)"
tipus: sessio
estat: vigent
data: "2026-11-21"
us: ["TG-65", "TG-399", "TG-400"]
font: "Taiga: US #65 i tasques #399 i #400"
etiquetes: [sessio, backend, xat, domini]
---

# Sessió 2026-11-21 · Domini del xat directe (TG-399 i TG-400)

## Objectiu

Primeres dues tasques de la US #65: tests en vermell del domini del xat directe (#399) i el domini amb els seus ports (#400). Només la capa `domain`; serveis, persistència i API són de #401 a #408.

## Què s'ha fet

- **TDD (ADR-0028):** `qa-tester` va escriure els tests en vermell (fallaven per `ModuleNotFoundError`) en un commit `test:`; `backend` va fer el verd en tres commits `feat:`/`build:`. Un `test:` posterior cobreix la parella desordenada al constructor i treu una assignació de `None` que feia fallar mypy (`func-returns-value`).
- **Domini** a `app/domain/direct_chat/`: `DirectConversation` (parella ordenada, marca de llegit per participant), `DirectMessage` (amb `client_message_id`), `UserBlock`, cursor i pàgina, i els ports `DirectConversationRepository`, `DirectMessageRepository`, `UserBlockRepository` i `PushNotifier`.
- **Infraestructura:** `NoopPushNotifier` amb `TODO(TG-73)`.
- **Arquitectura:** contracte d'import-linter «The direct chat does not import other features» i paquet buit `app/application/direct_chat/` (el contracte exigeix que el mòdul existeixi; #402 l'omplirà).
- **Revisió:** `reviewer-arquitectura` va trobar un CRLF accidental a `backend/pyproject.toml` (474 línies tocades en lloc de 34); es va normalitzar a LF i es va refer el commit. Ara el diff d'aquest fitxer és de +34 línies.

## Decisions preses

Totes a petició de la persona responsable:

- Text buit o de més de 1000 caràcters: `VALIDATION_ERROR` (literal de la tasca i de la US), sense tocar `domain/chat`, perquè la PR no entri en conflicte amb l'stack de TG-64. Per això va com a PR sola a `develop` i no apilada.
- Els ports `MessageModerator`, `SendRateLimiter` i el `ModerationResult` es queden a `app/domain/chat` fins a #402, que els mourà a `app/domain/shared` quan el servei en depengui (regla d'independència entre features, [[backend-hexagonal]]).
- No llegits amb marca temporal per participant, sense comptador desnormalitzat.
- `client_message_id` al missatge directe, com al xat d'esdeveniment.
- Bloquejar-se a un mateix reutilitza `CANNOT_MESSAGE_SELF`.

## Verificació

- `pytest tests/unit tests/architecture`: 1672 passats; `ruff check`, `ruff format --check` i `mypy .` nets.
- Cobertura dels mòduls nous: 100 % (`models.py`, `ports.py`, `errors.py` i `push_notifier.py`).
- Mutation testing (mutmut, a Docker perquè no va a Windows natiu): 90,41 % (66 de 73 morts, 7 supervivents), per sobre del 70 % requerit.

## Canvis al vault

- [[model-de-domini]]: secció «Xat directe (domini implementat)».

## Pendent / següents passos

- [ ] #401 i #402: servei; mou els ports del xat a `domain/shared` en aquella PR.
- [ ] #402/#404: la llista de converses mostra l'últim missatge i el recompte de no llegits; amb els ports actuals seria N+1. Decidir un port de lectura en bloc (per exemple `last_messages` i `count_unread_many`, o un resum retornat per `list_of`).
- [x] `mark_read` de l'entitat refusa una data sense zona horària (`VALIDATION_ERROR`; review de la PR #132). Pendent als adaptadors de #406: `mark_read` i `count_unread` dels repositoris també han de rebutjar-la.
- [ ] Afegir `*.toml text eol=lf` a `.gitattributes`, si l'equip ho vol (a Windows, l'editor ha convertit un fitxer a CRLF).
- [ ] Catàleg d'errors i locales del frontend per a `CANNOT_MESSAGE_SELF` i `CONVERSATION_NOT_FOUND` quan arribi l'API (#408).

## US de Taiga

- TG-65 (tasques TG-399 i TG-400)
