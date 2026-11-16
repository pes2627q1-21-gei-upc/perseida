import { CaretLeft, CheckCircle, CircleIcon, XCircle } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { safeHttpsUrl } from '../../../shared/security/safeUrl';
import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { GlassPanel, QuietButton } from '../../../shared/ui';
import type { QuizResult, QuizToday } from '../api/quiz';

interface Props {
  question: QuizToday;
  result: QuizResult;
  /** Back to the menu with a button of the app, not only the system one. */
  onBack: () => void;
}

/** Key of the words that say what an option was in the result (criterion 9: not only colour). */
function optionTag(position: number, result: QuizResult): string | null {
  const right = position === result.correct_option;
  const chosen = position === result.chosen_option;
  if (right && chosen) return 'quiz.result.rightAndYours';
  if (right) return 'quiz.result.rightAnswer';
  if (chosen) return 'quiz.result.yourAnswer';
  return null;
}

/** Result of today's question: right or not, the options, the explanation and the source. */
export function QuizResultView({ question, result, onBack }: Props) {
  const { t } = useTranslation();
  const { colors, iconSizes, spacing, touch, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const source = safeHttpsUrl(result.source_url);

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
          {t(result.correct ? 'quiz.result.right' : 'quiz.result.wrong')}
        </Text>

        <GlassPanel>
          <View style={{ gap: spacing.md }}>
            <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>
              {question.statement}
            </Text>
            <View style={{ gap: spacing.sm }}>
              {question.options.map((option, position) => {
                const tag = optionTag(position, result);
                const right = position === result.correct_option;
                const Icon = right ? CheckCircle : tag ? XCircle : CircleIcon;
                const iconColor = right
                  ? colors.state.success
                  : tag
                    ? colors.state.danger
                    : colors.text.secondary;
                return (
                  <View
                    key={position}
                    style={[styles.row, { gap: spacing.sm, minHeight: touch.min }]}
                  >
                    <Icon size={iconSizes.md} color={iconColor} weight={tag ? 'fill' : 'regular'} />
                    <Text
                      style={[
                        tag ? typography.bodyStrong : typography.body,
                        { color: colors.text.primary, flexShrink: 1 },
                      ]}
                    >
                      {tag ? `${option} · ${t(tag)}` : option}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </GlassPanel>

        <GlassPanel>
          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>
              {t('quiz.result.explanation')}
            </Text>
            <Text style={[typography.body, { color: colors.text.primary }]}>
              {result.explanation}
            </Text>
            {source ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('quiz.result.source')}
                accessibilityHint={t('quiz.result.sourceHint')}
                onPress={() => {
                  Linking.openURL(source).catch(() => undefined);
                }}
                style={[styles.row, { minHeight: touch.min }]}
              >
                <Text
                  style={[
                    typography.bodyStrong,
                    { color: colors.text.primary, textDecorationLine: 'underline' },
                  ]}
                >
                  {t('quiz.result.source')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </GlassPanel>

        <Text style={[typography.body, { color: colors.text.primary, textAlign: 'center' }]}>
          {t('quiz.result.comeBack')}
        </Text>

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
  row: { flexDirection: 'row', alignItems: 'center' },
});
