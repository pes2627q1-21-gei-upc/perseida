import { render, screen } from '@testing-library/react-native';

import { launchEvent, lunarEvent } from '../../../../__mocks__/events';
import i18n from '../../../shared/i18n';
import type { ClassifiedEvent } from '../classifyEvents';
import { EventRow } from './EventRow';

const launch: ClassifiedEvent = { ...launchEvent, status: 'upcoming' };
const fullMoon: ClassifiedEvent = { ...lunarEvent, status: 'upcoming' };

/** The distance text in Catalan: the whole kilometres, formatted for the language. */
function distanceText(km: string) {
  return i18n.t('events.search.distance', { distance: km });
}

afterEach(async () => {
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
