// Reanimated needs its native worklets runtime, which does not run under Jest. This stand-in
// keeps the values and applies the styles once (no animation), which is enough for the tests
// of what the screens decide. Jest uses it by itself (a `__mocks__` file next to node_modules).
import { useState } from 'react';
import { View } from 'react-native';

const interpolate = (x: number, input: number[], output: number[]) => {
  if (x <= input[0]) return output[0];
  for (let i = 1; i < input.length; i += 1) {
    if (x <= input[i]) {
      const ratio = (x - input[i - 1]) / (input[i] - input[i - 1]);
      return output[i - 1] + ratio * (output[i] - output[i - 1]);
    }
  }
  return output[output.length - 1];
};

const Easing = {
  linear: 'linear',
  sin: 'sin',
  inOut: (easing: unknown) => easing,
};

export default { View };
export { Easing, interpolate };
export const Extrapolation = { CLAMP: 'clamp' };
export const cancelAnimation = () => undefined;
export const useReducedMotion = () => false;
export const useSharedValue = <T>(value: T) => {
  const [shared] = useState(() => ({ value }));
  return shared;
};
export const useAnimatedStyle = (style: () => object) => style();
export const withTiming = (value: number) => value;
export const withDelay = (_delay: number, animation: unknown) => animation;
export const withRepeat = (animation: unknown) => animation;
