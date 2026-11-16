// The one component that shows a problem statement or an answer (`conditionLatex` / `answerLatex`) —
// the app's `LatexAnswerPreview`. Pipeline: parse (pure) → no math: native text; math: KaTeX HTML built
// in JS and shown by `MathView` (WebView on native, DOM on web). docs/spec/09-data-i18n-math.md §4.
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { makeStyles } from '@/theme';

import { buildMathDocument, estimateMathHeight } from './math-html';
import { clampFontScale, MATH_CARD_PADDING, MATH_LINE_HEIGHT } from './math-metrics';
import { MathText } from './math-text';
import { MathView } from './math-view';

export type MathContentProps = {
  /** Raw `conditionLatex` / `answerLatex`: UTF-8 text with `$…$`, `$$…$$` and `\[…\]` formulas. */
  value: string;
  /** `card` (default) — the site's soft surface with padding; `bare` — content only. */
  variant?: 'card' | 'bare';
  /** Collapse to this many text lines (list rows). The content is cut, not scrolled. */
  maxCollapsedLines?: number;
  testID?: string;
};

/** Renders nothing for an empty value, exactly like the site. */
export function MathContent({ value, variant = 'card', maxCollapsedLines, testID }: MathContentProps) {
  const styles = useStyles();
  const window = useWindowDimensions();
  const fontScale = clampFontScale(window.fontScale);
  const document = useMemo(() => buildMathDocument(value), [value]);

  if (document.blocks.length === 0) return null;

  const lineHeight = MATH_LINE_HEIGHT * fontScale;
  const maxHeight = maxCollapsedLines && maxCollapsedLines > 0 ? Math.round(maxCollapsedLines * lineHeight) : null;
  // Screen readers get the source: typeset KaTeX is a pile of positioned glyphs.
  const label = value.trim();

  // The real width is only known after layout; the window width is close enough for a skeleton.
  const estimate = document.hasMath ? estimateMathHeight(document.blocks, window.width - 64, lineHeight) : 0;

  const content = document.hasMath ? (
    <MathView
      html={document.html}
      value={value}
      estimatedHeight={maxHeight === null ? estimate : Math.min(maxHeight, estimate)}
      maxHeight={maxHeight}
      fontScale={fontScale}
      accessibilityLabel={label}
      testID={variant === 'bare' ? testID : undefined}
    />
  ) : (
    <MathText
      blocks={document.blocks}
      maxLines={maxCollapsedLines && maxCollapsedLines > 0 ? maxCollapsedLines : undefined}
      maxHeight={maxHeight}
      accessibilityLabel={label}
      testID={variant === 'bare' ? testID : undefined}
    />
  );

  if (variant === 'bare') return content;
  return (
    <View testID={testID} style={styles.card}>
      {content}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // `rounded-2xl bg-[--theme-surface-soft] px-3 py-3` of the site; no hairline.
  card: {
    alignSelf: 'stretch',
    borderRadius: t.radii.lg,
    backgroundColor: t.colors.softBg,
    padding: MATH_CARD_PADDING,
  },
}));
