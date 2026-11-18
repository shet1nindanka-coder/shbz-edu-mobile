// Which math blocks may hold a live WebView (docs/spec/09-data-i18n-math.md §4.3 step 7). Pure, no React,
// no React Native: unit-tested in tests/.
//
// WHY: every formula block on native is its own WebView with a ≈ 0.4 MB inline shell (≈ 20–40 ms to create,
// several MB each). A list cell that renders all its items at once (an expanded participant of the lesson
// board: 7–9 statements) is not virtualised below the cell, so a board kept 20+ WebViews alive while 3–4
// were on screen. The spec caps live WebViews (≈ 12) and keeps them for blocks near the viewport.

/** At most this many math WebViews are alive at once (spec: «cap live WebViews (≈ 12)»). */
export const MATH_LIVE_CAP = 12;
/** A block within this many screens of the viewport may get a WebView (spec: «viewport ± 1 screen»). */
export const MATH_NEAR_SCREENS = 1;
/** A live block keeps its WebView up to this many screens away (spec: «unmount beyond ± 3 screens»). */
export const MATH_FAR_SCREENS = 3;

export type MathSlotEntry = {
  /** Registration order: older blocks come first among equals. */
  readonly id: number;
  /**
   * Distance from the viewport in screens (0 = on screen), `Infinity` for a block that cannot be seen (its
   * screen is not the focused one, or it is not in the window), `null` while it has not been measured.
   */
  readonly distance: number | null;
  /** Holds a WebView now. */
  readonly live: boolean;
};

/**
 * Distance in screens between a block measured in the window (`y`, `height`, `width`) and a window of
 * `windowHeight`: 0 when any part of it is on screen. A block with no size is not in the window
 * (a detached scene): `Infinity`.
 */
export function viewportDistance(y: number, height: number, width: number, windowHeight: number): number {
  if (!Number.isFinite(y) || windowHeight <= 0 || (height <= 0 && width <= 0)) return Number.POSITIVE_INFINITY;
  if (y + height < 0) return -(y + height) / windowHeight;
  if (y > windowHeight) return (y - windowHeight) / windowHeight;
  return 0;
}

/**
 * The blocks that hold a WebView, at most `cap`:
 * 1. blocks within `MATH_NEAR_SCREENS` of the viewport, nearest first — so the formulas on screen always
 *    win a slot, evicting live blocks that are further away;
 * 2. live blocks within `MATH_FAR_SCREENS`, nearest first — a block scrolled a little away keeps its
 *    WebView while nothing nearer needs the slot (no reload when the user scrolls back);
 * 3. blocks not measured yet (the measurement is not available, e.g. right after mounting), live ones first,
 *    then in registration order.
 * Blocks further away, and blocks that cannot be seen, get none. While the whole set fits under the cap,
 * every block keeps its WebView: the cap only bounds the cost, it does not change what the user sees.
 */
export function allocateMathSlots(entries: readonly MathSlotEntry[], cap: number = MATH_LIVE_CAP): Set<number> {
  if (entries.length <= cap) return new Set(entries.map((entry) => entry.id));
  const tier = (entry: MathSlotEntry): number => {
    if (entry.distance === null) return 2;
    if (entry.distance <= MATH_NEAR_SCREENS) return 0;
    if (entry.live && entry.distance <= MATH_FAR_SCREENS) return 1;
    return 3;
  };
  const ranked = entries
    .map((entry) => ({ entry, tier: tier(entry) }))
    .filter((item) => item.tier < 3)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      const da = a.entry.distance ?? 0;
      const db = b.entry.distance ?? 0;
      if (da !== db) return da - db;
      if (a.entry.live !== b.entry.live) return a.entry.live ? -1 : 1;
      return a.entry.id - b.entry.id;
    });
  return new Set(ranked.slice(0, Math.max(0, cap)).map((item) => item.entry.id));
}
