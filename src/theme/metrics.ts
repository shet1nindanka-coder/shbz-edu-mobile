// Spacing, radius, border and fixed-size scales (docs/spec/08-design-system.md §3, §8). The phone app is
// always the `< 640px` branch of the site's responsive rules.

export const radii = {
  /** calendar deadline mark: the 9 × 9 rotated square (08 §5.20) */
  mark: 3,
  /** "today" swatch of the calendar legend (14 × 14) */
  swatch: 5,
  /** checkbox */
  checkbox: 7,
  /** chips, badges, streak counter pill */
  sm: 8,
  /** segment button and its sliding indicator */
  seg: 9,
  /** select size xs, copy row */
  selectXs: 10,
  /** buttons, inputs, tabs, notices, menus, status options */
  md: 12,
  /** select size md */
  select: 14,
  /** cards, sheets, tab bar, panels, dropzone, popovers */
  lg: 16,
  /** only functionally round things: avatar, dot, switch, progress, icon circles */
  full: 999,
} as const;

/** 1 = static hairline; 1.5 = "you can press this"; 2 = checkbox, focus outline, selection ring. */
export const borders = { hairline: 1, interactive: 1.5, strong: 2 } as const;

export const space = {
  xxs: 4,
  xs: 6,
  /** label -> field */
  sm: 9,
  /** button rows (the site alternates 10 and 12) */
  md: 12,
  /** form gap, section-title margin, card padding on phones */
  field: 18,
  /** card grid gap, soft panel padding */
  lg: 20,
  /** nav card padding */
  xl: 22,
  /** `.shbz-section-pad` on phones (28 on wide screens) */
  card: 18,
  cardWide: 28,
  /** horizontal screen padding */
  gutter: 16,
  pageTop: 32,
  pageBottom: 64,
  /** below the page header */
  headerGap: 40,
  /** between page sections */
  sectionGap: 44,
} as const;

export const sizes = {
  buttonSm: 36,
  button: 44,
  buttonLg: 48,
  /** input and "field" buttons */
  field: 52,
  select: { md: 50, sm: 46, xs: 38 },
  dateTrigger: 46,
  search: 46,
  textareaMin: 96,
  noteMin: 58,
  iconCircle: 40,
  avatar: 42,
  checkbox: 22,
  switchTrack: { width: 46, height: 26 },
  switchKnob: 20,
  switchKnobOffset: 3.5,
  switchKnobTravel: 19.5,
  progress: { sm: 8, md: 10, lg: 12 },
  navCardBand: 5,
  titleDot: 12,
  /** App-wide minimum hit size. */
  minTouch: 44,
  spinner: 14,
  dangerIcon: 26,
  calendarCell: 64,
  pickerCell: 36,
  appBar: 56,
  /** Width above which sheets/dialogs stop being edge-to-edge (the site's 640px breakpoint). */
  wideBreakpoint: 640,
  dialogMaxWidth: 448,
} as const;

export type RadiusToken = keyof typeof radii;
export type SpaceToken = keyof typeof space;
