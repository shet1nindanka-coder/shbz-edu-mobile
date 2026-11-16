/**
 * Deferred work on the mock clock (docs/spec/90-addendum-6.md §5): AI checks and plan generations.
 *
 * A transition is never a timer callback. A job is a ROW of the persisted store with a due time; the
 * client runs every due job at the start of each API call ("lazy transitions": each read computes the state
 * and applies the terminal step once, inside that read), so an app restart in the middle of a check loses
 * nothing and a test simply advances the clock and makes the next call.
 *
 * Who does what:
 * - a member that starts something schedules jobs: `ctx.jobs.schedule("homeworkCheck.begin", check.id, MOCK_TIMINGS.checkBeginMs)`;
 * - the member that owns the transition registers a handler ONCE, in its `create…(ctx)` factory:
 *   `ctx.jobs.handle("homeworkCheck.finish", (job) => { … })`;
 * - a member that returns a seeded in-flight row to a client calls `ctx.jobs.touch(row.id)` — the timers of
 *   such rows start at the first read, not at the seeded `createdAt`.
 *
 * A job whose kind has no handler yet stays in the store untouched.
 */
import type { MockJob, MockJobKind } from "../store/schema";
import type { MockCore } from "./core";

/** The one timing table of the mock (90-addendum-6 §5). No randomness. */
export const MOCK_TIMINGS = {
  /** AI check (homework and lesson): PENDING → CHECKING, ms after the row was created. */
  checkBeginMs: 1000,
  /** AI check: terminal (DONE / FAILED) at created + 8 s, i.e. a further 7 s after CHECKING. */
  checkFinishMs: 8000,
  /** AI plan generation of the participant with index `i` in the lesson's name order: 5 s, 6 s, 7 s, 5 s, … */
  planGenerationMs: (indexInNameOrder: number): number => 5000 + 1000 * (Math.max(0, indexInNameOrder) % 3),
} as const;

/** Handler of one job kind. Runs synchronously against the store; schedule follow-up jobs from inside it if needed. */
export type MockJobHandler = (job: MockJob) => void;

export interface MockJobs {
  /**
   * Schedules a job `delayMs` from now and returns it. `refId` is the row the job belongs to
   * (`HomeworkCheck.id`, `LessonItemSubmission.id`, `LessonParticipant.id`).
   */
  schedule(kind: MockJobKind | (string & {}), refId: string, delayMs: number, payload?: Record<string, unknown>): MockJob;
  /**
   * "First read" of a seeded in-flight row: starts the timers of its waiting jobs (`dueAt = now + delayMs`).
   * A no-op for rows without waiting jobs — safe to call for every row a method returns.
   */
  touch(refId: string): void;
  /** Removes the jobs of a row (the row was deleted, or the work was re-queued). `kind` narrows it. */
  cancel(refId: string, kind?: string): void;
  /** Jobs of a row that have not run yet. */
  pending(refId: string, kind?: string): MockJob[];
  /** Registers the handler of a job kind (one per kind; a later registration replaces the earlier one). */
  handle(kind: MockJobKind | (string & {}), handler: MockJobHandler): void;
  /**
   * Runs every job that is due, oldest first, including jobs that a handler scheduled for "now or earlier".
   * Called by the client before every method body — members never need to call it themselves.
   * A handler that throws loses its job (so one broken transition cannot block every later call); the error
   * is kept in `lastError()`.
   */
  runDue(): void;
  /** The error of the most recent failed handler, for diagnostics; null when none failed. */
  lastError(): { job: MockJob; error: unknown } | null;
}

const MAX_JOBS_PER_RUN = 500;

export function createJobs(core: MockCore): MockJobs {
  const { store } = core;
  const handlers = new Map<string, MockJobHandler>();
  let lastError: { job: MockJob; error: unknown } | null = null;

  const pending = (refId: string, kind?: string) =>
    store.jobs.by("refId", refId).filter((job) => kind === undefined || job.kind === kind);

  return {
    schedule(kind, refId, delayMs, payload = {}) {
      const now = core.now();
      const delay = Math.max(0, delayMs);
      return store.jobs.insert({ id: store.nextId("job"), kind, refId, state: "armed", delayMs: delay, dueAt: now + delay, payload, createdAt: now });
    },
    touch(refId) {
      const now = core.now();
      for (const job of store.jobs.by("refId", refId)) {
        if (job.state === "waiting") store.jobs.update(job.id, { state: "armed", dueAt: now + job.delayMs });
      }
    },
    cancel(refId, kind) {
      for (const job of pending(refId, kind)) store.jobs.delete(job.id);
    },
    pending,
    handle(kind, handler) {
      handlers.set(kind, handler);
    },
    runDue() {
      for (let guard = 0; guard < MAX_JOBS_PER_RUN; guard += 1) {
        const now = core.now();
        const due = store.jobs
          .filter((job) => job.state === "armed" && job.dueAt !== null && job.dueAt <= now && handlers.has(job.kind))
          .sort((left, right) => (left.dueAt ?? 0) - (right.dueAt ?? 0) || left.createdAt - right.createdAt || left.id.localeCompare(right.id))[0];
        if (!due) return;
        store.jobs.delete(due.id);
        try {
          store.transaction(() => handlers.get(due.kind)!(due));
        } catch (error) {
          lastError = { job: due, error };
        }
      }
    },
    lastError: () => lastError,
  };
}
