import { libraryOuting, myOuting } from '../../../__mocks__/outings';
import {
  newOutingValues,
  type OutingFormValues,
  outingFormSchema,
  outingToValues,
  parseCoordinates,
  toChanges,
  toDraft,
} from './outingForm';

const NOW = new Date('2099-01-01T10:00:00Z');

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => jest.useRealTimers());

const valid: OutingFormValues = {
  title: 'Perseides al Montsec',
  description: 'Portem mantes.',
  startsAt: new Date('2099-08-12T20:00:00Z'),
  endsAt: new Date('2099-08-13T02:00:00Z'),
  location: { latitude: 42.05, longitude: 0.73 },
  place: null,
  eventId: null,
};

function messagesOf(values: Partial<OutingFormValues>, initial?: OutingFormValues) {
  const result = outingFormSchema(initial).safeParse({ ...valid, ...values });
  return result.success ? [] : result.error.issues.map((i) => [i.path.join('.'), i.message]);
}

describe('outingFormSchema', () => {
  it('accepts a valid outing', () => {
    expect(messagesOf({})).toEqual([]);
  });

  it('accepts the limits of the texts', () => {
    expect(messagesOf({ title: 'a'.repeat(120), description: 'a'.repeat(2000) })).toEqual([]);
    expect(messagesOf({ description: '' })).toEqual([]);
  });

  it('requires a title, ignoring blanks', () => {
    expect(messagesOf({ title: '   ' })).toEqual([['title', 'errors.OUTING_TITLE_EMPTY']]);
  });

  it('rejects a title of more than 120 characters, measured after trimming', () => {
    expect(messagesOf({ title: 'a'.repeat(121) })).toEqual([
      ['title', 'errors.OUTING_TITLE_TOO_LONG'],
    ]);
    expect(messagesOf({ title: `  ${'a'.repeat(120)}  ` })).toEqual([]);
  });

  it('rejects a description of more than 2000 characters', () => {
    expect(messagesOf({ description: 'a'.repeat(2001) })).toEqual([
      ['description', 'errors.OUTING_DESCRIPTION_TOO_LONG'],
    ]);
  });

  it('rejects an end before the start, and accepts an end equal to it', () => {
    expect(messagesOf({ endsAt: new Date('2099-08-12T19:59:00Z') })).toEqual([
      ['endsAt', 'errors.OUTING_ENDS_BEFORE_START'],
    ]);
    expect(messagesOf({ endsAt: valid.startsAt })).toEqual([]);
  });

  it('rejects a start in the past', () => {
    expect(messagesOf({ startsAt: new Date('2098-12-31T10:00:00Z') })).toEqual([
      ['startsAt', 'errors.OUTING_STARTS_IN_PAST'],
    ]);
  });

  it('requires a location', () => {
    expect(messagesOf({ location: null })).toEqual([['location', 'outings.form.locationRequired']]);
  });

  describe('editing an outing that has already started', () => {
    const started: OutingFormValues = {
      ...valid,
      startsAt: new Date('2098-12-31T10:00:00Z'),
      endsAt: new Date('2099-01-01T12:00:00Z'),
    };

    it('lets it be saved while the dates stay the same', () => {
      expect(messagesOf({ ...started, title: 'Nou títol' }, started)).toEqual([]);
    });

    it('asks for a start in the future again once a date changes', () => {
      const moved = { ...started, endsAt: new Date('2099-01-01T13:00:00Z') };

      expect(messagesOf(moved, started)).toEqual([['startsAt', 'errors.OUTING_STARTS_IN_PAST']]);
    });
  });
});

describe('newOutingValues', () => {
  it('starts one hour from now and lasts two hours, with the event if there is one', () => {
    const values = newOutingValues('event-1');

    expect(values.startsAt).toEqual(new Date('2099-01-01T11:00:00Z'));
    expect(values.endsAt).toEqual(new Date('2099-01-01T13:00:00Z'));
    expect(values).toMatchObject({
      title: '',
      description: '',
      location: null,
      eventId: 'event-1',
    });
  });

  it('has no event by default', () => {
    expect(newOutingValues().eventId).toBeNull();
  });
});

describe('outingToValues', () => {
  it('turns an outing into the values of the form', () => {
    expect(outingToValues(myOuting)).toEqual({
      title: myOuting.title,
      description: myOuting.description,
      startsAt: new Date(myOuting.starts_at),
      endsAt: new Date(myOuting.ends_at),
      location: myOuting.location,
      place: null,
      eventId: myOuting.event_id,
    });
  });

  it('keeps the place of the outing: the name and the address', () => {
    expect(outingToValues(libraryOuting).place).toEqual(libraryOuting.place);
  });
});

