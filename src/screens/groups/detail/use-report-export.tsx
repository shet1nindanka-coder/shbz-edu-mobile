import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { useApi } from '@/api';
import type { DownloadedFile, ReportPeriod } from '@/api/types';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { makeStyles } from '@/theme';
import { Notice } from '@/ui';

import { errorText } from '../shared/error-text';
import { RetryWaitLine, useRetryWait } from '../shared/use-retry-wait';

type ExportJob = { key: string; download: () => Promise<DownloadedFile> };

export type ReportExport = {
  /** Key of the report being built (`attendance:7d`, `student:<id>:30d`), or null. */
  pendingKey: string | null;
  /** Every report button is disabled: one is being built, or the shared limit is cooling down. */
  blocked: boolean;
  error: string | null;
  waitSeconds: number;
  dismissError: () => void;
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
  const { m } = useI18n();
  const wait = useRetryWait();
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: (job: ExportJob) => job.download(),
    onMutate: () => setError(null),
    onSuccess: (file, job) => {
      navigation.openFiles([{ id: job.key, originalName: file.fileName, mimeType: 'application/pdf', localUri: file.uri }]);
    },
    onError: (failure) => {
      // 404 groupNotFound / studentNotFound, 500 exportFailed, 429, 503 and a network failure: each
      // message is already localised.
      setError(errorText(failure, m.common.errors.exportFailed));
      wait.note(failure);
    },
  });

  const start = (job: ExportJob) => {
    if (run.isPending || wait.waiting) return;
    run.mutate(job);
  };

  return {
    pendingKey: run.isPending ? (run.variables?.key ?? null) : null,
    blocked: run.isPending || wait.waiting,
    error,
    waitSeconds: wait.seconds,
    dismissError: () => setError(null),
    exportGroupAttendance: (groupId, period) =>
      start({ key: attendanceReportKey(period), download: () => api.groups.downloadGroupAttendancePdf(groupId, period) }),
    exportStudentReport: (studentId, period) =>
      start({
        key: studentReportKey(studentId, period),
        download: () => api.teacherStudents.downloadStudentReport(studentId, period),
      }),
  };
}

/** The error of the last report request and, while a limit cools down, when it may be repeated. */
export function ReportExportNotice({ report, testID }: { report: ReportExport; testID?: string }) {
  const styles = useStyles();
  const { m } = useI18n();
  // The wait outlives a dismissed notice: the buttons stay disabled, so the reason stays on screen.
  if (!report.error && report.waitSeconds <= 0) return null;
  return (
    <View style={styles.box}>
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
