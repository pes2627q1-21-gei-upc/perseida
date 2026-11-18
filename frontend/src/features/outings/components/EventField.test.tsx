import { fireEvent, render, screen } from '@testing-library/react-native';

import { launchEvent, lunarEvent, meteorShowerEvent } from '../../../../__mocks__/events';
import { AppError } from '../../../shared/errors';
import { classifyEvents } from '../../events/classifyEvents';
import { formatDateTime } from '../formatOuting';
import { EventField } from './EventField';

const { all } = classifyEvents([meteorShowerEvent], [launchEvent, lunarEvent]);

// The events are the ones of the map; their own tests cover how they load.
let mockEvents: {
  data: { all: typeof all } | undefined;
  isLoading: boolean;
  error: AppError | null;
  refetch: jest.Mock;
};
jest.mock('../../events/hooks/useEvents', () => ({ useMapEvents: () => mockEvents }));

beforeEach(() => {
  mockEvents = { data: { all }, isLoading: false, error: null, refetch: jest.fn() };
});

const when = (iso: string) => formatDateTime(iso, 'ca');

describe('EventField', () => {
  it('is a group of options with the name of the field', async () => {
    await render(<EventField value={null} onChange={jest.fn()} />);

    expect(screen.getByLabelText('Esdeveniment (opcional)').props.accessibilityRole).toBe(
      'radiogroup',
    );
    expect(screen.getByText('Esdeveniment (opcional)')).toBeOnTheScreen();
  });

  it('offers no event and every active and upcoming event, with its start', async () => {
    await render(<EventField value={null} onChange={jest.fn()} />);

    expect(screen.getByRole('radio', { name: 'Cap esdeveniment' })).toBeOnTheScreen();
    for (const event of [meteorShowerEvent, launchEvent, lunarEvent]) {
      expect(
        screen.getByRole('radio', { name: `${event.title}, ${when(event.starts_at)}` }),
      ).toBeOnTheScreen();
    }
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('has "no event" selected when there is none', async () => {
    await render(<EventField value={null} onChange={jest.fn()} />);

    expect(
      screen.getByRole('radio', { name: 'Cap esdeveniment', checked: true }),
    ).toBeOnTheScreen();
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
  });

  it('has the event of the outing selected', async () => {
    await render(<EventField value={launchEvent.id} onChange={jest.fn()} />);

    expect(
      screen.getByRole('radio', {
        name: `${launchEvent.title}, ${when(launchEvent.starts_at)}`,
        checked: true,
      }),
    ).toBeOnTheScreen();
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
  });

  it('chooses the event the person taps', async () => {
    const onChange = jest.fn();
    await render(<EventField value={null} onChange={onChange} />);

    await fireEvent.press(
      screen.getByRole('radio', { name: `${lunarEvent.title}, ${when(lunarEvent.starts_at)}` }),
    );

    expect(onChange).toHaveBeenCalledWith(lunarEvent.id);
  });

  it('chooses no event with the first option', async () => {
    const onChange = jest.fn();
    await render(<EventField value={launchEvent.id} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Cap esdeveniment' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('keeps an event that is no longer in the list as selected, so it is not lost', async () => {
    const onChange = jest.fn();
    await render(<EventField value="gone-event" onChange={onChange} />);

    expect(
      screen.getByRole('radio', { name: 'Sortida lligada a un esdeveniment', checked: true }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: 'Cap esdeveniment', checked: false }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Sortida lligada a un esdeveniment' }));
    expect(onChange).toHaveBeenCalledWith('gone-event');
  });

  it('does not show that extra option when the event is in the list', async () => {
    await render(<EventField value={launchEvent.id} onChange={jest.fn()} />);

    expect(screen.queryByRole('radio', { name: 'Sortida lligada a un esdeveniment' })).toBeNull();
  });

  it('says it is loading and offers only "no event" meanwhile', async () => {
    mockEvents = { data: undefined, isLoading: true, error: null, refetch: jest.fn() };

    await render(<EventField value={null} onChange={jest.fn()} />);

    expect(screen.getByLabelText('Carregant esdeveniments')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  it('keeps the selected event while the events load', async () => {
    mockEvents = { data: undefined, isLoading: true, error: null, refetch: jest.fn() };

    await render(<EventField value="event-1" onChange={jest.fn()} />);

    expect(
      screen.getByRole('radio', { name: 'Sortida lligada a un esdeveniment', checked: true }),
    ).toBeOnTheScreen();
  });

  it('says why the events did not load and lets the person try again when it is transient', async () => {
    const error = new AppError({ kind: 'network', code: 'NETWORK_ERROR', retryable: true });
    mockEvents = { data: undefined, isLoading: false, error, refetch: jest.fn() };
    await render(<EventField value={null} onChange={jest.fn()} />);

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Torna-ho a provar' }));

    expect(mockEvents.refetch).toHaveBeenCalledTimes(1);
  });

  it('offers no retry when the error is final, and "no event" can still be chosen', async () => {
    const error = new AppError({ kind: 'http', code: 'NOT_FOUND', status: 404, retryable: false });
    mockEvents = { data: undefined, isLoading: false, error, refetch: jest.fn() };
    const onChange = jest.fn();
    await render(<EventField value="event-1" onChange={onChange} />);

    expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Cap esdeveniment' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
