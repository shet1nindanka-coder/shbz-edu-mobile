// A result that has to be shown on the students list although another screen produced it: deleting a
// student from the card returns to the list and shows «Ученик удалён…» there (docs/spec/04-teacher-students.md
// D3). The site carries it in the redirect's query string; route params of a tab root are fixed here, so the
// notice waits in the shared one-shot store (`@/services/notices`) until the list takes it.
import { noticeChannel, postOneShotNotice, useOneShotNotice } from '@/services/notices';

/** Keys of `dict.students.list.notices` another screen may hand to the list. */
export type StudentsListNoticeKey = 'studentDeleted';

const CHANNEL = noticeChannel<StudentsListNoticeKey>('teacher.students');

/** Leaves a notice for the students list; a mounted list shows it at once. */
export function postStudentsListNotice(key: StudentsListNoticeKey): void {
  postOneShotNotice(CHANNEL, key);
}

/** Calls `onNotice` with a notice left for the list — on mount and whenever one is posted. */
export function useStudentsListNotice(onNotice: (key: StudentsListNoticeKey) => void): void {
  useOneShotNotice(CHANNEL, onNotice);
}
