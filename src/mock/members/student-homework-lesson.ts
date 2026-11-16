/**
 * `StudentHomeworkLessonApi` on the mock store — homeworks, photo batches, the AI check and the live lesson
 * (docs/spec/90-addendum-5.md Part A is canonical; 03-student-homework-lesson.md §3 – §4; 00 §2.6 – §2.7;
 * 90-addendum-3 for the daily budgets; 90-addendum-6 §4 – §5 for verdict scripting and timing).
 *
 * Order of the checks inside a method is the SITE's order (A.5 "site order": the first failing condition
 * wins) — e.g. the per-student hourly limit of a check is consumed before anything is validated, and an
 * upload is validated before the homework is looked up.
 *
 * A check is asynchronous: `startHomeworkCheck` / `submitLessonItem` create a PENDING row and schedule two
 * jobs on the mock clock (PENDING → CHECKING at +1 s, terminal at +8 s). The handlers below apply the
 * terminal step — verdicts, statuses, photo detach, notification, events, journal — exactly once, inside
 * the first API call made after the job became due.
 *
 * Privacy: every response is a projection. `errorKind`, `errorNote`, `confidence`, `copySuspected`,
 * `injectionSuspected`, `injectionNote`, `modelUsed`, the raw error text, reference answers, teacher
 * planning fields and attendance never leave this file.
 */
import type { StudentHomeworkLessonApi } from "@/api/client";
import type { ApiError } from "@/api/errors";
import type {
  ActiveLessonDto,
  AttachedPhoto,
  CheckErrorCode,
  DerivedLessonStatus,
  HomeworkAssignment,
  HomeworkCheck,
  HomeworkNumberStatus,
  HomeworkSummaryDto,
  Lesson,
  LessonAssignmentItem,
  LessonItemDto,
  LessonItemStateDto,
  LessonItemSubmission,
  LessonParticipant,
  LessonSubmissionDto,
  Locale,
  SolutionVerdict,
  StudentCheckDto,
  StudentCheckResultDto,
  StudentHomeworkNumberDto,
  TopicHomeworkNumber,
  UploadCallOptions,
} from "@/api/types";
import { AI_QUEUES, LIMITS, RETRY_AFTER_SECONDS } from "@/api/types";
import { allowedPhotoExtensions } from "@/domain/files";
import { homeworkAttentionRank, sortHomeworksByAttention, type AttentionHomework } from "@/domain/homework-attention";
import { LESSON_SUBMISSION_MAX_PHOTOS, canSubmitLessonItem, decideAutoLessonResult, isExtraPartUnlocked, isLessonItemClosed } from "@/domain/lesson-live";
import { DAY_MS, MINUTE_MS } from "@/domain/moscow-time";
import { compareHomeworkNumbers, normalizeHomeworkNumber } from "@/domain/numbers";
import { classifySolutionCheckError } from "@/domain/solution-check-error-text";
import { selectCompletedCheckIdsToPrune } from "@/domain/solution-check-history";
import { normalizeCheckResultsByConfidence, type ParsedCheckResult } from "@/domain/solution-check-parse";
import { toStudentFacingResult } from "@/domain/solution-check-student-view";
import { MAX_ORIGINAL_FILE_NAME_LENGTH, MAX_UPLOAD_SIZE_BYTES, UploadValidationError, validateUploadMetadata } from "@/domain/upload-validation";
import { format, plural } from "@/lib/i18n/format";

import type { MockContext } from "../context";
import type { MockControls } from "../controls";
import { retryAfterSeconds } from "../rules/rate-limit";
import type { MockJob, MockRowScript, MockUser, ScriptedResult } from "../store/schema";
import { MOCK_MODEL_NAME, failedCheckError, failureRefundsBudget, scriptHomeworkCheck, scriptLessonSubmission } from "../verdict-script";

/** A PENDING row nobody is working on becomes FAILED after 15 minutes, a CHECKING one after 45 (03 §4.3). */
const STALE_PENDING_MS = 15 * MINUTE_MS;
const STALE_CHECKING_MS = 45 * MINUTE_MS;

/** `getStudentLiveLesson`: lessons that started at most 24 hours ago, the first 20 by `startsAt`. */
const LIVE_LESSON_LOOKBACK_MS = DAY_MS;
const LIVE_LESSON_CANDIDATES = 20;

const HOMEWORK_BUDGET = "api:homework-checks:global";
const LESSON_BUDGET = "api:lesson-checks:global";

const JOBS = {
  homeworkBegin: "homeworkCheck.begin",
  homeworkFinish: "homeworkCheck.finish",
  lessonBegin: "lessonSubmission.begin",
  lessonFinish: "lessonSubmission.finish",
} as const;

/** Raw texts the site's workers store for a failure before the model is called (03 §4.5). */
const RAW_ERRORS = {
  homeworkDisabled: "Автопроверка отключена разработчиком.",
  homeworkNothingToCheck: "Нет фото решения или номеров для проверки.",
  lessonDisabled: "Проверка классной работы отключена разработчиком.",
  lessonNoPhotos: "Нет фото решения.",
  /** A lesson submission always needs a verdict: an empty model answer is a failure, not an empty DONE. */
  lessonNoVerdict: "Модель не вернула вердикт по номеру.",
} as const;

/** A picked photo after the metadata checks: trimmed name, MIME type of the extension. */
type ValidatedPhoto = { uri: string; originalName: string; mimeType: string; size: number };

/** A number of a homework with the student's own state. */
type HomeworkNumberView = { number: TopicHomeworkNumber; status: HomeworkNumberStatus | null; note: string };

type HomeworkView = {
  assignment: HomeworkAssignment;
  summary: Omit<HomeworkSummaryDto, "numbers">;
  numbers: HomeworkNumberView[];
  latestCheck: HomeworkCheck | undefined;
};

/** One item of a participant's set with what the live rules need. */
type LessonItemView = {
  item: LessonAssignmentItem;
  /** Newest submission by `submittedAt`. */
  latest: LessonItemSubmission | undefined;
  state: { isExtra: boolean; result: string | null; latestVerdict: string | null };
};

type NextCheckOutcome = NonNullable<MockControls["nextCheckOutcome"]>;

const isActiveStatus = (status: string): boolean => status === "PENDING" || status === "CHECKING";

const localeOfJob = (job: MockJob): Locale => (job.payload.locale === "en" ? "en" : "ru");

const auditVerdict = (verdict: SolutionVerdict): string => (verdict === "CORRECT" ? "correct" : verdict === "INCORRECT" ? "incorrect" : "uncertain");

