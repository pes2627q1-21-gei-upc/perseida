import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import AppLayout from '../../../app/(app)/_layout';
import * as refreshTokenModule from '../../auth/api/refreshToken';
import * as tokenStorage from '../../auth/tokenStorage';

// Found trying the app on a phone (TG-352): going back from a sub-route always went home instead
// of to the screen it was opened from. The screens have their own tests: stubs here.
const EVENT_ID = '01a19288-0000-7000-8000-000000000001';
const OUTING_ID = '01a19288-a3f6-7576-a37b-8929dd7f0001';

const stub = (name: string) =>
  function StubScreen() {
    return <Text>{name}</Text>;
  };

async function renderApp(initialUrl: string, first: string) {
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
      '(app)/meeting-points/[eventId]': stub('meeting-points-route'),
      '(app)/outings/index': stub('outings-route'),
      '(app)/outings/new': stub('new-outing-route'),
      '(app)/outings/[id]/index': stub('outing-route'),
      '(app)/outings/[id]/edit': stub('edit-outing-route'),
      login: stub('login-route'),
    },
    { initialUrl },
  );
  await screen.findByText(first);
  return app;
}

afterEach(() => jest.restoreAllMocks());

describe('Going back from a sub-route (TG-352, found trying the app)', () => {
  it.each([
    ['/map', 'map-route', `/meeting-points/${EVENT_ID}`, 'meeting-points-route'],
    ['/outings', 'outings-route', `/outings/${OUTING_ID}/edit`, 'edit-outing-route'],
    ['/map', 'map-route', `/outings?eventId=${EVENT_ID}`, 'outings-route'],
  ])(
    'from %s, opening %s and going back returns there, not home',
    async (from, fromText, to, toText) => {
      const app = await renderApp(from, fromText);
      await act(async () => {
        router.push(to);
      });
      await screen.findByText(toText);

      await act(async () => {
        router.back();
      });

      expect(app.getPathname()).toBe(from);
      expect(await screen.findByText(fromText)).toBeVisible();
    },
  );
});
