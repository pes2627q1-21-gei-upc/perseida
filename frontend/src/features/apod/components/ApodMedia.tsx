import { useState } from 'react';
import {
  Image,
  type ImageLoadEventData,
  Linking,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

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

interface Props {
  apod: Apod;
}

/** Host of an http(s) URL, without depending on the URL polyfill (incomplete in React Native). */
function hostOf(url: string): string | undefined {
  return /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase();
}

/**
 * The player only navigates within the video's own host. Links that leave it (logo, related
 * videos) open in the system browser instead of turning the player into a browser.
 * Inner frames (iOS `isTopFrame: false`) are the player's own resources and always load.
 */
export function keepInPlayer(request: ShouldStartLoadRequest, videoUrl: string): boolean {
  if (request.isTopFrame === false) return true;
  if (hostOf(request.url) === hostOf(videoUrl)) return true;
  void Linking.openURL(request.url);
  return false;
}

/** APOD media (TG-119): the image at its real proportions, or the video in an embedded player. */
export function ApodMedia({ apod }: Props) {
  const theme = useTheme();
  const [imageAspectRatio, setImageAspectRatio] = useState(PLACEHOLDER_ASPECT_RATIO);
  const [failed, setFailed] = useState(false);

  const frame = {
    width: '100%',
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.surface.glassBorder,
    backgroundColor: theme.colors.surface.glass,
    overflow: 'hidden',
  } as const;

  if (failed) {
    // The API answered but the remote media did not load: the title and text stay readable.
    return (
      <View
        style={[
          frame,
          styles.center,
          { aspectRatio: PLACEHOLDER_ASPECT_RATIO, padding: theme.spacing.md },
        ]}
      >
        <Text style={[theme.typography.body, { color: theme.colors.text.primary }]}>
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
          source={{ uri: apod.url, headers: { Referer: PLAYER_REFERER } }}
          originWhitelist={['https://*']}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(request) => keepInPlayer(request, apod.url)}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  const onLoad = ({ nativeEvent }: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { width, height } = nativeEvent.source;
    if (width > 0 && height > 0) setImageAspectRatio(width / height);
  };

  return (
    <Image
      testID="apod-image"
      accessible
      accessibilityRole="image"
      source={{ uri: apod.url }}
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
