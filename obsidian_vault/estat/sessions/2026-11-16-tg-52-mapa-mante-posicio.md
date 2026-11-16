---
titol: "Sessió 2026-11-16: el mapa d'esdeveniments conserva la posició en tornar de la llista (TG-52)"
tipus: sessio
estat: vigent
data: "2026-11-16"
us: ["TG-52", "TG-626"]
font: "Prova manual de Raquel a l'app (16/11/2026); src/app/(app)/map.tsx; decisió de Raquel en aquesta sessió"
etiquetes: [sessio, frontend, mapa, esdeveniments]
---

# Sessió 2026-11-16 · El mapa conserva la posició (TG-52)

## Objectiu

En passar de «Mapa» a «Llista» i tornar, el mapa es veia molt petit (vista del món) i perdia el zoom i la posició.

## Què s'ha fet

- **Causa:** `map.tsx` desmuntava `EventMap` amb la llista. En tornar, el WebView recarregava la pàgina de Leaflet, que comença a `WORLD_CENTER` amb zoom 2 i fa `fitBounds` ([[0032-leaflet-per-al-mapa-web-i-webview]]).
- **Solució:** el mapa queda sempre muntat. Amb la llista a sobre, és invisible (`opacity: 0`), no rep tocs i queda fora de l'arbre d'accessibilitat (al web, amb `visibility: hidden` i `aria-hidden`; vegeu «Review de la PR #93»). Detall a [[frontend#Mapa d'esdeveniments (TG-52)]].
- Tests a `MapScreen.test.tsx`: el WebView no es torna a muntar després de passar per la llista, i amagat no rep tocs ni el llegeixen els lectors de pantalla. Primer el commit `test:` en vermell i després el `fix:` ([[0028-tdd-estricte-i-politica-de-testing-avancada]]).

### Canvi de filtre

- **Problema:** de «Actius» a «Futurs» o a «Tots» el mapa també es reiniciava; de «Futurs» a «Tots» no, perquè tots dos tenen els mateixos marcadors al mapa (els actius d'ara no tenen ubicació).
- **Causa:** al web, `FitToMarkers` feia `fitBounds` a cada canvi de marcadors; al mòbil, l'HTML porta els marcadors, el WebView es recarregava i tornava a començar al món.
- **Solució:** només s'ajusta als primers marcadors. Al mòbil, la pàgina informa de cada moviment de càmera i, en recarregar-se per marcadors nous, s'obre a la mateixa càmera sense `fitBounds`. La càmera es valida (rangs de latitud, longitud i zoom) i només es desa quan el mapa té marcadors, perquè la vista inicial del món no impedeixi el primer ajust. Detall a [[frontend#Mapa d'esdeveniments (TG-52)]].
- Tests a `leafletHtml.test.ts`, `EventMap.test.tsx` i `EventMap.web.test.tsx`, primer en vermell.

### Review de la PR #93

- **Accessibilitat al web:** react-native-web 0.21 ignora `accessibilityElementsHidden` i `importantForAccessibility`, així que al web el mapa amagat continuava a l'ordre de tabulació i a l'arbre d'accessibilitat (marcadors, zoom i atribució invisibles). `hiddenLayerProps` hi afegeix `visibility: hidden` i `aria-hidden`, i manté les props natives al mòbil. Test a `hiddenLayer.test.ts`, primer en vermell.
- Merge de `develop` a la branca (TG-359 i TG-351 fusionades), sense conflictes.

## Decisions preses

Cap ADR nova. Decisions de Raquel:

- Es corregeix en una branca nova de TG-52 (`feature/TG-52-mapa-mante-posicio`), perquè la PR #89 ja està fusionada. La US no es reobre: el defecte es registra com a issue `Bug` TG-626 a Taiga (Sprint 2).
- En canviar de filtre, el mapa conserva la posició de l'usuari i no s'ajusta als marcadors nous.

## Pendents

- Al mòbil, canviar el filtre encara recarrega el WebView (amb un parpelleig breu), tot i que ara conserva la càmera. Es podria evitar enviant els marcadors per `postMessage` sense recarregar la pàgina.
