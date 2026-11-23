import { View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { useTheme, type ColorToken } from '@/theme';

import { LUCIDE_ICONS, type IconShape, type LucideIconName } from './internal/generated/lucide-icons';

// The icon set is Lucide (stroke 2, round caps and joins, 24 × 24 view box), generated into
// `internal/generated/lucide-icons.ts` by `scripts/build-lucide-icons.mjs`. Screens use the semantic names
// of that file, never a raw glyph name; a new icon is added to the script's table.
export type IconName = LucideIconName;

/** Every icon name, for galleries and pickers. */
export const ICON_NAMES = Object.keys(LUCIDE_ICONS) as readonly IconName[];

/**
 * Section icons per role (docs/design/glass-over-paper.md §6, the owner's choice). Keys are the last
 * segment of the site's `dict.nav.<role>.<item>` label key.
 */
export const navIcons = {
  student: {
    overview: 'home',
    lesson: 'presentation',
    homeworks: 'notebookPen',
    deadlines: 'calendarDays',
    theory: 'bookOpen',
    info: 'info',
  },
  teacher: {
    overview: 'home',
    topics: 'folderOpen',
    students: 'users',
    groups: 'bookUser',
    lessons: 'calendarCheck',
    calls: 'phone',
    more: 'more',
  },
  developer: {
    topics: 'folderOpen',
    accounts: 'key',
    calls: 'phone',
    statistics: 'barChart',
    panel: 'terminal',
  },
  settings: 'settings',
  notifications: 'bell',
  search: 'search',
} as const satisfies {
  student: Record<string, IconName>;
  teacher: Record<string, IconName>;
  developer: Record<string, IconName>;
  settings: IconName;
  notifications: IconName;
  search: IconName;
};

export type IconProps = {
  name: IconName;
  /** Size in dp: 16, 20 (default) or 24. */
  size?: number;
  /** Colour token; default `textStrong`. */
  color?: ColorToken;
  /** Raw colour, for icons that sit on a status or gradient fill. Wins over `color`. */
  tint?: string;
  /** Icons are decorative by default; give a label only when the icon alone carries the meaning. */
  accessibilityLabel?: string;
};

const SHAPES = { path: Path, circle: Circle, rect: Rect, line: Line, polyline: Polyline, polygon: Polygon, ellipse: Ellipse } as const;

/** Lucide attribute names → react-native-svg props. */
const ATTRIBUTE_PROPS: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
};

function shapeProps(attrs: IconShape[1], color: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    props[ATTRIBUTE_PROPS[key] ?? key] = value === 'currentColor' ? color : value;
  }
  return props;
}

/**
 * The app's icon primitive: a semantic name, a size and a colour token. Every icon occupies exactly
 * `size` × `size`, so a row of icons with labels (the dock) sits on one baseline.
 */
export function Icon({ name, size = 20, color = 'textStrong', tint, accessibilityLabel }: IconProps) {
  const theme = useTheme();
  const resolved = tint ?? theme.colors[color];
  const shapes: readonly IconShape[] = LUCIDE_ICONS[name];
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={resolved} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {shapes.map(([tag, attrs], index) => {
          const Shape = SHAPES[tag];
          return <Shape key={index} {...shapeProps(attrs, resolved)} />;
        })}
      </Svg>
    </View>
  );
}
