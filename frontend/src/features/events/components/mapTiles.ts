/**
 * Base map of the events map (TG-52, ADR-0031): CARTO Dark Matter raster tiles over
 * OpenStreetMap data. Free with this attribution visible; no API key.
 */
export const CARTO_DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const CARTO_DARK_SUBDOMAINS = 'abcd';
export const CARTO_DARK_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

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
