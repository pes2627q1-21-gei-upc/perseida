import {
  CARTO_DARK_ATTRIBUTION,
  CARTO_DARK_SUBDOMAINS,
  CARTO_DARK_TILES,
  type MapMarker,
  WORLD_CENTER,
  WORLD_ZOOM,
} from './mapTiles';

/**
 * Leaflet 1.9.4 from unpkg, pinned with subresource integrity: the hashes are those of the
 * files in the `leaflet@1.9.4` npm package, so a changed file on the CDN does not load.
 */
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';

/** JSON that is safe inside a <script>: `<` can never start `</script>` or a comment. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function attribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Page loaded by the mobile WebView (TG-52): the same Leaflet map as the web, with the markers
 * embedded as data. A tap on a marker goes back to React Native as `{"select": "<id>"}`.
 * Event titles come from the API, so they only enter the page as escaped JSON.
 */
export function buildLeafletHtml(markers: MapMarker[], label: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${LEAFLET_CSS}" integrity="${LEAFLET_CSS_SRI}" crossorigin="">
<script src="${LEAFLET_JS}" integrity="${LEAFLET_JS_SRI}" crossorigin=""></script>
<style>html, body, #map { height: 100%; margin: 0; background: #020510; }</style>
</head>
<body>
<div id="map" role="region" aria-label="${attribute(label)}"></div>
<script>
var markers = ${scriptJson(markers)};
var map = L.map('map', { worldCopyJump: true }).setView(${scriptJson(WORLD_CENTER)}, ${WORLD_ZOOM});
L.tileLayer(${JSON.stringify(CARTO_DARK_TILES)}, {
  attribution: ${JSON.stringify(CARTO_DARK_ATTRIBUTION)},
  subdomains: ${JSON.stringify(CARTO_DARK_SUBDOMAINS)},
  maxZoom: 19
}).addTo(map);
var points = [];
markers.forEach(function (m) {
  var marker = L.marker([m.latitude, m.longitude], { title: m.label, alt: m.label, keyboard: true });
  marker.on('click', function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({ select: m.id }));
  });
  marker.addTo(map);
  points.push([m.latitude, m.longitude]);
});
if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 6 });
</script>
</body>
</html>`;
}
