import { Linking } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';

import { hostOf, safeHttpsUrl } from '../../../shared/security/safeUrl';

/**
 * YouTube refuses embeds without a Referer (error 153) and a WebView sends none, so the app
 * identifies itself. Should match the Android package once the team fixes it in app.json.
 */
export const PLAYER_REFERER = 'https://edu.upc.perseida';

/** Not exported from the package root: derived from the public props instead of `lib/`. */
type ShouldStartLoadRequest = Parameters<
  NonNullable<WebViewProps['onShouldStartLoadWithRequest']>
>[0];

/**
 * The player only navigates within the video's own host. Links that leave it (logo, related
 * videos) open in the system browser instead of turning the player into a browser.
 * Inner frames (iOS `isTopFrame: false`) are the player's own resources and always load.
 * Other schemes (`intent:`, `tel:`, `about:`...) are blocked without leaving the app, and so
 * is anything that is not plain https: the system browser only gets https links.
 */
export function keepInPlayer(request: ShouldStartLoadRequest, videoUrl: string): boolean {
  if (request.isTopFrame === false) return true;
  const host = hostOf(request.url);
  if (host === hostOf(videoUrl)) return true;
  // No app may be able to open the link: the rejection is ignored, the player just stays.
  const link = safeHttpsUrl(request.url);
  if (host && link) Linking.openURL(link).catch(() => undefined);
  return false;
}

interface Props {
  /** Plain https URL of the video (already checked by the caller with `safeHttpsUrl`). */
  url: string;
  label: string;
  onError: () => void;
}

/** Native APOD video player (TG-119): an embedded WebView restricted to the video's host. */
export function ApodVideo({ url, label, onError }: Props) {
  return (
    <WebView
      testID="apod-video"
      accessibilityLabel={label}
      source={{ uri: url, headers: { Referer: PLAYER_REFERER } }}
      originWhitelist={['https://*']}
      mixedContentMode="never"
      allowFileAccess={false}
      allowUniversalAccessFromFileURLs={false}
      thirdPartyCookiesEnabled={false}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(request) => keepInPlayer(request, url)}
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction
      onError={onError}
      onHttpError={onError}
    />
  );
}
