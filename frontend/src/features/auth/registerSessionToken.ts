import { setAccessTokenProvider } from '../../shared/api/client';
import { getTokens } from './tokenStorage';

/** Makes the API client send the stored access token of the session. */
export function registerSessionToken(): void {
  setAccessTokenProvider(async () => (await getTokens())?.accessToken);
}
