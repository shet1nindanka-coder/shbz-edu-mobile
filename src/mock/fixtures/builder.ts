/**
 * Small DSL the fixture modules use to describe the dataset of docs/spec/09-data-i18n-math.md §2.
 *
 * Every timestamp is an offset from the seed anchor `T0` (09 §2.2 item 1): `at(day, hour, minute)` is a
 * Moscow wall-clock moment on "T0's Moscow date + day", `rel(ms)` is "T0 + ms". Nothing here is random —
 * the same T0 always produces the same rows.
 */
import type {
  AssignmentReason,
  AttendanceStatus,
  AuditLog,
  ErrorKind,
  HomeworkNumberStatus,
  HomeworkPlanParams,
  IsoDateTime,
  LessonItemResult,
  LessonKind,
  LessonPlanParams,
  LessonStatus,
  Notification,
  NotificationParams,
  ParentCallOutcome,
  SolutionCheckStatus,
  SolutionVerdict,
  StudentTopicNumberStatus,
} from "@/api/types";
import { renderAuditText, withAuditText, type AuditText } from "@/domain/audit-text";
import { formatDate } from "@/domain/dates";
import { computeMirroredDeadlines } from "@/domain/homework-deadline-mirror";
import { HOUR_MS, MINUTE_MS, mskAddDays, mskStartOfDay } from "@/domain/moscow-time";
import { renderNotificationText } from "@/domain/notification-text";
import { getDictionary } from "@/i18n/get-dictionary";
import { format } from "@/lib/i18n/format";

import { MOCK_TABLE_NAMES, type MockSnapshot, type MockTableRows } from "../store/schema";
import { numberId, userKey } from "./ids";

const RESULT_STATUS: Record<LessonItemResult, HomeworkNumberStatus | null> = {
  SOLVED: "GREEN",
  PARTIAL: "YELLOW",
  NOT_SOLVED: "RED",
  SKIPPED: null,
};

/**
 * The 8 bundled "handwritten solution" images reused by every photo fixture. The declared MIME type and
 * size are metadata of the fixture file (JPEG and PNG, 150–400 KB); the sample supplies the picture.
 */
export const PHOTO_ASSETS = [
  { sample: "photo1", mimeType: "image/jpeg", size: 284_113 },
  { sample: "photo2", mimeType: "image/jpeg", size: 351_872 },
  { sample: "photo3", mimeType: "image/png", size: 398_406 },
  { sample: "photo4", mimeType: "image/jpeg", size: 197_530 },
  { sample: "photo5", mimeType: "image/jpeg", size: 243_901 },
  { sample: "photo6", mimeType: "image/png", size: 312_677 },
  { sample: "photo7", mimeType: "image/jpeg", size: 158_244 },
  { sample: "photo8", mimeType: "image/jpeg", size: 226_015 },
] as const;

type StatusDraft = {
  studentId: string;
  homeworkNumberId: string;
  status: HomeworkNumberStatus | null;
  note: string | null;
  statusChangedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
};

export type CheckResultSpec = {
  /** Number label. */
  n: string;
  verdict: SolutionVerdict;
  comment?: string | null;
  confidence?: number | null;
  recognizedAnswer?: string | null;
  errorKind?: ErrorKind | null;
  errorNote?: string | null;
  copySuspected?: boolean;
  copyReason?: string | null;
  injectionSuspected?: boolean;
  injectionNote?: string | null;
};

export type CheckSpec = {
  status: SolutionCheckStatus;
  /** When the check was started. */
  at: IsoDateTime;
  /** Defaults to `at` + 9 s for a terminal check. */
  checkedAt?: IsoDateTime | null;
  error?: string | null;
  results?: CheckResultSpec[];
  /**
   * Snapshot photos (`HomeworkCheckPhoto`): a count of photos the check consumed, or `"attached"` when the
   * snapshot points at the photos still attached to the homework (a running or failed check).
   */
  photos?: number | "attached";
  modelUsed?: string | null;
};

/** One attached photo: `asset` = index into `PHOTO_ASSETS` (decides the sample and JPEG / PNG), `name` = original file name. */
export type PhotoSpec = { asset?: number; name?: string };

