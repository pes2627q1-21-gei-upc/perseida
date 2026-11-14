import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../__mocks__/events';
import { classifyEvents } from './classifyEvents';
import { toMapMarkers } from './eventMarkers';

describe('toMapMarkers', () => {
  const { all } = classifyEvents([launchEvent, meteorShowerEvent], [lunarEvent]);

  it('puts on the map only the events with a location', () => {
    const markers = toMapMarkers(all, (event) => event.title);

    expect(markers).toEqual([
      {
        id: launchEvent.id,
        latitude: launchEvent.location.latitude,
        longitude: launchEvent.location.longitude,
        label: launchEvent.title,
        category: 'launch',
        active: true,
      },
    ]);
  });

  it('marks upcoming events as not active and names them with the given label', () => {
    const upcomingLaunch = classifyEvents([], [launchEvent]).all;

    const [marker] = toMapMarkers(upcomingLaunch, (event) => `label of ${event.id}`);

    expect(marker.active).toBe(false);
    expect(marker.label).toBe(`label of ${launchEvent.id}`);
  });
});
