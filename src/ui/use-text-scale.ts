import { useWindowDimensions } from 'react-native';

import { effectiveFontScale, minimumFontScaleFor } from './font-scale';

export type TextScale = {
  /** The OS font scale as text is drawn (1 … `MAX_FONT_SCALE`). */
  scale: number;
  /** `minimumFontScale` of a one-line label that shrinks instead of being cut (with `adjustsFontSizeToFit`). */
  minimumFontScale: number;
  /** The text is drawn noticeably larger than the default (≥ 1.15): switch rows to their stacked form. */
  large: boolean;
};

/** The OS font scale, for layout decisions (compact labels, stacked rows) — see `widthForText`. */
export function useTextScale(): TextScale {
  const { fontScale } = useWindowDimensions();
  const scale = effectiveFontScale(fontScale);
  return { scale, minimumFontScale: minimumFontScaleFor(fontScale), large: scale >= 1.15 };
}
