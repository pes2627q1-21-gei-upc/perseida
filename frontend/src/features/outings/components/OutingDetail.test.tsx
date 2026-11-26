import { fireEvent, render, screen } from '@testing-library/react-native';

import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import { classifyEvents } from '../../events/classifyEvents';
import { libraryOuting, myOuting, otherOuting } from '../../../../__mocks__/outings';
import type { Outing } from '../api/outings';
import { formatCoordinate, formatDateTime } from '../formatOuting';
import { OutingDetail } from './OutingDetail';

// The title of the event comes from the events of the map, which have their own tests.
const mockEvents = classifyEvents([meteorShowerEvent], [launchEvent, lunarEvent]);
jest.mock('../../events/hooks/useEvents', () => ({
  useMapEvents: () => ({ data: mockEvents }),
}));

async function renderDetail(outing: Outing = myOuting, isAuthor = true) {
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

  it('shows the event the outing is linked to, with its title', async () => {
    await renderDetail();

    expect(screen.getByText('Esdeveniment')).toBeOnTheScreen();
    expect(screen.getByText(meteorShowerEvent.title)).toBeOnTheScreen();
  });

  it('says the outing is linked to an event when its title is not known', async () => {
    await renderDetail({ ...myOuting, event_id: 'gone-event' });

    expect(screen.getByText('Esdeveniment')).toBeOnTheScreen();
    expect(screen.getByText('Sortida lligada a un esdeveniment')).toBeOnTheScreen();
  });

  it('shows nothing about an event when the outing has none', async () => {
    await renderDetail(otherOuting, false);

    expect(screen.queryByText('Esdeveniment')).toBeNull();
    expect(screen.queryByText('Sortida lligada a un esdeveniment')).toBeNull();
  });

  describe('the recommended local (TG-661)', () => {
    it('shows its name and address as the place of the outing', async () => {
      await renderDetail(libraryOuting);

      expect(screen.getByText('Local')).toBeOnTheScreen();
      expect(
        screen.getByText('Biblioteca Sant Pau - Santa Creu, Carrer del Carme, 47'),
      ).toBeOnTheScreen();
    });

    it('shows only the name when the address is empty', async () => {
      await renderDetail({ ...libraryOuting, place: { name: "Espai d'estudi", address: '' } });

      expect(screen.getByText("Espai d'estudi")).toBeOnTheScreen();
    });

    it('still shows the coordinates', async () => {
      await renderDetail(libraryOuting);

      const { latitude, longitude } = libraryOuting.location;
      expect(
        screen.getByText(
          `${formatCoordinate(latitude, 'ca')} · ${formatCoordinate(longitude, 'ca')}`,
        ),
      ).toBeOnTheScreen();
    });

    it('has no row for it when the outing has no local', async () => {
      await renderDetail(myOuting);

      expect(screen.queryByText('Local')).toBeNull();
    });
  });
});
