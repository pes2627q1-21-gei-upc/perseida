import { X } from 'phosphor-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { safeHttpsUrl } from '../../../shared/security/safeUrl';
import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { ClassifiedEvent } from '../classifyEvents';
import { formatEventDateTime, formatEventWhere } from '../formatEvent';
import { EventOrb } from './EventOrb';

/** The content scrolls inside the sheet past this share of the screen. */
const MAX_CONTENT_SHARE = 0.6;
/** The sheet rises this far as it fades in. */
const ENTER_OFFSET = 24;

interface Props {
  /** The event to show; `null` hides the sheet. */
  event: ClassifiedEvent | null;
  onClose: () => void;
}

function DateRow({ label, value }: { label: string; value: string }) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.dateRow, { gap: spacing.md }]}>
      <Text style={[typography.caption, { minWidth: spacing.xxl, color: colors.text.secondary }]}>
        {label}
      </Text>
      <Text style={[typography.bodyStrong, styles.dateValue, { color: colors.text.primary }]}>
        {value}
      </Text>
    </View>
  );
}

function SheetContent({ event, onClose }: { event: ClassifiedEvent; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { colors, spacing, typography } = theme;

  // Enters with a short ease-out; leaves at once (exit faster than enter). Still with reduced motion.
  const shown = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    shown.value = withTiming(1, {
      duration: theme.duration.base,
      easing: Easing.out(Easing.cubic),
    });
  }, [reduceMotion, shown, theme.duration.base]);
  const enter = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * ENTER_OFFSET }],
  }));

  const source = safeHttpsUrl(event.source_url);
  const active = event.status === 'active';

  return (
    <View style={styles.root}>
      {/* Tapping outside the sheet closes it; the close button is what screen readers get. */}
      <Pressable
        testID="event-sheet-backdrop"
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Animated.View
        style={[
          styles.sheet,
          {
            maxWidth: readingMaxWidth,
            paddingBottom: insets.bottom + spacing.sm,
            paddingLeft: insets.left + spacing.md,
            paddingRight: insets.right + spacing.md,
          },
          enter,
        ]}
      >
        <GlassPanel>
          <View style={{ gap: spacing.md }}>
            <View style={[styles.header, { gap: spacing.md }]}>
              <EventOrb category={event.category} active={active} />
              <View style={[styles.headerText, { gap: spacing.xs }]}>
                <Text
                  accessibilityRole="header"
                  style={[typography.title, { color: colors.text.primary }]}
                >
                  {event.title}
                </Text>
                <Text style={[typography.caption, { color: colors.text.secondary }]}>
                  {t(`events.category.${event.category}`)}
                </Text>
                {active && (
                  <Text style={[typography.caption, { color: colors.text.primary }]}>
                    {t('events.status.active')}
                  </Text>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('events.sheet.close')}
                onPress={onClose}
                style={({ pressed }) => ({
                  width: theme.touch.min,
                  height: theme.touch.min,
                  borderRadius: theme.radii.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? colors.surface.glass : 'transparent',
                })}
              >
                <X size={theme.iconSizes.md} color={colors.text.primary} />
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: height * MAX_CONTENT_SHARE }}
              contentContainerStyle={{ gap: spacing.md }}
            >
              <View style={{ gap: spacing.xs }}>
                <DateRow
                  label={t('events.sheet.start')}
                  value={formatEventDateTime(event.starts_at, i18n.language)}
                />
                <DateRow
                  label={t('events.sheet.end')}
                  value={formatEventDateTime(event.ends_at, i18n.language)}
                />
              </View>
              <Text style={[typography.body, { color: colors.text.primary }]}>{event.summary}</Text>
              <Text style={[typography.caption, { color: colors.text.secondary }]}>
                {formatEventWhere(event.location, t, i18n.language)}
              </Text>
              {source && (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t('events.sheet.moreInfo')}
                  onPress={() => {
                    Linking.openURL(source).catch(() => undefined);
                  }}
                  style={[styles.link, { minHeight: theme.touch.min }]}
                >
                  <Text style={[typography.bodyStrong, styles.linkText, { color: colors.brand }]}>
                    {t('events.sheet.moreInfo')}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </GlassPanel>
      </Animated.View>
    </View>
  );
}

/**
 * Summary of an event (TG-52, criterion 3): a glass sheet from the bottom with the title,
 * the category, the start and end dates, the summary, where it can be seen and a link to the
 * source (plain https only, opened in the browser). It closes with its button, by tapping
 * outside it, and with Escape (web) or the back button (Android). No sounds.
 */
export function EventSheet({ event, onClose }: Props) {
  return (
    <Modal
      testID="event-sheet"
      visible={event !== null}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {event && <SheetContent event={event} onClose={onClose} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerText: { flex: 1 },
  dateRow: { flexDirection: 'row', alignItems: 'baseline' },
  dateValue: { flex: 1 },
  link: { justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { textDecorationLine: 'underline' },
});
