// Pure helpers of the OS font scale. No React, no React Native: unit-tested in tests/.

/**
 * Text may grow with the OS font size, but not without bound: fixed-height controls would clip. The one
 * cap of the app — `Text` and every `TextInput` wrapper (typed text and placeholders) use it.
 */
export const MAX_FONT_SCALE = 1.3;

/** The scale text is actually drawn at: the OS scale, never below 1 for layout decisions, capped like `Text`. */
export function effectiveFontScale(fontScale: number): number {
  if (!Number.isFinite(fontScale)) return 1;
  return Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE);
}

/**
 * A width threshold measured at the default text size, grown with the text: a row that needs 360 pt for
 * «Системная · Светлая · Тёмная» at 1.0 needs 1.3 × 360 at 1.3. Compare the window (or a measured box) with
 * this, never with the bare number, when the decision depends on how much text fits.
 */
export function widthForText(widthAtDefaultSize: number, fontScale: number): number {
  return widthAtDefaultSize * effectiveFontScale(fontScale);
}

/**
 * `minimumFontScale` for a one-line label that shrinks instead of being cut (`adjustsFontSizeToFit`): a
 * label drawn larger than the default size may come back down to the default size; at the default size it
 * may give up a tenth. The scale is relative to the size the label is drawn at (iOS and Android alike).
 */
export function minimumFontScaleFor(fontScale: number): number {
  return Math.min(0.9, 1 / effectiveFontScale(fontScale));
}
