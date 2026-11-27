import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  AccessibilityInfo,
  Platform,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';

import { launchEvent, lunarEvent } from '../../../../__mocks__/events';
import i18n from '../../../shared/i18n';
import { touch } from '../../../shared/theme';
import type { ClassifiedEvent } from '../classifyEvents';
import { EventRow } from './EventRow';

const launch: ClassifiedEvent = { ...launchEvent, status: 'upcoming' };
const fullMoon: ClassifiedEvent = { ...lunarEvent, status: 'upcoming' };

/** The distance text in Catalan: the whole kilometres, formatted for the language. */
function distanceText(km: string) {
  return i18n.t('events.search.distance', { distance: km });
}

afterEach(async () => {
  jest.restoreAllMocks();
  await i18n.changeLanguage('ca');
});

describe('EventRow distance (TG-51, criterion 6)', () => {
  it('shows no distance when it has none', async () => {
    await render(<EventRow event={fullMoon} />);

    expect(screen.queryByText(distanceText('0'))).toBeNull();
    expect(screen.getByLabelText(/^Full Moon, Lluna, /)).toBeTruthy();
  });

  it('shows the distance in whole kilometres, formatted in the language of the app', async () => {
    await render(<EventRow event={launch} distanceKm={7390.58} />);

    // The translation does interpolate the number.
    expect(distanceText('7.391')).toContain('7.391');
    expect(screen.getByText(distanceText('7.391'))).toBeTruthy();
  });

  it('formats the distance in the current language', async () => {
    await i18n.changeLanguage('en');

    await render(<EventRow event={launch} distanceKm={7390.58} />);

    expect(screen.getByText(distanceText('7,391'))).toBeTruthy();
  });

  it('rounds to the nearest kilometre', async () => {
    await render(<EventRow event={launch} distanceKm={504.4} />);

    expect(screen.getByText(distanceText('504'))).toBeTruthy();
  });

  it('includes the distance in the name read by screen readers', async () => {
    await render(<EventRow event={launch} distanceKm={7390.58} />);

    const row = screen.getByLabelText(new RegExp(`^${launchEvent.title.replace(/[|]/g, '\\|')}, `));
    expect(row.props.accessibilityLabel).toContain(distanceText('7.391'));
  });

  it('is not a button when it opens nothing (the list of the Events tab)', async () => {
    await render(<EventRow event={launch} distanceKm={7390.58} />);

    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});

/** Name of the star of an event: «Segueix <title>» in Catalan. */
function follow(title: string) {
  return i18n.t('events.subscription.follow', { title });
}

/** Height and width the star takes for touch: its size or its minimum size. */
function touchSize(element: { props: { style?: unknown } }) {
  const style = StyleSheet.flatten(element.props.style as StyleProp<ViewStyle>) ?? {};
  const size = (value: unknown) => (typeof value === 'number' ? value : 0);
  return {
    height: Math.max(size(style.height), size(style.minHeight)),
    width: Math.max(size(style.width), size(style.minWidth)),
  };
}

describe('EventRow subscription star (TG-53, criteria 7 and 8)', () => {
  it('has no star when it cannot subscribe (the map)', async () => {
    await render(<EventRow event={fullMoon} />);

    expect(screen.queryByRole('button', { name: follow(lunarEvent.title) })).toBeNull();
  });

  it('is a button named after the event that announces it is not followed', async () => {
    await render(<EventRow event={fullMoon} subscribed={false} onToggleSubscription={jest.fn()} />);

    expect(follow(lunarEvent.title)).toContain(lunarEvent.title);
    expect(
      screen.getByRole('button', { name: follow(lunarEvent.title), selected: false }),
    ).toBeTruthy();
  });

  it('announces that the event is followed', async () => {
    await render(<EventRow event={fullMoon} subscribed onToggleSubscription={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: follow(lunarEvent.title), selected: true }),
    ).toBeTruthy();
  });

  it('reports the press of the star', async () => {
    const onToggle = jest.fn();
    await render(<EventRow event={fullMoon} subscribed={false} onToggleSubscription={onToggle} />);

    await fireEvent.press(screen.getByRole('button', { name: follow(lunarEvent.title) }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('gives the star a touch target of at least touch.min', async () => {
    await render(<EventRow event={fullMoon} subscribed={false} onToggleSubscription={jest.fn()} />);

    const size = touchSize(screen.getByRole('button', { name: follow(lunarEvent.title) }));
    expect(size.height).toBeGreaterThanOrEqual(touch.min);
    expect(size.width).toBeGreaterThanOrEqual(touch.min);
  });

  it('shows the error of the subscription as an alert in the row', async () => {
    await render(
      <EventRow
        event={fullMoon}
        subscribed={false}
        onToggleSubscription={jest.fn()}
        subscriptionError="Aquest esdeveniment ja ha acabat."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Aquest esdeveniment ja ha acabat.');
  });

  it('reads the error of the subscription as a polite live region (Android and the web)', async () => {
    await render(
      <EventRow
        event={fullMoon}
        onToggleSubscription={jest.fn()}
        subscriptionError="Aquest esdeveniment ja ha acabat."
      />,
    );

    expect(screen.getByRole('alert')).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(screen.getByRole('alert')).toHaveProp('aria-live', 'polite');
  });

  it('announces the error of the subscription on iOS, which ignores live regions', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

    await render(
      <EventRow
        event={fullMoon}
        onToggleSubscription={jest.fn()}
        subscriptionError="Aquest esdeveniment ja ha acabat."
      />,
    );

    expect(announce).toHaveBeenCalledWith('Aquest esdeveniment ja ha acabat.');
  });

  it.each(['android', 'web'] as const)(
    'does not announce the error explicitly on %s: the live region reads it',
    async (os) => {
      jest.replaceProperty(Platform, 'OS', os);
      // The native module is already a mock: clear the calls of the tests before.
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();

      await render(
        <EventRow
          event={fullMoon}
          onToggleSubscription={jest.fn()}
          subscriptionError="Aquest esdeveniment ja ha acabat."
        />,
      );

      expect(announce).not.toHaveBeenCalled();
    },
  );

  it('disables the star while it cannot know whether the event is followed', async () => {
    const onToggle = jest.fn();
    await render(
      <EventRow event={fullMoon} onToggleSubscription={onToggle} subscriptionDisabled />,
    );

    const star = screen.getByRole('button', { name: follow(lunarEvent.title), disabled: true });
    await fireEvent.press(star);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('enables the star by default', async () => {
    await render(<EventRow event={fullMoon} onToggleSubscription={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: follow(lunarEvent.title), disabled: false }),
    ).toBeTruthy();
  });

  it('shows no alert without an error', async () => {
    await render(<EventRow event={fullMoon} subscribed={false} onToggleSubscription={jest.fn()} />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the row itself not pressable: only the star is a button', async () => {
    await render(<EventRow event={fullMoon} subscribed={false} onToggleSubscription={jest.fn()} />);

    expect(screen.getByLabelText(/^Full Moon, Lluna, /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Full Moon, / })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
