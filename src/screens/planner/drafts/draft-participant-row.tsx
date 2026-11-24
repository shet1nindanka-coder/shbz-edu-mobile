import type { HomeworkPlanParticipant } from '@/api/types';
import { useTheme } from '@/theme';
import { Avatar, Icon, ListRow, Spinner, accessibilityLabelOf } from '@/ui';

import type { CaptionText } from '../lessons/use-participant-caption';
import { isIssued } from './drafts-logic';

export type DraftParticipantRowProps = {
  participant: HomeworkPlanParticipant;
  /** The state of the student's set: the row draws it only when the plan failed. */
  caption: CaptionText;
  /** The AI plan of this student is being built. */
  planPending: boolean;
  /** The student whose set the panel next to the list shows (tablet). */
  selected?: boolean;
  divider?: boolean;
  onPress: () => void;
};

/**
 * One student of a homework draft (layout: mockup `T-hwplan`): avatar, name and ONE mark on the right — a
 * spinner while the AI selects, a check once the homework is issued, else the number of problems in the
 * set. A caption appears only when the plan failed («Ошибка», red). The whole row opens the student's set,
 * where it is edited, rebuilt and assigned.
 */
export function DraftParticipantRow({ participant, caption, planPending, selected = false, divider, onPress }: DraftParticipantRowProps) {
  const theme = useTheme();
  const issued = isIssued(participant);
  return (
    <ListRow
      left={<Avatar name={participant.studentName} tone="neutral" />}
      title={participant.studentName}
      subtitle={caption.row ?? undefined}
      subtitleTone={caption.attention ? 'attention' : 'muted'}
      meta={!planPending && !issued && !caption.attention ? String(participant.items.length) : undefined}
      right={
        planPending ? (
          <Spinner size={theme.sizes.icon.sm} color="accentSolid" />
        ) : issued ? (
          <Icon name="check" size={theme.sizes.icon.md} color="textMuted" />
        ) : undefined
      }
      selected={selected}
      divider={divider}
      onPress={onPress}
      accessibilityLabel={accessibilityLabelOf([participant.studentName, caption.text])}
      testID={`draft-participant-toggle-${participant.id}`}
    />
  );
}
