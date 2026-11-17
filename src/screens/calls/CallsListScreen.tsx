import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { HIGHLIGHT_FLASH_MS, errorText, qk, useApi } from '@/api';
import type { ParentCallStudentOverview } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, useScreenFocused, type AppLink, type ScreenParams } from '@/navigation';
import { useCurrentUser } from '@/providers';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, LoadingState, Notice, PageHeader, Screen } from '@/ui';

import { CallRow } from './list/call-row';
import { SummaryBar } from './list/summary-bar';
import { buildCallRows, rowIndexOfStudent, type CallListRow } from './logic';
import { HistorySheet } from './sheets/history-sheet';
import { RecordCallSheet, type RecordCallTarget } from './sheets/record-call-sheet';

/** Route params of `calls.list` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type CallsListScreenProps = ScreenParams['calls.list'];

type ListNotice = { tone: 'success' | 'error'; text: string };

/** The one sheet that is open — the site's "only one panel in the whole list". */
type Overlay = { kind: 'record'; target: RecordCallTarget } | { kind: 'history'; studentId: string };

/** The three counters stay pinned while the rows scroll. */
const STICKY_SUMMARY = [0];

/**
 * `calls.list` (docs/spec/06-teacher-groups-calls-stats.md §1.4): who needs a parent call. A TEACHER sees
 * the own students and records calls; a DEVELOPER sees every student with the teacher's name and only
 * reads. The server sorts the rows (overdue → due → ok) and counts the days in Moscow time.
 *
 * `studentId` comes from a `parent_call_due` notification: that row is scrolled to and flashed for
 * `HIGHLIGHT_FLASH_MS`; nothing is opened, and an id that is not in the list changes nothing.
 *
 * Call comments are personal data: they are shown in the history sheet only and never leave memory.
 */
