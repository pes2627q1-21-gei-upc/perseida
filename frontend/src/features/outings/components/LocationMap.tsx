import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { parseMapMessage, reportedCamera } from '../../../shared/map/cameraMessage';
import type { MapCamera } from '../../../shared/map/mapTiles';
import { onlyMapPage } from '../../../shared/map/onlyMapPage';
import { useTheme } from '../../../shared/theme';
import { buildPickerHtml } from './pickerHtml';

export interface LocationMapProps {
  /** Where the map opens. A new value opens it again there; moving it by hand does not. */
  start: MapCamera;
  /** Accessible name of the map. */
  label: string;
  /** The camera after every move: its centre is the place the person is choosing. */
  onCameraChange: (camera: MapCamera) => void;
}

/**
 * Mobile map to choose a place (TG-629, ADR-0032): Leaflet inside a WebView, like the events
 * map. The page is only built again when `start` changes, so moving the map never reloads it.
 */
export function LocationMap({ start, label, onCameraChange }: LocationMapProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const zoomIn = t('events.map.zoomIn');
  const zoomOut = t('events.map.zoomOut');
  const background = colors.map.background;
  const source = useMemo(
    () => ({
      html: buildPickerHtml({ camera: start, label, background, zoom: { zoomIn, zoomOut } }),
    }),
    [start, label, background, zoomIn, zoomOut],
  );

  function onMessage(event: WebViewMessageEvent) {
    const message = parseMapMessage(event.nativeEvent.data);
    const camera = message && reportedCamera(message);
    if (camera) onCameraChange(camera);
  }

  return (
    <WebView
      accessibilityLabel={label}
      source={source}
      originWhitelist={['*']}
      javaScriptEnabled
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={onlyMapPage}
      onMessage={onMessage}
      style={{ flex: 1, backgroundColor: background }}
    />
  );
}
