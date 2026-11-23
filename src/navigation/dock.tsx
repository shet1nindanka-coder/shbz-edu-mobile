import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useSegments } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, View } from 'react-native';
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

  const x = useSharedValue(0);
  const visible = useSharedValue(0);
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
    // The squeeze of a drop of glass: `@keyframes sq` of the mockups (0 → 40 % → 75 % → 100 % of 0.55 s).
    scaleX.set(withSequence(withTiming(0.7, { duration: 0 }), withTiming(1.18, { duration: lensDuration * 0.4 }), withTiming(0.97, { duration: lensDuration * 0.35 }), withTiming(1, { duration: lensDuration * 0.25 })));
    scaleY.set(withSequence(withTiming(0.86, { duration: lensDuration * 0.4 }), withTiming(1.03, { duration: lensDuration * 0.35 }), withTiming(1, { duration: lensDuration * 0.25 })));
    glint.set(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: lensGlint, easing: Easing.out(Easing.quad) })));
  }, [activeIndex, itemWidth, reducedMotion, x, visible, scaleX, scaleY, glint, lensDuration, lensGlint, base, spring]);

  const lensStyle = useAnimatedStyle(() => ({
    opacity: visible.get(),
    transform: [{ translateX: x.get() }, { scaleX: scaleX.get() }, { scaleY: scaleY.get() }],
  }));
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

  const tab = (key: string, label: string, icon: IconName, focused: boolean, onPress: () => void, extra?: { expanded: boolean }) => {
    const tint = focused ? theme.colors.textStrong : theme.colors.textMuted;
    return (
      <PressableScale
        key={key}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={extra ? { selected: focused, expanded: extra.expanded } : { selected: focused }}
        aria-expanded={extra?.expanded}
        testID={`dock-${key}`}
        onPress={onPress}
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
        <View
          accessibilityRole="tablist"
          accessibilityLabel={dict.nav.sections}
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
            // «общая инфа» does not fit an item: the tablet dock says «инфа».
            const label = item === 'info' ? m.shell.nav.infoShort : navLabel(dict.nav, section.labelKey);
            return tab(item, label, sectionIcon(role, section), index === activeIndex, () => open({ screen: section.screen } as AppLink));
          })}
          {hasMore
            ? tab('more', m.shell.nav.more, navIcons.teacher.more, activeIndex === sections.length, () => setMoreOpen((value) => !value), {
                expanded: moreOpen,
              })
            : null}
        </View>
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
    paddingHorizontal: t.space.xxxs,
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
