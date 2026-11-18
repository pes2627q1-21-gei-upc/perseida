import {
  BASE_MAP_ATTRIBUTION,
  BASE_MAP_MAX_ZOOM,
  BASE_MAP_TILES,
  MAP_ATTRIBUTION_PREFIX,
} from './mapTiles';

const NEW_TAB = 'target="_blank" rel="noopener noreferrer"';

// Regression (TG-52, task #488): CARTO now answers "API key required" tiles. The base map is
// Esri World Dark Gray, which needs no key, with its attribution visible.
describe('base map', () => {
  it('uses the Esri World Dark Gray tiles, which need no API key', () => {
    expect(BASE_MAP_TILES).toBe(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    );
    expect(BASE_MAP_MAX_ZOOM).toBe(16);
  });

  it('credits Esri, its data providers and OpenStreetMap', () => {
    expect(BASE_MAP_ATTRIBUTION).toContain('Esri');
    expect(BASE_MAP_ATTRIBUTION).toContain('HERE, Garmin');
    expect(BASE_MAP_ATTRIBUTION).toContain('OpenStreetMap');
  });

  it('is short enough for one line on a phone, with links to the full credits', () => {
    const visibleText = BASE_MAP_ATTRIBUTION.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '·');

    expect(visibleText.length).toBeLessThanOrEqual(40);
    expect(BASE_MAP_ATTRIBUTION).toContain(`<a href="https://www.esri.com/" ${NEW_TAB}>Esri</a>`);
    expect(BASE_MAP_ATTRIBUTION).toContain(
      `<a href="https://www.openstreetmap.org/copyright" ${NEW_TAB}>OpenStreetMap</a>`,
    );
  });

  it('credits Leaflet without the default prefix, with its link in a new tab', () => {
    expect(MAP_ATTRIBUTION_PREFIX).toBe(`<a href="https://leafletjs.com/" ${NEW_TAB}>Leaflet</a>`);
  });

  it('opens every credit link in a new tab, so the map keeps its filter and selection', () => {
    const links = `${MAP_ATTRIBUTION_PREFIX} ${BASE_MAP_ATTRIBUTION}`.match(/<a [^>]*>/g) ?? [];

    expect(links).toHaveLength(3);
    links.forEach((link) => expect(link).toContain(NEW_TAB));
  });
});
