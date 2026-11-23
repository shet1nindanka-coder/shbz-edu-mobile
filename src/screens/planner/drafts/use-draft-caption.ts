import type { HomeworkPlanParticipant } from '@/api/types';
import { planErrorText } from '@/domain/plan-error';
import { format, useI18n } from '@/i18n';
import { accessibilityLabelOf } from '@/ui';

import type { CaptionText } from '../lessons/use-participant-caption';
import type { PlanState } from '../shared/plan-state';
import { isIssued, setMinutes } from './drafts-logic';

/**
 * Words of the one caption of a student on the homework-draft board, all from the site's dictionary:
 * «Выдано», «ИИ подбирает задание…», the plan error (red), or «задач: 5 · 150 мин» — the size of the set
 * and the time the AI gave it.
 */
export function useDraftCaptionText(): (participant: HomeworkPlanParticipant, plan: PlanState) => CaptionText {
  const { dict } = useI18n();
  const t = dict.planner.homeworkPlans.board;
  const common = dict.planner.common;

  return (participant, plan) => {
    // An issued participant is frozen: its old plan error is not shown any more.
    if (isIssued(participant)) return { text: t.issued, attention: false };
    if (plan.stale) return { text: common.planLost, attention: true };
    if (plan.failed && participant.planError !== null) return { text: planErrorText(participant.planError, dict.planner.planErrors), attention: true };
    if (plan.pending) return { text: t.aiSelecting, attention: false };
    const minutes = setMinutes(participant.items);
    return {
      text: accessibilityLabelOf(
        [format(t.tasksCount, { n: participant.items.length }), minutes > 0 ? format(common.minutesShort, { n: minutes }) : null],
        ' · ',
      ),
      attention: false,
    };
  };
}
