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
import { GelButton, GlassPanel, QuietButton } from '../../../shared/ui';

/** `onRetry` is only given for retryable errors (gestio-errors): the rest show just the message. */
type Props =
  | { state: 'loading' }
  | { state: 'empty'; message: string }
  | { state: 'error'; code: string; onRetry?: () => void }
  | { state: 'noLocation'; onShowList: () => void };

/**
 * Loading, empty and error states of the events map (TG-52, criterion 5): a glass panel in the
 * middle of the map or the list, so the map stays in view. The messages are read out by screen
 * readers as they appear.
 */
export function MapStatus(props: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  // `onRetry` is only given for retryable errors, so it also picks the generic message.
  const error =
    props.state === 'error' ? errorMessage(t, props.code, props.onRetry !== undefined) : undefined;

  useEffect(() => {
    // Android reads the live region by itself; iOS needs an explicit announcement.
    if (error && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  const textStyle = [typography.body, styles.text, { color: colors.text.primary }];

  return (
    <View pointerEvents="box-none" style={[styles.center, { padding: spacing.md }]}>
      <View style={[styles.column, { maxWidth: readingMaxWidth }]}>
        <GlassPanel>
          <View style={[styles.content, { gap: spacing.md }]}>
            {props.state === 'loading' && (
              <ActivityIndicator
                size="large"
                color={colors.text.primary}
                accessibilityLabel={t('events.loading')}
              />
            )}
            {props.state === 'empty' && (
              <Text accessibilityLiveRegion="polite" style={textStyle}>
                {props.message}
              </Text>
            )}
            {props.state === 'error' && (
              <>
                <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={textStyle}>
                  {error}
                </Text>
                {props.onRetry && (
                  <GelButton
                    label={t('events.retry')}
                    accessibilityHint={t('events.retryHint')}
                    onPress={props.onRetry}
                  />
                )}
              </>
            )}
            {props.state === 'noLocation' && (
              <>
                <Text accessibilityLiveRegion="polite" style={textStyle}>
                  {t('events.empty.noLocation')}
                </Text>
                <QuietButton label={t('events.empty.showList')} onPress={props.onShowList} />
              </>
            )}
          </View>
        </GlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: { width: '100%' },
  content: { alignItems: 'center' },
  text: { textAlign: 'center' },
});
