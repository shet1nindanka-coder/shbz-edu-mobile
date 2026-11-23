// Shadow scale of the «Стекло над листом» design (docs/design/glass-over-paper.md §2): a soft shadow lifts
// a borderless card off the grey page; glass (dock, round header buttons) has its own, deeper one; panels
// inside a card have none.
//
// Each token is a ready style object for the current platform: the mockups' CSS string on web
// (`boxShadow`), the single-layer `shadow*` props on iOS and `elevation` on Android. Dark mode drops the
// Android elevation of cards: an elevation shadow is invisible on #0b0c0e, the hairline does the work.
import { Platform, type ViewStyle } from 'react-native';

export type ShadowStyle = Pick<
  ViewStyle,
  'boxShadow' | 'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

type ShadowSpec = {
  /** CSS box-shadow, verbatim from the site. */
  css: string;
  /** Dominant layer for iOS: colour, opacity, y offset and CSS blur (iOS radius = blur / 2). */
  color: string;
  opacity: number;
  y: number;
  blur: number;
  /** Android elevation; 0 = none. */
  elevation: number;
};

const NONE: ShadowStyle = {};

function shadow(spec: ShadowSpec): ShadowStyle {
  return (
    Platform.select<ShadowStyle>({
      web: { boxShadow: spec.css },
      ios: {
        shadowColor: spec.color,
        shadowOpacity: spec.opacity,
        shadowRadius: spec.blur / 2,
        shadowOffset: { width: 0, height: spec.y },
      },
      android: spec.elevation > 0 ? { elevation: spec.elevation, shadowColor: spec.color } : NONE,
      default: { boxShadow: spec.css },
    }) ?? NONE
  );
}

const INK = '#0a0a0a';
const BLACK = '#000000';
const ACCENT = '#36e0a4';
const GLASS_TINT = '#0a2820';

const shared = {
  /** primary button only */
  accentGlow: shadow({
    css: '0 4px 12px rgba(54,224,164,0.28)',
    color: ACCENT,
    opacity: 0.28,
    y: 4,
    blur: 12,
    elevation: 3,
  }),
  /** selected segment / its sliding indicator */
  segment: shadow({ css: '0 1px 2px rgba(10,10,10,0.12)', color: INK, opacity: 0.12, y: 1, blur: 2, elevation: 1 }),
  /** switch knob */
  knob: shadow({ css: '0 1px 2px rgba(10,10,10,0.25)', color: INK, opacity: 0.25, y: 1, blur: 2, elevation: 2 }),
  /** copy pill, toast-like pills */
  pill: shadow({ css: '0 4px 12px rgba(10,10,10,0.18)', color: INK, opacity: 0.18, y: 4, blur: 12, elevation: 4 }),
  /** delete "x" over an image */
  raisedIcon: shadow({
    css: '0 2px 6px rgba(15,23,42,0.14)',
    color: '#0f172a',
    opacity: 0.14,
    y: 2,
    blur: 6,
    elevation: 2,
  }),
  /** the dock lens */
  lens: shadow({
    css: '0 1px 2px rgba(10,10,10,0.1), 0 8px 18px rgba(22,176,126,0.22)',
    color: '#16b07e',
    opacity: 0.22,
    y: 8,
    blur: 18,
    elevation: 0,
  }),
  none: NONE,
};

export const lightShadows = {
  ...shared,
  /** card */
  card: shadow({
    css: '0 1px 2px rgba(10,10,10,0.04), 0 8px 24px rgba(10,10,10,0.05)',
    color: INK,
    opacity: 0.06,
    y: 8,
    blur: 24,
    elevation: 2,
  }),
  /** state shells, file cards: the same as a card */
  surface: shadow({
    css: '0 1px 2px rgba(10,10,10,0.04), 0 8px 24px rgba(10,10,10,0.05)',
    color: INK,
    opacity: 0.06,
    y: 8,
    blur: 24,
    elevation: 2,
  }),
  /** sheets, menus, the search panel */
  popover: shadow({
    css: '0 4px 10px rgba(10,10,10,0.06), 0 20px 48px rgba(10,10,10,0.18)',
    color: INK,
    opacity: 0.18,
    y: 20,
    blur: 48,
    elevation: 12,
  }),
  /** glass: dock and round header buttons */
  glass: shadow({
    css: '0 1px 1px rgba(10,10,10,0.04), 0 12px 34px rgba(10,40,32,0.13), inset 0 1px 0 rgba(255,255,255,0.9)',
    color: GLASS_TINT,
    opacity: 0.13,
    y: 12,
    blur: 34,
    // An elevation shadow shows through a translucent fill as a grey plate, so glass has none on Android.
    elevation: 0,
  }),
};

export type ThemeShadows = typeof lightShadows;
export type ShadowToken = keyof ThemeShadows;

export const darkShadows: ThemeShadows = {
  ...shared,
  card: shadow({
    css: '0 1px 2px rgba(0,0,0,0.4), 0 14px 38px rgba(0,0,0,0.4)',
    color: BLACK,
    opacity: 0.4,
    y: 14,
    blur: 38,
    elevation: 0,
  }),
  surface: shadow({
    css: '0 1px 2px rgba(0,0,0,0.4), 0 14px 38px rgba(0,0,0,0.4)',
    color: BLACK,
    opacity: 0.4,
    y: 14,
    blur: 38,
    elevation: 0,
  }),
  popover: shadow({
    css: '0 4px 10px rgba(0,0,0,0.3), 0 20px 48px rgba(0,0,0,0.5)',
    color: BLACK,
    opacity: 0.5,
    y: 20,
    blur: 48,
    elevation: 12,
  }),
  glass: shadow({
    css: '0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.14)',
    color: BLACK,
    opacity: 0.5,
    y: 20,
    blur: 50,
    elevation: 0,
  }),
};
