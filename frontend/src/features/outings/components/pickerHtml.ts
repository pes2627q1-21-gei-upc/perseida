import {
  attribute,
  LEAFLET_CSS,
  LEAFLET_CSS_SRI,
  LEAFLET_JS,
  LEAFLET_JS_SRI,
  scriptJson,
} from '../../../shared/map/leaflet';
import {
  BASE_MAP_ATTRIBUTION,
  BASE_MAP_MAX_ZOOM,
  BASE_MAP_TILES,
  MAP_ATTRIBUTION_PREFIX,
  type MapCamera,
} from '../../../shared/map/mapTiles';

interface PickerPage {
  /** Where the map opens. */
  camera: MapCamera;
  /** Accessible name of the map region. */
  label: string;
  /** Page colour behind the tiles. */
  background: string;
  /** Titles of the zoom buttons, in the language of the app (Leaflet's default is English). */
  zoom: { zoomIn: string; zoomOut: string };
}

/**
 * Page loaded by the mobile WebView to choose a place (TG-629): the same Leaflet map as the
 * events map, with no markers. The reticle is drawn by the screen, over the middle of the map;
 * the page only sends the camera back after every move as
 * `{"view": {latitude, longitude, zoom}}`, and the place is the centre.
 */
export function buildPickerHtml({ camera, label, background, zoom }: PickerPage): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${LEAFLET_CSS}" integrity="${LEAFLET_CSS_SRI}" crossorigin="">
<script src="${LEAFLET_JS}" integrity="${LEAFLET_JS_SRI}" crossorigin=""></script>
<style>html, body, #map { height: 100%; margin: 0; background: ${background}; }</style>
</head>
<body>
<div id="map" role="region" aria-label="${attribute(label)}"></div>
<script>
var map = L.map('map', { worldCopyJump: true, zoomControl: false }).setView(${scriptJson([camera.latitude, camera.longitude])}, ${camera.zoom});
map.on('moveend', function () {
  var c = map.getCenter().wrap();
  window.ReactNativeWebView.postMessage(JSON.stringify({ view: { latitude: c.lat, longitude: c.lng, zoom: map.getZoom() } }));
});
L.control.zoom({ position: 'bottomright', zoomInTitle: ${scriptJson(zoom.zoomIn)}, zoomOutTitle: ${scriptJson(zoom.zoomOut)} }).addTo(map);
L.tileLayer(${JSON.stringify(BASE_MAP_TILES)}, {
  attribution: ${JSON.stringify(BASE_MAP_ATTRIBUTION)},
  maxZoom: ${BASE_MAP_MAX_ZOOM}
}).addTo(map);
map.attributionControl.setPrefix(${JSON.stringify(MAP_ATTRIBUTION_PREFIX)});
</script>
</body>
</html>`;
}
