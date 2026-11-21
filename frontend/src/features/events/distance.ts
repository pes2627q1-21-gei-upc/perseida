/** A point on the Earth, in degrees (WGS 84). */
export interface Position {
  latitude: number;
  longitude: number;
}

/** Mean radius of the Earth, in kilometres. */
const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in kilometres (haversine). */
export function distanceKm(from: Position, to: Position): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  // min() keeps rounding errors from leaving the domain of asin between antipodes.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
