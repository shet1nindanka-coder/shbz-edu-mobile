import type { ReactNode, Ref } from 'react';
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

import { useKeyboardCoversHomeIndicator } from './internal/keyboard';
import { PageGlow } from './page-glow';
import { useWindowContentTop } from './window-insets';

export type ScreenProps = {
  children?: ReactNode;
  /** Fixed node above the content — normally an `AppBar` (it pads the status-bar inset itself). */
  header?: ReactNode;
  /** Fixed node under the content (sticky action bar). It gets the bottom inset. */
  footer?: ReactNode;
  /** Scrollable content (default). Pass `false` for screens that own a list (FlashList). */
  scroll?: boolean;
  /** Apply the 16px gutters and the page top/bottom padding. Default on. */
  padded?: boolean;
  /** Pull-to-refresh: pass both to enable. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Lift the content above the keyboard. Default on. */
  keyboardAvoiding?: boolean;
  /** Pad the home-indicator inset at the bottom. Switch off inside a tab navigator. Default on. */
  bottomInset?: boolean;
  /** The site's faint page glow behind the content. */
  glow?: 'dashboard' | 'login';
  /** Centered column width on wide screens (tablet / web); default 720. */
  maxWidth?: number;
  scrollRef?: Ref<ScrollViewInstance>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Screen scaffold: page background, safe areas, scrolling, pull-to-refresh and keyboard avoidance.
 * Every screen renders inside one.
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
  glow,
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
  // While the keyboard is up (iOS) it covers the home indicator: the footer sits on the keys, not on an
  // empty inset-high strip above them.
  const keyboardShown = useKeyboardCoversHomeIndicator(Boolean(footer) && bottomInset && keyboardAvoiding);
  const footerInset = bottomInset && !keyboardShown ? insets.bottom : 0;
  const bottom = bottomInset && !footer ? insets.bottom : 0;
  const column: ViewStyle = { width: '100%', maxWidth, alignSelf: 'center' };
  const padding: ViewStyle | null = padded
    ? {
        paddingHorizontal: theme.space.gutter,
        paddingTop: theme.space.pageTop,
        paddingBottom: theme.space.pageBottom + bottom,
      }
    : { paddingBottom: bottom };

  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, column, padding, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      // On web any scroll event counts as a drag, including the browser scrolling a focused input into
      // view, which would blur it again.
      keyboardDismissMode={Platform.select({ ios: 'interactive', android: 'on-drag', default: 'none' })}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={theme.colors.accentSolid}
            colors={[theme.colors.accentSolid]}
            progressBackgroundColor={theme.colors.cardBg}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, column, padding, contentContainerStyle]}>{children}</View>
  );

  const body = (
    <>
      {header}
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
      {glow ? <PageGlow variant={glow} /> : null}
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
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.pageBg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  footer: {
    paddingTop: t.space.md,
    backgroundColor: t.colors.pageBg,
    borderTopWidth: t.borders.hairline,
    borderTopColor: t.colors.headerBorder,
  },
  footerColumn: { paddingHorizontal: t.space.gutter },
}));
