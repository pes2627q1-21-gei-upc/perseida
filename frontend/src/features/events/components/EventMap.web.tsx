import 'leaflet/dist/leaflet.css';

import { MapContainer, Marker, TileLayer } from 'react-leaflet';

import {
  CARTO_DARK_ATTRIBUTION,
  CARTO_DARK_SUBDOMAINS,
  CARTO_DARK_TILES,
  type EventMapProps,
  WORLD_CENTER,
  WORLD_ZOOM,
} from './mapTiles';

/**
 * Web events map (TG-52, ADR-0031): Leaflet through react-leaflet, bundled with the app, so it
 * works with the current CSP (`script-src 'self'`; tiles are images, `img-src https:`).
 * Leaflet markers are focusable and open with Enter, and carry the event title as their name.
 */
export function EventMap({ markers, label, onSelect }: EventMapProps) {
  return (
    <div role="region" aria-label={label} style={{ flex: 1, height: '100%', width: '100%' }}>
      <MapContainer
        center={WORLD_CENTER}
        zoom={WORLD_ZOOM}
        worldCopyJump
        style={{ height: '100%', width: '100%', background: '#020510' }}
      >
        <TileLayer
          url={CARTO_DARK_TILES}
          attribution={CARTO_DARK_ATTRIBUTION}
          subdomains={CARTO_DARK_SUBDOMAINS}
          maxZoom={19}
        />
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.latitude, m.longitude]}
            title={m.label}
            alt={m.label}
            keyboard
            eventHandlers={{ click: () => onSelect(m.id) }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
