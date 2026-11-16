// CSS of a math block, shared by the native WebView shell and the web renderer so both paint the same
// thing (docs/spec/09-data-i18n-math.md §4.1 "Container styling" and "CSS overrides"). Everything that
// depends on the theme or the OS font scale is a CSS variable set on the `.shbz-math` root:
//
//   --mc-text         text colour            (site: --theme-text-default)
//   --mc-danger-soft  error chip background  (site: --theme-danger-soft)
//   --mc-danger-text  error chip text        (site: --theme-danger-text)
//   --mc-font-family  prose font
//   --mc-font-size    14px × font scale
//   --mc-scale        font scale, multiplies the gaps (the site sizes them in rem)
//
// Rules are scoped under `.shbz-math`: on web they are injected into the app's own document.
import {
  MATH_BLOCK_GAP,
  MATH_FONT_SIZE,
  MATH_ITEM_GAP_X,
  MATH_ITEM_GAP_Y,
  MATH_ITEM_PADDING_Y,
  MATH_LINE_HEIGHT,
  MATH_NODE_GAP,
} from './math-metrics';

const scaled = (px: number) => `calc(var(--mc-scale, 1) * ${px}px)`;

export const MATH_ROOT_CLASS = 'shbz-math';

export const MATH_CONTENT_CSS = `
.shbz-math{box-sizing:border-box;min-width:0;max-width:100%;margin:0;color:var(--mc-text);font-family:var(--mc-font-family,sans-serif);font-size:var(--mc-font-size,${MATH_FONT_SIZE}px);font-weight:400;line-height:${MATH_LINE_HEIGHT / MATH_FONT_SIZE};overflow-wrap:break-word;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.shbz-math *{box-sizing:border-box}
.shbz-math .mc-block+.mc-block{margin-top:${scaled(MATH_BLOCK_GAP)}}
.shbz-math .mc-block>*+*{margin-top:${scaled(MATH_NODE_GAP)}}
.shbz-math .mc-p{margin:0}
.shbz-math .mc-row{display:flex;flex-wrap:wrap;min-width:0;max-width:100%;column-gap:${scaled(MATH_ITEM_GAP_X)};row-gap:${scaled(MATH_ITEM_GAP_Y)}}
.shbz-math .mc-row-text{align-items:baseline}
.shbz-math .mc-row-math{align-items:center}
.shbz-math .mc-item{display:inline-block;max-width:100%;padding:${scaled(MATH_ITEM_PADDING_Y)} 0}
.shbz-math .mc-display{min-width:0;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
.shbz-math .mc-error{border-radius:8px;padding:2px 4px;background:var(--mc-danger-soft);color:var(--mc-danger-text);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:1em}
.shbz-math .mc-error-block{display:block;padding:8px 12px;white-space:pre-wrap}
.shbz-math .katex{white-space:normal}
.shbz-math .katex .base{white-space:nowrap}
.shbz-math .katex-display>.katex{white-space:normal;text-align:left}
`.trim();

export type MathCssVars = {
  '--mc-text': string;
  '--mc-danger-soft': string;
  '--mc-danger-text': string;
  '--mc-font-family': string;
  '--mc-font-size': string;
  '--mc-scale': string;
};

export function buildMathCssVars(input: {
  text: string;
  dangerSoft: string;
  dangerText: string;
  fontFamily: string;
  fontScale: number;
}): MathCssVars {
  // Two decimals keep the string stable across renders (it is part of effect dependencies).
  const scale = Math.round(input.fontScale * 100) / 100;
  return {
    '--mc-text': input.text,
    '--mc-danger-soft': input.dangerSoft,
    '--mc-danger-text': input.dangerText,
    '--mc-font-family': input.fontFamily,
    '--mc-font-size': `${Math.round(MATH_FONT_SIZE * scale * 100) / 100}px`,
    '--mc-scale': String(scale),
  };
}
