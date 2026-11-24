---
titol: "TG-65: el fixture de refetch no reflectia el missatge persistit"
tipus: error-testing
estat: corregit
data: 2026-11-24
us: [TG-65]
font: "Verificació local de #164 després del rebase sobre #163"
fase: roig-inesperat
capa: frontend
regressio: "frontend/src/features/direct-chat/hooks/useDirectConversation.test.tsx::TG-65 criterion 11 marks an incoming live message read by its ID after history loads"
commit: 4f1595b2
llico: cap
etiquetes: [error-testing, tg-65, frontend]
---

# El test de lectura en viu retornava un snapshot antic després del refetch

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Després del rebase de #164 sobre #163, la prova local de lectura d'un missatge en viu fallava: el test esperava el seu ID com a cursor, però el refetch no retornava aquest missatge.

## Causa

El mock del segon refetch retornava només l'historial inicial, tot i que el comportament del cas d'ús és refrescar l'historial i marcar com a llegit el missatge més recent de la instantània reeixida.

## Correcció

El fixture del refetch ara inclou el missatge en viu ja persistit al principi de l'historial refrescat; l'assertion comprova que aquest ID s'envia com a cursor.

## Test de regressió

`frontend/src/features/direct-chat/hooks/useDirectConversation.test.tsx::TG-65 criterion 11 marks an incoming live message read by its ID after history loads`.

## Lliçó

`cap`: el fixture ha de representar l'estat retornat pel refetch, no només l'entrada del socket.
