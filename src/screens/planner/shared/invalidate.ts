import type { QueryClient } from '@tanstack/react-query';

import { qk } from '@/api';

/**
 * Everything besides the lesson board that shows a lesson, its set or its results: the lessons list, the
 * student card (its "Lessons" tab, the number statuses a result mirrors onto, the homework built from
 * them), and the group page (its lessons block, the attendance table and the statistics). Lessons have
 * no realtime event for a delete or a schedule change, so every lesson mutation — on the board or in
 * the list — calls this one helper and no screen is left showing a lesson that is gone.
 */
export function invalidateAroundLesson(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: qk('planner', 'listLessons') });
  void queryClient.invalidateQueries({ queryKey: qk('teacherStudents') });
  void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroup') });
  void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroupAttendance') });
  void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroupStatistics') });
}
