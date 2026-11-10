---
titol: "Sessió 2026-11-10: spike de la llibreria de mapes (TG-52, tasca #488)"
tipus: sessio
estat: vigent
data: "2026-11-10"
us: ["TG-52"]
font: "Taiga: TG-52 i tasca #488; decisions de Raquel en aquesta sessió (10/11/2026); prototip provat al navegador (Chrome) i a Android (Expo Go)"
etiquetes: [sessio, frontend, mapa, leaflet]
---

# Sessió 2026-11-10 · Spike del mapa d'esdeveniments (TG-52)

## Objectiu

Fer la tasca 1/7 de TG-52 (#488): triar una llibreria de mapes compatible amb Expo (mòbil i web) i validar-la amb un prototip.

## Què s'ha fet

- Dependències `leaflet@1.9.4`, `react-leaflet@5.0.0` i `@types/leaflet@1.9.22` (sense avisos nous a `pnpm audit`).
- `features/events/components/`: `EventMap.web.tsx` (react-leaflet), `EventMap.tsx` (WebView), `leafletHtml.ts` (pàgina del WebView) i `mapTiles.ts` (mapa base i tipus).
- Tests en vermell abans del codi (commits `test:` i després `feat:`/`fix:`, [[0028-tdd-estricte-i-politica-de-testing-avancada]]).
- Prototip amb una ruta temporal, no comitejada, validat al navegador (mapa, atribució, marcadors com a botons accessibles, clics) i a Android amb Expo Go (càrrega `about:blank`, Leaflet carregat amb SRI, tocs).
- [[0031-leaflet-per-al-mapa-web-i-webview]].

## Decisions preses

Totes de Raquel:

- **Llibreria:** Leaflet al web i dins d'un WebView al mòbil.
- **Mapa base:** CARTO Dark Matter primer; com que ara demana clau d'API, Esri World Dark Gray.
- **Pla de la US (per a les tasques següents):** «futurs» = `upcoming?days=30`; un esdeveniment que surt a `active` i a `upcoming` compta com a actiu; marcadors d'esfera de vidre amb una icona de Phosphor per categoria i halo als actius.

## Pendents

- Tasca #490: marcadors propis (les icones per defecte de Leaflet no es veuen al web) i enquadrar els marcadors també al web.
- Tasques #489-#494 de TG-52.
