// Colour tokens of the «Стекло над листом» design (docs/design/glass-over-paper.md §2), light and dark.
// The values are the `.tk` custom properties of the approved mockups' `a.css`. Never hard-code a colour in
// a component: read it from `useTheme().colors`.
//
// The token names of the previous (site-derived) palette are kept so every screen keeps compiling; each
// one now resolves to its counterpart in the new palette. The base tokens of the new design come first.

const CLEAR = 'rgba(0, 0, 0, 0)';

export const lightColors = {
  // ── base palette (a.css: --bg, --card, --ink, --ink2, --mut, --line, --line2, --soft, --soft2) ──
  pageBg: '#f4f6f6',
  cardBg: '#ffffff',
  /** Cards have no border in light mode; in dark mode a faint edge replaces the invisible shadow. */
  cardBorder: CLEAR,
  textStrong: '#0a0a0a',
  /** Secondary text. */
  label: '#2c2e33',
  textMuted: '#5f646b',
  /** Hairline between rows. */
  line: '#ececee',
  /** Outline of controls (inputs, outline buttons, unselected marks). */
  line2: '#dcdee1',
  /** Panel inside a card (condition, stat box). */
  softBg: '#f4f5f6',
  /** Neutral fill: segments track, tiles without a status, progress track, list avatars. */
  soft2: '#eceef0',

  // ── accent (--a1 → --a2 gradient lives in `gradients.accent`; --acc is the accent as text) ──
  accentSolid: '#0d7a57',
  /** Text and icons on the mint gradient. */
  onAccent: '#06281c',
  accentSoft: 'rgba(54, 224, 164, 0.12)',
  accentSoftStrong: 'rgba(54, 224, 164, 0.18)',
  accentBorder: 'rgba(22, 176, 126, 0.35)',
  accentShadow: 'rgba(54, 224, 164, 0.28)',

  // ── statuses: soft fill / text / solid (bars, dots). Used for number statuses only. ──
  greenSoft: '#e6f6ed',
  greenText: '#0f6b41',
  greenSolid: '#1b9e63',
  greenBorder: CLEAR,
  yellowSoft: '#fdf1dc',
  yellowText: '#7d5200',
  yellowSolid: '#e8b04a',
  yellowBorder: CLEAR,
  redSoft: '#fbe9ea',
  redText: '#a8262f',
  redSolid: '#c2313c',
  redBorder: CLEAR,

  // ── glass: navigation only (dock, round header buttons) ──
  glass: 'rgba(255, 255, 255, 0.62)',
  /** Glass without a blur behind it (Android, reduced transparency): nearly opaque. */
  glassSolid: 'rgba(255, 255, 255, 0.92)',
  glassLine: 'rgba(255, 255, 255, 0.9)',
  glow1: 'rgba(90, 200, 234, 0.36)',
  glow2: 'rgba(54, 224, 164, 0.2)',
  lensTop: 'rgba(255, 255, 255, 0.97)',
  lensBottom: 'rgba(255, 255, 255, 0.6)',

  // ── streak («огонёк») ──
  streakBgStart: '#fff1e0',
  streakBgEnd: '#fff1e0',
  streakBorder: CLEAR,
  streakText: '#8a4a00',
  streakFlame: '#f2922e',
  streakPillBg: 'rgba(255, 255, 255, 0.7)',

  // ── aliases of the previous token names ──
  softBorder: CLEAR,
  panelBg: '#f4f5f6',
  rowBorder: '#ececee',
  headerBg: 'rgba(255, 255, 255, 0.62)',
  headerBorder: '#ececee',
  divider: '#ececee',
  textSoft: '#5f646b',
  kicker: '#5f646b',
  placeholder: '#5f646b',
  inputBg: '#ffffff',
  inputBorder: '#dcdee1',
  inputBorderFocus: '#36e0a4',
  inputRing: 'rgba(54, 224, 164, 0.15)',
  dropzoneBg: '#f4f5f6',
  outlineBorder: '#dcdee1',
  outlineHover: '#0a0a0a',
  tabBorder: '#0a0a0a',
  tabText: '#5f646b',
  /** The inverted pill: current number tile, active filter chip, dark button. */
  tabActiveBg: '#0a0a0a',
  tabActiveText: '#f4f6f6',
  tabHover: '#eceef0',
  segBg: '#eceef0',
  segActiveBg: '#ffffff',
  segText: '#5f646b',
  progressTrack: '#eceef0',
  dangerSolid: '#c2313c',
  dangerOutline: '#c2313c',
  dangerBg: '#fbe9ea',
  dangerBorder: '#c2313c',
  dangerText: '#a8262f',
  calOkBg: '#f4f5f6',
  calOkBorder: CLEAR,
  calOkMark: '#e8b04a',
  calLateBg: '#f4f5f6',
  calLateBorder: CLEAR,
  calLateMark: '#c2313c',
  calCellBg: '#f4f5f6',
  calCellBorder: CLEAR,
  calOutBg: CLEAR,
  calOutText: '#5f646b',
  /** "Today" ring of a calendar cell. */
  calRing: '#0a0a0a',
  chartGreen: '#1b9e63',
  weekCell: '#eceef0',
  weekDotOff: '#dcdee1',

  // ── misc ──
  overlay: 'rgba(10, 12, 14, 0.38)',
  menuOverlay: 'rgba(10, 12, 14, 0.2)',
  skeleton: 'rgba(95, 100, 107, 0.12)',
  skeletonShine: 'rgba(255, 255, 255, 0.6)',
  /** Zero-alpha twin of `skeletonShine`: gradient ends must fade the same hue, not black. */
  skeletonShineClear: 'rgba(255, 255, 255, 0)',
  switchKnob: '#ffffff',
  switchOff: '#dcdee1',
  // brand
  brand: '#16c79f',
  brandDeep: '#0e9b80',
  logoInk: '#0a0a0a',
  /** A dark plate for the `onDark` logo. */
  logoDarkBg: '#101212',
};

