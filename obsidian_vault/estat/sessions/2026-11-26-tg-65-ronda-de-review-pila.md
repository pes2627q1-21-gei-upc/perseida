---
titol: "Sessió 2026-11-26 · TG-65: ronda de review de la pila"
tipus: sessio
estat: vigent
data: "2026-11-26"
us: ["TG-65"]
font: "Taiga TG-65; reviews de les PR #163 i #164; CI de la pila"
etiquetes: [sessio, xat, pr-apilades, testing]
---

# Sessió 2026-11-26 · TG-65: ronda de review de la pila

## Objectiu

Atendre els comentaris de review de les PR #163 i #164 i integrar el disseny nou de #163 a la capa superior (#164) sense perdre cap comportament.

## Què s'ha fet

- #163 (lectura per snapshot): el marcatge llegeix només la primera pàgina de l'historial amb `fetchMessages` i `addMessage` (sense `history.refetch()`), serialitzat amb una marca `dirty`, i marca el `last_message_id` de la instantània fresca. Al backend, `sent_at` estrictament creixent al repositori en memòria i al contracte del port, i neteja del paràmetre `now` del servei.
- #164: fusió de #163 al hook `useDirectConversation`, que manté el disseny de #163 (nucli compartit `useLiveConversation` + `useDirectTransport`). El disseny antic de #164 (recarregar tot l'historial a cada missatge) queda descartat. S'afegeixen dos tests de regressió sobre el hook real: un error en refrescar la primera pàgina no posa `error` ni amaga la conversa, i quatre missatges en directe costen com a molt una primera pàgina cadascun i cap pàgina antiga.
- Skill `testing-mutation`: nova secció «Frontend en PR apilades» (base real del diff d'Stryker i assertions d'ID exacte). Les dues notes d'error de Stryker s'enllacen entre elles; no tenen la mateixa causa però sí la mateixa lliçó.
- Notes d'error corregides: títols reals de tests a `regressio`, hashos vigents (`bdf84e80`, `ed69991a`, `5a975272`) i atribució a #163 del client amb `last_message_id`.

## Decisions preses

- Refactor al nucli compartit: la lògica de marcatge del directe viu a `useDirectConversation`; la resta és al nucli genèric.
- L'avís d'escriptura (typing) es manté tal com està, pendent de la confirmació del PO.
- Catàleg d'errors ampliat: `CONVERSATION_NOT_FOUND` cobreix també un `last_message_id` desconegut o aliè, i els errors del xat directe usen els textos aprovats del catàleg.

## Canvis al vault

- `arquitectura/frontend.md`: descripció de `useDirectConversation` amb el marcatge actual (primera pàgina, marca `dirty`, cursor de snapshot).
- Notes d'error de TG-65 i aquesta nota de sessió.

## Pendent / següents passos

- [ ] Confirmació del PO sobre l'avís d'escriptura.
- [ ] Reflectir l'evidència final de CI a les descripcions de les PR.

## US de Taiga

- TG-65
