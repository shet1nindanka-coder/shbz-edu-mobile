import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { AttendanceStatus, GroupAttendanceLesson, GroupAttendanceResponse, ReportPeriod } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { RetryWaitLine, type RetryWait } from '@/components/retry-wait';
import { nextAttendance } from '@/domain/attendance';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { Hint } from '@/providers';
import { useNowTick } from '@/services/clock';
import { makeStyles } from '@/theme';
import { BottomSheet, EmptyState, IconButton, ListRow, LoadingState, Notice, Segmented, Spinner, Text } from '@/ui';

import { applyAttendanceMark, applyPendingMarks, shortDateTime, type AttendanceCell } from '../logic';
import { AttendanceLessonList } from './attendance-lesson-list';
import { AttendanceMarkSheet, type AttendanceMarkTarget } from './attendance-mark-sheet';
import { AttendanceTable } from './attendance-table';
import { ReportExportNotice, attendanceReportKey, type ReportExport } from './use-report-export';

/** The group screen always shows the current academic year (06 §1.2 item 6). */
export const ATTENDANCE_PERIOD: ReportPeriod = 'year';

type Mode = 'table' | 'lessons';
type MarkInput = { lessonId: string; participantId: string; attendance: AttendanceStatus; previous: AttendanceStatus };

export type AttendanceTabProps = {
  groupId: string;
  attendance: UseQueryResult<GroupAttendanceResponse>;
  report: ReportExport;
  /** The cool-down of the marks (`useRetryWait`), owned by the screen: switching tabs unmounts this one,
   * and the server's limiter does not forget a refusal when the tab comes back. */
  wait: RetryWait;
};

/** Only the year of «now» matters to a lesson's date (see `shortDateTime`): a coarse tick. */
const NOW_TICK_MS = 3_600_000;

/**
 * «Посещаемость» (06 §1.2 item 6, §3.7, §4.3): the marks of the group's past lessons of the academic
 * year, as a table or lesson by lesson. A mark is applied at once and sent; if the server refuses it the
 * mark goes back and the reason is shown. The PDF reports are a download button; how a tap works is a
 * one-line hint, and the table has no legend — every cell says what it is to a screen reader, and the
 * long-press sheet names every mark.
 */
export function AttendanceTab({ groupId, attendance, report, wait }: AttendanceTabProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.attendance;
  const common = dict.planner.common;
  const [mode, setMode] = useState<Mode>('table');
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [markTarget, setMarkTarget] = useState<AttendanceMarkTarget | null>(null);
  const [markOpen, setMarkOpen] = useState(false);
  // Marks in flight (participant id → mark): shown over every read of the table until they settle.
  const [pending, setPending] = useState<Readonly<Record<string, AttendanceStatus>>>({});
  const [reportsOpen, setReportsOpen] = useState(false);
  const now = useNowTick(NOW_TICK_MS);

  const key = qk('groups', 'getGroupAttendance', groupId, ATTENDANCE_PERIOD);
  const patch = (participantId: string, value: AttendanceStatus) =>
    queryClient.setQueryData<GroupAttendanceResponse>(key, (current) =>
      current ? applyAttendanceMark(current, participantId, value) : current,
    );
  const setSaving = (participantId: string, saving: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (saving) next.add(participantId);
      else next.delete(participantId);
      return next;
    });

  const mark = useMutation({
    mutationFn: (input: MarkInput) => api.groups.setAttendance(input.lessonId, input.participantId, input.attendance),
    onMutate: async (input) => {
      setError(null);
      setSaving(input.participantId, true);
      // A read that leaves the server before the write (the live poll, a realtime refresh) must not switch
      // the optimistic mark back either: the mark is shown on top of every read until it settles.
      setPending((current) => ({ ...current, [input.participantId]: input.attendance }));
      // A refetch that started before the tap must not overwrite the optimistic mark.
      await queryClient.cancelQueries({ queryKey: key });
      patch(input.participantId, input.attendance);
    },
    onSuccess: async (result, input) => {
      // A read still in flight may predate the write: dropped, and the table is read again after it.
      const reading = queryClient.isFetching({ queryKey: key }) > 0;
      if (reading) await queryClient.cancelQueries({ queryKey: key });
      patch(input.participantId, result.attendance);
      if (reading) void queryClient.invalidateQueries({ queryKey: key });
      // The lesson board shows the same marks.
      void queryClient.invalidateQueries({ queryKey: qk('planner', 'getLessonBoard', input.lessonId) });
      void queryClient.invalidateQueries({ queryKey: qk('planner', 'getLessonLive', input.lessonId) });
    },
    onError: (failure, input) => {
      patch(input.participantId, input.previous);
      // 400 invalidMark, 404 participantNotFound, 429 rateLimited, 500 saveFailed, network: own texts.
      setError(errorText(failure, t.saveFailed));
      wait.note(failure);
      // The participant is gone (lesson deleted, student moved to another teacher): reload the table.
      if (isNotFoundError(failure)) void queryClient.invalidateQueries({ queryKey: key });
    },
    onSettled: (_result, _failure, input) => {
      setSaving(input.participantId, false);
      setPending((current) => {
        if (!(input.participantId in current)) return current;
        const next = { ...current };
        delete next[input.participantId];
        return next;
      });
    },
  });

  const send = (lessonId: string, cell: AttendanceCell, value: AttendanceStatus) => {
    if (wait.waiting || busy.has(cell.participantId) || value === cell.attendance) return;
    mark.mutate({ lessonId, participantId: cell.participantId, attendance: value, previous: cell.attendance });
  };

  const loaded = attendance.data;
  const data = useMemo(() => (loaded ? applyPendingMarks(loaded, pending) : undefined), [loaded, pending]);
  if (!data) {
    return isLoadFailed(attendance) ? (
      <LoadFailure query={attendance} testID="group-attendance-error" />
    ) : (
      <LoadingState variant="list" count={4} accessibilityLabel={m.common.a11y.loading} testID="group-attendance-loading" />
    );
  }

  const periods: readonly { period: ReportPeriod; label: string }[] = [
    { period: '7d', label: common.forSevenDays },
    { period: '30d', label: common.forThirtyDays },
    { period: 'year', label: common.academicYear },
  ];
  // The three PDF periods are folded behind one download button; while any of them is being built a
  // spinner stands in its place.
  const reportButton = periods.some(({ period }) => report.pendingKey === attendanceReportKey(period)) ? (
    <View style={styles.reportBusy} testID="group-attendance-pdf-busy">
      <Spinner accessibilityLabel={m.groups.attendance.pdfTitle} />
    </View>
  ) : (
    <IconButton
      icon="download"
      accessibilityLabel={m.groups.attendance.pdfTitle}
      disabled={report.blocked}
      onPress={() => setReportsOpen(true)}
      testID="group-attendance-pdf"
    />
  );
  const reportSheet = (
    <BottomSheet
      visible={reportsOpen}
      onClose={() => setReportsOpen(false)}
      closeLabel={m.common.actions.close}
      title={common.pdf}
      testID="group-attendance-pdf-sheet"
    >
      {periods.map(({ period, label }, index) => (
        <ListRow
          key={period}
          title={label}
          inset={0}
          divider={index < periods.length - 1}
          accessibilityLabel={format(m.groups.attendance.reportAria, { period: label })}
          onPress={() => {
            setReportsOpen(false);
            report.exportGroupAttendance(groupId, period);
          }}
          testID={`group-attendance-pdf-${period}`}
        />
      ))}
    </BottomSheet>
  );
  const reportNotice = <ReportExportNotice report={report} testID="group-attendance-report-error" />;

  if (data.members.length === 0 || data.lessons.length === 0) {
    return (
      <View style={styles.tab} testID="group-attendance-tab">
        <EmptyState
          variant="plain"
          title={data.members.length === 0 ? dict.planner.groups.list.noStudents : m.groups.attendance.noPastLessons}
          testID="group-attendance-empty"
        />
        {/* The group had lessons but has no members now: the reports still have something to show. */}
        {data.lessons.length > 0 ? (
          <>
            {reportNotice}
            <View style={styles.emptyReport}>{reportButton}</View>
            {reportSheet}
          </>
        ) : null}
      </View>
    );
  }

  const lessonLink = (lesson: GroupAttendanceLesson) => ({ screen: 'planner.lessonBoard', lessonId: lesson.id }) as const;
  const openLesson = navigation.canOpen({ screen: 'planner.lessonBoard', lessonId: '' })
    ? (lesson: GroupAttendanceLesson) => {
        navigation.open(lessonLink(lesson));
      }
    : undefined;

  return (
    <View style={styles.tab} testID="group-attendance-tab">
      {attendance.isError ? (
        <Notice tone="error" text={errorText(attendance.error, m.common.errors.generic)} testID="group-attendance-refresh-error" />
      ) : null}

      {reportNotice}

      <View style={styles.head}>
        <Segmented
          options={[
            { value: 'table', label: m.groups.attendance.modeTable },
            { value: 'lessons', label: m.groups.attendance.modeLessons },
          ]}
          value={mode}
          onChange={setMode}
          accessibilityLabel={m.groups.attendance.modeAria}
          fill
          style={styles.mode}
          testID="group-attendance-mode"
        />
        {reportButton}
      </View>

      {mode === 'table' ? (
        <Hint>
          <Text variant="hint" color="textMuted">
            {m.groups.attendance.tapHint}
          </Text>
        </Hint>
      ) : null}

      {error || wait.waiting ? (
        <View style={styles.errorBox}>
          {error ? (
            <Notice
              tone="error"
              text={error}
              onDismiss={() => setError(null)}
              dismissLabel={m.common.actions.close}
              testID="group-attendance-save-error"
            />
          ) : null}
          {/* The wait outlives a dismissed notice: the marks stay disabled, so the reason stays on screen. */}
          <RetryWaitLine seconds={wait.seconds} testID="group-attendance-save-wait" />
        </View>
      ) : null}

      {mode === 'table' ? (
        <AttendanceTable
            members={data.members}
            lessons={data.lessons}
            busy={busy}
            disabled={wait.waiting}
            onToggle={(lesson, _member, cell) => send(lesson.id, cell, nextAttendance(cell.attendance))}
            onChoose={(lesson, member, cell) => {
              setMarkTarget({
                lessonId: lesson.id,
                participantId: cell.participantId,
                studentName: member.name,
                lessonTitle: lesson.title,
                lessonDate: shortDateTime(lesson.startsAt, now, locale),
                attendance: cell.attendance,
              });
              setMarkOpen(true);
            }}
            onOpenLesson={openLesson}
          />
      ) : (
        <AttendanceLessonList
          members={data.members}
          lessons={data.lessons}
          busy={busy}
          disabled={wait.waiting}
          now={now}
          onSet={(lesson, cell, value) => send(lesson.id, cell, value)}
          onOpenLesson={openLesson}
        />
      )}

      {reportSheet}
      <AttendanceMarkSheet
        visible={markOpen}
        target={markTarget}
        onClose={() => setMarkOpen(false)}
        onPick={(target, value) =>
          send(target.lessonId, { participantId: target.participantId, attendance: target.attendance }, value)
        }
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  tab: { gap: t.space.md },
  // The view switch takes the row; the download button is a 44 square at its end.
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  mode: { flex: 1, minWidth: 0 },
  reportBusy: { width: t.sizes.iconCircle, height: t.sizes.iconCircle, alignItems: 'center', justifyContent: 'center' },
  emptyReport: { alignItems: 'flex-start' },
  errorBox: { gap: t.space.xs },
}));
