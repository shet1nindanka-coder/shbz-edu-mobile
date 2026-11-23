import type { HomeworkSummaryDto } from '@/api/types';
import { deadlineCaption } from '@/domain/deadline-caption';
import { format, useI18n } from '@/i18n';
import { ListRow, Text } from '@/ui';

import { homeworkLabel, isCheckRunning, isHomeworkCompleted } from './logic';

export type HomeworkCardProps = {
  homework: HomeworkSummaryDto;
  /** Server-corrected "now" — the overdue caption never trusts the device clock alone. */
  nowMs: number;
  onOpen: (homework: HomeworkSummaryDto) => void;
  /** Hairline under the row; a `ListCard` switches it off on its last row. */
  divider?: boolean;
};

/**
 * Row of the homework list (docs/spec/03-student-homework-lesson.md §1 H1; layout: docs/design/
 * glass-over-paper.md §7, principles 2 – 3): «label · topic», ONE caption — the deadline, in red only when
 * it has passed, or the running check — and the neutral fact «37 из 50» on the right. The whole row opens
 * the homework; the numbers and their statuses live inside it.
 */
export function HomeworkCard({ homework, nowMs, onOpen, divider }: HomeworkCardProps) {
  const { dict, m, locale } = useI18n();

  const title = `${homeworkLabel(homework, dict.common.homeworkN)} · ${homework.topicTitle}`;
  const completed = isHomeworkCompleted(homework);
  const deadline = deadlineCaption(homework.deadlineAt, completed, nowMs, locale, m.common.deadline);
  // SPEC-GAP: the site list has no "check running" mark; `latestCheckStatus` exists in the mobile DTO for
  // the list, so a homework whose check is in flight says so with the site's own wording.
  const running = isCheckRunning(homework.latestCheckStatus);
  const caption = running ? dict.student.check.running : deadline.text;
  const done = format(m.common.numbers.doneOf, { done: homework.solvedCount, total: homework.totalNumbers });

  return (
    <ListRow
      title={title}
      titleLines={2}
      subtitle={caption}
      right={
        <Text variant="small" color="textMuted" tabular numberOfLines={1}>
          {done}
        </Text>
      }
      subtitleTone={!running && deadline.attention ? 'attention' : 'muted'}
      divider={divider}
      onPress={() => onOpen(homework)}
      accessibilityLabel={format(m.studentWork.list.rowA11y, { title, caption, done })}
      accessibilityHint={dict.student.submissions.open}
      testID={`homework-card-${homework.id}`}
    />
  );
}
