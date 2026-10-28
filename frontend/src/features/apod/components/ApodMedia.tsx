import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, type ImageLoadEvent, StyleSheet, Text, View } from 'react-native';

import { safeHttpsUrl } from '../../../shared/security/safeUrl';
import { useTheme } from '../../../shared/theme';
import type { Apod } from '../api/getApodToday';
import { ApodVideo } from './ApodVideo';

/** Frame used until the image reports its real size. */
const PLACEHOLDER_ASPECT_RATIO = 4 / 3;
const VIDEO_ASPECT_RATIO = 16 / 9;

interface Props {
  apod: Apod;
}

/** APOD media (TG-119): the image at its real proportions, or the video in an embedded player. */
export function ApodMedia({ apod }: Props) {
  const { t } = useTranslation();
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
          {t('apod.mediaError')}
        </Text>
      </View>
    );
  }

  if (apod.media_type === 'video') {
    // The wrapper is not `accessible`: grouping it would hide the player controls from screen readers.
    return (
      <View style={[frame, { aspectRatio: VIDEO_ASPECT_RATIO }]}>
        <ApodVideo
          url={mediaUrl}
          label={`${t('apod.videoLabel')}: ${apod.title}`}
          onError={() => setFailed(true)}
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
