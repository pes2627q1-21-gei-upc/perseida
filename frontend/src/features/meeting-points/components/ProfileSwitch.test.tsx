import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '../../../shared/i18n';
import { ProfileSwitch } from './ProfileSwitch';

// TG-352: the person picks what the meeting is for, a watch party or a study session.
// Each option is a radio button or a tab (both say which one is on).
const OPTION_ROLE = /^(radio|tab)$/;
const watchParty = () => i18n.t('meetingPoints.profile.watch_party');
const study = () => i18n.t('meetingPoints.profile.study');

function option(name: string) {
  return screen.getByRole(OPTION_ROLE, { name });
}

/** Whether the option is announced as the chosen one, as a tab (selected) or a radio (checked). */
function isOn(element: { props: Record<string, unknown> }): boolean {
  const { props } = element;
  const state = (props.accessibilityState ?? {}) as { selected?: boolean; checked?: boolean };
  return (
    state.selected === true ||
    state.checked === true ||
    props['aria-selected'] === true ||
    props['aria-checked'] === true
  );
}

describe('ProfileSwitch (TG-352)', () => {
  it('offers the two profiles, as a named group of options', async () => {
    await render(<ProfileSwitch value="watch_party" onChange={jest.fn()} />);

    // The group is a container, not an accessibility element, so it is found by its label.
    expect(screen.getByLabelText(i18n.t('meetingPoints.profile.label'))).toBeTruthy();
    expect(screen.getAllByRole(OPTION_ROLE)).toHaveLength(2);
    expect(option(watchParty())).toBeTruthy();
    expect(option(study())).toBeTruthy();
  });

  it('announces which profile is chosen', async () => {
    await render(<ProfileSwitch value="study" onChange={jest.fn()} />);

    expect(isOn(option(study()))).toBe(true);
    expect(isOn(option(watchParty()))).toBe(false);
  });

  it('announces the watch party when it is the chosen one', async () => {
    await render(<ProfileSwitch value="watch_party" onChange={jest.fn()} />);

    expect(isOn(option(watchParty()))).toBe(true);
    expect(isOn(option(study()))).toBe(false);
  });

  it('reports the profile the person picks', async () => {
    const onChange = jest.fn();
    await render(<ProfileSwitch value="watch_party" onChange={onChange} />);

    await fireEvent.press(option(study()));

    expect(onChange).toHaveBeenCalledWith('study');
  });

  it('reports the watch party too', async () => {
    const onChange = jest.fn();
    await render(<ProfileSwitch value="study" onChange={onChange} />);

    await fireEvent.press(option(watchParty()));

    expect(onChange).toHaveBeenCalledWith('watch_party');
  });
});
