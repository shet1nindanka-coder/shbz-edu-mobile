// AST → HTML (docs/spec/09-data-i18n-math.md §4.3 step 3). KaTeX runs in the JS thread — it needs no DOM
// — and produces exactly the markup the site gets from react-katex; this module adds the wrappers of
// `LatexAnswerPreview` (paragraphs, item rows, scrollable display boxes) and the site's error markup.
// Pure: no React, no React Native. The matching CSS is in `math-styles.ts`.
import katex from 'katex';

import { LruCache } from './lru-cache';
import { MATH_BLOCK_GAP, MATH_ITEM_GAP_Y, MATH_ITEM_PADDING_Y, MATH_NODE_GAP } from './math-metrics';
import { hasMath, parseMathContent, type MathBlock, type MathInline, type MathNode } from './parse-math-content';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Every text node is user-authored: escape it before it reaches `innerHTML`. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'Error';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One formula → KaTeX HTML, or the site's error markup when the TeX is invalid: an inline chip with
 * only the error name, a display block with "name: message". `throwOnError: true` matches react-katex
 * with a `renderError` callback; `trust` stays off (the TeX is user-authored). `output: "html"` drops
 * the MathML half, which only serves screen readers — the raw TeX is the accessibility label instead.
 * `strict: "ignore"` renders the same markup as the default "warn" without flooding the console.
 */
export function renderTex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: true, output: 'html', strict: 'ignore' });
  } catch (error) {
    // The site lets anything but ParseError / TypeError reach its error boundary; one broken formula
    // must not take a whole phone screen down, so every failure becomes the error markup here.
    if (displayMode) {
      return `<code class="mc-error mc-error-block">${escapeHtml(`${errorName(error)}: ${errorMessage(error)}`)}</code>`;
    }
    return `<code class="mc-error">${escapeHtml(errorName(error))}</code>`;
  }
}

function renderInline(inline: MathInline[]): string {
  return inline.map((part) => (part.type === 'math' ? renderTex(part.tex, false) : escapeHtml(part.text))).join('');
}

function renderNode(node: MathNode): string {
  switch (node.type) {
    case 'paragraph':
      return `<p class="mc-p">${renderInline(node.inline)}</p>`;
    case 'items':
      return `<div class="mc-row mc-row-text">${node.items
        .map((item) => `<span class="mc-item">${renderInline(item)}</span>`)
        .join('')}</div>`;
    case 'displayItems':
      return `<div class="mc-row mc-row-math">${node.items
        .map((item) => `<span class="mc-item">${renderTex(`\\displaystyle ${item}`, false)}</span>`)
        .join('')}</div>`;
    case 'displayMath':
      return `<div class="mc-display">${renderTex(node.tex, true)}</div>`;
  }
}

/** Blocks → the inner HTML of a `.shbz-math` root. */
export function renderMathHtml(blocks: MathBlock[]): string {
  return blocks.map((block) => `<div class="mc-block">${block.nodes.map(renderNode).join('')}</div>`).join('');
}

export type MathDocument = {
  blocks: MathBlock[];
  /** False → no formula anywhere: render with native text, `html` is empty. */
  hasMath: boolean;
  html: string;
};

// The same statement is rendered again and again (list rows, detail screen, lesson board), and KaTeX
// costs a few milliseconds per formula — keep the last results. HTML does not depend on theme or width.
const documents = new LruCache<string, MathDocument>(500);

/** `value` → parsed blocks and, when there is math, the ready HTML. Memoised by value. */
export function buildMathDocument(value: string): MathDocument {
  const cached = documents.get(value);
  if (cached) return cached;
  const blocks = parseMathContent(value);
  const math = hasMath(blocks);
  const document: MathDocument = { blocks, hasMath: math, html: math ? renderMathHtml(blocks) : '' };
  documents.set(value, document);
  return document;
}

/**
 * Rough height of a block before it has been measured — the skeleton shown until the WebView reports.
 * `width` is the content width in px; the estimate only has to be in the right ballpark.
 */
export function estimateMathHeight(blocks: MathBlock[], width: number, lineHeight: number): number {
  const charsPerLine = Math.max(12, Math.floor(width / 8));
  const inlineLength = (inline: MathInline[]) =>
    inline.reduce((sum, part) => sum + (part.type === 'text' ? part.text.length : Math.ceil(part.tex.length * 0.6)), 0);
  let height = 0;
  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) height += MATH_BLOCK_GAP;
    block.nodes.forEach((node, nodeIndex) => {
      if (nodeIndex > 0) height += MATH_NODE_GAP;
      switch (node.type) {
        case 'paragraph':
          height += lineHeight * Math.max(1, Math.ceil(inlineLength(node.inline) / charsPerLine));
          break;
        case 'items':
          height +=
            (lineHeight + MATH_ITEM_PADDING_Y * 2) *
            Math.max(1, Math.ceil(node.items.reduce((sum, item) => sum + inlineLength(item) + 4, 0) / charsPerLine));
          break;
        case 'displayItems':
          height += (lineHeight + MATH_ITEM_GAP_Y) * Math.max(1, Math.ceil(node.items.length / 2));
          break;
        case 'displayMath':
          height += lineHeight * 2 + MATH_ITEM_GAP_Y;
          break;
      }
    });
  });
  return height;
}
