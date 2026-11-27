// Simulated API responses for the event chat tests (TG-466). Shapes of ChatMessageResponse,
// ChatRoomResponse and ChatHistoryResponse.

export const EVENT_ID = '01a1bd9a-0000-7000-8000-000000000001';
export const ROOM_ID = '01a1bd9a-0000-7000-8000-0000000000c1';

export function makeMessage(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `01a1bd9a-0000-7000-8000-${String(n).padStart(12, '0')}`,
    room_id: ROOM_ID,
    author: { id: '01a1bd9a-0000-7000-8000-0000000000aa', name: 'Laia' },
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

/** An event of GET /api/me/subscriptions (EventResponse); `n` makes the id and the title unique. */
export function makeSubscribedEvent(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `01a19288-0000-7000-8000-${String(n).padStart(12, '0')}`,
    title: `Esdeveniment ${n}`,
    summary: `Resum ${n}`,
    category: 'meteor_shower',
    starts_at: '2026-12-01T20:00:00Z',
    ends_at: '2026-12-01T23:00:00Z',
    location: null,
    source_url: null,
    ...overrides,
  };
}

export function makePage(messages: unknown[], nextCursor: string | null = null) {
  return { messages, next_cursor: nextCursor };
}

/** Authors of the room tests: `makeMessage` writes as Laia by default; Pau is another person. */
export const LAIA_ID = '01a1bd9a-0000-7000-8000-0000000000aa';
export const PAU_ID = '01a1bd9a-0000-7000-8000-0000000000bb';
export const PAU = { id: PAU_ID, name: 'Pau' };

/** The cache of the history of a room (TanStack `InfiniteData`): one page per list, newest first. */
export function makeHistoryData(pages: unknown[][]) {
  return {
    pages: pages.map((messages, i) =>
      makePage(messages, i < pages.length - 1 ? `cursor-${i}` : null),
    ),
    pageParams: pages.map((_, i) => (i === 0 ? undefined : `cursor-${i - 1}`)),
  };
}
