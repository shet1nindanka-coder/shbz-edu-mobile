import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { ParentCallEntry, ParentCallStudentOverview } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Notice, Text } from '@/ui';

import { HISTORY_PAGE_SIZE, earlierHistoryCursor, historyEntryTime, mergeHistory } from '../logic';

export type CallHistoryProps = {
  /** The student whose calls are shown (the live overview row). */
  student: ParentCallStudentOverview;
  /** DEVELOPER: who made each call is named. */
  showTeacher: boolean;
};

/**
 * The calls of one student (06 §1.4 "History panel"): the newest 20 arrive with the overview; earlier ones
 * — unreachable on the site although its button counts them (06 §7 Q10) — load page by page.
 *
 * Comments are personal data. They are rendered here and in the developer's journal, nowhere else; the
 * queries behind this block are excluded from the persisted cache (src/services/query/persist-policy.ts).
 *
 * The block has no scroller of its own: it lives inside a sheet or a panel that scrolls, and the log
 * grows only by a page per «Показать более ранние».
 */
export function CallHistory({ student, showTeacher }: CallHistoryProps) {
  const styles = useStyles();
  const api = useApi();
  const { m } = useI18n();
  // Earlier pages are requested only after the user asks for them.
  const [expanded, setExpanded] = useState(false);
  const cursor = earlierHistoryCursor(student);

  const earlier = useInfiniteQuery({
    // The key names the anchor: a newly recorded call shifts the overview's 20 and starts a new chain.
    queryKey: qk('groups', 'getParentCallHistory', student.studentId, { limit: HISTORY_PAGE_SIZE, before: cursor ?? undefined }),
    queryFn: ({ pageParam }) => api.groups.getParentCallHistory(student.studentId, { limit: HISTORY_PAGE_SIZE, before: pageParam }),
    initialPageParam: cursor ?? '',
    getNextPageParam: (last) => {
      const oldest = last.calls[last.calls.length - 1];
      return last.hasMore && oldest ? oldest.id : undefined;
    },
    enabled: expanded && cursor !== null,
  });

  const entries = mergeHistory(student.history, earlier.data?.pages.map((page) => page.calls) ?? []);
  const hasMore = cursor !== null && (earlier.data ? earlier.hasNextPage : true);
  const loading = earlier.isFetching;
  // Offline the request waits for the connection instead of failing: say so, do not spin forever.
  const paused = earlier.fetchStatus === 'paused';

  const showEarlier = () => {
    if (!expanded) setExpanded(true);
    else if (paused || (earlier.isError && !earlier.data)) void earlier.refetch();
    else void earlier.fetchNextPage();
  };

  return (
    <View style={styles.block}>
      <View accessibilityRole="list" testID="call-history-list">
        {entries.map((entry, index) => (
          <CallHistoryEntry key={entry.id} entry={entry} showTeacher={showTeacher} divider={index < entries.length - 1} />
        ))}
      </View>

      {cursor !== null ? (
        <Text variant="small" color="textMuted" tabular testID="call-history-shown">
          {format(m.calls.history.shownOf, { shown: entries.length, total: Math.max(student.totalCalls, entries.length) })}
        </Text>
      ) : null}

      {paused || earlier.isError ? (
        <Notice
          tone="error"
          text={paused ? m.common.errors.network : errorText(earlier.error, m.calls.history.loadFailed)}
          testID="call-history-error"
        />
      ) : null}

      {hasMore ? (
        <Button
          label={loading ? m.common.states.loading : m.calls.history.showEarlier}
          variant="outline"
          onPress={showEarlier}
          loading={loading}
          fullWidth
          testID="call-history-more"
        />
      ) : null}
    </View>
  );
}

export type CallHistoryEntryProps = {
  entry: ParentCallEntry;
  showTeacher: boolean;
  divider: boolean;
  /** The journal names the student above the line; a student's own history does not need to. */
  studentName?: string;
};

/** One call: when and how it ended, who called (developer), and the comment with the teacher's line breaks. */
export function CallHistoryEntry({ entry, showTeacher, divider, studentName }: CallHistoryEntryProps) {
  const styles = useStyles();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.calls;
  const outcome = entry.outcome === 'REACHED' ? t.reached : t.noAnswer;
  const when = historyEntryTime(entry, locale);
  const by = showTeacher && entry.teacherName ? ` ${format(m.calls.history.by, { name: entry.teacherName })}` : '';

  return (
    <View style={[styles.entry, divider ? styles.entryDivider : null]} testID={`call-history-entry-${entry.id}`}>
      {studentName ? (
        <View style={styles.entryHead}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.entryName}>
            {studentName}
          </Text>
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {outcome}
          </Text>
        </View>
      ) : null}
      <Text variant={studentName ? 'small' : 'bodyStrong'} color={studentName ? 'textMuted' : 'textStrong'}>
        {studentName ? `${when}${by}` : `${when} · ${outcome}${by}`}
      </Text>
      {entry.comment ? (
        // Pre-wrapped like on the site: the teacher's line breaks are kept.
        <Text variant={studentName ? 'body' : 'small'} color={studentName ? 'textStrong' : 'textMuted'} selectable>
          {entry.comment}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.md },
  entry: { gap: t.space.xxxs, paddingVertical: t.space.md },
  entryDivider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  entryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.sm },
  entryName: { flex: 1, minWidth: 0 },
}));
