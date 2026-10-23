import { getGoogleClientId, getGoogleClientIds, getGoogleRedirectUri } from './googleConfig';

jest.mock('expo-auth-session', () => {
  const actual = jest.requireActual('expo-auth-session');
  return {
    ...actual,
    makeRedirectUri: jest.fn(({ scheme, path } = {}) => `${scheme ?? 'perseida'}://${path ?? ''}`),
  };
});

describe('googleConfig', () => {
  const savedWeb = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const savedIos = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const savedAndroid = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client-id';
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client-id';
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = 'android-client-id';
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = savedWeb;
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = savedIos;
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = savedAndroid;
  });

  it('reads all configured client IDs from environment', () => {
    expect(getGoogleClientIds()).toEqual({
      web: 'web-client-id',
      ios: 'ios-client-id',
      android: 'android-client-id',
    });
  });

  it('returns iOS client ID for ios platform', () => {
    expect(getGoogleClientId('ios')).toBe('ios-client-id');
  });

  it('returns Android client ID for android platform', () => {
    expect(getGoogleClientId('android')).toBe('android-client-id');
  });

  it('returns Web client ID for web platform', () => {
    expect(getGoogleClientId('web')).toBe('web-client-id');
  });

  it('falls back to web client ID when platform-specific ID is missing', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    expect(getGoogleClientId('ios')).toBe('web-client-id');
  });

  it('returns empty string if neither platform nor web client ID is defined', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    expect(getGoogleClientId('ios')).toBe('');
  });

  it('generates redirect URI containing the perseida scheme', () => {
    const redirectUri = getGoogleRedirectUri();
    expect(redirectUri).toBeDefined();
    expect(typeof redirectUri).toBe('string');
  });
});
