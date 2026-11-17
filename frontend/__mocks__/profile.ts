import type { components } from '../src/shared/api/schema';

export type UserProfile = components['schemas']['UserResponse'];

export const mockUserProfile: UserProfile = {
  id: '01a19288-a3f6-7576-a37b-8926ca81b8fe',
  email: 'alex@example.com',
  display_name: 'Àlex García',
  avatar_url: 'https://example.com/avatar.jpg',
  preferred_language: 'ca',
  role: 'user',
  created_at: '2026-10-30T09:15:00Z',
};

export function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

export function problemResponse(status: number, code: string) {
  return jsonResponse(
    {
      type: 'about:blank',
      title: 'Error',
      status,
      detail: 'Internal detail',
      instance: '/api/users/me',
      code,
      correlation_id: '5c0e0b8e-6d57-4f7b-9d0e-0d6a1f6f4c11',
    },
    status,
    'application/problem+json',
  );
}
