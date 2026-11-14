import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { safeHttpsUrl } from '../../../shared/security/safeUrl';
import { useTheme } from '../../../shared/theme';
import { buildLeafletHtml } from './leafletHtml';
import { markerPalette } from './markerIcon';
import type { EventMapProps } from './mapTiles';

type ShouldStartLoadRequest = Parameters<
  NonNullable<WebViewProps['onShouldStartLoadWithRequest']>
>[0];

/**
 * The WebView only shows the map page itself (loaded from a string, so `about:blank`).
 * Links on the map (the tile attribution) open in the system browser if they are plain https;
 * anything else is blocked without leaving the app.
 */
function onlyMapPage(request: ShouldStartLoadRequest): boolean {
  if (request.url === 'about:blank') return true;
  const link = safeHttpsUrl(request.url);
  if (link) Linking.openURL(link).catch(() => undefined);
  return false;
}

function selectedId(data: string): string | undefined {
  try {
    const message: unknown = JSON.parse(data);
    if (typeof message === 'object' && message !== null && 'select' in message) {
      const { select } = message as { select: unknown };
      return typeof select === 'string' ? select : undefined;
    }
  } catch {
    // Not a message from the map page.
  }
  return undefined;
}

/**
 * Mobile events map (TG-52, ADR-0032): the web's Leaflet runs inside a WebView, so both
 * platforms show the same map. Only taps on markers that were passed in are reported.
 */
export function EventMap({ markers, label, onSelect }: EventMapProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const zoomIn = t('events.map.zoomIn');
  const zoomOut = t('events.map.zoomOut');
  const palette = useMemo(() => markerPalette(colors), [colors]);
  const html = useMemo(
    () => buildLeafletHtml(markers, label, { palette, reduceMotion }, { zoomIn, zoomOut }),
    [markers, label, palette, reduceMotion, zoomIn, zoomOut],
  );
  const ids = useMemo(() => new Set(markers.map((m) => m.id)), [markers]);

  function onMessage(event: WebViewMessageEvent) {
    const id = selectedId(event.nativeEvent.data);
    if (id !== undefined && ids.has(id)) onSelect(id);
  }

  return (
    <WebView
      accessibilityLabel={label}
      source={{ html }}
      originWhitelist={['*']}
      javaScriptEnabled
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={onlyMapPage}
      onMessage={onMessage}
      style={{ flex: 1, backgroundColor: palette.background }}
    />
  );
}
