// Typography scale of the «Стекло над листом» design (docs/design/glass-over-paper.md §3). The UI family
// is Onest; React Native cannot synthesise weights for a custom family, so there is one `fontFamily` per
// weight and `fontWeight` is never set together with it.
//
// Sizes come from one scale only: 34 / 24 screen title (tablet / phone), 20 / 17 card title, 15 body and
// buttons, 13 captions, 12 labels, 11 dock labels. The variant names of the previous scale are kept; each
// one resolves to a step of the new scale.
//
// This file is pure (the react-native import is type-only), so the scale can be unit-tested; the
// platform's monospace family is resolved in `theme.ts` and passed in.
import type { TextStyle } from 'react-native';

import type { LayoutClass } from './metrics';

/** The six Onest cuts the app loads. */
export const fontFamilies = {
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
  extrabold: 'Onest_800ExtraBold',
  /** Logo only. */
  black: 'Onest_900Black',
} as const;

const fonts = fontFamilies;

export type TextStyleToken = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'textTransform'
> & { fontFamily: string; fontSize: number };

// The steps of the scale. Single-line control labels use the font's natural line box (~1.3) rather than
// `line-height: 1`, which clips Cyrillic descenders on Android; the control height is fixed anyway.
const title34 = { fontFamily: fonts.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 } as const;
const title24 = { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 28, letterSpacing: -0.5 } as const;
const head20 = { fontFamily: fonts.bold, fontSize: 20, lineHeight: 24 } as const;
const head17 = { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 } as const;

export function typographyFor(layout: LayoutClass, mono = 'monospace') {
  const tablet = layout === 'tablet';
  const screenTitle = tablet ? title34 : title24;
  const cardHead = tablet ? head20 : head17;
  return {
    // screen title
    display: screenTitle,
    pageTitle: screenTitle,
    loginTitle: title24,
    streakHeadline: title24,
    /** the big number of a summary card */
    metric: screenTitle,
    // card title
    sectionTitle: cardHead,
    dialogTitle: cardHead,
    calendarMonth: cardHead,
    emptyTitle: cardHead,
    errorTitle: cardHead,
    cardTitle: head17,
    numberTitle: head17,
    miniStat: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 24 },
    // body, 15
    input: { fontFamily: fonts.medium, fontSize: 15 },
    body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
    bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
    bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
    bodyBold: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
    button: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
    buttonSoft: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
    buttonLg: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
    buttonLgSoft: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
    avatar: { fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20 },
    // captions, 13
    small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
    smallMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
    smallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
    smallBold: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
    smallExtra: { fontFamily: fonts.extrabold, fontSize: 13, lineHeight: 18 },
    caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
    captionMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
    captionStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
    captionBold: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
    hint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
    buttonSm: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
    link: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
    tab: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
    segment: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
    label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
    meta: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
    /** number tile */
    tile: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
    /** section caption above a card (`.sec`). No upper-case overlines in this design. */
    kicker: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
    kickerSm: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
    mono: { fontFamily: mono, fontSize: 13, lineHeight: 18 },
    // labels, 12
    chip: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
    badgeMuted: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
    badge: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
    badgeStrong: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
    cardKicker: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
    statLabel: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
    avatarSm: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },
    // dock, 11
    dock: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14 },
    counter: { fontFamily: fonts.extrabold, fontSize: 11, lineHeight: 14 },
  } as const satisfies Record<string, TextStyleToken>;
}

export type ThemeTypography = { readonly [K in keyof ReturnType<typeof typographyFor>]: TextStyleToken };
export type TextVariant = keyof ThemeTypography;
