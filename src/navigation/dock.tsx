import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useSegments } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import type { NavSection, UserRole } from '@/api/types';
import { useI18n } from '@/i18n';
import { useRole } from '@/providers/session-provider';
import { makeStyles, useTheme, type Theme } from '@/theme';
import { BottomSheet, DockInsetProvider, Glass, Icon, ListRow, PressableScale, Text, navIcons, type IconName } from '@/ui';

import { useAppNavigation } from './navigate';
import type { AppLink } from './routes';
import { dockActiveIndex, dockHasMore, dockOverflow, dockSections, navItemOf, navLabel } from './tabs';

/** First route segments under which the dock is shown: the three role trees and settings. */
const DOCK_SEGMENTS: readonly string[] = ['(student)', '(teacher)', '(developer)', 'settings'];

/** A tap that arrives this soon after a slide ended is the same touch: the slide has already chosen. */
const SLIDE_TAP_GUARD_MS = 350;
/** How much the lens grows while a finger holds it, and how far a fast slide may stretch it. */
const LENS_LIFT = 0.1;
const LENS_STRETCH_MAX = 0.24;
/** Finger speed (pt/s) at which the lens is stretched to the maximum. */
const LENS_STRETCH_SPEED = 2400;

/** Gap between the dock and the last block of a screen scrolled to its end. */
const DOCK_CLEARANCE = 12;

/** Distance from the bottom edge: above the home indicator, never glued to the edge. */
function dockBottom(theme: Theme, bottomInset: number): number {
  return Math.max(bottomInset, theme.sizes.dockBottom) + (theme.tablet ? 0 : theme.space.xs);
}

function sectionIcon(role: UserRole, section: NavSection): IconName {
  const item = navItemOf(section.labelKey);
  const icons: Record<string, IconName> =
    role === 'STUDENT' ? navIcons.student : role === 'TEACHER' ? navIcons.teacher : navIcons.developer;
  return icons[item] ?? 'more';
}

export type DockProps = { role: UserRole };

/**
 * The bottom dock (docs/design/glass-over-paper.md §5): a glass capsule with the role's sections — on a
 * phone and on a tablet alike. Under the lit item lies the «lens», a white drop with a mint rim; when the
 * section changes it travels on a spring, squeezes a little and a glint runs across it. With reduced
 * motion it simply jumps.
 *
 * The dock is also switched by a slide (§1 rule 11): a finger put on it picks the lens up — the drop
 * grows, flows under the finger, stretches with its speed, the glint moves across it — the item under it
 * lights up, and lifting the finger opens that section. A plain tap is still a tap of the item.
 *
 * It is one overlay for the whole role tree, not the tab bar of a navigator: it stays in place over the
 * screens pushed above the tabs and over settings (where no item is lit), and reads the lit item from the
 * current path.
 */
