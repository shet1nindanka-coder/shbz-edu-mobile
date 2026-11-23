import type { ReactNode } from 'react';

import { Avatar, ListRow } from '@/ui';

export type AccountRowProps = {
  name: string;
  /** The one caption of the row: «login · 9 учеников», «login · teacher». */
  caption: string;
  /** The caption is a warning (a student nobody owns). */
  attention?: boolean;
  /** The one element on the right: a mark that needs attention (an unsaved change). */
  right?: ReactNode;
  /** Hairline under the row; off on the last row of a card. */
  divider: boolean;
  /** Read by a screen reader: everything the row shows as text. */
  accessibilityLabel: string;
  /** What the tap opens. */
  accessibilityHint: string;
  onPress: () => void;
  testID?: string;
};

/**
 * One account of the directory (docs/spec/04-teacher-students.md S9b; layout: docs/design/
 * glass-over-paper.md §7): a neutral avatar, the name and one caption. The site's row buttons live in the
 * sheet the row opens — the whole row is one touch target.
 */
export function AccountRow({ name, caption, attention = false, right, divider, accessibilityLabel, accessibilityHint, onPress, testID }: AccountRowProps) {
  return (
    <ListRow
      left={<Avatar name={name} tone="neutral" />}
      title={name}
      subtitle={caption}
      subtitleTone={attention ? 'attention' : 'muted'}
      // A warning is a sentence: it may take a second line, a login never does.
      subtitleLines={attention ? 2 : 1}
      right={right}
      divider={divider}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      testID={testID}
    />
  );
}
