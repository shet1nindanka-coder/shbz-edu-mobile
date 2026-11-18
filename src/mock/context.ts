/**
 * `MockContext` — everything a mock `ApiClient` member needs, built once per client and shared by all nine
 * members (one store, one emitter, one limiter — docs/spec/90-addendum-5.md B.6 rule 2).
 *
 * A member is a factory `create<Member>(ctx): <MemberInterface>` in `src/mock/members/`. Its methods are
 * plain functions of the store; the client wraps each of them with latency, the offline check, the forced
 * errors of the demo screen, the due deferred jobs and persistence — a member never deals with those.
 *
 * Shape of a typical method:
 *
 * ```ts
 * async getStudentCard(studentId) {
 *   const user = ctx.auth.requireUser("TEACHER");            // 401 sessionExpired · 403 unauthorized
 *   const student = ctx.guard.student(user, studentId);      // 404 studentNotFound for a foreign id
 *   ctx.limits.enforce("api:progress-history");              // 429 rateLimited (only where the site limits)
 *   …read with ctx.q / ctx.store, mutate inside ctx.store.transaction(() => { … })…
 *   ctx.emit({ kind: "student-progress-changed", studentId: student.id });   // the event the site publishes
 *   return dto;                                              // a projection — never a stored row as is
 * }
 * ```
 *
 * Rules every member follows: the user is resolved (`ctx.auth.require…`) before the method's first await —
 * the client scopes the token a call was issued with to the synchronous part of the member only;
 * "now" is `ctx.now()` (never `Date.now()`); texts come from `ctx.dict()` /
 * `ctx.m()`; colours of numbers change only through `ctx.progress.write`; a field the caller's role may not
 * see is absent from the DTO (docs/spec/09-data-i18n-math.md §1.5).
 */
import type { Locale, SiteSettings } from "@/api/types";

import { MOCK_DOCUMENT_SAMPLES, mockSampleUrl, type MockDocumentKind, type MockDocumentRequest } from "./assets";
import type { MockClock } from "./clock";
import type { MockControls } from "./controls";
import { cascade } from "./store";
import type { MockStore } from "./store/store";
import { createAudit, type MockAudit } from "./rules/audit";
import { createAuth, type MockAuth } from "./rules/auth";
import { createCore, type MockCore } from "./rules/core";
import { createFiles, type MockFileHooks, type MockFiles } from "./rules/files";
import { createGuards, type MockGuards } from "./rules/guards";
import { createHomework, type MockHomework } from "./rules/homework-issue";
import { MOCK_TIMINGS, createJobs, type MockJobs } from "./rules/jobs";
import { createLessons, type MockLessons } from "./rules/lesson-finalize";
import { createNotifications, type MockNotifications } from "./rules/notifications";
import { createProgress, type MockProgress } from "./rules/progress";
import { createQueries, type MockQueries } from "./rules/queries";
import { createLimiter, type MockLimiter } from "./rules/rate-limit";
import { createRealtime, type MockRealtime, type RealtimeEventInput } from "./rules/realtime";
import { validation, type MockValidation } from "./rules/validation";

/** Delete rules of the database bound to the context's store (docs/spec/09-data-i18n-math.md §1.3). */
export interface MockCascade {
  /** A student with statuses, progress events, notifications, profile, homeworks, lesson participations, parent calls, sessions. */
  deleteStudent(studentId: string): void;
  /**
   * A teacher: groups and lessons / drafts cascade, students stay with `teacherId = null` (transfer them
   * first), calls keep the row with `teacherId = null`. False (nothing deleted) while the teacher owns uploads.
   */
  deleteTeacher(teacherId: string): boolean;
  /** A topic with its numbers and homework assignments; `Lesson.topicId` → null. Returns the number of files removed. */
  deleteTopic(topicId: string): number;
  /** One number: statuses, progress events, homework links, lesson items, check results. */
  deleteNumber(homeworkNumberId: string): void;
  /** A group: members' `groupId` → null, `Lesson.groupId` → null. */
  deleteGroup(groupId: string): void;
  /** A homework with numbers, attached photos and checks. Recompute the mirrored deadlines afterwards (`ctx.homework.recomputeDeadlines`). */
  deleteHomework(assignmentId: string): void;
  /** One homework check with its results and snapshot photos. */
  deleteHomeworkCheck(checkId: string): void;
  /** A lesson or a homework draft with its participants, items and submissions. */
  deleteLesson(lessonId: string): void;
  /** One participant with items and submissions. */
  deleteParticipant(participantId: string): void;
  /** One item of a set with its submissions. */
  deleteLessonItem(itemId: string): void;
  /** One lesson submission with its photos. */
  deleteLessonSubmission(submissionId: string): void;
  /** Every session of a user (password reset by staff signs the user out everywhere). */
  deleteUserSessions(userId: string): number;
}

