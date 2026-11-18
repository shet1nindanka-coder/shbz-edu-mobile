import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { POLLING, useApi, type RealtimeConnectionState, type UserRole } from '@/api';
import { cancelPendingRefreshes, refreshQueries } from '@/services/query';

import {
  dedupePrefixes,
  invalidationPrefixesAfterGap,
  invalidationPrefixesFor,
  type InvalidationPrefix,
} from './invalidation';
import { publishRealtimeState } from './realtime-state';

/**
 * One realtime subscription while a user is signed in and the app is in the foreground
 * (docs/spec/01-shell-auth.md §5.7, 90-addendum-6 §8.4). Events become query invalidations, coalesced for
 * 1500 ms like the site's page refresh. A refresh never cancels a read in flight: it is followed by one more
 * read instead (`refreshQueries`), so a steady stream of events cannot keep every read from landing. A refused
 * handshake is never shown; after a gap (background, refusal) everything is invalidated once because the
 * server has no replay.
 */
export function useRealtimeBridge(role: UserRole | null): void {
  const api = useApi();
  const queryClient = useQueryClient();
  const pending = useRef<InvalidationPrefix[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (role === null) return;

    const flush = () => {
      timer.current = null;
      const prefixes = dedupePrefixes(pending.current);
      pending.current = [];
      for (const prefix of prefixes) void refreshQueries(queryClient, { queryKey: prefix });
    };
    const schedule = (prefixes: readonly InvalidationPrefix[]) => {
      pending.current.push(...prefixes);
      timer.current ??= setTimeout(flush, POLLING.realtimeRefetchDebounceMs);
    };

    let unsubscribe: (() => void) | null = null;
    // Events were missed while the stream was refused or the app was in the background.
    let gap = false;

    const onState = (state: RealtimeConnectionState) => {
      publishRealtimeState(state);
      if (state.status === 'refused') gap = true;
      if (state.status === 'open' && gap) {
        gap = false;
        schedule(invalidationPrefixesAfterGap(role));
      }
    };
    const open = () => {
      if (unsubscribe) return;
      unsubscribe = api.shell.subscribeRealtime((event) => schedule(invalidationPrefixesFor(event, role)), { onState });
    };
    const close = () => {
      unsubscribe?.();
      unsubscribe = null;
    };

    if (AppState.currentState !== 'background') open();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (!unsubscribe) {
          // Back in the foreground: reconnect and refresh once (the "pending while hidden" refresh).
          schedule(invalidationPrefixesAfterGap(role));
          open();
        }
      } else if (next === 'background') {
        close();
      }
    });

    return () => {
      subscription.remove();
      close();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current = [];
      // Signed out or unmounted: the follow-up reads of refreshes still in flight are not wanted.
      cancelPendingRefreshes(queryClient);
      publishRealtimeState({ status: 'closed' });
    };
  }, [api, queryClient, role]);
}