describe('toDraft', () => {
  it('builds the body of the creation with ISO dates and trimmed texts', () => {
    expect(
      toDraft({ ...valid, title: '  Perseides  ', description: ' text ', eventId: 'e1' }),
    ).toEqual({
      title: 'Perseides',
      description: 'text',
      starts_at: '2099-08-12T20:00:00.000Z',
      ends_at: '2099-08-13T02:00:00.000Z',
      location: { latitude: 42.05, longitude: 0.73 },
      place: null,
      event_id: 'e1',
    });
  });

  it('sends the place when the outing meets at a recommended local', () => {
    const place = { name: 'Biblioteca Sant Pau', address: 'Carrer del Carme, 47' };

    expect(toDraft({ ...valid, place }).place).toEqual(place);
  });

  it('refuses a form without a location', () => {
    expect(() => toDraft({ ...valid, location: null })).toThrow('location');
  });
});

describe('toChanges', () => {
  const initial = outingToValues(myOuting);

  it('sends nothing when nothing changed', () => {
    expect(toChanges(initial, initial)).toEqual({});
  });

  it('sends only the fields that changed', () => {
    expect(toChanges({ ...initial, title: ' Nou ', description: 'Altre' }, initial)).toEqual({
      title: 'Nou',
      description: 'Altre',
    });
  });

  it('sends both dates when one of them changes', () => {
    expect(toChanges({ ...initial, endsAt: new Date('2099-08-13T03:00:00Z') }, initial)).toEqual({
      starts_at: '2099-08-12T20:00:00.000Z',
      ends_at: '2099-08-13T03:00:00.000Z',
    });
  });

  it('sends the new location', () => {
    expect(toChanges({ ...initial, location: { latitude: 1, longitude: 2 } }, initial)).toEqual({
      location: { latitude: 1, longitude: 2 },
    });
  });

  describe('the place (TG-661)', () => {
    const library = { name: 'Biblioteca Sant Pau', address: 'Carrer del Carme, 47' };
    const atLibrary = outingToValues(libraryOuting);

    it('sends nothing when the local does not change', () => {
      expect(toChanges(atLibrary, atLibrary)).toEqual({});
    });

    it('sends the local with its new location', () => {
      const location = { latitude: 1, longitude: 2 };

      expect(toChanges({ ...initial, location, place: library }, initial)).toEqual({
        location,
        place: library,
      });
    });

    it('sends place null when a recommended local is replaced by another kind of place', () => {
      const location = { latitude: 1, longitude: 2 };

      expect(toChanges({ ...atLibrary, location, place: null }, atLibrary)).toEqual({
        location,
        place: null,
      });
    });

    it('sends no place when there was none and there is none', () => {
      const changes = toChanges({ ...initial, location: { latitude: 1, longitude: 2 } }, initial);

      expect(changes).not.toHaveProperty('place');
    });
  });

  it('sends event_id null to unlink the event', () => {
    expect(toChanges({ ...initial, eventId: null }, initial)).toEqual({ event_id: null });
  });

  it('refuses to remove the location', () => {
    expect(() => toChanges({ ...initial, location: null }, initial)).toThrow('location');
  });
});

describe('parseCoordinates', () => {
  it('reads a latitude and a longitude', () => {
    expect(parseCoordinates('41.5', '2.2')).toEqual({ latitude: 41.5, longitude: 2.2 });
  });

  it('accepts a comma as the decimal separator and spaces around the numbers', () => {
    expect(parseCoordinates(' 41,5 ', ' -2,25 ')).toEqual({ latitude: 41.5, longitude: -2.25 });
  });

  it('accepts the limits and zero', () => {
    expect(parseCoordinates('-90', '180')).toEqual({ latitude: -90, longitude: 180 });
    expect(parseCoordinates('90', '-180')).toEqual({ latitude: 90, longitude: -180 });
    expect(parseCoordinates('0', '0')).toEqual({ latitude: 0, longitude: 0 });
  });

  it.each([
    ['', '2'],
    ['41', ''],
    ['   ', '2'],
    ['abc', '2'],
    ['41', '2x'],
    ['1e1', '2'],
    ['41', 'Infinity'],
    ['90.0001', '0'],
    ['-90.0001', '0'],
    ['0', '180.0001'],
    ['0', '-180.0001'],
  ])('rejects %j, %j', (latitude, longitude) => {
    expect(parseCoordinates(latitude, longitude)).toBeNull();
  });
});
