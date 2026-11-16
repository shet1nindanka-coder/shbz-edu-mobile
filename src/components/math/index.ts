// Math rendering (docs/spec/09-data-i18n-math.md §4). Screens use `MathContent` / `MathPreview`; the
// pure pieces are exported for tests and for code that needs to know whether a statement has formulas.
export { MathContent, type MathContentProps } from './math-content';
export { MathPreview, type MathPreviewProps } from './math-preview';
export {
  hasMath,
  parseInlineLine,
  parseMathContent,
  type MathBlock,
  type MathInline,
  type MathNode,
} from './parse-math-content';
export { buildMathDocument, renderMathHtml, type MathDocument } from './math-html';
