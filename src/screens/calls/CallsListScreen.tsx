import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View, type ScrollViewInstance } from 'react-native';

import { HIGHLIGHT_FLASH_MS, errorText, qk, useApi } from '@/api';
import type { ParentCallStudentOverview, RecordCallResponse } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, useScreenFocused, type AppLink, type ScreenParams } from '@/navigation';
import { useCurrentUser } from '@/providers';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, ListCard, LoadingState, Notice, Panel, Panels, Screen, Text } from '@/ui';

import { CallRow } from './list/call-row';
import { summaryLine } from './logic';
import { CallJournalPanel } from './panels/call-journal-panel';
import { RecordCallPanel } from './panels/record-call-panel';
import { HistorySheet } from './sheets/history-sheet';
import { RecordCallSheet, type RecordCallTarget } from './sheets/record-call-sheet';

/** Route params of `calls.list` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type CallsListScreenProps = ScreenParams['calls.list'];

type ListNotice = { tone: 'success' | 'error'; text: string };

/** The one sheet that is open — the site's "only one panel in the whole list". */
type Overlay = { kind: 'record'; target: RecordCallTarget } | { kind: 'history'; studentId: string };

/**
 * `calls.list` (docs/spec/06-teacher-groups-calls-stats.md §1.4; layout: docs/design/glass-over-paper.md
 * §7): who needs a parent call. A TEACHER sees the own students and records calls; a DEVELOPER sees every
 * student with the teacher's name and only reads. The server sorts the rows (overdue → due → ok) and
 * counts the days in Moscow time.
 *
 * Phone: one card of rows; a row opens a sheet — the record form with the earlier calls under it for a
 * teacher, the history alone for a developer. Tablet: the list is the left panel; the right one is the
 * form of the selected student (teacher) or the journal of the latest calls (developer).
 *
 * `studentId` comes from a `parent_call_due` notification: that row is scrolled to and flashed for
 * `HIGHLIGHT_FLASH_MS`; nothing is opened, and an id that is not in the list changes nothing.
 *
 * Call comments are personal data: they are shown in the history and in the developer's journal only —
 * never in a row — and never leave memory.
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
  const scrollRef = useRef<ScrollViewInstance>(null);

  const [notice, setNotice] = useState<ListNotice | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // Tablet: the student whose form the right panel shows; the first row until one is picked.
  const [pickedId, setPickedId] = useState<string | null>(null);
  // From a saved call until the list has reloaded: the row is about to change its state and place.
  const [settling, setSettling] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: qk('groups', 'getParentCallsOverview'),
    queryFn: () => api.groups.getParentCallsOverview(),
  });
  const data = overview.data;
  useRefetchOnFocus([overview]);

  const students = data?.students;
  const canRecord = data?.canRecord === true;
  // Two panels need something to show in both: an empty list keeps the one-column empty state.
  const panels = theme.tablet && students !== undefined && students.length > 0;

  // ── where the rows are, for scrolling to one of them ───────────────────────────────────────────
  // Offsets inside the scrolled content: what stands above the card (the header and the notices on a
  // phone, the panel's head on a tablet), then the row inside the card.
  const layout = useRef({ header: 0, list: 0, rows: new Map<string, number>() });
  const noteRow = (id: string, y: number) => {
    layout.current.rows.set(id, y);
  };

  // ── highlight from a notification ──────────────────────────────────────────────────────────────
  // Which `studentId` has been dealt with; reset when the parameter goes away, so the same
  // notification can point at the row again. The tab is a tab root and stays mounted: when the user left
  // it during the flash, the parameter cannot be dropped from the background, so the id is marked as not
  // dealt with and the highlight runs again when the tab is in front again (a later tap on the same
  // notification lands here with unchanged params) — and then drops the parameter.
  const handledId = useRef<string | null>(null);
  const latest = useRef({ students, focused, navigation, rowHeight: theme.sizes.row });
  useEffect(() => {
    latest.current = { students, focused, navigation, rowHeight: theme.sizes.row };
  });

  const listed = data !== undefined;
  useEffect(() => {
    if (!studentId) {
      handledId.current = null;
      return;
    }
    if (!listed || !focused || handledId.current === studentId) return;
    // One frame later: the list has to lay its rows out before it can scroll to one of them.
    const timer = setTimeout(() => {
      handledId.current = studentId;
      if (!latest.current.students?.some((student) => student.studentId === studentId)) return;
      setFlashId(studentId);
      const { header, list, rows } = layout.current;
      const row = rows.get(studentId);
      // A row or two stay above the highlighted one, so it reads as a place in the list.
      if (row !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, header + list + row - latest.current.rowHeight * 2), animated: true });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [studentId, listed, focused]);

  useEffect(() => {
    if (flashId === null) return;
    const timer = setTimeout(() => {
      setFlashId(null);
      // The site drops `?studentId=` from the address once the highlight is over; the tab does the same
      // while it is the screen in front (a replace from the background would switch tabs).
      if (latest.current.focused) latest.current.navigation.replace({ screen: 'calls.list' });
      else handledId.current = null;
    }, HIGHLIGHT_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashId]);

  // ── actions ────────────────────────────────────────────────────────────────────────────────────
  const { refreshing, refresh } = usePullRefresh([overview]);

  /** A banner is useless below the fold: bring the list back to its top with it. */
  const announce = (next: ListNotice) => {
    setNotice(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
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

  const onSaved = (_response: RecordCallResponse, target: RecordCallTarget) => {
    setOverlay(null);
    // Tablet: the reloaded list moves the student down; the panel stays with the call just recorded.
    if (panels) setPickedId(target.studentId);
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
    if (panels) setPickedId(student.studentId);
    else setOverlay({ kind: 'record', target: { studentId: student.studentId, studentName: student.studentName } });
  };
  const openHistory = (student: ParentCallStudentOverview) => setOverlay({ kind: 'history', studentId: student.studentId });

  // The sheets follow the live row; a student that left the list closes the history.
  const liveRow = (id: string | null | undefined) => (id ? (students?.find((student) => student.studentId === id) ?? null) : null);
  const historyStudent = overlay?.kind === 'history' ? liveRow(overlay.studentId) : null;
  const recordTarget = overlay?.kind === 'record' ? overlay.target : null;
  // Tablet: a picked student that left the list gives the panel back to the first row.
  const selected = panels && canRecord ? (liveRow(pickedId) ?? students[0] ?? null) : null;

  // ── pieces ─────────────────────────────────────────────────────────────────────────────────────
  // The sentence of the empty state links to the students section; a developer has accounts instead.
  const studentsLink: AppLink = isDeveloper ? { screen: 'developer.accounts' } : { screen: 'teacher.students' };

  const notices = (
    <>
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
    </>
  );

  // The site's summary line, as plain muted text: the chips of the rows carry the colour.
  const summary = data ? (
    <Text variant="small" color="textMuted" tabular accessibilityRole="summary" style={panels ? null : styles.summary} testID="calls-summary">
      {summaryLine(data.counts, t)}
    </Text>
  ) : null;

  const rows = students?.map((student, index) => (
    <CallRow
      key={student.studentId}
      student={student}
      canRecord={canRecord}
      showTeacher={isDeveloper}
      highlighted={flashId === student.studentId}
      selected={selected?.studentId === student.studentId}
      divider={index < students.length - 1}
      // A read-only viewer opens the history; there is nothing to open before the first call.
      onPress={canRecord ? openRecord : student.totalCalls > 0 ? openHistory : undefined}
      onLayout={noteRow}
    />
  ));

  const sheets = (
    <>
      {canRecord && !panels ? (
        <RecordCallSheet
          target={recordTarget}
          student={liveRow(recordTarget?.studentId)}
          settling={settling}
          onClose={() => setOverlay(null)}
          onSaved={onSaved}
          onMissing={onMissing}
        />
      ) : null}
      <HistorySheet student={historyStudent} showTeacher={isDeveloper} onClose={() => setOverlay(null)} />
    </>
  );

  const header = <ShellAppBar title={screenTitle('calls.list', m.shell.tabs)} />;

  if (panels) {
    return (
      <Screen testID="calls-list-screen" header={header} scroll={false} maxWidth="full">
        <Panels>
          <Panel edges weight={3} padded={false} scrollRef={scrollRef} refreshing={refreshing} onRefresh={refresh} testID="calls-list">
            <View style={styles.panelHead}>
              {notices}
              {summary}
            </View>
            <View
              onLayout={(event) => {
                layout.current.header = 0;
                layout.current.list = event.nativeEvent.layout.y;
              }}
            >
              {rows}
            </View>
          </Panel>
          {selected ? (
            <RecordCallPanel weight={2} student={selected} settling={settling} onSaved={onSaved} onMissing={onMissing} />
          ) : (
            <CallJournalPanel weight={2} students={students} showTeacher={isDeveloper} />
          )}
        </Panels>
        {sheets}
      </Screen>
    );
  }

  return (
    <Screen
      testID="calls-list-screen"
      header={
        <View
          onLayout={(event) => {
            layout.current.header = event.nativeEvent.layout.height;
          }}
        >
          {header}
        </View>
      }
      scrollRef={scrollRef}
      // A failed first load is retried by its own button; a pull has nothing to refresh before the data.
      onRefresh={data || isLoadFailed(overview) ? refresh : undefined}
      refreshing={refreshing}
    >
      {notices}
      {students ? (
        students.length === 0 ? (
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
        ) : (
          <>
            {summary}
            <View
              onLayout={(event) => {
                layout.current.list = event.nativeEvent.layout.y;
              }}
            >
              <ListCard testID="calls-list">{rows}</ListCard>
            </View>
          </>
        )
      ) : isLoadFailed(overview) ? (
        <LoadFailure query={overview} testID="calls-error" />
      ) : (
        <LoadingState variant="list" count={5} accessibilityLabel={m.common.a11y.loading} testID="calls-loading" />
      )}
      {sheets}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  // Stands where a section caption would: one muted line above the card.
  summary: { paddingHorizontal: t.space.xxs },
  panelHead: { gap: t.space.md, paddingHorizontal: t.space.card, paddingTop: t.space.sm, paddingBottom: t.space.xs },
}));
