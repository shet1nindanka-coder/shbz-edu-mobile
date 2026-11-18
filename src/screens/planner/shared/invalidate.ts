import type { QueryClient } from '@tanstack/react-query';

import { qk } from '@/api';
import { refreshQueries } from '@/services/query';

const AROUND_LESSON_KEYS = [
  qk('planner', 'listLessons'),
  qk('teacherStudents'),
  qk('groups', 'getGroup'),
  qk('groups', 'getGroupAttendance'),
  qk('groups', 'getGroupStatistics'),
] as const;

/**
 * Everything besides the lesson board that shows a lesson, its set or its results: the lessons list, the
 * student card (its "Lessons" tab, the number statuses a result mirrors onto, the homework built from
 * them), and the group page (its lessons block, the attendance table and the statistics). Lessons have
 * no realtime event for a delete or a schedule change, so every lesson mutation — on the board or in
 * the list — calls this one helper and no screen is left showing a lesson that is gone.
 */
export function invalidateAroundLesson(queryClient: QueryClient): void {
  for (const queryKey of AROUND_LESSON_KEYS) void queryClient.invalidateQueries({ queryKey });
}

/**
 * The same set re-read because the server side changed (a plan arrived or failed while the board was open):
 * unlike the invalidation after the teacher's own write it never cancels a read already in flight, which a
 * realtime event behind the same change has most likely started (`refreshQueries`).
 */
export function refreshAroundLesson(queryClient: QueryClient): void {
  for (const queryKey of AROUND_LESSON_KEYS) void refreshQueries(queryClient, { queryKey });
}