export type HomeworkSpec = {
  id: string;
  studentId: string;
  topicId: string;
  title: string | null;
  /** Number labels. */
  numbers: string[];
  deadlineAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  /** Photos attached right now (not yet consumed by a check): a count, or explicit photos. */
  photos?: number | PhotoSpec[];
  /** Oldest first. */
  checks?: CheckSpec[];
};

export type SubmissionSpec = {
  status: SolutionCheckStatus;
  /** Minutes after the lesson start (or an explicit instant). */
  at: number | IsoDateTime;
  verdict?: SolutionVerdict | null;
  comment?: string | null;
  confidence?: number | null;
  recognizedAnswer?: string | null;
  errorKind?: ErrorKind | null;
  errorNote?: string | null;
  injectionSuspected?: boolean;
  injectionNote?: string | null;
  error?: string | null;
  photos?: number;
};

export type ItemSpec = {
  /** Number label. */
  n: string;
  extra?: boolean;
  result?: LessonItemResult | null;
  reason?: AssignmentReason;
  minutes?: number | null;
  comment?: string | null;
  /** `"auto"` derives the submissions from the result (SOLVED → CORRECT, PARTIAL → INCORRECT + CORRECT, NOT_SOLVED → INCORRECT). */
  submissions?: SubmissionSpec[] | "auto";
  /** Mirror the result onto the number status (default true for a non-null result of a kind=LESSON row). */
  mirror?: boolean;
  /** When the result was set, minutes after the lesson start (default: after the last submission). */
  markedAt?: number;
};

export type ParticipantSpec = {
  studentId: string;
  attendance?: AttendanceStatus;
  joinedAt?: IsoDateTime | null;
  /** Snapshot of the profile speed at creation. */
  speed?: number | null;
  planGeneratedAt?: IsoDateTime | null;
  planSummary?: string | null;
  planError?: string | null;
  issuedAssignmentId?: string | null;
  issuedAt?: IsoDateTime | null;
  items?: ItemSpec[];
};

export type LessonSpec = {
  id: string;
  kind?: LessonKind;
  title: string;
  teacherId: string;
  groupId?: string | null;
  topicId?: string | null;
  status?: LessonStatus;
  startsAt?: IsoDateTime | null;
  durationMinutes?: number;
  finishedAt?: IsoDateTime | null;
  deadlineAt?: IsoDateTime | null;
  planParams?: LessonPlanParams | HomeworkPlanParams | null;
  createdAt: IsoDateTime;
  participants: ParticipantSpec[];
};

const SUBMISSION_COMMENTS = {
  correct: "Верно.",
  sign: "Знаковая ошибка — проверь раскрытие скобок.",
  mismatch: "Ответ не совпадает с эталоном — пересчитай.",
} as const;

export class FixtureBuilder {
  /** Seed anchor, epoch ms. */
  readonly t0: number;
  readonly tables: MockSnapshot["tables"];
  private readonly statusDrafts = new Map<string, StatusDraft>();
  private photoCounter = 0;
  private auditCounter = 0;
  private notificationCounters = new Map<string, number>();

  constructor(t0: number) {
    this.t0 = t0;
    const tables = {} as Record<string, unknown[]>;
    for (const name of MOCK_TABLE_NAMES) tables[name] = [];
    this.tables = tables as MockSnapshot["tables"];
  }

  // ───────────────────────────── time ─────────────────────────────

  /** Moscow wall clock on "T0's Moscow date + `day`" at `hour:minute`. */
  at(day: number, hour = 12, minute = 0): IsoDateTime {
    const start = mskAddDays(mskStartOfDay(this.t0), day).getTime();
    return new Date(start + hour * HOUR_MS + minute * MINUTE_MS).toISOString();
  }

  /** T0 + `ms` (negative = before the seed). */
  rel(ms: number): IsoDateTime {
    return new Date(this.t0 + ms).toISOString();
  }

