import { useEffect, useSyncExternalStore } from 'react';

import {
  getSocketState,
  reconnect,
  releaseSocket,
  retainSocket,
  send,
  subscribe,
  subscribeToSocketState,
  type SocketAuth,
  type SocketState,
} from './socketClient';

export interface UseSocketResult extends SocketState {
  subscribe: typeof subscribe;
  send: typeof send;
  reconnect: typeof reconnect;
}

/**
 * The shared real-time connection (ADR-0030): it stays open while any component uses this hook.
 * The first consumer's `auth` authenticates it; pass a stable object (e.g. a module constant).
 * Re-renders when the connection state changes.
 */
export function useSocket(auth: SocketAuth): UseSocketResult {
  useEffect(() => {
    retainSocket(auth);
    return releaseSocket;
  }, [auth]);
  const { status, error } = useSyncExternalStore(subscribeToSocketState, getSocketState);
  return { status, error, subscribe, send, reconnect };
}
