// Simulated API responses for the event posts tests (TG-628). Shape of PostResponse.

export const EVENT_ID = '01a1bd9a-0000-7000-8000-000000000001';

export function makePost(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `01a1bd9a-0000-7000-8000-${String(n).padStart(12, '0')}`,
    author: { id: '01a1bd9a-0000-7000-8000-0000000000aa', name: 'Ana' },
    text: `Publicació ${n}`,
    created_at: '2026-11-17T10:00:00Z',
    edited_at: null,
    ...overrides,
  };
}