/** Read access to the demo-screen switches plus the one-shot ones a member consumes. */
export interface MockSwitches {
  /** Current control values (`store.controls`). */
  current(): Readonly<MockControls>;
  /**
   * Takes the one-shot outcome armed for the next started check (precedence 1 of rule V) and resets it.
   * Returns null when nothing is armed. Call it at the terminal moment of a homework check / lesson submission.
   */
  takeNextCheckOutcome(): MockControls["nextCheckOutcome"];
  /** Takes the one-shot generation-time error armed for the next generated participant and resets it. */
  takeNextPlanOutcome(): MockControls["nextPlanOutcome"];
}

/** Sample documents standing in for files the server would generate (PDF reports, lesson handouts). */
export interface MockDocuments {
  /**
   * "Downloads" a generated document: resolves to a local file URI of the bundled sample (through the
   * `materializeDocument` option of the client) — what `downloadStudentReport` / `downloadGroupAttendancePdf`
   * put into `DownloadedFile.uri`. `fileName` is the name the server would send (e.g. `"otchet-ilya.pdf"`).
   */
  download(kind: MockDocumentKind, fileName: string): Promise<string>;
  /**
   * A `mock-sample://` URL of a sample document for the one synchronous URL builder (`planner.getHandoutUrl`);
   * the query is kept so the viewer can tell the requests apart.
   */
  url(kind: MockDocumentKind, query?: Record<string, string | undefined>): string;
}

export interface MockContext extends MockCore {
  /** Sessions and role checks: `requireUser(roles?)`, `requireStudent()`, `requireStaff()`, `requireDeveloper()`. */
  readonly auth: MockAuth;
  /** Ownership guards (foreign resource → 404): `student`, `group`, `lesson`, `participant`, `ownHomework`, `topic`, … */
  readonly guard: MockGuards;
  /** Read helpers ("joins") with the site's ordering: students of a teacher, numbers of a topic, items of a participant, … */
  readonly q: MockQueries;
  /** Rate limits and AI budgets: `enforce(scope)`, `consumeBudget(scope)`, `releaseBudget(scope)`. */
  readonly limits: MockLimiter;
  /** Input helpers: `text`, `ids`, `instant`, `integer`, `oneOf`, `digits`. */
  readonly validate: MockValidation;
  /** The only way to change a number's colour; appends the history event and the journal row. */
  readonly progress: MockProgress;
  /** Notifications: `create`, `list`, `markRead`, lazy reminders and alerts. */
  readonly notify: MockNotifications;
  /** Audit journal: `write({ category, action, actor, text })`. */
  readonly audit: MockAudit;
  /** Deferred work on the mock clock: `schedule`, `handle`, `touch`. Timings: `ctx.timings`. */
  readonly jobs: MockJobs;
  /** File metadata: `ref`, `storedRef`, `createFromUpload`, `removeIfUnreferenced`, `resolveForRead`, `lookup`. */
  readonly files: MockFiles;
  /** Sample PDF / HTML documents for the download and handout methods. */
  readonly documents: MockDocuments;
  /** Homework issue (shared by the manual assign and the draft issue) and the deadline mirror. */
  readonly homework: MockHomework;
  /** Lazy finalisation of finished lessons — call `finalizeDue(scope)` before returning lessons. */
  readonly lessons: MockLessons;
  /** The realtime emitter behind `shell.subscribeRealtime`. Members use `emit`. */
  readonly realtime: MockRealtime;
  /** Publishes the realtime event the site publishes for a mutation (01 §5.3). Shorthand for `realtime.publish`. */
  emit(event: RealtimeEventInput): void;
  /** Delete cascades bound to the store. */
  readonly cascade: MockCascade;
  /** Demo-screen switches. */
  readonly switches: MockSwitches;
  /** The one timing table of deferred work (check 1 s + 7 s, plan 5 / 6 / 7 s). */
  readonly timings: typeof MOCK_TIMINGS;
  /** Runtime settings of the developer panel (`store.settings`): `aiEnabled`, `maxPhotosPerAssignment`, … */
  settings(): Readonly<SiteSettings>;
  /**
   * Rejects an aborted call the way a cancelled request fails: throws the client-side `network` error when
   * `signal` is aborted. Call it at the start of a method that takes a signal and again before it writes.
   */
  throwIfAborted(signal: AbortSignal | undefined): void;
}

export type CreateMockContextInput = {
  store: MockStore;
  clock: MockClock;
  getLocale: () => Locale;
  /**
   * The bearer token of the request being served: the token a call was issued with while its member runs,
   * otherwise the token the client currently holds.
   */
  getToken: () => string | null;
  /**
   * The token the client holds NOW, whatever call is running — for the realtime stream, which belongs to the
   * device's current session. Default: `getToken`.
   */
  getLiveToken?: () => string | null;
  isOnline: () => boolean;
  /** Turns a bundled sample into a local file URI (device layer); see `MockApiClientOptions.materializeDocument`. */
  materializeDocument: (request: MockDocumentRequest) => Promise<string>;
  /** Device hooks for picked files; see `MockApiClientOptions`. */
  fileHooks?: MockFileHooks;
};

