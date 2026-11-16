import { Image } from 'react-native';

import googleG from '../../../../assets/google/google-g.png';

// Official asset of the Sign in with Google branding guidelines (icon button, light theme,
// circle), unmodified and byte-identical to the download. See assets/google/README.md.
const SIZE = 40;

/**
 * The Google "G" on its white circle, exactly as Google distributes it. Brand rule: do not
 * redraw, recolour or restyle it. Decorative: the button label carries the meaning.
 */
export function GoogleLogo() {
  return (
    <Image
      source={googleG}
      style={{ width: SIZE, height: SIZE }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
