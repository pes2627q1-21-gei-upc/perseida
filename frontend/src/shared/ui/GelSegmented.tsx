import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme';

/** Same limit as GelButton: the highlight never lightens the body under the text. */
const HIGHLIGHT_HEIGHT = '46%';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Decorative icon before the label, drawn in the given colour; the label carries the meaning. */
  icon?: (color: string) => ReactNode;
}

interface Props<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Name of the whole control for screen readers. */
  accessibilityLabel: string;
  /**
   * `tabs` when each option shows another view of the screen; `choice` when the options
   * filter or set something (announced as radio buttons, checked or not).
   */
  kind?: 'tabs' | 'choice';
}

/**
 * Gel pill with segments (TG-52): the selected segment is gel, the others are quiet text on
 * the glass under it. Announced as a tab list or as a group of radio buttons (`kind`).
 */
export function GelSegmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  kind = 'tabs',
}: Props<T>) {
  const theme = useTheme();
  const { gel, surface, text } = theme.colors;

  return (
    <View
      accessibilityRole={kind === 'tabs' ? 'tablist' : 'radiogroup'}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        {
          borderRadius: theme.radii.pill,
          borderColor: surface.glassBorder,
          padding: theme.spacing.xs,
          gap: theme.spacing.xs,
        },
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const color = selected ? gel.text : text.primary;
        return (
          <Pressable
            key={option.value}
            accessibilityRole={kind === 'tabs' ? 'tab' : 'radio'}
            accessibilityLabel={option.label}
            accessibilityState={kind === 'tabs' ? { selected } : { checked: selected }}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            style={{
              flex: 1,
              minHeight: theme.touch.min,
              borderRadius: theme.radii.pill,
              overflow: 'hidden',
              boxShadow: selected ? `0 4px 12px ${gel.rim}99` : undefined,
            }}
          >
            {selected && (
              <>
                <LinearGradient colors={gel.body} style={StyleSheet.absoluteFill} />
                <LinearGradient
                  colors={gel.highlight}
                  style={[styles.highlight, { height: HIGHLIGHT_HEIGHT }]}
                  pointerEvents="none"
                />
              </>
            )}
            <View
              style={[
                styles.content,
                { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
              ]}
            >
              {option.icon?.(color)}
              <Text style={[theme.typography.bodyStrong, { color }]}>{option.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderWidth: 1 },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
