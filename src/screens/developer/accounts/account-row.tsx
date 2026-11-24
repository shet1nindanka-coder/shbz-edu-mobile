import type { ReactNode } from 'react';

import { Avatar, ListRow } from '@/ui';

export type AccountRowProps = {
  name: string;
  /** The one caption of the row, if it has one: a student's teacher. Logins are in the row's sheet. */
  caption?: string;
  /** The caption is a warning (a student nobody owns). */
  attention?: boolean;
  /** A plain number on the right: how many students a teacher has. */
  meta?: string;
  /** The one element on the right instead of `meta`: a mark that needs attention (an unsaved change). */
  right?: ReactNode;
  /** Hairline under the row; off on the last row of a card. */
  divider: boolean;
  /** Read by a screen reader: the name, the login and everything else the row stands for. */
  accessibilityLabel: string;
  /** What the tap opens. */
  accessibilityHint: string;
  onPress: () => void;
  testID?: string;
};

/**
 * One account of the directory (docs/spec/04-teacher-students.md S9b; layout: docs/design/
 * glass-over-paper.md §7, §1a): a neutral avatar, the name and at most one caption. The login and the
 * site's row buttons live in the sheet the row opens — the whole row is one touch target.
 */
export function AccountRow({
  name,
  caption,
  attention = false,
  meta,
  right,
  divider,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  testID,
}: AccountRowProps) {
  return (
    <ListRow
      left={<Avatar name={name} tone="neutral" />}
      title={name}
      subtitle={caption}
      subtitleTone={attention ? 'attention' : 'muted'}
      meta={meta}
      right={right}
      divider={divider}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      testID={testID}
    />
  );
}
