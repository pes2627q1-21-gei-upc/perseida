import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Crypto from 'expo-crypto';
import type { ReactNode } from 'react';

import { mockUserProfile } from '../../../../__mocks__/profile';
import { AppError } from '../../../shared/errors';
import type { ServerFrame } from '../../../shared/realtime';
import { getCurrentUser } from '../../auth/api/getCurrentUser';
import { currentUserKeys } from '../../auth/hooks/useCurrentUser';
import { fetchMessages, markRead } from '../api/directChat';
import { directChatKeys } from './useDirectChat';
import { useDirectConversation } from './useDirectConversation';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'client-id-1') }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Error: 'error' },
}));
jest.mock('../api/directChat', () => ({ fetchMessages: jest.fn(), markRead: jest.fn() }));
jest.mock('../../auth/api/getCurrentUser', () => ({ getCurrentUser: jest.fn() }));
jest.mock('../../auth/socketAuth', () => ({ socketAuth: {} }));
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
    sendEphemeral: jest.fn(),
    subscribePrivate: mockSocket.subscribePrivate,
  }),
}));

const CONVERSATION = '01900000-0000-7000-8000-000000000003';
const OTHER = '01900000-0000-7000-8000-000000000004';
const message = {
  id: 'message-1',
  conversation_id: CONVERSATION,
  sender_id: 'other',
  text: 'Hola',
  sent_at: '2026-11-22T12:00:00Z',
};
const page = (messages: (typeof message)[], next_cursor: string | null = null) => ({
  messages,
  next_cursor,
});
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const emit = (frame: ServerFrame) => mockSocket.listeners.forEach((listener) => listener(frame));
const messageIds = (items: { kind: string; message?: { id: string } }[]) =>
  items.flatMap((item) => (item.kind === 'message' && item.message ? [item.message.id] : []));

async function mount(id = CONVERSATION) {
  const hook = await renderHook(
    ({ id: current }: { id: string }) => useDirectConversation(current),
    { wrapper, initialProps: { id } },
  );
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(currentUserKeys.me(), mockUserProfile);
  mockSocket.status = 'open';
  mockSocket.listeners.clear();
  jest.clearAllMocks();
  jest.mocked(Crypto.randomUUID).mockReturnValue('client-id-1');
  jest.mocked(fetchMessages).mockResolvedValue(page([]));
  jest.mocked(markRead).mockResolvedValue(undefined);
  mockSocket.send.mockResolvedValue({
    type: 'dm.send',
    payload: { id: 'message-2', sent_at: '2026-11-22T12:01:00Z' },
  });
});
afterEach(() => client.clear());

