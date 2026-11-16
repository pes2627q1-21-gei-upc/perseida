import { api } from '../../../shared/api/client';

/** Closes the whole session on the server. The endpoint answers 204 even if it was already closed. */
export async function logout(accessToken: string): Promise<void> {
  await api.POST('/api/auth/logout', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
