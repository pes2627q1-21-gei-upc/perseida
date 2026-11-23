import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { StyleSheet, Text } from 'react-native';

import AppLayout from '../../../app/(app)/_layout';
import ChatRoomRoute from '../../../app/(app)/chat/[eventId]';
import ChatIndexRoute from '../../../app/(app)/chat/index';
import ChatLayout from '../../../app/(app)/chat/_layout';
import * as refreshTokenModule from '../../auth/api/refreshToken';
import * as tokenStorage from '../../auth/tokenStorage';

// The screens have their own tests: here only which one each route shows, and the tab bar.
jest.mock('../../chat/components/ChatRoomsScreen', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { ChatRoomsScreen: () => <MockText>chat-rooms-screen</MockText> };
});
jest.mock('../../chat/components/ChatRoomScreen', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    ChatRoomScreen: ({ eventId }: { eventId: string }) => (
      <MockText>{`chat-room-screen:${eventId}`}</MockText>
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
      '(app)/chat/_layout': ChatLayout,
      '(app)/chat/index': ChatIndexRoute,
      '(app)/chat/[eventId]': ChatRoomRoute,
      '(app)/gamification': stub('gamification-route'),
      '(app)/profile': stub('profile-route'),
      '(app)/map': stub('map-route'),
      '(app)/apod': stub('apod-route'),
      login: stub('login-route'),
    },
    { initialUrl },
  );
}

/** The floating glass frame of the bar: an ancestor of the tab with `position: absolute`. */
function floatingBarOf(tab: ReturnType<typeof screen.getByTestId>) {
  let node = tab.parent;
  while (node && StyleSheet.flatten(node.props.style)?.position !== 'absolute') node = node.parent;
  return node;
}

afterEach(() => jest.restoreAllMocks());

describe('Chat room route (TG-469, US TG-64 criteri 14)', () => {
  it('shows the room of the event at /chat/<eventId>', async () => {
    const app = await renderApp(`/chat/${EVENT_ID}`);

    expect(await screen.findByText(`chat-room-screen:${EVENT_ID}`)).toBeOnTheScreen();
    expect(app.getPathname()).toBe(`/chat/${EVENT_ID}`);
  });

  it('opens over the room list with router.push and goes back to it', async () => {
    await renderApp('/chat');
    await screen.findByText('chat-rooms-screen');

    await act(async () => {
      router.push(`/chat/${EVENT_ID}`);
    });
    expect(await screen.findByText(`chat-room-screen:${EVENT_ID}`)).toBeOnTheScreen();

    await act(async () => {
      router.back();
    });
    expect(await screen.findByText('chat-rooms-screen')).toBeVisible();
  });

  it('hides the tab bar in the room, to leave the composer more space', async () => {
    await renderApp('/chat');
    await screen.findByText('chat-rooms-screen');

    await act(async () => {
      router.push(`/chat/${EVENT_ID}`);
    });
    await screen.findByText(`chat-room-screen:${EVENT_ID}`);

    expect(screen.getByTestId('tab-chat', { includeHiddenElements: true })).not.toBeVisible();
  });

  it('shows the tab bar again, with its floating frame, back on the room list', async () => {
    await renderApp('/chat');
    await screen.findByText('chat-rooms-screen');
    await act(async () => {
      router.push(`/chat/${EVENT_ID}`);
    });
    await screen.findByText(`chat-room-screen:${EVENT_ID}`);

    await act(async () => {
      router.back();
    });
    await screen.findByText('chat-rooms-screen');

    const tab = screen.getByTestId('tab-chat');
    expect(tab).toBeVisible();
    expect(floatingBarOf(tab)).not.toBeNull();
  });
});