export type ThemeColors = typeof lightColors;
export type ColorToken = keyof ThemeColors;

export const darkColors: ThemeColors = {
  pageBg: '#0b0c0e',
  cardBg: '#131417',
  cardBorder: 'rgba(255, 255, 255, 0.07)',
  textStrong: '#f2f3f4',
  label: '#d5d8dc',
  textMuted: '#a3a8b0',
  line: '#24272c',
  line2: '#363a41',
  softBg: '#191b1f',
  soft2: '#24272c',

  accentSolid: '#5fe6ac',
  onAccent: '#06281c',
  accentSoft: 'rgba(54, 224, 164, 0.14)',
  accentSoftStrong: 'rgba(54, 224, 164, 0.2)',
  accentBorder: 'rgba(54, 224, 164, 0.35)',
  accentShadow: 'rgba(54, 224, 164, 0.28)',

  greenSoft: '#143024',
  greenText: '#5fe6ac',
  greenSolid: '#36e0a4',
  greenBorder: CLEAR,
  yellowSoft: '#33290f',
  yellowText: '#f3c56f',
  yellowSolid: '#e8b04a',
  yellowBorder: CLEAR,
  redSoft: '#3a1a1e',
  redText: '#ff8f97',
  redSolid: '#ff6b75',
  redBorder: CLEAR,

  glass: 'rgba(30, 33, 38, 0.6)',
  glassSolid: 'rgba(30, 33, 38, 0.94)',
  glassLine: 'rgba(255, 255, 255, 0.14)',
  glow1: 'rgba(90, 200, 234, 0.16)',
  glow2: 'rgba(54, 224, 164, 0.1)',
  lensTop: 'rgba(255, 255, 255, 0.2)',
  lensBottom: 'rgba(255, 255, 255, 0.06)',

  streakBgStart: '#33230f',
  streakBgEnd: '#33230f',
  streakBorder: CLEAR,
  streakText: '#ffb561',
  streakFlame: '#f2922e',
  streakPillBg: 'rgba(0, 0, 0, 0.25)',

  softBorder: CLEAR,
  panelBg: '#191b1f',
  rowBorder: '#24272c',
  headerBg: 'rgba(30, 33, 38, 0.6)',
  headerBorder: '#24272c',
  divider: '#24272c',
  textSoft: '#a3a8b0',
  kicker: '#a3a8b0',
  placeholder: '#a3a8b0',
  inputBg: '#131417',
  inputBorder: '#363a41',
  inputBorderFocus: '#36e0a4',
  inputRing: 'rgba(54, 224, 164, 0.18)',
  dropzoneBg: '#191b1f',
  outlineBorder: '#363a41',
  outlineHover: '#f2f3f4',
  tabBorder: '#f2f3f4',
  tabText: '#a3a8b0',
  tabActiveBg: '#f2f3f4',
  tabActiveText: '#0b0c0e',
  tabHover: '#24272c',
  segBg: '#24272c',
  segActiveBg: '#131417',
  segText: '#a3a8b0',
  progressTrack: '#24272c',
  dangerSolid: '#ff6b75',
  dangerOutline: '#ff6b75',
  dangerBg: '#3a1a1e',
  dangerBorder: '#ff6b75',
  dangerText: '#ff8f97',
  calOkBg: '#191b1f',
  calOkBorder: CLEAR,
  calOkMark: '#e8b04a',
  calLateBg: '#191b1f',
  calLateBorder: CLEAR,
  calLateMark: '#ff6b75',
  calCellBg: '#191b1f',
  calCellBorder: CLEAR,
  calOutBg: CLEAR,
  calOutText: '#a3a8b0',
  calRing: '#f2f3f4',
  chartGreen: '#36e0a4',
  weekCell: '#24272c',
  weekDotOff: '#363a41',

  overlay: 'rgba(0, 0, 0, 0.55)',
  menuOverlay: 'rgba(0, 0, 0, 0.3)',
  skeleton: 'rgba(255, 255, 255, 0.07)',
  skeletonShine: 'rgba(255, 255, 255, 0.08)',
  skeletonShineClear: 'rgba(255, 255, 255, 0)',
  switchKnob: '#ffffff',
  switchOff: '#5a606a',
  brand: '#16c79f',
  brandDeep: '#0e9b80',
  logoInk: '#ffffff',
  logoDarkBg: '#101212',
};

