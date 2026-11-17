/**
 * Layout rule of the theory cards (02 S2): the title shares one row with «Открыть» only while the
 * title's column can hold its longest word. A narrower column would split the word in the middle
 * («Логарифмически / е», «исследовани / е») — text can break only between words, so the button then moves
 * under the title instead. Pure: the card applies the result as the title's flex basis in a wrapping row.
 */

/**
 * Width of one letter of the card-title type as a share of its font size. Measured on Montserrat Bold 17:
 * Cyrillic words run 10.9 – 11.7 px per letter («Последовательности» 196, «Логарифмические» 174,
 * «Параллелограммы» 175); 0.7 is the upper bound, so the estimate errs towards the wrapped layout.
 */
const LETTER_WIDTH_RATIO = 0.7;

/** The title never claims less than this beside the button (at font scale 1). */
const TITLE_MIN_WIDTH = 120;

/** Places where a line may break: spaces and the hyphens / slashes inside a compound word. */
const BREAK_POINTS = /[\s\-‐–—/]+/;

/** Number of letters in the longest unbreakable piece of a title. */
export function longestWordLength(title: string): number {
  return title
    .split(BREAK_POINTS)
    .reduce((longest, word) => Math.max(longest, Array.from(word).length), 0);
}

/**
 * The width the titles of a theory list need beside the button: enough for the longest word of ANY of
 * them, so that every card of the list takes the same layout (all in one row, or all with the button
 * underneath). `fontSize` is the card-title size, `fontScale` the OS text scale already capped by the app.
 */
export function theoryTitleBasis(titles: readonly string[], fontSize: number, fontScale: number): number {
  const scale = Math.max(fontScale, 1);
  const letters = titles.reduce((longest, title) => Math.max(longest, longestWordLength(title)), 0);
  return Math.ceil(Math.max(TITLE_MIN_WIDTH, letters * fontSize * LETTER_WIDTH_RATIO) * scale);
}
