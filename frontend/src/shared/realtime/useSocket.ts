import { useEffect, useSyncExternalStore } from 'react';

import {
  getSocketState,
  reconnect,
  releaseSocket,
  retainSocket,
  send,
  subscribe,
  subscribeToSocketState,
  type SocketState,
} from './socketClient';

export interface UseSocketResult extends SocketState {
  subscribe: typeof subscribe;
  send: typeof send;
  reconnect: typeof reconnect;
}

/**
 * The shared real-time connection (ADR-0030): it stays open while any component uses this hook.
 * Re-renders when the connection state changes.
 */
export function useSocket(): UseSocketResult {
  useEffect(() => {
    retainSocket();
    return releaseSocket;
  }, []);
  const { status, error } = useSyncExternalStore(subscribeToSocketState, getSocketState);
  return { status, error, subscribe, send, reconnect };
}