export function Dock({ role }: DockProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { dict, m } = useI18n();
  const navigation = useAppNavigation();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const [moreOpen, setMoreOpen] = useState(false);
  const [rowWidth, setRowWidth] = useState(0);

  const layout = theme.layout;
  const sections = dockSections(role, layout);
  const hasMore = dockHasMore(role, layout);
  const overflow = dockOverflow(role, layout);
  const count = sections.length + (hasMore ? 1 : 0);
  const activeIndex = dockActiveIndex(role, layout, pathname);
  const itemWidth = count > 0 ? Math.max(0, rowWidth / count) : 0;

  // The item under the lens while a finger holds it, with the route it was held on: once the section (or
  // the screen under the dock) changes, the lit item is the current section again.
  const routeKey = `${activeIndex}|${pathname}`;
  const [heldItem, setHeldItem] = useState<{ index: number; route: string } | null>(null);
  const heldIndex = heldItem && heldItem.route === routeKey ? heldItem.index : null;
  const hold = (index: number) => setHeldItem({ index, route: routeKey });
  const release = () => setHeldItem(null);
  // True for a moment after a slide has chosen: the tap that ends the same touch must not choose again.
  const slideChose = useRef(false);
  // A section chosen by a slide: the lens is already there, the arrival is not squeezed again.
  const arrivedBySlide = useRef(false);

  const x = useSharedValue(0);
  const visible = useSharedValue(0);
  /** 0 → 1 while a finger holds the lens. */
  const lift = useSharedValue(0);
  /** Stretch along the travel, from the finger's speed. */
  const stretch = useSharedValue(0);
  /** The item under the lens on the UI thread; -1 = not held. */
  const held = useSharedValue(-1);
  /** 1 once the held finger has started to slide. */
  const sliding = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const glint = useSharedValue(0);
  const placed = useRef(false);
  const { lens: lensDuration, lensGlint, base } = theme.motion.duration;
  const spring = theme.motion.lensSpring;

  useEffect(() => {
    if (itemWidth === 0 || activeIndex < 0) {
      visible.set(withTiming(0, { duration: reducedMotion ? 0 : base }));
      placed.current = false;
      return;
    }
    const target = activeIndex * itemWidth;
    // Travel only between two real positions; the first placement (and reduced motion) is a jump.
    const animate = placed.current && !reducedMotion;
    placed.current = true;
    visible.set(withTiming(1, { duration: animate ? 0 : base }));
    if (!animate) {
      x.set(target);
      return;
    }
    x.set(withSpring(target, spring));
    if (arrivedBySlide.current) {
      arrivedBySlide.current = false;
      return;
    }
    // The squeeze of a drop of glass: `@keyframes sq` of the mockups (0 → 40 % → 75 % → 100 % of 0.55 s).
    scaleX.set(withSequence(withTiming(0.7, { duration: 0 }), withTiming(1.18, { duration: lensDuration * 0.4 }), withTiming(0.97, { duration: lensDuration * 0.35 }), withTiming(1, { duration: lensDuration * 0.25 })));
    scaleY.set(withSequence(withTiming(0.86, { duration: lensDuration * 0.4 }), withTiming(1.03, { duration: lensDuration * 0.35 }), withTiming(1, { duration: lensDuration * 0.25 })));
    glint.set(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: lensGlint, easing: Easing.out(Easing.quad) })));
  }, [activeIndex, itemWidth, reducedMotion, x, visible, scaleX, scaleY, glint, lensDuration, lensGlint, base, spring]);

  // The section the lens returns to, read by callbacks that outlive a render (a delayed settle).
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const lensStyle = useAnimatedStyle(() => {
    const grow = 1 + lift.get() * LENS_LIFT;
    return {
      opacity: visible.get(),
      transform: [
        { translateX: x.get() },
        { scaleX: scaleX.get() * (grow + stretch.get()) },
        { scaleY: scaleY.get() * (grow - stretch.get() * 0.35) },
      ],
    };
  });
  // The glint: a mint band that crosses the lens once and fades (`@keyframes sh`).
  const glintStyle = useAnimatedStyle(() => {
    const progress = glint.get();
    const opacity = progress < 0.35 ? progress / 0.35 : Math.max(0, 1 - (progress - 0.35) / 0.65);
    return { opacity: progress <= 0 || progress >= 1 ? 0 : opacity, transform: [{ translateX: (1 - 2 * progress) * itemWidth }] };
  });

  const settingsLabel = dict.nav.settings;
  const closeMore = () => setMoreOpen(false);
  const open = (link: AppLink) => {
    closeMore();
    navigation.open(link);
  };

  /** The lens goes back under the current section (or fades where no section is lit). */
  const settle = () => {
    release();
    const current = activeIndexRef.current;
    if (current < 0) {
      visible.set(withTiming(0, { duration: base }));
      return;
    }
    x.set(reducedMotion ? current * itemWidth : withSpring(current * itemWidth, spring));
  };
  // After a press without a slide the item's own tap may be changing the section: the drop waits a moment
  // where the finger left it instead of starting back and turning round.
  const settleSoon = () => {
    setTimeout(settle, 160);
  };
  /** The finger was lifted over the item `index` after a slide. */
  const choose = (index: number) => {
    slideChose.current = true;
    setTimeout(() => {
      slideChose.current = false;
    }, SLIDE_TAP_GUARD_MS);
    if (hasMore && index === sections.length) {
      settle();
      setMoreOpen(true);
      return;
    }
    const section = sections[index];
    if (!section || index === activeIndex) {
      settle();
      return;
    }
    arrivedBySlide.current = true;
    open({ screen: section.screen } as AppLink);
  };
  /** A tap of an item; ignored when it is the tail of a slide that has already chosen. */
  const tapped = (action: () => void) => () => {
    if (slideChose.current) return;
    action();
  };

  const slide = usePanGesture({
    enabled: itemWidth > 0 && count > 1,
    // A touch that only presses stays a tap of the item; the slide starts with the first few points.
    activeOffsetX: [-6, 6],
    failOffsetY: [-24, 24],
    onBegin: (event) => {
      // The drop is picked up where the finger landed.
      const index = Math.min(count - 1, Math.max(0, Math.floor(event.x / itemWidth)));
      held.set(index);
      sliding.set(0);
      visible.set(withTiming(1, { duration: 120 }));
      lift.set(withSpring(1, spring));
      x.set(withSpring(index * itemWidth, spring));
      scheduleOnRN(hold, index);
    },
    onActivate: () => {
      sliding.set(1);
    },
    onUpdate: (event) => {
      const max = Math.max(0, rowWidth - itemWidth);
      const left = Math.min(max, Math.max(0, event.x - itemWidth / 2));
      x.set(left);
      if (!reducedMotion) {
        stretch.set(Math.min(LENS_STRETCH_MAX, (Math.abs(event.velocityX) / LENS_STRETCH_SPEED) * LENS_STRETCH_MAX));
        // The glint follows the travel: a slide from edge to edge carries it across the drop.
        glint.set(max > 0 ? 0.25 + (left / max) * 0.5 : 0.5);
      }
      const index = Math.min(count - 1, Math.max(0, Math.floor(event.x / itemWidth)));
      if (index !== held.get()) {
        held.set(index);
        scheduleOnRN(hold, index);
      }
    },
    onFinalize: () => {
      const index = held.get();
      const slid = sliding.get() === 1;
      held.set(-1);
      sliding.set(0);
      lift.set(withSpring(0, spring));
      stretch.set(withTiming(0, { duration: 180 }));
      glint.set(withTiming(1, { duration: 260 }));
      if (slid && index >= 0) {
        x.set(withSpring(index * itemWidth, spring));
        scheduleOnRN(choose, index);
      } else {
        // A press without a slide: the item's own tap decides; the drop returns unless the section changes.
        scheduleOnRN(settleSoon);
      }
    },
  });

  const tab = (key: string, label: string, icon: IconName, index: number, onPress: () => void, extra?: { expanded: boolean }) => {
    const focused = index === (heldIndex ?? activeIndex);
    const selected = index === activeIndex;
    const tint = focused ? theme.colors.textStrong : theme.colors.textMuted;
    return (
      <PressableScale
        key={key}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={extra ? { selected, expanded: extra.expanded } : { selected }}
        aria-expanded={extra?.expanded}
        testID={`dock-${key}`}
        onPress={tapped(onPress)}
        scaleTo={0.94}
        style={styles.tab}
      >
        <Icon name={icon} size={theme.sizes.icon.lg} tint={tint} />
        <Text variant="dock" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.label, { color: tint }]}>
          {label}
        </Text>
      </PressableScale>
    );
  };

  return (
    <>
      <Glass style={styles.dock} contentStyle={styles.content} testID="dock">
        <GestureDetector gesture={slide}>
        <View
          accessibilityRole="tablist"
          accessibilityLabel={dict.nav.sections}
          collapsable={false}
          style={styles.row}
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        >
          <Animated.View style={[styles.lens, theme.shadows.lens, { width: itemWidth, pointerEvents: 'none' }, lensStyle]}>
            {/* The rim: the accent shows through a 1.5 pt ring around the white drop. */}
            <LinearGradient
              colors={[theme.gradients.accent.colors[0], theme.gradients.accent.colors[1], theme.colors.glassLine]}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={styles.lensRim}
            />
            <View style={styles.lensClip}>
              <LinearGradient colors={[theme.colors.lensTop, theme.colors.lensBottom]} style={styles.lensFill} />
              <Animated.View style={[styles.glint, glintStyle]}>
                <LinearGradient
                  colors={['rgba(90, 200, 234, 0)', 'rgba(90, 200, 234, 0.6)', 'rgba(54, 224, 164, 0.6)', 'rgba(54, 224, 164, 0)']}
                  locations={[0.22, 0.42, 0.56, 0.76]}
                  start={{ x: 0, y: 0.35 }}
                  end={{ x: 1, y: 0.65 }}
                  style={styles.lensFill}
                />
              </Animated.View>
            </View>
          </Animated.View>
          {sections.map((section, index) => {
            const item = navItemOf(section.labelKey);
            // «общая инфа» and «дев-панель» do not fit an item: the dock says «инфа» and «панель».
            const label =
              item === 'info' ? m.shell.nav.infoShort : item === 'panel' ? m.shell.nav.panelShort : navLabel(dict.nav, section.labelKey);
            return tab(item, label, sectionIcon(role, section), index, () => open({ screen: section.screen } as AppLink));
          })}
          {hasMore
            ? tab('more', m.shell.nav.more, navIcons.teacher.more, sections.length, () => setMoreOpen((value) => !value), {
                expanded: moreOpen,
              })
            : null}
        </View>
        </GestureDetector>
      </Glass>

      {hasMore ? (
        <BottomSheet visible={moreOpen} onClose={closeMore} closeLabel={m.shell.nav.moreClose} title={m.shell.tabs.more} testID="dock-more-sheet">
          <View style={styles.moreList}>
            {overflow.map((section) => (
              <ListRow
                key={section.screen}
                title={m.shell.tabs[navItemOf(section.labelKey) as keyof typeof m.shell.tabs] ?? navLabel(dict.nav, section.labelKey)}
                left={<Icon name={sectionIcon(role, section)} size={theme.sizes.icon.md} color="label" />}
                chevron
                inset={0}
                onPress={() => open({ screen: section.screen } as AppLink)}
                testID={`dock-more-${navItemOf(section.labelKey)}`}
              />
            ))}
            <ListRow
              title={settingsLabel}
              left={<Icon name={navIcons.settings} size={theme.sizes.icon.md} color="label" />}
              chevron
              inset={0}
              divider={false}
              onPress={() => {
                closeMore();
                navigation.openSettings();
              }}
              testID="dock-more-settings"
            />
          </View>
        </BottomSheet>
      ) : null}
    </>
  );
}

