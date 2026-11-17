import type { Icon } from 'phosphor-react-native';
import { Flame, Trophy, User, Users } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppError, errorMessage } from '../../../shared/errors';
import { safeHttpsUrl } from '../../../shared/security/safeUrl';
import {
  breakpoints,
  fontFamilies,
  iconSizes,
  radii,
  spacing,
  touch,
  useTheme,
} from '../../../shared/theme';
import { GelButton, GlassPanel, SkyBackground } from '../../../shared/ui';
import { LogoutButton } from '../../auth/components/LogoutButton';
import { useTabBarInset } from '../../navigation/useTabBarInset';
import { useUserProfile } from '../hooks/useUserProfile';

export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
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
          styles.scrollContainer,
          {
            paddingTop: insets.top + theme.spacing.lg,
            paddingBottom: tabBarInset + theme.spacing.lg,
            paddingHorizontal: theme.spacing.md,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Text
            accessibilityRole="header"
            style={[
              theme.typography.headline,
              {
                color: theme.colors.text.primary,
                alignSelf: 'center',
                marginBottom: theme.spacing.xs,
              },
            ]}
          >
            {t('profile.title')}
          </Text>

          {isLoading && (
            <GlassPanel>
              <View
                style={[
                  styles.center,
                  { gap: theme.spacing.sm, paddingVertical: theme.spacing.xl },
                ]}
              >
                <ActivityIndicator
                  accessibilityRole="progressbar"
                  size="large"
                  color={theme.colors.brand}
                />
                <Text style={[theme.typography.body, { color: theme.colors.text.secondary }]}>
                  {t('profile.loading')}
                </Text>
              </View>
            </GlassPanel>
          )}

          {isError && (
            <GlassPanel>
              <View
                style={[
                  styles.center,
                  { gap: theme.spacing.md, paddingVertical: theme.spacing.md },
                ]}
              >
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.text.primary, textAlign: 'center' },
                  ]}
                >
                  {errorText}
                </Text>
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
              {/* User Identity Card */}
              <GlassPanel>
                <View style={[styles.profileCard, { gap: theme.spacing.sm }]}>
                  <View
                    testID="profile-avatar"
                    // Decorative: the name below already identifies the user (WCAG 1.1.1).
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[
                      styles.avatarWrapper,
                      {
                        borderColor: theme.colors.surface.glassBorder,
                        backgroundColor: theme.colors.surface.glassSolid,
                      },
                    ]}
                  >
                    {photo ? (
                      <Image
                        testID="profile-avatar-image"
                        source={{ uri: photo }}
                        onError={() => setPhotoFailed(true)}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <Text style={[theme.typography.title, { color: theme.colors.brand }]}>
                        {initials}
                      </Text>
                    )}
                  </View>

                  <Text
                    accessibilityRole="header"
                    style={[
                      theme.typography.title,
                      { color: theme.colors.text.primary, textAlign: 'center' },
                    ]}
                  >
                    {/* Without a profile name, the email names the account (once). */}
                    {data.display_name ?? data.email}
                  </Text>

                  {data.display_name ? (
                    <Text
                      style={[
                        theme.typography.body,
                        { color: theme.colors.text.secondary, textAlign: 'center' },
                      ]}
                    >
                      {data.email}
                    </Text>
                  ) : null}

                  <Text
                    style={[
                      theme.typography.caption,
                      { color: theme.colors.text.secondary, textAlign: 'center' },
                    ]}
                  >
                    {t('profile.memberSince', {
                      date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
                        new Date(data.created_at),
                      ),
                    })}
                  </Text>

                  <View
                    style={[
                      styles.chipsRow,
                      { gap: theme.spacing.sm, marginTop: theme.spacing.xs },
                    ]}
                  >
                    {roleText ? (
                      <View
                        style={[
                          styles.chip,
                          {
                            backgroundColor: theme.colors.surface.glass,
                            borderColor: theme.colors.surface.glassBorder,
                            borderRadius: theme.radii.pill,
                          },
                        ]}
                      >
                        <User
                          size={theme.typography.caption.lineHeight}
                          color={theme.colors.brand}
                          weight="bold"
                        />
                        <Text
                          style={[
                            theme.typography.caption,
                            { fontFamily: fontFamilies.sansSemiBold, color: theme.colors.brand },
                          ]}
                        >
                          {roleText}
                        </Text>
                      </View>
                    ) : null}

                    {languageText ? (
                      <View
                        style={[
                          styles.chip,
                          {
                            backgroundColor: theme.colors.surface.glass,
                            borderColor: theme.colors.surface.glassBorder,
                            borderRadius: theme.radii.pill,
                          },
                        ]}
                      >
                        <Text
                          style={[theme.typography.caption, { color: theme.colors.text.secondary }]}
                        >
                          {languageText}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </GlassPanel>

              {/* Gamification slots: streak (#57), achievements (#59), followers (#62) */}
              {SLOTS.map((slot) => (
                <ProfileSlot key={slot.key} i18nKey={slot.key} icon={slot.icon} />
              ))}

              {/* Logout Action */}
              <View style={styles.logoutWrapper}>
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

  return (
    <GlassPanel>
      <View style={[styles.slotCard, { gap: theme.spacing.xs }]}>
        <View style={styles.slotHeader}>
          <View style={[styles.slotIconOrb, { backgroundColor: theme.colors.surface.glassSolid }]}>
            <IconComponent size={theme.iconSizes.sm} color={theme.colors.brand} weight="fill" />
          </View>
          <Text
            accessibilityRole="header"
            style={[theme.typography.bodyStrong, { color: theme.colors.text.primary, flex: 1 }]}
          >
            {t(`profile.${i18nKey}.title`)}
          </Text>
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
              {t('comingSoon.badge')}
            </Text>
          </View>
        </View>
        <Text style={[theme.typography.body, { color: theme.colors.text.secondary }]}>
          {t(`profile.${i18nKey}.desc`)}
        </Text>
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: breakpoints.phone,
    gap: spacing.md,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  avatarWrapper: {
    width: touch.min * 1.5,
    height: touch.min * 1.5,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  slotCard: {
    paddingVertical: spacing.xs,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  slotIconOrb: {
    width: iconSizes.sm * 2,
    height: iconSizes.sm * 2,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  logoutWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
});
