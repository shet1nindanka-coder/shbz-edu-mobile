import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme, type ColorToken, type TextVariant } from '@/theme';

export type TextProps = RNTextProps & {
  /** Typography role; see `typography` in the theme. Default `body`. */
  variant?: TextVariant;
  /** Colour token. Each variant has a sensible default (titles strong, captions muted, kickers kicker). */
  color?: ColorToken;
  align?: TextStyle['textAlign'];
  /** Tabular digits — use for every counter and metric. */
  tabular?: boolean;
};

const STRONG: ReadonlySet<TextVariant> = new Set<TextVariant>([
  'display',
  'loginTitle',
  'pageTitle',
  'dialogTitle',
  'streakHeadline',
  'metric',
  'sectionTitle',
  'calendarMonth',
  'miniStat',
  'numberTitle',
  'cardTitle',
  'emptyTitle',
  'errorTitle',
  'input',
  'bodyStrong',
  'bodyBold',
  'smallStrong',
  'smallBold',
  'smallExtra',
  'mono',
]);
const KICKER: ReadonlySet<TextVariant> = new Set<TextVariant>([
  'kicker',
  'kickerSm',
  'cardKicker',
  'statLabel',
  'hint',
  'badgeMuted',
]);
const MUTED: ReadonlySet<TextVariant> = new Set<TextVariant>(['caption', 'captionMedium', 'meta']);

function defaultColor(variant: TextVariant): ColorToken {
  if (STRONG.has(variant)) return 'textStrong';
  if (KICKER.has(variant)) return 'kicker';
  if (MUTED.has(variant)) return 'textMuted';
  return 'label';
}

/**
 * Text may grow with the OS font size, but not without bound: fixed-height controls would clip. The one
 * cap of the app — `Text` and every `TextInput` wrapper (typed text and placeholders) use it.
 */
export const MAX_FONT_SCALE = 1.3;

/** The app's text primitive: Montserrat, a typography role and a colour token. */
export function Text({ variant = 'body', color, align, tabular, style, ...rest }: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...rest}
      style={[
        theme.typography[variant],
        { color: theme.colors[color ?? defaultColor(variant)] },
        align ? { textAlign: align } : null,
        tabular ? TABULAR : null,
        style,
      ]}
    />
  );
}

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };
