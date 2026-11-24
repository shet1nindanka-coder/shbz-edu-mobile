import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText, useApi } from '@/api';
import type { DownloadedFile, ReportPeriod } from '@/api/types';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, useScreenFocused, useStillHere } from '@/navigation';
import { makeStyles } from '@/theme';
import { Button, Notice } from '@/ui';

/** One report request; `title` is the file viewer's title in the interface language. */
type ExportJob = { key: string; title: string; download: () => Promise<DownloadedFile> };

/** A report that finished while the group screen was not in front: kept until the teacher opens it. */
type ReadyReport = { key: string; title: string; file: DownloadedFile };

export type ReportExport = {
  /** Key of the report being built (`attendance:7d`, `student:<id>:30d`), or null. */
  pendingKey: string | null;
  /** Every report button is disabled: one is being built, or the shared limit is cooling down. */
  blocked: boolean;
  error: string | null;
  waitSeconds: number;
  dismissError: () => void;
  /** A report that came back after the teacher had left the screen; opened only on request. */
  ready: { key: string; title: string } | null;
  openReady: () => void;
  dismissReady: () => void;
  exportGroupAttendance: (groupId: string, period: ReportPeriod) => void;
  exportStudentReport: (studentId: string, period: ReportPeriod) => void;
};

export function attendanceReportKey(period: ReportPeriod): string {
  return `attendance:${period}`;
}

export function studentReportKey(studentId: string, period: ReportPeriod): string {
  return `student:${studentId}:${period}`;
}

/**
 * PDF reports of the group screen (06 §1.3, §3.8; Q5): the group attendance report and the students'
 * weekly reports. Both are built by the server, downloaded into the app cache and opened in the file
 * viewer. They share one rate-limit bucket (5 per 5 minutes), hence one hook for the whole screen: a
 * refusal that names a wait (`429 rateLimited`, `503 reportsBusy`) blocks every report button until then.
 */
export function useReportExport(): ReportExport {
  const api = useApi();
  const navigation = useAppNavigation();
  const stillHere = useStillHere();
  const { m } = useI18n();
  const wait = useRetryWait();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<ReadyReport | null>(null);
  // Set synchronously when a report starts: `run.isPending` reaches this hook a render later, and every
  // report button has its own press guard, so two buttons tapped back to back would both start one.
  const inFlight = useRef(false);

  const run = useMutation({
    mutationFn: (job: ExportJob) => job.download(),
    onMutate: () => {
      setError(null);
      setReady(null);
    },
    onSettled: () => {
      inFlight.current = false;
    },
    onError: (failure) => {
      // 404 groupNotFound / studentNotFound, 500 exportFailed, 429, 503 and a network failure: each
      // message is already localised.
      setError(errorText(failure, m.common.errors.exportFailed));
      wait.note(failure);
    },
  });

  const open = (report: ReadyReport) => {
    navigation.openFiles(
      [{ id: report.key, originalName: report.file.fileName, mimeType: 'application/pdf', localUri: report.file.uri }],
      { title: report.title },
    );
  };

  const start = (job: ExportJob) => {
    if (inFlight.current || wait.waiting) return;
    inFlight.current = true;
    run.mutate(job, {
      // A per-call callback: TanStack skips it once the group screen has unmounted. The screen stays mounted
      // under a pushed screen and in its tab, so focus is asked too: a report that arrives after the teacher
      // moved on is not opened over whatever they went to. It is kept instead (it ran and counts against
      // the report limit) and offered when they are back.
      onSuccess: (file) => {
        const report: ReadyReport = { key: job.key, title: job.title, file };
        if (stillHere()) open(report);
        else setReady(report);
      },
    });
  };

  const periodTitle = (titles: { d7: string; d30: string; year: string }, period: ReportPeriod) =>
    period === '7d' ? titles.d7 : period === '30d' ? titles.d30 : titles.year;

  return {
    pendingKey: run.isPending ? (run.variables?.key ?? null) : null,
    blocked: run.isPending || wait.waiting,
    error,
    waitSeconds: wait.seconds,
    dismissError: () => setError(null),
    ready: ready ? { key: ready.key, title: ready.title } : null,
    openReady: () => {
      if (!ready) return;
      setReady(null);
      open(ready);
    },
    dismissReady: () => setReady(null),
    exportGroupAttendance: (groupId, period) =>
      start({
        key: attendanceReportKey(period),
        title: periodTitle(
          { d7: m.groups.attendance.reportTitle7d, d30: m.groups.attendance.reportTitle30d, year: m.groups.attendance.reportTitleYear },
          period,
        ),
        download: () => api.groups.downloadGroupAttendancePdf(groupId, period),
      }),
    exportStudentReport: (studentId, period) =>
      start({
        key: studentReportKey(studentId, period),
        // The same titles as the student card's report: the viewer title stands alone, in the UI language.
        title: periodTitle({ d7: m.teacher.report.title7d, d30: m.teacher.report.title30d, year: m.teacher.report.titleYear }, period),
        download: () => api.teacherStudents.downloadStudentReport(studentId, period),
      }),
  };
}

/** The error of the last report request and, while a limit cools down, when it may be repeated. */
export function ReportExportNotice({ report, testID }: { report: ReportExport; testID?: string }) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const focused = useScreenFocused();
  // The wait outlives a dismissed notice: the buttons stay disabled, so the reason stays on screen.
  if (!report.error && report.waitSeconds <= 0 && !report.ready) return null;
  return (
    <View style={styles.box}>
      {report.ready ? (
        <Notice
          tone="success"
          text={format(m.groups.report.ready, { title: report.ready.title })}
          // A success that appears without the teacher's action on this screen: VoiceOver says it — when the
          // group screen is in front again, not while it is hidden under the screen the teacher went to.
          announcement={focused ? format(m.groups.report.ready, { title: report.ready.title }) : null}
          onDismiss={report.dismissReady}
          dismissLabel={m.common.actions.close}
          action={<Button label={dict.planner.common.open} size="sm" variant="outline" onPress={report.openReady} testID={testID ? `${testID}-ready-open` : undefined} />}
          testID={testID ? `${testID}-ready` : undefined}
        />
      ) : null}
      {report.error ? (
        <Notice
          tone="error"
          text={report.error}
          onDismiss={report.dismissError}
          dismissLabel={m.common.actions.close}
          testID={testID}
        />
      ) : null}
      <RetryWaitLine seconds={report.waitSeconds} testID={testID ? `${testID}-wait` : undefined} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  box: { gap: t.space.xs },
}));
