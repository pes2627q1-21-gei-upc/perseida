import { fireEvent, render, screen } from '@testing-library/react-native';

import { otherSpace, spotwiseLibrary, unvotedCafe } from '../../../../__mocks__/meetingPoints';
import i18n from '../../../shared/i18n';
import type { MeetingPoint } from '../api/meetingPoints';
import { formatDistance } from '../formatMeetingPoint';
import { MeetingPointRow } from './MeetingPointRow';

// The icons as plain views that say what they are, keeping the props they are given (so a
// prop that hides them from screen readers still hides them).
jest.mock('phosphor-react-native', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const icon = (name: string) => (props: Record<string, unknown>) =>
    createElement(View, { ...props, testID: `icon-${name}` });
  return {
    ...jest.requireActual('phosphor-react-native'),
    Books: icon('Books'),
    Coffee: icon('Coffee'),
    MapPin: icon('MapPin'),
  };
});

const library: MeetingPoint = spotwiseLibrary;
const cafe: MeetingPoint = unvotedCafe;
const other: MeetingPoint = otherSpace;
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

/** The texts of every attribute chip, by the value it stands for. */
const chips = {
  wifi: () => t('meetingPoints.attribute.wifi'),
  silent: () => t('meetingPoints.attribute.silence.silent'),
  murmur: () => t('meetingPoints.attribute.silence.murmur'),
  noisy: () => t('meetingPoints.attribute.silence.noisy'),
  manyPlugs: () => t('meetingPoints.attribute.plugs.many'),
  fewPlugs: () => t('meetingPoints.attribute.plugs.few'),
  noPlugs: () => t('meetingPoints.attribute.plugs.none'),
  groups: () => t('meetingPoints.attribute.groupFriendly'),
  notGroups: () => t('meetingPoints.attribute.notGroupFriendly'),
};

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether the row says the text, as visible text or in the name read by screen readers. */
function says(text: string): boolean {
  return (
    screen.queryAllByText(text).length > 0 ||
    screen.queryAllByLabelText(new RegExp(escape(text))).length > 0
  );
}

/**
 * The texts the row shows on screen that are not its name, type, distance or address: the
 * chips, in the order they are shown. The separator between type and distance is left out.
 */
function visibleChips(point: MeetingPoint): string[] {
  const fixed = new Set([
    point.name,
    t(`meetingPoints.type.${point.type}`),
    formatDistance(point.distance_m, 'ca'),
    point.address,
    '·',
  ]);
  return screen
    .queryAllByText(/[\s\S]*/)
    .map((text) => [text.props.children].flat().join(''))
    .filter((text) => !fixed.has(text));
}

function icon(name: string) {
  return screen.queryByTestId(`icon-${name}`, { includeHiddenElements: true });
}

