import { useLayoutEffect, useSyncExternalStore } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Blurs the text field that has the focus when an overlay opens (`active` turns true, or the owner mounts
 * active).
 *
 * Screens and lists keep `keyboardShouldPersistTaps="handled"` so the first tap on a control under an open
 * keyboard is not swallowed — but then that tap does not blur the field either. A sheet presented from
 * such a tap is a transparent modal (iOS `OverFullScreen`): the field behind it stays first responder, the
 * keyboard stays on top of the sheet (its `KeyboardAvoidingView` mounted under an open keyboard and never
 * learns about it) and keystrokes keep editing the hidden field. Dismissing the keyboard here, as the
 * sheet opens, closes that gap for every sheet, dialog, select and date picker at once.
 *
 * A layout effect runs in the commit that mounts the overlay, before a field of the overlay that
 * auto-focuses has reported its focus to JS (native focus events arrive later), so only the field behind
 * the overlay is blurred. Web is left alone: the browser dialog takes the focus itself.
 */
export function useDismissKeyboardWhen(active: boolean): void {
  useLayoutEffect(() => {
    if (active && Platform.OS !== 'web') Keyboard.dismiss();
  }, [active]);
}

/** Set by the iOS `keyboardWill…` events: they arrive with the animation, `Keyboard.isVisible()` after it. */
let willBeShown: boolean | null = null;
let subscribers = 0;

function subscribeToKeyboard(notify: () => void): () => void {
  subscribers += 1;
  const show = Keyboard.addListener('keyboardWillShow', () => {
    willBeShown = true;
    notify();
  });
  const hide = Keyboard.addListener('keyboardWillHide', () => {
    willBeShown = false;
    notify();
  });
  return () => {
    show.remove();
    hide.remove();
    subscribers -= 1;
    // Nobody listens any more: the flag would go stale, the next subscriber starts from `isVisible()`.
    if (subscribers === 0) willBeShown = null;
  };
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

const keyboardShownNow = () => willBeShown ?? Keyboard.isVisible();
const notShown = () => false;

/**
 * Whether the software keyboard is up, on iOS only — where the keyboard frame already covers the home
 * indicator, so a footer above a `KeyboardAvoidingView` must drop its bottom safe-area padding while it is
 * shown, or it floats on an empty strip above the keys. Android reports the keyboard height without the
 * navigation bar (ReactRootView: ime − systemBars), so the inset still applies there; web has no inset.
 * `enabled: false` skips the subscription (a screen without a footer has nothing to adjust).
 */
export function useKeyboardCoversHomeIndicator(enabled = true): boolean {
  const active = enabled && Platform.OS === 'ios';
  return useSyncExternalStore(active ? subscribeToKeyboard : subscribeToNothing, active ? keyboardShownNow : notShown, notShown);
}
