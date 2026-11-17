import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { qk, useApi } from '@/api';
import { formatMsk } from '@/domain/dates';
import { homeworkAssignmentLabel } from '@/domain/homework-label';
import { useI18n } from '@/i18n';
import {
  localNotifications,
  planHomeworkReminders,
  planLessonReminders,
  planParentCallReminders,
  selectReminders,
  type ReminderTexts,
} from '@/services/notifications';
import type { ReminderCategory } from '@/services/preferences';
import { useRealtimeBridge } from '@/services/realtime';

import { usePreferences } from './preferences-provider';
import { useSession } from './session-provider';

/** How often "now" is re-read for planning (a reminder whose time has passed drops out on the next tick). */
const REMINDER_REPLAN_MS = 15 * 60 * 1000;

/**
 * Background work of the shell while a user is signed in (00 §3.2 "Background calls"): the realtime
 * bridge and the local reminders. Renders nothing.
 */
export function ShellEffects() {
  const { status, user } = useSession();
  const role = status === 'signedIn' ? (user?.role ?? null) : null;
  useRealtimeBridge(role);
  return role === null ? null : <ReminderSync />;
}

/**
 * Keeps the device's scheduled reminders equal to what the data says. It reads the same queries the
 * screens use (same keys), so a refetch caused by a realtime event or a mutation re-plans the reminders
 * with no extra wiring.
 */
function ReminderSync() {
  const api = useApi();
  const { user } = useSession();
  const { preferences } = usePreferences();
  const { locale, dict, m } = useI18n();
  const role = user?.role ?? null;
  const supported = localNotifications.supported;
  const { reminders } = preferences;

  const wantHomework = supported && role === 'STUDENT' && reminders.homeworkDeadlines;
  const wantLesson = supported && role === 'STUDENT' && reminders.lessonStart;
  const wantCalls = supported && role === 'TEACHER' && reminders.parentCalls;

  const deadlines = useQuery({
    queryKey: qk('studentStudy', 'getHomeworkDeadlines'),
    queryFn: () => api.studentStudy.getHomeworkDeadlines(),
    enabled: wantHomework,
    refetchInterval: REMINDER_REPLAN_MS,
  });
  const lesson = useQuery({
    queryKey: qk('studentWork', 'getLiveLesson'),
    queryFn: () => api.studentWork.getLiveLesson(),
    enabled: wantLesson,
    refetchInterval: REMINDER_REPLAN_MS,
  });
  const calls = useQuery({
    queryKey: qk('groups', 'getParentCallsOverview'),
    queryFn: () => api.groups.getParentCallsOverview(),
    enabled: wantCalls,
    refetchInterval: REMINDER_REPLAN_MS,
  });

  const texts = useMemo<ReminderTexts>(
    () => ({
      homeworkTitle: m.shell.reminders.homeworkTitle,
      homeworkBody: m.shell.reminders.homeworkBody,
      lessonSoonTitle: m.shell.reminders.lessonSoonTitle,
      lessonStartTitle: m.shell.reminders.lessonStartTitle,
      lessonBody: m.shell.reminders.lessonBody,
      lessonBodyWithGroup: m.shell.reminders.lessonBodyWithGroup,
      parentCallTitle: dict.notifications.parentCall.titleDue,
      parentCallBody: dict.notifications.parentCall.bodyReached,
      parentCallBodyNoCalls: dict.notifications.parentCall.bodyNoCalls,
    }),
    [dict, m],
  );

  const channelName = m.shell.reminders.channelName;
  const deadlinesData = wantHomework ? deadlines.data : undefined;
  const lessonData = wantLesson ? lesson.data : undefined;
  const callsData = wantCalls ? calls.data : undefined;
  // `dataUpdatedAt` moves on every refetch, which also re-reads the clock below.
  const stamp = Math.max(deadlines.dataUpdatedAt, lesson.dataUpdatedAt, calls.dataUpdatedAt);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void (async () => {
      const permission = await localNotifications.getPermission();
      if (!active) return;
      if (permission.status !== 'granted' || !(wantHomework || wantLesson || wantCalls)) {
        await localNotifications.cancelAll();
        return;
      }
      const now = Date.now();
      const planned = [
        ...planHomeworkReminders(deadlinesData, now, texts, {
          homeworkLabel: (homework) => homeworkAssignmentLabel(homework, locale),
          dateTime: (iso) => formatMsk(iso, 'dayMonthTime', locale) ?? '',
        }),
        ...planLessonReminders(lessonData, now, texts),
        ...planParentCallReminders(callsData, now, texts),
      ];
      // A category that is wanted but whose query has not answered yet (cold start without a connection,
      // a failed first load) keeps what is already scheduled: "no data yet" is not "nothing to remind of".
      const unknown: ReminderCategory[] = [];
      if (wantHomework && deadlinesData === undefined) unknown.push('homeworkDeadlines');
      if (wantLesson && lessonData === undefined) unknown.push('lessonStart');
      if (wantCalls && callsData === undefined) unknown.push('parentCalls');
      await localNotifications.ensureChannel(channelName);
      if (active) await localNotifications.sync(selectReminders(planned, reminders), unknown);
    })();
    return () => {
      active = false;
    };
  }, [supported, wantHomework, wantLesson, wantCalls, deadlinesData, lessonData, callsData, stamp, texts, channelName, reminders, locale]);

  return null;
}
