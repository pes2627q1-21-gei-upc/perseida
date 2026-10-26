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

  it('TG-342: does not fall back to the web client ID on native platforms', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    expect(getGoogleClientId('ios')).toBe('');
  });

  it('returns empty string if the web client ID is missing on web', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    expect(getGoogleClientId('web')).toBe('');
  });

  it('generates the app.perseida redirect URI by default', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME;
    const redirectUri = getGoogleRedirectUri();
    expect(redirectUri).toBe('app.perseida:/oauth/callback');
  });

  it('allows overriding redirect scheme via EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME and normalizes single slash for package schemes', () => {
    process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME = 'app.perseida';
    const redirectUri = getGoogleRedirectUri();
    expect(redirectUri).toBe('app.perseida:/oauth/callback');
    delete process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_SCHEME;
  });
});
