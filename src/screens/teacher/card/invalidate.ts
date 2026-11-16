import type { QueryClient } from '@tanstack/react-query';

import { qk } from '@/api';

/**
 * A colour, a deadline or a lesson result of a student changed: every staff read that shows this student
 * is stale — the card's own segments, lesson boards (the number's current status) and group statistics.
 * The realtime event (`student-progress-changed`, `student-deadlines-changed`) does the same 1.5 s later;
 * this keeps the screens right when the stream is down. Only mounted queries refetch.
 */
export function invalidateStudentData(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: qk('teacherStudents') });
  void queryClient.invalidateQueries({ queryKey: qk('planner') });
  void queryClient.invalidateQueries({ queryKey: qk('groups') });
}