export function createStudentHomeworkLesson(ctx: MockContext): StudentHomeworkLessonApi {
  const { store, errors, auth, q, limits } = ctx;

  // ───────────────────────────── shared: queue, budgets, uploads ─────────────────────────────

  /** `503 queueFull` of the two start endpoints: the demo switch, or 60 checks really waiting. */
  const assertQueueHasRoom = (target: "homework" | "lesson"): void => {
    const waiting = store.homeworkChecks.count((check) => check.status === "PENDING") + store.submissions.count((submission) => submission.status === "PENDING");
    if (!ctx.switches.current().checkQueueFull && waiting < AI_QUEUES.checkQueueMax) return;
    errors.fail({
      status: 503,
      code: "queueFull",
      message: (dict) => (target === "homework" ? dict.apiStudent.homeworkChecks.queueFull : dict.apiStudent.lessonSubmissions.queueFull),
      retryAfterSeconds: RETRY_AFTER_SECONDS.checkQueueFull,
    });
  };

  /** «не больше N фото» — the one `photoLimit` error of both upload endpoints (`params.max`). */
  const photoLimitError = (target: "homework" | "lesson", max: number): ApiError => {
    const dict = ctx.dict();
    const template = target === "homework" ? dict.apiStudent.homeworkSubmissions.photoLimit : dict.apiStudent.lessonSubmissions.photoLimit;
    return errors.make({
      status: 400,
      code: "photoLimit",
      message: format(template, { count: plural(ctx.locale(), max, dict.apiStudent.upload.photoCount) }),
      params: { max },
    });
  };

  /** The class of a `validateUploadMetadata` refusal (00 §2.4), with the validator's own text. */
  const uploadMetadataError = (error: unknown): ApiError => {
    const texts = ctx.dict().topics.lib.upload;
    const message = error instanceof UploadValidationError ? error.message : null;
    if (message === format(texts.nameTooLong, { max: MAX_ORIGINAL_FILE_NAME_LENGTH })) {
      return errors.make({ status: 400, code: "uploadBadName", message: texts.nameTooLong, params: { max: MAX_ORIGINAL_FILE_NAME_LENGTH } });
    }
    if (message === texts.badChars) return errors.make({ status: 400, code: "uploadBadName", message });
    if (message === texts.extension || message === texts.mimeMismatch) return errors.make({ status: 400, code: "uploadUnsupportedType", message });
    // Unreachable for student photos (the aggregate checks run first); kept for parity with the validator.
    if (message === texts.tooBig) return errors.make({ status: 413, code: "uploadTooLarge", message });
    if (message === texts.emptySize) return errors.make({ status: 400, code: "uploadRejected", message });
    return errors.make({ status: 400, code: "uploadRejected", message: (dict) => dict.apiStudent.upload.fileRejected });
  };

  /**
   * The multipart checks both upload routes share, in the site's order: a file entry with a positive size
   * (`uploadInvalid`), the count limit of a lesson submission (`photoLimit`), the 15 MiB sum
   * (`uploadTooLarge`), then per file the metadata rules and "PNG / JPG only".
   */
  const validatePhotos = (files: unknown, lessonMaxCount?: number): ValidatedPhoto[] => {
    const entries: unknown[] = Array.isArray(files) ? files : [];
    const picked: { uri: string; name: string; mimeType: string; size: number }[] = [];
    for (const entry of entries) {
      const file = (entry ?? {}) as { uri?: unknown; name?: unknown; mimeType?: unknown; size?: unknown };
      const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : 0;
      if (size <= 0) break;
      picked.push({
        uri: typeof file.uri === "string" ? file.uri : "",
        name: typeof file.name === "string" ? file.name : "",
        mimeType: typeof file.mimeType === "string" ? file.mimeType : "",
        size,
      });
    }
    if (picked.length === 0 || picked.length !== entries.length) {
      return errors.fail({ status: 400, code: "uploadInvalid", message: (dict) => dict.apiStudent.upload.invalidPhotoData });
    }
    if (lessonMaxCount !== undefined && picked.length > lessonMaxCount) throw photoLimitError("lesson", lessonMaxCount);

    const total = picked.reduce((sum, file) => sum + file.size, 0);
    if (!Number.isSafeInteger(total) || total > MAX_UPLOAD_SIZE_BYTES) {
      return errors.fail({ status: 413, code: "uploadTooLarge", message: (dict) => dict.apiStudent.upload.photosTooLarge });
    }

    return picked.map((file) => {
      let metadata: ReturnType<typeof validateUploadMetadata>;
      try {
        metadata = validateUploadMetadata(file.name, file.mimeType, file.size, ctx.locale());
      } catch (error) {
        throw uploadMetadataError(error);
      }
      // A valid .pdf / .docx gets this far: solution photos are images only.
      if (!allowedPhotoExtensions.includes(metadata.extension)) {
        return errors.fail({ status: 400, code: "uploadUnsupportedType", message: (dict) => dict.apiStudent.upload.onlyPngOrJpg });
      }
      return { uri: file.uri, originalName: metadata.originalName, mimeType: metadata.mimeType, size: file.size };
    });
  };

  /** Upload progress of an in-process "request": cumulative bytes after each stored file. A listener error never fails the upload. */
  const reportProgress = (opts: UploadCallOptions | undefined, photos: readonly ValidatedPhoto[]): void => {
    if (!opts?.onProgress) return;
    const total = photos.reduce((sum, photo) => sum + photo.size, 0);
    let sent = 0;
    try {
      for (const photo of photos) {
        sent += photo.size;
        opts.onProgress(total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 100);
      }
    } catch {
      // Progress is advisory.
    }
  };

  /** The site's `normalizeCheckResultsByConfidence`: a verdict below `aiMinConfidence` is stored as UNCERTAIN. */
  const settleResult = (result: ScriptedResult): ParsedCheckResult => {
    const parsed: ParsedCheckResult = { ...result, copyReason: null, injectionNote: null };
    return normalizeCheckResultsByConfidence([parsed], ctx.settings().aiMinConfidence)[0] ?? parsed;
  };

  const actorOf = (user: MockUser | undefined): Pick<MockUser, "id" | "name" | "role"> | null => (user ? { id: user.id, name: user.name, role: user.role } : null);

  // ───────────────────────────── homework: projections ─────────────────────────────

  /** Photos attached right now, in upload order. */
  const attachedPhotos = (assignmentId: string): AttachedPhoto[] =>
    q.homeworkPhotos(assignmentId).flatMap((photo) => {
      const file = ctx.files.get(photo.fileId);
      return file ? [{ id: photo.id, fileId: file.id, originalName: file.originalName, mimeType: file.mimeType, createdAt: photo.createdAt }] : [];
    });

  /** The student's view of a check: results through `toStudentFacingResult`, the error as its class only. */
  const checkDto = (check: HomeworkCheck): StudentCheckDto => {
    const locale = ctx.locale();
    const results: StudentCheckResultDto[] = [];
    for (const row of q.checkResults(check.id)) {
      const number = q.number(row.homeworkNumberId);
      if (!number) continue;
      const facing = toStudentFacingResult({ number: number.number, verdict: row.verdict, recognizedAnswer: row.recognizedAnswer, comment: row.comment }, locale);
      results.push({ number: facing.number, homeworkNumberId: number.id, verdict: facing.verdict, recognizedAnswer: facing.recognizedAnswer, comment: facing.comment });
    }
    results.sort((left, right) => compareHomeworkNumbers(left.number, right.number));
    return {
      id: check.id,
      status: check.status,
      errorCode: check.status === "FAILED" ? classifySolutionCheckError(check.error) : null,
      createdAt: check.createdAt,
      checkedAt: check.checkedAt,
      results,
    };
  };

  const homeworkNumberViews = (assignment: HomeworkAssignment): HomeworkNumberView[] =>
    q.homeworkNumbers(assignment.id).map((number) => {
      const row = q.status(assignment.studentId, number.id);
      return { number, status: row?.status ?? null, note: row?.note ?? "" };
    });

  const solvedCountOf = (numbers: readonly HomeworkNumberView[]): number => numbers.filter((entry) => entry.status === "GREEN" || entry.status === "YELLOW").length;

  const attentionInput = (view: Pick<HomeworkView, "assignment" | "numbers" | "latestCheck">): AttentionHomework => ({
    createdAt: view.assignment.createdAt,
    deadlineAt: view.assignment.deadlineAt,
    numbers: view.numbers.map((entry) => ({ status: entry.status })),
    latestCheck: view.latestCheck ? { status: view.latestCheck.status, results: q.checkResults(view.latestCheck.id).map((result) => ({ verdict: result.verdict })) } : null,
  });

  const homeworkView = (assignment: HomeworkAssignment, now: number): HomeworkView => {
    const numbers = homeworkNumberViews(assignment);
    const latestCheck = q.latestHomeworkCheck(assignment.id);
    const solvedCount = solvedCountOf(numbers);
    return {
      assignment,
      numbers,
      latestCheck,
      summary: {
        id: assignment.id,
        title: assignment.title,
        orderInTopic: q.homeworkOrderInTopic(assignment),
        topicId: assignment.topicId,
        topicTitle: q.topic(assignment.topicId)?.title ?? "",
        deadlineAt: assignment.deadlineAt,
        createdAt: assignment.createdAt,
        totalNumbers: numbers.length,
        solvedCount,
        solvedPercent: numbers.length > 0 ? Math.round((solvedCount / numbers.length) * 100) : 0,
        photosCount: q.homeworkPhotos(assignment.id).length,
        attentionRank: homeworkAttentionRank(attentionInput({ assignment, numbers, latestCheck }), now) as HomeworkSummaryDto["attentionRank"],
        latestCheckStatus: latestCheck?.status ?? null,
      },
    };
  };

  // ───────────────────────────── homework: check lifecycle ─────────────────────────────

  /** Keeps the newest `completedChecksKept` finished checks of a student; older ones go with their photos. */
  const pruneCompletedChecks = (studentId: string): void => {
    const checks = q
      .homeworksOfStudent(studentId)
      .flatMap((assignment) => store.homeworkChecks.by("assignmentId", assignment.id))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    for (const checkId of selectCompletedCheckIdsToPrune(checks, ctx.settings().completedChecksKept)) {
      const photos = store.homeworkCheckPhotos.by("checkId", checkId);
      for (const photo of photos) store.homeworkCheckPhotos.delete(photo.id);
      ctx.cascade.deleteHomeworkCheck(checkId);
      for (const photo of photos) ctx.files.removeIfUnreferenced(photo.fileId);
    }
  };

  /**
   * FAILED: nothing is detached and no status changes. `preModel` = the failure happened before the model
   * was called — the daily slot goes back and (like on the site) the journal gets no row.
   */
  const failHomeworkCheck = (check: HomeworkCheck, rawError: string, preModel: boolean): void => {
    const assignment = q.homework(check.assignmentId);
    store.homeworkChecks.update(check.id, { status: "FAILED", activeSlot: null, error: rawError.slice(0, 500), checkedAt: ctx.nowIso() });
    store.rowScripts.delete(check.id);
    if (preModel) {
      limits.releaseBudget(HOMEWORK_BUDGET);
    } else if (assignment) {
      ctx.audit.write({
        category: "AI",
        action: "solution.check",
        outcome: "failed",
        actor: actorOf(q.user(assignment.studentId)),
        targetType: "HomeworkAssignment",
        targetId: assignment.id,
        targetLabel: q.topic(assignment.topicId)?.title ?? null,
        text: { key: "solution.check.failed" },
        model: check.modelUsed ?? MOCK_MODEL_NAME,
        durationMs: Math.max(0, ctx.now() - Date.parse(check.createdAt)),
        error: rawError,
        meta: { checkId: check.id, aiCalls: 1, modelCallStarted: true },
      });
    }
    if (assignment) pruneCompletedChecks(assignment.studentId);
  };

  /** PENDING → CHECKING — the worker picks the task up; a check that cannot run fails here, before the model. */
  const beginHomeworkCheck = (checkId: string): void => {
    const check = store.homeworkChecks.get(checkId);
    if (!check || check.status !== "PENDING" || check.activeSlot !== 1) return;
    if (!ctx.settings().aiEnabled) return failHomeworkCheck(check, RAW_ERRORS.homeworkDisabled, true);
    if (q.checkPhotos(check.id).length === 0 || q.homeworkNumbers(check.assignmentId).length === 0) {
      return failHomeworkCheck(check, RAW_ERRORS.homeworkNothingToCheck, true);
    }
    store.homeworkChecks.update(check.id, { status: "CHECKING", modelUsed: MOCK_MODEL_NAME });
  };

  /** Results of a seeded row script, matched to the assignment's numbers by the normalised label. */
  const scriptedHomeworkResults = (script: MockRowScript, numbers: readonly HomeworkNumberView[]): { homeworkNumberId: string; result: ScriptedResult }[] => {
    if (script.outcome.kind !== "results") return [];
    const byLabel = new Map(numbers.map((entry) => [normalizeHomeworkNumber(entry.number.number), entry.number.id] as const));
    return script.outcome.results.flatMap((result) => {
      const homeworkNumberId = byLabel.get(normalizeHomeworkNumber(result.number));
      return homeworkNumberId ? [{ homeworkNumberId, result }] : [];
    });
  };

  /** CHECKING → DONE / FAILED: rule V decides the verdicts, then the site's pipeline runs (03 §4.2 – §4.4). */
  const finishHomeworkCheck = (checkId: string, locale: Locale): void => {
    beginHomeworkCheck(checkId);
    const check = store.homeworkChecks.get(checkId);
    if (!check || check.status !== "CHECKING" || check.activeSlot !== 1) return;
    const assignment = q.homework(check.assignmentId);
    if (!assignment) return;

    const numbers = homeworkNumberViews(assignment);
    const snapshot = q.checkPhotos(check.id);

    // Precedence: the armed one-shot control, the script of a seeded in-flight row, rule V-H.
    const control: NextCheckOutcome | null = ctx.switches.takeNextCheckOutcome();
    const script = store.rowScripts.get(check.id);
    let scripted: { homeworkNumberId: string; result: ScriptedResult }[];
    if (control?.kind === "failed") {
      return failHomeworkCheck(check, failedCheckError(control.errorClass, "homework"), failureRefundsBudget(control.errorClass));
    } else if (control?.kind === "doneEmpty") {
      scripted = [];
    } else if (!control && script?.outcome.kind === "failed") {
      return failHomeworkCheck(check, failedCheckError(script.outcome.errorClass, "homework"), failureRefundsBudget(script.outcome.errorClass));
    } else if (!control && script) {
      scripted = scriptedHomeworkResults(script, numbers);
    } else {
      const ruleInput = numbers.map((entry) => ({ homeworkNumberId: entry.number.id, number: entry.number.number, status: entry.status }));
      scripted = scriptHomeworkCheck(ruleInput, snapshot.length, locale, control?.verdicts).map(({ entry, result }) => ({ homeworkNumberId: entry.homeworkNumberId, result }));
    }
    const results = scripted.map(({ homeworkNumberId, result }) => ({ homeworkNumberId, result: settleResult(result) }));

    const checkedAt = ctx.nowIso();
    store.homeworkChecks.update(check.id, { status: "DONE", activeSlot: null, checkedAt });
    store.rowScripts.delete(check.id);

    let applied = 0;
    for (const { homeworkNumberId, result } of results) {
      store.homeworkCheckResults.insert({
        id: store.nextId("res"),
        checkId: check.id,
        homeworkNumberId,
        verdict: result.verdict,
        recognizedAnswer: result.recognizedAnswer,
        comment: result.comment,
        confidence: result.confidence,
        copySuspected: result.copySuspected,
        copyReason: result.copyReason,
        errorKind: result.errorKind,
        errorNote: result.errorNote,
        injectionSuspected: result.injectionSuspected,
        injectionNote: result.injectionNote,
      });
      // A homework check never lowers a colour and yields to a mark made after the check was started.
      const written = ctx.progress.write({
        source: "homework_check",
        verdict: result.verdict,
        checkStartedAt: new Date(check.createdAt),
        studentId: assignment.studentId,
        homeworkNumberId,
        references: { assignmentId: assignment.id, checkId: check.id },
      });
      if (written.decision.write) applied += 1;
    }

    // The batch is checked: its photos leave the homework and live on in the check history only. Photos
    // attached after the start are not part of the snapshot and stay as the beginning of the next batch.
    const consumed = new Set(snapshot.map((photo) => photo.fileId));
    for (const photo of store.homeworkPhotos.by("assignmentId", assignment.id)) {
      if (consumed.has(photo.fileId)) store.homeworkPhotos.delete(photo.id);
    }

    pruneCompletedChecks(assignment.studentId);

    const correct = results.filter((entry) => entry.result.verdict === "CORRECT").length;
    const incorrect = results.filter((entry) => entry.result.verdict === "INCORRECT").length;
    const uncertain = results.filter((entry) => entry.result.verdict === "UNCERTAIN").length;

    ctx.notify.create({
      userId: assignment.studentId,
      type: "homework-checked",
      params: { correct, incorrect, uncertain, applied },
      href: `/student/homeworks/${assignment.id}`,
    });
    if (applied > 0) ctx.emit({ kind: "student-progress-changed", studentId: assignment.studentId, topicId: assignment.topicId });

    // The actor of an automatic check is the student who sent the photos.
    ctx.audit.write({
      category: "AI",
      action: "solution.check",
      actor: actorOf(q.user(assignment.studentId)),
      targetType: "HomeworkAssignment",
      targetId: assignment.id,
      targetLabel: q.topic(assignment.topicId)?.title ?? null,
      text: { key: "solution.check", params: { correct, incorrect, uncertain } },
      model: check.modelUsed ?? MOCK_MODEL_NAME,
      durationMs: Math.max(0, ctx.now() - Date.parse(check.createdAt)),
      meta: { checkId: check.id, aiCalls: 1, numbers: numbers.length, photos: snapshot.length },
    });
  };

  /**
   * Stale sweep of one homework: an active check nobody is working on (no job left — e.g. its handler was
   * lost) turns FAILED `interrupted`, so a poll sees a terminal status and a new start is not refused
   * forever. Only a stale PENDING gives its daily slot back.
   */
  const sweepStaleHomeworkChecks = (assignment: HomeworkAssignment): void => {
    const now = ctx.now();
    let stalePending = 0;
    let swept = 0;
    for (const check of store.homeworkChecks.by("assignmentId", assignment.id)) {
      if (check.activeSlot !== 1 || ctx.jobs.pending(check.id).length > 0) continue;
      const age = now - Date.parse(check.createdAt);
      const stale = check.status === "PENDING" ? age > STALE_PENDING_MS : check.status === "CHECKING" && age > STALE_CHECKING_MS;
      if (!stale) continue;
      if (check.status === "PENDING") stalePending += 1;
      swept += 1;
      store.homeworkChecks.update(check.id, { status: "FAILED", activeSlot: null, error: failedCheckError("interrupted", "homework"), checkedAt: ctx.nowIso() });
      store.rowScripts.delete(check.id);
    }
    if (stalePending > 0) limits.releaseBudget(HOMEWORK_BUDGET, stalePending);
    if (swept > 0) pruneCompletedChecks(assignment.studentId);
  };

  ctx.jobs.handle(JOBS.homeworkBegin, (job) => beginHomeworkCheck(job.refId));
  ctx.jobs.handle(JOBS.homeworkFinish, (job) => finishHomeworkCheck(job.refId, localeOfJob(job)));

  // ───────────────────────────── live lesson: projections ─────────────────────────────

  const lessonCheckAvailable = (): boolean => ctx.settings().aiEnabled && ctx.settings().lessonCheckEnabled;

  const lessonItemViews = (participantId: string): LessonItemView[] =>
    q.items(participantId).map((item) => {
      const submissions = q.submissions(item.id);
      // The submit route's derivation: the verdict of the newest submission that is DONE.
      const latestDone = [...submissions].reverse().find((submission) => submission.status === "DONE");
      return {
        item,
        latest: submissions[submissions.length - 1],
        state: { isExtra: item.isExtra, result: item.result, latestVerdict: latestDone?.verdict ?? null },
      };
    });

  /** The student's view of a submission: verdict and comment only when DONE, the error as its class only. */
  const submissionDto = (submission: LessonItemSubmission): LessonSubmissionDto => {
    const facing =
      submission.status === "DONE" && submission.verdict
        ? toStudentFacingResult({ number: "", verdict: submission.verdict, recognizedAnswer: submission.recognizedAnswer, comment: submission.comment }, ctx.locale())
        : null;
    return {
      id: submission.id,
      itemId: submission.itemId,
      status: submission.status,
      verdict: facing?.verdict ?? null,
      comment: facing?.comment ?? null,
      errorCode: submission.status === "FAILED" ? classifySolutionCheckError(submission.error) : null,
      submittedAt: submission.submittedAt,
      checkedAt: submission.checkedAt,
    };
  };

  /** `closed` / `canSubmit` of every item (A.6 rule 7), `order` asc. */
  const lessonItemStates = (views: readonly LessonItemView[], status: DerivedLessonStatus): LessonItemStateDto[] => {
    const extraUnlocked = isExtraPartUnlocked(views.map((view) => view.state));
    return views.map((view) => {
      const locked = view.item.isExtra && !extraUnlocked;
      const checking = view.latest !== undefined && isActiveStatus(view.latest.status);
      return {
        id: view.item.id,
        result: view.item.result,
        submission: view.latest ? submissionDto(view.latest) : null,
        closed: isLessonItemClosed(view.state),
        canSubmit: status === "ACTIVE" && !locked && !checking && canSubmitLessonItem(view.state),
      };
    });
  };

  /** Starts the timers of seeded in-flight submissions when they are first returned to a client. */
  const touchSubmissions = (views: readonly LessonItemView[]): void => {
    for (const view of views) {
      if (view.latest && view.latest.activeSlot === 1) ctx.jobs.touch(view.latest.id);
    }
  };

  // ───────────────────────────── live lesson: check lifecycle ─────────────────────────────

  /** The rows a submission belongs to; undefined when one of them is gone. */
  const submissionScope = (submission: LessonItemSubmission) => {
    const item = q.item(submission.itemId);
    const participant = q.participant(item?.participantId);
    const lesson = q.lesson(participant?.lessonId);
    const number = q.number(item?.homeworkNumberId);
    return item && participant && lesson && number ? { item, participant, lesson, number } : undefined;
  };

  /**
   * FAILED: neither the item result nor the status changes; the student may hand the item in again.
   * `preModel` gives the daily slot back; only a failure of the model stage is journalled and announced.
   */
  const failSubmission = (submission: LessonItemSubmission, rawError: string, mode: "preModel" | "noVerdict" | "model"): void => {
    store.submissions.update(submission.id, { status: "FAILED", activeSlot: null, error: rawError.slice(0, 500), checkedAt: ctx.nowIso() });
    store.rowScripts.delete(submission.id);
    if (mode === "preModel") limits.releaseBudget(LESSON_BUDGET);
    if (mode !== "model") return;

    const scope = submissionScope(submission);
    if (!scope) return;
    ctx.audit.write({
      category: "AI",
      action: "lesson_item.check",
      outcome: "failed",
      actor: actorOf(q.user(scope.participant.studentId)),
      targetType: "LessonAssignmentItem",
      targetId: scope.item.id,
      targetLabel: `№ ${scope.number.number} · ${q.topic(scope.number.topicId)?.title ?? ""}`,
      text: { key: "lesson_item.check.failed" },
      model: submission.modelUsed ?? MOCK_MODEL_NAME,
      durationMs: Math.max(0, ctx.now() - Date.parse(submission.submittedAt)),
      error: rawError,
      meta: { submissionId: submission.id, lessonId: scope.lesson.id, aiCalls: 1, modelCallStarted: true },
    });
    ctx.emit({ kind: "lesson-activity", lessonId: scope.lesson.id, teacherId: scope.lesson.teacherId, studentId: scope.participant.studentId });
  };

  const failSubmissionByClass = (submission: LessonItemSubmission, errorClass: CheckErrorCode): void =>
    failSubmission(submission, failedCheckError(errorClass, "lesson"), failureRefundsBudget(errorClass) ? "preModel" : "model");

  const beginSubmission = (submissionId: string): void => {
    const submission = store.submissions.get(submissionId);
    if (!submission || submission.status !== "PENDING" || submission.activeSlot !== 1) return;
    if (!lessonCheckAvailable()) return failSubmission(submission, RAW_ERRORS.lessonDisabled, "preModel");
    if (q.submissionPhotos(submission.id).length === 0) return failSubmission(submission, RAW_ERRORS.lessonNoPhotos, "preModel");
    store.submissions.update(submission.id, { status: "CHECKING", modelUsed: MOCK_MODEL_NAME });
  };

  /** CHECKING → DONE / FAILED of one lesson submission, then the auto result and its mirror (03 §4.7). */
  const finishSubmission = (submissionId: string, locale: Locale): void => {
    beginSubmission(submissionId);
    const submission = store.submissions.get(submissionId);
    if (!submission || submission.status !== "CHECKING" || submission.activeSlot !== 1) return;
    const scope = submissionScope(submission);
    if (!scope) return;
    const { item, participant, lesson, number } = scope;

    const others = q.submissions(item.id).filter((row) => row.id !== submission.id);

    // Precedence: the armed one-shot control, the script of a seeded in-flight row, rule V-L.
    const control: NextCheckOutcome | null = ctx.switches.takeNextCheckOutcome();
    const script = store.rowScripts.get(submission.id);
    let scripted: ScriptedResult | undefined;
    if (control?.kind === "failed") {
      return failSubmissionByClass(submission, control.errorClass);
    } else if (control?.kind === "doneEmpty") {
      scripted = undefined;
    } else if (!control && script?.outcome.kind === "failed") {
      return failSubmissionByClass(submission, script.outcome.errorClass);
    } else if (!control && script?.outcome.kind === "results") {
      scripted = script.outcome.results[0];
    } else {
      const position = Math.max(0, q.items(participant.id).findIndex((row) => row.id === item.id));
      const doneAttempts = others.filter((row) => row.status === "DONE").length;
      scripted = scriptLessonSubmission(number.number, position, doneAttempts, locale, control?.verdicts[0]);
    }
    if (!scripted) return failSubmission(submission, RAW_ERRORS.lessonNoVerdict, "noVerdict");

    const result = settleResult(scripted);
    const prefill = decideAutoLessonResult({
      verdict: result.verdict,
      currentResult: item.result,
      hadIncorrectBefore: others.some((row) => row.verdict === "INCORRECT"),
    });

    store.submissions.update(submission.id, {
      status: "DONE",
      activeSlot: null,
      checkedAt: ctx.nowIso(),
      verdict: result.verdict,
      recognizedAnswer: result.recognizedAnswer,
      comment: result.comment,
      confidence: result.confidence,
      errorKind: result.errorKind,
      errorNote: result.errorNote,
      injectionSuspected: result.injectionSuspected,
      injectionNote: result.injectionNote,
    });
    store.rowScripts.delete(submission.id);
    if (prefill) store.lessonItems.update(item.id, { result: prefill });

    // Unlike a homework check, a lesson result is mirrored without downgrade protection. The verdict is
    // applied even if the lesson has ended in the meantime.
    const written = ctx.progress.write({
      source: "lesson_check",
      result: prefill,
      verdict: result.verdict,
      studentId: participant.studentId,
      homeworkNumberId: number.id,
      references: { lessonId: lesson.id, itemId: item.id, submissionId: submission.id },
    });

    ctx.emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: lesson.teacherId, studentId: participant.studentId });
    if (written.decision.write) ctx.emit({ kind: "student-progress-changed", studentId: participant.studentId, topicId: number.topicId });

    ctx.audit.write({
      category: "AI",
      action: "lesson_item.check",
      actor: actorOf(q.user(participant.studentId)),
      targetType: "LessonAssignmentItem",
      targetId: item.id,
      targetLabel: `№ ${number.number} · ${q.topic(number.topicId)?.title ?? ""}`,
      text: { key: "lesson_item.check", params: { number: number.number, verdict: auditVerdict(result.verdict) } },
      model: submission.modelUsed ?? MOCK_MODEL_NAME,
      durationMs: Math.max(0, ctx.now() - Date.parse(submission.submittedAt)),
      meta: { submissionId: submission.id, lessonId: lesson.id, aiCalls: 1, photos: q.submissionPhotos(submission.id).length },
    });
  };

  /** Stale sweep of one student's submissions in one lesson (03 §4.3). */
  const sweepStaleSubmissions = (participant: LessonParticipant): void => {
    const now = ctx.now();
    let stalePending = 0;
    for (const item of q.items(participant.id)) {
      for (const submission of store.submissions.by("itemId", item.id)) {
        if (submission.activeSlot !== 1 || ctx.jobs.pending(submission.id).length > 0) continue;
        const age = now - Date.parse(submission.submittedAt);
        const stale = submission.status === "PENDING" ? age > STALE_PENDING_MS : submission.status === "CHECKING" && age > STALE_CHECKING_MS;
        if (!stale) continue;
        if (submission.status === "PENDING") stalePending += 1;
        store.submissions.update(submission.id, { status: "FAILED", activeSlot: null, error: failedCheckError("interrupted", "lesson"), checkedAt: ctx.nowIso() });
        store.rowScripts.delete(submission.id);
      }
    }
    if (stalePending > 0) limits.releaseBudget(LESSON_BUDGET, stalePending);
  };

  ctx.jobs.handle(JOBS.lessonBegin, (job) => beginSubmission(job.refId));
  ctx.jobs.handle(JOBS.lessonFinish, (job) => finishSubmission(job.refId, localeOfJob(job)));

  /**
   * `joinedAt = now` when it was null and attendance UNKNOWN → PRESENT. The join call marks attendance only
   * together with the first stamp; a submission marks it whenever it is still UNKNOWN. A mark set by the
   * teacher is never overwritten.
   */
  const stampPresence = (participant: LessonParticipant, markPresentAlways: boolean): LessonParticipant => {
    const joining = participant.joinedAt === null;
    const markPresent = participant.attendance === "UNKNOWN" && (joining || markPresentAlways);
    if (!joining && !markPresent) return participant;
    const now = ctx.nowIso();
    return store.participants.update(participant.id, {
      ...(joining ? { joinedAt: now } : {}),
      ...(markPresent ? { attendance: "PRESENT" as const } : {}),
      updatedAt: now,
    });
  };

  const activeLessonDto = (lesson: Lesson, participant: LessonParticipant, startsAt: string): ActiveLessonDto => {
    const views = lessonItemViews(participant.id);
    touchSubmissions(views);
    const states = lessonItemStates(views, "ACTIVE");
    const items: LessonItemDto[] = [];
    views.forEach((view, index) => {
      const number = q.number(view.item.homeworkNumberId);
      const state = states[index];
      if (!number || !state) return;
      items.push({
        id: view.item.id,
        order: view.item.order,
        isExtra: view.item.isExtra,
        number: number.number,
        homeworkNumberId: number.id,
        topicId: number.topicId,
        topicTitle: q.topic(number.topicId)?.title ?? "",
        // The statement is sent for every item, a locked extra part included (A.8 item 6).
        conditionLatex: number.conditionLatex,
        result: state.result,
        submission: state.submission,
        closed: state.closed,
        canSubmit: state.canSubmit,
      });
    });
    return {
      lessonId: lesson.id,
      title: lesson.title,
      groupName: q.group(lesson.groupId)?.name ?? null,
      startsAt,
      durationMinutes: lesson.durationMinutes,
      // The schedule, never `finishedAt`: an early finish is observed through the `/state` poll (A.8 item 2).
      endsAt: new Date(Date.parse(startsAt) + Math.max(0, lesson.durationMinutes) * MINUTE_MS).toISOString(),
      joinedAt: participant.joinedAt,
      items,
    };
  };

  // ───────────────────────────── the ten methods ─────────────────────────────

  return {
    async listHomeworks(opts) {
      ctx.throwIfAborted(opts?.signal);
      const user = auth.requireStudent();
      const now = ctx.now();
      const views = q.homeworksOfStudent(user.id).map((assignment) => homeworkView(assignment, now));
      const sorted = sortHomeworksByAttention(views.map((view) => ({ ...attentionInput(view), view })), now);
      return {
        serverNow: ctx.nowIso(),
        // False only when the homework table is missing on a server — never in the mock.
        available: true,
        limits: { maxPhotosPerAssignment: ctx.settings().maxPhotosPerAssignment },
        assignments: sorted.map(({ view }) => ({
          ...view.summary,
          numbers: view.numbers.map((entry) => ({ homeworkNumberId: entry.number.id, number: entry.number.number, status: entry.status })),
        })),
      };
    },

    async getHomework(assignmentId, opts) {
      ctx.throwIfAborted(opts?.signal);
      const user = auth.requireStudent();
      const assignment = ctx.guard.ownHomework(user, assignmentId);
      const view = homeworkView(assignment, ctx.now());
      // SPEC-GAP: 90-addendum-6 §5 starts the timer of a seeded in-flight check at "the first read of the
      // row". The list carries only `latestCheckStatus`, so the read that counts is the one returning the
      // check itself (this method and the poll) — the running state is then visible on the detail screen.
      if (view.latestCheck?.activeSlot === 1) ctx.jobs.touch(view.latestCheck.id);
      const numbers: StudentHomeworkNumberDto[] = view.numbers.map((entry) => ({
        homeworkNumberId: entry.number.id,
        number: entry.number.number,
        conditionLatex: entry.number.conditionLatex,
        status: entry.status,
        note: entry.note,
      }));
      return {
        serverNow: ctx.nowIso(),
        limits: { maxPhotosPerAssignment: ctx.settings().maxPhotosPerAssignment, noteMaxLength: LIMITS.noteMaxLength },
        // False only when the `note` column is missing on a server.
        notesEnabled: true,
        // The condition the start endpoint tests; the mocked model is always "configured".
        aiCheckAvailable: ctx.settings().aiEnabled,
        assignment: {
          ...view.summary,
          photos: attachedPhotos(assignment.id),
          latestCheck: view.latestCheck ? checkDto(view.latestCheck) : null,
          numbers,
        },
      };
    },

    async uploadHomeworkPhotos(assignmentId, files, opts) {
      ctx.throwIfAborted(opts?.signal);
      const user = auth.requireStudent();
      limits.enforce("api:homework-submissions");
      const photos = validatePhotos(files);
      const assignment = ctx.guard.ownHomework(user, assignmentId);

      // The limit counts the photos attached right now, not all photos ever uploaded.
      const max = ctx.settings().maxPhotosPerAssignment;
      if (q.homeworkPhotos(assignment.id).length + photos.length > max) throw photoLimitError("homework", max);
      ctx.throwIfAborted(opts?.signal);

      // All files of the call are stored or none.
      const created = store.transaction(() => {
        const createdAt = ctx.nowIso();
        return photos.map((photo) => {
          const file = ctx.files.createFromUpload({ uri: photo.uri, name: photo.originalName, mimeType: photo.mimeType, size: photo.size }, user.id);
          return store.homeworkPhotos.insert({ id: store.nextId("hwp"), assignmentId: assignment.id, fileId: file.id, createdAt });
        });
      });
      reportProgress(opts, photos);

      // No status changes; the teacher's review screen refreshes on this event.
      ctx.emit({ kind: "student-progress-changed", studentId: user.id, topicId: assignment.topicId });

      const createdIds = new Set(created.map((photo) => photo.id));
      const attached = attachedPhotos(assignment.id);
      return { photos: attached.filter((photo) => createdIds.has(photo.id)), photosCount: attached.length };
    },

    async deleteHomeworkPhoto(assignmentId, photoId) {
      const user = auth.requireStudent();
      limits.enforce("api:homework-submissions");
      // Only a photo attached right now to THIS homework of THIS student; anything else is the same 404.
      const photo = store.homeworkPhotos.get(photoId);
      const assignment = q.homework(photo?.assignmentId);
      if (!photo || !assignment || assignment.id !== assignmentId || assignment.studentId !== user.id) throw errors.notFound("photoNotFound");

      store.transaction(() => {
        store.homeworkPhotos.delete(photo.id);
        // A file already snapshotted by a running or finished check stays alive in the check history.
        ctx.files.removeIfUnreferenced(photo.fileId);
      });
      ctx.emit({ kind: "student-progress-changed", studentId: user.id, topicId: assignment.topicId });
      return { photosCount: q.homeworkPhotos(assignment.id).length };
    },

    async startHomeworkCheck(assignmentId) {
      const user = auth.requireStudent();
      assertQueueHasRoom("homework");
      // Consumed before any validation: it exists to stop hammering before any work is done.
      limits.enforce("api:homework-checks");
      if (!ctx.settings().aiEnabled) {
        return errors.fail({ status: 503, code: "checkDisabled", message: (dict) => dict.apiStudent.homeworkChecks.disabled });
      }

      const owned = q.homework(assignmentId);
      if (owned && owned.studentId === user.id) sweepStaleHomeworkChecks(owned);
      const assignment = ctx.guard.ownHomework(user, assignmentId);

      const photos = q.homeworkPhotos(assignment.id);
      if (photos.length === 0) {
        return errors.fail({ status: 400, code: "attachPhotosFirst", message: (dict) => dict.apiStudent.homeworkChecks.attachPhotosFirst });
      }
      if (q.homeworkNumbers(assignment.id).length === 0) {
        return errors.fail({ status: 400, code: "noNumbers", message: (dict) => dict.apiStudent.homeworkChecks.noNumbers });
      }
      if (q.activeHomeworkCheck(assignment.id)) {
        return errors.fail({ status: 409, code: "alreadyRunning", message: (dict) => dict.apiStudent.homeworkChecks.alreadyRunning });
      }
      // SPEC-GAP: `409 photosChanged` (a photo deleted while the snapshot is written) and `409 concurrentChange`
      // need two requests racing on the server; the in-process mock is single-threaded and has no switch for them.

      // The row and the snapshot of the attached photos (upload order) in one transaction.
      const check = store.transaction(() => {
        const row = store.homeworkChecks.insert({
          id: store.nextId("chk"),
          assignmentId: assignment.id,
          status: "PENDING",
          activeSlot: 1,
          modelUsed: null,
          error: null,
          createdAt: ctx.nowIso(),
          checkedAt: null,
        });
        photos.forEach((photo, order) => {
          store.homeworkCheckPhotos.insert({ id: store.nextId("chp"), checkId: row.id, fileId: photo.fileId, order });
        });
        return row;
      });

      // The school-wide daily budget is taken last, when it is known that there is something to check; on a
      // refusal the row is removed again, otherwise the student would be left with an eternal PENDING.
      const budget = limits.consumeBudget(HOMEWORK_BUDGET);
      if (!budget.allowed) {
        store.transaction(() => {
          for (const photo of store.homeworkCheckPhotos.by("checkId", check.id)) store.homeworkCheckPhotos.delete(photo.id);
          ctx.cascade.deleteHomeworkCheck(check.id);
        });
        throw errors.rateLimited(retryAfterSeconds(budget));
      }

      // The queue task carries the request language: the model writes its comments in it.
      const payload = { locale: ctx.locale() };
      ctx.jobs.schedule(JOBS.homeworkBegin, check.id, ctx.timings.checkBeginMs, payload);
      ctx.jobs.schedule(JOBS.homeworkFinish, check.id, ctx.timings.checkFinishMs, payload);

      return { check: checkDto(check) };
    },

    async getLatestHomeworkCheck(assignmentId, opts) {
      ctx.throwIfAborted(opts?.signal);
      const user = auth.requireStudent();
      limits.enforce("api:homework-check-status");
      const assignment = ctx.guard.ownHomework(user, assignmentId);
      // A dead check is returned as FAILED instead of spinning forever.
      sweepStaleHomeworkChecks(assignment);

      const check = q.latestHomeworkCheck(assignment.id);
      if (check?.activeSlot === 1) ctx.jobs.touch(check.id);
      const numbers = homeworkNumberViews(assignment);
      return {
        check: check ? checkDto(check) : null,
        photos: attachedPhotos(assignment.id),
        numbers: numbers.map((entry) => ({ homeworkNumberId: entry.number.id, status: entry.status })),
        solvedCount: solvedCountOf(numbers),
      };
    },

    async getLiveLesson(opts) {
      ctx.throwIfAborted(opts?.signal);
      const user = auth.requireStudent();
      // Results of a lesson that has just ended are closed lazily, on this read.
      ctx.lessons.finalizeDue({ studentId: user.id });

      const now = ctx.now();
      const candidates = store.participants
        .by("studentId", user.id)
        .flatMap((participant) => {
          const lesson = q.lesson(participant.lessonId);
          if (!lesson || lesson.kind !== "LESSON" || !lesson.startsAt) return [];
          const startsAt = Date.parse(lesson.startsAt);
          return Number.isFinite(startsAt) && startsAt >= now - LIVE_LESSON_LOOKBACK_MS ? [{ lesson, participant, startsAt, startsAtIso: lesson.startsAt }] : [];
        })
        .sort((left, right) => left.startsAt - right.startsAt || left.lesson.id.localeCompare(right.lesson.id))
        .slice(0, LIVE_LESSON_CANDIDATES);

      const active = candidates.find((entry) => q.lessonStatus(entry.lesson) === "ACTIVE");
      // Computed even when a lesson is running.
      const upcoming = candidates.find((entry) => q.lessonStatus(entry.lesson) === "PLANNED");

      return {
        serverNow: new Date(now).toISOString(),
        limits: { maxPhotosPerSubmission: LESSON_SUBMISSION_MAX_PHOTOS },
        lessonCheckAvailable: lessonCheckAvailable(),
        active: active ? activeLessonDto(active.lesson, active.participant, active.startsAtIso) : null,
        upcoming: upcoming
          ? {
              lessonId: upcoming.lesson.id,
              title: upcoming.lesson.title,
              startsAt: upcoming.startsAtIso,
              durationMinutes: upcoming.lesson.durationMinutes,
              groupName: q.group(upcoming.lesson.groupId)?.name ?? null,
            }
          : null,
      };
    },

    async joinLesson(lessonId) {
      const user = auth.requireStudent();
      limits.enforce("api:lesson-join");
      const { lesson, participant } = ctx.guard.ownLesson(user, lessonId);
      if (q.lessonStatus(lesson) !== "ACTIVE") {
        return errors.fail({ status: 409, code: "lessonNotActive", message: (dict) => dict.apiStudent.lesson.notActive });
      }

      // Idempotent: only the first call stamps the participant and tells the teacher's board.
      if (participant.joinedAt !== null) return { joinedAt: participant.joinedAt };
      const joined = stampPresence(participant, false);
      ctx.emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: lesson.teacherId, studentId: user.id });
      return { joinedAt: joined.joinedAt ?? ctx.nowIso() };
    },

    async submitLessonItem(lessonId, itemId, files, opts) {
      ctx.throwIfAborted(opts?.signal);
      const user = auth.requireStudent();
      assertQueueHasRoom("lesson");
      // Consumed before any validation.
      limits.enforce("api:lesson-checks");
      if (!lessonCheckAvailable()) {
        return errors.fail({ status: 503, code: "checkDisabled", message: (dict) => dict.apiStudent.lessonSubmissions.disabled });
      }
      const photos = validatePhotos(files, LESSON_SUBMISSION_MAX_PHOTOS);

      // The item must belong to THIS student's participation in THIS lesson (kind LESSON); a foreign set is
      // indistinguishable from a missing one.
      const item = q.item(itemId);
      const participant = q.participant(item?.participantId);
      const lesson = q.lesson(participant?.lessonId);
      const number = q.number(item?.homeworkNumberId);
      if (!item || !participant || !lesson || !number || participant.studentId !== user.id || lesson.kind !== "LESSON" || lesson.id !== lessonId) {
        throw errors.notFound("itemNotFound", (dict) => dict.apiStudent.lessonSubmissions.itemNotFound);
      }
      if (q.lessonStatus(lesson) !== "ACTIVE") {
        return errors.fail({ status: 409, code: "lessonNotActive", message: (dict) => dict.apiStudent.lessonSubmissions.lessonNotActive });
      }

      // Frees dead submissions, otherwise the "one active submission per item" rule answers 409 forever.
      sweepStaleSubmissions(participant);

      const views = lessonItemViews(participant.id);
      const current = views.find((view) => view.item.id === item.id);
      if (current && !canSubmitLessonItem(current.state)) {
        return errors.fail({
          status: 409,
          code: "alreadyAccepted",
          message: (dict) => dict.apiStudent.lessonSubmissions.alreadyAccepted,
          params: { number: number.number },
        });
      }
      if (item.isExtra && !isExtraPartUnlocked(views.map((view) => view.state))) {
        return errors.fail({ status: 409, code: "extraPartLocked", message: (dict) => dict.apiStudent.lessonSubmissions.extraPartLocked });
      }
      // One active submission per item; other items may be checked in parallel.
      if (store.submissions.findUnique("activeSlot", `${item.id}|1`)) {
        return errors.fail({ status: 409, code: "alreadyRunning", message: (dict) => dict.apiStudent.lessonSubmissions.alreadyRunning });
      }
      ctx.throwIfAborted(opts?.signal);

      // The submission, its photos and the presence stamp in one transaction.
      const submission = store.transaction(() => {
        const row = store.submissions.insert({
          id: store.nextId("sub"),
          itemId: item.id,
          status: "PENDING",
          activeSlot: 1,
          verdict: null,
          recognizedAnswer: null,
          comment: null,
          confidence: null,
          errorKind: null,
          errorNote: null,
          injectionSuspected: false,
          injectionNote: null,
          modelUsed: null,
          error: null,
          submittedAt: ctx.nowIso(),
          checkedAt: null,
        });
        photos.forEach((photo, order) => {
          const file = ctx.files.createFromUpload({ uri: photo.uri, name: photo.originalName, mimeType: photo.mimeType, size: photo.size }, user.id);
          store.submissionPhotos.insert({ id: store.nextId("subp"), submissionId: row.id, fileId: file.id, order });
        });
        stampPresence(participant, true);
        return row;
      });

      // The school-wide daily lesson budget is taken last; on a refusal the submission and its files go again
      // (the presence stamp stays — the student did show up).
      const budget = limits.consumeBudget(LESSON_BUDGET);
      if (!budget.allowed) {
        store.transaction(() => {
          const rows = store.submissionPhotos.by("submissionId", submission.id);
          for (const row of rows) store.submissionPhotos.delete(row.id);
          ctx.cascade.deleteLessonSubmission(submission.id);
          for (const row of rows) ctx.files.removeIfUnreferenced(row.fileId);
        });
        throw errors.rateLimited(retryAfterSeconds(budget));
      }
      reportProgress(opts, photos);

      const payload = { locale: ctx.locale() };
      ctx.jobs.schedule(JOBS.lessonBegin, submission.id, ctx.timings.checkBeginMs, payload);
      ctx.jobs.schedule(JOBS.lessonFinish, submission.id, ctx.timings.checkFinishMs, payload);
      ctx.emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: lesson.teacherId, studentId: user.id });

      return { submission: submissionDto(submission) };
    },

    async getLiveLessonState(lessonId, opts) {
      ctx.throwIfAborted(opts?.signal);
      const user = auth.requireStudent();
      limits.enforce("api:lesson-check-status");
      const { lesson, participant } = ctx.guard.ownLesson(user, lessonId);
      sweepStaleSubmissions(participant);

      const views = lessonItemViews(participant.id);
      touchSubmissions(views);
      // Valid in any status: FINISHED (the schedule ran out or the teacher finished early) ends the live screen.
      const status = q.lessonStatus(lesson);
      return { serverNow: ctx.nowIso(), status, items: lessonItemStates(views, status) };
    },
  };
}
