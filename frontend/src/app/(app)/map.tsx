import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ClassifiedEvent } from '../../features/events/classifyEvents';
import { AnywhereEvents } from '../../features/events/components/AnywhereEvents';
import { EventList } from '../../features/events/components/EventList';
import { EventMap } from '../../features/events/components/EventMap';
import { type EventsView, MapTopBar } from '../../features/events/components/MapTopBar';
import { toMapMarkers } from '../../features/events/eventMarkers';
import { describeEvent } from '../../features/events/formatEvent';
import { useMapEvents } from '../../features/events/hooks/useEvents';
import { SkyBackground } from '../../shared/ui';

const NO_EVENTS: ClassifiedEvent[] = [];

/**
 * Events map (TG-52): active and upcoming events, as glass orbs on a map (only the ones with a
 * location, with the ones visible from anywhere listed under it) or as a list (all of them). The page only orchestrates: data comes from the hook.
 * Loading, empty and error states, the filter and the summary sheet come in later tasks.
 */
export default function MapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [view, setView] = useState<EventsView>('map');
  const [barBottom, setBarBottom] = useState(0);
  const { data } = useMapEvents();

  const events = data?.all ?? NO_EVENTS;
  const markers = useMemo(
    () => toMapMarkers(events, (event) => describeEvent(event, t)),
    [events, t],
  );
  const anywhere = useMemo(() => events.filter((event) => !event.location), [events]);

  function goBack() {
    // Opened from a link there is nowhere to go back to: go home instead.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SkyBackground>
      {view === 'map' ? (
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.map}>
            <EventMap markers={markers} label={t('events.map.label')} onSelect={() => undefined} />
          </View>
          <AnywhereEvents events={anywhere} />
        </View>
      ) : (
        <EventList events={events} label={t('events.list.label')} topInset={barBottom} />
      )}
      <MapTopBar view={view} onViewChange={setView} onBack={goBack} onLayout={setBarBottom} />
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
