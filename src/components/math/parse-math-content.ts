// Pure parse step of the math pipeline (docs/spec/09-data-i18n-math.md §4.1, steps 1–7). It re-expresses
// the site's `LatexAnswerPreview` (components/latex-answer-preview.tsx) as data: the same regexes, the
// same order, the same edge cases — only the output is an AST instead of React elements. No React, no
// KaTeX: safe for unit tests and for the mock.
import { mergeSoftWrappedLines, splitLineIntoItems, splitMathIntoItems } from '@/domain/latex-line-items';

/** A run inside a line: literal text or an inline `$…$` formula (`tex` is the part between the dollars). */
export type MathInline = { type: 'text'; text: string } | { type: 'math'; tex: string };

export type MathNode =
  /** One line of prose, possibly with inline formulas. */
  | { type: 'paragraph'; inline: MathInline[] }
  /** A line with labels «а) … б) …»: a wrapping row of unbreakable items. */
  | { type: 'items'; items: MathInline[][] }
  /** `$$…$$` or a whole-block `\[…\]`: a display formula in a horizontally scrollable box. */
  | { type: 'displayMath'; tex: string }
  /** A display formula with top-level labels: each item is rendered inline with `\displaystyle`. */
  | { type: 'displayItems'; items: string[] };

/** Blocks are separated by a blank line (16 px on the site); nodes inside a block sit 8 px apart. */
export type MathBlock = { nodes: MathNode[] };

const INLINE_MATH_SPLIT = /(\$[^$]+\$)/g;
const DISPLAY_MATH_SPLIT = /(\$\$[\s\S]+?\$\$)/g;

/** Step 6: `$…$` runs (no `$` inside, no escaping of `\$`, longer than two characters); the rest is text. */
export function parseInlineLine(line: string): MathInline[] {
  return line
    .split(INLINE_MATH_SPLIT)
    .filter(Boolean)
    .map((part): MathInline => {
      if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        return { type: 'math', tex: part.slice(1, -1) };
      }
      return { type: 'text', text: part };
    });
}

/** Step 7: labelled display formulas become a row of items, everything else stays one formula. */
function parseDisplayMath(math: string): MathNode {
  const { items, labeled } = splitMathIntoItems(math);
  if (labeled && items.length > 1) {
    return { type: 'displayItems', items };
  }
  return { type: 'displayMath', tex: math };
}

/** Step 5: a text segment → one node per non-empty trimmed line. */
function parseTextLines(text: string): MathNode[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): MathNode => {
      const { items, labeled } = splitLineIntoItems(line);
      if (labeled) {
        return { type: 'items', items: items.map(parseInlineLine) };
      }
      return { type: 'paragraph', inline: parseInlineLine(line) };
    });
}

/**
 * `conditionLatex` / `answerLatex` → blocks. An empty or whitespace-only value yields `[]` (render
 * nothing). Never throws: invalid TeX is still a math node, the error surfaces at render time.
 */
export function parseMathContent(value: string): MathBlock[] {
  // Steps 1–2: soft-wrapped lines are merged first, then the text is cut into blocks on blank lines.
  const blocks = mergeSoftWrappedLines(value)
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block): MathBlock => {
    // Step 3: `\[…\]` is supported only as a whole block.
    if (block.startsWith('\\[') && block.endsWith('\\]') && block.length > 4) {
      return { nodes: [parseDisplayMath(block.slice(2, -2).trim())] };
    }

    // Step 4: `$$…$$` may be glued to text and span lines — cut the block into segments.
    const segments = block.split(DISPLAY_MATH_SPLIT).filter((segment) => segment.trim().length > 0);
    const nodes: MathNode[] = [];
    for (const segment of segments) {
      if (segment.startsWith('$$') && segment.endsWith('$$') && segment.length > 4) {
        nodes.push(parseDisplayMath(segment.slice(2, -2).trim()));
      } else {
        nodes.push(...parseTextLines(segment));
      }
    }
    return { nodes };
  });
}

function inlineHasMath(inline: MathInline[]): boolean {
  return inline.some((part) => part.type === 'math');
}

/** True when at least one formula has to be typeset — otherwise native text is enough (fast path). */
export function hasMath(blocks: MathBlock[]): boolean {
  return blocks.some((block) =>
    block.nodes.some((node) => {
      switch (node.type) {
        case 'paragraph':
          return inlineHasMath(node.inline);
        case 'items':
          return node.items.some(inlineHasMath);
        default:
          return true;
      }
    }),
  );
}

/** Plain text of an inline run list; only meaningful on the fast path (no math nodes). */
export function inlineText(inline: MathInline[]): string {
  return inline.map((part) => (part.type === 'text' ? part.text : `$${part.tex}$`)).join('');
}
