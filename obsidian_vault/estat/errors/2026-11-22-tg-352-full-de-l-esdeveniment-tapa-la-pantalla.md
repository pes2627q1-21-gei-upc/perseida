---
titol: "TG-352: el full de l'esdeveniment tapava la pantalla que obria"
tipus: error-testing
estat: corregit
data: "2026-11-22"
us: ["TG-352", "TG-629"]
font: "Prova manual de Raquel a web (393×852), 22/11/2026"
fase: prova-manual
capa: frontend
regressio: "frontend/src/features/events/components/MapScreen.test.tsx (tancar el full en obrir una altra pantalla)"
commit: "3aa79a1c, 3f39c3de, 4ac7aa15"
llico: cap
etiquetes: [error-testing]
---

# TG-352: el full de l'esdeveniment tapava la pantalla que obria

> [!info] Fases
> `roig-inesperat` · `prova-manual` · `ci-mutants` · `review`. Estat: `obert` o `corregit`. Lliçó: `skill`, `convencio` o `cap`. Vegeu [[retroalimentacio-de-testing]].

## Símptoma

Al mòbil, en prémer «Punts de trobada» o «Sortides d'aquest esdeveniment» a la fitxa d'un esdeveniment, o obrir una sortida des de la seva fitxa, el full de l'esdeveniment es quedava obert per sobre de la pantalla nova.

## Causa

Al mòbil, la fitxa és un `Modal`. `showOutings`, `openOuting` i `showMeetingPoints` de `src/app/(app)/map.tsx` feien `router.push` sense tancar-la (`closeSheet`). Els tests de `MapScreen` només comprovaven la navegació, no que el full es tanqués.

## Correcció

Primer es va tancar el full abans de navegar (`3f39c3de`). Després de tornar-ho a provar, Raquel va decidir que en tornar enrere el full ha de tornar a sortir. Per això el full del mòbil ara només s'amaga mentre el mapa no té el focus (`useIsFocused`), i en tornar torna a sortir amb el mateix esdeveniment o sortida. Com que el mapa és una pestanya, no es desmunta i conserva `selectedId`.

## Test de regressió

- `frontend/src/features/events/components/MapScreen.test.tsx`: en prémer cadascun dels tres botons, el full no surt mentre el mapa no té el focus i torna a sortir quan el recupera.
- `frontend/src/features/navigation/__tests__/mapSheetFocus.test.tsx`: amb el router real a 393×852, l'enrere torna a mostrar el full.

## Lliçó

Cap: error puntual de TG-629 que TG-352 va repetir en afegir el botó nou.
