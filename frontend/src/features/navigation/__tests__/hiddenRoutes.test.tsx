import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Platform, StyleSheet, Text } from 'react-native';

import AppLayout from '../../../app/(app)/_layout';
import * as refreshTokenModule from '../../auth/api/refreshToken';
import * as tokenStorage from '../../auth/tokenStorage';

// Regression (TG-385 #388): with the real router, the sub-routes hidden from the tab bar must
// still open. `href: null` makes expo-router 58 drop the route and send the user back home.
const stub = (name: string) =>
  function StubScreen() {
    return <Text>{name}</Text>;
  };

async function renderApp() {
  jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue({
    accessToken: 'valid-acc',
    refreshToken: 'valid-ref',
  });
  jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue({
    access_token: 'new-acc',
    refresh_token: 'new-ref',
    token_type: 'bearer',
    expires_in: 900,
  });

  const app = await renderRouter(
    {
      '(app)/_layout': AppLayout,
      '(app)/index': stub('home-route'),
      '(app)/events': stub('events-route'),
      '(app)/chat': stub('chat-route'),
      '(app)/gamification': stub('gamification-route'),
      '(app)/profile': stub('profile-route'),
      '(app)/map': stub('map-route'),
      '(app)/apod': stub('apod-route'),
      login: stub('login-route'),
    },
    { initialUrl: '/' },
  );
  await screen.findByText('home-route');
  return app;
}

afterEach(() => jest.restoreAllMocks());

describe('Sub-routes hidden from the tab bar (TG-385 #388)', () => {
  it.each([
    ['/map', 'map-route'],
    ['/apod', 'apod-route'],
  ])('%s opens from a tab instead of going back home', async (path, text) => {
    const app = await renderApp();

    await act(async () => {
      router.push(path);
    });

    expect(app.getPathname()).toBe(path);
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('shows only the five main tabs in the bar', async () => {
    await renderApp();

    // React Navigation gives the items role «tab» on Android and web and «button» on iOS,
    // where VoiceOver does not handle «tab» well. The stub screens have no buttons of their own.
    const role = Platform.OS === 'ios' ? 'button' : 'tab';
    const tabs = screen.getAllByRole(role);
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Inici',
      'Esdeveniments',
      'Xat',
      'Gamificació',
      'Perfil',
    ]);
  });

  it('gives the whole width of the bar to the five main tabs', async () => {
    await renderApp();

    // Each route gets a flex: 1 slot in the tablist; a hidden route must not keep an empty one.
    const role = Platform.OS === 'ios' ? 'button' : 'tab';
    let tablist = screen.getAllByRole(role)[0].parent;
    while (tablist && tablist.props.role !== 'tablist') tablist = tablist.parent;
    const visibleSlots = (tablist?.children ?? []).filter(
      (slot) =>
        typeof slot !== 'string' && StyleSheet.flatten(slot.props.style)?.display !== 'none',
    );
    expect(visibleSlots).toHaveLength(5);
  });
});
