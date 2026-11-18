import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import {
  type ClassifiedEvent,
  type EventFilter,
  filterEvents,
} from '../../features/events/classifyEvents';
import { EventList } from '../../features/events/components/EventList';
import { EventMap } from '../../features/events/components/EventMap';
import { EventSheet } from '../../features/events/components/EventSheet';
import { MapStatus } from '../../features/events/components/MapStatus';
import { type EventsView, MapControls } from '../../features/events/components/MapControls';
import { MapTopBar } from '../../features/events/components/MapTopBar';
import { toMapMarkers, toOutingMarkers } from '../../features/events/eventMarkers';
import { describeEvent } from '../../features/events/formatEvent';
import { hiddenLayerProps } from '../../features/events/hiddenLayer';
import { useMapEvents } from '../../features/events/hooks/useEvents';
import { useIsWide } from '../../features/events/useIsWide';
import type { Outing } from '../../features/outings/api/outings';
import { describeOuting } from '../../features/outings/formatOuting';
import { useOutings } from '../../features/outings/hooks/useOutings';
import { SkyBackground } from '../../shared/ui';

const NO_EVENTS: ClassifiedEvent[] = [];
const NO_OUTINGS: Outing[] = [];
const ALL_OUTINGS = {};

/**
 * Events map (TG-52): active and upcoming events, as glass orbs on a map (only the ones with a
 * location) or as a list (all of them, also the ones visible from anywhere), filtered by
 * Active | Upcoming | Outings | All (All by default). The outings (TG-646) are markers of their
 * own on the map with Outings and All; the list is only for events (with Outings it shows all
 * of them) and a failure of the outings only warns in the controls. A marker or a row opens the summary sheet.
 * Title on top, the controls at the bottom; loading, empty and error states float over the map
 * or the list. On wide screens the summary sits beside the map. The page only orchestrates:
 * data comes from the hook.
 */
export default function MapScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [view, setView] = useState<EventsView>('map');
  const [filter, setFilter] = useState<EventFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [barBottom, setBarBottom] = useState(0);
  const { data, error: eventsError, isFetching, refetch } = useMapEvents();
  const outingsQuery = useOutings(ALL_OUTINGS);
  const wide = useIsWide();
  const mapLayer = hiddenLayerProps(view === 'list', Platform.OS);

  const outings = outingsQuery.data ?? NO_OUTINGS;
  const onlyOutings = filter === 'outings';
  const withOutings = onlyOutings || filter === 'all';
  const events = data ? filterEvents(data, filter) : NO_EVENTS;
  // The list only has events: the Outings filter has none of its own, so it shows them all.
  const listEvents = onlyOutings && data ? data.all : events;
  const markers = useMemo(
    () => [
      ...toMapMarkers(events, (event) => describeEvent(event, t)),
      ...(withOutings
        ? toOutingMarkers(outings, (outing) => describeOuting(outing, t, i18n.language))
        : []),
    ],
    [events, outings, withOutings, t, i18n.language],
  );
  // Looked up in every event and outing, so the sheet stays open if the filter changes behind it.
  const selected = data?.all.find((event) => event.id === selectedId) ?? null;
  const selectedOuting = outings.find((outing) => outing.id === selectedId) ?? null;
  const closeSheet = useCallback(() => setSelectedId(null), []);

  // The Outings filter does not need the events: it waits for, and fails with, the outings.
  const source = onlyOutings ? outingsQuery : { data, error: eventsError, isFetching, refetch };
  const shown =
    view === 'list' ? listEvents.length : events.length + (withOutings ? outings.length : 0);
  let status: ReactNode = null;
  if (!source.data) {
    // A retry shows the loading state again until the new answer arrives.
    status =
      source.error && !source.isFetching ? (
        <MapStatus
          state="error"
          code={source.error.code}
          onRetry={source.error.retryable ? () => void source.refetch() : undefined}
        />
      ) : (
        <MapStatus state="loading" />
      );
  } else if (shown === 0) {
    status = <MapStatus state="empty" message={t(`events.empty.${filter}`)} />;
  } else if (view === 'map' && markers.length === 0) {
    status = <MapStatus state="noLocation" onShowList={() => setView('list')} />;
  }

  const showOutings = (eventId: string) =>
    router.push({ pathname: '/outings', params: { eventId } });

  const openOuting = (outingId: string) => router.push(`/outings/${outingId}`);

  function goBack() {
    // Opened from a link there is nowhere to go back to: go home instead.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SkyBackground>
      <View style={[StyleSheet.absoluteFill, wide && styles.row]}>
        <View style={styles.fill}>
          <MapTopBar onBack={goBack} onLayout={setBarBottom} />
          <View style={styles.fill}>
            {/* The map is never unmounted: a new mount reloads it and loses the zoom and
                position. Under the list it stays laid out but invisible, untouchable and out
                of the accessibility tree, on native and on the web (`hiddenLayerProps`). */}
            <View testID="map-area" {...mapLayer} style={[styles.fill, mapLayer.style]}>
              <EventMap markers={markers} label={t('events.map.label')} onSelect={setSelectedId} />
            </View>
            {view === 'list' && (
              <View style={StyleSheet.absoluteFill}>
                <EventList
                  events={listEvents}
                  label={t('events.list.label')}
                  topInset={barBottom}
                  onSelect={setSelectedId}
                />
              </View>
            )}
            {status}
          </View>
          <MapControls
            view={view}
            onViewChange={setView}
            filter={filter}
            onFilterChange={setFilter}
            outingsUnavailable={outingsQuery.isError}
          />
        </View>
        {wide && (
          <EventSheet
            side
            event={selected}
            outing={selectedOuting}
            onClose={closeSheet}
            onShowOutings={showOutings}
            onOpenOuting={openOuting}
          />
        )}
      </View>
      {!wide && (
        <EventSheet
          event={selected}
          outing={selectedOuting}
          onClose={closeSheet}
          onShowOutings={showOutings}
          onOpenOuting={openOuting}
        />
      )}
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row' },
});
