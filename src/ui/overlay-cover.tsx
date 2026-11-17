/**
 * A cover that must be visible above everything, including every open overlay.
 *
 * WHY a store and a slot: a React Native `Modal` is a separate native window (an Android dialog, an iOS
 * presented view controller), and on iOS so is a modal route of the native stack. A view rendered in the
 * root window — the biometric lock — can never be drawn above them. So the cover is published here, and
 * every overlay window renders an `<OverlayCoverSlot />` as its top-most child: the same cover then closes
 * each window, whatever is open, and nothing has to be unmounted or re-presented.
 *
 *   setOverlayCover(<LockScreen … />)   // the owner of the cover (LockGate); `null` removes it
 *   <OverlayCoverSlot />                // BottomSheet, FileViewerModal and the modal routes render it
 *   useOverlayCovered()                 // overlays ignore "close" requests (hardware back) while covered
 *   <View {...coveredAccessibilityProps(covered)}>…</View>   // what lies under the cover leaves the a11y tree
 *
 * WHY the accessibility props: an opaque view on top does not remove its siblings from the accessibility
 * tree. Android (TalkBack, Switch Access, Voice Access) would still read and activate them, and iOS
 * `accessibilityViewIsModal` only hides the siblings of the modal view itself, not those of its slot. So
 * every window hides its own content (never the slot) while a cover is up.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { absoluteFill } from './internal/layout';

let cover: ReactNode = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): ReactNode {
  return cover;
}

/** Publishes the cover (or removes it with `null`). One owner at a time. */
export function setOverlayCover(next: ReactNode): void {
  if (cover === next) return;
  cover = next;
  listeners.forEach((listener) => listener());
}

/** Synchronous read for code outside React (e.g. a system sheet about to be presented after an await). */
export function isOverlayCovered(): boolean {
  return cover !== null;
}

type CoveredAccessibilityProps = Pick<ViewProps, 'importantForAccessibility' | 'accessibilityElementsHidden' | 'aria-hidden'>;

const HIDDEN: CoveredAccessibilityProps = {
  // Android: the view and all its descendants leave the accessibility tree.
  importantForAccessibility: 'no-hide-descendants',
  // iOS VoiceOver.
  accessibilityElementsHidden: true,
  // Web (the lock never closes there, but the contract is the same on every platform).
  'aria-hidden': true,
};
// Explicit values, so that removing the cover restores the defaults on every renderer.
const SHOWN: CoveredAccessibilityProps = { importantForAccessibility: 'auto', accessibilityElementsHidden: false };

/**
 * Props for the content view of a window (never for the view holding `<OverlayCoverSlot />`): while
 * `covered`, nothing under the cover is reachable by screen readers and other accessibility services.
 */
export function coveredAccessibilityProps(covered: boolean): CoveredAccessibilityProps {
  return covered ? HIDDEN : SHOWN;
}

/** Whether a cover is up: overlays must not close or react underneath it. */
export function useOverlayCovered(): boolean {
  return useSyncExternalStore(subscribe, read, read) !== null;
}

/** Renders the current cover over its parent; nothing when there is none. Place it last inside the window root. */
export function OverlayCoverSlot() {
  const current = useSyncExternalStore(subscribe, read, read);
  if (current === null) return null;
  return <View style={absoluteFill}>{current}</View>;
}
