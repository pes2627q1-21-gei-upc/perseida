import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Crypto from 'expo-crypto';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { mockUserProfile } from '../../../../__mocks__/profile';
import { AppError } from '../../../shared/errors';
import type { ServerFrame } from '../../../shared/realtime';
import { getCurrentUser } from '../../auth/api/getCurrentUser';
import { currentUserKeys } from '../../auth/hooks/useCurrentUser';
import { fetchMessages, markRead } from '../api/directChat';
import { directChatKeys } from './useDirectChat';
import { useDirectConversation } from './useDirectConversation';

let mockIsFocused = true;
jest.mock('expo-router', () => ({
  useIsFocused: () => mockIsFocused,
  useRouter: () => ({ replace: jest.fn() }),
}));
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

async function mount(id = CONVERSATION, otherName?: string) {
  const hook = await renderHook(
    ({ id: current }: { id: string }) => useDirectConversation(current, otherName),
    { wrapper, initialProps: { id } },
  );
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

let appStateListeners: ((state: AppStateStatus) => void)[] = [];
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
/** A history request that stays on its way until the test lets it answer. */
let held: (() => void)[] = [];
const holdHistory = () => {
  held = [];
  jest.mocked(fetchMessages).mockImplementation(
    () =>
      new Promise((resolve) => {
        held.push(() => resolve(page([message])));
      }),
  );
};
/** The conversations the API was asked to mark as read. */
const markedRead = () => jest.mocked(markRead).mock.calls.map(([input]) => input.conversationId);
const answerHeld = () => act(async () => held.splice(0).forEach((answer) => answer()));

beforeEach(() => {
  mockIsFocused = true;
  appStateListeners = [];
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    writable: true,
    value: 'active',
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() } as never;
  });
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
afterEach(() => {
  client.clear();
  jest.mocked(AppState.addEventListener).mockRestore();
  Object.defineProperty(AppState, 'currentState', originalAppState);
});

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
    await waitFor(() =>
      expect(jest.mocked(markRead).mock.calls[0]?.[0]).toEqual({
        conversationId: CONVERSATION,
        lastMessageId: message.id,
      }),
    );
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

  it('no marca com a llegida una conversa amb l’històric buit', async () => {
    await mount();
    await act(async () => {});

    expect(markRead).not.toHaveBeenCalled();
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
    jest.mocked(fetchMessages).mockResolvedValue(page([message]));
    await mount();
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));
    const next = { ...message, id: 'message-2', sent_at: '2026-11-22T12:05:00Z' };
    jest.mocked(fetchMessages).mockResolvedValue(page([next, message]));

    await act(async () => emit({ type: 'dm.message', payload: next }));

    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    expect(jest.mocked(markRead).mock.calls[1]?.[0]).toEqual({
      conversationId: CONVERSATION,
      lastMessageId: 'message-2',
    });
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

