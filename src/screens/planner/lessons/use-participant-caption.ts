import { formatClockTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';

import type { ItemAttention, ParticipantCaption } from './board-logic';

export type CaptionText = {
  text: string;
  /** Drawn in the status red: the teacher has to do something about it. */
  attention: boolean;
};

/**
 * Words of the one caption of a student on the lesson board (`participantCaption`), all from the site's
 * dictionary: «не распознано — отметьте вручную · 064012», «нет сдач 12 мин», «в классе с 17:02»…
 */
export function useParticipantCaptionText(): (caption: ParticipantCaption) => CaptionText {
  const { dict, locale } = useI18n();
  const t = dict.planner.lessonBoard;
  const reasons: Record<ItemAttention, string> = { injection: t.injectionSuspected, uncertain: t.uncertain, checkFailed: t.checkFailed };

  return (caption) => {
    switch (caption.kind) {
      case 'planFailed':
        return { text: dict.planner.common.error, attention: true };
      case 'planPending':
        return { text: t.aiSelecting, attention: false };
      case 'attention':
        return { text: `${reasons[caption.reason]} · ${caption.number}`, attention: true };
      case 'notOpened':
        return { text: t.notOpened, attention: caption.alert };
      case 'idle':
        return { text: format(t.noSubmissions, { n: caption.minutes }), attention: caption.alert };
      case 'checking':
        return { text: t.checking, attention: false };
      case 'inClass':
        return { text: format(t.inClassSince, { time: formatClockTime(caption.joinedAt, locale) }), attention: false };
      case 'tasks':
        return { text: format(dict.planner.homeworkPlans.board.tasksCount, { n: caption.count }), attention: false };
    }
  };
}
