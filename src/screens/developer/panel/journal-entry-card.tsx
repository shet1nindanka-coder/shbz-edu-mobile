import type { JournalEntry } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { Chip, ListRow } from '@/ui';

import { whoText } from './journal-logic';

export type JournalEntryCardProps = {
  entry: JournalEntry;
  /** Hairline under the row; off on the last row of the list. */
  divider: boolean;
  /** Tablet: this entry is shown in the panel next to the list. */
  selected?: boolean;
  onOpen: (entry: JournalEntry) => void;
};

/**
 * One journal row (07 §1.10; layout: docs/design/glass-over-paper.md §7): what happened — the action's
 * label, or its system name when it has none — and one caption «who · when» (Moscow time, marked «МСК» —
 * 07 §7 item 14 — so it reads right in any device zone). A failed entry carries the one red mark of the
 * list. The category, the object, tokens, cost and the whole error are in the detail the row opens.
 */
export function JournalEntryCard({ entry, divider, selected, onOpen }: JournalEntryCardProps) {
  const { dict, m, locale } = useI18n();
  const t = dict.planner.journal;
  const failed = entry.outcome === 'failed';
  const action = entry.actionLabel ?? entry.action;
  const caption = `${whoText(entry, t.roles)} · ${formatDateTime(entry.createdAt, locale)} ${m.common.dateTime.msk}`;

  return (
    <ListRow
      title={action}
      titleLines={2}
      subtitle={caption}
      subtitleLines={2}
      right={failed ? <Chip label={dict.planner.common.error} tone="red" /> : undefined}
      divider={divider}
      selected={selected}
      onPress={() => onOpen(entry)}
      // One element for screen readers: everything the eye reads in it is spoken after the action.
      accessibilityLabel={[format(m.developer.journal.openEntry, { action }), failed ? dict.planner.common.error : null, caption]
        .filter(Boolean)
        .join('. ')}
      testID={`journal-entry-${entry.id}-open`}
    />
  );
}
