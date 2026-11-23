import { fireEvent, render, screen } from '@testing-library/react-native';

import DirectConversationRoute from '../../../app/(app)/chat/direct/[conversationId]';
import DirectListRoute from '../../../app/(app)/chat/direct/index';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockList = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({ conversationId: 'c-1' }),
}));
jest.mock('../../direct-chat/components/ConversationsScreen', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    ConversationsScreen: ({ onOpen }: { onOpen: (id: string) => void }) => (
      <MockText onPress={() => onOpen('c-1')}>open</MockText>
    ),
  };
});
jest.mock('../../direct-chat/components/DirectConversationScreen', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    DirectConversationScreen: ({
      otherUser,
      blockedByMe,
      onBack,
    }: {
      otherUser: { displayName: string };
      blockedByMe: boolean;
      onBack: () => void;
    }) => (
      <MockText onPress={onBack}>
        {otherUser.displayName} {String(blockedByMe)}
      </MockText>
    ),
  };
});
jest.mock('../../direct-chat/hooks/useDirectChat', () => ({ useConversations: () => mockList() }));

beforeEach(() => jest.clearAllMocks());

describe('direct chat routes (TG-65)', () => {
  it('opens the selected conversation without exposing profile data in the route', async () => {
    await render(<DirectListRoute />);
    await fireEvent.press(screen.getByText('open'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/chat/direct/[conversationId]',
      params: { conversationId: 'c-1' },
    });
  });

  it('resolves the participant and blocked state from the server on a deep link', async () => {
    mockList.mockReturnValue({
      isPending: false,
      error: null,
      data: [
        {
          conversation_id: 'c-1',
          other_user_id: 'u-1',
          other_display_name: 'Laia',
          blocked_by_me: true,
        },
      ],
    });
    await render(<DirectConversationRoute />);
    await fireEvent.press(screen.getByText('Laia true'));
    expect(mockReplace).toHaveBeenCalledWith('/chat/direct');
  });
});
