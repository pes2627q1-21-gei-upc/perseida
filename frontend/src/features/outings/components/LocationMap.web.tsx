import 'leaflet/dist/leaflet.css';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AttributionControl,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  ZoomControl,
} from 'react-leaflet';

import {
  BASE_MAP_ATTRIBUTION,
  BASE_MAP_MAX_ZOOM,
  BASE_MAP_TILES,
  MAP_ATTRIBUTION_PREFIX,
  type MapCamera,
} from '../../../shared/map/mapTiles';
import { useTheme } from '../../../shared/theme';
import type { LocationMapProps } from './LocationMap';

/** Reports the camera after every move, and moves the map when `start` changes. */
function CameraBridge({
  start,
  onCameraChange,
}: Pick<LocationMapProps, 'start' | 'onCameraChange'>) {
  const map = useMap();
  useMapEvents({
    moveend: () => {
      const { lat, lng } = map.getCenter().wrap();
      onCameraChange({ latitude: lat, longitude: lng, zoom: map.getZoom() } satisfies MapCamera);
    },
  });
  // The map already opened at the first start: only a later one moves it.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    map.setView([start.latitude, start.longitude], start.zoom);
  }, [map, start]);
  return null;
}

/**
 * Web map to choose a place (TG-629, ADR-0032): Leaflet through react-leaflet, like the events
 * map. Keyboard: the arrows move the map and +/- zoom it; the place is the centre, under the
 * reticle of the screen.
 */
export function LocationMap({ start, label, onCameraChange }: LocationMapProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <div role="region" aria-label={label} style={{ flex: 1, height: '100%', width: '100%' }}>
      <MapContainer
        center={[start.latitude, start.longitude]}
        zoom={start.zoom}
        worldCopyJump
        zoomControl={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%', background: colors.map.background }}
      >
        <TileLayer
          url={BASE_MAP_TILES}
          attribution={BASE_MAP_ATTRIBUTION}
          maxZoom={BASE_MAP_MAX_ZOOM}
        />
        <AttributionControl position="bottomright" prefix={MAP_ATTRIBUTION_PREFIX} />
        <ZoomControl
          position="bottomright"
          zoomInTitle={t('events.map.zoomIn')}
          zoomOutTitle={t('events.map.zoomOut')}
        />
        <CameraBridge start={start} onCameraChange={onCameraChange} />
      </MapContainer>
    </div>
  );
}
