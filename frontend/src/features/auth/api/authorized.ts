import { AppError, isAppError } from '../../../shared/errors';
import { authHeaders } from '../authHeaders';
import { getTokens } from '../tokenStorage';
import { refreshSession } from './refreshToken';

/** Extra headers of a private request; also a plain record, as openapi-fetch expects. */
export type AuthHeaders = { Authorization: string } & Record<string, string>;

/** The session could not be renewed for a temporary reason (network, 5xx) but is still stored. */
export function sessionUnavailable(): AppError {
  return new AppError({ kind: 'http', code: 'SESSION_UNAVAILABLE', status: 503, retryable: true });
}

/**
 * Runs a request to a private endpoint with the access token of the session (TG-61). The
 * header comes from `authHeaders`: without a session on the device it fails with
 * INVALID_SESSION and the API is not called.
 *
 * If the server answers 401, the session is renewed once (POST /api/auth/refresh, shared
 * with the other renewals) and the request is sent again with the new token. When the
 * renewal fails, `refreshSession` only clears the stored session if the server rejected it:
 * then the 401 stands. If the session is still stored, the failure was temporary (network,
 * 5xx), so it ends as a retryable SESSION_UNAVAILABLE instead of an expired session.
 */
export async function withSession<T>(request: (headers: AuthHeaders) => Promise<T>): Promise<T> {
  const headers: AuthHeaders = { ...(await authHeaders()) };
  try {
    return await request(headers);
  } catch (error) {
    if (!isAppError(error) || error.status !== 401) throw error;
    const renewed = await refreshSession();
    if (renewed) return request({ Authorization: `Bearer ${renewed.access_token}` });
    if (await getTokens()) throw sessionUnavailable();
    throw error;
  }
}