export function CallsListScreen({ studentId }: CallsListScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const focused = useScreenFocused();
  const user = useCurrentUser();
  const { dict, m } = useI18n();
  const t = dict.planner.calls;
  const isDeveloper = user.role === 'DEVELOPER';
  const listRef = useRef<FlashListRef<CallListRow>>(null);

  const [notice, setNotice] = useState<ListNotice | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // From a saved call until the list has reloaded: the row is about to change its state and place.
  const [settling, setSettling] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: qk('groups', 'getParentCallsOverview'),
    queryFn: () => api.groups.getParentCallsOverview(),
  });
  const data = overview.data;
  useRefetchOnFocus([overview]);

  const rows = useMemo(() => buildCallRows(data?.students ?? []), [data]);
  const canRecord = data?.canRecord === true;

  // ── highlight from a notification ──────────────────────────────────────────────────────────────
  // Which `studentId` has been dealt with; reset when the parameter goes away, so the same
  // notification can point at the row again.
  const handledId = useRef<string | null>(null);
  const latest = useRef({ rows, focused, navigation });
  useEffect(() => {
    latest.current = { rows, focused, navigation };
  });

  const listed = data !== undefined;
  useEffect(() => {
    if (!studentId) {
      handledId.current = null;
      return;
    }
    if (!listed || handledId.current === studentId) return;
    // One frame later: the list has to lay its rows out before it can scroll to one of them.
    const timer = setTimeout(() => {
      handledId.current = studentId;
      const index = rowIndexOfStudent(latest.current.rows, studentId);
      if (index === -1) return;
      setFlashId(studentId);
      void listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    }, 50);
    return () => clearTimeout(timer);
  }, [studentId, listed]);

  useEffect(() => {
    if (flashId === null) return;
    const timer = setTimeout(() => {
      setFlashId(null);
      // The site drops `?studentId=` from the address once the highlight is over; the tab does the same
      // while it is the screen in front (a replace from the background would switch tabs).
      if (latest.current.focused) latest.current.navigation.replace({ screen: 'calls.list' });
    }, HIGHLIGHT_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashId]);

  // ── actions ────────────────────────────────────────────────────────────────────────────────────
  const { refreshing, refresh } = usePullRefresh([overview]);

  /** A banner is useless below the fold: bring the list back to its top with it. */
  const announce = (next: ListNotice) => {
    setNotice(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const reloadAfterChange = () => {
    setSettling(true);
    // The overview, the teacher's home widget (counts) and the bell (a REACHED call marks the student's
    // reminders read). Parent calls have no realtime event: this is the only refresh (06 §5).
    void queryClient.invalidateQueries({ queryKey: qk('groups', 'getParentCallCounts') });
    void queryClient.invalidateQueries({ queryKey: qk('groups', 'getParentCallHistory') });
    void queryClient.invalidateQueries({ queryKey: qk('teacherStudents', 'getTeacherHome') });
    void queryClient.invalidateQueries({ queryKey: qk('shell', 'listNotifications') });
    void queryClient
      .invalidateQueries({ queryKey: qk('groups', 'getParentCallsOverview') })
      .finally(() => setSettling(false));
  };

  const onSaved = () => {
    setOverlay(null);
    // SPEC-GAP: the site closes the inline form and reloads without a message; a sheet that just
    // disappears gives no confirmation on a phone, so the list says «Звонок записан».
    announce({ tone: 'success', text: m.calls.log.saved });
    reloadAfterChange();
  };

  const onMissing = (message: string) => {
    setOverlay(null);
    announce({ tone: 'error', text: message });
    reloadAfterChange();
  };

  const openRecord = (student: ParentCallStudentOverview) => {
    // The banner of the previous call would read as the result of this one.
    setNotice(null);
    setOverlay({ kind: 'record', target: { studentId: student.studentId, studentName: student.studentName } });
  };
  const openHistory = (student: ParentCallStudentOverview) => setOverlay({ kind: 'history', studentId: student.studentId });

  // The history sheet follows the live row; a student that left the list closes it.
  const historyStudent =
    overlay?.kind === 'history' ? (data?.students.find((student) => student.studentId === overlay.studentId) ?? null) : null;

  // ── pieces ─────────────────────────────────────────────────────────────────────────────────────
  // The sentence of the empty state links to the students section; a developer has accounts instead.
  const studentsLink: AppLink = isDeveloper ? { screen: 'developer.accounts' } : { screen: 'teacher.students' };

  const header = (
    <View style={styles.header}>
      <PageHeader title={t.title} gap={0} />
      {notice ? (
        <Notice
          tone={notice.tone}
          text={notice.text}
          onDismiss={() => setNotice(null)}
          dismissLabel={m.common.actions.close}
          testID="calls-notice"
        />
      ) : null}
      {/* Cached rows stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {overview.isError && data ? (
        <Notice tone="error" text={errorText(overview.error, m.common.errors.generic)} testID="calls-refresh-error" />
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: CallListRow }) =>
    item.type === 'summary' ? (
      data ? (
        <SummaryBar counts={data.counts} />
      ) : null
    ) : (
      <View style={styles.item}>
        <CallRow
          student={item.student}
          canRecord={canRecord}
          showTeacher={isDeveloper}
          highlighted={flashId === item.student.studentId}
          recordDisabled={settling}
          onRecord={openRecord}
          onHistory={openHistory}
        />
      </View>
    );

  return (
    <Screen
      testID="calls-list-screen"
      header={<ShellAppBar title={screenTitle('calls.list', m.shell.tabs)} />}
      bottomInset={false}
      scroll={!data}
      padded={!data}
      onRefresh={data ? undefined : isLoadFailed(overview) ? refresh : undefined}
      refreshing={refreshing}
    >
      {data ? (
        <FlashList
          ref={listRef}
          data={rows}
          keyExtractor={(row) => (row.type === 'summary' ? 'summary' : row.student.studentId)}
          getItemType={(row) => row.type}
          renderItem={renderRow}
          // `flashId` and `settling` change what a row draws without changing the data.
          extraData={`${flashId ?? ''}|${settling}|${canRecord}`}
          stickyHeaderIndices={rows.length > 0 ? STICKY_SUMMARY : undefined}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.item}>
              <EmptyState
                title={t.emptyTitle}
                hint={`${t.emptyBefore}${t.emptyLink}${t.emptyAfter}`}
                action={
                  navigation.canOpen(studentsLink) ? (
                    <Button
                      label={format(m.calls.empty.openSection, { section: screenTitle(studentsLink.screen, m.shell.tabs) })}
                      variant="outline"
                      rightIcon="forward"
                      onPress={() => navigation.open(studentsLink)}
                      testID="calls-empty-open"
                    />
                  ) : undefined
                }
                testID="calls-empty"
              />
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={theme.colors.accentSolid}
              colors={[theme.colors.accentSolid]}
              progressBackgroundColor={theme.colors.cardBg}
            />
          }
          testID="calls-list"
        />
      ) : isLoadFailed(overview) ? (
        <LoadFailure query={overview} testID="calls-error" />
      ) : (
        <LoadingState variant="cards" count={5} cardHeight={132} accessibilityLabel={m.common.a11y.loading} testID="calls-loading" />
      )}

      {canRecord ? (
        <RecordCallSheet
          target={overlay?.kind === 'record' ? overlay.target : null}
          onClose={() => setOverlay(null)}
          onSaved={onSaved}
          onMissing={onMissing}
        />
      ) : null}
      <HistorySheet student={historyStudent} showTeacher={isDeveloper} onClose={() => setOverlay(null)} />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  // The gutters live inside the cells, not on the list: a pinned cell is laid out against the list's
  // own edges, so the counters would otherwise touch the screen sides while they are stuck.
  listContent: { paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.md, paddingHorizontal: t.space.gutter, paddingBottom: t.space.xs },
  // Gaps live inside the items too: FlashList measures each cell, separators would not follow the header.
  item: { paddingHorizontal: t.space.gutter, paddingTop: t.space.xs, paddingBottom: t.space.xs },
}));
