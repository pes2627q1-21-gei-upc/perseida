import type { ClassifiedEvent } from './classifyEvents';
import type { MapMarker } from './components/mapTiles';

/**
 * Markers of the map: only the events with a location can go on it; the rest are in the list
 * view. `labelOf` gives each marker its accessible name.
 */
export function toMapMarkers(
  events: readonly ClassifiedEvent[],
  labelOf: (event: ClassifiedEvent) => string,
): MapMarker[] {
  return events.flatMap((event) =>
    event.location
      ? [
          {
            id: event.id,
            latitude: event.location.latitude,
            longitude: event.location.longitude,
            label: labelOf(event),
            category: event.category,
            active: event.status === 'active',
          },
        ]
      : [],
  );
}