/**
 * Opaque equivalents of the translucent tokens, blended over the card fill (use where a translucent fill
 * would stack badly, e.g. over an Android elevation shadow). The status fills of the new palette are
 * opaque already; only the accent washes remain.
 */
export const darkFlattenedOnCard = {
  accentSoft: '#163029',
  accentSoftStrong: '#193d33',
  accentBorder: '#1e5b48',
  inputRing: '#19392f',
  skeleton: '#232427',
} as const;

/** Opaque equivalents of the translucent light tokens, blended over #ffffff. */
export const lightFlattenedOnCard = {
  accentSoft: '#e7fbf4',
  accentSoftStrong: '#dbf9ef',
  accentBorder: '#ade3d2',
  inputRing: '#e1faf1',
  skeleton: '#ebecec',
} as const;

type GradientPoint = { x: number; y: number };
type GradientToken = {
  colors: readonly [string, string];
  start: GradientPoint;
  end: GradientPoint;
};

export const gradients = {
  /** linear-gradient(120deg, #5ac8ea, #36e0a4) — the only accent: the main action and avatars. */
  accent: { colors: ['#5ac8ea', '#36e0a4'], start: { x: 0, y: 0.2 }, end: { x: 1, y: 0.8 } },
  /** The same gradient for round things (avatar, icon tile). */
  accentDiag: { colors: ['#5ac8ea', '#36e0a4'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  /** linear-gradient(90deg, …) — progress fill. */
  accentFlat: { colors: ['#5ac8ea', '#36e0a4'], start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  /** linear-gradient(180deg, …) — chart bars. */
  accentDown: { colors: ['#5ac8ea', '#36e0a4'], start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  /** Midpoint of the accent gradient, for single-colour fallbacks. */
  accentMid: '#48d4c7',
  /** Streak chip: flat fill (start = end). */
  streakDirection: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  /**
   * Page glow: `radial-gradient(<rx> <ry> at 50% <cy>, glow1, glow2 48%, transparent 72%)` at the top
   * centre of every screen. The colours are `colors.glow1` / `colors.glow2`.
   */
  glow: {
    midAt: 0.48,
    fadeAt: 0.72,
    phone: { rx: 420, ry: 240, cy: -70 },
    tablet: { rx: 760, ry: 300, cy: -90 },
  },
} as const satisfies {
  accent: GradientToken;
  accentDiag: GradientToken;
  accentFlat: GradientToken;
  accentDown: GradientToken;
  accentMid: string;
  streakDirection: { start: GradientPoint; end: GradientPoint };
  glow: {
    midAt: number;
    fadeAt: number;
    phone: { rx: number; ry: number; cy: number };
    tablet: { rx: number; ry: number; cy: number };
  };
};
