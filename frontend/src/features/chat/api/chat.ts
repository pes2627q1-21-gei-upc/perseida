import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import { withSession } from '../../auth/api/authorized';

export type ChatMessage = components['schemas']['ChatMessageResponse'];
export type ChatRoom = components['schemas']['ChatRoomResponse'];
export type ChatHistory = components['schemas']['ChatHistoryResponse'];

const PAGE_SIZE = 50;

function invalidResponse(status: number): AppError {
  // 2xx without a body: treat as an unusable response, not as a crash.
  return new AppError({ kind: 'http', code: 'INVALID_RESPONSE', status, retryable: false });
}

/** The chat rooms of the user, each with its last message. */
export async function listRooms(): Promise<ChatRoom[]> {
  return withSession(async (headers) => {
    const { data, response } = await api.GET('/api/chat/rooms', { headers });
    if (!data) throw invalidResponse(response.status);
    return data;
  });
}

/** Opens the room of an event, creating it if needed (idempotent). */
export async function ensureRoom(eventId: string): Promise<ChatRoom> {
  return withSession(async (headers) => {
    const { data, response } = await api.PUT('/api/events/{event_id}/chat/room', {
      params: { path: { event_id: eventId } },
      headers,
    });
    if (!data) throw invalidResponse(response.status);
    return data;
  });
}

/** One page of history, newest first. `before` is the `next_cursor` of the previous page. */
export async function fetchMessages(eventId: string, before?: string): Promise<ChatHistory> {
  return withSession(async (headers) => {
    const { data, response } = await api.GET('/api/events/{event_id}/chat/messages', {
      params: {
        path: { event_id: eventId },
        query: before ? { limit: PAGE_SIZE, before } : { limit: PAGE_SIZE },
      },
      headers,
    });
    if (!data) throw invalidResponse(response.status);
    return data;
  });
}
