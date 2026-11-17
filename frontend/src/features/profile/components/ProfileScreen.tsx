import type { Icon } from 'phosphor-react-native';
import { Flame, Trophy, User, Users } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppError, errorMessage } from '../../../shared/errors';
import { safeHttpsUrl } from '../../../shared/security/safeUrl';
import { breakpoints, fontFamilies, type Theme, touch, useTheme } from '../../../shared/theme';
import { GelButton, GlassPanel, SkyBackground } from '../../../shared/ui';
import { LogoutButton } from '../../auth/components/LogoutButton';
import { useTabBarInset } from '../../navigation/useTabBarInset';
import { useUserProfile } from '../hooks/useUserProfile';

export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const { data, isLoading, isError, error, refetch } = useUserProfile();
  const [photoFailed, setPhotoFailed] = useState(false);
  // Only plain https avatars reach <Image> (ADR-0024); anything else shows the initials.
  const photo = photoFailed ? null : safeHttpsUrl(data?.avatar_url);

  const initials = data?.display_name
    ? data.display_name
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  // A role or a language the app does not know yet is not shown, never as the raw value.
  const optionalText = (key: string) => (i18n.exists(key) ? t(key) : '');
  const roleText = data ? optionalText(`profile.role.${data.role}`) : '';
  const languageText = data ? optionalText(`profile.language.${data.preferred_language}`) : '';

  const errorText =
    error instanceof AppError
      ? errorMessage(t, error.code, error.retryable)
      : t('errors.INTERNAL_ERROR');

  return (
    <SkyBackground>
      <ScrollView
        testID="profile-scroll"
        contentContainerStyle={[
          styles.scroll,
          {
            // Stryker disable next-line ArithmeticOperator: visual spacing under the status bar.
            paddingTop: insets.top + theme.spacing.lg,
            paddingBottom: tabBarInset + theme.spacing.lg,
          },
        ]}
        // Stryker disable next-line BooleanLiteral: visual only.
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Text accessibilityRole="header" style={styles.screenTitle}>
            {t('profile.title')}
          </Text>

          {isLoading && (
            <GlassPanel>
              <View style={styles.loading}>
                <ActivityIndicator
                  accessibilityRole="progressbar"
                  // Stryker disable next-line StringLiteral: spinner size, visual only.
                  size="large"
                  color={theme.colors.brand}
                />
                <Text style={styles.secondaryText}>{t('profile.loading')}</Text>
              </View>
            </GlassPanel>
          )}

          {isError && (
            <GlassPanel>
              <View style={styles.error}>
                <Text style={styles.errorText}>{errorText}</Text>
                <GelButton
                  label={t('profile.retry')}
                  accessibilityHint={t('profile.retryHint')}
                  onPress={() => void refetch()}
                />
              </View>
            </GlassPanel>
          )}

          {data && (
            <>
              <GlassPanel>
                <View style={styles.identity}>
                  <View
                    testID="profile-avatar"
                    // Decorative: the name below already identifies the user (WCAG 1.1.1).
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={styles.avatar}
                  >
                    {photo ? (
                      <Image
                        testID="profile-avatar-image"
                        source={{ uri: photo }}
                        onError={() => setPhotoFailed(true)}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <Text style={styles.initials}>{initials}</Text>
                    )}
                  </View>

                  <Text accessibilityRole="header" style={styles.name}>
                    {/* Without a profile name, the email names the account (once). */}
                    {data.display_name ?? data.email}
                  </Text>

                  {data.display_name ? <Text style={styles.email}>{data.email}</Text> : null}

                  <Text style={styles.memberSince}>
                    {t('profile.memberSince', {
                      date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
                        new Date(data.created_at),
                      ),
                    })}
                  </Text>

                  <View style={styles.chips}>
                    {roleText ? (
                      <View style={styles.chip}>
                        <User
                          size={theme.typography.caption.lineHeight}
                          color={theme.colors.brand}
                          // Stryker disable next-line StringLiteral: icon weight, visual only.
                          weight="bold"
                        />
                        <Text style={styles.roleText}>{roleText}</Text>
                      </View>
                    ) : null}

                    {languageText ? (
                      <View style={styles.chip}>
                        <Text style={styles.secondaryCaption}>{languageText}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </GlassPanel>

              {/* Gamification slots: streak (#57), achievements (#59), followers (#62) */}
              {SLOTS.map((slot) => (
                <ProfileSlot key={slot.key} i18nKey={slot.key} icon={slot.icon} />
              ))}

              <View style={styles.logout}>
                <LogoutButton />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SkyBackground>
  );
}

/** Reserved gamification slots; the owning US replaces each one with real data. */
const SLOTS = [
  { key: 'streak', icon: Flame },
  { key: 'achievements', icon: Trophy },
  { key: 'followers', icon: Users },
] as const satisfies readonly { key: string; icon: Icon }[];

function ProfileSlot({
  i18nKey,
  icon: IconComponent,
}: {
  i18nKey: (typeof SLOTS)[number]['key'];
  icon: Icon;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <GlassPanel>
      <View style={styles.slot}>
        <View style={styles.slotHeader}>
          <View style={styles.slotIcon}>
            <IconComponent
              size={theme.iconSizes.sm}
              color={theme.colors.brand}
              // Stryker disable next-line StringLiteral: icon weight, visual only.
              weight="fill"
            />
          </View>
          <Text accessibilityRole="header" style={styles.slotTitle}>
            {t(`profile.${i18nKey}.title`)}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('comingSoon.badge')}</Text>
          </View>
        </View>
        <Text style={styles.secondaryText}>{t(`profile.${i18nKey}.desc`)}</Text>
      </View>
    </GlassPanel>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on
// purpose: a changed padding or colour is not behaviour a unit test should pin down
// (convencions/testing.md, «Mutation testing»). Behaviour stays in the JSX above.
// Stryker disable all
function createStyles({ colors, radii, spacing, typography, iconSizes }: Theme) {
  const glassChip = {
    borderWidth: 1,
    borderColor: colors.surface.glassBorder,
    backgroundColor: colors.surface.glass,
    borderRadius: radii.pill,
  };
  const centered = { alignItems: 'center', justifyContent: 'center' } as const;

  return StyleSheet.create({
    scroll: { alignItems: 'center', paddingHorizontal: spacing.md },
    container: { width: '100%', maxWidth: breakpoints.phone, gap: spacing.md },
    screenTitle: {
      ...typography.headline,
      color: colors.text.primary,
      alignSelf: 'center',
      marginBottom: spacing.xs,
    },
    loading: { ...centered, gap: spacing.sm, paddingVertical: spacing.xl },
    error: { ...centered, gap: spacing.md, paddingVertical: spacing.md },
    errorText: { ...typography.body, color: colors.text.primary, textAlign: 'center' },
    identity: { ...centered, gap: spacing.sm, paddingVertical: spacing.sm },
    avatar: {
      ...centered,
      width: touch.min * 1.5,
      height: touch.min * 1.5,
      borderRadius: radii.pill,
      borderWidth: 2,
      borderColor: colors.surface.glassBorder,
      backgroundColor: colors.surface.glassSolid,
      overflow: 'hidden',
      marginBottom: spacing.xs,
    },
    avatarImage: { width: '100%', height: '100%' },
    initials: { ...typography.title, color: colors.brand },
    name: { ...typography.title, color: colors.text.primary, textAlign: 'center' },
    email: { ...typography.body, color: colors.text.secondary, textAlign: 'center' },
    memberSince: { ...typography.caption, color: colors.text.secondary, textAlign: 'center' },
    chips: { ...centered, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    chip: {
      ...glassChip,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    roleText: { ...typography.caption, fontFamily: fontFamilies.sansSemiBold, color: colors.brand },
    secondaryCaption: { ...typography.caption, color: colors.text.secondary },
    secondaryText: { ...typography.body, color: colors.text.secondary },
    slot: { gap: spacing.xs, paddingVertical: spacing.xs },
    slotHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    slotIcon: {
      ...centered,
      width: iconSizes.sm * 2,
      height: iconSizes.sm * 2,
      borderRadius: radii.pill,
      backgroundColor: colors.surface.glassSolid,
    },
    slotTitle: { ...typography.bodyStrong, color: colors.text.primary, flex: 1 },
    badge: { ...glassChip, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    badgeText: {
      ...typography.caption,
      fontFamily: fontFamilies.sansSemiBold,
      color: colors.brand,
    },
    logout: { ...centered, marginTop: spacing.sm },
  });
}
// Stryker restore all
