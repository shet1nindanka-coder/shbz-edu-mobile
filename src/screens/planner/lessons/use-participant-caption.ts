import { formatClockTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';

import type { ItemAttention, ParticipantCaption } from './board-logic';

export type CaptionText = {
  /** The whole state in words: what a screen reader hears on the student's row. */
  text: string;
  /** Drawn in the status red: the teacher has to do something about it. */
  attention: boolean;
  /**
   * The caption under the name in the row — only a state the teacher should notice (docs/design/
   * glass-over-paper.md §1a "A row is its title"); `null` for a student who is simply working.
   */
  row: string | null;
  /** The state line of the student's sheet / panel: a fact nothing else in it shows; `null` otherwise. */
  detail: string | null;
};

/**
 * Words of a student's state on the lesson board (`participantCaption`). The row shows them only when
 * they ask for the teacher — «Ошибка», «№ 064012», «не вошёл», «нет сдач 12 мин»; the full wording of the
 * site («064012 · не распознано — отметьте вручную», «в классе с 17:02»…) is the row's accessible name.
 */
export function useParticipantCaptionText(): (caption: ParticipantCaption) => CaptionText {
  const { dict, m, locale } = useI18n();
  const t = dict.planner.lessonBoard;
  const reasons: Record<ItemAttention, string> = { injection: t.injectionSuspected, uncertain: t.uncertain, checkFailed: t.checkFailed };

  return (caption) => {
    switch (caption.kind) {
      case 'planFailed':
        // The reason is the red notice of the student's sheet.
        return { text: dict.planner.common.error, attention: true, row: dict.planner.common.error, detail: null };
      case 'planPending':
        // The row spins instead.
        return { text: t.aiSelecting, attention: false, row: null, detail: null };
      case 'attention':
        // The row names the number; the sheet opens on it and says why it waits for the teacher.
        return {
          text: `${caption.number} · ${reasons[caption.reason]}`,
          attention: true,
          row: format(dict.planner.common.numberSign, { n: caption.number }),
          detail: null,
        };
      case 'notOpened':
        return { text: t.notOpened, attention: caption.alert, row: m.planner.lessonBoard.notJoined, detail: m.planner.lessonBoard.notJoined };
      case 'idle': {
        const text = format(t.noSubmissions, { n: caption.minutes });
        return { text, attention: caption.alert, row: text, detail: text };
      }
      case 'checking':
        return { text: t.checking, attention: false, row: null, detail: null };
      case 'inClass': {
        const text = format(t.inClassSince, { time: formatClockTime(caption.joinedAt, locale) });
        return { text, attention: false, row: null, detail: text };
      }
      case 'tasks':
        // «0/7» on the right of the row already says it.
        return { text: format(dict.planner.homeworkPlans.board.tasksCount, { n: caption.count }), attention: false, row: null, detail: null };
    }
  };
}
