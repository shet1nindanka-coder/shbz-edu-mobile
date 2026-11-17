import { useEffect, useRef } from 'react';
import { Platform, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/** A scroll position counts once it has stood this long: the reset that comes with hiding never does. */
const COMMIT_DELAY_MS = 120;
/** How long to wait for the rows to come back before restoring whatever can be restored. */
const RESTORE_TIMEOUT_MS = 600;

type Memory = {
  /** The last position the user left the list at. */
  offset: number;
  viewport: number;
  content: number;
  hidden: boolean;
  /** The position to put back once the list is tall enough again. */
  pending: number | null;
  commit: ReturnType<typeof setTimeout> | null;
  fallback: ReturnType<typeof setTimeout> | null;
};

export type ListScrollMemory = {
  /** Spread on the view that wraps the list (it must fill the screen: `flex: 1`). */
  onLayout: ((event: LayoutChangeEvent) => void) | undefined;
  /** Spread on the list itself. */
  listProps: {
    onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onContentSizeChange?: (width: number, height: number) => void;
    scrollEventThrottle?: number;
  };
};

/**
 * Web only. A screen covered by another one is taken out of layout there (`display: none`); a virtualised
 * list then collapses to nothing and comes back at the top. This remembers where the user was and puts
 * the list back once it is laid out and tall enough again. Native keeps covered screens laid out, so the
 * hook hands out nothing there.
 */
export function useListScrollMemory(scrollTo: (offset: number) => void): ListScrollMemory {
  const memory = useRef<Memory>({ offset: 0, viewport: 0, content: 0, hidden: false, pending: null, commit: null, fallback: null });
  const scrollToRef = useRef(scrollTo);
  useEffect(() => {
    scrollToRef.current = scrollTo;
  });
  useEffect(
    () => () => {
      const { commit, fallback } = memory.current;
      if (commit) clearTimeout(commit);
      if (fallback) clearTimeout(fallback);
    },
    [],
  );

  if (Platform.OS !== 'web') return { onLayout: undefined, listProps: {} };

  const cancelCommit = () => {
    const state = memory.current;
    if (state.commit) clearTimeout(state.commit);
    state.commit = null;
  };

  const restore = (force: boolean) => {
    const state = memory.current;
    if (state.pending === null || state.hidden) return;
    if (!force && state.content < state.pending + state.viewport) return;
    const saved = state.pending;
    state.pending = null;
    if (state.fallback) clearTimeout(state.fallback);
    state.fallback = null;
    scrollToRef.current(saved);
  };

  return {
    onLayout: (event) => {
      const state = memory.current;
      const height = event.nativeEvent.layout.height;
      if (height <= 0) {
        // Hidden: the jump to the top reported a moment ago was the collapse, not the user.
        state.hidden = true;
        cancelCommit();
        return;
      }
      state.viewport = height;
      if (!state.hidden) return;
      state.hidden = false;
      if (state.offset <= 0) return;
      state.pending = state.offset;
      restore(false);
      if (state.pending !== null) state.fallback = setTimeout(() => restore(true), RESTORE_TIMEOUT_MS);
    },
    listProps: {
      scrollEventThrottle: 64,
      onScroll: (event) => {
        const state = memory.current;
        if (state.hidden || state.pending !== null || event.nativeEvent.layoutMeasurement.height <= 0) return;
        const next = event.nativeEvent.contentOffset.y;
        cancelCommit();
        state.commit = setTimeout(() => {
          state.offset = next;
          state.commit = null;
        }, COMMIT_DELAY_MS);
      },
      onContentSizeChange: (_width, height) => {
        const state = memory.current;
        state.content = height;
        if (height <= 0) cancelCommit();
        restore(false);
      },
    },
  };
}
