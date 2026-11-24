import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { ParentCallEntry, ParentCallStudentOverview } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { useNowTick } from '@/services/clock';
import { makeStyles, useTheme } from '@/theme';
import { Button, Icon, Notice, Text, accessibilityLabelOf } from '@/ui';

import { HISTORY_PAGE_SIZE, earlierHistoryCursor, historyEntryDay, historyEntryTime, mergeHistory } from '../logic';

/** The year of «now» decides whether an entry shows its year: an hour's precision is plenty. */
const NOW_TICK_MS = 3_600_000;

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
 * grows only by a page per «Показать ещё». It has no caption: the rows — a phone glyph and a day — say
 * what they are; the list's name is spoken.
 */
export function CallHistory({ student, showTeacher }: CallHistoryProps) {
  const styles = useStyles();
  const api = useApi();
  const { m } = useI18n();
  // Earlier pages are requested only after the user asks for them.
  const [expanded, setExpanded] = useState(false);
  const cursor = earlierHistoryCursor(student);
  const now = useNowTick(NOW_TICK_MS);

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
      <View accessibilityRole="list" accessibilityLabel={m.calls.history.title} testID="call-history-list">
        {entries.map((entry, index) => (
          <CallHistoryEntry key={entry.id} entry={entry} now={now} showTeacher={showTeacher} divider={index < entries.length - 1} />
        ))}
      </View>

      {paused || earlier.isError ? (
        <Notice
          tone="error"
          text={paused ? m.common.errors.network : errorText(earlier.error, m.calls.history.loadFailed)}
          testID="call-history-error"
        />
      ) : null}

      {hasMore ? (
        <Button
          label={loading ? m.common.states.loading : m.common.actions.showMore}
          // «Показано 20 из 34» is said, not shown: the eye sees the log itself.
          accessibilityLabel={accessibilityLabelOf([
            m.calls.history.showEarlier,
            format(m.calls.history.shownOf, { shown: entries.length, total: Math.max(student.totalCalls, entries.length) }),
          ])}
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
  /** The current instant (a coarse tick): a call of an earlier year shows its year. */
  now: number;
  showTeacher: boolean;
  divider: boolean;
  /** The journal names the student in the head line; a student's own history does not need to. */
  studentName?: string;
};

/**
 * One call (docs/design/glass-over-paper.md §1a): a phone glyph for how it ended — with «не дозвонились»
 * only on an unanswered one — the day, who called (developer), and the comment with the teacher's line
 * breaks. The time of day and the site's wording are in the spoken name of the head line.
 */
export function CallHistoryEntry({ entry, now, showTeacher, divider, studentName }: CallHistoryEntryProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.calls;
  const reached = entry.outcome === 'REACHED';
  const day = historyEntryDay(entry, now, locale);
  const teacher = showTeacher ? entry.teacherName : null;
  // The journal's head line is the student, so the day moves under it, next to the teacher.
  const caption = studentName ? (teacher ? format(m.calls.history.by, { day, name: teacher }) : day) : teacher;

  return (
    <View style={[styles.entry, divider ? styles.entryDivider : null]} testID={`call-history-entry-${entry.id}`}>
      <View
        accessible
        accessibilityLabel={accessibilityLabelOf([studentName, historyEntryTime(entry, locale), reached ? t.reached : t.noAnswer, teacher])}
        style={styles.entryHead}
      >
        <Icon name={reached ? 'phone' : 'phoneMissed'} size={theme.sizes.icon.sm} color={reached ? 'textStrong' : 'textMuted'} />
        <Text variant="bodyStrong" tabular={!studentName} numberOfLines={1} style={styles.entryName}>
          {studentName ?? day}
        </Text>
        {reached ? null : (
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {m.calls.history.noAnswer}
          </Text>
        )}
      </View>
      {caption ? (
        <Text variant="small" color="textMuted" tabular numberOfLines={1} style={styles.entryBody}>
          {caption}
        </Text>
      ) : null}
      {entry.comment ? (
        // Pre-wrapped like on the site: the teacher's line breaks are kept.
        <Text variant={studentName ? 'body' : 'small'} color={studentName ? 'textStrong' : 'textMuted'} selectable style={styles.entryBody}>
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
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  entryName: { flex: 1, minWidth: 0 },
  // Under the head's text, not under its glyph.
  entryBody: { paddingLeft: t.sizes.icon.sm + t.space.xs },
}));
