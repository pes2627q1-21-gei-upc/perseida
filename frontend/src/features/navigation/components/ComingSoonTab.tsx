import type { Icon } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  breakpoints,
  fontFamilies,
  iconSizes,
  radii,
  spacing,
  useTheme,
} from '../../../shared/theme';
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
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();

  const badgeText = badge ?? t('comingSoon.badge');

  return (
    <SkyBackground>
      <View
        testID="coming-soon-tab"
        style={[
          styles.container,
          {
            paddingTop: insets.top + theme.spacing.lg,
            paddingBottom: tabBarInset + theme.spacing.lg,
            paddingHorizontal: theme.spacing.md,
          },
        ]}
      >
        <View style={styles.cardContainer}>
          <GlassPanel>
            <View style={[styles.content, { gap: theme.spacing.md }]}>
              <View
                style={[
                  styles.iconOrb,
                  {
                    borderColor: theme.colors.surface.glassBorder,
                    backgroundColor: theme.colors.surface.glassSolid,
                  },
                ]}
              >
                <IconComponent size={theme.iconSizes.lg} color={theme.colors.brand} weight="fill" />
              </View>

              <View
                style={[
                  styles.badge,
                  {
                    borderColor: theme.colors.surface.glassBorder,
                    backgroundColor: theme.colors.surface.glass,
                    borderRadius: theme.radii.pill,
                  },
                ]}
              >
                <Text
                  style={[
                    theme.typography.caption,
                    { fontFamily: fontFamilies.sansSemiBold, color: theme.colors.brand },
                  ]}
                >
                  {badgeText}
                </Text>
              </View>

              <Text
                accessibilityRole="header"
                style={[
                  theme.typography.title,
                  { color: theme.colors.text.primary, textAlign: 'center' },
                ]}
              >
                {title}
              </Text>

              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.text.secondary, textAlign: 'center' },
                ]}
              >
                {description}
              </Text>

              {action && (
                <View style={[styles.actionWrapper, { marginTop: theme.spacing.sm }]}>
                  <GelButton label={action.label} onPress={action.onPress} />
                </View>
              )}
            </View>
          </GlassPanel>
        </View>
      </View>
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    width: '100%',
    maxWidth: breakpoints.phone,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  iconOrb: {
    width: iconSizes.lg * 2,
    height: iconSizes.lg * 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  badge: {
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  actionWrapper: {
    width: '100%',
  },
});
