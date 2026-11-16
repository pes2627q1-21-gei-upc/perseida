import { CaretLeft } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GelButton, GlassPanel, QuietButton } from '../../../shared/ui';
import type { QuizToday } from '../api/quiz';
import { QuizOption } from './QuizOption';

interface Props {
  question: QuizToday;
  /** The answer is being sent: options and button ignore taps (criterion 3). */
  sending: boolean;
  onSubmit: (chosenOption: number) => void;
  /** Back to the menu with a button of the app, not only the system one. */
  onBack: () => void;
  /** Translated text of the last failed send, if any; the chosen option stays (criterion 7). */
  error?: string;
  /** Shown when the question changed while it was open (criterion 6). */
  notice?: string;
}

/** The question of the day: statement, 4 options and the send button (TG-61). */
export function QuizQuestionView({ question, sending, onSubmit, onBack, error, notice }: Props) {
  const { t } = useTranslation();
  const { colors, iconSizes, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [chosen, setChosen] = useState<number | null>(null);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + spacing.md,
        paddingBottom: insets.bottom + spacing.xxl,
        paddingLeft: insets.left + spacing.md,
        paddingRight: insets.right + spacing.md,
      }}
    >
      <View style={[styles.column, { maxWidth: readingMaxWidth, gap: spacing.md }]}>
        <Text
          accessibilityRole="header"
          style={[typography.headline, { color: colors.text.primary }]}
        >
          {t('quiz.title')}
        </Text>

        {notice ? (
          <GlassPanel>
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[typography.body, { color: colors.text.primary }]}
            >
              {notice}
            </Text>
          </GlassPanel>
        ) : null}

        <GlassPanel>
          <View style={{ gap: spacing.md }}>
            <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>
              {question.statement}
            </Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('quiz.optionsLabel')}
              style={{ gap: spacing.sm }}
            >
              {question.options.map((option, position) => (
                <QuizOption
                  key={position}
                  label={option}
                  selected={chosen === position}
                  disabled={sending}
                  onPress={() => setChosen(position)}
                />
              ))}
            </View>
          </View>
        </GlassPanel>

        {error ? (
          <GlassPanel>
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[typography.body, { color: colors.text.primary }]}
            >
              {error}
            </Text>
          </GlassPanel>
        ) : null}

        <GelButton
          label={t('quiz.submit')}
          accessibilityHint={t('quiz.submitHint')}
          disabled={chosen === null}
          busy={sending}
          onPress={() => {
            if (chosen !== null) onSubmit(chosen);
          }}
        />

        <QuietButton
          label={t('quiz.backHome')}
          icon={<CaretLeft size={iconSizes.sm} color={colors.text.primary} />}
          onPress={onBack}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', alignSelf: 'center' },
});
