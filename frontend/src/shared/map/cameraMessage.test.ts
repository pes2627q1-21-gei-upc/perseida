import { parseMapMessage, reportedCamera } from './cameraMessage';

describe('parseMapMessage', () => {
  it('parses a JSON object', () => {
    expect(parseMapMessage('{"a":1}')).toEqual({ a: 1 });
  });

  it.each(['not json', '1', 'null', '"text"'])('ignores %s', (data) => {
    expect(parseMapMessage(data)).toBeUndefined();
  });
});

describe('reportedCamera', () => {
  const view = (value: unknown) => reportedCamera({ view: value });

  it('accepts a real place', () => {
    expect(view({ latitude: 41.4, longitude: 2.1, zoom: 8 })).toEqual({
      latitude: 41.4,
      longitude: 2.1,
      zoom: 8,
    });
  });

  it('accepts the limits of the map', () => {
    expect(view({ latitude: -90, longitude: 180, zoom: 16 })).toBeDefined();
    expect(view({ latitude: 90, longitude: -180, zoom: 0 })).toBeDefined();
  });

  it.each([
    { latitude: 91, longitude: 0, zoom: 2 },
    { latitude: -91, longitude: 0, zoom: 2 },
    { latitude: 0, longitude: 181, zoom: 2 },
    { latitude: 0, longitude: -181, zoom: 2 },
    { latitude: 0, longitude: 0, zoom: 17 },
    { latitude: 0, longitude: 0, zoom: -1 },
    { latitude: NaN, longitude: 0, zoom: 2 },
    { latitude: '1', longitude: 0, zoom: 2 },
    {},
  ])('rejects %j', (value) => {
    expect(view(value)).toBeUndefined();
  });

  it('rejects a message without a view, or with a view that is not an object', () => {
    expect(reportedCamera({})).toBeUndefined();
    expect(view(null)).toBeUndefined();
    expect(view('x')).toBeUndefined();
  });
});