describe('useDirectConversation (TG-65 criteris 5, 9, 11)', () => {
  it('exposa l’històric persistit i marca la conversa oberta com a llegida', async () => {
    jest.mocked(fetchMessages).mockResolvedValue(page([message]));

    const { result } = await mount();

    expect(result.current.items).toContainEqual(
      expect.objectContaining({
        kind: 'message',
        message: expect.objectContaining({ id: message.id, text: 'Hola', room_id: CONVERSATION }),
        mine: false,
      }),
    );
    await waitFor(() => expect(jest.mocked(markRead).mock.calls[0]?.[0]).toBe(CONVERSATION));
  });

  it('manté l’ordre del servidor i hi col·loca els missatges en directe pel seu moment i id', async () => {
    const timestamp = '2026-11-22T12:00:00Z';
    jest.mocked(fetchMessages).mockResolvedValue(
      page([
        { ...message, id: 'tie-b', sent_at: timestamp },
        { ...message, id: 'older', sent_at: '2026-11-22T11:00:00Z' },
      ]),
    );
    const { result } = await mount();

    await act(async () => {
      emit({ type: 'dm.message', payload: { ...message, id: 'tie-z', sent_at: timestamp } });
      emit({
        type: 'dm.message',
        payload: { ...message, id: 'latest', sent_at: '2026-11-22T13:00:00Z' },
      });
    });

    expect(messageIds(result.current.items)).toEqual(['latest', 'tie-z', 'tie-b', 'older']);
  });

  it('envia un dm.send amb la conversa, el text i un id generat pel client', async () => {
    const { result } = await mount();

    await act(async () => {
      await result.current.send('Hola');
    });

    await waitFor(() =>
      expect(mockSocket.send).toHaveBeenCalledWith({
        type: 'dm.send',
        payload: { conversation_id: CONVERSATION, text: 'Hola', client_message_id: 'client-id-1' },
      }),
    );
    await waitFor(() => expect(messageIds(result.current.items)).toContain('message-2'));
    expect(result.current.items).toContainEqual(
      expect.objectContaining({ kind: 'message', mine: true }),
    );
  });

  it('mostra un missatge privat només a la seva conversa i sense duplicar-lo', async () => {
    const { result } = await mount();

    await act(async () => {
      emit({ type: 'dm.message', payload: { ...message, conversation_id: OTHER } });
      emit({ type: 'dm.message', payload: message });
      emit({ type: 'dm.message', payload: message });
    });

    const messages = result.current.items.filter((item) => item.kind === 'message');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ message: { id: message.id, text: 'Hola' }, mine: false });
  });

  it('un enviament refusat queda com a fallit amb l’error del servidor', async () => {
    mockSocket.send.mockRejectedValue(
      new AppError({ kind: 'http', code: 'USER_BLOCKED', status: 403, retryable: false }),
    );
    const { result } = await mount();

    await act(async () => {
      await result.current.send('Hola');
    });

    await waitFor(() =>
      expect(result.current.items).toContainEqual(
        expect.objectContaining({
          kind: 'pending',
          status: 'failed',
          error: { code: 'USER_BLOCKED', retryable: false },
        }),
      ),
    );
  });

  it('en reintentar un enviament incert reutilitza el mateix id de client', async () => {
    mockSocket.send
      .mockRejectedValueOnce(
        new AppError({ kind: 'network', code: 'SEND_UNCERTAIN', retryable: true }),
      )
      .mockResolvedValueOnce({
        type: 'dm.send',
        payload: { id: 'message-2', sent_at: '2026-11-22T12:01:00Z' },
      });
    const { result } = await mount();

    await act(async () => {
      await result.current.send('Hola');
    });
    await waitFor(() =>
      expect(result.current.items).toContainEqual(
        expect.objectContaining({ kind: 'pending', status: 'uncertain' }),
      ),
    );
    await act(async () => {
      await result.current.retry('client-id-1');
    });

    expect(mockSocket.send.mock.calls[0]?.[0]).toEqual(mockSocket.send.mock.calls[1]?.[0]);
  });

  it('descarta només el missatge pendent amb l’id de client demanat', async () => {
    jest
      .mocked(Crypto.randomUUID)
      .mockReturnValueOnce('client-id-1')
      .mockReturnValueOnce('client-id-2');
    mockSocket.send.mockReturnValue(new Promise(() => undefined));
    const { result } = await mount();

    await act(async () => {
      await result.current.send('Primer');
      await result.current.send('Segon');
    });
    await act(async () => {
      result.current.discard('client-id-1');
    });

    expect(result.current.items).not.toContainEqual(
      expect.objectContaining({ kind: 'pending', clientMessageId: 'client-id-1' }),
    );
    expect(result.current.items).toContainEqual(
      expect.objectContaining({ kind: 'pending', clientMessageId: 'client-id-2', text: 'Segon' }),
    );
  });

  it('carrega l’històric antic només si hi ha pàgina i no n’hi ha una en curs', async () => {
    // Connecting asks for the history again, so the answer depends on the cursor, not on the order.
    jest
      .mocked(fetchMessages)
      .mockImplementation(async (_id, before) =>
        before ? page([{ ...message, id: 'older' }]) : page([message], 'cursor-1'),
      );
    const { result } = await mount();
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.loadOlder();
    });

    expect(fetchMessages).toHaveBeenCalledWith(CONVERSATION, 'cursor-1');
    await waitFor(() => expect(result.current.hasMore).toBe(false));
    const calls = jest.mocked(fetchMessages).mock.calls.length;
    await act(async () => {
      result.current.loadOlder();
    });
    expect(fetchMessages).toHaveBeenCalledTimes(calls);
  });

  it('marca la conversa com a llegida també quan hi arriba un missatge', async () => {
    await mount();
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));

    await act(async () => emit({ type: 'dm.message', payload: message }));

    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
  });

  it.each(['id', 'conversation_id', 'sender_id', 'text', 'sent_at'] as const)(
    'ignora un dm.message amb %s que no és text',
    async (field) => {
      const { result } = await mount();

      await act(async () => emit({ type: 'dm.message', payload: { ...message, [field]: null } }));

      expect(result.current.items).toEqual([]);
    },
  );
});

