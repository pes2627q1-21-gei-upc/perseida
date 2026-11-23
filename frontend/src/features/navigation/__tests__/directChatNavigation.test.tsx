import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import AppLayout from '../../../app/(app)/_layout';
import ChatLayout from '../../../app/(app)/chat/_layout';
import DirectConversationRoute from '../../../app/(app)/chat/direct/[conversationId]';
import DirectListRoute from '../../../app/(app)/chat/direct/index';
import * as refreshToken from '../../auth/api/refreshToken';
import * as tokenStorage from '../../auth/tokenStorage';

jest.mock('../../direct-chat/components/ConversationsScreen', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    ConversationsScreen: ({ onOpen }: { onOpen: (id: string) => void }) => (
      <MockText onPress={() => onOpen('c-1')}>open-direct</MockText>
    ),
  };
});
jest.mock('../../direct-chat/components/DirectConversationScreen', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    DirectConversationScreen: ({
      otherUser,
      onBack,
    }: {
      otherUser: { displayName: string };
      onBack: () => void;
    }) => <MockText onPress={onBack}>conversation-{otherUser.displayName}</MockText>,
  };
});
jest.mock('../../direct-chat/hooks/useDirectChat', () => ({
  useConversations: () => ({
    isPending: false,
    error: null,
    data: [
      {
        conversation_id: 'c-1',
        other_user_id: 'u-1',
        other_display_name: 'Laia',
        blocked_by_me: false,
      },
    ],
  }),
}));

const stub = (name: string) =>
  function Stub() {
    return <Text>{name}</Text>;
  };
async function renderApp(initialUrl: string) {
  jest
    .spyOn(tokenStorage, 'getTokens')
    .mockResolvedValue({ accessToken: 'test-access', refreshToken: 'test-refresh' });
  jest
    .spyOn(refreshToken, 'refreshSession')
    .mockResolvedValue({
      access_token: 'test-access',
      refresh_token: 'test-refresh',
      token_type: 'bearer',
      expires_in: 900,
    });
  return renderRouter(
    {
      '(app)/_layout': AppLayout,
      '(app)/index': stub('home'),
      '(app)/events': stub('events'),
      '(app)/chat/_layout': ChatLayout,
      '(app)/chat/index': stub('event-rooms'),
      '(app)/chat/direct/index': DirectListRoute,
      '(app)/chat/direct/[conversationId]': DirectConversationRoute,
      '(app)/gamification': stub('gamification'),
      '(app)/profile': stub('profile'),
      '(app)/map': stub('map'),
      '(app)/apod': stub('apod'),
      login: stub('login'),
    },
    { initialUrl },
  );
}
afterEach(() => jest.restoreAllMocks());

describe('direct chat navigation (TG-65)', () => {
  it('opens a direct conversation from the list and returns to it', async () => {
    const app = await renderApp('/chat/direct');
    await fireEvent.press(await screen.findByText('open-direct'));
    expect(await screen.findByText('conversation-Laia')).toBeTruthy();
    expect(app.getPathname()).toBe('/chat/direct/c-1');
    await fireEvent.press(screen.getByText('conversation-Laia'));
    expect(await screen.findByText('open-direct')).toBeTruthy();
  });

  it('resolves a direct conversation after opening its link directly', async () => {
    const app = await renderApp('/chat/direct/c-1');
    expect(await screen.findByText('conversation-Laia')).toBeTruthy();
    expect(app.getPathname()).toBe('/chat/direct/c-1');
    await act(async () => {
      router.replace('/chat');
    });
    expect(await screen.findByText('event-rooms')).toBeTruthy();
  });
});
