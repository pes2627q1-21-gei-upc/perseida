// Simulated API responses for the event chat tests (TG-466). Shapes of ChatMessageResponse,
// ChatRoomResponse and ChatHistoryResponse.

export const EVENT_ID = '01a1bd9a-0000-7000-8000-000000000001';
export const ROOM_ID = '01a1bd9a-0000-7000-8000-0000000000c1';

export function makeMessage(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `01a1bd9a-0000-7000-8000-${String(n).padStart(12, '0')}`,
    room_id: ROOM_ID,
    author_id: '01a1bd9a-0000-7000-8000-0000000000aa',
    text: `Missatge ${n}`,
    sent_at: '2026-11-17T10:00:00Z',
    ...overrides,
  };
}

export function makeRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: ROOM_ID,
    event_id: EVENT_ID,
    created_at: '2026-11-17T09:00:00Z',
    last_message: null,
    ...overrides,
  };
}

export function makePage(messages: unknown[], nextCursor: string | null = null) {
  return { messages, next_cursor: nextCursor };
}
