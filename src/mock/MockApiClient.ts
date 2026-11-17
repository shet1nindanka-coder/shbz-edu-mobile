/**
 * `MockApiClient` — the in-process implementation of `ApiClient` (docs/spec/90-addendum-5.md Part B,
 * 90-addendum-6). It behaves like the server: one shared store with the dataset of 09 §2, the site's
 * validation, role and ownership rules, the same error codes and localized texts, simulated latency and
 * deferred AI work on the mock clock.
 *
 * Composition root usage:
 *
 * ```ts
 * const api = createMockApiClient({ storage: asyncStorageAdapter, getLocale: () => preferences.locale, isOnline: () => network.online });
 * api.setSessionToken(await secureStore.readToken());         // restore
 * const { token } = await api.shell.login({ login, password }); // sign in …
 * api.setSessionToken(token);                                  // … then install the token, like an HTTP client would
 * ```
 *
 * The client never switches the token by itself: `login` and `changePassword` RETURN a token and the caller
 * installs it with `setSessionToken` (and clears it with `setSessionToken(null)` after `logout`).
 */
import type { ApiClient, ApiMember } from "@/api/client";
import type { ApiError } from "@/api/errors";
import type { Locale, NotFoundErrorCode, RealtimeConnectionState } from "@/api/types";
import { DAY_MS, MINUTE_MS } from "@/domain/moscow-time";

import { mockSampleUrl, type MockDocumentRequest } from "./assets";
import { createSystemClock, type MockClock } from "./clock";
import { createMockContext, type MockContext } from "./context";
import { DEFAULT_MOCK_LATENCY, type ForcedError, type MockControlActions, type MockControls } from "./controls";
import { FIXTURES_REVISION, buildFixtures } from "./fixtures";
import { createContent } from "./members/content";
import { createDeveloper } from "./members/developer";
import { createDeveloperAccounts } from "./members/developer-accounts";
import { createGroupsCallsStats } from "./members/groups-calls-stats";
import { createPlanner } from "./members/planner";
import { createShell } from "./members/shell";
import { createStudentHomeworkLesson } from "./members/student-homework-lesson";
import { createStudentStudy } from "./members/student-study";
import { createTeacherStudents } from "./members/teacher-students";
import type { MockUploadedFile } from "./rules/files";
import { latencyFor } from "./rules/latency";
import { MockPersistence, createMemoryStorage, type MockStorageAdapter } from "./store/persistence";
import type { MockSnapshot } from "./store/schema";
import { MockStore } from "./store/store";
import { readPickedFileBytes } from "./upload-bytes";