describe('useDirectConversation: nom, lectura i anuncis (review de TG-65)', () => {
  it('mostra el nom de l’altre participant als missatges de l’històric', async () => {
    jest.mocked(fetchMessages).mockResolvedValue(page([message]));

    const { result } = await mount(CONVERSATION, 'Anna');

    expect(result.current.items).toContainEqual(
      expect.objectContaining({
        kind: 'message',
        message: expect.objectContaining({ author: { id: 'other', name: 'Anna' } }),
      }),
    );
  });

  it('no marca com a llegit en segon pla i recarrega l’històric abans de marcar en tornar', async () => {
    jest.mocked(fetchMessages).mockResolvedValue(page([message]));
    await mount();
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));
    jest.mocked(markRead).mockClear();

    await act(async () => appStateListeners.forEach((listener) => listener('background')));
    await act(async () => emit({ type: 'dm.message', payload: message }));
    expect(markRead).not.toHaveBeenCalled();

    holdHistory();
    await act(async () => appStateListeners.forEach((listener) => listener('active')));
    await waitFor(() => expect(held.length).toBeGreaterThan(0));
    expect(markRead).not.toHaveBeenCalled();
    await answerHeld();
    await waitFor(() => expect(markedRead()).toContain(CONVERSATION));
  });

  it('marca fins al darrer missatge carregat si en arriba un mentre es refresca l’històric', async () => {
    const m4 = { ...message, id: 'm4', sent_at: '2026-11-22T11:00:00Z' };
    const m5 = { ...message, id: 'm5', sent_at: '2026-11-22T12:00:00Z' };
    jest.mocked(fetchMessages).mockResolvedValue(page([m4]));
    const { result } = await mount();
    await waitFor(() => expect(markedRead()).toContain(CONVERSATION));
    jest.mocked(markRead).mockClear();

    await act(async () => appStateListeners.forEach((listener) => listener('background')));
    let answer: (() => void) | undefined;
    jest.mocked(fetchMessages).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve(page([m4]));
        }),
    );
    await act(async () => appStateListeners.forEach((listener) => listener('active')));
    await waitFor(() => expect(answer).toBeDefined());
    // m5 arrives while the refresh is on its way; the next read of the history already has it.
    jest.mocked(fetchMessages).mockResolvedValue(page([m5, m4]));
    await act(async () => emit({ type: 'dm.message', payload: m5 }));
    await act(async () => answer?.());

    await waitFor(() => expect(messageIds(result.current.items)).toEqual(['m5', 'm4']));
    await waitFor(() => expect(markRead).toHaveBeenCalled());
    const marked = jest.mocked(markRead).mock.calls.map(([input]) => input.lastMessageId);
    expect(marked.at(-1)).toBe('m5');
    expect(marked).not.toContain('m4');
  });

  it('no perd la pàgina d’antics que es carrega quan hi arriba un missatge en directe', async () => {
    const newest = { ...message, id: 'm5', sent_at: '2026-11-22T12:00:00Z' };
    const live = { ...message, id: 'm6', sent_at: '2026-11-22T13:00:00Z' };
    const older = { ...message, id: 'm1', sent_at: '2026-11-22T10:00:00Z' };
    let answerOlder: (() => void) | undefined;
    jest.mocked(fetchMessages).mockImplementation((_id: string, cursor?: string) =>
      cursor
        ? new Promise((resolve) => {
            answerOlder = () => resolve(page([older]));
          })
        : Promise.resolve(page([newest], 'cursor-1')),
    );
    const { result } = await mount();
    await waitFor(() => expect(markRead).toHaveBeenCalled());

    await act(async () => result.current.loadOlder());
    await waitFor(() => expect(answerOlder).toBeDefined());
    // Returning to the app refreshes the history while the older page is on its way.
    await act(async () => appStateListeners.forEach((listener) => listener('background')));
    await act(async () => appStateListeners.forEach((listener) => listener('active')));
    await act(async () => emit({ type: 'dm.message', payload: live }));
    await act(async () => answerOlder?.());

    await waitFor(() => expect(messageIds(result.current.items)).toContain('m1'));
    expect(messageIds(result.current.items)).toContain('m6');
  });

  it('[ALTA] un error en refrescar la primera pàgina en arribar un missatge no amaga la conversa', async () => {
    jest.mocked(fetchMessages).mockResolvedValue(page([message]));
    const { result } = await mount();
    await waitFor(() => expect(markRead).toHaveBeenCalled());
    jest.mocked(markRead).mockClear();
    jest
      .mocked(fetchMessages)
      .mockRejectedValue(new AppError({ kind: 'network', code: 'NETWORK_ERROR', retryable: true }));
    const next = { ...message, id: 'message-2', sent_at: '2026-11-22T12:05:00Z' };

    await act(async () => emit({ type: 'dm.message', payload: next }));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    expect(result.current.error).toBeNull();
    expect(messageIds(result.current.items)).toEqual([next.id, message.id]);
    expect(markRead).not.toHaveBeenCalled();
  });

  it('[MITJANA] quatre missatges en directe costen com a molt una primera pàgina cadascun i cap pàgina antiga', async () => {
    const newest = { ...message, id: 'm9', sent_at: '2026-11-22T12:00:00Z' };
    const older = { ...message, id: 'm1', sent_at: '2026-11-22T10:00:00Z' };
    jest
      .mocked(fetchMessages)
      .mockImplementation(async (_id: string, cursor?: string) =>
        cursor ? page([older]) : page([newest], 'cursor-1'),
      );
    const { result } = await mount();
    await act(async () => result.current.loadOlder());
    await waitFor(() => expect(messageIds(result.current.items)).toContain('m1'));
    jest.mocked(fetchMessages).mockClear();

    for (const n of [1, 2, 3, 4]) {
      const live = { ...message, id: `live-${n}`, sent_at: `2026-11-22T13:0${n}:00Z` };
      await act(async () => emit({ type: 'dm.message', payload: live }));
    }

    await waitFor(() => expect(jest.mocked(fetchMessages).mock.calls.length).toBeGreaterThan(0));
    const calls = jest.mocked(fetchMessages).mock.calls;
    expect(calls.length).toBeLessThanOrEqual(4);
    expect(calls.every(([, cursor]) => cursor === undefined)).toBe(true);
  });

  it('no marca com a llegit si l’històric respon quan ja s’ha perdut el focus', async () => {
    holdHistory();
    const { rerender } = await renderHook(({ id }: { id: string }) => useDirectConversation(id), {
      wrapper,
      initialProps: { id: CONVERSATION },
    });
    await waitFor(() => expect(held.length).toBeGreaterThan(0));

    mockIsFocused = false;
    await rerender({ id: CONVERSATION });
    await answerHeld();

    expect(markRead).not.toHaveBeenCalled();
  });

  it('no marca com a llegida l’antiga conversa si l’històric respon després de canviar', async () => {
    holdHistory();
    const { rerender } = await renderHook(({ id }: { id: string }) => useDirectConversation(id), {
      wrapper,
      initialProps: { id: CONVERSATION },
    });
    await waitFor(() => expect(held.length).toBeGreaterThan(0));
    await rerender({ id: OTHER });
    await answerHeld();

    await waitFor(() => expect(markedRead()).toContain(OTHER));
    expect(markedRead()).not.toContain(CONVERSATION);
  });

  it('no marca com a llegida una conversa sense focus, tampoc quan hi arriba un missatge', async () => {
    mockIsFocused = false;
    await mount();

    await act(async () => emit({ type: 'dm.message', payload: message }));

    expect(markRead).not.toHaveBeenCalled();
  });

  it('no marca com a llegida si l’històric no es pot carregar', async () => {
    const error = new AppError({ kind: 'http', code: 'FORBIDDEN', status: 403, retryable: false });
    jest.mocked(fetchMessages).mockRejectedValue(error);

    const { result } = await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await waitFor(() => expect(result.current.error).toBe(error));

    expect(markRead).not.toHaveBeenCalled();
  });

  it('espera que l’històric es recarregui bé abans de marcar com a llegida en connectar', async () => {
    holdHistory();
    await renderHook(() => useDirectConversation(CONVERSATION), { wrapper });
    await waitFor(() => expect(held.length).toBeGreaterThan(0));
    expect(markRead).not.toHaveBeenCalled();

    await answerHeld();

    await waitFor(() => expect(markedRead()).toContain(CONVERSATION));
  });

  it('només anuncia els missatges nous en directe, no l’històric, els propis ni els duplicats', async () => {
    jest.mocked(fetchMessages).mockResolvedValue(page([message]));
    const { result } = await mount();
    expect(result.current.lastIncoming).toBeUndefined();

    await act(async () => emit({ type: 'dm.message', payload: message }));
    expect(result.current.lastIncoming).toBeUndefined();
    await act(async () =>
      emit({
        type: 'dm.message',
        payload: { ...message, id: 'own', sender_id: mockUserProfile.id },
      }),
    );
    expect(result.current.lastIncoming).toBeUndefined();

    const fresh = { ...message, id: 'fresh', text: 'Nou' };
    await act(async () => emit({ type: 'dm.message', payload: fresh }));
    expect(result.current.lastIncoming).toEqual(fresh);
    const announced = result.current.lastIncoming;
    await act(async () => emit({ type: 'dm.message', payload: fresh }));
    expect(result.current.lastIncoming).toBe(announced);
  });

  it('no torna a anunciar un missatge antic en sortir d’una conversa i tornar-hi', async () => {
    const { result, rerender } = await mount();
    await act(async () => emit({ type: 'dm.message', payload: message }));
    expect(result.current.lastIncoming).toEqual(message);

    await rerender({ id: OTHER });
    expect(result.current.lastIncoming).toBeUndefined();
    await rerender({ id: CONVERSATION });
    expect(result.current.lastIncoming).toBeUndefined();
  });
});
