import { WarningCircle } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../../shared/errors';
import { type Theme, useTheme } from '../../../shared/theme';
import { GlassPanel, QuietButton } from '../../../shared/ui';
import { useAnnounceOnIos } from '../../../shared/a11y/useAnnounceOnIos';

interface Props {
  /** The code of the error of the reload, which says what to tell the person. */
  code: string;
  /** Only given for a transient error (gestio-errors): a final one just says what happened. */
  onRetry?: () => void;
}

/**
 * A reload that fails while the list is on screen (TG-469): the person keeps what she had and
 * is told, with an icon besides the text (never only colour), that it could not be updated.
 */
export function ReloadFailedAlert({ code, onRetry }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, iconSizes } = theme;
  const styles = createStyles(theme);
  const message = errorMessage(t, code, onRetry !== undefined);
  useAnnounceOnIos(message);

  return (
    <GlassPanel>
      <View style={styles.content}>
        <View style={styles.message}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <WarningCircle size={iconSizes.md} color={colors.text.primary} weight="fill" />
          </View>
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.text}>
            {message}
          </Text>
        </View>
        {onRetry && <QuietButton label={t('chat.retry')} onPress={onRetry} />}
      </View>
    </GlassPanel>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on
// purpose (convencions/testing.md, «Mutation testing»).
// Stryker disable all
function createStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    content: { gap: spacing.md },
    message: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    text: { ...typography.body, flex: 1, color: colors.text.primary },
  });
}
// Stryker restore all
