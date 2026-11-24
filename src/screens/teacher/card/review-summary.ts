// One homework of the review as a list row / card head reads it (docs/design/glass-over-paper.md §1 rules
// 2 – 3, §1a): a title, ONE caption — the deadline, red only when it has passed — and on the right the
// count of numbers that wait for the teacher with the neutral fact «37/50». No React.
import type { TeacherHomeworkAssignment } from '@/api/types';
import { deadlineCaption } from '@/domain/deadline-caption';
import { homeworkAssignmentLabel } from '@/domain/homework-label';
import type { NumberCounts } from '@/domain/number-focus';
import { format, plural, type Locale, type MobileDictionary } from '@/i18n';

import { isAssignmentCompleted, numbersToCheck, unmarkedCount } from './review-logic';

export type ReviewSummary = {
  /** «ДЗ 2 · Логарифмические уравнения», or the homework's own title with its topic. */
  title: string;
  /** «до завтра, 23:59». */
  caption: string;
  /** The deadline has passed and the homework is not done. */
  attention: boolean;
  /** How many numbers wait for the teacher: the red counter next to «37/50». */
  waiting: number;
  /** «5 номеров ждут проверки» for screen readers; empty when nothing waits. */
  waitingLabel: string;
  /** «37/50». */
  done: string;
  /** Counts for the bar by status. */
  counts: NumberCounts;
};

export function reviewSummary(assignment: TeacherHomeworkAssignment, now: number, locale: Locale, m: MobileDictionary): ReviewSummary {
  const deadline = deadlineCaption(assignment.deadlineAt, isAssignmentCompleted(assignment), now, locale, m.common.deadline);
  const waiting = numbersToCheck(assignment).length;
  return {
    title: `${homeworkAssignmentLabel(assignment, locale)} · ${assignment.topicTitle}`,
    caption: deadline.text,
    attention: deadline.attention,
    waiting,
    waitingLabel: waiting > 0 ? plural(locale, waiting, m.teacher.review.toCheckForms) : '',
    done: format(m.common.numbers.doneOf, { done: assignment.solvedCount, total: assignment.totalNumbers }),
    counts: { green: assignment.greenCount, yellow: assignment.yellowCount, red: assignment.redCount, none: unmarkedCount(assignment) },
  };
}
