import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ClassifiedEvent } from '../../features/events/classifyEvents';
import { AnywhereEvents } from '../../features/events/components/AnywhereEvents';
import { EventList } from '../../features/events/components/EventList';
import { EventMap } from '../../features/events/components/EventMap';
import { MapTopBar } from '../../features/events/components/MapTopBar';
import { type EventsView, MapViewSwitch } from '../../features/events/components/MapViewSwitch';
import { toMapMarkers } from '../../features/events/eventMarkers';
import { describeEvent } from '../../features/events/formatEvent';
import { useMapEvents } from '../../features/events/hooks/useEvents';
import { SkyBackground } from '../../shared/ui';

const NO_EVENTS: ClassifiedEvent[] = [];

/**
 * Events map (TG-52): active and upcoming events, as glass orbs on a map (only the ones with a
 * location, with the ones visible from anywhere listed under it) or as a list (all of them).
 * Title on top, the Map | List switch at the bottom. The page only orchestrates: data comes
 * from the hook. Loading, empty and error states, the filter and the summary sheet come later.
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
      <MapTopBar onBack={goBack} onLayout={setBarBottom} />
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.fill}>
          {view === 'map' ? (
            <>
              <View style={styles.fill}>
                <EventMap
                  markers={markers}
                  label={t('events.map.label')}
                  onSelect={() => undefined}
                />
              </View>
              <AnywhereEvents events={anywhere} />
            </>
          ) : (
            <EventList events={events} label={t('events.list.label')} topInset={barBottom} />
          )}
        </View>
        <MapViewSwitch view={view} onChange={setView} />
      </View>
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
