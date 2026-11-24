import type { HomeworkPlanParticipant } from '@/api/types';
import { planErrorText } from '@/domain/plan-error';
import { format, useI18n } from '@/i18n';
import { accessibilityLabelOf } from '@/ui';

import type { CaptionText } from '../lessons/use-participant-caption';
import type { PlanState } from '../shared/plan-state';
import { isIssued, setMinutes } from './drafts-logic';

/**
 * Words of a student's state on the homework-draft board. The row draws only «Ошибка» (red) — a spinner,
 * a check mark or the size of the set stand on its right for the rest; the full wording of the site
 * («Выдано», «ИИ подбирает задание…», the plan error, «задач: 5 · 150 мин») is the row's accessible name.
 * The student's sheet adds «Выдано» or the time the AI gave the set.
 */
export function useDraftCaptionText(): (participant: HomeworkPlanParticipant, plan: PlanState) => CaptionText {
  const { dict } = useI18n();
  const t = dict.planner.homeworkPlans.board;
  const common = dict.planner.common;

  return (participant, plan) => {
    // An issued participant is frozen: its old plan error is not shown any more.
    if (isIssued(participant)) return { text: t.issued, attention: false, row: null, detail: t.issued };
    // Why the plan failed is the red notice of the student's sheet.
    if (plan.stale) return { text: common.planLost, attention: true, row: common.error, detail: null };
    if (plan.failed && participant.planError !== null) {
      return { text: planErrorText(participant.planError, dict.planner.planErrors), attention: true, row: common.error, detail: null };
    }
    if (plan.pending) return { text: t.aiSelecting, attention: false, row: null, detail: null };
    const minutes = setMinutes(participant.items);
    const time = minutes > 0 ? format(common.minutesShort, { n: minutes }) : null;
    return {
      text: accessibilityLabelOf([format(t.tasksCount, { n: participant.items.length }), time], ' · '),
      attention: false,
      row: null,
      detail: time,
    };
  };
}
