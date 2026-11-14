import 'leaflet/dist/leaflet.css';

import { divIcon } from 'leaflet';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'react-native-reanimated';
import {
  AttributionControl,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  ZoomControl,
} from 'react-leaflet';

import { useTheme } from '../../../shared/theme';
import { MARKER_SIZE, markerCss, markerIconHtml, markerPalette } from './markerIcon';
import {
  BASE_MAP_ATTRIBUTION,
  BASE_MAP_MAX_ZOOM,
  BASE_MAP_TILES,
  type EventMapProps,
  FIT_BOUNDS_OPTIONS,
  MAP_ATTRIBUTION_PREFIX,
  type MapMarker,
  WORLD_CENTER,
  WORLD_ZOOM,
} from './mapTiles';

/** Brings every marker into view whenever they change; with none, the world stays in view. */
function FitToMarkers({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length === 0) return;
    map.fitBounds(
      markers.map((m) => [m.latitude, m.longitude] as [number, number]),
      FIT_BOUNDS_OPTIONS,
    );
  }, [map, markers]);
  return null;
}

/**
 * Puts the CSS of the orbs in the page while the map is shown. It goes in as `textContent`,
 * which can never become markup; it is built from our constants and theme tokens only.
 */
function useOrbStyles(css: string) {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
  }, [css]);
}

function orbIcon(marker: MapMarker) {
  return divIcon({
    className: 'pm-marker',
    html: markerIconHtml(marker),
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
  });
}

/**
 * Web events map (TG-52, ADR-0032): Leaflet through react-leaflet, bundled with the app, so it
 * works with the current CSP (`script-src 'self'`; tiles are images, `img-src https:`).
 * Markers are the glass orbs of their category (the same HTML as the mobile map): focusable,
 * opened with Enter, and named after the event through their title.
 */
export function EventMap({ markers, label, onSelect }: EventMapProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const css = useMemo(
    () => markerCss(markerPalette(colors), { reduceMotion }),
    [colors, reduceMotion],
  );
  useOrbStyles(css);
  const icons = useMemo(() => new Map(markers.map((m) => [m.id, orbIcon(m)])), [markers]);

  return (
    <div role="region" aria-label={label} style={{ flex: 1, height: '100%', width: '100%' }}>
      <MapContainer
        center={WORLD_CENTER}
        zoom={WORLD_ZOOM}
        worldCopyJump
        zoomControl={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%', background: '#020510' }}
      >
        <TileLayer
          url={BASE_MAP_TILES}
          attribution={BASE_MAP_ATTRIBUTION}
          maxZoom={BASE_MAP_MAX_ZOOM}
        />
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.latitude, m.longitude]}
            icon={icons.get(m.id)}
            title={m.label}
            keyboard
            eventHandlers={{ click: () => onSelect(m.id) }}
          />
        ))}
        {/* The top of the map is under the floating bar of the screen. */}
        <AttributionControl position="bottomright" prefix={MAP_ATTRIBUTION_PREFIX} />
        <ZoomControl
          position="bottomright"
          zoomInTitle={t('events.map.zoomIn')}
          zoomOutTitle={t('events.map.zoomOut')}
        />
        <FitToMarkers markers={markers} />
      </MapContainer>
    </div>
  );
}
