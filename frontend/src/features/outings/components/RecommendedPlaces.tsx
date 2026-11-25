import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ActivityIndicator, Platform, Text, View } from 'react-native';

import { errorMessage } from '../../../shared/errors';
import { useTheme } from '../../../shared/theme';
import { GlassPanel } from '../../../shared/ui';
import type { MeetingPoint } from '../../meeting-points/api/meetingPoints';
import { MeetingPointRow } from '../../meeting-points/components/MeetingPointRow';
import { type Position, useMeetingPoints } from '../../meeting-points/hooks/useMeetingPoints';

/** The form offers only the closest few: the full list is on the meeting points screen. */
const MAX_PLACES = 5;

interface Props {
  /** The place of the outing the places are searched around (not the device's location). */
  near: Position;
  onChoose: (point: MeetingPoint) => void;
}

/**
 * The watch party places near the place of the outing, to choose where it meets (TG-352,
 * criterion 7; TG-661). The field mounts it only when the person asks for it, with the place it
 * was asked for: the places do not move when the map does. The rows are not a FlatList: they go
 * inside the scroll of the form.
 */
export function RecommendedPlaces({ near, onChoose }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing, typography } = useTheme();
  const points = useMeetingPoints('watch_party', near);

  const empty = points.data?.length === 0 ? t('meetingPoints.empty') : undefined;
  useEffect(() => {
    // Android reads the live region by itself; iOS needs an explicit announcement.
    if (empty && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(empty);
  }, [empty]);

  // Visual only, not mutated.
  // Stryker disable all
  const look = {
    problem: [typography.caption, { color: colors.state.danger }],
    empty: [typography.caption, { color: colors.text.secondary }],
    place: {
      marginTop: spacing.sm,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.surface.glassBorder,
      backgroundColor: colors.surface.onGlass,
    },
  };
  // Stryker restore all

  if (points.isError) {
    return (
      <Text accessibilityRole="alert" style={look.problem}>
        {errorMessage(t, points.error.code, points.error.retryable)}
      </Text>
    );
  }
  if (!points.isSuccess) {
    return (
      <GlassPanel>
        <ActivityIndicator
          color={colors.text.primary}
          accessibilityLabel={t('meetingPoints.loading')}
        />
      </GlassPanel>
    );
  }
  if (empty) {
    return (
      <Text accessibilityLiveRegion="polite" style={look.empty}>
        {empty}
      </Text>
    );
  }
  return (
    <View accessibilityRole="list" accessibilityLabel={t('meetingPoints.list.label')}>
      {points.data.slice(0, MAX_PLACES).map((point) => (
        <View key={point.id} style={look.place}>
          <MeetingPointRow point={point} onChoose={() => onChoose(point)} />
        </View>
      ))}
    </View>
  );
}
