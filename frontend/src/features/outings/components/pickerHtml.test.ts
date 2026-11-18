import {
  LEAFLET_CSS,
  LEAFLET_CSS_SRI,
  LEAFLET_JS,
  LEAFLET_JS_SRI,
} from '../../../shared/map/leaflet';
import {
  BASE_MAP_MAX_ZOOM,
  BASE_MAP_TILES,
  MAP_ATTRIBUTION_PREFIX,
} from '../../../shared/map/mapTiles';
import { buildPickerHtml } from './pickerHtml';

const CAMERA = { latitude: 41.4, longitude: 2.1, zoom: 8 };
const ZOOM = { zoomIn: 'Apropa', zoomOut: 'Allunya' };

function build(overrides: { label?: string; zoom?: typeof ZOOM } = {}) {
  return buildPickerHtml({
    camera: CAMERA,
    label: overrides.label ?? 'Mapa per triar el lloc',
    background: '#0A1020',
    zoom: overrides.zoom ?? ZOOM,
  });
}

describe('buildPickerHtml', () => {
  it('loads the pinned Leaflet with its integrity hashes', () => {
    const html = build();

    expect(html).toContain(`src="${LEAFLET_JS}" integrity="${LEAFLET_JS_SRI}"`);
    expect(html).toContain(`href="${LEAFLET_CSS}" integrity="${LEAFLET_CSS_SRI}"`);
  });

  it('opens at the camera it is given', () => {
    expect(build()).toContain('.setView([41.4,2.1], 8)');
  });

  it('draws the base map tiles with the credits of the events map', () => {
    const html = build();

    expect(html).toContain(JSON.stringify(BASE_MAP_TILES));
    expect(html).toContain(`maxZoom: ${BASE_MAP_MAX_ZOOM}`);
    expect(html).toContain(JSON.stringify(MAP_ATTRIBUTION_PREFIX));
  });

  it('paints the page with the background it is given', () => {
    expect(build()).toContain('background: #0A1020');
  });

  it('reports every move of the camera back to the app', () => {
    const html = build();

    expect(html).toContain("map.on('moveend'");
    expect(html).toContain('window.ReactNativeWebView.postMessage(JSON.stringify({ view:');
  });

  it('has no markers: the reticle is part of the screen, not of the map', () => {
    expect(build()).not.toContain('L.marker');
  });

  it('names the map region, escaping the label in the attribute', () => {
    const html = build({ label: 'Mapa "x" <b>' });

    expect(html).toContain('aria-label="Mapa &quot;x&quot; &lt;b&gt;"');
  });

  it('puts the titles of the zoom buttons in the page as safe JSON', () => {
    const html = build({ zoom: { zoomIn: 'Apropa', zoomOut: '</script><x>' } });

    expect(html).toContain('zoomInTitle: "Apropa"');
    expect(html).toContain('zoomOutTitle: "\\u003c/script>\\u003cx>"');
    expect(html).not.toContain('</script><x>');
  });
});
