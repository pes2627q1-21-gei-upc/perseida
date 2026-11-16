// Public configuration used by the API client in tests.
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.test';

// Tests run in Catalan, whatever language the machine running them uses.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./src/shared/i18n').default.changeLanguage('ca');
