import type { Icon } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { breakpoints, fontFamilies, type Theme, useTheme } from '../../../shared/theme';
import { GelButton, GlassPanel, SkyBackground } from '../../../shared/ui';
import { useTabBarInset } from '../useTabBarInset';

export interface ComingSoonTabProps {
  title: string;
  description: string;
  icon: Icon;
  badge?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function ComingSoonTab({
  title,
  description,
  icon: IconComponent,
  badge,
  action,
}: ComingSoonTabProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();

  const badgeText = badge ?? t('comingSoon.badge');

  return (
    <SkyBackground>
      {/* Scrolls when the window is shorter than the card (a phone in landscape). */}
      <ScrollView
        testID="coming-soon-tab"
        contentContainerStyle={[
          styles.container,
          {
            // Stryker disable next-line ArithmeticOperator: visual spacing under the status bar.
            paddingTop: insets.top + theme.spacing.lg,
            paddingBottom: tabBarInset + theme.spacing.lg,
          },
        ]}
        // Stryker disable next-line BooleanLiteral: visual only.
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <GlassPanel>
            <View style={styles.content}>
              <View style={styles.iconOrb}>
                <IconComponent
                  size={theme.iconSizes.lg}
                  color={theme.colors.brand}
                  // Stryker disable next-line StringLiteral: icon weight, visual only.
                  weight="fill"
                />
              </View>

              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeText}</Text>
              </View>

              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>

              <Text style={styles.description}>{description}</Text>

              {action && (
                <View style={styles.action}>
                  <GelButton label={action.label} onPress={action.onPress} />
                </View>
              )}
            </View>
          </GlassPanel>
        </View>
      </ScrollView>
    </SkyBackground>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on
// purpose: a changed padding or colour is not behaviour a unit test should pin down
// (convencions/testing.md, «Mutation testing»). Behaviour stays in the JSX above.
// Stryker disable all
function createStyles({ colors, radii, spacing, typography, iconSizes }: Theme) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    card: { width: '100%', maxWidth: breakpoints.phone },
    content: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.sm,
    },
    iconOrb: {
      width: iconSizes.lg * 2,
      height: iconSizes.lg * 2,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.surface.glassBorder,
      backgroundColor: colors.surface.glassSolid,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    badge: {
      borderWidth: 1,
      borderColor: colors.surface.glassBorder,
      backgroundColor: colors.surface.glass,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    badgeText: {
      ...typography.caption,
      fontFamily: fontFamilies.sansSemiBold,
      color: colors.brand,
    },
    title: { ...typography.title, color: colors.text.primary, textAlign: 'center' },
    description: { ...typography.body, color: colors.text.secondary, textAlign: 'center' },
    action: { width: '100%', marginTop: spacing.sm },
  });
}
// Stryker restore all
