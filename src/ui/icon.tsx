import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { useTheme, type ColorToken } from '@/theme';

import { CUSTOM_ICON_NAMES, CustomIcon, type CustomIconName } from './internal/custom-icon';

type FeatherName = ComponentProps<typeof Feather>['name'];

// The site's inline SVG icons (gear, bell, chevron, check, calendar, copy…) are Feather glyphs, so the
// app's icon set is Feather. Screens use the semantic names below, never a raw glyph name.
const FEATHER = {
  // chrome
  bell: 'bell',
  bellOff: 'bell-off',
  settings: 'settings',
  menu: 'menu',
  close: 'x',
  back: 'arrow-left',
  forward: 'arrow-right',
  arrowUp: 'arrow-up',
  arrowDown: 'arrow-down',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  chevronLeft: 'chevron-left',
  chevronRight: 'chevron-right',
  check: 'check',
  plus: 'plus',
  minus: 'minus',
  search: 'search',
  more: 'more-horizontal',
  moreVertical: 'more-vertical',
  logout: 'log-out',
  login: 'log-in',
  externalLink: 'external-link',
  filter: 'filter',
  refresh: 'refresh-cw',
  // content
  home: 'home',
  calendar: 'calendar',
  clock: 'clock',
  copy: 'copy',
  edit: 'edit-2',
  trash: 'trash-2',
  file: 'file-text',
  filePlus: 'file-plus',
  folder: 'folder',
  image: 'image',
  camera: 'camera',
  upload: 'upload',
  download: 'download',
  share: 'share',
  paperclip: 'paperclip',
  link: 'link',
  eye: 'eye',
  eyeOff: 'eye-off',
  lock: 'lock',
  key: 'key',
  mail: 'mail',
  send: 'send',
  star: 'star',
  award: 'award',
  zap: 'zap',
  target: 'target',
  list: 'list',
  grid: 'grid',
  hash: 'hash',
  globe: 'globe',
  sun: 'sun',
  moon: 'moon',
  smartphone: 'smartphone',
  wifiOff: 'wifi-off',
  cloudOff: 'cloud-off',
  code: 'code',
  terminal: 'terminal',
  database: 'database',
  activity: 'activity',
  trendingUp: 'trending-up',
  printer: 'printer',
  message: 'message-square',
  // people
  user: 'user',
  users: 'users',
  userPlus: 'user-plus',
  userCheck: 'user-check',
  // feedback
  info: 'info',
  help: 'help-circle',
  alert: 'alert-triangle',
  alertCircle: 'alert-circle',
  checkCircle: 'check-circle',
  closeCircle: 'x-circle',
  // sections
  playCircle: 'play-circle',
  clipboard: 'clipboard',
  bookOpen: 'book-open',
  book: 'book',
  layers: 'layers',
  phone: 'phone',
  phoneCall: 'phone-call',
  phoneMissed: 'phone-missed',
  barChart: 'bar-chart-2',
  sliders: 'sliders',
} as const satisfies Record<string, FeatherName>;

export type IconName = keyof typeof FEATHER | CustomIconName;

/** Every icon name, for galleries and pickers. */
export const ICON_NAMES: readonly IconName[] = [...(Object.keys(FEATHER) as (keyof typeof FEATHER)[]), ...CUSTOM_ICON_NAMES];

/**
 * Tab-bar / section icons per role (docs/spec/01-shell-auth.md §1.3 proposal). Keys are the last
 * segment of the site's `dict.nav.<role>.<item>` label key.
 */
export const navIcons = {
  student: {
    overview: 'home',
    lesson: 'playCircle',
    homeworks: 'clipboard',
    deadlines: 'calendar',
    theory: 'bookOpen',
    info: 'info',
  },
  teacher: {
    overview: 'home',
    topics: 'layers',
    students: 'users',
    groups: 'usersGroup',
    lessons: 'calendarCheck',
    calls: 'phone',
    more: 'more',
  },
  developer: {
    topics: 'layers',
    accounts: 'idCard',
    calls: 'phone',
    statistics: 'barChart',
    panel: 'sliders',
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
  /** Size in dp. Default 20. */
  size?: number;
  /** Colour token; default `textStrong`. */
  color?: ColorToken;
  /** Raw colour, for icons that sit on a status or streak fill. Wins over `color`. */
  tint?: string;
  /** Icons are decorative by default; give a label only when the icon alone carries the meaning. */
  accessibilityLabel?: string;
};

function isCustom(name: IconName): name is CustomIconName {
  return (CUSTOM_ICON_NAMES as readonly string[]).includes(name);
}

/**
 * The app's icon primitive: a semantic name, a size and a colour token.
 *
 * Every icon occupies exactly `size` × `size`. A Feather glyph is text, and its line box is taller than its
 * font size (23 px for a 20 px glyph on web) while a drawn icon is exactly `size` — without the common box
 * a row of icons with labels (the tab bar) sits on two different baselines.
 */
export function Icon({ name, size = 20, color = 'textStrong', tint, accessibilityLabel }: IconProps) {
  const theme = useTheme();
  const resolved = tint ?? theme.colors[color];
  const box = { width: size, height: size, alignItems: 'center', justifyContent: 'center' } as const;
  if (isCustom(name)) {
    return (
      <View
        style={box}
        accessible={Boolean(accessibilityLabel)}
        accessibilityRole={accessibilityLabel ? 'image' : undefined}
        accessibilityLabel={accessibilityLabel}
        accessibilityElementsHidden={!accessibilityLabel}
        importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      >
        <CustomIcon name={name} size={size} color={resolved} />
      </View>
    );
  }
  return (
    <View style={box}>
      <Feather
        name={FEATHER[name]}
        size={size}
        color={resolved}
        accessibilityLabel={accessibilityLabel}
        accessibilityElementsHidden={!accessibilityLabel}
        importantForAccessibility={accessibilityLabel ? 'yes' : 'no'}
      />
    </View>
  );
}
