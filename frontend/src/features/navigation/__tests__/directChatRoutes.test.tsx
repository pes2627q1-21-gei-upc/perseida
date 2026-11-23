import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DirectConversationRoute from '../../../app/(app)/chat/direct/[conversationId]';
import DirectListRoute from '../../../app/(app)/chat/direct/index';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockList = jest.fn();
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
function wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={SAFE_AREA}>{children}</SafeAreaProvider>;
}
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
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

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(false);
});

describe('direct chat routes (TG-65)', () => {
  it.each([
    ['loading', { isPending: true, error: null, data: undefined }],
    [
      'error',
      {
        isPending: false,
        error: { code: 'DATABASE_UNAVAILABLE', retryable: false },
        data: undefined,
      },
    ],
    ['not found', { isPending: false, error: null, data: [] }],
  ])('provides back navigation from %s, including on a deep link', async (_state, query) => {
    mockList.mockReturnValue(query);
    await render(<DirectConversationRoute />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Torna' }));
    expect(mockReplace).toHaveBeenCalledWith('/chat/direct');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('uses the navigation history on the loading screen when available', async () => {
    mockCanGoBack.mockReturnValue(true);
    mockList.mockReturnValue({ isPending: true, error: null, data: undefined });
    await render(<DirectConversationRoute />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Torna' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('opens the selected conversation without exposing profile data in the route', async () => {
    await render(<DirectListRoute />, { wrapper });
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
    await render(<DirectConversationRoute />, { wrapper });
    await fireEvent.press(screen.getByText('Laia true'));
    expect(mockReplace).toHaveBeenCalledWith('/chat/direct');
  });
});
