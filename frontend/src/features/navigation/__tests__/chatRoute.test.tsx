import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import AppLayout from '../../../app/(app)/_layout';
import ChatIndexRoute from '../../../app/(app)/chat/index';
import ChatLayout from '../../../app/(app)/chat/_layout';
import * as refreshTokenModule from '../../auth/api/refreshToken';
import * as tokenStorage from '../../auth/tokenStorage';

// The screen has its own tests (ChatRoomsScreen.test.tsx): here only that the route shows it.
jest.mock('../../chat/components/ChatRoomsScreen', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { ChatRoomsScreen: () => <MockText>chat-rooms-screen</MockText> };
});

// TG-469: the chat tab is a folder with its own Stack and an index that shows the room list,
// instead of the «coming soon» screen. The tab must keep its place and its test id.
const stub = (name: string) =>
  function StubScreen() {
    return <Text>{name}</Text>;
  };

async function renderApp(initialUrl = '/') {
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
      '(app)/chat/_layout': ChatLayout,
      '(app)/chat/index': ChatIndexRoute,
      '(app)/gamification': stub('gamification-route'),
      '(app)/profile': stub('profile-route'),
      '(app)/map': stub('map-route'),
      '(app)/apod': stub('apod-route'),
      login: stub('login-route'),
    },
    { initialUrl },
  );
  return app;
}

afterEach(() => jest.restoreAllMocks());

describe('Chat tab route (TG-469)', () => {
  it('shows the room list at /chat, not the «coming soon» screen', async () => {
    const app = await renderApp('/chat');

    expect(await screen.findByText('chat-rooms-screen')).toBeTruthy();
    expect(app.getPathname()).toBe('/chat');
    expect(screen.queryByText('Pròximament')).toBeNull();
  });

  it('keeps the chat tab in the bar, with its test id, and opens the list from it', async () => {
    await renderApp('/');
    await screen.findByText('home-route');

    await fireEvent.press(screen.getByTestId('tab-chat'));

    expect(await screen.findByText('chat-rooms-screen')).toBeTruthy();
  });

  it('can be opened with router.push from another screen', async () => {
    const app = await renderApp('/');
    await screen.findByText('home-route');

    await act(async () => {
      router.push('/chat');
    });

    expect(app.getPathname()).toBe('/chat');
    expect(await screen.findByText('chat-rooms-screen')).toBeTruthy();
  });
});
