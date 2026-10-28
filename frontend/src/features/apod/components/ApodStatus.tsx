import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { errorMessage } from '../../../shared/errors';
import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GelButton, GlassPanel } from '../../../shared/ui';

/** `onRetry` is only given for retryable errors (gestio-errors): the rest show just the message. */
type Props = { state: 'loading' } | { state: 'error'; code: string; onRetry?: () => void };

/** Loading and error states of the APOD screen (TG-120). */
export function ApodStatus(props: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  // `onRetry` is only given for retryable errors, so it also picks the generic message.
  const message =
    props.state === 'error' ? errorMessage(t, props.code, props.onRetry !== undefined) : undefined;

  useEffect(() => {
    // Android reads the live region by itself; iOS needs an explicit announcement.
    if (message && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View style={[styles.center, { padding: spacing.md }]}>
      {props.state === 'loading' ? (
        <ActivityIndicator
          size="large"
          color={colors.text.primary}
          accessibilityLabel={t('apod.loadingLabel')}
        />
      ) : (
        <View style={[styles.column, { maxWidth: readingMaxWidth }]}>
          <GlassPanel>
            <View style={{ gap: spacing.md }}>
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[typography.body, { color: colors.text.primary }]}
              >
                {message}
              </Text>
              {props.onRetry ? (
                <GelButton
                  label={t('apod.retry')}
                  accessibilityHint={t('apod.retryHint')}
                  onPress={props.onRetry}
                />
              ) : null}
            </View>
          </GlassPanel>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  column: { width: '100%' },
});
