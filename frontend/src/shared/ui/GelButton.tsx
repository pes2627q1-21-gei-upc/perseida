import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme';

/** The highlight covers the top 46 % so it never lightens the body under the text (tokens.md). */
const HIGHLIGHT_HEIGHT = '46%';

interface Props {
  label: string;
  onPress: () => void;
  accessibilityHint?: string;
}

/** Main action button with the "gel" material. Simple version: no sound or animation yet. */
export function GelButton({ label, onPress, accessibilityHint }: Props) {
  const theme = useTheme();
  const { gel } = theme.colors;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={{
        minHeight: theme.touch.min,
        borderRadius: theme.radii.pill,
        overflow: 'hidden',
        boxShadow: `0 8px 20px ${gel.rim}99`,
      }}
    >
      {({ pressed }) => (
        <>
          <LinearGradient
            colors={pressed ? [gel.bodyPressed, gel.bodyPressed] : gel.body}
            style={StyleSheet.absoluteFill}
          />
          {!pressed && (
            <LinearGradient
              colors={gel.highlight}
              style={[styles.highlight, { height: HIGHLIGHT_HEIGHT }]}
              pointerEvents="none"
            />
          )}
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.rim,
              { borderRadius: theme.radii.pill, borderColor: gel.rim },
            ]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.content,
              { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm },
            ]}
          >
            <Text style={[theme.typography.bodyStrong, { color: gel.text }]}>{label}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  highlight: { position: 'absolute', top: 0, left: 0, right: 0 },
  rim: { borderWidth: 1, opacity: 0.5 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