  /** T0 − `ms`, but never before the start of T0's Moscow day — keeps "today" fixtures on today's date. */
  earlierToday(ms: number): IsoDateTime {
    return new Date(Math.max(mskStartOfDay(this.t0).getTime(), this.t0 - ms)).toISOString();
  }

  /** Auto title of a lesson created without one: `dict.apiPlanner.lessons.defaultTitle` (stored as data, teacher's language). */
  lessonAutoTitle(createdAt: IsoDateTime): string {
    return format(getDictionary("ru").apiPlanner.lessons.defaultTitle, { date: formatDate(createdAt, "ru") });
  }

  /** Auto title of a homework draft: `dict.apiPlanner.homeworkPlans.defaultTitle` «ДЗ по теме «{topic}» до {date}». */
  draftAutoTitle(topicId: string, deadlineAt: IsoDateTime): string {
    const topic = this.tables.topics.find((row) => row.id === topicId);
    return format(getDictionary("ru").apiPlanner.homeworkPlans.defaultTitle, {
      topic: topic?.title ?? "",
      date: formatDate(deadlineAt, "ru"),
    });
  }

  /** An instant `minutes` after another one. */
  plusMinutes(instant: IsoDateTime, minutes: number): IsoDateTime {
    return new Date(new Date(instant).getTime() + minutes * MINUTE_MS).toISOString();
  }

  // ───────────────────────────── generic rows ─────────────────────────────

  add<K extends keyof MockTableRows>(table: K, row: MockTableRows[K]): MockTableRows[K] {
    (this.tables[table] as MockTableRows[K][]).push(row);
    return row;
  }

  /** A solution photo file owned by a student; cycles through the bundled images. Returns the file id. */
  photoFile(idHint: string, ownerId: string, uploadedAt: IsoDateTime, spec: PhotoSpec = {}): string {
    const index = this.photoCounter;
    this.photoCounter += 1;
    const source = PHOTO_ASSETS[(spec.asset ?? index) % PHOTO_ASSETS.length]!;
    const extension = source.mimeType === "image/png" ? "png" : "jpg";
    const id = `file_${idHint}`;
    this.add("files", {
      id,
      originalName: spec.name ?? `IMG_${2041 + index}.${extension}`,
      mimeType: source.mimeType,
      size: source.size,
      uploadedAt,
      uploadedById: ownerId,
      sample: source.sample,
      localUri: null,
    });
    return id;
  }

  // ───────────────────────────── statuses ─────────────────────────────

  private statusKey(studentId: string, homeworkNumberId: string): string {
    return `${studentId}|${homeworkNumberId}`;
  }

  private statusDraft(studentId: string, label: string, createdAt: IsoDateTime): StatusDraft {
    const homeworkNumberId = numberId(label);
    const key = this.statusKey(studentId, homeworkNumberId);
    let draft = this.statusDrafts.get(key);
    if (!draft) {
      draft = { studentId, homeworkNumberId, status: null, note: null, statusChangedAt: null, createdAt, updatedAt: createdAt };
      this.statusDrafts.set(key, draft);
    }
    return draft;
  }

  /** Sets the colour of a number for a student (a later call replaces an earlier one). `null` = a manual clear that keeps `statusChangedAt`. */
  mark(studentId: string, label: string, status: HomeworkNumberStatus | null, changedAt: IsoDateTime): void {
    const draft = this.statusDraft(studentId, label, changedAt);
    draft.status = status;
    draft.statusChangedAt = changedAt;
    if (changedAt < draft.createdAt) draft.createdAt = changedAt;
    draft.updatedAt = changedAt > draft.updatedAt ? changedAt : draft.updatedAt;
  }

  /** Removes a status row altogether (a pinned "no row"). */
  unmark(studentId: string, label: string): void {
    this.statusDrafts.delete(this.statusKey(studentId, numberId(label)));
  }

  /** Sets the student's note on a number (creates the row when missing). */
  note(studentId: string, label: string, note: string, at: IsoDateTime): void {
    const draft = this.statusDraft(studentId, label, at);
    draft.note = note;
    draft.updatedAt = at > draft.updatedAt ? at : draft.updatedAt;
  }

