import { AppError, isAppError } from '../../../shared/errors';
import { getTokens } from '../tokenStorage';
import { refreshSession } from './refreshToken';

/** Extra headers of a private request; also a plain record, as openapi-fetch expects. */
export type AuthHeaders = { Authorization: string } & Record<string, string>;

function noSession(): AppError {
  return new AppError({ kind: 'http', code: 'INVALID_SESSION', status: 401, retryable: false });
}

/**
 * Runs a request to a private endpoint with the access token of the session (TG-61).
 * If the server answers 401, the session is renewed once (POST /api/auth/refresh, shared
 * with the other renewals) and the request is sent again with the new token. Without a
 * session on the device it fails with INVALID_SESSION and the API is not called.
 */
export async function withSession<T>(request: (headers: AuthHeaders) => Promise<T>): Promise<T> {
  const tokens = await getTokens();
  if (!tokens) throw noSession();
  try {
    return await request({ Authorization: `Bearer ${tokens.accessToken}` });
  } catch (error) {
    if (!isAppError(error) || error.status !== 401) throw error;
    const renewed = await refreshSession();
    if (!renewed) throw error;
    return request({ Authorization: `Bearer ${renewed.access_token}` });
  }
}
