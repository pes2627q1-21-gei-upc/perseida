import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { myOuting, otherOuting } from '../../../../__mocks__/outings';
import { formatDateTime } from '../formatOuting';
import { OutingList } from './OutingList';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const LABEL = 'Llista de sortides';

async function renderList(onSelect = jest.fn()) {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <OutingList outings={[myOuting, otherOuting]} label={LABEL} onSelect={onSelect} />
    </SafeAreaProvider>,
  );
  return onSelect;
}

describe('OutingList', () => {
  it('is a list with an accessible name', async () => {
    await renderList();

    // A list is a container, not an accessibility element, so it is found by its label.
    expect(screen.getByLabelText(LABEL).props.accessibilityRole).toBe('list');
  });

  it('shows one row per outing with its title, when it starts and who organises it', async () => {
    await renderList();

    const when = formatDateTime(myOuting.starts_at, 'ca');
    expect(screen.getByText(myOuting.title)).toBeOnTheScreen();
    expect(screen.getAllByText(when)).toHaveLength(2);
    expect(screen.getByText('Organitza: Raquel')).toBeOnTheScreen();
  });

  it('says a Perseida user organises it when the author has no name', async () => {
    await renderList();

    expect(screen.getByText('Organitza: Una usuària de Perseida')).toBeOnTheScreen();
  });

  it('reads each row as one button that says all of it', async () => {
    await renderList();

    const when = formatDateTime(myOuting.starts_at, 'ca');
    expect(
      screen.getByRole('button', { name: `${myOuting.title}, ${when}, Organitza: Raquel` }),
    ).toBeOnTheScreen();
  });

  it('opens the outing the person taps', async () => {
    const onSelect = await renderList();

    await fireEvent.press(screen.getByText(otherOuting.title));

    expect(onSelect).toHaveBeenCalledWith(otherOuting.id);
  });
});
