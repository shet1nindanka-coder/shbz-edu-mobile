// Colour tokens of the site's `--shbz-*` layer (app/globals.css), light and dark. Values are the
// cascade-resolved ones from docs/spec/08-design-system.md §1. Never hard-code a colour in a component:
// read it from `useTheme().colors`.

export const lightColors = {
  // surfaces
  pageBg: '#ffffff',
  cardBg: '#ffffff',
  cardBorder: '#ececee',
  softBg: '#f8f9fa',
  softBorder: '#f0f0f1',
  panelBg: '#fbfbfc',
  rowBorder: '#f4f4f5',
  headerBg: 'rgba(255, 255, 255, 0.85)',
  headerBorder: '#efefef',
  divider: '#e4e5e7',
  // text
  textStrong: '#0a0a0a',
  label: '#2c2e33',
  textMuted: '#6a6e75',
  textSoft: '#8b8f96',
  kicker: '#63676d',
  placeholder: '#6d7076',
  onAccent: '#ffffff',
  // inputs / outlines
  inputBg: '#ffffff',
  inputBorder: '#e4e5e7',
  inputBorderFocus: '#0a0a0a',
  inputRing: 'rgba(54, 224, 164, 0.15)',
  dropzoneBg: '#fbfcfd',
  outlineBorder: '#e4e5e7',
  outlineHover: '#0a0a0a',
  // tabs / segments / progress
  tabBorder: '#0a0a0a',
  tabText: '#14161a',
  tabActiveBg: '#0a0a0a',
  tabActiveText: '#ffffff',
  tabHover: '#f2f3f4',
  segBg: '#ecedef',
  segActiveBg: '#ffffff',
  segText: '#6a6e75',
  progressTrack: '#efeff1',
  // accent
  accentSolid: '#16b07e',
  accentSoft: 'rgba(54, 224, 164, 0.12)',
  accentSoftStrong: 'rgba(54, 224, 164, 0.18)',
  accentBorder: 'rgba(22, 176, 126, 0.35)',
  accentShadow: 'rgba(54, 224, 164, 0.3)',
  // status
  greenSoft: '#eaf7ef',
  greenText: '#127a4c',
  greenBorder: 'rgba(27, 158, 99, 0.25)',
  yellowSoft: '#fef4e3',
  yellowText: '#8a5d05',
  yellowBorder: 'rgba(201, 138, 30, 0.3)',
  redSoft: '#fceded',
  redText: '#b3202c',
  redBorder: '#f3c7c9',
  // danger
  dangerSolid: '#e5484d',
  dangerOutline: '#f3c7c9',
  dangerBg: '#fceded',
  dangerBorder: '#f3c7c9',
  dangerText: '#b3202c',
  // calendar
  calOkBg: '#fff7ea',
  calOkBorder: '#f5dfb8',
  calOkMark: '#f2a93b',
  calLateBg: '#fff5f5',
  calLateBorder: '#f5c6c9',
  calLateMark: '#e5484d',
  calCellBg: '#fbfbfc',
  calCellBorder: '#f0f0f1',
  calOutBg: '#fdfdfe',
  calOutText: '#c7cad0',
  calRing: 'rgba(10, 10, 10, 0.12)',
  // streak (tier "starter")
  streakBgStart: '#fff3e4',
  streakBgEnd: '#ffe9d2',
  streakBorder: '#fbdfbe',
  streakText: '#b5701a',
  streakFlame: '#f2922e',
  streakPillBg: 'rgba(255, 255, 255, 0.7)',
  weekCell: '#f1f2f4',
  weekDotOff: '#d7d9dd',
  // misc
  overlay: 'rgba(15, 23, 42, 0.45)',
  menuOverlay: 'rgba(0, 0, 0, 0.2)',
  skeleton: 'rgba(139, 143, 150, 0.14)',
  skeletonShine: 'rgba(255, 255, 255, 0.6)',
  /** Zero-alpha twin of `skeletonShine`: gradient ends must fade the same hue, not black. */
  skeletonShineClear: 'rgba(255, 255, 255, 0)',
  switchKnob: '#ffffff',
  // brand
  brand: '#16c79f',
  brandDeep: '#0e9b80',
  logoInk: '#0a0a0a',
  /** `LOGO_DARK_BG` of the site: a dark plate for the `onDark` logo. */
  logoDarkBg: '#101212',
};

