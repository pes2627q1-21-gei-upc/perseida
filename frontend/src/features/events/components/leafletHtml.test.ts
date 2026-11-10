import { buildLeafletHtml } from './leafletHtml';
import { BASE_MAP_ATTRIBUTION, BASE_MAP_TILES } from './mapTiles';

const MARKERS = [
  { id: 'e1', latitude: 28.5618, longitude: -80.577, label: 'Falcon 9 launch' },
  { id: 'e2', latitude: 41.39, longitude: 2.17, label: 'Barcelona event' },
];

describe('buildLeafletHtml', () => {
  it('loads the pinned Leaflet 1.9.4 with subresource integrity', () => {
    const html = buildLeafletHtml(MARKERS, 'Mapa');

    expect(html).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    expect(html).toContain('sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=');
    expect(html).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    expect(html).toContain('sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=');
    expect(html).toContain('crossorigin=""');
  });

  it('uses the base map tiles with their attribution', () => {
    const html = buildLeafletHtml(MARKERS, 'Mapa');

    expect(html).toContain(JSON.stringify(BASE_MAP_TILES));
    expect(html).toContain(JSON.stringify(BASE_MAP_ATTRIBUTION));
  });

  it('embeds every marker with its position and accessible label', () => {
    const html = buildLeafletHtml(MARKERS, 'Mapa');

    for (const marker of MARKERS) {
      expect(html).toContain(`"id":"${marker.id}"`);
      expect(html).toContain(`"latitude":${marker.latitude}`);
      expect(html).toContain(`"longitude":${marker.longitude}`);
      expect(html).toContain(`"label":"${marker.label}"`);
    }
  });

  it('labels the map region for screen readers', () => {
    expect(buildLeafletHtml(MARKERS, "Mapa d'esdeveniments")).toContain(
      'aria-label="Mapa d&#39;esdeveniments"',
    );
  });

  it('cannot be broken out of by text coming from the API', () => {
    const hostile = [
      { id: 'x', latitude: 0, longitude: 0, label: '</script><script>alert(1)</script>' },
    ];

    const html = buildLeafletHtml(hostile, '"><img src=x onerror=alert(1)>');

    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).not.toContain('<img src=x');
  });
});