  /** Current fixture status of a number (used by modules that depend on earlier ones). */
  statusOf(studentId: string, label: string): HomeworkNumberStatus | null {
    return this.statusDrafts.get(this.statusKey(studentId, numberId(label)))?.status ?? null;
  }

  // ───────────────────────────── homework ─────────────────────────────

  homework(spec: HomeworkSpec): void {
    const key = spec.id.replace(/^hw_/, "");
    this.add("homeworks", {
      id: spec.id,
      studentId: spec.studentId,
      topicId: spec.topicId,
      title: spec.title,
      deadlineAt: spec.deadlineAt,
      createdAt: spec.createdAt,
      updatedAt: spec.createdAt,
    });
    spec.numbers.forEach((label) => {
      this.add("homeworkNumbers", { id: `hwn_${key}_${label}`, assignmentId: spec.id, homeworkNumberId: numberId(label) });
    });

    const photoSpecs: PhotoSpec[] = Array.isArray(spec.photos) ? spec.photos : Array.from({ length: spec.photos ?? 0 }, () => ({}));
    const attachedFileIds = photoSpecs.map((photo, index) => {
      const uploadedAt = this.plusMinutes(spec.createdAt, 60 + index);
      const fileId = this.photoFile(`${key}_photo_${index + 1}`, spec.studentId, uploadedAt, photo);
      this.add("homeworkPhotos", { id: `hwp_${key}_${index + 1}`, assignmentId: spec.id, fileId, createdAt: uploadedAt });
      return fileId;
    });

    (spec.checks ?? []).forEach((check, index) => {
      const checkId = `chk_${key}_${index + 1}`;
      const active = check.status === "PENDING" || check.status === "CHECKING";
      this.add("homeworkChecks", {
        id: checkId,
        assignmentId: spec.id,
        status: check.status,
        activeSlot: active ? 1 : null,
        modelUsed: check.modelUsed === undefined ? (check.status === "DONE" ? "gpt-6.1-sol" : null) : check.modelUsed,
        error: check.error ?? null,
        createdAt: check.at,
        checkedAt: check.checkedAt === undefined ? (active ? null : this.plusMinutes(check.at, 0.15)) : check.checkedAt,
      });
      const snapshotFileIds =
        check.photos === "attached"
          ? attachedFileIds
          : Array.from({ length: check.photos ?? 0 }, (_, photoIndex) =>
              this.photoFile(`${key}_chk${index + 1}_${photoIndex + 1}`, spec.studentId, this.plusMinutes(check.at, -5)),
            );
      snapshotFileIds.forEach((fileId, photoIndex) => {
        this.add("homeworkCheckPhotos", { id: `chp_${key}_${index + 1}_${photoIndex + 1}`, checkId, fileId, order: photoIndex });
      });
      (check.results ?? []).forEach((result) => {
        this.add("homeworkCheckResults", {
          id: `res_${key}_${index + 1}_${result.n}`,
          checkId,
          homeworkNumberId: numberId(result.n),
          verdict: result.verdict,
          recognizedAnswer:
            result.recognizedAnswer === undefined
              ? result.verdict === "CORRECT"
                ? "совпадает с эталоном"
                : result.verdict === "INCORRECT"
                  ? "x = 3"
                  : null
              : result.recognizedAnswer,
          comment: result.comment === undefined ? (result.verdict === "INCORRECT" ? SUBMISSION_COMMENTS.mismatch : SUBMISSION_COMMENTS.correct) : result.comment,
          confidence: result.confidence === undefined ? (result.verdict === "CORRECT" ? 0.93 : result.verdict === "INCORRECT" ? 0.88 : 0.41) : result.confidence,
          copySuspected: result.copySuspected ?? false,
          copyReason: result.copyReason ?? null,
          errorKind: result.errorKind === undefined ? (result.verdict === "UNCERTAIN" ? "UNREADABLE" : result.verdict === "INCORRECT" ? "ARITHMETIC" : null) : result.errorKind,
          errorNote: result.errorNote ?? null,
          injectionSuspected: result.injectionSuspected ?? false,
          injectionNote: result.injectionNote ?? null,
        });
      });
    });
  }