export type ThemeColors = typeof lightColors;
export type ColorToken = keyof ThemeColors;

export const darkColors: ThemeColors = {
  pageBg: '#0b0c0e',
  cardBg: '#131417',
  cardBorder: '#26282c',
  softBg: '#1a1c1f',
  softBorder: '#26282c',
  panelBg: '#17181b',
  rowBorder: '#222428',
  headerBg: 'rgba(11, 12, 14, 0.85)',
  headerBorder: '#222428',
  divider: '#34373c',
  textStrong: '#f5f6f7',
  label: '#c9ccd1',
  textMuted: '#9ba0a6',
  textSoft: '#85898f',
  kicker: '#7c8087',
  placeholder: '#6a6e75',
  onAccent: '#ffffff',
  inputBg: '#0f1012',
  inputBorder: '#2c2e33',
  inputBorderFocus: '#f5f6f7',
  inputRing: 'rgba(54, 224, 164, 0.18)',
  dropzoneBg: '#0f1012',
  outlineBorder: '#34373c',
  outlineHover: '#f5f6f7',
  tabBorder: '#e8e9ea',
  tabText: '#d6d8db',
  tabActiveBg: '#f5f6f7',
  tabActiveText: '#0a0a0a',
  tabHover: '#24262a',
  segBg: '#222428',
  segActiveBg: '#0f1012',
  segText: '#9ba0a6',
  progressTrack: '#26282c',
  accentSolid: '#36e0a4',
  accentSoft: 'rgba(54, 224, 164, 0.14)',
  accentSoftStrong: 'rgba(54, 224, 164, 0.2)',
  accentBorder: 'rgba(54, 224, 164, 0.35)',
  accentShadow: 'rgba(54, 224, 164, 0.3)',
  greenSoft: 'rgba(27, 158, 99, 0.16)',
  greenText: '#59d49d',
  greenBorder: 'rgba(89, 212, 157, 0.3)',
  yellowSoft: 'rgba(201, 138, 30, 0.16)',
  yellowText: '#e8b45c',
  yellowBorder: 'rgba(232, 180, 92, 0.3)',
  redSoft: 'rgba(214, 69, 80, 0.16)',
  redText: '#ff8f94',
  redBorder: 'rgba(229, 72, 77, 0.4)',
  dangerSolid: '#ff6b70',
  dangerOutline: 'rgba(229, 72, 77, 0.4)',
  dangerBg: 'rgba(229, 72, 77, 0.12)',
  dangerBorder: 'rgba(229, 72, 77, 0.35)',
  dangerText: '#ff8f94',
  calOkBg: 'rgba(242, 169, 59, 0.1)',
  calOkBorder: 'rgba(242, 169, 59, 0.35)',
  calOkMark: '#f2a93b',
  calLateBg: 'rgba(229, 72, 77, 0.1)',
  calLateBorder: 'rgba(229, 72, 77, 0.35)',
  calLateMark: '#ff6b70',
  calCellBg: '#17181b',
  calCellBorder: '#26282c',
  calOutBg: '#131417',
  calOutText: '#4a4d52',
  calRing: 'rgba(255, 255, 255, 0.18)',
  streakBgStart: 'rgba(242, 146, 46, 0.18)',
  streakBgEnd: 'rgba(242, 146, 46, 0.08)',
  streakBorder: 'rgba(242, 146, 46, 0.35)',
  streakText: '#e8a35c',
  streakFlame: '#f2922e',
  streakPillBg: 'rgba(0, 0, 0, 0.25)',
  weekCell: '#222428',
  weekDotOff: '#3a3d42',
  overlay: 'rgba(15, 23, 42, 0.45)',
  menuOverlay: 'rgba(0, 0, 0, 0.2)',
  skeleton: 'rgba(30, 41, 59, 0.78)',
  skeletonShine: 'rgba(255, 255, 255, 0.08)',
  skeletonShineClear: 'rgba(255, 255, 255, 0)',
  switchKnob: '#ffffff',
  brand: '#16c79f',
  brandDeep: '#0e9b80',
  logoInk: '#ffffff',
  logoDarkBg: '#101212',
};

