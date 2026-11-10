---
titol: "ADR-0031: Leaflet per al mapa d'esdeveniments (web i WebView)"
tipus: adr
estat: proposada
data: "2026-11-10"
us: ["TG-52"]
font: "Taiga: TG-52, tasca #488 (spike), decisions de Raquel (10/11/2026); prototip validat al navegador i a Android amb Expo Go; frontend/src/features/events/components/"
etiquetes: [adr, frontend, mapa, leaflet, dependencies]
---

# ADR-0031 · Leaflet per al mapa d'esdeveniments (web i WebView)

## Context

La TG-52 demana un mapa interactiu d'esdeveniments que funcioni a mòbil i a web ([[0020-frontend-expo-router-i-estetica-frutiger-cosmo]]). El frontend no tenia cap llibreria de mapes. La versió web és la mateixa app servida darrere d'una CSP estricta (`script-src 'self'`, `img-src https:`, `connect-src 'self'`; vegeu [[nginx-proxy-manager]]) i no volem claus d'API ni comptes de pagament.

## Decisió

El mapa és **Leaflet 1.9.4** a totes dues plataformes:

- **Web:** `react-leaflet` 5.0.0 amb Leaflet empaquetat amb l'app (`EventMap.web.tsx`).
- **Mòbil:** el mateix Leaflet dins de `react-native-webview`, que ja era dependència (`EventMap.tsx`). La pàgina es genera a `leafletHtml.ts`: carrega Leaflet d'unpkg fixat amb SRI, hi incrusta els marcadors com a JSON escapat i retorna els tocs amb `postMessage`. El WebView només carrega `about:blank` (la pàgina pròpia); els enllaços https s'obren al navegador i la resta es bloqueja.
- **Mapa base:** teseles ràster d'**Esri World Dark Gray**, sense clau d'API, amb l'atribució d'Esri i d'OpenStreetMap visible.

## Conseqüències

### Positives

- Una sola tecnologia de mapa i un sol comportament a web i a mòbil.
- Cap mòdul natiu nou: funciona a Expo Go i a l'APK sense tocar la configuració nativa.
- Al web funciona amb la CSP actual: Leaflet va al bundle i les teseles són imatges.
- Els marcadors de Leaflet són botons focusables amb el títol de l'esdeveniment com a nom (WCAG 2.2 AA).

### Negatives (assumides)

- Al mòbil, el mapa necessita xarxa per carregar Leaflet (unpkg) i les teseles. Sense xarxa la pantalla mostra l'estat d'error.
- El WebView és més lent i menys fluid que un mapa natiu.
- Les teseles d'Esri es fan servir sota les condicions d'ús no comercial amb atribució; si canvien (com ha passat amb CARTO), cal canviar `BASE_MAP_TILES` a `mapTiles.ts`.

## Alternatives descartades

- **CARTO Dark Matter:** era l'opció triada, però durant el spike les teseles responien «API key required».
- **OpenStreetMap estàndard:** respon «Access blocked» a les apps que no compleixen la seva política d'ús.
- **Stadia Maps:** demana registrar el domini de producció (`401` sense compte).
- **MapLibre** (`@maplibre/maplibre-react-native` + `maplibre-gl`): mapes vectorials més fluids, però dues implementacions, un mòdul natiu amb config plugin i obrir la CSP (`connect-src`, `worker-src blob:`).
- **react-native-maps (Google):** cal una clau de Google Maps amb facturació i no funciona al web.

## US de Taiga relacionades

- TG-52 (mapa interactiu d'esdeveniments), tasca #488 (spike)

## Enllaços

- [[frontend]], [[contracte-esdeveniments]], [[nginx-proxy-manager]]
- [[0020-frontend-expo-router-i-estetica-frutiger-cosmo]]
- [Leaflet](https://leafletjs.com) · [react-leaflet](https://react-leaflet.js.org)
