import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { Apod } from '../api/getApodToday';
import { formatApodDate } from '../formatApodDate';
import { ApodMedia } from './ApodMedia';

interface Props {
  apod: Apod;
}

/** Content of the APOD screen (TG-118), with the media from TG-119. */
export function ApodView({ apod }: Props) {
  const { i18n } = useTranslation();
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
        {/* A new APOD remounts the media, so a previous load failure or aspect ratio does not stick. */}
        <ApodMedia key={apod.url} apod={apod} />

        <View style={{ gap: spacing.xs }}>
          <Text
            accessibilityRole="header"
            style={[typography.headline, { color: colors.text.primary }]}
          >
            {apod.title}
          </Text>
          <Text style={[typography.bodyStrong, { color: colors.text.secondary }]}>
            {formatApodDate(apod.date, i18n.language)}
          </Text>
        </View>

        <GlassPanel>
          <View style={{ gap: spacing.md }}>
            <Text style={[typography.body, { color: colors.text.primary }]}>
              {apod.explanation}
            </Text>
            {apod.copyright ? (
              <Text style={[typography.caption, { color: colors.text.secondary }]}>
                {`© ${apod.copyright}`}
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
