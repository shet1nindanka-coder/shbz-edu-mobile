// Native runtime of the live-WebView cap (`math-slots.ts`): a module-level registry of the mounted math
// blocks, a measuring pass that ranks them by their distance from the viewport, and the hook a block uses
// to know whether it may hold a WebView now.
import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Dimensions } from 'react-native';

import { allocateMathSlots, MATH_LIVE_CAP, viewportDistance, type MathSlotEntry } from './math-slots';

/** Reads the block's place in the window: `callback(x, y, width, height)`; may answer later or never. */
export type MathMeasure = (callback: (x: number, y: number, width: number, height: number) => void) => void;

type Block = {
  id: number;
  focused: boolean;
  distance: number | null;
  live: boolean;
  measure: MathMeasure;
  listeners: Set<() => void>;
};

/** How often the blocks are measured again while there are more of them than slots (scrolling). */
const POLL_MS = 400;

const blocks = new Map<number, Block>();
let nextId = 1;
let poll: ReturnType<typeof setInterval> | null = null;
let passQueued: ReturnType<typeof setTimeout> | null = null;

function liveCount(): number {
  let count = 0;
  for (const block of blocks.values()) if (block.live) count += 1;
  return count;
}

function setLive(block: Block, live: boolean): void {
  if (block.live === live) return;
  block.live = live;
  for (const listener of block.listeners) listener();
}

function pass(): void {
  passQueued = null;
  if (blocks.size <= MATH_LIVE_CAP) {
    // Everything fits: no measuring, no polling.
    if (poll !== null) {
      clearInterval(poll);
      poll = null;
    }
    for (const block of blocks.values()) setLive(block, true);
    return;
  }
  if (poll === null) poll = setInterval(tick, POLL_MS);
  const windowHeight = Dimensions.get('window').height;
  for (const block of blocks.values()) {
    if (!block.focused) {
      block.distance = Number.POSITIVE_INFINITY;
      continue;
    }
    // Synchronous under the new architecture; an answer that comes later is used by the next pass.
    block.measure((_x, y, width, height) => {
      block.distance = viewportDistance(y, height, width, windowHeight);
    });
  }
  const entries: MathSlotEntry[] = [...blocks.values()].map(({ id, distance, live }) => ({ id, distance, live }));
  const granted = allocateMathSlots(entries);
  // Release first, then grant: the cap holds at every moment.
  for (const block of blocks.values()) if (!granted.has(block.id)) setLive(block, false);
  for (const block of blocks.values()) if (granted.has(block.id)) setLive(block, true);
}

function tick(): void {
  // Nothing scrolls in the background; the first pass after the return catches up.
  const state = AppState.currentState;
  if (state === 'background' || state === 'inactive') return;
  pass();
}

function queuePass(): void {
  if (passQueued !== null) return;
  passQueued = setTimeout(pass, 0);
}

/** The number of math blocks that hold a WebView now (tests, diagnostics). */
export function liveMathViews(): number {
  return liveCount();
}

/**
 * Whether this math block may hold a WebView now. `focused` is false while its screen is not the focused
 * one (it cannot be seen: it yields its slot first); `measure` reads its place in the window.
 *
 * The first render shows the placeholder; the block registers right after it and takes a free slot at once
 * (the placeholder is on screen for one frame, which the skeleton shows anyway until the formula has been
 * measured). Deciding before registration would let a whole batch of new blocks (an expanded card) create
 * its WebViews and drop most of them again in the next commit. Beyond the cap the blocks nearest to the
 * viewport win (`allocateMathSlots`), re-ranked while the user scrolls.
 */
export function useMathSlot(focused: boolean, measure: MathMeasure): boolean {
  const [id] = useState(() => nextId++);
  // React subscribes after the layout effect below has registered the block.
  const subscribe = useCallback(
    (listener: () => void) => {
      const block = blocks.get(id);
      if (!block) return () => undefined;
      block.listeners.add(listener);
      return () => {
        block.listeners.delete(listener);
      };
    },
    [id],
  );
  const read = useCallback(() => blocks.get(id)?.live ?? false, [id]);

  useLayoutEffect(() => {
    // In tree order (layout effects run top to bottom among siblings): the first blocks of a batch get the
    // free slots, the measuring pass then re-ranks them by distance.
    blocks.set(id, { id, focused: true, distance: null, live: liveCount() < MATH_LIVE_CAP, measure, listeners: new Set() });
    queuePass();
    return () => {
      blocks.delete(id);
      queuePass();
    };
    // `measure` and `focused` are kept up to date below; the registration lives as long as the block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useLayoutEffect(() => {
    const block = blocks.get(id);
    if (!block) return;
    block.measure = measure;
    if (block.focused === focused) return;
    block.focused = focused;
    queuePass();
  }, [id, focused, measure]);

  return useSyncExternalStore(subscribe, read, read);
}
