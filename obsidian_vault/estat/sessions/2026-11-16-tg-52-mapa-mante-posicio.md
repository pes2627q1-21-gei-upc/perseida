---
titol: "Sessió 2026-11-16: el mapa d'esdeveniments conserva la posició en tornar de la llista (TG-52)"
tipus: sessio
estat: vigent
data: "2026-11-16"
us: ["TG-52"]
font: "Prova manual de Raquel a l'app (16/11/2026); src/app/(app)/map.tsx; decisió de Raquel en aquesta sessió"
etiquetes: [sessio, frontend, mapa, esdeveniments]
---

# Sessió 2026-11-16 · El mapa conserva la posició (TG-52)

## Objectiu

En passar de «Mapa» a «Llista» i tornar, el mapa es veia molt petit (vista del món) i perdia el zoom i la posició.

## Què s'ha fet

- **Causa:** `map.tsx` desmuntava `EventMap` amb la llista. En tornar, el WebView recarregava la pàgina de Leaflet, que comença a `WORLD_CENTER` amb zoom 2 i fa `fitBounds` ([[0032-leaflet-per-al-mapa-web-i-webview]]).
- **Solució:** el mapa queda sempre muntat. Amb la llista a sobre, és invisible (`opacity: 0`), no rep tocs i queda fora de l'arbre d'accessibilitat. Detall a [[frontend#Mapa d'esdeveniments (TG-52)]].
- Tests a `MapScreen.test.tsx`: el WebView no es torna a muntar després de passar per la llista, i amagat no rep tocs ni el llegeixen els lectors de pantalla. Primer el commit `test:` en vermell i després el `fix:` ([[0028-tdd-estricte-i-politica-de-testing-avancada]]).

## Decisions preses

Cap ADR nova. Decisió de Raquel: es corregeix en una branca nova de TG-52 (`feature/TG-52-mapa-mante-posicio`), perquè la PR #89 ja està fusionada.

## Pendents

- Al mòbil, canviar el filtre (Actius, Futurs, Tots) també recarrega el WebView, perquè l'HTML porta els marcadors. És el comportament previst (`fitBounds` als marcadors nous), però es podria enviar els marcadors per `postMessage` sense recarregar la pàgina.
