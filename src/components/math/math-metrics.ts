// Content metrics of a math block — the site's `LatexAnswerPreview` wrapper (`text-sm leading-7`, 16 px
// between blocks, 8 px between lines, item rows `gap: 12px 28px`, items `padding: 2px 0`, card padding
// 12): docs/spec/09-data-i18n-math.md §4.1. They belong to the content subsystem, not to the theme
// (docs/spec/08-design-system.md §2), so they live here; colours and radii still come from the theme.
export const MATH_FONT_SIZE = 14;
export const MATH_LINE_HEIGHT = 28;
export const MATH_BLOCK_GAP = 16;
export const MATH_NODE_GAP = 8;
export const MATH_ITEM_GAP_X = 28;
export const MATH_ITEM_GAP_Y = 12;
export const MATH_ITEM_PADDING_Y = 2;
export const MATH_CARD_PADDING = 12;

/** The OS font scale is honoured up to this factor — the same cap as the `Text` primitive. */
export const MATH_MAX_FONT_SCALE = 1.3;

export function clampFontScale(fontScale: number): number {
  if (!Number.isFinite(fontScale) || fontScale <= 0) return 1;
  return Math.min(fontScale, MATH_MAX_FONT_SCALE);
}
