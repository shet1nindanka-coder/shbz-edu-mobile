import { useContext, useEffect, useRef } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';

/**
 * Asks an open overlay of a screen to close when that screen stops being the focused one.
 *
 * WHY: an overlay (`BottomSheet`, `Dialog`, `Select`, the date picker sheet, `FileViewerModal`) is an RN
 * `Modal` — a native window above every screen. Navigation started from OUTSIDE the screen (a reminder tap,
 * a notification row, a search answer) moves to another screen while the old one stays mounted in its tab:
 * on iOS its presented sheet would stay on top of the new screen and act on the old one (a photo picked
 * there would go to the homework, not to the lesson on screen); on Android the dialog is dropped natively
 * while the owner still thinks it is open. Closing it through its owner's `onClose` keeps both in step.
 *
 * Outside a navigator (a primitive rendered on its own, the lock screen) there is no screen to leave: the
 * hook does nothing.
 */
export function useCloseOnBlur(open: boolean, onClose: () => void): void {
  const navigation = useContext(NavigationContext);
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open || !navigation) return;
    return navigation.addListener('blur', () => latest.current());
  }, [open, navigation]);
}