describe('useDirectConversation: errors i reconnexió (review de TG-65)', () => {
  it('[ALTA] un error en refrescar l’històric no amaga una conversa que ja es veu', async () => {
    jest.mocked(fetchMessages).mockResolvedValue(page([message]));
    const { result } = await mount();
    jest
      .mocked(fetchMessages)
      .mockRejectedValue(new AppError({ kind: 'network', code: 'NETWORK_ERROR', retryable: true }));

    await act(async () => {
      await client.refetchQueries({ queryKey: directChatKeys.messages(CONVERSATION) });
      // TanStack notifies the observers on a timer: let it deliver the failure.
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(client.getQueryState(directChatKeys.messages(CONVERSATION))?.status).toBe('error');
    expect(result.current.error).toBeNull();
    expect(messageIds(result.current.items)).toEqual([message.id]);
  });

  it('[ALTA] un error en refrescar qui ets no amaga la conversa si ja ho sap', async () => {
    jest.mocked(fetchMessages).mockResolvedValue(page([message]));
    jest
      .mocked(getCurrentUser)
      .mockRejectedValue(new AppError({ kind: 'network', code: 'NETWORK_ERROR', retryable: true }));
    const { result } = await mount();

    await act(async () => {
      await client.refetchQueries({ queryKey: currentUserKeys.me() });
      // TanStack notifies the observers on a timer: let it deliver the failure.
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(client.getQueryState(currentUserKeys.me())?.status).toBe('error');
    expect(result.current.error).toBeNull();
  });

  it('[MITJANA] en connectar cancel·la la petició en curs de l’històric abans de tornar-la a demanar', async () => {
    const cancel = jest.spyOn(client, 'cancelQueries');
    await mount();

    await waitFor(() =>
      expect(cancel).toHaveBeenCalledWith({ queryKey: directChatKeys.messages(CONVERSATION) }),
    );
  });

  it('[MITJANA] en tornar a connectar recupera el que s’ha publicat mentre era fora', async () => {
    const { result, rerender } = await mount();
    jest.mocked(fetchMessages).mockResolvedValue(page([message]));

    mockSocket.status = 'reconnecting';
    await rerender({ id: CONVERSATION });
    mockSocket.status = 'open';
    await rerender({ id: CONVERSATION });

    await waitFor(() => expect(messageIds(result.current.items)).toEqual([message.id]));
  });

  it('[MITJANA] recarregar també torna a demanar qui ets si havia fallat', async () => {
    client.clear();
    jest
      .mocked(getCurrentUser)
      .mockRejectedValueOnce(
        new AppError({ kind: 'http', code: 'ACCOUNT_SUSPENDED', status: 403, retryable: false }),
      )
      .mockResolvedValue(mockUserProfile);
    const hook = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await waitFor(() => expect(hook.result.current.error).toBeTruthy());

    await act(async () => hook.result.current.reload());

    await waitFor(() => expect(hook.result.current.error).toBeNull());
    expect(getCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('mentre carrega qui ets o l’històric, està carregant', async () => {
    jest.mocked(fetchMessages).mockReturnValue(new Promise(() => undefined));

    const { result } = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });
});
