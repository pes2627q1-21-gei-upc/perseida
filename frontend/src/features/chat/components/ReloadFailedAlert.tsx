import { WarningCircle } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../../shared/errors';
import { useTheme } from '../../../shared/theme';
import { GlassPanel, QuietButton } from '../../../shared/ui';
import { useAnnounceOnIos } from '../useAnnounceOnIos';

interface Props {
  /** The code of the error of the reload, which says what to tell the person. */
  code: string;
  /** Only given for a transient error (gestio-errors): a final one just says what happened. */
  onRetry?: () => void;
}

// Layout only: purely visual, left out of mutation testing on purpose
// (convencions/testing.md, «Mutation testing»).
// Stryker disable all
const styles = StyleSheet.create({
  message: { flexDirection: 'row', alignItems: 'flex-start' },
  text: { flex: 1 },
});
// Stryker restore all

/**
 * A reload that fails while the list is on screen (TG-469): the person keeps what she had and
 * is told, with an icon besides the text (never only colour), that it could not be updated.
 */
export function ReloadFailedAlert({ code, onRetry }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, iconSizes } = useTheme();
  const message = errorMessage(t, code, onRetry !== undefined);
  useAnnounceOnIos(message);

  return (
    <GlassPanel>
      <View style={{ gap: spacing.md }}>
        <View style={[styles.message, { gap: spacing.sm }]}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <WarningCircle size={iconSizes.md} color={colors.text.primary} weight="fill" />
          </View>
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[typography.body, styles.text, { color: colors.text.primary }]}
          >
            {message}
          </Text>
        </View>
        {onRetry && <QuietButton label={t('chat.retry')} onPress={onRetry} />}
      </View>
    </GlassPanel>
  );
}
