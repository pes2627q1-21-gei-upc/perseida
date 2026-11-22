import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'phosphor-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme';

/** Same limit as GelButton: the highlight never lightens the body under the text. */
const HIGHLIGHT_HEIGHT = '46%';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * Chip of a multiple choice (TG-51), announced as a checkbox. Chosen, it is gel with a tick
 * (not only colour tells it apart); not chosen, a thin glass-coloured rim like QuietButton.
 */
export function GelChip({ label, selected, onPress, testID }: Props) {
  const theme = useTheme();
  const { gel, surface, text } = theme.colors;
  const color = selected ? gel.text : text.primary;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        minHeight: theme.touch.min,
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: selected ? gel.rim : surface.glassBorder,
        overflow: 'hidden',
        boxShadow: selected ? `0 4px 12px ${gel.rim}99` : undefined,
      }}
    >
      {({ pressed }) => (
        <>
          {selected && (
            <>
              <LinearGradient
                colors={pressed ? [gel.bodyPressed, gel.bodyPressed] : gel.body}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={gel.highlight}
                style={[styles.highlight, { height: HIGHLIGHT_HEIGHT }]}
                pointerEvents="none"
              />
            </>
          )}
          {!selected && pressed && (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: surface.onGlass }]}
              pointerEvents="none"
            />
          )}
          <View
            style={[
              styles.content,
              {
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
              },
            ]}
          >
            {selected && <Check size={theme.iconSizes.sm} color={color} weight="bold" />}
            <Text style={[theme.typography.bodyStrong, { color }]}>{label}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  highlight: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
