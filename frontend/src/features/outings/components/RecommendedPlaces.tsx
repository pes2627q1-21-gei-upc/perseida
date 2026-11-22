import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { errorMessage } from '../../../shared/errors';
import { useTheme } from '../../../shared/theme';
import { useDeviceLocation } from '../../events/hooks/useDeviceLocation';
import type { MeetingPoint } from '../../meeting-points/api/meetingPoints';
import { MeetingPointRow } from '../../meeting-points/components/MeetingPointRow';
import { useMeetingPoints } from '../../meeting-points/hooks/useMeetingPoints';

/** The form offers only the closest few: the full list is on the meeting points screen. */
const MAX_PLACES = 5;

interface Props {
  onChoose: (point: MeetingPoint) => void;
}

/**
 * The watch party places near the person, to choose where an outing meets (TG-352,
 * criterion 7). It asks for the location as soon as it is shown, so the field mounts it only
 * when the person asks for it. The rows are not a FlatList: they go inside the scroll of the form.
 */
export function RecommendedPlaces({ onChoose }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing, typography } = useTheme();
  const location = useDeviceLocation();
  const { status, request } = location;
  const points = useMeetingPoints('watch_party', location.position);

  useEffect(() => {
    if (status === 'idle') void request();
  }, [status, request]);

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

  let problem: string | null = null;
  if (status === 'denied') problem = t('outings.picker.denied');
  else if (status === 'unavailable') problem = t('meetingPoints.location.unavailable');
  else if (points.isError) {
    problem = errorMessage(t, points.error.code, points.error.retryable);
  }

  if (problem) {
    return (
      <Text accessibilityRole="alert" style={look.problem}>
        {problem}
      </Text>
    );
  }
  if (!points.isSuccess) {
    return (
      <ActivityIndicator
        color={colors.text.primary}
        accessibilityLabel={t(
          status === 'granted' ? 'meetingPoints.loading' : 'meetingPoints.location.locating',
        )}
      />
    );
  }
  if (points.data.length === 0) {
    return <Text style={look.empty}>{t('meetingPoints.empty')}</Text>;
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
