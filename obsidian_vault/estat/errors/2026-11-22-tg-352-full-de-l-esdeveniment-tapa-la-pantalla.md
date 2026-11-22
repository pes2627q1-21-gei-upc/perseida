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
commit: "3aa79a1c, 3f39c3de"
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

Els tres tanquen el full abans de navegar.

## Test de regressió

`frontend/src/features/events/components/MapScreen.test.tsx`: després de prémer cadascun dels tres botons, s'ha navegat i el full (`event-sheet`) ja no hi és.

## Lliçó

Cap: error puntual de TG-629 que TG-352 va repetir en afegir el botó nou.