export type MockApiClientOptions = {
  /** Where the store is kept between app starts. Default: memory only (lost on restart). */
  storage?: MockStorageAdapter;
  /** Key prefix inside `storage` (default `"shbz-mock"`). */
  storagePrefix?: string;
  /** Changes are coalesced for this long before a save (default 250 ms; tests pass 0). */
  saveDebounceMs?: number;
  /** Language of the current request — the app's interface language. Default `"ru"`. */
  getLocale?: () => Locale;
  /** When it returns false every call rejects with the client-side `network` error (offline mode). Default: always online. */
  isOnline?: () => boolean;
  /**
   * Simulated latency of a fresh dataset: a range, a fixed number of ms, or 0 for none (tests).
   * Default 200..600 ms. Afterwards the demo screen changes it through `controls.set("latency", …)`.
   */
  latency?: number | { minMs: number; maxMs: number };
  /** Source of "now" (default `Date.now`). Ignored when `clock` is given. */
  now?: () => number;
  /** A full clock, e.g. `createManualClock(...)` in tests. */
  clock?: MockClock;
  /** Re-seed at start when the stored dataset is older than this (default 24 h); `null` never re-seeds by age. */
  reseedAfterMs?: number | null;
  /**
   * Device hook for generated documents (PDF reports): copies the bundled sample into the app cache under
   * `fileName` and resolves to its local URI (`materialiseMockSample` of `src/services/files`). Default:
   * resolves to the `mock-sample://<sample>` URL — enough for tests.
   */
  materializeDocument?: (request: MockDocumentRequest) => Promise<string>;
  /**
   * Device hook: the mock created a file row for a file picked in the app (a solution photo, a topic file).
   * Wire it to `importLocalFile(file.id, …)` of `src/services/files` so the mock `FileService` shows the
   * real picture under that id.
   */
  onFileUploaded?: (file: MockUploadedFile) => void;
  /** Device hook: a file row was removed because nothing references it (wire it to `forgetLocalFile`). */
  onFileRemoved?: (fileId: string) => void;
  /**
   * Device hook: the bytes of a picked file, so uploads are checked like the site's `validateUploadedBytes`
   * (declared size, magic bytes of the extension). Resolve to null when the URI cannot be read — the check
   * is then skipped. Default: `readPickedFileBytes` (web `blob:` / `data:` URLs only); on native wire it to
   * expo-file-system (`new File(uri).bytes()`). `null` turns the byte check off.
   */
  readUploadBytes?: ((uri: string) => Promise<Uint8Array | null>) | null;
  /**
   * Notifies the client that ANOTHER writer changed `key` in the same storage (web: a second browser tab of
   * the demo over one `localStorage`). The client then reloads the stored dataset before its next call
   * instead of overwriting the other writer's tables with its stale copy. Returns an unsubscribe function.
   * Default: the browser's `storage` event when there is one; `null` turns it off. A phone has a single
   * JS runtime, so it has no other writer.
   */
  watchExternalWrites?: ((onWrite: (key: string) => void) => () => void) | null;
};

/** The browser's `storage` event (fired in every OTHER tab of the origin that shares the `localStorage`). */
function browserStorageWatcher(): MockApiClientOptions["watchExternalWrites"] {
  const target = (globalThis as { window?: { addEventListener?: unknown; removeEventListener?: unknown; localStorage?: unknown } }).window;
  if (!target || typeof target.addEventListener !== "function" || typeof target.removeEventListener !== "function" || !target.localStorage) return null;
  const win = target as unknown as {
    addEventListener(type: "storage", listener: (event: { key: string | null }) => void): void;
    removeEventListener(type: "storage", listener: (event: { key: string | null }) => void): void;
  };
  return (onWrite) => {
    const listener = (event: { key: string | null }) => {
      if (typeof event.key === "string") onWrite(event.key);
    };
    win.addEventListener("storage", listener);
    return () => win.removeEventListener("storage", listener);
  };
}

export interface MockApiClient extends ApiClient {
  /** Resolves when the store has been loaded (or seeded). Every method waits for it, so awaiting is optional. */
  ready(): Promise<void>;
  /** Installs the bearer token every following call is made with; `null` = signed out. */
  setSessionToken(token: string | null): void;
  getSessionToken(): string | null;
  /**
   * Mock controls — the actions of the "Demo data" screen. Not part of `ApiClient`. Use them after `ready()`
   * has resolved: a change made while the stored dataset is still loading is replaced by it.
   */
  readonly controls: MockControlActions;
  /** Current state of the realtime stream (demo screen). */
  realtimeState(): RealtimeConnectionState;
  /** Waits until every pending save reached the storage adapter (tests; app going to background). */
  flush(): Promise<void>;
  /** Closes the realtime stream and cancels its timers. */
  dispose(): void;
  /**
   * The shared backend context — for the mock `FileService` (`lookup: api.backend.files.lookup`) and for
   * tests. Screens never touch it. It reads the persisted dataset once `ready()` has resolved.
   */
  readonly backend: MockContext;
}

const FIXTURE_SOON_LESSON_ID = "les_dasha_soon";

/** 404 code of `forceNextError: "notFound"`, per member (the entity that member's methods most often address). */
const MEMBER_NOT_FOUND: Record<ApiMember, NotFoundErrorCode> = {
  shell: "numberNotFound",
  studentStudy: "numberNotFound",
  studentWork: "homeworkNotFound",
  teacherStudents: "studentNotFound",
  accounts: "teacherNotFound",
  planner: "lessonNotFound",
  groups: "groupNotFound",
  content: "topicNotFound",
  developer: "topicNotFound",
};

