import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConversationsScreen } from './ConversationsScreen';

const mockList = jest.fn();
jest.mock('../hooks/useDirectChat', () => ({
  useConversations: () => mockList(),
  useOpenConversation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('../../auth/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: { id: 'me' }, isPending: false }),
}));

const row = {
  conversation_id: 'conversation-a',
  other_user_id: 'user-a',
  other_display_name: 'Laia',
  other_avatar_url: null,
  last_message_preview: null,
  last_message_at: null,
  last_message_sender_id: null,
  unread_count: 1,
  blocked_by_me: false,
  created_at: '2026-11-22T11:00:00Z',
};
const safeArea = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function tree() {
  return (
    <SafeAreaProvider initialMetrics={safeArea}>
      <ConversationsScreen onOpen={jest.fn()} />
    </SafeAreaProvider>
  );
}

function list(first: number) {
  return {
    data: [
      { ...row, unread_count: first },
      {
        ...row,
        conversation_id: 'conversation-b',
        other_user_id: 'user-b',
        other_display_name: 'Pau',
        unread_count: 3,
      },
    ],
    isPending: false,
    error: null,
    refetch: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockReturnValue(list(1));
});
afterEach(() => jest.restoreAllMocks());

it('announces only the changed unread total on iOS, not the initial total', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const { rerender } = await render(tree());
  expect(announce).not.toHaveBeenCalled();
  mockList.mockReturnValue(list(2));
  await rerender(tree());
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith('5 missatges sense llegir');
  expect(
    screen.getByRole('button', { name: /conversa amb laia, 2 missatges sense llegir/i }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: /conversa amb pau, 3 missatges sense llegir/i }),
  ).toBeOnTheScreen();
});

it('announces only changes to the total in an Android polite live region', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const { rerender } = await render(tree());
  const initialBadges = screen.getAllByTestId('unread-badge');
  expect(initialBadges.every((badge) => badge.props.accessibilityLiveRegion !== 'polite')).toBe(
    true,
  );
  mockList.mockReturnValue(list(2));
  await rerender(tree());
  const badges = screen.getAllByTestId('unread-badge');
  const liveBadges = badges.filter((badge) => badge.props.accessibilityLiveRegion === 'polite');
  expect(liveBadges).toHaveLength(1);
  expect(liveBadges[0]).toHaveProp('accessibilityLabel', '5 missatges sense llegir');
  expect(
    screen.getByRole('button', { name: /conversa amb laia, 2 missatges sense llegir/i }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: /conversa amb pau, 3 missatges sense llegir/i }),
  ).toBeOnTheScreen();
});

it('announces a change to zero on iOS even though the visible badge disappears', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const { rerender } = await render(tree());
  mockList.mockReturnValue({ ...list(0), data: [] });
  await rerender(tree());
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith('0 missatges sense llegir');
});

it('exposes a polite zero announcement on Android after the badge disappears', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const { rerender } = await render(tree());
  mockList.mockReturnValue({ ...list(0), data: [] });
  await rerender(tree());
  expect(screen.getByText('0 missatges sense llegir')).toHaveProp('accessibilityLiveRegion', 'polite');
});

it('does not announce the first result after loading', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  mockList.mockReturnValue({ data: undefined, isPending: true, error: null, refetch: jest.fn() });
  const { rerender } = await render(tree());
  mockList.mockReturnValue(list(1));
  await rerender(tree());
  expect(announce).not.toHaveBeenCalled();
});
