import { Text, View } from 'react-native';

import { useTheme } from '../../shared/theme';

/** Home route. Temporary: the APOD screen replaces it in the next commit (TG-118). */
export default function HomeScreen() {
  const theme = useTheme();
  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: theme.colors.sky.top }}
    >
      <Text style={[theme.typography.title, { color: theme.colors.text.primary }]}>Perseida</Text>
    </View>
  );
}
