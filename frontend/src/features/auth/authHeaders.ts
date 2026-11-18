import { AppError } from '../../shared/errors';
import { getTokens } from './tokenStorage';

/**
 * Bearer header of the session for the endpoints that need one. Without a stored session the
 * API is not called: it fails at once with INVALID_SESSION, as the server would.
 */
export async function authHeaders(): Promise<{ Authorization: string }> {
  const tokens = await getTokens();
  if (!tokens) {
    throw new AppError({ kind: 'http', code: 'INVALID_SESSION', status: 401, retryable: false });
  }
  return { Authorization: `Bearer ${tokens.accessToken}` };
}
