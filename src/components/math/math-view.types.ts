/** Props shared by the native (WebView) and web (DOM) renderers of a block that contains formulas. */
export type MathViewProps = {
  /** Inner HTML of the `.shbz-math` root, produced by `renderMathHtml`. */
  html: string;
  /** The raw statement: identity of the content (height cache, line-break re-runs). */
  value: string;
  /** Height in px to reserve before the first measurement. */
  estimatedHeight: number;
  /** Collapsed-height limit in px (already multiplied by the font scale), or null. */
  maxHeight: number | null;
  /** OS font scale, already capped. */
  fontScale: number;
  /** Read by screen readers instead of the typeset formula: the raw TeX / text. */
  accessibilityLabel: string;
  testID?: string;
};
