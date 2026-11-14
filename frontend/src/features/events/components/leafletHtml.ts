import { MARKER_SIZE, markerCss, markerIconHtml, type MarkerPalette } from './markerIcon';
import {
  BASE_MAP_ATTRIBUTION,
  BASE_MAP_MAX_ZOOM,
  BASE_MAP_TILES,
  FIT_BOUNDS_OPTIONS,
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

export interface MarkerStyle {
  palette: MarkerPalette;
  /** The system asks for reduced motion: the halo of the active events stands still. */
  reduceMotion: boolean;
}

/** Titles of the zoom buttons, in the language of the app (Leaflet's default is English). */
export interface ZoomTitles {
  zoomIn: string;
  zoomOut: string;
}

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
 * embedded as data and drawn as the glass orbs of their category. A tap on a marker goes back
 * to React Native as `{"select": "<id>"}`. Event titles come from the API, so they only enter
 * the page as escaped JSON; the orb HTML is built from our own constants.
 */
export function buildLeafletHtml(
  markers: MapMarker[],
  label: string,
  style: MarkerStyle,
  zoom: ZoomTitles,
): string {
  const data = markers.map((m) => ({ ...m, icon: markerIconHtml(m) }));
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${LEAFLET_CSS}" integrity="${LEAFLET_CSS_SRI}" crossorigin="">
<script src="${LEAFLET_JS}" integrity="${LEAFLET_JS_SRI}" crossorigin=""></script>
<style>html, body, #map { height: 100%; margin: 0; background: #020510; }
${markerCss(style.palette, { reduceMotion: style.reduceMotion })}</style>
</head>
<body>
<div id="map" role="region" aria-label="${attribute(label)}"></div>
<script>
var markers = ${scriptJson(data)};
var map = L.map('map', { worldCopyJump: true, zoomControl: false }).setView(${scriptJson(WORLD_CENTER)}, ${WORLD_ZOOM});
// The top of the map is under the notch and the floating bar of the screen.
L.control.zoom({ position: 'bottomright', zoomInTitle: ${scriptJson(zoom.zoomIn)}, zoomOutTitle: ${scriptJson(zoom.zoomOut)} }).addTo(map);
L.tileLayer(${JSON.stringify(BASE_MAP_TILES)}, {
  attribution: ${JSON.stringify(BASE_MAP_ATTRIBUTION)},
  maxZoom: ${BASE_MAP_MAX_ZOOM}
}).addTo(map);
var points = [];
markers.forEach(function (m) {
  var icon = L.divIcon({
    className: 'pm-marker',
    html: m.icon,
    iconSize: [${MARKER_SIZE}, ${MARKER_SIZE}],
    iconAnchor: [${MARKER_SIZE / 2}, ${MARKER_SIZE / 2}]
  });
  var marker = L.marker([m.latitude, m.longitude], { icon: icon, title: m.label, keyboard: true });
  marker.on('click', function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({ select: m.id }));
  });
  marker.addTo(map);
  points.push([m.latitude, m.longitude]);
});
if (points.length) map.fitBounds(points, ${scriptJson(FIT_BOUNDS_OPTIONS)});
</script>
</body>
</html>`;
}
