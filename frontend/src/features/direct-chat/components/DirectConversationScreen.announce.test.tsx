import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DirectConversationScreen } from './DirectConversationScreen';

const mockLive = jest.fn();
jest.mock('../hooks/useDirectConversation', () => ({ useDirectConversation: () => mockLive() }));
jest.mock('../hooks/useDirectTyping', () => ({
  useDirectTyping: () => ({ isTyping: false, setTyping: jest.fn() }),
}));
jest.mock('../hooks/useDirectChat', () => ({
  useBlockUser: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUnblockUser: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const CONVERSATION = '01900000-0000-7000-8000-000000000003';
const OTHER = '01900000-0000-7000-8000-000000000002';
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const first = {
  kind: 'message',
  key: 'm1',
  mine: false,
  showAuthor: true,
  message: {
    id: 'm1',
    room_id: CONVERSATION,
    author: { id: OTHER, name: 'Laia' },
    text: 'Hola',
    sent_at: '2026-11-22T12:00:00Z',
  },
};
const second = {
  ...first,
  key: 'm2',
  message: { ...first.message, id: 'm2', text: 'Bona nit' },
};

function screenElement() {
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <DirectConversationScreen
        conversationId={CONVERSATION}
        otherUser={{ id: OTHER, displayName: 'Laia' }}
        blockedByMe={false}
        onBack={jest.fn()}
      />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLive.mockReturnValue({
    items: [],
    isLoading: false,
    error: null,
    status: 'open',
    send: jest.fn(),
    reload: jest.fn(),
    hasMore: false,
    isFetchingMore: false,
    loadOlder: jest.fn(),
    retry: jest.fn(),
    discard: jest.fn(),
    reconnect: jest.fn(),
  });
});
afterEach(() => jest.restoreAllMocks());

it('announces the first and second incoming messages after an empty history on iOS', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const { rerender } = await render(screenElement());
  expect(announce).not.toHaveBeenCalled();

  mockLive.mockReturnValue({ ...mockLive(), items: [first] });
  await rerender(screenElement());
  expect(announce).toHaveBeenCalledWith('Missatge nou de Laia: Hola');
  mockLive.mockReturnValue({ ...mockLive(), items: [second, first] });
  await rerender(screenElement());
  expect(announce).toHaveBeenCalledWith('Missatge nou de Laia: Bona nit');
});

it('exposes the first incoming message after an empty history in an Android live region', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const { rerender } = await render(screenElement());
  mockLive.mockReturnValue({ ...mockLive(), items: [first] });
  await rerender(screenElement());
  expect(screen.getByText('Missatge nou de Laia: Hola')).toHaveProp(
    'accessibilityLiveRegion',
    'polite',
  );
});

it('does not announce messages already present when the screen first renders', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  mockLive.mockReturnValue({ ...mockLive(), items: [first] });
  await render(screenElement());
  expect(announce).not.toHaveBeenCalled();
});
