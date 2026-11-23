import type { HomeworkPlanListItem } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { Chip, ListRow, accessibilityLabelOf } from '@/ui';

export type DraftRowProps = {
  plan: HomeworkPlanListItem;
  /** The draft the panel next to the list shows (tablet). */
  selected?: boolean;
  divider?: boolean;
  onPress: (plan: HomeworkPlanListItem) => void;
};

/**
 * One homework draft of the list (docs/spec/05-teacher-lessons-plans.md §1.5; layout: docs/design/
 * glass-over-paper.md §1 rules 2 – 3): the title, ONE caption — the topic, the group and the deadline, each
 * only when present — and «выдано 2 из 5» as a plain fact on the right. A red label replaces the fact only
 * when plans of the draft have failed. The whole row is pressed.
 */
export function DraftRow({ plan, selected = false, divider, onPress }: DraftRowProps) {
  const { dict, m, locale } = useI18n();
  const t = dict.planner.homeworkPlans.list;

  const caption = accessibilityLabelOf(
    [plan.topicTitle, plan.groupName, plan.deadlineAt ? format(t.deadline, { date: formatDateTime(plan.deadlineAt, locale) }) : formatDateTime(plan.createdAt, locale)],
    ' · ',
  );
  const errorsLabel = plan.failedCount > 0 ? format(dict.planner.common.errorsCount, { n: plan.failedCount }) : null;
  const issuedLabel = format(t.issuedOf, { issued: plan.issuedCount, total: plan.participantsCount });

  return (
    <ListRow
      title={plan.title}
      // An auto title («ДЗ по теме «…» до …») is long, and its end tells two drafts apart.
      titleLines={2}
      subtitle={caption}
      subtitleLines={2}
      meta={errorsLabel === null ? issuedLabel : undefined}
      right={errorsLabel !== null ? <Chip tone="red" label={errorsLabel} /> : undefined}
      selected={selected}
      divider={divider}
      onPress={() => onPress(plan)}
      accessibilityLabel={accessibilityLabelOf([format(m.planner.drafts.openDraft, { title: plan.title }), caption, errorsLabel, issuedLabel])}
      testID={`draft-card-${plan.id}`}
    />
  );
}