export function createMockContext(input: CreateMockContextInput): MockContext {
  const { store } = input;
  const core = createCore(store, input.clock, input.getLocale);
  const auth = createAuth(core, input.getToken);
  const q = createQueries(core);
  const guard = createGuards(core, q);
  const limits = createLimiter(core, auth);
  const audit = createAudit(core);
  const notify = createNotifications(core, q);
  const progress = createProgress(core, q, audit);
  const jobs = createJobs(core);
  const files = createFiles(core, auth, input.fileHooks);

  // A stale call (a logout of the previous session) must not close or open the stream of the current one.
  const liveAuth = input.getLiveToken ? createAuth(core, input.getLiveToken) : auth;
  const realtime = createRealtime(core, {
    auth: liveAuth,
    limits,
    isOnline: input.isOnline,
    takeForcedHandshakeError() {
      const forced = store.controls.forceNextError;
      if (!forced || forced.method !== "shell.subscribeRealtime") return null;
      if (forced.error !== "rateLimited" && forced.error !== "serviceUnavailable") return null;
      store.patchControls({ forceNextError: forced.times > 1 ? { ...forced, times: forced.times - 1 } : null });
      return forced.error;
    },
  });
  const emit = (event: RealtimeEventInput) => realtime.publish(event);

  /**
   * Runs a delete cascade and tells the device layer which file rows it removed (`onFileRemoved`), the
   * same way `files.removeIfUnreferenced` does for a single file. A cascade deletes file rows by itself
   * (photos of a deleted homework, files of a deleted topic); without the report the bytes a user picked
   * on this device would stay in the app's storage with no row pointing at them.
   */
  const reportingRemovedFiles = <T>(run: () => T): T => {
    const onFileRemoved = input.fileHooks?.onFileRemoved;
    if (!onFileRemoved) return run();
    const before = store.files.all().map((file) => file.id);
    const result = run();
    for (const id of before) if (!store.files.has(id)) onFileRemoved(id);
    return result;
  };

  const homework = createHomework(core, { q, notify, emit });
  const lessons = createLessons(core, { q, progress, audit, emit });

  return {
    ...core,
    auth,
    guard,
    q,
    limits,
    validate: validation,
    progress,
    notify,
    audit,
    jobs,
    files,
    documents: {
      download: (kind, fileName) => input.materializeDocument({ kind, ...MOCK_DOCUMENT_SAMPLES[kind], fileName }),
      url: (kind, query) => mockSampleUrl(MOCK_DOCUMENT_SAMPLES[kind].sample, { kind, ...query }),
    },
    homework,
    lessons,
    realtime,
    emit,
    cascade: {
      deleteStudent: (studentId) => reportingRemovedFiles(() => cascade.deleteStudent(store, studentId)),
      deleteTeacher: (teacherId) => reportingRemovedFiles(() => cascade.deleteTeacher(store, teacherId, core.nowIso())),
      deleteTopic: (topicId) => reportingRemovedFiles(() => cascade.deleteTopic(store, topicId, core.nowIso())),
      deleteNumber: (homeworkNumberId) => reportingRemovedFiles(() => cascade.deleteNumber(store, homeworkNumberId)),
      deleteGroup: (groupId) => reportingRemovedFiles(() => cascade.deleteGroup(store, groupId, core.nowIso())),
      deleteHomework: (assignmentId) => reportingRemovedFiles(() => cascade.deleteHomeworkAssignment(store, assignmentId)),
      deleteHomeworkCheck: (checkId) => reportingRemovedFiles(() => cascade.deleteHomeworkCheck(store, checkId)),
      deleteLesson: (lessonId) => reportingRemovedFiles(() => cascade.deleteLesson(store, lessonId)),
      deleteParticipant: (participantId) => reportingRemovedFiles(() => cascade.deleteLessonParticipant(store, participantId)),
      deleteLessonItem: (itemId) => reportingRemovedFiles(() => cascade.deleteLessonItem(store, itemId)),
      deleteLessonSubmission: (submissionId) => reportingRemovedFiles(() => cascade.deleteLessonSubmission(store, submissionId)),
      deleteUserSessions: (userId) => cascade.deleteUserSessions(store, userId),
    },
    switches: {
      current: () => store.controls,
      takeNextCheckOutcome() {
        const outcome = store.controls.nextCheckOutcome;
        if (outcome) store.patchControls({ nextCheckOutcome: null });
        return outcome;
      },
      takeNextPlanOutcome() {
        const outcome = store.controls.nextPlanOutcome;
        if (outcome) store.patchControls({ nextPlanOutcome: null });
        return outcome;
      },
    },
    timings: MOCK_TIMINGS,
    settings: () => store.settings,
    throwIfAborted(signal) {
      if (signal?.aborted) throw core.errors.network();
    },
  };
}
