import type { QueryClient } from '@tanstack/react-query';

import { qk } from '@/api';

/**
 * What a group mutation makes stale. Groups have no realtime event (06 §5): the screens refresh only
 * through the explicit invalidation after the user's own change.
 *
 * - `groups.listGroups` — names, member counts, the first names on a card.
 * - the planner's choosers and lists — they show group names, member counts and the members' speed.
 */
export function invalidateGroupLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: qk('groups', 'listGroups') });
  void queryClient.invalidateQueries({ queryKey: qk('planner', 'getLessonTargets') });
  void queryClient.invalidateQueries({ queryKey: qk('planner', 'getLessonNewForm') });
  void queryClient.invalidateQueries({ queryKey: qk('planner', 'getHomeworkPlanNewForm') });
  void queryClient.invalidateQueries({ queryKey: qk('planner', 'listLessons') });
  void queryClient.invalidateQueries({ queryKey: qk('planner', 'listHomeworkPlans') });
}

/**
 * Membership changed: every open group screen is stale (a student moved here leaves another group), and
 * so are this group's statistics and the rows of its attendance table.
 */
export function invalidateGroupMembership(queryClient: QueryClient): void {
  invalidateGroupLists(queryClient);
  void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroup') });
  void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroupStatistics') });
  void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroupAttendance') });
}
