import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../__mocks__/events';
import { myOuting, otherOuting } from '../../../__mocks__/outings';
import { classifyEvents } from './classifyEvents';
import { toMapMarkers, toOutingMarkers } from './eventMarkers';

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
        kind: 'event',
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

// TG-646 (TG-52): the outings of the map are markers of their own kind.
describe('toOutingMarkers', () => {
  it('turns each outing into a marker of kind outing, at its location (TG-646 criterion 1)', () => {
    const markers = toOutingMarkers([myOuting], (outing) => `label of ${outing.title}`);

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      id: myOuting.id,
      latitude: myOuting.location.latitude,
      longitude: myOuting.location.longitude,
      label: `label of ${myOuting.title}`,
      kind: 'outing',
      active: false,
    });
  });

  it('keeps the order of the outings', () => {
    const markers = toOutingMarkers([otherOuting, myOuting], (outing) => outing.title);

    expect(markers.map((marker) => marker.id)).toEqual([otherOuting.id, myOuting.id]);
  });

  it('leaves out the outings without a location (TG-646 criterion 1)', () => {
    const noLocation = { ...otherOuting, location: null } as unknown as typeof otherOuting;

    const markers = toOutingMarkers([noLocation, myOuting], (outing) => outing.title);

    expect(markers.map((marker) => marker.id)).toEqual([myOuting.id]);
  });

  it('gives nothing for no outings', () => {
    expect(toOutingMarkers([], (outing) => outing.title)).toEqual([]);
  });
});
