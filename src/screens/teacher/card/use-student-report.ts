import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';

import { errorText, hasErrorCode, qk, useApi } from '@/api';
import type { DownloadedFile, ReportPeriod } from '@/api/types';
import { useRetryWait } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { useAppNavigation, useStillHere } from '@/navigation';
import { getAppRuntime } from '@/providers';

import { forgetReport, keepReport, keptReportOf, subscribeKeptReports, type KeptReport } from './kept-reports';

export type StudentReport = {
  /** The period whose report is being built; the blocking progress sheet is shown meanwhile. */
  pendingPeriod: ReportPeriod | null;
  /** A report cannot be started: one is being built, or the limit is cooling down. */
  blocked: boolean;
  error: string | null;
  waitSeconds: number;
  dismissError: () => void;
  start: (period: ReportPeriod) => void;
  /** Call when the progress sheet has left the screen: opens the finished report in the file viewer. */
  onProgressClosed: () => void;
  /**
   * A report that came back after the teacher had left the card — pushed over it or popped by a reminder
   * tap: kept (outside the card, by student) and opened only on request.
   */
  ready: { title: string } | null;
  openReady: () => void;
  dismissReady: () => void;
};

/**
 * The student's PDF report (docs/spec/04-teacher-students.md S8, §3.17): built by the server (it takes
 * seconds), downloaded into the app cache and opened in the file viewer, where it can be shared. The
 * limit is 5 reports per 5 minutes and two in flight school-wide: a refusal that names a wait
 * (`429 rateLimited`, `503 reportsBusy`) keeps the three report actions disabled until then.
 */
export function useStudentReport(studentId: string): StudentReport {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const stillHere = useStillHere();
  const { m } = useI18n();
  const wait = useRetryWait();
  const noteWait = wait.note;
  const [error, setError] = useState<string | null>(null);
  const finished = useRef<KeptReport | null>(null);
  // This card started a report and has not handed it over yet (it opens it itself when the progress sheet is
  // gone): the kept copy is not offered meanwhile.
  const [handing, setHanding] = useState(false);
  // A report that finished while the card was not in front. It ran and counts against the limit of five
  // reports per five minutes, so it is offered on the card instead of being thrown away. It lives outside
  // the card: a reminder tap that pops the card must not lose it (kept-reports.ts).
  const generation = getAppRuntime().sessionGeneration();
  const kept = useSyncExternalStore(
    subscribeKeptReports,
    () => keptReportOf(studentId, generation),
    () => keptReportOf(studentId, generation),
  );
  const ready = handing ? null : kept;

  const download = useMutation({
    mutationFn: (period: ReportPeriod) => api.teacherStudents.downloadStudentReport(studentId, period),
    onMutate: () => {
      finished.current = null;
      forgetReport(studentId);
      setHanding(true);
      setError(null);
      return { generation: getAppRuntime().sessionGeneration() };
    },
    onSuccess: (file: DownloadedFile, period, context) => {
      // Opened once the progress sheet is gone: two modal layers must not overlap.
      const done = { period, file };
      finished.current = done;
      // Also kept outside the card: if the card is gone by now (a reminder tap popped it), this is the only
      // copy, offered when the card is opened again. The card that opens it itself forgets it.
      if (context) keepReport(studentId, context.generation, done);
    },
    onError: (failure) => {
      setHanding(false);
      // studentNotFound, exportFailed, rateLimited, reportsBusy, no connection — each message is localised.
      setError(errorText(failure, m.common.errors.exportFailed));
      noteWait(failure);
      if (hasErrorCode(failure, 'studentNotFound')) void queryClient.invalidateQueries({ queryKey: qk('teacherStudents') });
    },
  });

  // Not the site's period buttons (only the first of them says «Отчёт»): the viewer title stands alone.
  const titleOf = useCallback(
    (period: ReportPeriod) =>
      period === '7d' ? m.teacher.report.title7d : period === '30d' ? m.teacher.report.title30d : m.teacher.report.titleYear,
    [m],
  );

  const open = useCallback(
    (done: { period: ReportPeriod; file: DownloadedFile }) => {
      navigation.openFiles(
        [{ id: `student-report-${studentId}-${done.period}`, originalName: done.file.fileName, mimeType: 'application/pdf', localUri: done.file.uri }],
        { title: titleOf(done.period) },
      );
    },
    [navigation, studentId, titleOf],
  );

  const onProgressClosed = useCallback(() => {
    const done = finished.current;
    finished.current = null;
    setHanding(false);
    if (!done) return;
    // The report came back after the teacher left the card (the progress sheet is hidden while the card is
    // not focused): the viewer would open over whatever they are doing now, so the kept copy stays until
    // they are back and ask for it.
    if (!stillHere()) return;
    forgetReport(studentId);
    open(done);
  }, [open, stillHere, studentId]);

  return {
    pendingPeriod: download.isPending ? (download.variables ?? null) : null,
    blocked: download.isPending || wait.waiting,
    error,
    waitSeconds: wait.seconds,
    dismissError: () => setError(null),
    start: (period) => {
      if (download.isPending || wait.waiting) return;
      download.mutate(period);
    },
    onProgressClosed,
    ready: ready ? { title: titleOf(ready.period) } : null,
    openReady: () => {
      if (!ready) return;
      forgetReport(studentId);
      open(ready);
    },
    dismissReady: () => forgetReport(studentId),
  };
}
