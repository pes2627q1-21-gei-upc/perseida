---
titol: "TG-65: expectativa obsoleta en un historial buit"
tipus: error-testing
estat: corregit
data: 2026-11-24
us: [TG-65]
font: "CI run 45448437393"
fase: ci-mutants
capa: frontend
regressio: "frontend/src/features/direct-chat/hooks/useDirectConversation.test.tsx::no marca com a llegida una conversa amb l’històric buit"
commit:
llico: cap
etiquetes: [error-testing, tg-65, frontend]
---

# Un test esperava marcar com a llegit sense tenir cap cursor

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

El test del run `45448437393` esperava una crida per marcar la conversa com a llegida quan l'historial encara no contenia cap missatge.

## Causa

L'assertion provenia del comportament anterior, basat en una marca temporal. Amb el contracte nou cal enviar l'ID del darrer missatge carregat i no hi ha cap cursor vàlid si l'historial és buit.

## Correcció

Es va actualitzar l'expectativa perquè l'historial buit no enviï cap petició de lectura; el test també comprova que un missatge d'una altra conversa no avança aquest marcador.

## Test de regressió

`frontend/src/features/direct-chat/hooks/useDirectConversation.test.tsx::does not mark read when history is empty`.

## Lliçó

`cap`: el test ha de seguir el contracte actual i preservar el no-op quan no existeix un cursor.
