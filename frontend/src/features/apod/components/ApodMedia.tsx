import { useState } from 'react';
import { Image, type ImageLoadEvent, Linking, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';

import { hostOf, safeHttpsUrl } from '../../../shared/security/safeUrl';
import { useTheme } from '../../../shared/theme';
import type { Apod } from '../api/getApodToday';
import { apodStrings } from '../strings';

/** Frame used until the image reports its real size. */
const PLACEHOLDER_ASPECT_RATIO = 4 / 3;
const VIDEO_ASPECT_RATIO = 16 / 9;
/**
 * YouTube refuses embeds without a Referer (error 153) and a WebView sends none, so the app
 * identifies itself. Should match the Android package once the team fixes it in app.json.
 */
export const PLAYER_REFERER = 'https://edu.upc.perseida';

/** Not exported from the package root: derived from the public props instead of `lib/`. */
type ShouldStartLoadRequest = Parameters<
  NonNullable<WebViewProps['onShouldStartLoadWithRequest']>
>[0];

interface Props {
  apod: Apod;
}

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

/** APOD media (TG-119): the image at its real proportions, or the video in an embedded player. */
export function ApodMedia({ apod }: Props) {
  const theme = useTheme();
  const [imageAspectRatio, setImageAspectRatio] = useState(PLACEHOLDER_ASPECT_RATIO);
  const [failed, setFailed] = useState(false);
  // The URL comes from the API: it is only loaded if it is plain https.
  const mediaUrl = safeHttpsUrl(apod.url);

  const frame = {
    width: '100%',
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.surface.glassBorder,
    backgroundColor: theme.colors.surface.glass,
    overflow: 'hidden',
  } as const;

  if (failed || !mediaUrl) {
    // The API answered but the remote media did not load: the title and text stay readable.
    return (
      <View
        style={[
          frame,
          styles.center,
          { aspectRatio: PLACEHOLDER_ASPECT_RATIO, padding: theme.spacing.md },
        ]}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.typography.body, { color: theme.colors.text.primary }]}
        >
          {apodStrings.mediaError}
        </Text>
      </View>
    );
  }

  if (apod.media_type === 'video') {
    // The wrapper is not `accessible`: grouping it would hide the player controls from screen readers.
    return (
      <View style={[frame, { aspectRatio: VIDEO_ASPECT_RATIO }]}>
        <WebView
          testID="apod-video"
          accessibilityLabel={`${apodStrings.videoLabel}: ${apod.title}`}
          source={{ uri: mediaUrl, headers: { Referer: PLAYER_REFERER } }}
          originWhitelist={['https://*']}
          mixedContentMode="never"
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          thirdPartyCookiesEnabled={false}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(request) => keepInPlayer(request, mediaUrl)}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
        />
      </View>
    );
  }

  const onLoad = ({ nativeEvent }: ImageLoadEvent) => {
    const { width, height } = nativeEvent.source;
    if (width > 0 && height > 0) setImageAspectRatio(width / height);
  };

  return (
    <Image
      testID="apod-image"
      accessible
      accessibilityRole="image"
      source={{ uri: mediaUrl }}
      accessibilityLabel={apod.title}
      resizeMode="contain"
      onLoad={onLoad}
      onError={() => setFailed(true)}
      style={[frame, { aspectRatio: imageAspectRatio }]}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
