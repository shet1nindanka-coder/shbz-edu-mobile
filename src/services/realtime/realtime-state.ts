// The last connection state reported by the realtime stream. Nothing in the product UI shows it (a
// refused handshake is silent by design); the "Demo data" screen of mock builds reads it for testers.
import { useSyncExternalStore } from 'react';

import type { RealtimeConnectionState } from '@/api/types';

let current: RealtimeConnectionState = { status: 'closed' };
const listeners = new Set<() => void>();

export function publishRealtimeState(state: RealtimeConnectionState): void {
  current = state;
  listeners.forEach((listener) => listener());
}

export function getRealtimeState(): RealtimeConnectionState {
  return current;
}

export function useRealtimeState(): RealtimeConnectionState {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    getRealtimeState,
    getRealtimeState,
  );
}
