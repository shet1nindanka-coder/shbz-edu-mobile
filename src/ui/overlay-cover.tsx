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
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { View } from 'react-native';

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
