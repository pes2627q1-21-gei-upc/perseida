import { useEffect } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GelButton, GlassPanel } from '../../../shared/ui';
import { apodErrorMessage, apodStrings } from '../strings';

/** `onRetry` is only given for retryable errors (gestio-errors): the rest show just the message. */
type Props = { state: 'loading' } | { state: 'error'; code: string; onRetry?: () => void };

/** Loading and error states of the APOD screen (TG-120). */
export function ApodStatus(props: Props) {
  const { colors, spacing, typography } = useTheme();
  const message = props.state === 'error' ? apodErrorMessage(props.code) : undefined;

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
          accessibilityLabel={apodStrings.loadingLabel}
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
                  label={apodStrings.retry}
                  accessibilityHint={apodStrings.retryHint}
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