  // ───────────────────────────── lessons and drafts ─────────────────────────────

  lesson(spec: LessonSpec): void {
    const kind = spec.kind ?? "LESSON";
    const startsAt = spec.startsAt ?? null;
    this.add("lessons", {
      id: spec.id,
      title: spec.title,
      subject: "MATH",
      teacherId: spec.teacherId,
      groupId: spec.groupId ?? null,
      topicId: spec.topicId ?? null,
      status: spec.status ?? "PLANNED",
      kind,
      deadlineAt: spec.deadlineAt ?? null,
      durationMinutes: spec.durationMinutes ?? 60,
      planParams: spec.planParams === undefined ? null : spec.planParams,
      startsAt,
      startedAt: null,
      finishedAt: spec.finishedAt ?? null,
      createdAt: spec.createdAt,
      updatedAt: spec.createdAt,
    });

    for (const participant of spec.participants) {
      const student = userKey(participant.studentId);
      const participantId = `lp_${spec.id}_${student}`;
      this.add("participants", {
        id: participantId,
        lessonId: spec.id,
        studentId: participant.studentId,
        attendance: participant.attendance ?? "UNKNOWN",
        speed: participant.speed ?? null,
        issuedAssignmentId: participant.issuedAssignmentId ?? null,
        issuedAt: participant.issuedAt ?? null,
        planSummary: participant.planSummary ?? null,
        planGeneratedAt: participant.planGeneratedAt === undefined ? spec.createdAt : participant.planGeneratedAt,
        planError: participant.planError ?? null,
        joinedAt: participant.joinedAt ?? null,
        queueOrder: null,
        helpedAt: null,
        createdAt: spec.createdAt,
        updatedAt: spec.createdAt,
      });

      // Generation writes main `order = 0..n-1`, extra `order = n..` (90-addendum-6 §4.4).
      const items = [...(participant.items ?? [])].sort((left, right) => Number(left.extra ?? false) - Number(right.extra ?? false));
      items.forEach((item, order) => {
        const itemId = `li_${spec.id}_${student}_${item.n}`;
        const result = item.result ?? null;
        this.add("lessonItems", {
          id: itemId,
          participantId,
          homeworkNumberId: numberId(item.n),
          order,
          reason: item.reason ?? (order % 3 === 1 ? "GAP" : "NEW"),
          forReview: false,
          minutes: item.minutes === undefined ? 5 + ((order * 3 + item.n.length) % 8) : item.minutes,
          comment: item.comment === undefined ? (order % 3 === 1 ? "Пробел: дроби в уравнении." : order % 3 === 0 ? "Закрепляем перенос слагаемых." : null) : item.comment,
          isExtra: item.extra ?? false,
          result,
          createdAt: spec.createdAt,
        });

        const submissions = item.submissions === "auto" ? this.autoSubmissions(result, order) : (item.submissions ?? []);
        // The result is marked right after the last submission (or at the item's slot when nothing was handed in).
        const submissionMinutes = submissions.map((submission) => submission.at).filter((at): at is number => typeof at === "number");
        const lastMinute = submissionMinutes.length > 0 ? Math.max(...submissionMinutes) : 4 + order * 6;
        submissions.forEach((submission, index) => {
          const submittedAt =
            typeof submission.at === "number" ? this.plusMinutes(startsAt ?? spec.createdAt, submission.at) : submission.at;
          const submissionId = `sub_${spec.id}_${student}_${item.n}_${index + 1}`;
          const active = submission.status === "PENDING" || submission.status === "CHECKING";
          const done = submission.status === "DONE";
          const verdict = done ? (submission.verdict ?? null) : null;
          this.add("submissions", {
            id: submissionId,
            itemId,
            status: submission.status,
            activeSlot: active ? 1 : null,
            verdict,
            recognizedAnswer: submission.recognizedAnswer === undefined ? (verdict === "CORRECT" ? "совпадает с эталоном" : verdict === "INCORRECT" ? "x = 3" : null) : submission.recognizedAnswer,
            comment:
              submission.comment === undefined
                ? verdict === "CORRECT"
                  ? SUBMISSION_COMMENTS.correct
                  : verdict === "INCORRECT"
                    ? (order + index) % 2 === 0
                      ? SUBMISSION_COMMENTS.sign
                      : SUBMISSION_COMMENTS.mismatch
                    : verdict === "UNCERTAIN"
                      ? SUBMISSION_COMMENTS.correct
                      : null
                : submission.comment,
            confidence: submission.confidence === undefined ? (verdict === "CORRECT" ? 0.93 : verdict === "INCORRECT" ? 0.88 : verdict === "UNCERTAIN" ? 0.41 : null) : submission.confidence,
            errorKind: submission.errorKind === undefined ? (verdict === "INCORRECT" ? (["SIGN", "ARITHMETIC", "DOMAIN", "BRACKETS"] as const)[order % 4]! : verdict === "UNCERTAIN" ? "UNREADABLE" : null) : submission.errorKind,
            errorNote: submission.errorNote === undefined ? (verdict === "INCORRECT" ? "На втором шаге потерян знак перед дробью." : null) : submission.errorNote,
            injectionSuspected: submission.injectionSuspected ?? false,
            injectionNote: submission.injectionNote ?? null,
            modelUsed: done ? "gpt-6.1-sol" : null,
            error: submission.status === "FAILED" ? (submission.error ?? null) : null,
            submittedAt,
            checkedAt: active ? null : this.plusMinutes(submittedAt, 0.2),
          });
          Array.from({ length: submission.photos ?? 1 }).forEach((_, photoIndex) => {
            const fileId = this.photoFile(`${submissionId}_${photoIndex + 1}`, participant.studentId, submittedAt);
            this.add("submissionPhotos", { id: `subp_${spec.id}_${student}_${item.n}_${index + 1}_${photoIndex + 1}`, submissionId, fileId, order: photoIndex });
          });
        });

        // Results of a lesson mirror onto the number status (SOLVED → GREEN, PARTIAL → YELLOW, NOT_SOLVED → RED).
        const status = result ? RESULT_STATUS[result] : null;
        if (kind === "LESSON" && status && item.mirror !== false && startsAt) {
          this.mark(participant.studentId, item.n, status, this.plusMinutes(startsAt, item.markedAt ?? lastMinute + 1));
        }
      });
    }
  }

