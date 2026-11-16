import type { Theme } from '@/theme';

import type { NoteTone, RankingTone, SegmentKey } from '../logic';

/**
 * Colours of the chart marks, taken from theme tokens (no chart colour is written in a screen).
 * 06 §1.6.a names the site's fixed marks: #36C77E (green), #F2A93B (yellow), #E5484D (red), #C7CAD0 (no
 * status). They are the tokens `chartGreen`, the calendar's amber mark, the danger solid and the
 * "outside the month" grey; the last two have their own dark-theme value, where the site keeps the
 * light one.
 */
export function segmentColor(key: SegmentKey, theme: Theme): string {
  switch (key) {
    case 'green':
      return theme.colors.chartGreen;
    case 'yellow':
      return theme.colors.calOkMark;
    case 'red':
      return theme.colors.dangerSolid;
    case 'empty':
      return theme.colors.calOutText;
  }
}

/** Fill of a ranking bar: the brand accent for engagement, emerald for mastery, danger for "needs help". */
export function rankingColor(tone: RankingTone, theme: Theme): string {
  switch (tone) {
    case 'brand':
      return theme.colors.accentSolid;
    case 'emerald':
      return theme.colors.chartGreen;
    case 'rose':
      return theme.colors.dangerSolid;
  }
}

/** Colour of a metric card's note line. */
export function noteColor(tone: NoteTone, theme: Theme): string {
  switch (tone) {
    case 'green':
      return theme.colors.greenText;
    case 'red':
      return theme.colors.redText;
    case 'accent':
      return theme.colors.accentSolid;
    case 'muted':
      return theme.colors.textMuted;
  }
}
