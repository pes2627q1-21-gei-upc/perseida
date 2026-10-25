import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';

export interface GoogleClientIds {
  web?: string;
  ios?: string;
  android?: string;
}

/**
 * Returns the Google OAuth client IDs configured in the environment.
 * Client IDs are public identifiers (RFC 6749) and safe to bundle in client apps.
 */
export function getGoogleClientIds(): GoogleClientIds {
  return {
    web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  };
}

/**
 * Resolves the appropriate Google Client ID for the current execution platform.
 * Allows passing an explicit platform for testing.
 */
export function getGoogleClientId(platform: typeof Platform.OS = Platform.OS): string {
  const ids = getGoogleClientIds();

  let clientId: string | undefined;
  switch (platform) {
    case 'ios':
      clientId = ids.ios;
      break;
    case 'android':
      clientId = ids.android;
      break;
    case 'web':
    default:
      clientId = ids.web;
      break;
  }

  // Fallback to web client ID in development if platform-specific ID is not configured
  return clientId || ids.web || '';
}

/**
 * Returns the redirect URI for the OAuth callback.
 * On native devices (iOS/Android), produces the deep link `perseida://oauth/callback`.
 * Allows overriding via EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME if Google Cloud OAuth Console
 * requires the package scheme (`app.perseida`) or reversed client ID.
 * On web, resolves to the browser location.
 */
export function getGoogleRedirectUri(): string {
  const scheme = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME || 'perseida';
  const uri = makeRedirectUri({
    scheme,
    path: 'oauth/callback',
  });

  // Google Cloud native OAuth clients for Android/iOS require single-slash format for package schemes (e.g. app.perseida:/oauth/callback)
  if (scheme.includes('.') && uri.startsWith(`${scheme}://`)) {
    return uri.replace(`${scheme}://`, `${scheme}:/`);
  }

  return uri;
}
