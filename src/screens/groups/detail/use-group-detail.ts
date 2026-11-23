import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { POLLING, isNotFoundError, qk, useApi } from '@/api';
import { useRetryWait } from '@/components/retry-wait';
import { useAppNavigation, useRefetchOnFocus, useScreenFocused, useScreenLive, useStillHere } from '@/navigation';
import { usePullRefresh } from '@/services/query';

import { hasActiveLesson } from '../logic';
import { GROUPS_LIST_NOTICE, groupNoticeChannel, postGroupNotice, useGroupNotice } from '../shared/notice-store';
import { ATTENDANCE_PERIOD } from './attendance-tab';
import { useReportExport } from './use-report-export';

export type GroupTab = 'members' | 'statistics' | 'attendance' | 'lessons';
export const GROUP_TABS: readonly GroupTab[] = ['members', 'statistics', 'attendance', 'lessons'];
/** The tabs of the wide layout, where the members have a panel of their own. */
export const GROUP_SIDE_TABS: readonly GroupTab[] = ['statistics', 'attendance', 'lessons'];

export type GroupBanner = { tone: 'success'; key: 'saved' } | { tone: 'error'; text: string };

export type GroupDetailOptions = {
  /**
   * The group is shown in a panel next to the groups list (tablet): when it is gone — deleted here, or
   * found missing — the list is told instead of the screen going back.
   */
  onGone?: () => void;
  /** Members stand in their own panel: the tab bar switches the other three parts only. */
  split?: boolean;
};

/**
 * Everything one group needs (docs/spec/06-teacher-groups-calls-stats.md §1.2, §1.3), whatever lays it
 * out: the pushed screen of a phone, the two panels of a tablet, the panel next to the groups list.
 * Statistics and attendance are loaded when their part is first shown.
 */
export function useGroupDetail(groupId: string, { onGone, split = false }: GroupDetailOptions = {}) {
  const api = useApi();
  const navigation = useAppNavigation();
  const report = useReportExport();
  // Here, not in the tab: the attendance tab unmounts on a tab switch, the cool-down of its marks must not.
  const attendanceWait = useRetryWait();
  const [picked, setPicked] = useState<GroupTab>('members');
  const [opened, setOpened] = useState<ReadonlySet<GroupTab>>(new Set<GroupTab>(['members']));
  const [createdNotice, dismissCreated] = useGroupNotice(groupNoticeChannel(groupId));
  const [banner, setBanner] = useState<GroupBanner | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // The group has just been deleted here: nothing may refetch (and answer 404) while the screen leaves.
  const [leaving, setLeaving] = useState(false);
  // The group is gone but the teacher had moved on when the answer came: the screen leaves when it is back.
  const leaveOnReturn = useRef(false);
  const stillHere = useStillHere();
  const focused = useScreenFocused();
  useEffect(() => {
    if (!leaveOnReturn.current || !focused) return;
    leaveOnReturn.current = false;
    navigation.back();
  }, [focused, navigation]);
  const leave = () => {
    if (onGone) onGone();
    // `back` from a screen that is not on top would close whatever the teacher went to.
    else if (stillHere()) navigation.back();
    else leaveOnReturn.current = true;
  };
  // The attendance poll runs only while this screen is on top and the app is in the foreground.
  const screenLive = useScreenLive();

  // With the members in their own panel the other panel never shows them: it opens on the attendance.
  const tab: GroupTab = split && picked === 'members' ? 'attendance' : picked;
  const visited = opened.has(tab) ? opened : new Set(opened).add(tab);

  const group = useQuery({
    queryKey: qk('groups', 'getGroup', groupId),
    queryFn: () => api.groups.getGroup(groupId),
    enabled: !leaving,
  });
  const statistics = useQuery({
    queryKey: qk('groups', 'getGroupStatistics', groupId),
    queryFn: () => api.groups.getGroupStatistics(groupId),
    enabled: visited.has('statistics') && !leaving,
  });
  const attendance = useQuery({
    queryKey: qk('groups', 'getGroupAttendance', groupId, ATTENDANCE_PERIOD),
    queryFn: () => api.groups.getGroupAttendance(groupId, ATTENDANCE_PERIOD),
    enabled: visited.has('attendance') && !leaving,
    // Students join and submit while a lesson runs: realtime refreshes the table, this is the fallback.
    refetchInterval: (query) =>
      tab === 'attendance' && !leaving && screenLive && hasActiveLesson(query.state.data) ? POLLING.lessonLiveMs : false,
  });

  // Membership has no realtime event (06 §5) and this screen stays mounted under the student card and the
  // lesson board: what went stale meanwhile is reloaded when it comes back (00 §2.3 "refetch on focus").
  useRefetchOnFocus(
    leaving
      ? []
      : [group, ...(visited.has('statistics') ? [statistics] : []), ...(visited.has('attendance') ? [attendance] : [])],
  );

  const { refreshing, refresh } = usePullRefresh([
    group,
    visited.has('statistics') && statistics,
    visited.has('attendance') && attendance,
  ]);

  const selectTab = (next: GroupTab) => {
    setPicked(next);
    setOpened((current) => (current.has(next) ? current : new Set(current).add(next)));
  };

  return {
    groupId,
    group,
    data: group.data,
    statistics,
    attendance,
    report,
    attendanceWait,
    tab,
    selectTab,
    createdNotice,
    dismissCreated,
    banner,
    setBanner,
    menuOpen,
    setMenuOpen,
    refreshing,
    refresh,
    /** A foreign or deleted group is indistinguishable from a missing one. */
    missing: isNotFoundError(group.error) && !leaving,
    onDeleted: () => {
      setLeaving(true);
      dismissCreated();
      // The site redirects to the list with «Группа удалена. Ученики остались на платформе.»
      postGroupNotice(GROUPS_LIST_NOTICE, 'deleted');
      leave();
    },
    onMissing: () => {
      setLeaving(true);
      dismissCreated();
      postGroupNotice(GROUPS_LIST_NOTICE, 'missing');
      leave();
    },
  };
}

export type GroupDetailState = ReturnType<typeof useGroupDetail>;
