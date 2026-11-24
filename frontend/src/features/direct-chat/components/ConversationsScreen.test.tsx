import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppError } from '../../../shared/errors';
import { ConversationsScreen } from './ConversationsScreen';

const mockList = jest.fn();
const mockOpen = jest.fn();
const mockRefresh = jest.fn();
const mockOpened = jest.fn();
jest.mock('../hooks/useDirectChat', () => ({
  useConversations: () => mockList(),
  useOpenConversation: () => ({ mutateAsync: mockOpen, isPending: false }),
}));
jest.mock('../../auth/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ data: { id: 'me' }, isPending: false }),
}));

const CONVERSATION = '01900000-0000-7000-8000-000000000003';
const OTHER = '01900000-0000-7000-8000-000000000002';
const overview = {
  conversation_id: CONVERSATION,
  other_user_id: OTHER,
  other_display_name: 'Laia',
  other_avatar_url: null,
  last_message_preview: 'Hola',
  last_message_at: '2026-11-22T12:00:00Z',
  last_message_sender_id: OTHER,
  unread_count: 2,
  blocked_by_me: false,
  created_at: '2026-11-22T11:00:00Z',
};
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ConversationsScreen onOpen={mockOpened} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockReturnValue({
    data: [overview],
    isPending: false,
    error: null,
    refetch: mockRefresh,
  });
  mockOpen.mockResolvedValue({ id: CONVERSATION });
});

describe('ConversationsScreen (TG-65 criteria 10, 11, 15, 16)', () => {
  it('announces loading with an accessible label', async () => {
    mockList.mockReturnValue({
      data: undefined,
      isPending: true,
      error: null,
      refetch: mockRefresh,
    });
    await renderScreen();
    expect(screen.getByLabelText(/carregant converses/i)).toBeOnTheScreen();
  });

  it('offers starting a conversation when the list is empty', async () => {
    mockList.mockReturnValue({ data: [], isPending: false, error: null, refetch: mockRefresh });
    await renderScreen();
    expect(screen.getByText(/encara no tens converses/i)).toBeOnTheScreen();
    expect(screen.getByLabelText(/identificador d'usuari/i)).toBeOnTheScreen();
  });

  it('announces an error and retries via a button', async () => {
    const error = new AppError({
      kind: 'http',
      code: 'DATABASE_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
    mockList.mockReturnValue({ data: undefined, isPending: false, error, refetch: mockRefresh });
    await renderScreen();
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /torna-ho a provar/i }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows a row and announces its unread count', async () => {
    await renderScreen();
    expect(
      screen.getByRole('button', { name: /conversa amb laia, 2 missatges sense llegir/i }),
    ).toBeOnTheScreen();
  });

  it('shows the latest message preview from the other participant without a sender prefix', async () => {
    await renderScreen();

    expect(screen.getByText('Hola')).toBeOnTheScreen();
    expect(screen.queryByText('Tu: Hola')).toBeNull();
  });

  it('prefixes the latest message preview when it was sent by the current user', async () => {
    mockList.mockReturnValue({
      data: [{ ...overview, last_message_sender_id: 'me' }],
      isPending: false,
      error: null,
      refetch: mockRefresh,
    });
    await renderScreen();

    expect(screen.getByText('Tu: Hola')).toBeOnTheScreen();
  });

  it('shows the empty-message state when the conversation has no latest message', async () => {
    mockList.mockReturnValue({
      data: [
        {
          ...overview,
          last_message_preview: null,
          last_message_at: null,
          last_message_sender_id: null,
        },
      ],
      isPending: false,
      error: null,
      refetch: mockRefresh,
    });
    await renderScreen();

    expect(screen.getByText('Encara no hi ha missatges')).toBeOnTheScreen();
  });

  it('announces the total unread messages across conversations', async () => {
    mockList.mockReturnValue({
      data: [
        overview,
        {
          ...overview,
          conversation_id: 'other-conversation',
          other_display_name: 'Pau',
          unread_count: 3,
        },
      ],
      isPending: false,
      error: null,
      refetch: mockRefresh,
    });
    await renderScreen();
    expect(screen.getByLabelText(/5 missatges sense llegir/i)).toBeOnTheScreen();
  });

  it('opens a listed conversation using its id', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: /conversa amb laia/i }));
    expect(mockOpened).toHaveBeenCalledWith(CONVERSATION);
  });

  it('opens or creates a conversation from the entered user id', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText(/identificador d'usuari/i), OTHER);
    await fireEvent.press(screen.getByRole('button', { name: /inicia conversa/i }));
    await waitFor(() => expect(mockOpen).toHaveBeenCalledWith(OTHER));
    await waitFor(() => expect(mockOpened).toHaveBeenCalledWith(CONVERSATION));
  });

  it('does not navigate when opening the conversation is rejected', async () => {
    mockOpen.mockRejectedValue(
      new AppError({ kind: 'http', code: 'USER_NOT_FOUND', status: 404, retryable: false }),
    );
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText(/identificador d'usuari/i), OTHER);
    await fireEvent.press(screen.getByRole('button', { name: /inicia conversa/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeOnTheScreen());
    expect(mockOpened).not.toHaveBeenCalled();
  });
});

describe('TG-65 conversation inbox validation and recovery', () => {
  it('keeps the action disabled for a whitespace-only ID', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText(/identificador d'usuari/i), '   ');
    expect(screen.getByRole('button', { name: /inicia conversa/i })).toBeDisabled();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace from the entered ID', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText(/identificador d'usuari/i), `  ${OTHER}  `);
    await fireEvent.press(screen.getByRole('button', { name: /inicia conversa/i }));
    await waitFor(() => expect(mockOpen).toHaveBeenCalledWith(OTHER));
  });

  it('keeps previously loaded conversations visible on a refresh failure', async () => {
    const error = new AppError({
      kind: 'http',
      code: 'DATABASE_UNAVAILABLE',
      status: 503,
      retryable: true,
    });
    mockList.mockReturnValue({ data: [overview], isPending: false, error, refetch: mockRefresh });
    await renderScreen();
    expect(screen.getByRole('button', { name: /conversa amb laia/i })).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears an earlier opening error after the next attempt succeeds', async () => {
    mockOpen
      .mockRejectedValueOnce(
        new AppError({ kind: 'http', code: 'USER_NOT_FOUND', status: 404, retryable: false }),
      )
      .mockResolvedValueOnce({ id: CONVERSATION });
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText(/identificador d'usuari/i), OTHER);
    await fireEvent.press(screen.getByRole('button', { name: /inicia conversa/i }));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /inicia conversa/i }));
    await waitFor(() => expect(mockOpened).toHaveBeenCalledWith(CONVERSATION));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
