// Status history of one number of one student (`ProgressStatusHistory` of the site,
// docs/spec/04-teacher-students.md D4): a bottom sheet opened from a "Status history" action on the
// homework review, on the lesson board and in the developer journal.
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { qk, useApi } from '@/api';
import type { HomeworkNumberStatus, ProgressHistoryEntry } from '@/api/types';
import { formatMsk } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { useNavTarget } from '@/navigation';
import { historyReferenceTarget } from '@/navigation/targets';
import { useCurrentUser } from '@/providers';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Notice, Spinner, Text, TextButton } from '@/ui';

export type ProgressHistorySheetProps = {
  studentId: string;
  homeworkNumberId: string;
  visible: boolean;
  onClose: () => void;
  /** The lesson whose board the sheet was opened from: a reference to it is not offered as a link. */
  currentLessonId?: string;
  /**
   * The sheet is open on this student's homework review: an "open homework" reference calls this (the
   * screen scrolls to that homework) instead of opening the student card a second time.
   */
  onOpenHomework?: (assignmentId: string) => void;
  testID?: string;
};

/**
 * Loads `GET /progress-history` when opened (20 entries per page, newest first) and again whenever a
 * status write invalidates the `teacherStudents` queries while it is open.
 */
export function ProgressHistorySheet(props: ProgressHistorySheetProps) {
  const { visible, onClose, currentLessonId, onOpenHomework, testID } = props;
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.topics.history;
  const statuses = dict.progress.statuses;

  // The owner usually clears the ids together with `visible`; the number that was shown stays on screen
  // while the sheet slides away.
  const [shown, setShown] = useState({ studentId: props.studentId, homeworkNumberId: props.homeworkNumberId });
  if (visible && (shown.studentId !== props.studentId || shown.homeworkNumberId !== props.homeworkNumberId)) {
    setShown({ studentId: props.studentId, homeworkNumberId: props.homeworkNumberId });
  }
  const studentId = visible ? props.studentId : shown.studentId;
  const homeworkNumberId = visible ? props.homeworkNumberId : shown.homeworkNumberId;

  const history = useInfiniteQuery({
    // "pages" keeps this paged cache apart from a plain read of the first page under the same method key.
    queryKey: qk('teacherStudents', 'getProgressHistory', studentId, homeworkNumberId, 'pages'),
    queryFn: ({ pageParam }) => api.teacherStudents.getProgressHistory(studentId, homeworkNumberId, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: visible,
    // Always the current history: it is opened right after a mark was changed.
    staleTime: 0,
  });
  const first = history.data?.pages[0];
  // Offline a fetch over cached pages (the next page, or the refetch every opening starts) fails once and
  // then waits for the connection without an error and without `isFetchingNextPage`: say so, or «Более
  // ранние записи» would silently do nothing.
  const paused = history.fetchStatus === 'paused';
  const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
  const statusLabel = (status: HomeworkNumberStatus | null) => statuses[status ?? 'none'];

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={m.common.actions.close} title={t.show} testID={testID ?? 'progress-history-sheet'}>
      <View style={styles.content}>
        {first ? (
          <>
            <View style={styles.summary}>
              <Text variant="bodyBold">
                {[first.studentName, format(dict.topics.widgets.numberLabel, { number: first.number }), first.topicTitle].join(' · ')}
              </Text>
              <Text variant="small" color="textMuted">
                {format(t.current, { status: statusLabel(first.currentStatus) })}
              </Text>
            </View>

            {paused ? (
              <Notice tone="error" text={m.common.errors.network} testID="progress-history-offline" />
            ) : history.isError ? (
              <Notice tone="error" text={t.loadFailedShort} testID="progress-history-refresh-error" />
            ) : null}

            {entries.length === 0 ? (
              <Text variant="small" color="textMuted" testID="progress-history-empty">
                {t.empty}
              </Text>
            ) : (
              <View style={styles.entries}>
                {entries.map((entry, index) => (
                  <HistoryEntryRow
                    key={entry.id}
                    entry={entry}
                    studentId={studentId}
                    currentLessonId={currentLessonId}
                    last={index === entries.length - 1}
                    statusLabel={statusLabel}
                    onNavigate={onClose}
                    onOpenHomework={onOpenHomework}
                  />
                ))}
              </View>
            )}

            {history.hasNextPage ? (
              <Button
                label={t.earlier}
                variant="outline"
                loading={history.isFetchingNextPage}
                onPress={() => void history.fetchNextPage()}
                testID="progress-history-earlier"
                style={styles.earlier}
              />
            ) : null}

            <Text variant="caption" color="textMuted">
              {t.notRecorded}
            </Text>
          </>
        ) : history.isError || paused ? (
          // A paused first read = no connection and nothing cached: the same message as a failed one.
          <Notice
            tone="error"
            // `403 unauthorized`, `404 historyNotFound`, `429 rateLimited` and a lost connection all read the same here.
            text={t.loadFailed}
            action={<Button label={t.retry} size="sm" variant="outline" loading={history.isFetching} onPress={() => void history.refetch()} testID="progress-history-retry" />}
            testID="progress-history-error"
          />
        ) : (
          <View accessibilityRole="progressbar" accessibilityLabel={t.loading} style={styles.loading} testID="progress-history-loading">
            <Spinner size={20} color="accentSolid" />
            <Text variant="small" color="textMuted">
              {t.loading}
            </Text>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

type HistoryEntryRowProps = {
  entry: ProgressHistoryEntry;
  studentId: string;
  currentLessonId?: string;
  last: boolean;
  statusLabel: (status: HomeworkNumberStatus | null) => string;
  /** Called before following a reference, so the sheet does not stay over the screen it leads to. */
  onNavigate: () => void;
  onOpenHomework?: (assignmentId: string) => void;
};

function HistoryEntryRow({ entry, studentId, currentLessonId, last, statusLabel, onNavigate, onOpenHomework }: HistoryEntryRowProps) {
  const styles = useStyles();
  const { dict, locale } = useI18n();
  const t = dict.topics.history;
  const lib = dict.topics.lib.history;
  const user = useCurrentUser();
  const sources: Record<string, string> = dict.progress.sources;
  const decisions: Record<string, string> = dict.progress.decisions;

  const isCurrentLesson = entry.reference?.kind === 'lesson' && entry.reference.lessonId === currentLessonId;
  // A screen that is not registered for the viewer's role is never offered as a link (90-addendum-2 B.2).
  const target = useNavTarget(isCurrentLesson ? null : historyReferenceTarget(entry.reference, studentId, user.role));
  const actor = entry.actorName ?? (entry.source === 'lesson_end' ? lib.system : lib.ai);
  const reference = entry.reference;
  // On the student's own review the homework is on the screen under the sheet.
  const inPlace = reference?.kind === 'homework' && onOpenHomework ? () => onOpenHomework(reference.assignmentId) : null;

  return (
    <View style={[styles.entry, last ? null : styles.entryDivider]} testID={`progress-history-entry-${entry.id}`}>
      <Text variant="caption" color="textMuted" tabular>
        {`${formatMsk(entry.createdAt, 'dateTimeSeconds', locale)} ${t.timeZone} · ${actor}`}
      </Text>
      <Text variant="smallStrong">{`${sources[entry.source] ?? entry.source}: ${statusLabel(entry.previousStatus)} → ${statusLabel(entry.status)}`}</Text>
      <Text variant="caption" color="textMuted">
        {decisions[entry.decision] ?? entry.decision}
      </Text>
      {reference && (inPlace || target.canOpen) ? (
        <TextButton
          label={reference.kind === 'lesson' ? lib.openLesson : lib.openHomework}
          onPress={() => {
            onNavigate();
            if (inPlace) inPlace();
            else target.open();
          }}
          testID={`progress-history-reference-${entry.id}`}
          style={styles.reference}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md, paddingBottom: t.space.sm },
  summary: { gap: t.space.xxs },
  entries: { gap: 0 },
  entry: { gap: 2, paddingVertical: t.space.sm },
  entryDivider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  reference: { alignSelf: 'flex-start', marginTop: 2 },
  earlier: { alignSelf: 'flex-start' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, paddingVertical: t.space.lg },
}));