  private autoSubmissions(result: LessonItemResult | null, order: number): SubmissionSpec[] {
    const minute = 4 + order * 6;
    if (result === "SOLVED") return [{ status: "DONE", verdict: "CORRECT", at: minute }];
    if (result === "PARTIAL") {
      return [
        { status: "DONE", verdict: "INCORRECT", at: minute },
        { status: "DONE", verdict: "CORRECT", at: minute + 3 },
      ];
    }
    if (result === "NOT_SOLVED") return [{ status: "DONE", verdict: "INCORRECT", at: minute }];
    return [];
  }

  // ───────────────────────────── notifications, journal, calls ─────────────────────────────

  /** A notification with params: the Russian snapshot title / body is rendered like `createNotification` does. */
  notification(input: {
    userId: string;
    type: string;
    createdAt: IsoDateTime;
    read?: boolean | IsoDateTime;
    params?: NotificationParams | null;
    href?: string | null;
    title?: string;
    body?: string | null;
  }): Notification {
    const user = userKey(input.userId);
    const count = (this.notificationCounters.get(user) ?? 0) + 1;
    this.notificationCounters.set(user, count);
    const rendered = input.params ? renderNotificationText(input.type, input.params, "ru") : null;
    const readAt = input.read === true ? this.plusMinutes(input.createdAt, 30) : typeof input.read === "string" ? input.read : null;
    return this.add("notifications", {
      id: `ntf_${user}_${count}`,
      userId: input.userId,
      type: input.type,
      title: input.title ?? rendered?.title ?? input.type,
      body: input.body === undefined ? (rendered?.body ?? null) : input.body,
      href: input.href ?? null,
      params: input.params ?? null,
      readAt,
      createdAt: input.createdAt,
    });
  }

