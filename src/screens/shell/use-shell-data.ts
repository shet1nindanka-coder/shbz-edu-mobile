// Data the shell keeps for every signed-in user (00 §3.2 "Background calls"): the bell and, for a
// student, the streak. Both are refreshed by the realtime bridge; screens read them through these hooks.
import { useQuery } from '@tanstack/react-query';

import { qk, useApi } from '@/api';
import { correctedNow } from '@/domain/server-clock';
import { mskToday } from '@/domain/moscow-time';
import { useRole, useSession } from '@/providers';
import { useNowTick } from '@/services/clock';

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

/**
 * The Moscow day a cached streak is read on (`streakForDay` from `@/domain/student-streak`). The streak
 * response has no `serverNow`, so the device clock is corrected with the deadlines response, the same
 * pairing the overview uses: the app-bar pill and the home widget always count the streak on one day.
 * This observer never fetches — the overview and the reminders own that read; it only follows the cache.
 */
export function useStreakToday(): string {
  const api = useApi();
  const deadlines = useQuery({
    queryKey: qk('studentStudy', 'getHomeworkDeadlines'),
    queryFn: () => api.studentStudy.getHomeworkDeadlines(),
    enabled: false,
  });
  const deviceNow = useNowTick(60_000);
  return mskToday(correctedNow(deadlines.data?.serverNow, deadlines.dataUpdatedAt, deviceNow));
}
