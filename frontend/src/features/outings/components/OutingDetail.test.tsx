import { fireEvent, render, screen } from '@testing-library/react-native';

import { myOuting, otherOuting } from '../../../../__mocks__/outings';
import { formatCoordinate, formatDateTime } from '../formatOuting';
import { OutingDetail } from './OutingDetail';

async function renderDetail(outing = myOuting, isAuthor = true) {
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  await render(
    <OutingDetail outing={outing} isAuthor={isAuthor} onEdit={onEdit} onDelete={onDelete} />,
  );
  return { onEdit, onDelete };
}

describe('OutingDetail', () => {
  it('shows the title as a header and the description', async () => {
    await renderDetail();

    expect(screen.getByRole('header', { name: myOuting.title })).toBeOnTheScreen();
    expect(screen.getByText(myOuting.description)).toBeOnTheScreen();
  });

  it('leaves the description out when it is empty', async () => {
    await renderDetail(otherOuting, false);

    expect(screen.queryByTestId('outing-description')).toBeNull();
  });

  it('shows the start, the end and the place with their labels', async () => {
    await renderDetail();

    expect(screen.getByText('Inici')).toBeOnTheScreen();
    expect(screen.getByText(formatDateTime(myOuting.starts_at, 'ca'))).toBeOnTheScreen();
    expect(screen.getByText('Fi')).toBeOnTheScreen();
    expect(screen.getByText(formatDateTime(myOuting.ends_at, 'ca'))).toBeOnTheScreen();
    expect(screen.getByText('Lloc')).toBeOnTheScreen();
    const { latitude, longitude } = myOuting.location;
    expect(
      screen.getByText(
        `${formatCoordinate(latitude, 'ca')} · ${formatCoordinate(longitude, 'ca')}`,
      ),
    ).toBeOnTheScreen();
  });

  it('shows who organises it, with a fallback when the author has no name', async () => {
    await renderDetail();
    expect(screen.getByText('Organitza')).toBeOnTheScreen();
    expect(screen.getByText('Raquel')).toBeOnTheScreen();
  });

  it('says a Perseida user organises it when the author has no name', async () => {
    await renderDetail(otherOuting, false);

    expect(screen.getByText('Una usuària de Perseida')).toBeOnTheScreen();
  });

  it('gives the author the buttons to edit and to delete', async () => {
    const { onEdit, onDelete } = await renderDetail();

    await fireEvent.press(screen.getByRole('button', { name: 'Edita' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Esborra' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('gives nobody else any button to change it', async () => {
    await renderDetail(myOuting, false);

    expect(screen.queryByRole('button', { name: 'Edita' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Esborra' })).toBeNull();
  });
});
