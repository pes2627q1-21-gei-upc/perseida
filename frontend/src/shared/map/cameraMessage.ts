import { BASE_MAP_MAX_ZOOM, type MapCamera } from './mapTiles';

/** The JSON object a map page sends through the WebView, or undefined if it is anything else. */
export function parseMapMessage(data: string): object | undefined {
  try {
    const message: unknown = JSON.parse(data);
    return typeof message === 'object' && message !== null ? message : undefined;
  } catch {
    // Not a message from the map page.
    return undefined;
  }
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** The camera the page reports after a move, only if it is a real place on the map. */
export function reportedCamera(message: object): MapCamera | undefined {
  if (!('view' in message)) return undefined;
  const { view } = message as { view: unknown };
  if (typeof view !== 'object' || view === null) return undefined;
  const { latitude, longitude, zoom } = view as Record<string, unknown>;
  if (!inRange(latitude, -90, 90) || !inRange(longitude, -180, 180)) return undefined;
  if (!inRange(zoom, 0, BASE_MAP_MAX_ZOOM)) return undefined;
  return { latitude, longitude, zoom };
}