/**
 * Hosts the dock above the navigator: renders `children` (the root stack), tells every `Screen` how much
 * room the dock takes, and draws the dock itself over the role tree and settings.
 *
 * The dock leaves while the keyboard is up (it would sit on the keys or under them) and on the screens
 * shown without it: sign-in, sheets and modals of the root stack, the file viewer.
 */
export function DockHost({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const styles = useStyles();
  const role = useRole();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const [keyboardUp, setKeyboardUp] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const bottom = dockBottom(theme, insets.bottom);
  const inset = role === null ? 0 : bottom + theme.sizes.dock.height + DOCK_CLEARANCE;
  const shown = role !== null && !keyboardUp && DOCK_SEGMENTS.includes(segments[0] ?? '');

  return (
    <DockInsetProvider inset={inset}>
      {children}
      {shown && role !== null ? (
        <View style={[styles.host, { bottom, paddingLeft: Math.max(insets.left, theme.space.gutter), paddingRight: Math.max(insets.right, theme.space.gutter) }]}>
          <Dock role={role} />
        </View>
      ) : null}
    </DockInsetProvider>
  );
}

const useStyles = makeStyles((t) => ({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', pointerEvents: 'box-none' },
  dock: { width: '100%', maxWidth: t.tablet ? t.sizes.dockMaxWidth : undefined },
  content: { padding: t.sizes.dock.padding },
  row: { flexDirection: 'row' },
  tab: {
    flex: 1,
    height: t.sizes.dock.tab,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xxs,
    // No side padding: five items on a 360-pt phone leave «статистика» exactly its own width.
    borderRadius: t.radii.full,
  },
  label: { maxWidth: '100%' },
  lens: { position: 'absolute', top: 0, left: 0, height: t.sizes.dock.tab, borderRadius: t.radii.full },
  lensRim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: t.radii.full },
  lensClip: {
    position: 'absolute',
    top: t.borders.interactive,
    right: t.borders.interactive,
    bottom: t.borders.interactive,
    left: t.borders.interactive,
    borderRadius: t.radii.full,
    overflow: 'hidden',
    // An opaque base under the translucent drop: the rim must not tint the whole lens.
    backgroundColor: t.dark ? t.colors.soft2 : t.colors.cardBg,
  },
  lensFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  glint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  moreList: { paddingBottom: t.space.sm },
}));
