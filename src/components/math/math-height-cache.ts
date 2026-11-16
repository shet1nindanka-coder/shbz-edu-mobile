// Measured heights of math blocks (docs/spec/09-data-i18n-math.md §4.3 step 5). A row that remounts in
// a recycling list starts with the height it had last time, so the list does not jump while the WebView
// loads. Module-level on purpose: the cache outlives every component instance.
import { LruCache } from './lru-cache';

export type MathHeightKeyInput = {
  value: string;
  /** Content width in px (rounded): wrapping — and so the height — depends on it. */
  width: number;
  fontScale: number;
  theme: string;
  /** Collapsed-height limit in px, when the block is clamped. */
  maxHeight?: number | null;
};

/** FNV-1a, 32 bit: short, stable and good enough to tell statements apart. */
export function hashString(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** `hash(value) | width | fontScale | theme` (+ the clamp, when there is one). */
export function mathHeightKey({ value, width, fontScale, theme, maxHeight }: MathHeightKeyInput): string {
  // The length rides along with the hash: two statements colliding on both is not a practical concern.
  const base = `${hashString(value)}.${value.length}|${Math.round(width)}|${Math.round(fontScale * 100)}|${theme}`;
  return maxHeight ? `${base}|${Math.round(maxHeight)}` : base;
}

const heights = new LruCache<string, number>(2000);

export function getCachedMathHeight(key: string): number | undefined {
  return heights.get(key);
}

export function setCachedMathHeight(key: string, height: number): void {
  if (Number.isFinite(height) && height > 0) heights.set(key, height);
}

export function clearMathHeightCache(): void {
  heights.clear();
}
