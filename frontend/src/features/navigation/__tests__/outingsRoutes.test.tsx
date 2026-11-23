import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import AppLayout from '../../../app/(app)/_layout';
import * as refreshTokenModule from '../../auth/api/refreshToken';
import * as tokenStorage from '../../auth/tokenStorage';

// Regression found reviewing TG-352: a route inside a folder of the (app) group with no layout
// of its own does not open unless the tab layout declares it. The outings (TG-629) live in such a
// folder. The screens have their own tests: here stubs, only to see which route is shown.
const OUTING_ID = '01a19288-a3f6-7576-a37b-8929dd7f0001';

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
      '(app)/outings/index': stub('outings-route'),
      '(app)/outings/new': stub('new-outing-route'),
      '(app)/outings/[id]/index': stub('outing-route'),
      '(app)/outings/[id]/edit': stub('edit-outing-route'),
      login: stub('login-route'),
    },
    { initialUrl: '/' },
  );
  await screen.findByText('home-route');
  return app;
}

afterEach(() => jest.restoreAllMocks());

describe('Routes of the outings (TG-629, found reviewing TG-352)', () => {
  it.each([
    ['/outings', 'outings-route'],
    ['/outings/new', 'new-outing-route'],
    [`/outings/${OUTING_ID}`, 'outing-route'],
    [`/outings/${OUTING_ID}/edit`, 'edit-outing-route'],
  ])('%s opens with router.push instead of going back home', async (path, text) => {
    const app = await renderApp();

    await act(async () => {
      router.push(path);
    });

    expect(app.getPathname()).toBe(path);
    expect(await screen.findByText(text)).toBeOnTheScreen();
  });
});
