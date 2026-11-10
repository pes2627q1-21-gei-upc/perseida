import { BASE_MAP_ATTRIBUTION, BASE_MAP_MAX_ZOOM, BASE_MAP_TILES } from './mapTiles';

// Regression (TG-52, task #488): CARTO now answers "API key required" tiles. The base map is
// Esri World Dark Gray, which needs no key, with its attribution visible.
describe('base map', () => {
  it('uses the Esri World Dark Gray tiles, which need no API key', () => {
    expect(BASE_MAP_TILES).toBe(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    );
    expect(BASE_MAP_MAX_ZOOM).toBe(16);
  });

  it('credits Esri and OpenStreetMap', () => {
    expect(BASE_MAP_ATTRIBUTION).toContain('Esri');
    expect(BASE_MAP_ATTRIBUTION).toContain('OpenStreetMap');
  });
});
