import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

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
import { toMapMarkers } from '../../features/events/eventMarkers';
import { describeEvent } from '../../features/events/formatEvent';
import { useMapEvents } from '../../features/events/hooks/useEvents';
import { useIsWide } from '../../features/events/useIsWide';
import { SkyBackground } from '../../shared/ui';

const NO_EVENTS: ClassifiedEvent[] = [];

/**
 * Events map (TG-52): active and upcoming events, as glass orbs on a map (only the ones with a
 * location) or as a list (all of them, also the ones visible from anywhere), filtered by
 * Active | Upcoming | All (All by default). A marker or a row opens the summary sheet.
 * Title on top, the controls at the bottom; loading, empty and error states float over the map
 * or the list. On wide screens the summary sits beside the map. The page only orchestrates:
 * data comes from the hook.
 */
export default function MapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [view, setView] = useState<EventsView>('map');
  const [filter, setFilter] = useState<EventFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [barBottom, setBarBottom] = useState(0);
  const { data, error, isFetching, refetch } = useMapEvents();
  const wide = useIsWide();

  const events = data ? filterEvents(data, filter) : NO_EVENTS;
  const markers = useMemo(
    () => toMapMarkers(events, (event) => describeEvent(event, t)),
    [events, t],
  );
  // Looked up in every event, so the sheet stays open if the filter changes behind it.
  const selected = data?.all.find((event) => event.id === selectedId) ?? null;
  const closeSheet = useCallback(() => setSelectedId(null), []);

  let status: ReactNode = null;
  if (!data) {
    // A retry shows the loading state again until the new answer arrives.
    status =
      error && !isFetching ? (
        <MapStatus
          state="error"
          code={error.code}
          onRetry={error.retryable ? () => void refetch() : undefined}
        />
      ) : (
        <MapStatus state="loading" />
      );
  } else if (events.length === 0) {
    status = <MapStatus state="empty" message={t(`events.empty.${filter}`)} />;
  } else if (view === 'map' && markers.length === 0) {
    status = <MapStatus state="noLocation" onShowList={() => setView('list')} />;
  }

  function goBack() {
    // Opened from a link there is nowhere to go back to: go home instead.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SkyBackground>
      <MapTopBar onBack={goBack} onLayout={setBarBottom} />
      <View style={StyleSheet.absoluteFill}>
        <View style={[styles.fill, wide && styles.row]}>
          <View style={styles.fill}>
            {view === 'map' ? (
              <View testID="map-area" style={styles.fill}>
                <EventMap
                  markers={markers}
                  label={t('events.map.label')}
                  onSelect={setSelectedId}
                />
              </View>
            ) : (
              <EventList
                events={events}
                label={t('events.list.label')}
                topInset={barBottom}
                onSelect={setSelectedId}
              />
            )}
            {status}
          </View>
          {wide && <EventSheet side event={selected} onClose={closeSheet} topInset={barBottom} />}
        </View>
        <MapControls
          view={view}
          onViewChange={setView}
          filter={filter}
          onFilterChange={setFilter}
        />
      </View>
      {!wide && <EventSheet event={selected} onClose={closeSheet} />}
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row' },
});
