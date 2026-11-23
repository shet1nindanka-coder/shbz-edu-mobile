// One homework of the review as a list row / card head reads it (docs/design/glass-over-paper.md §1 rules
// 2 – 3): a title, ONE caption — the deadline, red only when it has passed, and how many numbers wait for
// the teacher — and the neutral fact «37 из 50». No React.
import type { TeacherHomeworkAssignment } from '@/api/types';
import { deadlineCaption } from '@/domain/deadline-caption';
import { homeworkAssignmentLabel } from '@/domain/homework-label';
import type { NumberCounts } from '@/domain/number-focus';
import { format, plural, type Locale, type MobileDictionary } from '@/i18n';

import { isAssignmentCompleted, numbersToCheck, unmarkedCount } from './review-logic';

export type ReviewSummary = {
  /** «ДЗ 2 · Логарифмические уравнения», or the homework's own title with its topic. */
  title: string;
  /** «до завтра, 23:59 · 5 номеров ждут проверки». */
  caption: string;
  /** The deadline has passed and the homework is not done. */
  attention: boolean;
  /** «37 из 50». */
  done: string;
  /** Counts for the bar by status. */
  counts: NumberCounts;
};

export function reviewSummary(assignment: TeacherHomeworkAssignment, now: number, locale: Locale, m: MobileDictionary): ReviewSummary {
  const deadline = deadlineCaption(assignment.deadlineAt, isAssignmentCompleted(assignment), now, locale, m.common.deadline);
  const waiting = numbersToCheck(assignment).length;
  return {
    title: `${homeworkAssignmentLabel(assignment, locale)} · ${assignment.topicTitle}`,
    caption: waiting > 0 ? `${deadline.text} · ${plural(locale, waiting, m.teacher.review.toCheckForms)}` : deadline.text,
    attention: deadline.attention,
    done: format(m.common.numbers.doneOf, { done: assignment.solvedCount, total: assignment.totalNumbers }),
    counts: { green: assignment.greenCount, yellow: assignment.yellowCount, red: assignment.redCount, none: unmarkedCount(assignment) },
  };
}
