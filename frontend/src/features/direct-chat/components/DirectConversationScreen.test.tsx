import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppError } from '../../../shared/errors';
import { DirectConversationScreen } from './DirectConversationScreen';

const mockLive = jest.fn();
const mockTyping = jest.fn();
const mockBlock = jest.fn();
const mockUnblock = jest.fn();
const mockReload = jest.fn();
const mockSend = jest.fn();
const mockBack = jest.fn();
jest.mock('../hooks/useDirectConversation', () => ({ useDirectConversation: () => mockLive() }));
jest.mock('../hooks/useDirectTyping', () => ({ useDirectTyping: () => mockTyping() }));
jest.mock('../hooks/useDirectChat', () => ({
  useBlockUser: () => ({ mutateAsync: mockBlock, isPending: false }),
  useUnblockUser: () => ({ mutateAsync: mockUnblock, isPending: false }),
}));

const CONVERSATION = '01900000-0000-7000-8000-000000000003';
const OTHER = '01900000-0000-7000-8000-000000000002';
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderScreen(blockedByMe = false) {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <DirectConversationScreen
        conversationId={CONVERSATION}
        otherUser={{ id: OTHER, displayName: 'Laia' }}
        blockedByMe={blockedByMe}
        onBack={mockBack}
      />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLive.mockReturnValue({
    items: [],
    isLoading: false,
    error: null,
    status: 'open',
    send: mockSend,
    reload: mockReload,
    hasMore: false,
    isFetchingMore: false,
    loadOlder: jest.fn(),
    retry: jest.fn(),
    discard: jest.fn(),
    reconnect: jest.fn(),
  });
  mockTyping.mockReturnValue({ isTyping: false, setTyping: jest.fn() });
  mockBlock.mockResolvedValue(undefined);
  mockUnblock.mockResolvedValue(undefined);
});

describe('DirectConversationScreen (TG-65 criteria 9, 12, 15, 16)', () => {
  it('announces loading to the screen reader', async () => {
    mockLive.mockReturnValue({ ...mockLive(), isLoading: true });
    await renderScreen();
    expect(screen.getByLabelText(/carregant/i)).toBeOnTheScreen();
  });

  it('shows the empty state and an accessible message field', async () => {
    await renderScreen();
    expect(screen.getByText(/encara no hi ha missatges/i)).toBeOnTheScreen();
    expect(screen.getByRole('textbox')).toBeOnTheScreen();
  });

  it('announces a retryable history error and retries on request', async () => {
    const error = new AppError({
      kind: 'http',
      code: 'DATABASE_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
    mockLive.mockReturnValue({ ...mockLive(), error });
    await renderScreen();
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /torna-ho a provar/i }));
    expect(mockReload).toHaveBeenCalled();
  });

  it('sends text using the shared message composer', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByRole('textbox'), 'Hola');
    await fireEvent.press(screen.getByRole('button', { name: /envia/i }));
    expect(mockSend).toHaveBeenCalledWith('Hola');
  });

  it('blocks the other participant without removing previous history', async () => {
    mockLive.mockReturnValue({
      ...mockLive(),
      items: [
        {
          kind: 'message',
          key: 'm1',
          message: {
            id: 'm1',
            room_id: CONVERSATION,
            author: { id: OTHER, name: 'Laia' },
            text: 'Hola anterior',
            sent_at: '2026-11-22T12:00:00Z',
          },
          mine: false,
          showAuthor: true,
        },
      ],
    });
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: /bloqueja/i }));
    await waitFor(() => expect(mockBlock).toHaveBeenCalledWith(OTHER));
    expect(screen.getByText('Hola anterior')).toBeOnTheScreen();
  });

  it('offers unblock for an already blocked participant', async () => {
    await renderScreen(true);
    await fireEvent.press(screen.getByRole('button', { name: /desbloqueja/i }));
    await waitFor(() => expect(mockUnblock).toHaveBeenCalledWith(OTHER));
  });

  it('indicates typing with accessible text', async () => {
    mockTyping.mockReturnValue({ isTyping: true, setTyping: jest.fn() });
    await renderScreen();
    expect(screen.getByText(/laia.*escrivint/i)).toBeOnTheScreen();
  });
});