/** Opaque equivalents of the translucent dark tokens, blended over cardBg #131417 (use where a
 *  translucent fill would stack badly, e.g. over an Android elevation shadow). */
export const darkFlattenedOnCard = {
  greenSoft: '#142a23',
  yellowSoft: '#302718',
  redSoft: '#321c20',
  greenBorder: '#284e3f',
  yellowBorder: '#53442c',
  redBorder: '#67292d',
  dangerOutline: '#67292d',
  dangerBg: '#2c1a1d',
  dangerBorder: '#5c262a',
  accentSoft: '#18312b',
  accentSoftStrong: '#1a3d33',
  accentBorder: '#1f5b48',
  inputRing: '#193930',
  calOkBg: '#29231b',
  calOkBorder: '#614824',
  calLateBg: '#28191c',
  calLateBorder: '#5c262a',
  calRing: '#3d3e41',
  streakBgStart: '#3b2b1b',
  streakBgEnd: '#251e19',
  streakBorder: '#61401f',
  skeleton: '#1c2433',
} as const;

/** Opaque equivalents of the translucent light tokens, blended over #ffffff. */
export const lightFlattenedOnCard = {
  accentSoft: '#e7fbf4',
  accentSoftStrong: '#dbf9ef',
  accentBorder: '#ade3d2',
  greenBorder: '#c6e7d8',
  yellowBorder: '#efdcbc',
  inputRing: '#e1faf1',
  calRing: '#e2e2e2',
  skeleton: '#efeff0',
} as const;

type GradientPoint = { x: number; y: number };
type GradientToken = {
  colors: readonly [string, string];
  start: GradientPoint;
  end: GradientPoint;
};

export const gradients = {
  /** linear-gradient(90deg, #5ac8ea 0%, #36e0a4 100%) — the only brand accent. */
  accent: { colors: ['#5ac8ea', '#36e0a4'], start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  /** linear-gradient(135deg, #5ac8ea, #36e0a4) — avatar. */
  accentDiag: { colors: ['#5ac8ea', '#36e0a4'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  /** Midpoint of the accent gradient, for single-colour fallbacks. */
  accentMid: '#48d4c7',
  /** Streak hero: 135deg from streakBgStart to streakBgEnd. */
  streakDirection: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  /**
   * Page glows: radial mint → transparent sky, fading out at 70 %.
   * login — `radial-gradient(720px 420px at 50% -8%, …)`, dashboard — `radial-gradient(640px 320px at 100% 0%, …)`.
   */
  glow: {
    from: '#36e0a4',
    to: '#5ac8ea',
    fadeAt: 0.7,
    login: { width: 720, height: 420, opacityLight: 0.12, opacityDark: 0.09 },
    dashboard: { width: 640, height: 320, opacity: 0.07 },
  },
} as const satisfies {
  accent: GradientToken;
  accentDiag: GradientToken;
  accentMid: string;
  streakDirection: { start: GradientPoint; end: GradientPoint };
  glow: {
    from: string;
    to: string;
    fadeAt: number;
    login: { width: number; height: number; opacityLight: number; opacityDark: number };
    dashboard: { width: number; height: number; opacity: number };
  };
};
