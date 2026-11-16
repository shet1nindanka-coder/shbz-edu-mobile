import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { hasErrorCode, qk } from '@/api';

/**
 * A segment's read answered `404 studentNotFound`: the student was deleted or handed to another teacher
 * while the card was open. Re-reading the card header turns the whole screen into the not-found shell
 * (90-addendum-1 A.3 rule 6).
 */
export function useStudentGone(studentId: string, error: unknown): void {
  const queryClient = useQueryClient();
  const gone = hasErrorCode(error, 'studentNotFound');
  useEffect(() => {
    if (gone) void queryClient.invalidateQueries({ queryKey: qk('teacherStudents', 'getStudentCard', studentId) });
  }, [gone, queryClient, studentId]);
}
