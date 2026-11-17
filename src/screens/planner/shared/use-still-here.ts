import { useCallback, useEffect, useRef } from 'react';

import { useScreenFocused } from '@/navigation';

/**
 * Whether the screen that called the hook is still mounted and on top. A mutation's hook-level `onSuccess`
 * runs even after the screen has been left (TanStack keeps those callbacks on the mutation itself), and a
 * `navigation.replace` / `open` issued then would act on whatever screen the user has moved to — replacing
 * the student card they went back to, for example. Navigation that follows a request asks this first;
 * cache invalidation does not.
 */
export function useStillHere(): () => boolean {
  const focused = useScreenFocused();
  const state = useRef({ mounted: false, focused });
  useEffect(() => {
    state.current.focused = focused;
  }, [focused]);
  useEffect(() => {
    const current = state.current;
    current.mounted = true;
    return () => {
      current.mounted = false;
    };
  }, []);
  return useCallback(() => state.current.mounted && state.current.focused, []);
}
