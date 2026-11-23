import type { DownloadedFile, ReportPeriod } from '@/api/types';

/** A student report that was built and downloaded but not opened yet. */
export type KeptReport = { period: ReportPeriod; file: DownloadedFile };

type Entry = KeptReport & { generation: number };

/**
 * Finished student reports, by student, for as long as the app runs.
 *
 * WHY outside the card: a reminder tap takes the teacher to a tab and pops the student card while its
 * report is still being built. The download still finishes (TanStack keeps a mutation's callbacks on the
 * mutation), but the card instance that would offer it is gone. The report ran and counts against the limit
 * of five reports per five minutes, so it is kept here and offered when the card is opened again — as the
 * group screen does with its own report, which stays mounted in its tab.
 *
 * Each entry belongs to the session generation it was built in (`getAppRuntime().sessionGeneration()`):
 * after a sign-out or another sign-in it is never offered, so one account never sees another's report.
 */
const kept = new Map<string, Entry>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of [...listeners]) listener();
};

export function keepReport(studentId: string, generation: number, report: KeptReport): void {
  kept.set(studentId, { ...report, generation });
  notify();
}

/** The report kept for this student in this session generation, or `null`. Stable identity while unchanged. */
export function keptReportOf(studentId: string, generation: number): KeptReport | null {
  const entry = kept.get(studentId);
  // An entry built for an earlier session is never offered again (a read must not change the store: it
  // runs while rendering).
  return entry && entry.generation === generation ? entry : null;
}

export function forgetReport(studentId: string): void {
  if (!kept.delete(studentId)) return;
  notify();
}

export function subscribeKeptReports(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
