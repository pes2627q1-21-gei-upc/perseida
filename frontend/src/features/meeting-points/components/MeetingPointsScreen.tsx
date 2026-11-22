import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GelButton, GlassPanel, SkyBackground, TopBar } from '../../../shared/ui';
import { useDeviceLocation } from '../../events/hooks/useDeviceLocation';
import { useEventTitle } from '../../outings/hooks/useEventTitle';
import type { MeetingPointProfile } from '../api/meetingPoints';
import { useMeetingPoints } from '../hooks/useMeetingPoints';
import { MeetingPointList } from './MeetingPointList';
import { ProfileSwitch } from './ProfileSwitch';

/**
 * Without the position: `denied` points to the settings (coming back with the permission asks
 * again by itself), `unavailable` offers to try again. Read out as it appears.
 */
function LocationMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();

  useEffect(() => {
    // Android reads the live region by itself; iOS needs an explicit announcement.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <GlassPanel>
      <View style={{ gap: spacing.md }}>
        <Text
          accessibilityLiveRegion="polite"
          style={[typography.body, styles.center, { color: colors.text.primary }]}
        >
          {message}
        </Text>
        {onRetry ? <GelButton label={t('meetingPoints.location.retry')} onPress={onRetry} /> : null}
      </View>
    </GlassPanel>
  );
}

/**
 * The places recommended to meet for an event (TG-352): it asks for the location of the person
 * when it opens, and shows the places of the chosen profile (watch party by default) around it.
 * The page only orchestrates: the list, its states and the profile are their own components.
 */
export function MeetingPointsScreen({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [barBottom, setBarBottom] = useState(0);
  const [profile, setProfile] = useState<MeetingPointProfile>('watch_party');
  const eventTitle = useEventTitle(eventId);
  const location = useDeviceLocation();
  const { status, request } = location;
  const points = useMeetingPoints(profile, status === 'granted' ? location.position : null);

  // On opening, and again when the permission was given in the settings (back to `idle`).
  useEffect(() => {
    if (status === 'idle') void request();
  }, [status, request]);

  function goBack() {
    // Opened from a link there is nowhere to go back to: go home instead.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  let listStatus: 'loading' | 'error' | 'success' = 'loading';
  if (points.isError) listStatus = 'error';
  else if (points.isSuccess) listStatus = 'success';

  // Stryker disable next-line ObjectLiteral: safe areas and reading column, visual only.
  const column = {
    maxWidth: readingMaxWidth,
    gap: spacing.md,
    paddingTop: barBottom + spacing.md,
    paddingLeft: insets.left + spacing.md,
    paddingRight: insets.right + spacing.md,
  };

  return (
    <SkyBackground>
      <TopBar
        title={t('meetingPoints.title')}
        testID="meeting-points-top-bar"
        onBack={goBack}
        onLayout={setBarBottom}
      />
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.column, column]}>
          {eventTitle ? (
            <Text style={[typography.bodyStrong, styles.center, { color: colors.text.primary }]}>
              {eventTitle}
            </Text>
          ) : null}
          {status === 'granted' && <ProfileSwitch value={profile} onChange={setProfile} />}
          {status === 'denied' && <LocationMessage message={t('meetingPoints.location.denied')} />}
          {status === 'unavailable' && (
            <LocationMessage
              message={t('meetingPoints.location.unavailable')}
              onRetry={() => void request()}
            />
          )}
          {(status === 'idle' || status === 'locating') && (
            <ActivityIndicator
              size="large"
              color={colors.text.primary}
              accessibilityLabel={t('meetingPoints.location.locating')}
            />
          )}
        </View>
        {status === 'granted' && (
          <View style={styles.fill}>
            <MeetingPointList
              status={listStatus}
              points={points.data ?? []}
              error={points.error}
              onRetry={() => void points.refetch()}
            />
          </View>
        )}
      </View>
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { width: '100%', alignSelf: 'center' },
  center: { textAlign: 'center' },
});
