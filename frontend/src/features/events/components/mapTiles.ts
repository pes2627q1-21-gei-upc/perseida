/**
 * Base map of the events map (TG-52, ADR-0031): Esri World Dark Gray raster tiles, which need
 * no API key, with the attribution Esri asks for. (CARTO Dark Matter now requires a key.)
 */
export const BASE_MAP_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
export const BASE_MAP_MAX_ZOOM = 16;
export const BASE_MAP_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community';

/** Whole world on first load; the map then fits the markers. */
export const WORLD_CENTER: [number, number] = [20, 0];
export const WORLD_ZOOM = 2;

/** One point on the map: an event with a location. */
export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  /** Accessible name of the marker (title of the event). */
  label: string;
}

export interface EventMapProps {
  markers: MapMarker[];
  /** Accessible name of the whole map region. */
  label: string;
  onSelect: (id: string) => void;
}
