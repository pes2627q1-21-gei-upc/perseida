import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { Apod } from '../api/getApodToday';
import { formatApodDate } from '../formatApodDate';
import { apodStrings } from '../strings';

const MEDIA_ASPECT_RATIO = 4 / 3;

interface Props {
  apod: Apod;
}

/** Content of the APOD screen (TG-118). The media slot is filled in TG-119. */
export function ApodView({ apod }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { colors, spacing, typography } = theme;

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
        <View
          accessible
          accessibilityLabel={apodStrings.mediaPlaceholderLabel}
          style={{
            aspectRatio: MEDIA_ASPECT_RATIO,
            borderRadius: theme.radii.lg,
            borderWidth: 1,
            borderColor: colors.surface.glassBorder,
            backgroundColor: colors.surface.glass,
          }}
        />

        <View style={{ gap: spacing.xs }}>
          <Text
            accessibilityRole="header"
            style={[typography.headline, { color: colors.text.primary }]}
          >
            {apod.title}
          </Text>
          <Text style={[typography.bodyStrong, { color: colors.text.secondary }]}>
            {formatApodDate(apod.date)}
          </Text>
        </View>

        <GlassPanel>
          <View style={{ gap: spacing.md }}>
            <Text style={[typography.body, { color: colors.text.primary }]}>
              {apod.explanation}
            </Text>
            {apod.copyright ? (
              <Text style={[typography.caption, { color: colors.text.secondary }]}>
                {`${apodStrings.copyrightPrefix} ${apod.copyright}`}
              </Text>
            ) : null}
          </View>
        </GlassPanel>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', alignSelf: 'center' },
});
