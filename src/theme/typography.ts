// Typography scale (docs/spec/08-design-system.md §2). The UI family is Montserrat; React Native cannot
// synthesise weights for a custom family, so there is one `fontFamily` per weight and `fontWeight` is
// never set together with it.
import { Platform, type TextStyle } from 'react-native';

export const fonts = {
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semibold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
  extrabold: 'Montserrat_800ExtraBold',
  /** Logo only. */
  black: 'Montserrat_900Black',
  /** The site declares JetBrains Mono but never loads it, so the system monospace is what renders. */
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, Consolas, monospace' }),
} as const;

export type TextStyleToken = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'textTransform'
> & { fontFamily: string; fontSize: number };

// Line heights: the phone mapping of spec §2.3. Single-line control labels (buttons, tabs, chips) use the
// font's natural line box (~1.3) instead of the site's `line-height: 1`, which clips Cyrillic descenders
// on Android; the control height is fixed, so the geometry is unchanged.
export const typography = {
  display: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -1 },
  loginTitle: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -0.8 },
  pageTitle: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 30, letterSpacing: -0.8 },
  dialogTitle: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 32, letterSpacing: -0.5 },
  streakHeadline: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 34, letterSpacing: -0.5 },
  metric: { fontFamily: fonts.extrabold, fontSize: 23, lineHeight: 30 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 },
  calendarMonth: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  miniStat: { fontFamily: fonts.extrabold, fontSize: 19, lineHeight: 24, letterSpacing: -0.2 },
  numberTitle: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 28 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23 },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 32 },
  errorTitle: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 32 },
  input: { fontFamily: fonts.regular, fontSize: 16 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  bodyBold: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  smallMedium: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  smallBold: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
  smallExtra: { fontFamily: fonts.extrabold, fontSize: 14, lineHeight: 20 },
  button: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18 },
  buttonSoft: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
  buttonLg: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  buttonLgSoft: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  buttonSm: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17 },
  link: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  tab: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  segment: { fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 18 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  meta: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  chip: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 19 },
  badgeMuted: { fontFamily: fonts.semibold, fontSize: 12.5, lineHeight: 19 },
  badge: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  badgeStrong: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  captionMedium: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  captionStrong: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
  captionBold: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 19 },
  kicker: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 18, letterSpacing: 1.6, textTransform: 'uppercase' },
  kickerSm: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 16, letterSpacing: 1.2, textTransform: 'uppercase' },
  cardKicker: { fontFamily: fonts.bold, fontSize: 10.5, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' },
  statLabel: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase' },
  avatar: { fontFamily: fonts.extrabold, fontSize: 14, lineHeight: 18, letterSpacing: 0.5 },
  counter: { fontFamily: fonts.extrabold, fontSize: 10.5, lineHeight: 14 },
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20 },
} as const satisfies Record<string, TextStyleToken>;

export type TextVariant = keyof typeof typography;
