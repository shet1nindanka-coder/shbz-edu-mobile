// A result that has to be shown on the students list although another screen produced it: deleting a
// student from the card returns to the list and shows «Ученик удалён…» there (docs/spec/04-teacher-students.md
// D3). The site carries it in the redirect's query string; route params of a tab root are fixed here, so the
// notice waits in this module until the list takes it.
import { useEffect, useRef } from 'react';

/** Keys of `dict.students.list.notices` another screen may hand to the list. */
export type StudentsListNoticeKey = 'studentDeleted';

let pending: StudentsListNoticeKey | null = null;
const listeners = new Set<() => void>();

/** Leaves a notice for the students list; a mounted list shows it at once. */
export function postStudentsListNotice(key: StudentsListNoticeKey): void {
  pending = key;
  listeners.forEach((listener) => listener());
}

function takeStudentsListNotice(): StudentsListNoticeKey | null {
  const key = pending;
  pending = null;
  return key;
}

/** Calls `onNotice` with a notice left for the list — on mount and whenever one is posted. */
export function useStudentsListNotice(onNotice: (key: StudentsListNoticeKey) => void): void {
  const handler = useRef(onNotice);
  useEffect(() => {
    handler.current = onNotice;
  });
  useEffect(() => {
    const deliver = () => {
      const key = takeStudentsListNotice();
      if (key) handler.current(key);
    };
    deliver();
    listeners.add(deliver);
    return () => {
      listeners.delete(deliver);
    };
  }, []);
}
