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
  it('criterion 3: an unlocked achievement shows its name and says it is unlocked', () => {
    render(<AchievementTrophy achievement={unlocked} onPress={jest.fn()} />);

    expect(screen.getByText('Primera llum')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Primera llum, desbloquejada' })).toBeOnTheScreen();
  });

  it('announces that pressing it opens the description', () => {
    render(<AchievementTrophy achievement={unlocked} onPress={jest.fn()} />);

    expect(screen.getByRole('button')).toHaveProp('accessibilityHint', 'Obre la descripció');
  });

  it('pressing an unlocked achievement gives it to onPress', () => {
    const onPress = jest.fn();
    render(<AchievementTrophy achievement={unlocked} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(unlocked);
  });

  it('criterion 3: a pending achievement hides its name and is announced as pending', () => {
    render(<AchievementTrophy achievement={pending} onPress={jest.fn()} />);

    expect(screen.queryByText('Lluna plena')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Fita pendent')).toBeOnTheScreen();
  });

  it('criterion 5: a pending achievement cannot be pressed, so it cannot be shared', () => {
    const onPress = jest.fn();
    render(<AchievementTrophy achievement={pending} onPress={onPress} />);

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Fita pendent'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
