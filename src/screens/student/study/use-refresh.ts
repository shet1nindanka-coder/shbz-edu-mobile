import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state: the spinner is shown only for a refresh the user asked for, never for the
 * background refetches of the realtime bridge.
 */
export function useRefresh(refetch: () => Promise<unknown>): { refreshing: boolean; refresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, refresh };
}
