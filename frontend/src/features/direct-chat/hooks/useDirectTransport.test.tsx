import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppError } from '../../../shared/errors';
import type { ServerFrame } from '../../../shared/realtime';
import type { ChatSocketHandlers } from '../../chat/hooks/useChatSocket';
import { directChatKeys } from './useDirectChat';
import { useDirectTransport } from './useDirectTransport';

const mockSocket = {
  status: 'open' as 'open' | 'reconnecting',
  send: jest.fn(),
  reconnect: jest.fn(),
  listeners: new Set<(frame: ServerFrame) => void>(),
  // Stable, like the real one: the hooks re-subscribe whenever its identity changes.
  subscribePrivate: (listener: (frame: ServerFrame) => void) => {
    mockSocket.listeners.add(listener);
    return () => mockSocket.listeners.delete(listener);
  },
};
jest.mock('../../../shared/realtime', () => ({
  useSocket: () => ({
    status: mockSocket.status,
    error: null,
    reconnect: mockSocket.reconnect,
    send: (...args: unknown[]) => mockSocket.send(...args),
    subscribePrivate: mockSocket.subscribePrivate,
  }),
}));
jest.mock('../../auth/socketAuth', () => ({ socketAuth: {} }));

const CONVERSATION = '01900000-0000-7000-8000-000000000003';
const OTHER = '01900000-0000-7000-8000-000000000004';
const dm = {
  id: 'message-1',
  conversation_id: CONVERSATION,
  sender_id: 'other-user',
  text: 'Hola',
  sent_at: '2026-11-22T12:00:00Z',
};

let client: QueryClient;
let handlers: jest.Mocked<Required<ChatSocketHandlers>>;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const emit = (frame: ServerFrame) => mockSocket.listeners.forEach((listener) => listener(frame));
const mount = (target = CONVERSATION) =>
  renderHook(() => useDirectTransport(handlers, 0, target), { wrapper });

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mockSocket.status = 'open';
  mockSocket.listeners.clear();
  mockSocket.send.mockReset().mockResolvedValue({
    type: 'dm.send',
    payload: { id: 'message-2', sent_at: '2026-11-22T12:01:00Z' },
  });
  mockSocket.reconnect.mockReset();
  handlers = {
    onMessage: jest.fn(),
    onRevoked: jest.fn(),
    onError: jest.fn(),
    onJoined: jest.fn(),
  };
});
afterEach(() => client.clear());

describe('useDirectTransport (TG-65): canal privat de la conversa directa', () => {
  it('lliura un dm.message de la seva conversa com a ChatMessage', async () => {
    await mount();

    await act(async () => emit({ type: 'dm.message', payload: dm }));

    expect(handlers.onMessage).toHaveBeenCalledWith({
      id: 'message-1',
      room_id: CONVERSATION,
      author: { id: 'other-user', name: null },
      text: 'Hola',
      sent_at: '2026-11-22T12:00:00Z',
    });
  });

  it('posa el nom de l’altra persona si la llista de converses el coneix', async () => {
    client.setQueryData(directChatKeys.conversations, [
      {
        conversation_id: CONVERSATION,
        other_user_id: 'other-user',
        other_display_name: 'Pau',
      },
    ]);
    await mount();

    await act(async () => emit({ type: 'dm.message', payload: dm }));

    expect(handlers.onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ author: { id: 'other-user', name: 'Pau' } }),
    );
  });

  it('ignora els missatges d’una altra conversa i els altres tipus de frame', async () => {
    await mount();

    await act(async () => {
      emit({ type: 'dm.message', payload: { ...dm, conversation_id: OTHER } });
      emit({ type: 'dm.typing', payload: { conversation_id: CONVERSATION, is_typing: true } });
    });

    expect(handlers.onMessage).not.toHaveBeenCalled();
  });

  it.each(['id', 'conversation_id', 'sender_id', 'text', 'sent_at'] as const)(
    'ignora un dm.message amb %s que no és text',
    async (field) => {
      await mount();

      await act(async () => emit({ type: 'dm.message', payload: { ...dm, [field]: null } }));

      expect(handlers.onMessage).not.toHaveBeenCalled();
    },
  );

  it('refresca la llista de converses quan arriba un missatge', async () => {
    client.setQueryData(directChatKeys.conversations, []);
    await mount();

    await act(async () => emit({ type: 'dm.message', payload: dm }));

    expect(client.getQueryState(directChatKeys.conversations)?.isInvalidated).toBe(true);
  });

  it('avisa que s’ha unit cada vegada que el socket queda obert', async () => {
    const { rerender } = await mount();
    expect(handlers.onJoined).toHaveBeenCalledTimes(1);

    mockSocket.status = 'reconnecting';
    await rerender({});
    expect(handlers.onJoined).toHaveBeenCalledTimes(1);

    mockSocket.status = 'open';
    await rerender({});
    expect(handlers.onJoined).toHaveBeenCalledTimes(2);
  });

  it('no escolta ni avisa mentre el socket no és obert', async () => {
    mockSocket.status = 'reconnecting';
    await mount();

    expect(mockSocket.listeners.size).toBe(0);
    expect(handlers.onJoined).not.toHaveBeenCalled();
  });

  it('deixa d’escoltar en desmuntar', async () => {
    const { unmount } = await mount();
    expect(mockSocket.listeners.size).toBe(1);

    await unmount();

    expect(mockSocket.listeners.size).toBe(0);
  });

  it('envia un dm.send i retorna l’id i l’hora de l’ack, refrescant les converses', async () => {
    client.setQueryData(directChatKeys.conversations, []);
    const { result } = await mount();

    let ack: unknown;
    await act(async () => {
      ack = await result.current.sendMessage('Hola', 'client-1');
    });

    expect(mockSocket.send).toHaveBeenCalledWith({
      type: 'dm.send',
      payload: { conversation_id: CONVERSATION, text: 'Hola', client_message_id: 'client-1' },
    });
    expect(ack).toEqual({ id: 'message-2', sent_at: '2026-11-22T12:01:00Z' });
    expect(client.getQueryState(directChatKeys.conversations)?.isInvalidated).toBe(true);
  });

  it('un ack sense id o hora es rebutja amb un AppError, no amb un Error pla', async () => {
    mockSocket.send.mockResolvedValue({ type: 'dm.send', payload: { id: 'message-2' } });
    const { result } = await mount();

    const failure = await result.current.sendMessage('Hola', 'client-1').catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  });

  it('deixa passar l’AppError del servidor tal com és', async () => {
    const refusal = new AppError({
      kind: 'http',
      code: 'USER_BLOCKED',
      status: 403,
      retryable: false,
    });
    mockSocket.send.mockRejectedValue(refusal);
    const { result } = await mount();

    await expect(result.current.sendMessage('Hola', 'client-1')).rejects.toBe(refusal);
  });

  it('exposa l’estat i la reconnexió del socket', async () => {
    mockSocket.status = 'reconnecting';
    const { result } = await mount();

    expect(result.current.status).toBe('reconnecting');
    result.current.reconnect();
    expect(mockSocket.reconnect).toHaveBeenCalledTimes(1);
  });
});
