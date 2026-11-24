import type { HomeworkPlanListItem } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Chip, ListRow, accessibilityLabelOf } from '@/ui';

import { draftDeadlineCaption } from './drafts-logic';

export type DraftRowProps = {
  plan: HomeworkPlanListItem;
  /** The list's clock: «до пятницы» / «просрочено 2 дня» are counted from it. */
  now: number;
  /** The draft the panel next to the list shows (tablet). */
  selected?: boolean;
  divider?: boolean;
  onPress: (plan: HomeworkPlanListItem) => void;
};

/**
 * One homework draft of the list (docs/spec/05-teacher-lessons-plans.md §1.5; layout: docs/design/
 * glass-over-paper.md §1 rules 2 – 3, §1a): the title, ONE caption — the deadline («до пятницы», red once
 * it has passed with sets still to issue) — and «2/5», how many students have the homework, on the right. A
 * red count of failed plans replaces it when there are any. The site's words («выдано 2 из 5», «ошибок: 1»),
 * the topic and the group are the row's accessible name; they are shown on the draft's board. The whole
 * row is pressed.
 */
export function DraftRow({ plan, now, selected = false, divider, onPress }: DraftRowProps) {
  const { dict, m, locale } = useI18n();
  const t = dict.planner.homeworkPlans.list;

  const deadline = draftDeadlineCaption(plan, now, locale, m.common.deadline);
  const errorsLabel = plan.failedCount > 0 ? format(dict.planner.common.errorsCount, { n: plan.failedCount }) : null;
  const issuedLabel = format(t.issuedOf, { issued: plan.issuedCount, total: plan.participantsCount });

  return (
    <ListRow
      title={plan.title}
      // An auto title («ДЗ по теме «…» до …») is long, and its end tells two drafts apart.
      titleLines={2}
      subtitle={deadline.text}
      subtitleTone={deadline.attention ? 'attention' : 'muted'}
      meta={errorsLabel === null ? format(m.common.numbers.doneOf, { done: plan.issuedCount, total: plan.participantsCount }) : undefined}
      right={errorsLabel !== null ? <Chip tone="red" icon="alert" label={String(plan.failedCount)} /> : undefined}
      selected={selected}
      divider={divider}
      onPress={() => onPress(plan)}
      accessibilityLabel={accessibilityLabelOf([
        format(m.planner.drafts.openDraft, { title: plan.title }),
        // An auto title already names the topic.
        plan.topicTitle && !plan.title.includes(plan.topicTitle) ? plan.topicTitle : null,
        plan.groupName,
        deadline.text,
        errorsLabel,
        issuedLabel,
      ])}
      testID={`draft-card-${plan.id}`}
    />
  );
}
