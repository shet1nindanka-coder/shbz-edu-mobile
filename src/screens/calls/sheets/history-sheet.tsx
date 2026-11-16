import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { qk, useApi } from '@/api';
import type { ParentCallEntry, ParentCallStudentOverview } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { errorText } from '@/screens/groups/shared/error-text';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Notice, Text } from '@/ui';

import { HISTORY_PAGE_SIZE, earlierHistoryCursor, historyEntryTime, mergeHistory } from '../logic';

export type HistorySheetProps = {
  /** The student whose calls are shown (the live overview row); null = the sheet is closed. */
  student: ParentCallStudentOverview | null;
  /** DEVELOPER: who made each call is named. */
  showTeacher: boolean;
  onClose: () => void;
};

/**
 * «История (n)» (06 §1.4 "History panel"): the newest 20 calls arrive with the overview; earlier ones —
 * unreachable on the site although the button counts them (06 §7 Q10) — load page by page.
 *
 * Comments are personal data. They are rendered here and nowhere else; the queries behind this sheet are
 * excluded from the persisted cache (src/services/query/persist-policy.ts).
 */
export function HistorySheet({ student, showTeacher, onClose }: HistorySheetProps) {
  const { m } = useI18n();
  const [shown, setShown] = useState<ParentCallStudentOverview | null>(student);
  if (student !== null && student !== shown) setShown(student);

  return (
    <BottomSheet
      visible={student !== null}
      onClose={onClose}
      onClosed={() => setShown(null)}
      closeLabel={m.common.actions.close}
      title={m.calls.history.sheetTitle}
      testID="call-history-sheet"
    >
      {shown ? <HistoryContent key={shown.studentId} student={shown} showTeacher={showTeacher} /> : null}
    </BottomSheet>
  );
}

function HistoryContent({ student, showTeacher }: { student: ParentCallStudentOverview; showTeacher: boolean }) {
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
    <View style={styles.content}>
      <Text variant="bodyStrong" numberOfLines={2} testID="call-history-student">
        {student.studentName}
      </Text>

      <View accessibilityRole="list">
        {entries.map((entry, index) => (
          <HistoryEntry key={entry.id} entry={entry} showTeacher={showTeacher} divider={index < entries.length - 1} />
        ))}
      </View>

      {cursor !== null ? (
        <Text variant="caption" color="textMuted" tabular testID="call-history-shown">
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

function HistoryEntry({ entry, showTeacher, divider }: { entry: ParentCallEntry; showTeacher: boolean; divider: boolean }) {
  const styles = useStyles();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.calls;
  const reached = entry.outcome === 'REACHED';

  return (
    <View style={[styles.entry, divider ? styles.entryDivider : null]} testID={`call-history-entry-${entry.id}`}>
      <Text variant="small" color="textMuted">
        {`${historyEntryTime(entry, locale)} · `}
        <Text variant={reached ? 'smallBold' : 'small'} color={reached ? 'textStrong' : 'textMuted'}>
          {reached ? t.reached : t.noAnswer}
        </Text>
        {showTeacher && entry.teacherName ? ` ${format(m.calls.history.by, { name: entry.teacherName })}` : ''}
      </Text>
      {entry.comment ? (
        // Pre-wrapped like on the site: the teacher's line breaks are kept.
        <Text variant="small" color="label" selectable>
          {entry.comment}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md, paddingTop: t.space.xs },
  entry: { gap: t.space.xxs, paddingVertical: t.space.md },
  entryDivider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
}));
