import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { errorText, hasErrorCode, qk, useApi } from '@/api';
import type { DownloadedFile, ReportPeriod } from '@/api/types';
import { useRetryWait } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';


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
  openReady: () => void;
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
  const { m } = useI18n();
  const wait = useRetryWait();
  const noteWait = wait.note;
  const [error, setError] = useState<string | null>(null);
  const ready = useRef<{ period: ReportPeriod; file: DownloadedFile } | null>(null);

  const download = useMutation({
    mutationFn: (period: ReportPeriod) => api.teacherStudents.downloadStudentReport(studentId, period),
    onMutate: () => {
      ready.current = null;
      setError(null);
    },
    onSuccess: (file, period) => {
      // Opened once the progress sheet is gone: two modal layers must not overlap.
      ready.current = { period, file };
    },
    onError: (failure) => {
      // studentNotFound, exportFailed, rateLimited, reportsBusy, no connection — each message is localised.
      setError(errorText(failure, m.common.errors.exportFailed));
      noteWait(failure);
      if (hasErrorCode(failure, 'studentNotFound')) void queryClient.invalidateQueries({ queryKey: qk('teacherStudents') });
    },
  });

  const openReady = useCallback(() => {
    const done = ready.current;
    ready.current = null;
    if (!done) return;
    // Not the site's period buttons (only the first of them says «Отчёт»): the viewer title stands alone.
    const titles: Record<ReportPeriod, string> = {
      '7d': m.teacher.report.title7d,
      '30d': m.teacher.report.title30d,
      year: m.teacher.report.titleYear,
    };
    navigation.openFiles(
      [{ id: `student-report-${studentId}-${done.period}`, originalName: done.file.fileName, mimeType: 'application/pdf', localUri: done.file.uri }],
      { title: titles[done.period] },
    );
  }, [m, navigation, studentId]);

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
    openReady,
  };
}
