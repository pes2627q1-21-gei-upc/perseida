import { myOuting } from '../../../__mocks__/outings';
import {
  newOutingValues,
  type OutingFormValues,
  outingFormSchema,
  outingToValues,
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
      eventId: myOuting.event_id,
    });
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
      event_id: 'e1',
    });
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

  it('sends event_id null to unlink the event', () => {
    expect(toChanges({ ...initial, eventId: null }, initial)).toEqual({ event_id: null });
  });

  it('refuses to remove the location', () => {
    expect(() => toChanges({ ...initial, location: null }, initial)).toThrow('location');
  });
});
