import type { Theme } from '@/theme';

import type { SegmentKey } from '../logic';

/**
 * Colours of the chart marks, taken from theme tokens (no chart colour is written in a screen;
 * docs/design/glass-over-paper.md §2). Three rules: the main series of a chart is the mint accent
 * gradient; the status colours are used for status data only; everything else is a neutral grey.
 */

/** A segment of «Как решаются выданные ДЗ»: status data, so the status colours; "not marked" is the neutral rest. */
export function segmentColor(key: SegmentKey, theme: Theme): string {
  switch (key) {
    case 'green':
      return theme.status.GREEN.solid;
    case 'yellow':
      return theme.status.YELLOW.solid;
    case 'red':
      return theme.status.RED.solid;
    case 'empty':
      return theme.colors.line2;
  }
}

/** The two stops of the accent gradient, for SVG marks (bars, the line, its area). */
export function accentStops(theme: Theme): { from: string; to: string } {
  const [from, to] = theme.gradients.accent.colors;
  return { from, to };
}
