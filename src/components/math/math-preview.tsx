// Live preview for the condition / answer editors (docs/spec/09-data-i18n-math.md §4.3 step 9): the
// same renderer, fed with a debounced value so KaTeX does not run on every keystroke.
import { useEffect, useState } from 'react';

import { MathContent, type MathContentProps } from './math-content';

export type MathPreviewProps = Omit<MathContentProps, 'maxCollapsedLines'> & {
  /** Quiet time before the preview follows the input; 150–250 ms per the spec. Default 200. */
  debounceMs?: number;
};

export function MathPreview({ value, debounceMs = 200, ...rest }: MathPreviewProps) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setShown(value), debounceMs);
    return () => clearTimeout(timer);
  }, [value, debounceMs]);

  return <MathContent value={shown} {...rest} />;
}
