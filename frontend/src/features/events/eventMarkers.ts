import type { ClassifiedEvent } from './classifyEvents';
import type { Outing } from '../outings/api/outings';
import type { MapMarker } from '../../shared/map/mapTiles';

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
            kind: 'event' as const,
            category: event.category,
            active: event.status === 'active',
          },
        ]
      : [],
  );
}

/** Markers of the outings: only the ones with a location. `labelOf` gives each its accessible name. */
export function toOutingMarkers(
  outings: readonly Outing[],
  labelOf: (outing: Outing) => string,
): MapMarker[] {
  return outings.flatMap((outing) =>
    outing.location
      ? [
          {
            id: outing.id,
            latitude: outing.location.latitude,
            longitude: outing.location.longitude,
            label: labelOf(outing),
            kind: 'outing' as const,
            active: false,
          },
        ]
      : [],
  );
}
