---
titol: "TG-65: el client no enviava el cursor de lectura"
tipus: error-testing
estat: corregit
data: 2026-11-24
us: [TG-65]
font: "CI run 45446260760"
fase: ci-mutants
capa: frontend
regressio: "frontend/src/features/direct-chat/api/directChat.test.ts::sends the latest loaded message ID when marking a conversation read"
commit: 5a975272
llico: cap
etiquetes: [error-testing, tg-65, frontend]
---

# El client no enviava el cursor obligatori en marcar una conversa com a llegida

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

El client amb `last_message_id` pertany a la PR #163 (no a #164). La CI del run `45446260760` va fallar en compilar el frontend: el contracte de `markRead` exigia `last_message_id`, però la crida del client no enviava el body.

## Causa

El contracte REST de lectura havia passat a requerir un cursor per missatge, però el wrapper frontend encara feia una petició sense body.

## Correcció

El wrapper envia `{ last_message_id }` i el cas d'ús hi passa l'ID del missatge més recent retornat per l'historial.

## Test de regressió

`frontend/src/features/direct-chat/api/directChat.test.ts::sends the latest loaded message ID when marking a conversation read` comprova el body exacte de la petició.

## Lliçó

`cap`: no s'ha afegit una convenció nova.
