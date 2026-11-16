// Data the shell keeps for every signed-in user (00 §3.2 "Background calls"): the bell and, for a
// student, the streak. Both are refreshed by the realtime bridge; screens read them through these hooks.
import { useQuery } from '@tanstack/react-query';

import { qk, useApi } from '@/api';
import { useRole, useSession } from '@/providers';

/**
 * The newest 20 notifications and the count of all unread ones. Fetched when the shell mounts, when the
 * panel opens, on return to the foreground and on every realtime event addressed to the user (01 §5.5,
 * §5.7). A failed refresh is silent: the previous list stays.
 */
export function useNotifications() {
  const api = useApi();
  const { status } = useSession();
  return useQuery({
    queryKey: qk('shell', 'listNotifications'),
    queryFn: () => api.shell.listNotifications(),
    enabled: status === 'signedIn',
  });
}

/** The student's streak (`GET /student/streak`); disabled for the other roles, which never request it. */
export function useStudentStreak() {
  const api = useApi();
  const role = useRole();
  return useQuery({
    queryKey: qk('shell', 'getStreak'),
    queryFn: () => api.shell.getStreak(),
    enabled: role === 'STUDENT',
    select: (response) => response.streak,
  });
}
