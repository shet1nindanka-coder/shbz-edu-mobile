import type { HomeworkPlanParticipant } from '@/api/types';
import { useTheme } from '@/theme';
import { Avatar, Icon, ListRow, Spinner } from '@/ui';

import type { CaptionText } from '../lessons/use-participant-caption';
import { isIssued } from './drafts-logic';

export type DraftParticipantRowProps = {
  participant: HomeworkPlanParticipant;
  /** The one caption of the row: the state of the student's set. */
  caption: CaptionText;
  /** The AI plan of this student is being built. */
  planPending: boolean;
  /** The student whose set the panel next to the list shows (tablet). */
  selected?: boolean;
  divider?: boolean;
  onPress: () => void;
};

/**
 * One student of a homework draft (layout: mockup `T-hwplan`): avatar, name and ONE caption — «задач: 5 ·
 * 150 мин», «ИИ подбирает задание…», «Выдано», or, in red, why the plan failed. The whole row opens the
 * student's set, where it is edited, rebuilt and assigned.
 */
export function DraftParticipantRow({ participant, caption, planPending, selected = false, divider, onPress }: DraftParticipantRowProps) {
  const theme = useTheme();
  return (
    <ListRow
      left={<Avatar name={participant.studentName} tone="neutral" />}
      title={participant.studentName}
      subtitle={caption.text}
      subtitleTone={caption.attention ? 'attention' : 'muted'}
      right={
        planPending ? (
          <Spinner size={theme.sizes.icon.sm} color="accentSolid" />
        ) : isIssued(participant) ? (
          <Icon name="check" size={theme.sizes.icon.md} color="textMuted" />
        ) : undefined
      }
      selected={selected}
      divider={divider}
      onPress={onPress}
      testID={`draft-participant-toggle-${participant.id}`}
    />
  );
}
