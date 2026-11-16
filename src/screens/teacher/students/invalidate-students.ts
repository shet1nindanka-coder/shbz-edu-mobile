import type { QueryClient } from '@tanstack/react-query';

import { qk } from '@/api';

/**
 * A student was added or removed: every staff read that lists students is stale — the teacher's own
 * lists and cards, group members and call reminders, lesson and draft participants. The `students-changed`
 * realtime event does the same 1.5 s later; this keeps the screen right when the stream is down.
 */
export function invalidateStudents(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: qk('teacherStudents') });
  void queryClient.invalidateQueries({ queryKey: qk('groups') });
  void queryClient.invalidateQueries({ queryKey: qk('planner') });
}
