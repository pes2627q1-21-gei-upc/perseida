// The admin panel is the web export of this app. nginx-proxy-manager serves it at
// /admin/ (ADR-0009, TG-89): without `experiments.baseUrl` the exported page asks for
// /_expo/static/... from the root, which goes to the API and answers 404. TG-77 criteri 1.

import appJson from '../app.json';

// Typed loosely on purpose: the test reads what the file says, whatever it has today.
const appConfig = appJson as {
  expo: { experiments?: { baseUrl?: string } };
};

describe('app.json (web export of the admin panel)', () => {
  it('serves the web export under /admin', () => {
    expect(appConfig.expo.experiments?.baseUrl).toBe('/admin');
  });
});
