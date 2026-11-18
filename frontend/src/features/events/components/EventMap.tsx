import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { onlyMapPage } from '../../../shared/map/onlyMapPage';
import { useTheme } from '../../../shared/theme';
import { buildLeafletHtml } from './leafletHtml';
import { markerPalette } from './markerIcon';
import { parseMapMessage, reportedCamera } from '../../../shared/map/cameraMessage';
import type { EventMapProps, MapCamera } from '../../../shared/map/mapTiles';

function selectedId(message: object): string | undefined {
  if (!('select' in message)) return undefined;
  const { select } = message as { select: unknown };
  return typeof select === 'string' ? select : undefined;
}

/**
 * Mobile events map (TG-52, ADR-0032): the web's Leaflet runs inside a WebView, so both
 * platforms show the same map. Only taps on markers that were passed in are reported.
 * New markers reload the page: it then opens where the user left it, not fitted again.
 */
export function EventMap({ markers, label, onSelect }: EventMapProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const zoomIn = t('events.map.zoomIn');
  const zoomOut = t('events.map.zoomOut');
  const palette = useMemo(() => markerPalette(colors), [colors]);
  // The last camera of a map that had markers (before, it is only the world view).
  const camera = useRef<MapCamera | undefined>(undefined);
  const [html, setHtml] = useState(() =>
    buildLeafletHtml(markers, label, { palette, reduceMotion }, { zoomIn, zoomOut }),
  );
  useEffect(() => {
    setHtml(
      buildLeafletHtml(
        markers,
        label,
        { palette, reduceMotion },
        { zoomIn, zoomOut },
        camera.current,
      ),
    );
  }, [markers, label, palette, reduceMotion, zoomIn, zoomOut]);
  const ids = useMemo(() => new Set(markers.map((m) => m.id)), [markers]);

  function onMessage(event: WebViewMessageEvent) {
    const message = parseMapMessage(event.nativeEvent.data);
    if (!message) return;
    const id = selectedId(message);
    if (id !== undefined && ids.has(id)) onSelect(id);
    const view = reportedCamera(message);
    if (view && markers.length > 0) camera.current = view;
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
