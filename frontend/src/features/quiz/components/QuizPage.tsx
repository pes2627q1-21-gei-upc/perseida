import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';

/** Scrolling column of the quiz views, inside the safe area and at a readable width. */
export function QuizPage({ title, children }: { title: string; children: ReactNode }) {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + spacing.md,
        paddingBottom: insets.bottom + spacing.xxl,
        paddingLeft: insets.left + spacing.md,
        paddingRight: insets.right + spacing.md,
      }}
    >
      <View style={[styles.column, { maxWidth: readingMaxWidth, gap: spacing.md }]}>
        <Text
          accessibilityRole="header"
          style={[typography.headline, { color: colors.text.primary }]}
        >
          {title}
        </Text>
        {children}
      </View>
    </ScrollView>
  );
}

/** A message the screen reader announces (notice or error), in a glass panel. */
export function QuizAlert({ message }: { message: string }) {
  const { colors, typography } = useTheme();

  return (
    <GlassPanel>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[typography.body, { color: colors.text.primary }]}
      >
        {message}
      </Text>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', alignSelf: 'center' },
});
