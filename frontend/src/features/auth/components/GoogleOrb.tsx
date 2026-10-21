import { View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import { GoogleMark } from './GoogleMark';

const ORB_SIZE = 32;
const ORB_BACKGROUND = '#FFFFFF';
const ORB_RIM = 'rgba(16,34,63,0.12)';
const ORB_SHADOW = '0 2px 6px rgba(16,34,63,0.25)';

/** White orb that holds the Google "G" (the brand needs a white background behind it). */
export function GoogleOrb() {
  const theme = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: ORB_SIZE,
        height: ORB_SIZE,
        borderRadius: theme.radii.pill,
        backgroundColor: ORB_BACKGROUND,
        borderWidth: 1,
        borderColor: ORB_RIM,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: ORB_SHADOW,
      }}
    >
      <GoogleMark />
    </View>
  );
}
