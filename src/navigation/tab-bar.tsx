import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import type { UserRole } from '@/api/types';
import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Icon, PressableScale, Text, navIcons, type IconName } from '@/ui';

import { navItemOf, navLabel, tabsForRole, type TabDefinition } from './tabs';

// Five items share a 390 pt screen: the bar keeps its side padding small so «дев-панель» fits a tab.
const BAR_PADDING = 4;
const ITEM_HEIGHT = 52;
// Below this item width the longest labels («статистика», «дев-панель», "homework") would touch their
// neighbours at the regular size, so the whole bar steps one point down. Wider phones keep 12 pt.
const COMFORTABLE_ITEM_WIDTH = 84;

function iconFor(role: UserRole, tab: TabDefinition): IconName {
  if (tab.labelKey === null) return navIcons.teacher.more;
  const item = navItemOf(tab.labelKey);
  const icons: Record<string, IconName> =
    role === 'STUDENT' ? navIcons.student : role === 'TEACHER' ? navIcons.teacher : navIcons.developer;
  return icons[item] ?? 'more';
}

export type RoleTabBarProps = BottomTabBarProps & { role: UserRole };

/**
 * Bottom tab bar of a role (docs/spec/08-design-system.md §5.6 "Mobile translation"): card fill with a
 * top hairline; every item is an icon over the site's lower-case label; the active item is the inverted
 * ink pill, which slides between items like the site's tab indicator.
 */
export function RoleTabBar({ state, emitter, navigateToTab, insets, role }: RoleTabBarProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { dict, m } = useI18n();
  const reducedMotion = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);

  const definitions = tabsForRole(role);
  // Only routes of the tab table are shown, in table order (expo-router may add helper routes to the state).
  const tabs = definitions
    .map((definition) => ({ definition, route: state.routes.find((route) => route.name === definition.name) }))
    .filter((tab): tab is { definition: TabDefinition; route: (typeof state.routes)[number] } => tab.route !== undefined);
  const focusedKey = state.routes[state.index]?.key;
  const activeIndex = tabs.findIndex((tab) => tab.route.key === focusedKey);

  const itemWidth = tabs.length > 0 ? Math.max(0, (barWidth - BAR_PADDING * 2) / tabs.length) : 0;
  const x = useSharedValue(0);
  const visible = useSharedValue(0);
  const { tabSlide, base } = theme.motion.duration;
  const [x1, y1, x2, y2] = theme.motion.easing.spring;

  useEffect(() => {
    if (itemWidth === 0 || activeIndex < 0) {
      visible.set(withTiming(0, { duration: reducedMotion ? 0 : base }));
      return;
    }
    const target = activeIndex * itemWidth;
    // Slide only between two real positions; the first placement is a jump.
    const slide = visible.get() === 1 && !reducedMotion;
    x.set(slide ? withTiming(target, { duration: tabSlide, easing: Easing.bezier(x1, y1, x2, y2) }) : target);
    visible.set(1);
  }, [activeIndex, itemWidth, reducedMotion, x, visible, tabSlide, base, x1, y1, x2, y2]);

  // One size for every label of the bar (a per-label shrink would make neighbours look unequal).
  const labelFont =
    itemWidth > 0 && itemWidth < COMFORTABLE_ITEM_WIDTH ? { fontSize: theme.typography.captionStrong.fontSize - 1 } : null;

  const pillStyle = useAnimatedStyle(() => ({ opacity: visible.get(), transform: [{ translateX: x.get() }] }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={dict.nav.sections}
      onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}
    >
      <View style={styles.row}>
        <Animated.View pointerEvents="none" style={[styles.pill, { width: itemWidth }, pillStyle]} />
        {tabs.map(({ definition, route }, index) => {
          const focused = index === activeIndex;
          const label = definition.labelKey === null ? m.shell.nav.more : navLabel(dict.nav, definition.labelKey);
          const tint = focused ? theme.colors.tabActiveText : theme.colors.tabText;
          return (
            <PressableScale
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              testID={`tab-${definition.name}`}
              onPress={() => {
                // A press on the focused tab still emits: its stack pops to the root on `tabPress`.
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.item}
              pressedStyle={focused ? undefined : { backgroundColor: theme.colors.tabHover }}
            >
              <Icon name={iconFor(role, definition)} size={20} tint={tint} />
              <Text
                variant="captionStrong"
                numberOfLines={1}
                // The longest labels shrink a little on narrow phones instead of being cut.
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={[styles.label, labelFont, { color: tint }]}
              >
                {label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    backgroundColor: t.colors.cardBg,
    borderTopWidth: t.borders.hairline,
    borderTopColor: t.colors.headerBorder,
    paddingTop: 6,
    paddingHorizontal: BAR_PADDING,
  },
  row: { flexDirection: 'row', alignSelf: 'center', width: '100%', maxWidth: 560 },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: ITEM_HEIGHT,
    borderRadius: t.radii.md,
    backgroundColor: t.colors.tabActiveBg,
  },
  item: {
    flex: 1,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    // Keeps a label off the edge of the active pill.
    paddingHorizontal: 3,
    borderRadius: t.radii.md,
  },
  label: { maxWidth: '100%', letterSpacing: -0.2 },
}));
