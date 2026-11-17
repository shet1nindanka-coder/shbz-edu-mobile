import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { OverlayCoverSlot, WindowInsetsScope, coveredAccessibilityProps, useOverlayCovered } from '@/ui';

export type ModalRouteFrameProps = {
  /**
   * How the root layout presents the route: `sheet` = `presentation: 'modal'` (an iOS page sheet, which
   * starts below the status bar), `fullScreen` = `fullScreenModal` / `transparentModal`.
   */
  presentation: 'sheet' | 'fullScreen';
  children: ReactNode;
};

/**
 * Wraps the screen of a modal route of the root stack. On iOS such a route is a presented view controller
 * — a window of its own above the root view — so two things of the root do not reach it:
 *
 * - safe-area insets: the single provider of the app answers for the root window. A page sheet already
 *   starts below the status bar (top inset 0), and a full-screen modal is not pushed down by the offline
 *   strip (it needs the device inset even while the tree under the strip gets 0);
 * - the app-wide cover (biometric lock), which is repeated here through its slot.
 *
 * On Android and web a modal route is laid out inside the root content box like any other screen, so only
 * the cover slot is added (it is the same cover; harmless under the root one).
 */
export function ModalRouteFrame({ presentation, children }: ModalRouteFrameProps) {
  const covered = useOverlayCovered();
  const content = (
    <>
      {/* Under the cover the route leaves the accessibility tree; only the slot stays reachable. */}
      <View style={styles.root} {...coveredAccessibilityProps(covered)}>
        {children}
      </View>
      <OverlayCoverSlot />
    </>
  );
  if (Platform.OS !== 'ios') return content;
  return <WindowInsetsScope top={presentation === 'sheet' ? 0 : undefined}>{content}</WindowInsetsScope>;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
