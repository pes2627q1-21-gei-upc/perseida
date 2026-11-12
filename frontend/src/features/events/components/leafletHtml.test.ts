import { colors } from '../../../shared/theme';
import { buildLeafletHtml } from './leafletHtml';
import { MARKER_SIZE, markerCss, markerIconHtml, markerPalette } from './markerIcon';
import { BASE_MAP_ATTRIBUTION, BASE_MAP_TILES, type MapMarker } from './mapTiles';

const MARKERS: MapMarker[] = [
  {
    id: 'e1',
    latitude: 28.5618,
    longitude: -80.577,
    label: 'Falcon 9 launch',
    category: 'launch',
    active: true,
  },
  {
    id: 'e2',
    latitude: 41.39,
    longitude: 2.17,
    label: 'Barcelona event',
    category: 'lunar',
    active: false,
  },
];
const STYLE = { palette: markerPalette(colors.nit), reduceMotion: false };

describe('buildLeafletHtml', () => {
  it('loads the pinned Leaflet 1.9.4 with subresource integrity', () => {
    const html = buildLeafletHtml(MARKERS, 'Mapa', STYLE);

    expect(html).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    expect(html).toContain('sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=');
    expect(html).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    expect(html).toContain('sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=');
    expect(html).toContain('crossorigin=""');
  });

  it('uses the base map tiles with their attribution', () => {
    const html = buildLeafletHtml(MARKERS, 'Mapa', STYLE);

    expect(html).toContain(JSON.stringify(BASE_MAP_TILES));
    expect(html).toContain(JSON.stringify(BASE_MAP_ATTRIBUTION));
  });

  it('embeds every marker with its position and accessible label', () => {
    const html = buildLeafletHtml(MARKERS, 'Mapa', STYLE);

    for (const marker of MARKERS) {
      expect(html).toContain(`"id":"${marker.id}"`);
      expect(html).toContain(`"latitude":${marker.latitude}`);
      expect(html).toContain(`"longitude":${marker.longitude}`);
      expect(html).toContain(`"label":"${marker.label}"`);
    }
  });

  it('draws each marker as a glass orb of its category, not the default Leaflet pin', () => {
    const html = buildLeafletHtml(MARKERS, 'Mapa', STYLE);

    expect(html).toContain('L.divIcon(');
    expect(html).toContain(`iconSize: [${MARKER_SIZE}, ${MARKER_SIZE}]`);
    for (const marker of MARKERS) {
      expect(html).toContain(JSON.stringify(markerIconHtml(marker)).replace(/</g, '\\u003c'));
    }
    expect(html).toContain(markerCss(STYLE.palette, { reduceMotion: false }));
  });

  it('freezes the halo when the app asks for reduced motion', () => {
    const html = buildLeafletHtml(MARKERS, 'Mapa', { ...STYLE, reduceMotion: true });

    expect(html).toContain(markerCss(STYLE.palette, { reduceMotion: true }));
    expect(html).not.toContain('pm-pulse');
  });

  it('puts the zoom buttons at the bottom right, away from the notch and the top bar', () => {
    const html = buildLeafletHtml(MARKERS, 'Mapa', STYLE);

    expect(html).toContain('zoomControl: false');
    expect(html).toContain("L.control.zoom({ position: 'bottomright' }).addTo(map);");
  });

  it('labels the map region for screen readers', () => {
    expect(buildLeafletHtml(MARKERS, "Mapa d'esdeveniments", STYLE)).toContain(
      'aria-label="Mapa d&#39;esdeveniments"',
    );
  });

  it('cannot be broken out of by text coming from the API', () => {
    const hostile: MapMarker[] = [
      {
        id: 'x',
        latitude: 0,
        longitude: 0,
        label: '</script><script>alert(1)</script>',
        category: 'launch',
        active: false,
      },
    ];

    const html = buildLeafletHtml(hostile, '"><img src=x onerror=alert(1)>', STYLE);

    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).not.toContain('<img src=x');
  });
});
