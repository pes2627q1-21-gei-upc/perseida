import { formatDistance } from './formatMeetingPoint';

// TG-352: the distance of a meeting point, in metres below 1 km and in kilometres from 1 km on.
describe('formatDistance', () => {
  it('shows whole metres below 1,000 m', () => {
    expect(formatDistance(290, 'ca')).toBe('290 m');
    expect(formatDistance(0, 'ca')).toBe('0 m');
    expect(formatDistance(999, 'en')).toBe('999 m');
  });

  it('switches to kilometres at 1,000 m', () => {
    expect(formatDistance(1000, 'ca')).toBe('1 km');
  });

  it('shows the decimal only when it is needed', () => {
    expect(formatDistance(2000, 'ca')).toBe('2 km');
    expect(formatDistance(2000, 'en')).toBe('2 km');
    expect(formatDistance(1999, 'ca')).toBe('2 km');
  });

  it('shows kilometres with one decimal and the separator of the language', () => {
    expect(formatDistance(1100, 'ca')).toBe('1,1 km');
    expect(formatDistance(1100, 'es')).toBe('1,1 km');
    expect(formatDistance(1100, 'en')).toBe('1.1 km');
  });

  it('rounds the kilometres to one decimal', () => {
    expect(formatDistance(1140, 'ca')).toBe('1,1 km');
    expect(formatDistance(1260, 'en')).toBe('1.3 km');
    expect(formatDistance(12345, 'ca')).toBe('12,3 km');
  });
});
