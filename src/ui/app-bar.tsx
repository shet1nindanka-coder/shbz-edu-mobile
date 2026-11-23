import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { ScreenHeader } from './screen-header';

export type AppBarProps = {
  /** Screen title. Ignored when `left` is given. */
  title?: string;
  /** Small line under the title. */
  subtitle?: string;
  /** Replaces the title block. */
  left?: ReactNode;
  /** Trailing controls: round glass buttons (search, bell, avatar). */
  right?: ReactNode;
  /** Shows the "back" link above the title; needs `backLabel` (what a screen reader says). */
  onBack?: () => void;
  backLabel?: string;
  /** Visible text of the back link («Домашние задания»); default: `backLabel`. */
  backTitle?: string;
  /** Screen controls of the header (segments, the main button): in the header row on a tablet, under it on a phone. */
  aside?: ReactNode;
  /** Kept for the callers of the previous design: the header has no bar and no hairline any more. */
  border?: boolean;
  /** Pad the status-bar inset; default on. Switch off inside a modal sheet. */
  safeTop?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The screen header under its previous name: the title on the left (with the "back" link above it), the
 * round buttons on the right. See `ScreenHeader`.
 */
export function AppBar({ title, subtitle, left, right, onBack, backLabel, backTitle, aside, safeTop = true, testID, style }: AppBarProps) {
  return (
    <ScreenHeader
      testID={testID}
      title={title}
      titleNode={left}
      subtitle={subtitle}
      back={onBack && backLabel ? { label: backTitle ?? backLabel, onPress: onBack, accessibilityLabel: backLabel } : undefined}
      actions={right}
      aside={aside}
      safeTop={safeTop}
      style={style}
    />
  );
}
