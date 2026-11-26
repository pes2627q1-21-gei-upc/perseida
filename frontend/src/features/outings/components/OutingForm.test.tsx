import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { myOuting } from '../../../../__mocks__/outings';
import { AppError } from '../../../shared/errors';
import { newOutingValues, type OutingFormValues, outingToValues } from '../outingForm';
import { OutingForm } from './OutingForm';

const mockPast = new Date('2000-01-01T10:00:00Z');
const mockBeforeStart = new Date('1999-01-01T10:00:00Z');

// The fields have their own tests: here each one is a button that sets a known value and shows
// the error the form gives it.
jest.mock('./DateTimeField', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    DateTimeField: ({
      label,
      error,
      onChange,
    }: {
      label: string;
      error?: string;
      onChange: (date: Date) => void;
    }) => (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`set ${label}`}
          // "Inici" goes to the past; "Fi" goes before the start of a new outing.
          onPress={() => onChange(label === 'Inici' ? mockPast : mockBeforeStart)}
        >
          <Text>{label}</Text>
        </Pressable>
        {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      </>
    ),
  };
});
jest.mock('./LocationField', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    LocationField: ({
      error,
      onChange,
      onPlaceChange,
    }: {
      error?: string;
      onChange: (location: { latitude: number; longitude: number }) => void;
      onPlaceChange?: (place: { name: string; address: string } | null) => void;
    }) => (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="choose place"
          onPress={() => {
            onChange({ latitude: 1, longitude: 2 });
            onPlaceChange?.(null);
          }}
        >
          <Text>lloc</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="choose local"
          onPress={() => {
            onChange({ latitude: 3, longitude: 4 });
            onPlaceChange?.({ name: 'Biblioteca Sant Pau', address: 'Carrer del Carme, 47' });
          }}
        >
          <Text>local</Text>
        </Pressable>
        {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      </>
    ),
  };
});

jest.mock('./EventField', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    EventField: ({
      value,
      onChange,
    }: {
      value: string | null;
      onChange: (eventId: string | null) => void;
    }) => (
      <>
        <Text testID="event-value">{value ?? 'none'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="choose event"
          onPress={() => onChange('event-2')}
        >
          <Text>e</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="no event"
          onPress={() => onChange(null)}
        >
          <Text>n</Text>
        </Pressable>
      </>
    ),
  };
});

function filled(overrides: Partial<OutingFormValues> = {}): OutingFormValues {
  return {
    ...newOutingValues(),
    title: 'Perseides',
    location: { latitude: 42.05, longitude: 0.73 },
    ...overrides,
  };
}

function serverError(code: string, status = 422, retryable = false) {
  return new AppError({ kind: 'http', code, status, retryable });
}

async function save() {
  await fireEvent.press(screen.getByRole('button', { name: 'Desa' }));
}

