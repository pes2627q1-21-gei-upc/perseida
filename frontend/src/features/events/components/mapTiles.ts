import type { EventCategory } from '../api/getEvents';

/**
 * Base map of the events map (TG-52, ADR-0032): Esri World Dark Gray raster tiles, which need
 * no API key. (CARTO Dark Matter now requires a key.) The attribution stays on the map, short
 * enough for one line on a phone: Esri and its data providers, and OpenStreetMap, with links
 * to their full credits (OpenStreetMap's copyright page).
 */
export const BASE_MAP_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
export const BASE_MAP_MAX_ZOOM = 16;
/** Credit links open in a new tab: following one on the web must not lose the map's state. */
const NEW_TAB = 'target="_blank" rel="noopener noreferrer"';
export const BASE_MAP_ATTRIBUTION = `&copy; <a href="https://www.esri.com/" ${NEW_TAB}>Esri</a>, HERE, Garmin &middot; &copy; <a href="https://www.openstreetmap.org/copyright" ${NEW_TAB}>OpenStreetMap</a>`;
/** Replaces Leaflet's default prefix, whose link opens in the same tab. */
export const MAP_ATTRIBUTION_PREFIX = `<a href="https://leafletjs.com/" ${NEW_TAB}>Leaflet</a>`;

/** Whole world on first load; the map then fits the markers. */
export const WORLD_CENTER: [number, number] = [20, 0];
export const WORLD_ZOOM = 2;

/** How the map fits the markers: room for the orbs at the edges, and never closer than a region. */
export const FIT_BOUNDS_OPTIONS = { padding: [40, 40] as [number, number], maxZoom: 6 };

/** One point on the map: an event with a location. */
export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  /** Accessible name of the marker (title, category and state of the event). */
  label: string;
  /** Chooses the icon inside the orb. */
  category: EventCategory;
  /** Happening now: the orb has a pulsing halo. */
  active: boolean;
}

export interface EventMapProps {
  markers: MapMarker[];
  /** Accessible name of the whole map region. */
  label: string;
  onSelect: (id: string) => void;
}
