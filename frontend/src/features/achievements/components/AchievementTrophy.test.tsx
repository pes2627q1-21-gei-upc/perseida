import { fireEvent, render, screen } from '@testing-library/react-native';

import { achievement } from '../../../../__mocks__/achievements';
import '../../../shared/i18n';
import { AchievementTrophy } from './AchievementTrophy';

const unlocked = achievement({
  code: 'primera_llum',
  current: 1,
  goal: 1,
  unlocked: true,
  unlocked_at: '2026-11-10T08:00:00Z',
});
const pending = achievement({ code: 'lluna_plena', name: 'Lluna plena', current: 3, goal: 14 });

describe('AchievementTrophy (TG-59 #578)', () => {
  it('criterion 3: an unlocked achievement shows its name and is a button', async () => {
    await render(<AchievementTrophy achievement={unlocked} onPress={jest.fn()} />);

    expect(screen.getByText('Primera llum')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Primera llum' })).toBeOnTheScreen();
  });

  it('announces that pressing it opens the description', async () => {
    await render(<AchievementTrophy achievement={unlocked} onPress={jest.fn()} />);

    expect(screen.getByRole('button')).toHaveProp('accessibilityHint', 'Obre la descripció');
  });

  it('pressing an unlocked achievement gives it to onPress', async () => {
    const onPress = jest.fn();
    await render(<AchievementTrophy achievement={unlocked} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(unlocked);
  });

  it('criterion 3: a pending achievement hides its name and is announced as pending', async () => {
    await render(<AchievementTrophy achievement={pending} onPress={jest.fn()} />);

    expect(screen.queryByText('Lluna plena')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Fita pendent')).toBeOnTheScreen();
  });

  it('criterion 5: a pending achievement cannot be pressed, so it cannot be shared', async () => {
    await render(<AchievementTrophy achievement={pending} onPress={jest.fn()} />);

    // Nothing to press: no button for the screen reader and none for the touch.
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
