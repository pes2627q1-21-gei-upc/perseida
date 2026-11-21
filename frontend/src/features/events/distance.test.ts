import { distanceKm } from './distance';

const BARCELONA = { latitude: 41.3874, longitude: 2.1686 };
const MADRID = { latitude: 40.4168, longitude: -3.7038 };

describe('distanceKm (TG-51, criterion 6: distance when «Near me» is on)', () => {
  it('gives the great-circle distance in kilometres (haversine, R = 6371 km)', () => {
    expect(distanceKm(BARCELONA, MADRID)).toBeGreaterThanOrEqual(503);
    expect(distanceKm(BARCELONA, MADRID)).toBeLessThanOrEqual(507);
  });

  it('is zero between a point and itself', () => {
    expect(distanceKm(BARCELONA, BARCELONA)).toBe(0);
  });

  it('is the same in both directions', () => {
    expect(distanceKm(MADRID, BARCELONA)).toBeCloseTo(distanceKm(BARCELONA, MADRID), 6);
  });

  it('is half the circumference of a 6371 km sphere between antipodes', () => {
    const antipodes = distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });

    expect(antipodes).toBeCloseTo(Math.PI * 6371, 3);
  });

  it('measures across the antimeridian by the short way', () => {
    const across = distanceKm({ latitude: 0, longitude: 179 }, { latitude: 0, longitude: -179 });

    // Two degrees of the equator, not 358.
    expect(across).toBeCloseTo((2 * Math.PI * 6371) / 180, 3);
  });
});
