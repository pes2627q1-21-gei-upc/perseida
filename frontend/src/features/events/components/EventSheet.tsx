import { X } from 'phosphor-react-native';
import { type ComponentRef, type Ref, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  BackHandler,
  Linking,
  Modal,
  Platform,
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
/** Width of the summary beside the map on wide screens. */
const SIDE_WIDTH = 380;

interface Props {
  /** The event to show; `null` hides the sheet. */
  event: ClassifiedEvent | null;
  onClose: () => void;
  /** Wide screens: a panel beside the map instead of a sheet over it. */
  side?: boolean;
  /** Side panel only: room at the top for the floating bar of the screen. */
  topInset?: number;
}

interface BodyProps {
  event: ClassifiedEvent;
  onClose: () => void;
  /** Side panel only: the title, which takes the focus when the panel opens. */
  titleRef?: Ref<ComponentRef<typeof Text>>;
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

/** What the summary says: the same in the bottom sheet and in the side panel. */
function SheetBody({ event, onClose, titleRef }: BodyProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const { colors, spacing, typography } = theme;
  const source = safeHttpsUrl(event.source_url);
  const active = event.status === 'active';

  return (
    <GlassPanel>
      <View style={{ gap: spacing.md }}>
        <View style={[styles.header, { gap: spacing.md }]}>
          <EventOrb category={event.category} active={active} />
          <View style={[styles.headerText, { gap: spacing.xs }]}>
            <Text
              ref={titleRef}
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
  );
}

/** Phones: a sheet from the bottom, over the screen. */
function BottomSheet({ event, onClose }: BodyProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { spacing } = theme;

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
        <SheetBody event={event} onClose={onClose} />
      </Animated.View>
    </View>
  );
}

/**
 * Wide screens: a panel beside the map, which keeps working. It is not modal, so Escape (web)
 * and the back button (Android) are listened to here. When it opens, the focus (and the screen
 * reader) goes to its title, which announces it; on the web, closing it gives the focus back to
 * where it was, usually the marker (WCAG 2.2: 2.4.3 focus order).
 */
function SidePanel({ event, onClose, topInset }: BodyProps & { topInset: number }) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const titleRef = useRef<ComponentRef<typeof Text>>(null);
  /** Web: where the focus goes back when the panel closes (the last marker chosen). */
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const title = titleRef.current;
    if (Platform.OS !== 'web') {
      if (title) AccessibilityInfo.sendAccessibilityEvent(title, 'focus');
      return;
    }
    // On the web the ref is the DOM node of the heading, which is not focusable by default.
    const heading = title as unknown as HTMLElement | null;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== heading) returnFocus.current = active;
    if (heading?.focus) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [event.id]);

  // Only on close: choosing another marker keeps the panel open and must not move the focus back.
  useEffect(
    () => () => {
      if (Platform.OS === 'web') returnFocus.current?.focus();
    },
    [],
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      const onKey = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  return (
    <View
      testID="event-sheet-side"
      style={{
        width: SIDE_WIDTH,
        paddingTop: topInset + spacing.md,
        paddingBottom: spacing.md,
        paddingRight: insets.right + spacing.md,
      }}
    >
      <SheetBody event={event} onClose={onClose} titleRef={titleRef} />
    </View>
  );
}

/**
 * Summary of an event (TG-52, criterion 3): the title, the category, the start and end dates,
 * the summary, where it can be seen and a link to the source (plain https only, opened in the
 * browser). On phones, a glass sheet from the bottom; on wide screens, a panel beside the map.
 * It closes with its button, with Escape (web) or the back button (Android), and on phones
 * also by tapping outside it. No sounds.
 */
export function EventSheet({ event, onClose, side = false, topInset = 0 }: Props) {
  if (side) {
    return event ? <SidePanel event={event} onClose={onClose} topInset={topInset} /> : null;
  }
  return (
    <Modal
      testID="event-sheet"
      visible={event !== null}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {event && <BottomSheet event={event} onClose={onClose} />}
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
