import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Platform, Text } from 'react-native';

import AppLayout from '../../../app/(app)/_layout';
import MeetingPointsRoute from '../../../app/(app)/meeting-points/[eventId]';
import * as refreshTokenModule from '../../auth/api/refreshToken';
import * as tokenStorage from '../../auth/tokenStorage';

// The screen has its own tests: here only that the route opens inside the app, off the tab bar.
jest.mock('../../meeting-points/components/MeetingPointsScreen', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    MeetingPointsScreen: ({ eventId }: { eventId: string }) => (
      <MockText>{`meeting-points-screen:${eventId}`}</MockText>
    ),
  };
});

const EVENT_ID = '01a19288-0000-7000-8000-000000000001';

const stub = (name: string) =>
  function StubScreen() {
    return <Text>{name}</Text>;
  };

async function renderApp(initialUrl: string) {
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

  return renderRouter(
    {
      '(app)/_layout': AppLayout,
      '(app)/index': stub('home-route'),
      '(app)/events': stub('events-route'),
      '(app)/chat': stub('chat-route'),
      '(app)/gamification': stub('gamification-route'),
      '(app)/profile': stub('profile-route'),
      '(app)/map': stub('map-route'),
      '(app)/apod': stub('apod-route'),
      '(app)/meeting-points/[eventId]': MeetingPointsRoute,
      login: stub('login-route'),
    },
    { initialUrl },
  );
}

afterEach(() => jest.restoreAllMocks());

describe('Meeting points route (TG-352, criterion 4)', () => {
  it('shows the meeting points of the event at /meeting-points/<eventId>', async () => {
    const app = await renderApp(`/meeting-points/${EVENT_ID}`);

    expect(await screen.findByText(`meeting-points-screen:${EVENT_ID}`)).toBeOnTheScreen();
    expect(app.getPathname()).toBe(`/meeting-points/${EVENT_ID}`);
  });

  it('opens with router.push instead of going back home', async () => {
    const app = await renderApp('/');
    await screen.findByText('home-route');

    await act(async () => {
      router.push(`/meeting-points/${EVENT_ID}`);
    });

    expect(app.getPathname()).toBe(`/meeting-points/${EVENT_ID}`);
    expect(await screen.findByText(`meeting-points-screen:${EVENT_ID}`)).toBeOnTheScreen();
  });

  it('is not a tab: the bar still shows only the five main tabs', async () => {
    await renderApp('/');
    await screen.findByText('home-route');

    // React Navigation gives the items role «tab» on Android and web and «button» on iOS.
    const role = Platform.OS === 'ios' ? 'button' : 'tab';
    expect(screen.getAllByRole(role).map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Inici',
      'Agenda, Esdeveniments',
      'Xat',
      'Fites, Gamificació',
      'Perfil',
    ]);
  });
});