/** Methods whose 404 differs from their member's default. */
const METHOD_NOT_FOUND: Record<string, NotFoundErrorCode> = {
  "studentWork.deleteHomeworkPhoto": "photoNotFound",
  "studentWork.getLiveLesson": "lessonNotFound",
  "studentWork.joinLesson": "lessonNotFound",
  "studentWork.submitLessonItem": "itemNotFound",
  "studentWork.getLiveLessonState": "lessonNotFound",
  "teacherStudents.issueHomework": "studentOrNumberNotFound",
  "teacherStudents.cancelHomework": "homeworkNotFound",
  "teacherStudents.setNumberStatus": "studentOrNumberNotFound",
  "teacherStudents.setNumberStatuses": "studentOrNumberNotFound",
  "teacherStudents.setNumberDeadlines": "studentOrNumberNotFound",
  "teacherStudents.getProgressHistory": "historyNotFound",
  "planner.getLessonNewForm": "groupNotFound",
  "planner.createLesson": "groupNotFound",
  "planner.saveLessonItems": "participantNotFound",
  "planner.regenerateParticipant": "participantNotFound",
  "planner.setItemResult": "itemNotFound",
  "planner.getHomeworkPlanNewForm": "groupNotFound",
  "planner.createHomeworkPlan": "groupNotFound",
  "planner.getHomeworkPlanBoard": "draftNotFound",
  "planner.getHomeworkPlanStatus": "draftNotFound",
  "planner.issueHomeworkPlan": "draftNotFound",
  "planner.deleteHomeworkPlan": "draftNotFound",
  "groups.setStudentAiProfile": "studentNotFound",
  "groups.setAttendance": "participantNotFound",
  "groups.getParentCallHistory": "studentNotFound",
  "groups.recordParentCall": "studentNotFound",
  "groups.getStatisticsDrilldown": "studentNotFound",
  "content.getNumber": "numberNotFound",
  "content.saveCondition": "numberNotFound",
  "content.deleteCondition": "numberNotFound",
  "content.saveAnswer": "numberNotFound",
  "content.deleteAnswer": "numberNotFound",
};

/** The two members whose methods are NOT promises and therefore are not wrapped. */
const SYNC_METHODS = new Set(["shell.subscribeRealtime", "planner.getHandoutUrl"]);

function resolveLatency(option: MockApiClientOptions["latency"]): { minMs: number; maxMs: number } {
  if (option === undefined) return { ...DEFAULT_MOCK_LATENCY };
  if (typeof option === "number") return { minMs: Math.max(0, option), maxMs: Math.max(0, option) };
  return { minMs: Math.max(0, option.minMs), maxMs: Math.max(option.minMs, option.maxMs) };
}

