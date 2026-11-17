/**
 * Geometry of the device window, for content that is NOT laid out inside the app's root content box.
 *
 * `useSafeAreaInsets()` answers for the place a component sits in: under the offline strip the tree gets a
 * zero top inset, because the strip already took the status bar. That answer is wrong for anything drawn
 * in a native window of its own — a `Modal` (sheets, the in-place file viewer) and, on iOS, a modal route:
 * those start at the top of the screen whatever the root window shows. This module keeps the real numbers
 * reachable:
 *
 *   <WindowFrameProvider insets={deviceInsets} contentTop={stripHeight}>   the host of the offline strip
 *   useWindowInsets()        the device insets, wherever the caller sits
 *   useWindowContentTop()    how far the root content box starts below the top of the window
 *   <WindowInsetsScope>      a subtree that is its own window: safe-area insets are the device's again
 */
import { createContext, use, useMemo, type ReactNode } from 'react';
import { SafeAreaInsetsContext, useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

type WindowFrame = { insets: EdgeInsets; contentTop: number };

const WindowFrameContext = createContext<WindowFrame | null>(null);

export type WindowFrameProviderProps = {
  /** Safe-area insets of the device window (read above any override). */
  insets: EdgeInsets;
  /** Height of what the host draws above the content (the offline strip); 0 when there is nothing. */
  contentTop: number;
  children: ReactNode;
};

export function WindowFrameProvider({ insets, contentTop, children }: WindowFrameProviderProps) {
  const value = useMemo(() => ({ insets, contentTop }), [insets, contentTop]);
  return <WindowFrameContext value={value}>{children}</WindowFrameContext>;
}

/** Safe-area insets of the device window — use in content that is drawn in its own native window. */
export function useWindowInsets(): EdgeInsets {
  const frame = use(WindowFrameContext);
  const local = useSafeAreaInsets();
  return frame?.insets ?? local;
}

/**
 * Distance from the top of the window to the top of the root content box. `KeyboardAvoidingView` measures
 * its frame against its parent, so a screen that starts lower than the window needs this as its
 * `keyboardVerticalOffset`, or that many points of it stay behind the keyboard.
 */
export function useWindowContentTop(): number {
  return use(WindowFrameContext)?.contentTop ?? 0;
}

export type WindowInsetsScopeProps = {
  /** Top inset inside the scope; default: the device's. Pass 0 for an iOS page sheet, which starts below the status bar. */
  top?: number;
  children: ReactNode;
};

/** Marks a subtree as a window of its own: `useSafeAreaInsets()` inside it returns the device insets again. */
export function WindowInsetsScope({ top, children }: WindowInsetsScopeProps) {
  const device = useWindowInsets();
  const insets = useMemo(() => (top === undefined ? device : { ...device, top }), [device, top]);
  const frame = useMemo(() => ({ insets, contentTop: 0 }), [insets]);
  return (
    <WindowFrameContext value={frame}>
      <SafeAreaInsetsContext.Provider value={insets}>{children}</SafeAreaInsetsContext.Provider>
    </WindowFrameContext>
  );
}
