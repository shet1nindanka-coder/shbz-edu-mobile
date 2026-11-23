// Spacing, radius, border and fixed-size scales of the «Стекло над листом» design
// (docs/design/glass-over-paper.md §3). Nothing outside these scales:
//
//   heights   28 · 36 · 44 · 52
//   radii     8 · 12 · 16 · 24 · round
//   spacing   2 · 4 · 8 · 12 · 16 · 24 · 32
//
// The phone and the tablet share every scale; only a few tokens differ (screen gutter, card padding, gap
// between page blocks, header height). `spaceFor(layout)` / `sizesFor(layout)` resolve them, and the
// theme carries the resolved objects, so components keep reading `theme.space.gutter`.

export type LayoutClass = 'phone' | 'tablet';

/** Window width from which the tablet layout is used. */
export const TABLET_MIN_WIDTH = 768;

export function layoutClassFor(width: number): LayoutClass {
  return width >= TABLET_MIN_WIDTH ? 'tablet' : 'phone';
}

export const radii = {
  /** labels (chips, badges), a segment, small marks */
  sm: 8,
  /** everything that is pressed: buttons, inputs, tiles, marks */
  md: 12,
  /** a panel inside a card: condition, stat box, note, dropzone */
  lg: 16,
  /** cards and sheets */
  xl: 24,
  /** dock, avatars, progress bars, switch */
  full: 999,
  // Aliases of the previous token names, snapped to the scale.
  mark: 8,
  swatch: 8,
  checkbox: 8,
  seg: 8,
  selectXs: 12,
  select: 12,
} as const;

/** 1 = static hairline; 1.5 = "you can press this"; 2 = focus outline, selection ring. */
export const borders = { hairline: 1, interactive: 1.5, strong: 2 } as const;

const baseSpace = {
  xxxs: 2,
  xxs: 4,
  xs: 8,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  /** form gap */
  field: 16,
  cardWide: 24,
  /** between page sections with their own titles */
  sectionGap: 24,
} as const;

export function spaceFor(layout: LayoutClass) {
  const tablet = layout === 'tablet';
  return {
    ...baseSpace,
    /** horizontal screen padding */
    gutter: tablet ? 24 : 16,
    /** card padding */
    card: tablet ? 24 : 16,
    /** gap between the blocks of a page */
    block: tablet ? 16 : 12,
    /** under the screen header */
    pageTop: tablet ? 16 : 12,
    headerGap: tablet ? 16 : 12,
    /** after the last block (the dock inset is added by `Screen`) */
    pageBottom: 24,
  };
}

export const space = spaceFor('phone');

const baseSizes = {
  // The four control heights.
  control: { xs: 28, sm: 36, md: 44, lg: 52 },
  buttonSm: 36,
  button: 44,
  /** the main action of a screen */
  buttonLg: 52,
  /** inputs; 52 on the login screen (`fieldLg`) */
  field: 44,
  fieldLg: 52,
  select: { md: 44, sm: 44, xs: 36 },
  dateTrigger: 44,
  search: 44,
  textareaMin: 88,
  noteMin: 52,
  /** round glass buttons of the header */
  iconCircle: 44,
  iconCircleSm: 36,
  /** avatar: 36 in lists, 44 in the header, 52 in the profile */
  avatar: 44,
  avatarSm: 36,
  avatarLg: 52,
  /** status chip, counter */
  chip: 28,
  /** number tile, status mark */
  tile: 44,
  /** minimum height of a list row */
  row: 60,
  checkbox: 24,
  switchTrack: { width: 48, height: 28 },
  switchKnob: 24,
  switchKnobOffset: 2,
  switchKnobTravel: 20,
  progress: { sm: 8, md: 8, lg: 8 },
  navCardBand: 0,
  titleDot: 8,
  /** App-wide minimum hit size. */
  minTouch: 44,
  spinner: 16,
  dangerIcon: 24,
  pickerCell: 36,
  /** icon sizes */
  icon: { sm: 16, md: 20, lg: 24 },
  /** Dock: a capsule with padding 4 around 52-high tabs. */
  dock: { padding: 4, tab: 52, height: 60 },
  /** Width from which sheets and dialogs stop being edge-to-edge. */
  wideBreakpoint: 640,
  tabletBreakpoint: TABLET_MIN_WIDTH,
  /** A sheet on a tablet is a centred card of this width. */
  dialogMaxWidth: 520,
} as const;

export function sizesFor(layout: LayoutClass) {
  const tablet = layout === 'tablet';
  return {
    ...baseSizes,
    /** minimum height of the screen header row */
    appBar: tablet ? 60 : 48,
    calendarCell: tablet ? 60 : 52,
    /** distance between the dock and the bottom edge (above the home indicator) */
    dockBottom: tablet ? 16 : 8,
    /** the tablet dock is a centred capsule of this width; the phone dock spans the gutters */
    dockMaxWidth: 624,
  };
}

export const sizes = sizesFor('phone');

export type RadiusToken = keyof typeof radii;
export type ThemeSpace = ReturnType<typeof spaceFor>;
export type ThemeSizes = ReturnType<typeof sizesFor>;
export type SpaceToken = keyof ThemeSpace;
