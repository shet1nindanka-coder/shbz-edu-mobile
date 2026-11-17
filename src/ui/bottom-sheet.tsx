import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { makeStyles, useTheme } from '@/theme';

import { IconButton } from './icon-button';
import { MODAL_ORIENTATIONS, absoluteFill } from './internal/layout';
import { useDismissKeyboardWhen, useKeyboardCoversHomeIndicator } from './internal/keyboard';
import { easing } from './internal/motion';
import { OverlayCoverSlot, coveredAccessibilityProps, useOverlayCovered } from './overlay-cover';
import { Text } from './text';
import { useWindowInsets } from './window-insets';

export type BottomSheetProps = {
  visible: boolean;
  /** Asked to close: backdrop tap, back button / Esc, drag down, close button. */
  onClose: () => void;
  /** Accessible name of the backdrop and of the close button, e.g. "Закрыть". */
  closeLabel: string;
  /** Title row (17/700). */
  title?: string;
  /** Show the "×" button in the title row. Default: on when there is a title. */
  showClose?: boolean;
  /** `false` blocks every way of closing (a request is pending). Default `true`. */
  dismissible?: boolean;
  /** Wrap the content in a ScrollView (default). Pass `false` when the content owns a list. */
  scroll?: boolean;
  /** Horizontal + bottom padding around the content. Default on. */
  padded?: boolean;
  /** Node pinned under the scrolling content (buttons row). */
  footer?: ReactNode;
  /** Share of the window height the sheet may take; default 0.88. */
  maxHeightRatio?: number;
  /** Called one tick after the exit animation, when the sheet has left the tree: the place to open the next sheet or dialog. */
  onClosed?: () => void;
  testID?: string;
  contentStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

const CLOSE_DISTANCE = 96;
const CLOSE_VELOCITY = 900;

/**
 * Modal bottom sheet — the phone form of every site dialog and popover: full width, radius 16 16 0 0,
 * slides up in 260 ms and leaves in 160 ms. Drag the handle down to close. On wide screens it becomes a
 * centered card.
 */
export function BottomSheet({
  visible,
  onClose,
  closeLabel,
  title,
  showClose,
  dismissible = true,
  scroll = true,
  padded = true,
  footer,
  maxHeightRatio = 0.88,
  onClosed,
  testID,
  contentStyle,
  children,
}: BottomSheetProps) {
  const theme = useTheme();
  const styles = useStyles();
  // A modal is its own window: the device insets apply, not those of the place the sheet is declared in.
  const insets = useWindowInsets();
  const reducedMotion = useReducedMotion();
  const window = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  // Mount synchronously when asked to open; unmount only after the exit animation.
  if (visible && !mounted) setMounted(true);

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const sheetHeight = useSharedValue(window.height);
  const { sheetIn, sheetOut } = theme.motion.duration;
  const wide = window.width > theme.sizes.wideBreakpoint;
  // The field the sheet was opened from must not keep the keyboard over the sheet (iOS).
  useDismissKeyboardWhen(visible);
  const keyboardShown = useKeyboardCoversHomeIndicator();

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      drag.set(0);
      progress.set(withTiming(1, { duration: reducedMotion ? 0 : sheetIn, easing: easing('drawer') }));
      return;
    }
    const finish = () => {
      setMounted(false);
      // One tick later, so the commit that removes this sheet's modal is over before the owner can ask
      // for the next one from `onClosed`. On iOS a modal that is asked to appear while another one is
      // still presented is refused and never shown.
      if (onClosed) setTimeout(onClosed, 0);
    };
    progress.set(
      withTiming(0, { duration: reducedMotion ? 0 : sheetOut, easing: easing('drawer') }, (finished) => {
        if (finished) scheduleOnRN(finish);
      }),
    );
    // `onClosed` is read when the animation ends; a new callback identity must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mounted, progress, drag, reducedMotion, sheetIn, sheetOut]);

  // Under the lock cover the sheet stays open but nothing may operate it (hardware back included).
  const covered = useOverlayCovered();
  const requestClose = () => {
    if (dismissible && !covered) onClose();
  };

  const pan = usePanGesture({
    enabled: dismissible,
    activeOffsetY: 8,
    failOffsetX: [-24, 24],
    onUpdate: (event) => {
      drag.set(Math.max(0, event.translationY));
    },
    onDeactivate: (event) => {
      if (event.translationY > CLOSE_DISTANCE || event.velocityY > CLOSE_VELOCITY) {
        scheduleOnRN(onClose);
      } else {
        drag.set(withTiming(0, { duration: 180 }));
      }
    },
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * sheetHeight.get() + drag.get() }],
  }));

  if (!mounted) return null;

  const closeVisible = showClose ?? Boolean(title);
  // The keyboard covers the home indicator (iOS): while it is up, its inset would only leave an empty
  // strip between the sheet's last row and the keys.
  const homeInset = keyboardShown ? 0 : insets.bottom;
  const bottomPad = Math.max(homeInset, theme.space.gutter);
  const body = (
    <View
      style={[
        padded ? styles.padded : null,
        // Without a footer the content itself clears the home indicator.
        footer ? null : { paddingBottom: padded ? bottomPad : homeInset },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={[...MODAL_ORIENTATIONS]}
      onRequestClose={requestClose}
    >
      <GestureHandlerRootView style={styles.root}>
        {/*
          The keyboard takes the bottom of this box (padding) and the status bar its top, and the sheet may
          shrink (`flexShrink`), so it always stays inside what is left: the title row keeps its place and
          the content scrolls. Without the shrink a tall sheet was pushed up past the top of the screen.
        */}
        <KeyboardAvoidingView
          // Under the lock cover the sheet leaves the accessibility tree; only the slot below stays reachable.
          {...coveredAccessibilityProps(covered)}
          behavior={Platform.OS === 'web' ? undefined : 'padding'}
          style={[styles.root, wide ? styles.rootWide : styles.rootPhone, { paddingTop: insets.top + (wide ? theme.space.gutter : 0) }]}
        >
          <Animated.View style={[absoluteFill, styles.backdrop, backdropStyle]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              focusable={false}
              onPress={requestClose}
              style={styles.root}
            />
          </Animated.View>
          {/* The id sits on the sheet itself: `Modal` renders no element that carries it on web. */}
          <Animated.View
            testID={testID}
            accessibilityViewIsModal
            onLayout={(event) => sheetHeight.set(event.nativeEvent.layout.height)}
            style={[
              styles.sheet,
              wide ? styles.sheetWide : styles.sheetPhone,
              theme.shadows.card,
              { maxHeight: Math.round((window.height - insets.top) * maxHeightRatio) },
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.header}>
                <View style={styles.grabber} />
                {title || closeVisible ? (
                  <View style={styles.titleRow}>
                    <Text variant="cardTitle" numberOfLines={2} accessibilityRole="header" style={styles.title}>
                      {title}
                    </Text>
                    {closeVisible ? (
                      <IconButton
                        icon="close"
                        variant="ghost"
                        accessibilityLabel={closeLabel}
                        disabled={!dismissible}
                        onPress={requestClose}
                        style={styles.close}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            </GestureDetector>
            {scroll ? (
              <ScrollView
                style={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {body}
              </ScrollView>
            ) : (
              <View style={styles.scroll}>{body}</View>
            )}
            {footer ? <View style={[styles.footer, { paddingBottom: bottomPad }]}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
        {/* A modal is its own native window: the app-wide cover (biometric lock) is repeated inside it. */}
        <OverlayCoverSlot />
      </GestureHandlerRootView>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1 },
  rootPhone: { justifyContent: 'flex-end' },
  rootWide: { justifyContent: 'center', alignItems: 'center', padding: t.space.gutter },
  backdrop: { backgroundColor: t.colors.overlay },
  sheet: {
    flexShrink: 1,
    backgroundColor: t.colors.cardBg,
    borderColor: t.colors.cardBorder,
    borderWidth: t.borders.hairline,
  },
  sheetPhone: {
    alignSelf: 'stretch',
    borderTopLeftRadius: t.radii.lg,
    borderTopRightRadius: t.radii.lg,
    borderBottomWidth: 0,
  },
  sheetWide: { width: '100%', maxWidth: t.sizes.dialogMaxWidth, borderRadius: t.radii.lg },
  header: { paddingTop: 8, paddingBottom: 4 },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: t.radii.full,
    backgroundColor: t.colors.divider,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingHorizontal: t.space.lg,
    paddingTop: 10,
    minHeight: t.sizes.minTouch,
  },
  title: { flex: 1, minWidth: 0 },
  close: { marginRight: -8 },
  scroll: { flexShrink: 1 },
  padded: { paddingHorizontal: t.space.lg, paddingTop: 8 },
  footer: {
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.md,
    borderTopWidth: t.borders.hairline,
    borderTopColor: t.colors.softBorder,
  },
}));