describe('OutingForm', () => {
  it('has the title and the description with their labels and the current values', async () => {
    await render(<OutingForm initial={filled({ description: 'Mantes' })} onSubmit={jest.fn()} />);

    expect(screen.getByLabelText('Títol').props.value).toBe('Perseides');
    expect(screen.getByLabelText('Descripció (opcional)').props.value).toBe('Mantes');
    expect(screen.getByLabelText('Descripció (opcional)').props.multiline).toBe(true);
  });

  it('sends the values of the form when they are valid', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const initial = filled();
    await render(<OutingForm initial={initial} onSubmit={onSubmit} />);

    await fireEvent.changeText(screen.getByLabelText('Títol'), 'Perseides al Montsec');
    await save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ ...initial, title: 'Perseides al Montsec' });
  });

  it('asks for a title and does not send an empty one', async () => {
    const onSubmit = jest.fn();
    await render(<OutingForm initial={filled({ title: '' })} onSubmit={onSubmit} />);

    await save();

    expect(await screen.findByText('Posa un títol a la sortida.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('says when the title is too long, with the same text as the server', async () => {
    await render(<OutingForm initial={filled({ title: 'a'.repeat(121) })} onSubmit={jest.fn()} />);

    await save();

    expect(
      await screen.findByText('El títol pot tenir com a màxim 120 caràcters.'),
    ).toBeOnTheScreen();
  });

  it('says when the description is too long', async () => {
    await render(
      <OutingForm initial={filled({ description: 'a'.repeat(2001) })} onSubmit={jest.fn()} />,
    );

    await save();

    expect(
      await screen.findByText('La descripció pot tenir com a màxim 2.000 caràcters.'),
    ).toBeOnTheScreen();
  });

  it('asks for the place when there is none', async () => {
    const onSubmit = jest.fn();
    await render(<OutingForm initial={filled({ location: null })} onSubmit={onSubmit} />);

    await save();

    expect(await screen.findByText('Tria on us trobareu.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('takes the place the person chooses', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<OutingForm initial={filled({ location: null })} onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByRole('button', { name: 'choose place' }));
    await save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].location).toEqual({ latitude: 1, longitude: 2 });
  });

  it('takes the recommended local the person chooses, with its name and address', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<OutingForm initial={filled({ location: null })} onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByRole('button', { name: 'choose local' }));
    await save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].location).toEqual({ latitude: 3, longitude: 4 });
    expect(onSubmit.mock.calls[0][0].place).toEqual({
      name: 'Biblioteca Sant Pau',
      address: 'Carrer del Carme, 47',
    });
  });

  it('forgets the local when the person then chooses another kind of place', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<OutingForm initial={filled({ location: null })} onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByRole('button', { name: 'choose local' }));
    await fireEvent.press(screen.getByRole('button', { name: 'choose place' }));
    await save();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].place).toBeNull();
  });

  it('says that a new outing cannot start in the past, next to the start', async () => {
    const onSubmit = jest.fn();
    await render(<OutingForm initial={filled()} onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByRole('button', { name: 'set Inici' }));
    await save();

    expect(await screen.findByText('La sortida no pot començar en el passat.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('says that the end cannot be before the start, next to the end', async () => {
    await render(<OutingForm initial={filled()} onSubmit={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'set Fi' }));
    await save();

    expect(
      await screen.findByText('La sortida no pot acabar abans de començar.'),
    ).toBeOnTheScreen();
  });

  describe('editing', () => {
    const started = filled({
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    it('can save an outing that has already started while its dates stay', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      await render(<OutingForm initial={started} editing onSubmit={onSubmit} />);

      await fireEvent.changeText(screen.getByLabelText('Títol'), 'Nou títol');
      await save();

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    });

    it('asks for a start in the future again when a date changes', async () => {
      const onSubmit = jest.fn();
      await render(<OutingForm initial={started} editing onSubmit={onSubmit} />);

      await fireEvent.press(screen.getByRole('button', { name: 'set Fi' }));
      await save();

      expect(onSubmit).not.toHaveBeenCalled();
      expect(await screen.findByText('La sortida no pot començar en el passat.')).toBeOnTheScreen();
    });

    it('starts from the values of the outing', async () => {
      await render(<OutingForm initial={outingToValues(myOuting)} editing onSubmit={jest.fn()} />);

      expect(screen.getByLabelText('Títol').props.value).toBe(myOuting.title);
    });
  });

  describe('the event of the outing', () => {
    it('gives the event field the event the outing has', async () => {
      await render(<OutingForm initial={filled({ eventId: 'event-1' })} onSubmit={jest.fn()} />);

      expect(screen.getByTestId('event-value')).toHaveTextContent('event-1');
    });

    it('gives the event field none when the outing has no event', async () => {
      await render(<OutingForm initial={filled()} onSubmit={jest.fn()} />);

      expect(screen.getByTestId('event-value')).toHaveTextContent('none');
    });

    it('sends the event the person chooses', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      await render(<OutingForm initial={filled()} onSubmit={onSubmit} />);

      await fireEvent.press(screen.getByRole('button', { name: 'choose event' }));
      expect(screen.getByTestId('event-value')).toHaveTextContent('event-2');
      await save();

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].eventId).toBe('event-2');
    });

    it('sends no event when the person chooses none', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      await render(<OutingForm initial={filled({ eventId: 'event-1' })} onSubmit={onSubmit} />);

      await fireEvent.press(screen.getByRole('button', { name: 'no event' }));
      await save();

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].eventId).toBeNull();
    });

    it('keeps the event when the person does not touch it', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      await render(<OutingForm initial={filled({ eventId: 'event-1' })} onSubmit={onSubmit} />);

      await save();

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].eventId).toBe('event-1');
    });
  });

  describe('when the server says no', () => {
    it.each([
      ['OUTING_TITLE_EMPTY', 'Posa un títol a la sortida.'],
      ['OUTING_TITLE_TOO_LONG', 'El títol pot tenir com a màxim 120 caràcters.'],
      ['OUTING_DESCRIPTION_TOO_LONG', 'La descripció pot tenir com a màxim 2.000 caràcters.'],
      ['OUTING_STARTS_IN_PAST', 'La sortida no pot començar en el passat.'],
      ['OUTING_ENDS_BEFORE_START', 'La sortida no pot acabar abans de començar.'],
    ])('shows %s next to its field and keeps what was typed', async (code, text) => {
      const onSubmit = jest.fn().mockRejectedValue(serverError(code));
      await render(<OutingForm initial={filled()} onSubmit={onSubmit} />);

      await save();

      expect(await screen.findByText(text)).toBeOnTheScreen();
      expect(screen.getByLabelText('Títol').props.value).toBe('Perseides');
    });

    it('announces any other error as an alert with the text of its code', async () => {
      const onSubmit = jest.fn().mockRejectedValue(serverError('OUTING_EVENT_NOT_FOUND'));
      await render(<OutingForm initial={filled({ eventId: 'gone' })} onSubmit={onSubmit} />);

      await save();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Aquest esdeveniment ja no existeix.',
      );
    });

    it('invites to try again when the error is transient', async () => {
      const onSubmit = jest.fn().mockRejectedValue(serverError('NETWORK_ERROR', 0, true));
      await render(<OutingForm initial={filled()} onSubmit={onSubmit} />);

      await save();

      expect(await screen.findByRole('alert')).toBeOnTheScreen();
    });

    it('shows the generic message when the failure is not an AppError', async () => {
      const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
      await render(<OutingForm initial={filled()} onSubmit={onSubmit} />);

      await save();

      expect(await screen.findByRole('alert')).toBeOnTheScreen();
    });

    it('clears the error of the server on a new try', async () => {
      const onSubmit = jest
        .fn()
        .mockRejectedValueOnce(serverError('OUTING_EVENT_NOT_FOUND'))
        .mockResolvedValueOnce(undefined);
      await render(<OutingForm initial={filled()} onSubmit={onSubmit} />);

      await save();
      await screen.findByRole('alert');
      await save();

      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
  });

  it('is busy and ignores new taps while it saves', async () => {
    let finish!: () => void;
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await render(<OutingForm initial={filled()} onSubmit={onSubmit} />);

    await save();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Desa' }).props.accessibilityState.busy).toBe(true),
    );
    await save();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Desa' }).props.accessibilityState.busy).toBe(
        false,
      ),
    );
  });
});
