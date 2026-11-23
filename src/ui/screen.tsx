import { useState, type ReactNode, type Ref } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useTheme } from '@/theme';

import { useDockInset } from './dock-inset';
import { useKeyboardCoversHomeIndicator } from './internal/keyboard';
import { PageGlow } from './page-glow';
import { useWindowContentTop } from './window-insets';

export type ScreenProps = {
  children?: ReactNode;
  /**
   * The screen header — a `ScreenHeader` (it pads the status-bar inset itself). In a scrolling screen it
   * is the first thing of the scrolled content and leaves with it; with `scroll={false}` it stays on top.
   */
  header?: ReactNode;
  /** Fixed node under the content (sticky action bar). It sits above the dock and gets the bottom inset. */
  footer?: ReactNode;
  /** Scrollable content (default). Pass `false` for screens that own a list (FlashList). */
  scroll?: boolean;
  /** Apply the gutters (16; 24 on a tablet) and the page bottom padding. Default on. */
  padded?: boolean;
  /** Pull-to-refresh: pass both to enable. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Lift the content above the keyboard. Default on. */
  keyboardAvoiding?: boolean;
  /** Pad the home-indicator inset at the bottom when there is no dock. Default on. */
  bottomInset?: boolean;
  /** Leave room for the floating dock. Default on; switch off on screens shown without it (overlays). */
  dock?: boolean;
  /** Kept for the callers of the previous design: every screen has the page glow now. */
  glow?: 'dashboard' | 'login';
  /** Width of the centred content column: a number (default 720) or `full` — the whole window (tablet panels). */
  maxWidth?: number | 'full';
  scrollRef?: Ref<ScrollViewInstance>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Content scrolled further than this hides the status bar behind a strip of the page colour. */
const SCRIM_AFTER = 8;

/**
 * Screen scaffold: grey page with the glow at the top, safe areas, scrolling, pull-to-refresh, keyboard
 * avoidance and the room for the floating dock. Every screen renders inside one.
 */
export function Screen({
  children,
  header,
  footer,
  scroll = true,
  padded = true,
  refreshing,
  onRefresh,
  keyboardAvoiding = true,
  bottomInset = true,
  dock = true,
  maxWidth = 720,
  scrollRef,
  contentContainerStyle,
  testID,
  style,
}: ScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const contentTop = useWindowContentTop();
  const dockInset = useDockInset();
  const [scrolled, setScrolled] = useState(false);
  // While the keyboard is up (iOS) it covers the home indicator and the dock: the footer sits on the keys,
  // not on an empty strip above them.
  const keyboardShown = useKeyboardCoversHomeIndicator(Boolean(footer) && keyboardAvoiding);
  const underDock = dock && dockInset > 0;
  const edge = underDock ? dockInset : bottomInset ? insets.bottom : 0;
  const footerInset = keyboardShown ? 0 : edge;
  const bottom = footer ? 0 : edge;
  const column: ViewStyle = { width: '100%', maxWidth: maxWidth === 'full' ? undefined : maxWidth, alignSelf: 'center' };
  const gutter: ViewStyle | null = padded ? { paddingHorizontal: theme.space.gutter } : null;
  const padding: ViewStyle = padded
    ? {
        // The header brings its own top padding (status bar + gap); a screen without one starts at the page top.
        paddingTop: header ? 0 : theme.space.pageTop,
        // A page that does not scroll (tablet panels, a screen that owns a list) ends right above the dock.
        paddingBottom: (scroll ? theme.space.pageBottom : theme.space.xxs) + bottom,
        gap: theme.space.block,
      }
    : { paddingBottom: bottom };

  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      // On web any scroll event counts as a drag, including the browser scrolling a focused input into
      // view, which would blur it again.
      keyboardDismissMode={Platform.select({ ios: 'interactive', android: 'on-drag', default: 'none' })}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={32}
      onScroll={(event) => {
        const next = event.nativeEvent.contentOffset.y > SCRIM_AFTER;
        if (next !== scrolled) setScrolled(next);
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={theme.colors.accentSolid}
            colors={[theme.colors.accentSolid]}
            progressBackgroundColor={theme.colors.cardBg}
            progressViewOffset={insets.top}
          />
        ) : undefined
      }
    >
      {header ? <View style={column}>{header}</View> : null}
      <View style={[styles.grow, column, gutter, padding, contentContainerStyle]}>{children}</View>
    </ScrollView>
  ) : (
    <>
      {header ? <View style={column}>{header}</View> : null}
      <View style={[styles.flex, column, gutter, padding, contentContainerStyle]}>{children}</View>
    </>
  );

  const body = (
    <>
      {content}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: theme.space.md + footerInset }]}>
          {/* The gutter sits INSIDE the column, as on the content: on a window wider than the column both
              boxes are `maxWidth` including the gutter, so the footer lines up with the cards above it. */}
          <View style={[column, styles.footerColumn]}>{footer}</View>
        </View>
      ) : null}
    </>
  );

  return (
    <View testID={testID} style={[styles.root, { paddingTop: header ? 0 : insets.top }, style]}>
      <PageGlow />
      {keyboardAvoiding ? (
        // `padding` is measured against the real overlap, so it is also right on Android, where an
        // edge-to-edge window no longer resizes for the keyboard. The browser handles it on web.
        // The offset is what sits between the top of the window and this screen's content box (the offline
        // strip): the view measures itself against its parent and would otherwise leave that much of the
        // screen behind the keyboard.
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'web' ? undefined : 'padding'}
          keyboardVerticalOffset={contentTop}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
      {/* The header scrolls away with the content; this strip keeps scrolled text out from under the clock. */}
      {header && scroll && scrolled && insets.top > 0 ? (
        <View style={[styles.statusScrim, { height: insets.top }]} />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.pageBg },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  scrollContent: { flexGrow: 1 },
  footer: {
    paddingTop: t.space.md,
    backgroundColor: t.colors.pageBg,
    borderTopWidth: t.borders.hairline,
    borderTopColor: t.colors.line,
  },
  footerColumn: { paddingHorizontal: t.space.gutter },
  statusScrim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: t.colors.pageBg, pointerEvents: 'none' },
}));