describe('MeetingPointRow (TG-352)', () => {
  it('shows the name, the address and the formatted distance', async () => {
    await render(<MeetingPointRow point={library} />);

    expect(screen.getByText(library.name)).toBeTruthy();
    expect(screen.getByText(library.address)).toBeTruthy();
    expect(screen.getByText(formatDistance(290, 'ca'))).toBeTruthy();
  });

  it('formats the distance in the language of the app', async () => {
    await i18n.changeLanguage('en');
    try {
      await render(<MeetingPointRow point={cafe} />);

      expect(screen.getByText(formatDistance(1140, 'en'))).toBeTruthy();
    } finally {
      await i18n.changeLanguage('ca');
    }
  });

  it('shows no address line when the address is empty', async () => {
    await render(<MeetingPointRow point={cafe} />);

    expect(screen.getByText(cafe.name)).toBeTruthy();
    expect(screen.queryAllByText(/^\s*$/)).toHaveLength(0);
  });

  it.each([
    ['library', library, 'Books'],
    ['cafe', cafe, 'Coffee'],
    ['other', other, 'MapPin'],
  ] as const)('marks a %s with its icon and says its type in words', async (type, point, name) => {
    await render(<MeetingPointRow point={point} />);

    expect(icon(name)).toBeTruthy();
    for (const unused of ['Books', 'Coffee', 'MapPin'].filter((each) => each !== name)) {
      expect(icon(unused)).toBeNull();
    }
    // The icon is decorative: the type reaches screen readers as text.
    expect(says(t(`meetingPoints.type.${type}`))).toBe(true);
  });

  it('hides the icon of the type from screen readers', async () => {
    await render(<MeetingPointRow point={library} />);

    expect(icon('Books')).toBeTruthy();
    expect(screen.queryByTestId('icon-Books')).toBeNull();
  });

  it('shows a chip for each attribute that is known', async () => {
    await render(<MeetingPointRow point={library} />);

    expect(says(chips.wifi())).toBe(true);
    expect(says(chips.murmur())).toBe(true);
    expect(says(chips.manyPlugs())).toBe(true);
    expect(says(chips.groups())).toBe(true);
    expect(says(chips.notGroups())).toBe(false);
    expect(says(chips.silent())).toBe(false);
    expect(says(chips.noisy())).toBe(false);
    expect(says(chips.fewPlugs())).toBe(false);
    expect(says(chips.noPlugs())).toBe(false);
  });

  it('shows on screen exactly the chips of what is known, and nothing else', async () => {
    await render(<MeetingPointRow point={library} />);

    expect(visibleChips(library).sort()).toEqual(
      [chips.wifi(), chips.murmur(), chips.manyPlugs(), chips.groups()].sort(),
    );
  });

  it('shows on screen no chip at all when nothing is known', async () => {
    await render(<MeetingPointRow point={cafe} />);

    expect(visibleChips(cafe)).toEqual([]);
  });

  it('shows on screen exactly the chips of the other values', async () => {
    await render(<MeetingPointRow point={other} />);

    expect(visibleChips(other).sort()).toEqual(
      [chips.silent(), chips.noPlugs(), chips.notGroups()].sort(),
    );
  });

  it('reads each part of the point as its own phrase, separated by commas', async () => {
    await render(<MeetingPointRow point={library} />);

    const label = String(
      screen.getByLabelText(new RegExp(`^${escape(library.name)}`)).props.accessibilityLabel,
    );
    // The address has commas of its own: it is looked for as a whole, between separators.
    expect(label).toContain(`, ${library.address}`);
    const parts = label.split(', ');
    for (const part of [
      library.name,
      t('meetingPoints.type.library'),
      formatDistance(290, 'ca'),
      chips.wifi(),
      chips.murmur(),
      chips.manyPlugs(),
      chips.groups(),
    ]) {
      expect(parts).toContain(part);
    }
  });

  it('leaves no empty part in the name read by screen readers when the address is empty', async () => {
    await render(<MeetingPointRow point={cafe} />);

    const label = String(
      screen.getByLabelText(new RegExp(`^${escape(cafe.name)}`)).props.accessibilityLabel,
    );
    expect(label).not.toMatch(/,\s*,/);
    expect(label).not.toMatch(/,\s*$/);
    expect(label.split(', ').every((part) => part.trim().length > 0)).toBe(true);
  });

  it('shows no chip for what is unknown or missing', async () => {
    await render(<MeetingPointRow point={cafe} />);

    for (const chip of Object.values(chips)) {
      expect(says(chip())).toBe(false);
    }
  });

  it('shows the other values of the votes, and a negative chip when it is not for groups', async () => {
    await render(<MeetingPointRow point={other} />);

    expect(says(chips.silent())).toBe(true);
    expect(says(chips.noPlugs())).toBe(true);
    expect(says(chips.notGroups())).toBe(true);
    expect(says(chips.wifi())).toBe(false);
    expect(says(chips.groups())).toBe(false);
  });

  it.each([
    ['noisy', 'few'],
    ['silent', 'many'],
  ] as const)('shows the silence %s and the plugs %s', async (silence, plugs) => {
    await render(<MeetingPointRow point={{ ...library, silence_level: silence, plugs }} />);

    expect(says(t(`meetingPoints.attribute.silence.${silence}`))).toBe(true);
    expect(says(t(`meetingPoints.attribute.plugs.${plugs}`))).toBe(true);
  });

  it('is not a button when it cannot be chosen', async () => {
    await render(<MeetingPointRow point={library} />);

    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('is a button named after the point when it can be chosen', async () => {
    const onChoose = jest.fn();
    await render(<MeetingPointRow point={library} onChoose={onChoose} />);

    const button = screen.getByRole('button', { name: new RegExp(escape(library.name)) });
    await fireEvent.press(button);

    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('uses the text to choose a point as the name of the button', async () => {
    await render(<MeetingPointRow point={library} onChoose={jest.fn()} />);

    const choose = t('meetingPoints.choose', { name: library.name });

    expect(choose).toContain(library.name);
    expect(screen.getByRole('button', { name: new RegExp(escape(choose)) })).toBeTruthy();
  });
});