  /** A journal row. With `text` the Russian summary and `meta.i18n` are produced like `writeAuditLog` does. */
  audit(input: Partial<AuditLog> & Pick<AuditLog, "createdAt" | "category" | "action"> & { text?: AuditText }): AuditLog {
    this.auditCounter += 1;
    const { text, ...row } = input;
    const meta = text ? (withAuditText(row.meta ?? null, text) as Record<string, unknown>) : (row.meta ?? null);
    return this.add("auditLogs", {
      id: `aud_${String(this.auditCounter).padStart(3, "0")}`,
      outcome: "ok",
      actorId: null,
      actorName: null,
      actorRole: null,
      targetType: null,
      targetId: null,
      targetLabel: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      costRub: null,
      durationMs: null,
      error: null,
      clientIp: null,
      ...row,
      summary: row.summary === undefined ? (text ? renderAuditText(text, "ru") : null) : row.summary,
      meta,
    });
  }

  call(input: { studentId: string; teacherId: string | null; outcome: ParentCallOutcome; calledAt: IsoDateTime; comment?: string | null }): void {
    const student = userKey(input.studentId);
    const count = this.tables.parentCalls.filter((row) => row.studentId === input.studentId).length + 1;
    this.add("parentCalls", {
      id: `call_${student}_${count}`,
      studentId: input.studentId,
      teacherId: input.teacherId,
      outcome: input.outcome,
      comment: input.comment ?? null,
      calledAt: input.calledAt,
      createdAt: this.plusMinutes(input.calledAt, 2),
    });
  }

  // ───────────────────────────── finish ─────────────────────────────

  /**
   * Mirrors homework deadlines onto the status rows (nearest deadline among the student's assignments that
   * contain the number — `computeMirroredDeadlines`) and turns the collected statuses into table rows.
   */
  finishStatuses(): void {
    const deadlines = new Map<string, IsoDateTime | null>();
    const byStudent = new Map<string, typeof this.tables.homeworks>();
    for (const assignment of this.tables.homeworks) {
      const list = byStudent.get(assignment.studentId) ?? [];
      list.push(assignment);
      byStudent.set(assignment.studentId, list);
    }

    for (const [studentId, assignments] of byStudent) {
      const facts = assignments.map((assignment) => ({
        deadlineAt: assignment.deadlineAt ? new Date(assignment.deadlineAt) : null,
        numbers: this.tables.homeworkNumbers.filter((link) => link.assignmentId === assignment.id),
        createdAt: assignment.createdAt,
      }));
      const numberIds = Array.from(new Set(facts.flatMap((fact) => fact.numbers.map((link) => link.homeworkNumberId))));
      const mirrored = computeMirroredDeadlines(numberIds, facts);
      for (const homeworkNumberId of numberIds) {
        const key = this.statusKey(studentId, homeworkNumberId);
        const deadline = mirrored.get(homeworkNumberId) ?? null;
        deadlines.set(key, deadline ? deadline.toISOString() : null);
        if (!this.statusDrafts.has(key)) {
          // Issuing a homework creates the status row (status null, no statusChangedAt) that carries the deadline.
          const createdAt = facts.find((fact) => fact.numbers.some((link) => link.homeworkNumberId === homeworkNumberId))!.createdAt;
          this.statusDrafts.set(key, { studentId, homeworkNumberId, status: null, note: null, statusChangedAt: null, createdAt, updatedAt: createdAt });
        }
      }
    }

    const rows: StudentTopicNumberStatus[] = [];
    for (const [key, draft] of this.statusDrafts) {
      rows.push({
        id: `st_${userKey(draft.studentId)}_${draft.homeworkNumberId.replace(/^num_/, "")}`,
        studentId: draft.studentId,
        homeworkNumberId: draft.homeworkNumberId,
        status: draft.status,
        note: draft.note,
        deadlineAt: deadlines.get(key) ?? null,
        statusChangedAt: draft.statusChangedAt,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      });
    }
    rows.sort((left, right) => left.id.localeCompare(right.id));
    this.tables.statuses = rows;
  }
}