export function createMockApiClient(options: MockApiClientOptions = {}): MockApiClient {
  const clock = options.clock ?? createSystemClock(options.now);
  const getLocale = options.getLocale ?? (() => "ru" as const);
  const isOnline = options.isOnline ?? (() => true);
  const defaultLatency = resolveLatency(options.latency);
  const reseedAfterMs = options.reseedAfterMs === undefined ? DAY_MS : options.reseedAfterMs;
  // Demo-control changes not saved yet: replayed onto the other writer's data when a save finds that data
  // newer (web tabs), so the change survives while the stale rest of this copy does not.
  type UnsavedControl = { no: number; apply: () => void };
  let unsavedControls: UnsavedControl[] = [];
  let controlNo = 0;
  const persistence = new MockPersistence(options.storage ?? createMemoryStorage(), {
    prefix: options.storagePrefix,
    debounceMs: options.saveDebounceMs ?? 250,
    hooks: {
      onExternalSave: () => onExternalSave(),
      saveStarted: () => controlNo,
      onSaved: (mark) => {
        unsavedControls = unsavedControls.filter((control) => control.no > mark);
      },
    },
  });

  let token: string | null = null;
  let callCounter = 0;

  // The store starts with a fresh dataset so that `backend` is usable synchronously; `ready` then replaces
  // it with the persisted one when there is a usable snapshot.
  const store = new MockStore(buildFixtures(clock.now(), { latency: defaultLatency }));
  const materializeDocument = options.materializeDocument ?? (async (request: MockDocumentRequest) => mockSampleUrl(request.sample));
  const ctx = createMockContext({
    store,
    clock,
    getLocale,
    getToken: () => token,
    isOnline,
    materializeDocument,
    fileHooks: {
      onFileUploaded: options.onFileUploaded,
      onFileRemoved: options.onFileRemoved,
      readBytes: options.readUploadBytes === null ? undefined : (options.readUploadBytes ?? readPickedFileBytes),
    },
  });

  /** New T0 and every fixture; sessions of users that still exist survive, so a tester stays signed in. */
  const reseed = (generation: number, autoReseed: boolean): void => {
    const now = clock.now();
    const sessions = store.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
    const snapshot: MockSnapshot = buildFixtures(now, { generation, latency: defaultLatency, autoReseed });
    const userIds = new Set(snapshot.tables.users.map((user) => user.id));
    snapshot.tables.sessions = sessions.filter((session) => userIds.has(session.userId));
    // The surviving sessions (and the device-side copies of uploaded files, keyed by id) still hold ids
    // from the old counter: restarting it at the fixture value would hand out `ses_m1`… again.
    snapshot.meta.idCounter = Math.max(snapshot.meta.idCounter, store.meta.idCounter);
    store.restore(snapshot);
    ctx.notify.resetThrottles();
  };

  const load = async (): Promise<void> => {
    const snapshot = await persistence.load();
    if (snapshot) {
      try {
        store.restore(snapshot);
        // Loading is not a change: nothing to write back.
        store.takeDirty();
        const age = clock.now() - store.meta.t0;
        const stale = reseedAfterMs !== null && store.meta.autoReseed && age > reseedAfterMs;
        // A dataset "from the future" (the device clock went back) or seeded from other fixtures is as
        // unusable as an old one.
        if (stale || age < 0 || store.meta.fixtures !== FIXTURES_REVISION) reseed(store.meta.generation + 1, store.meta.autoReseed);
      } catch {
        // A snapshot that violates the schema (e.g. written by a buggy build) is discarded. Its id counter
        // is kept when readable, so ids handed out before (device-side file copies) never repeat.
        const fresh = buildFixtures(clock.now(), { latency: defaultLatency });
        const storedCounter = (snapshot.meta as { idCounter?: unknown } | undefined)?.idCounter;
        if (typeof storedCounter === "number" && Number.isSafeInteger(storedCounter)) fresh.meta.idCounter = Math.max(fresh.meta.idCounter, storedCounter);
        store.restore(fresh);
      }
    }
    persistence.schedule(store);
  };
  const ready = load();

  // ───────────────────────────── another writer of the same storage (web tabs) ─────────────────────────────

  // Only a real device storage can have another writer; the in-memory default never does.
  const watch = options.watchExternalWrites === undefined ? (options.storage ? browserStorageWatcher() : null) : options.watchExternalWrites;
  let externalWrite = false;
  let syncing: Promise<void> | null = null;
  const unwatch = watch
    ? watch((key) => {
        // The manifest is written last by a save: its change means the other writer finished one.
        if (key === persistence.manifestStorageKey) externalWrite = true;
      })
    : null;

  /**
   * Replaces the in-memory dataset with what the other writer stored, so the next save starts from its
   * rows (and its save number) instead of writing whole stale tables over them. A change of this client
   * that was not saved yet is dropped: the two writers edited at the same moment and the stored one wins.
   */
  const syncExternalWrites = (): Promise<void> | null => {
    if (syncing) return syncing;
    if (!externalWrite) return null;
    syncing = (async () => {
      try {
        await persistence.settled();
        externalWrite = false;
        const snapshot = await persistence.load();
        // Null: the other writer is in the middle of its next save; its manifest event marks us again.
        if (!snapshot) return;
        const previous = store.snapshot();
        try {
          store.restore(snapshot);
          store.takeDirty();
          persistence.discardPending();
        } catch {
          // Rows this build cannot accept: keep the own copy (it is saved with the next change).
          store.restore(previous);
          return;
        }
        // Demo controls changed here but not saved yet are applied again on top of the stored data.
        for (const control of unsavedControls) control.apply();
        persistence.schedule(store);
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  };

  /**
   * A save found the stored manifest written by another writer after this copy was loaded or saved (its
   * storage event is late, missed, or the change came from outside an API call: a demo control, the
   * debounced save of an earlier call). Reload instead of writing the stale copy over it.
   */
  function onExternalSave(): void {
    externalWrite = true;
    void syncExternalWrites()?.catch(() => undefined);
  }

  // ───────────────────────────── forced errors (demo screen) ─────────────────────────────

  const takeForcedError = (method: string): ForcedError | null => {
    const forced = store.controls.forceNextError;
    if (!forced || forced.times < 1) return null;
    if (forced.method !== "*" && forced.method !== method) return null;
    store.patchControls({ forceNextError: forced.times > 1 ? { ...forced, times: forced.times - 1 } : null });
    return forced.error;
  };

  const forcedErrorFor = (member: ApiMember, method: string, error: ForcedError): ApiError => {
    switch (error) {
      case "sessionExpired":
        return ctx.errors.sessionExpired();
      case "unauthorized":
        return ctx.errors.unauthorized();
      case "notFound":
        return ctx.errors.notFound(METHOD_NOT_FOUND[method] ?? MEMBER_NOT_FOUND[member]);
      case "rateLimited":
        return ctx.errors.rateLimited(30);
      case "serviceUnavailable":
        // A failure of the limiter store during sign-in is the site's `database` error.
        if (method === "shell.login") return ctx.errors.make({ status: 503, code: "database", message: (dict) => dict.login.errors.database });
        return ctx.errors.serviceUnavailable();
      case "network":
        return ctx.errors.network();
    }
  };

  // ───────────────────────────── the wrapper around every async method ─────────────────────────────

  const wrap = <A extends unknown[], R>(member: ApiMember, name: string, method: (...args: A) => Promise<R>) => {
    const fullName = `${member}.${name}`;
    return async (...args: A): Promise<R> => {
      await ready;
      callCounter += 1;
      // A method never resolves synchronously, even with zero latency.
      await clock.sleep(latencyFor(callCounter, store.controls.latency));
      const sync = syncExternalWrites();
      if (sync) await sync.catch(() => undefined);
      try {
        if (!isOnline()) throw ctx.errors.network();
        // Forced errors are consumed before any store access, so the store does not change.
        const forced = takeForcedError(fullName);
        if (forced) throw forcedErrorFor(member, fullName, forced);
        // Lazy transitions: checks and plan generations that became due are applied inside this call.
        ctx.jobs.runDue();
        return await method(...args);
      } finally {
        persistence.schedule(store);
      }
    };
  };

  const wrapMember = <M extends ApiMember>(member: M, implementation: ApiClient[M]): ApiClient[M] => {
    const wrapped: Record<string, unknown> = {};
    for (const [name, method] of Object.entries(implementation as unknown as Record<string, unknown>)) {
      if (typeof method !== "function") continue;
      const bound = method.bind(implementation) as (...args: unknown[]) => Promise<unknown>;
      wrapped[name] = SYNC_METHODS.has(`${member}.${name}`) ? bound : wrap(member, name, bound);
    }
    return wrapped as unknown as ApiClient[M];
  };

  const members: ApiClient = {
    shell: wrapMember("shell", createShell(ctx)),
    studentStudy: wrapMember("studentStudy", createStudentStudy(ctx)),
    studentWork: wrapMember("studentWork", createStudentHomeworkLesson(ctx)),
    teacherStudents: wrapMember("teacherStudents", createTeacherStudents(ctx)),
    accounts: wrapMember("accounts", createDeveloperAccounts(ctx)),
    planner: wrapMember("planner", createPlanner(ctx)),
    groups: wrapMember("groups", createGroupsCallsStats(ctx)),
    content: wrapMember("content", createContent(ctx)),
    developer: wrapMember("developer", createDeveloper(ctx)),
  };

  // ───────────────────────────── mock controls ─────────────────────────────

  /**
   * Applies a demo-control change now (the Demo data screen reads it back at once) and keeps it until it is
   * saved: when another tab saved in the meantime, this copy is reloaded first and the change re-applied,
   * so the stale copy (older id counter, save number, rows) is never written over that tab's data.
   */
  const applyControl = (apply: () => void): void => {
    apply();
    controlNo += 1;
    unsavedControls.push({ no: controlNo, apply });
    // The save itself notices a newer stored manifest (`onExternalSave`) and reloads instead of writing.
    persistence.schedule(store);
  };

  /** Saves everything, including what a reload from another writer's save re-applied. */
  const flushAll = async (): Promise<void> => {
    await ready;
    // Bounded: every round either saves or reloads what another writer stored.
    for (let round = 0; round < 4; round += 1) {
      persistence.schedule(store);
      await persistence.flush();
      const pending = syncing;
      if (!pending) return;
      await pending.catch(() => undefined);
    }
    persistence.schedule(store);
    await persistence.flush();
  };

  const rearm = (): void => {
    const lesson = store.lessons.get(FIXTURE_SOON_LESSON_ID);
    if (!lesson) return;
    const now = ctx.nowIso();
    store.transaction(() => {
      store.lessons.update(lesson.id, {
        startsAt: new Date(ctx.now() + MINUTE_MS).toISOString(),
        finishedAt: null,
        startedAt: null,
        status: "PLANNED",
        updatedAt: now,
      });
      for (const participant of store.participants.by("lessonId", lesson.id)) {
        store.participants.update(participant.id, { joinedAt: null, attendance: "UNKNOWN", updatedAt: now });
        for (const item of store.lessonItems.by("participantId", participant.id)) {
          for (const submission of store.submissions.by("itemId", item.id)) ctx.cascade.deleteLessonSubmission(submission.id);
          store.lessonItems.update(item.id, { result: null });
        }
      }
    });
    for (const participant of store.participants.by("lessonId", lesson.id)) {
      ctx.emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: lesson.teacherId, studentId: participant.studentId });
    }
  };

  const controls: MockControlActions = {
    get: () => JSON.parse(JSON.stringify(store.controls)) as MockControls,
    set(key, value) {
      applyControl(() => store.patchControls({ [key]: value } as Partial<MockControls>));
    },
    async resetDemoData() {
      await ready;
      applyControl(() => {
        reseed(store.meta.generation + 1, store.meta.autoReseed);
        ctx.realtime.sessionChanged();
      });
      await flushAll();
    },
    clearLimiters() {
      applyControl(() => ctx.limits.clear());
    },
    exhaust(scope, identifier, rule) {
      applyControl(() => ctx.limits.exhaust(scope, identifier, rule));
    },
    rearmSoonLesson() {
      if (!store.lessons.has(FIXTURE_SOON_LESSON_ID)) return;
      applyControl(rearm);
    },
    listLimiters: () => ctx.limits.list(),
    datasetInfo: () => ({
      t0: new Date(store.meta.t0).toISOString(),
      ageMs: Math.max(0, clock.now() - store.meta.t0),
      generation: store.meta.generation,
      autoReseed: store.meta.autoReseed,
    }),
    setAutoReseed(enabled) {
      applyControl(() => store.patchMeta({ autoReseed: enabled }));
    },
  };

  return {
    ...members,
    ready: () => ready,
    setSessionToken(next) {
      const value = typeof next === "string" && next ? next : null;
      if (value === token) return;
      token = value;
      // The stream belongs to the signed-in user: close it on sign-out, reopen it for the new session.
      void ready.then(() => ctx.realtime.sessionChanged());
    },
    getSessionToken: () => token,
    controls,
    realtimeState: () => ctx.realtime.state(),
    flush: flushAll,
    dispose() {
      unwatch?.();
      ctx.realtime.dispose();
    },
    backend: ctx,
  };
}
