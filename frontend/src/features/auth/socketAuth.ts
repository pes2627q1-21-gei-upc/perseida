import type { SocketAuth } from '../../shared/realtime';
import { sessionUnavailable } from './api/authorized';
import { refreshSession } from './api/refreshToken';
import { getTokens } from './tokenStorage';

/** The device session, as the shared real-time connection needs it (ADR-0030, TG-64). */
export const socketAuth: SocketAuth = {
  async getToken() {
    return (await getTokens())?.accessToken ?? null;
  },
  // Same rule as withSession: refreshSession() only clears the session when the server rejected
  // it. Then this resolves and the reconnection finds no token (INVALID_SESSION); if the session
  // is still stored, the failure was temporary and it rejects with SESSION_UNAVAILABLE.
  async refresh() {
    if (await refreshSession()) return;
    if (await getTokens()) throw sessionUnavailable();
  },
};
