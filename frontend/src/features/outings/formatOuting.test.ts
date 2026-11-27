import { myOuting } from '../../../__mocks__/outings';
import i18n from '../../shared/i18n';
import { describeOuting, formatCoordinate, formatDateTime } from './formatOuting';

describe('formatDateTime', () => {
  it('shows a date and a time in the language and time zone it is given', () => {
    const date = new Date('2099-08-12T20:00:00Z');

    expect(formatDateTime(date, 'en', 'UTC')).toBe(
      new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(date),
    );
    expect(formatDateTime(date, 'ca', 'UTC')).toContain('20:00');
  });

  it('accepts the ISO text of the API', () => {
    expect(formatDateTime('2099-08-12T20:00:00Z', 'ca', 'UTC')).toBe(
      formatDateTime(new Date('2099-08-12T20:00:00Z'), 'ca', 'UTC'),
    );
  });
});

describe('formatCoordinate', () => {
  it('shows four decimals, with the separator of the language', () => {
    expect(formatCoordinate(42.05, 'en')).toBe('42.0500');
    expect(formatCoordinate(-0.7312, 'es')).toBe('-0,7312');
  });

  it('rounds to four decimals', () => {
    expect(formatCoordinate(1.234567, 'en')).toBe('1.2346');
  });
});

// TG-646 criterion 4: the accessible name of the marker of an outing, like describeEvent.
describe('describeOuting', () => {
  const t = i18n.getFixedT('ca');

  it('names the outing with its title, "Sortida" and its date', () => {
    expect(describeOuting(myOuting, t, 'ca', 'UTC')).toBe(
      `${myOuting.title}, Sortida, ${formatDateTime(myOuting.starts_at, 'ca', 'UTC')}`,
    );
  });

  it('says it in the language of the app', () => {
    expect(describeOuting(myOuting, i18n.getFixedT('es'), 'es', 'UTC')).toContain(', Salida, ');
    expect(describeOuting(myOuting, i18n.getFixedT('en'), 'en', 'UTC')).toContain(', Outing, ');
  });
});
