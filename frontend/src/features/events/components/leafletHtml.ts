import {
  LEAFLET_CSS,
  LEAFLET_CSS_SRI,
  LEAFLET_JS,
  LEAFLET_JS_SRI,
  attribute,
  scriptJson,
} from '../../../shared/map/leaflet';
import { MARKER_SIZE, markerCss, markerIconHtml, type MarkerPalette } from './markerIcon';
import {
  BASE_MAP_ATTRIBUTION,
  BASE_MAP_MAX_ZOOM,
  BASE_MAP_TILES,
  FIT_BOUNDS_OPTIONS,
  MAP_ATTRIBUTION_PREFIX,
  type MapCamera,
  type MapMarker,
  WORLD_CENTER,
  WORLD_ZOOM,
} from '../../../shared/map/mapTiles';

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

/**
 * Page loaded by the mobile WebView (TG-52): the same Leaflet map as the web, with the markers
 * embedded as data and drawn as the glass orbs of their category. A tap on a marker goes back
 * to React Native as `{"select": "<id>"}`. Event titles come from the API, so they only enter
 * the page as escaped JSON; the orb HTML is built from our own constants.
 * Every camera move goes back as `{"view": {latitude, longitude, zoom}}`. With a `camera`, the
 * page opens there and does not fit the markers: a reload for new markers keeps the user's view.
 */
export function buildLeafletHtml(
  markers: MapMarker[],
  label: string,
  style: MarkerStyle,
  zoom: ZoomTitles,
  camera?: MapCamera,
): string {
  const data = markers.map((m) => ({ ...m, icon: markerIconHtml(m) }));
  const start = camera
    ? `${scriptJson([camera.latitude, camera.longitude])}, ${scriptJson(camera.zoom)}`
    : `${scriptJson(WORLD_CENTER)}, ${WORLD_ZOOM}`;
  const fit = camera
    ? ''
    : `if (points.length) map.fitBounds(points, ${scriptJson(FIT_BOUNDS_OPTIONS)});\n`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${LEAFLET_CSS}" integrity="${LEAFLET_CSS_SRI}" crossorigin="">
<script src="${LEAFLET_JS}" integrity="${LEAFLET_JS_SRI}" crossorigin=""></script>
<style>html, body, #map { height: 100%; margin: 0; background: ${style.palette.background}; }
${markerCss(style.palette, { reduceMotion: style.reduceMotion })}</style>
</head>
<body>
<div id="map" role="region" aria-label="${attribute(label)}"></div>
<script>
var markers = ${scriptJson(data)};
var map = L.map('map', { worldCopyJump: true, zoomControl: false }).setView(${start});
map.on('moveend', function () {
  var c = map.getCenter().wrap();
  window.ReactNativeWebView.postMessage(JSON.stringify({ view: { latitude: c.lat, longitude: c.lng, zoom: map.getZoom() } }));
});
// The top of the map is under the notch and the floating bar of the screen.
L.control.zoom({ position: 'bottomright', zoomInTitle: ${scriptJson(zoom.zoomIn)}, zoomOutTitle: ${scriptJson(zoom.zoomOut)} }).addTo(map);
L.tileLayer(${JSON.stringify(BASE_MAP_TILES)}, {
  attribution: ${JSON.stringify(BASE_MAP_ATTRIBUTION)},
  maxZoom: ${BASE_MAP_MAX_ZOOM}
}).addTo(map);
map.attributionControl.setPrefix(${JSON.stringify(MAP_ATTRIBUTION_PREFIX)});
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
${fit}</script>
</body>
</html>`;
}
