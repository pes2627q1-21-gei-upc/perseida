jest.mock('react-native-reanimated', () => ({
  Easing: {},
  Extrapolation: { CLAMP: 'clamp' },
  // Piecewise-linear like the real one, clamped at both ends.
  interpolate: (x: number, input: number[], output: number[]) => {
    if (x <= input[0]) return output[0];
    for (let i = 1; i < input.length; i += 1) {
      if (x <= input[i]) {
        const ratio = (x - input[i - 1]) / (input[i] - input[i - 1]);
        return output[i - 1] + ratio * (output[i] - output[i - 1]);
      }
    }
    return output[output.length - 1];
  },
}));

import { STREAK_ROTATION_DEG, TRAVEL_DIRECTION, flightPose } from './PerseidShower';

const TRAVEL = 400;

describe('PerseidShower geometry', () => {
  it('falls to the lower left, as the Perseids do (y grows downwards on screen)', () => {
    const pose = flightPose(0.5, TRAVEL);

    expect(pose.dx).toBeLessThan(0);
    expect(pose.dy).toBeGreaterThan(0);
    expect(TRAVEL_DIRECTION.x).toBeLessThan(0);
    expect(TRAVEL_DIRECTION.y).toBeGreaterThan(0);
  });

  it('moves along its own direction: the offset is parallel to the travel vector', () => {
    const { dx, dy } = flightPose(0.7, TRAVEL);

    expect(dy / dx).toBeCloseTo(TRAVEL_DIRECTION.y / TRAVEL_DIRECTION.x, 6);
  });

  it('trails its tail behind the head: the bar points opposite to the travel', () => {
    // RN rotates clockwise on screen: a bar whose head is on the left and tail on the right
    // points along (cos, sin) of the rotation once rotated about the head.
    const radians = (STREAK_ROTATION_DEG * Math.PI) / 180;
    const tail = { x: Math.cos(radians), y: Math.sin(radians) };

    expect(tail.x * TRAVEL_DIRECTION.x + tail.y * TRAVEL_DIRECTION.y).toBeCloseTo(-1, 6);
    expect(tail.x).toBeGreaterThan(0);
    expect(tail.y).toBeLessThan(0);
  });

  it('only ever moves forward: the head never goes back', () => {
    const steps = Array.from({ length: 21 }, (_, i) => flightPose(i / 20, TRAVEL));

    steps.slice(1).forEach((pose, i) => {
      expect(pose.dx).toBeLessThanOrEqual(steps[i].dx);
      expect(pose.dy).toBeGreaterThanOrEqual(steps[i].dy);
    });
  });

  it('is invisible at both ends of the flight and visible in between: no pop in or out', () => {
    expect(flightPose(0, TRAVEL).opacity).toBe(0);
    expect(flightPose(1, TRAVEL).opacity).toBe(0);
    expect(flightPose(0.3, TRAVEL).opacity).toBeGreaterThan(0.5);
  });

  it('fades smoothly: no jump in opacity between neighbouring frames', () => {
    const opacities = Array.from({ length: 101 }, (_, i) => flightPose(i / 100, TRAVEL).opacity);

    opacities.slice(1).forEach((opacity, i) => {
      expect(Math.abs(opacity - opacities[i])).toBeLessThan(0.1);
    });
  });

  it('draws the tail longer at full speed than at the start and at the end', () => {
    const start = flightPose(0, TRAVEL).stretch;
    const middle = flightPose(0.3, TRAVEL).stretch;
    const end = flightPose(1, TRAVEL).stretch;

    expect(middle).toBeGreaterThan(start);
    expect(middle).toBeGreaterThan(end);
  });
});
