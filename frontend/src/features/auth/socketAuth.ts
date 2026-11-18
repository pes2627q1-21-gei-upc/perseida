import type { SocketAuth } from '../../shared/realtime';
import { refreshSession } from './api/refreshToken';
import { getTokens } from './tokenStorage';

/** The device session, as the shared real-time connection needs it (ADR-0030, TG-64). */
export const socketAuth: SocketAuth = {
  async getToken() {
    return (await getTokens())?.accessToken ?? null;
  },
  // A refreshSession() that cannot renew returns null instead of rejecting, so this resolves too:
  // the reconnection then finds no token (the session was cleared) or gets a second 4401, and
  // either way the connection ends with INVALID_SESSION.
  async refresh() {
    await refreshSession();
  },
};
