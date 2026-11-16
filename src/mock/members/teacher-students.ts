/**
 * `TeacherStudentsApi` on the mock store — teacher home, students, the student card (homework review, assign
 * board, lessons tab), number statuses and deadlines, progress history, the PDF report
 * (docs/spec/04-teacher-students.md; 00 §2.8; 90-addendum-1 A.11; 90-addendum-2 A.2.8, A.2.19).
 *
 * Roles (00 §2.8): the home, the list and the three tabs of the card are TEACHER-only; delete / password
 * reset / issue / cancel / history / report also accept a DEVELOPER (any student); the two per-number write
 * endpoints refuse a DEVELOPER with `403 unauthorized`. A foreign student is a 404, never a 403.
 *
 * Order of checks follows the site's handlers: role → rate limit → shape of the input (400) → ownership
 * (404) → effect.
 */
import type { TeacherStudentsApi } from "@/api/client";
import type {
  AssignBoardTopic,
  AttachedPhoto,
  HomeworkAssignment,
  HomeworkCheck,
  HomeworkNumberStatus,
  IsoDateTime,
  PhotoRef,
  ProgressHistoryEntry,
  ProgressHistoryReference,
  ProgressStatusEvent,
  TeacherHomeworkAssignment,
  TeacherHomeworkCheck,
  TeacherHomeworkCheckResult,
  TeacherHomeworkNumber,
  TeacherStudentLesson,
  TeacherStudentListItem,
  TopicHomeworkNumber,
} from "@/api/types";
import { HOMEWORK_NUMBER_STATUSES, LIMITS, PDF_EXPORTS_IN_FLIGHT_MAX, RETRY_AFTER_SECONDS } from "@/api/types";
import { validateNewAccountInput } from "@/domain/account-validation";
import { sortHomeworksByAttention } from "@/domain/homework-attention";
import { compareHomeworkNumbers } from "@/domain/numbers";
import { resolveParentCallReminder } from "@/domain/parent-call-state";
import { MAX_PASSWORD_LENGTH, validatePasswordStrength } from "@/domain/password-policy";
import { REPORT_PERIOD_META, parseReportPeriod } from "@/domain/report-period";
import { completionPercent, getStatusCounts } from "@/domain/statuses";
import type { Dictionary } from "@/lib/i18n/dictionary";

import type { MockContext } from "../context";
import type { MockUser } from "../store/schema";

export function createTeacherStudents(ctx: MockContext): TeacherStudentsApi {
  const { store, errors, auth, guard, q, limits } = ctx;

  /** PDF exports being generated right now (the site's process-wide `pdfExportsInFlight`). */
  let reportsInFlight = 0;

  /** GREEN / YELLOW / RED counters of a list of statuses, with the two derived sums the site sends. */
  const progressOf = (statuses: (HomeworkNumberStatus | null)[]) => {
    const counts = getStatusCounts(statuses);
    const markedCount = counts.GREEN + counts.YELLOW + counts.RED;
    const solvedCount = counts.GREEN + counts.YELLOW;
    return { greenCount: counts.GREEN, yellowCount: counts.YELLOW, redCount: counts.RED, markedCount, solvedCount };
  };

  const toListItem = (student: MockUser): TeacherStudentListItem => ({
    id: student.id,
    name: student.name,
    email: student.email,
    ...progressOf(q.statusesOfStudent(student.id).map((row) => row.status)),
  });

  /** `null` clears, a colour sets, anything else (including a missing key) is invalid. */
  const parseStatus = (value: unknown): HomeworkNumberStatus | null | undefined =>
    value === null ? null : ctx.validate.oneOf(value, HOMEWORK_NUMBER_STATUSES) ? value : undefined;

  /**
   * The texts of delete / password reset are the notices of the screen the caller acts from: the teacher's
   * students list, or the developer's accounts screen (the site redirects there with the same code).
   * SPEC-GAP: 04 §6.1 names only the teacher's notices; the developer's variants are the site's behaviour.
   */
  const noticesFor = (user: MockUser) => (dict: Dictionary) =>
    user.role === "DEVELOPER" ? dict.students.accounts.notices : dict.students.list.notices;

  const checkDto = (check: HomeworkCheck, labelByNumberId: Map<string, string>): TeacherHomeworkCheck => {
    // A seeded in-flight check starts its timer at the first read by any client (90-addendum-6 §5).
    if (check.status === "PENDING" || check.status === "CHECKING") ctx.jobs.touch(check.id);

    const results: TeacherHomeworkCheckResult[] = [];
    for (const result of q.checkResults(check.id)) {
      // Results for numbers that are no longer in the assignment are dropped.
      const number = labelByNumberId.get(result.homeworkNumberId);
      if (number === undefined) continue;
      results.push({
        number,
        verdict: result.verdict,
        recognizedAnswer: result.recognizedAnswer,
        comment: result.comment,
        copySuspected: result.copySuspected,
        copyReason: result.copyReason,
        injectionSuspected: result.injectionSuspected,
        injectionNote: result.injectionNote,
      });
    }
    results.sort((left, right) => compareHomeworkNumbers(left.number, right.number));

    const photos: PhotoRef[] = [];
    for (const photo of q.checkPhotos(check.id)) {
      const file = ctx.files.ref(photo.fileId);
      if (file) photos.push({ fileId: file.id, originalName: file.originalName });
    }

    // `error` is the raw provider / server text: staff may read it, a student gets a code instead.
    return { id: check.id, status: check.status, error: check.error, createdAt: check.createdAt, checkedAt: check.checkedAt, photos, results };
  };

  const assignmentDto = (assignment: HomeworkAssignment): TeacherHomeworkAssignment => {
    const numbers: TeacherHomeworkNumber[] = q.homeworkNumbers(assignment.id).map((number) => {
      const row = q.status(assignment.studentId, number.id);
      return {
        homeworkNumberId: number.id,
        number: number.number,
        conditionLatex: number.conditionLatex,
        // The reference answer: staff only.
        answerLatex: number.answerLatex,
        status: row?.status ?? null,
        note: row?.note ?? "",
      };
    });
    const labelByNumberId = new Map(numbers.map((entry) => [entry.homeworkNumberId, entry.number] as const));

    const checks = q
      .homeworkChecks(assignment.id)
      .slice(0, LIMITS.homeworkChecksInReview)
      .map((check) => checkDto(check, labelByNumberId));

    const photos: AttachedPhoto[] = [];
    for (const photo of q.homeworkPhotos(assignment.id)) {
      const file = ctx.files.ref(photo.fileId);
      if (file) photos.push({ id: photo.id, fileId: file.id, originalName: file.originalName, mimeType: file.mimeType, createdAt: photo.createdAt });
    }

    const progress = progressOf(numbers.map((entry) => entry.status));
    const totalNumbers = numbers.length;

    return {
      id: assignment.id,
      title: assignment.title?.trim() || null,
      orderInTopic: q.homeworkOrderInTopic(assignment),
      topicId: assignment.topicId,
      topicTitle: q.topic(assignment.topicId)?.title ?? "",
      deadlineAt: assignment.deadlineAt,
      createdAt: assignment.createdAt,
      numbers,
      photos,
      checks,
      latestCheck: checks[0] ?? null,
      ...progress,
      totalNumbers,
      progressPercent: completionPercent(progress.markedCount, totalNumbers),
      solvedPercent: completionPercent(progress.solvedCount, totalNumbers),
    };
  };

  /** Where a history entry came from: the lesson if the viewer may open it, else the homework (TEACHER only), else nothing. */
  const referenceOf = (viewer: MockUser, studentId: string, event: ProgressStatusEvent): ProgressHistoryReference | null => {
    const lesson = q.lesson(event.context.lessonId);
    if (lesson && q.participantOf(lesson.id, studentId) && (viewer.role !== "TEACHER" || lesson.teacherId === viewer.id)) {
      return { kind: "lesson", lessonId: lesson.id };
    }
    const assignment = q.homework(event.context.assignmentId);
    // A DEVELOPER has no student card to open, so the homework kind is never produced for that role.
    if (assignment && assignment.studentId === studentId && viewer.role === "TEACHER") {
      return { kind: "homework", assignmentId: assignment.id };
    }
    return null;
  };

  return {
    async getTeacherHome() {
      const user = auth.requireTeacher();
      const students = q.studentsOfTeacher(user.id);

      // Files that are a topic theory file, a topic homework file or a per-number answer file (the shared bank).
      const referencedFiles = new Set<string>();
      for (const topic of store.topics.all()) {
        if (topic.theoryFileId) referencedFiles.add(topic.theoryFileId);
        if (topic.homeworkFileId) referencedFiles.add(topic.homeworkFileId);
      }
      for (const number of store.numbers.all()) {
        if (number.answerFileId) referencedFiles.add(number.answerFileId);
      }
      let totalFiles = 0;
      for (const fileId of referencedFiles) {
        if (store.files.has(fileId)) totalFiles += 1;
      }

      let totalMarked = 0;
      let due = 0;
      let overdue = 0;
      const now = ctx.nowDate();
      for (const student of students) {
        totalMarked += q.statusesOfStudent(student.id).filter((row) => row.status !== null).length;
        // The anchor is the last REACHED call, else the day the account was created. Counts only — no comments.
        const lastReached = q.callsOfStudent(student.id).find((call) => call.outcome === "REACHED");
        const reminder = resolveParentCallReminder({
          lastReachedAt: lastReached ? new Date(lastReached.calledAt) : null,
          studentCreatedAt: new Date(student.createdAt),
          now,
        });
        if (reminder.state === "due") due += 1;
        else if (reminder.state === "overdue") overdue += 1;
      }

      return {
        stats: {
          // Topics, numbers and files are the shared bank; students and marks are the teacher's own.
          totalTopics: store.topics.size,
          totalNumbers: store.numbers.count((number) => store.topics.has(number.topicId)),
          totalStudents: students.length,
          totalFiles,
          totalMarked,
        },
        calls: { due, overdue },
      };
    },

    async listStudents() {
      const user = auth.requireTeacher();
      return { students: q.studentsOfTeacher(user.id).map(toListItem) };
    },

    async createStudent(input) {
      const user = auth.requireTeacher();

      const parsed = validateNewAccountInput({
        name: String(input?.name ?? ""),
        login: String(input?.login ?? ""),
        password: String(input?.password ?? ""),
      });
      if (!parsed.ok) throw errors.invalidData((dict) => dict.students.actions.createStudent.invalid);

      limits.enforce("create-student", { message: (dict) => dict.students.actions.createStudent.rateLimited });

      // The login is unique across every role.
      if (store.users.findUnique("email", parsed.login)) {
        return errors.fail({ status: 409, code: "exists", message: (dict) => dict.students.actions.createStudent.exists });
      }

      const now = ctx.nowIso();
      // No `StudentProfile` row: the site creates it lazily (speed / group are set later).
      const student = store.users.insert({
        id: store.nextId("usr"),
        name: parsed.name,
        email: parsed.login,
        role: "STUDENT",
        teacherId: user.id,
        createdAt: now,
        updatedAt: now,
        password: parsed.password,
      });

      ctx.audit.write({
        category: "DATA",
        action: "student.create",
        actor: user,
        targetType: "User",
        targetLabel: student.name,
        text: { key: "student.created", params: { name: student.name } },
        meta: { studentLogin: student.email },
      });
      ctx.emit({ kind: "students-changed" });

      return { student: { id: student.id, name: student.name, email: student.email } };
    },

    async deleteStudent(studentId) {
      const user = auth.requireStaff();
      const notices = noticesFor(user);
      const student = guard.student(user, ctx.validate.id(studentId) ?? "", "studentNotFound", (dict) => notices(dict).studentDeleteMissing);

      store.transaction(() => {
        // Homeworks (numbers, photos, checks), lesson participations (items, submissions), statuses, history,
        // notifications, profile, parent calls and sessions go with the account.
        ctx.cascade.deleteStudent(student.id);
        // Files the student uploaded that nothing references any more.
        for (const file of store.files.by("uploadedById", student.id)) ctx.files.removeIfUnreferenced(file.id);
      });

      ctx.audit.write({
        category: "DATA",
        action: "student.delete",
        actor: user,
        targetType: "User",
        targetId: student.id,
        targetLabel: student.name,
        text: { key: "student.deleted", params: { name: student.name } },
      });
      ctx.emit({ kind: "students-changed" });
    },

    async resetStudentPassword(studentId, password) {
      const user = auth.requireStaff();
      const notices = noticesFor(user);

      const id = ctx.validate.id(studentId);
      if (id === null) throw errors.notFound("studentNotFound", (dict) => notices(dict).passwordMissing);

      const next = typeof password === "string" ? password : "";
      if (next.length > MAX_PASSWORD_LENGTH || validatePasswordStrength(next) !== null) {
        throw errors.invalidData((dict) => notices(dict).passwordInvalid);
      }

      // Consumed by every valid request, before the student is looked up.
      limits.enforce("reset-student-password", { message: (dict) => notices(dict).passwordRateLimited });

      const student = guard.student(user, id, "studentNotFound", (dict) => notices(dict).passwordMissing);

      store.transaction(() => {
        store.users.update(student.id, { password: next, updatedAt: ctx.nowIso() });
        // Every session of the STUDENT ends; the caller's own session is untouched.
        ctx.cascade.deleteUserSessions(student.id);
      });

      ctx.audit.write({
        category: "DATA",
        action: "student.password_reset",
        actor: user,
        targetType: "User",
        targetId: student.id,
        text: { key: "student.password_reset" },
      });
    },

    async getStudentCard(studentId) {
      const user = auth.requireTeacher();
      const student = guard.student(user, studentId);
      // The tab counter: assignments that are not completed.
      const activeHomeworksCount = q.homeworksOfStudent(student.id).filter((assignment) => !q.isHomeworkCompleted(assignment.id)).length;
      return {
        student: { id: student.id, name: student.name, email: student.email, createdAt: student.createdAt },
        activeHomeworksCount,
      };
    },

    async getStudentHomeworks(studentId) {
      const user = auth.requireTeacher();
      const student = guard.student(user, studentId);
      // `createdAt` asc first: the attention sort is stable and falls back to it for equal ranks.
      const assignments = q.homeworksOfStudent(student.id).map(assignmentDto);
      return { assignmentsEnabled: true, notesEnabled: true, assignments: sortHomeworksByAttention(assignments, ctx.now()) };
    },

    async getAssignBoard(studentId) {
      const user = auth.requireTeacher();
      const student = guard.student(user, studentId);

      const topics: AssignBoardTopic[] = q.topicsOrdered().map((topic, index) => {
        // Statements travel with the first topic only; the others are fetched on selection (`content.getTopicConditions`).
        const conditionsLoaded = index === 0;
        const numbers = q.numbersOfTopic(topic.id);
        return {
          id: topic.id,
          title: topic.title,
          totalNumbers: numbers.length,
          conditionsLoaded,
          numbers: numbers.map((number) => {
            const row = q.status(student.id, number.id);
            return {
              id: number.id,
              number: number.number,
              status: row?.status ?? null,
              // The mirrored deadline: non-null ⇔ "already assigned with a deadline".
              deadlineAt: row?.deadlineAt ?? null,
              conditionLatex: conditionsLoaded ? number.conditionLatex : null,
            };
          }),
        };
      });

      return { deadlinesEnabled: true, topics };
    },

    async issueHomework(input) {
      const user = auth.requireStaff();
      limits.enforce("api:teacher-homeworks");

      const result = ctx.homework.issue({
        studentId: String(input?.studentId ?? ""),
        issuedBy: user,
        topicId: String(input?.topicId ?? ""),
        homeworkNumberIds: Array.isArray(input?.homeworkNumberIds) ? input.homeworkNumberIds : [],
        // A missing or blank deadline is the site's first `400 invalidData`; neither side requires it to be in the future.
        deadlineAt: typeof input?.deadlineAt === "string" && input.deadlineAt.trim() ? input.deadlineAt : null,
        title: typeof input?.title === "string" ? input.title : null,
      });
      if (!result.ok) throw ctx.homework.toError(result);

      return { assignmentId: result.assignmentId, deadlineAt: result.deadlineAt, homeworkNumberIds: result.homeworkNumberIds };
    },

    async cancelHomework(assignmentId) {
      const user = auth.requireStaff();
      limits.enforce("api:teacher-homeworks");

      const id = ctx.validate.id(assignmentId);
      if (id === null) throw errors.invalidData((dict) => dict.apiPlanner.homeworks.invalidCancelData);

      const { assignment, student } = guard.homeworkOfVisibleStudent(user, id);

      const numberIds = store.homeworkNumbers.by("assignmentId", assignment.id).map((link) => link.homeworkNumberId);
      const fileIds = new Set<string>(store.homeworkPhotos.by("assignmentId", assignment.id).map((photo) => photo.fileId));
      for (const check of store.homeworkChecks.by("assignmentId", assignment.id)) {
        for (const photo of store.homeworkCheckPhotos.by("checkId", check.id)) fileIds.add(photo.fileId);
      }

      store.transaction(() => {
        ctx.cascade.deleteHomework(assignment.id);
        // The mirror is recomputed from the REMAINING assignments: a number may sit in several of them.
        ctx.homework.recomputeDeadlines(student.id, numberIds);
        // Rows that now carry nothing go; a row with a colour, a note or `statusChangedAt` stays.
        ctx.progress.cleanupEmptyRows(student.id, numberIds);
      });
      // Photos and check snapshots of the homework that nothing else references.
      for (const fileId of fileIds) ctx.files.removeIfUnreferenced(fileId);

      // No notification for the student: the homework just disappears from the list.
      ctx.emit({ kind: "student-deadlines-changed", studentId: student.id, topicId: assignment.topicId });
    },

    async setNumberStatus(studentId, homeworkNumberId, status) {
      const user = auth.requireTeacher();
      limits.enforce("api:teacher-number-status");

      const student = ctx.validate.id(studentId);
      const numberId = ctx.validate.id(homeworkNumberId);
      const next = parseStatus(status);
      if (student === null || numberId === null || next === undefined) {
        throw errors.invalidData((dict) => dict.apiPlanner.numberStatus.invalidData);
      }

      const owner = guard.student(user, student, "studentOrNumberNotFound");
      // The number does not have to belong to any homework.
      const number = q.number(numberId);
      if (!number) throw errors.notFound("studentOrNumberNotFound");

      const written = store.transaction(() =>
        ctx.progress.write({ source: "teacher", status: next, studentId: owner.id, homeworkNumberId: number.id, actor: user }),
      );
      ctx.emit({ kind: "student-progress-changed", studentId: owner.id, topicId: number.topicId });

      return {
        status: written.decision.status,
        statusChangedAt: written.row?.statusChangedAt ?? written.event.createdAt,
        // A manual mark is always written: the reason is one of the two.
        decision: written.decision.reason === "reaffirmed" ? "reaffirmed" : "changed",
      };
    },

    async setNumberStatuses(studentId, changes) {
      const user = auth.requireTeacher();
      // SPEC-GAP: the batch has no site route. It follows the single-number route: one hit of the shared
      // bucket per call, the same order of checks, and one realtime event per topic touched.
      limits.enforce("api:teacher-number-status");

      const invalid = () => errors.invalidData((dict) => dict.apiPlanner.numberStatus.invalidData);
      const student = ctx.validate.id(studentId);
      const { min, max } = LIMITS.numberStatusesBatch;
      if (student === null || !Array.isArray(changes) || changes.length < min || changes.length > max) throw invalid();

      const parsed: { homeworkNumberId: string; status: HomeworkNumberStatus | null }[] = [];
      for (const change of changes) {
        const numberId = ctx.validate.id(change?.homeworkNumberId);
        const next = parseStatus(change?.status);
        if (numberId === null || next === undefined) throw invalid();
        parsed.push({ homeworkNumberId: numberId, status: next });
      }

      const owner = guard.student(user, student, "studentOrNumberNotFound");
      const topicIds = new Set<string>();
      for (const change of parsed) {
        const number = q.number(change.homeworkNumberId);
        // One unknown number refuses the whole batch: nothing is written.
        if (!number) throw errors.notFound("studentOrNumberNotFound");
        topicIds.add(number.topicId);
      }

      // One transaction, one history event per item, in the order given.
      const results = store.transaction(() =>
        parsed.map((change) => {
          const written = ctx.progress.write({
            source: "teacher",
            status: change.status,
            studentId: owner.id,
            homeworkNumberId: change.homeworkNumberId,
            actor: user,
          });
          return { homeworkNumberId: change.homeworkNumberId, status: written.decision.status };
        }),
      );
      for (const topicId of topicIds) ctx.emit({ kind: "student-progress-changed", studentId: owner.id, topicId });

      return { results };
    },

    async setNumberDeadlines(studentId, input) {
      const user = auth.requireTeacher();
      limits.enforce("api:student-deadlines");

      const student = ctx.validate.id(studentId);
      const topicId = ctx.validate.id(input?.topicId);
      const numberIds = ctx.validate.ids(input?.homeworkNumberIds);
      // A non-empty valid date string sets, an explicit `null` clears; anything else is invalid.
      const rawDeadline: unknown = input?.deadlineAt;
      const deadlineAt: IsoDateTime | null | undefined = rawDeadline === null ? null : (ctx.validate.instant(rawDeadline) ?? undefined);
      if (student === null || topicId === null || numberIds.length === 0 || deadlineAt === undefined) {
        throw errors.invalidData((dict) => dict.apiPlanner.studentDeadlines.invalidData);
      }

      const owner = guard.student(user, student, "studentOrNumberNotFound");
      const numbers: TopicHomeworkNumber[] = [];
      for (const id of numberIds) {
        const number = q.number(id);
        // Every id must be a number of the topic.
        if (!number || number.topicId !== topicId) throw errors.notFound("studentOrNumberNotFound");
        numbers.push(number);
      }

      store.transaction(() => {
        const now = ctx.nowIso();
        for (const number of numbers) {
          const existing = q.status(owner.id, number.id);
          if (deadlineAt === null && !existing?.status && !existing?.note) {
            // Only the deadline is removed: the row (and the time of a manual clear on it) is kept, and no
            // row is created just to hold "no deadline".
            if (existing && existing.deadlineAt !== null) store.statuses.update(existing.id, { deadlineAt: null, updatedAt: now });
            continue;
          }
          const row = existing ?? ctx.progress.ensureRow(owner.id, number.id);
          if (row.deadlineAt !== deadlineAt) store.statuses.update(row.id, { deadlineAt, updatedAt: now });
        }
      });

      // This write is NOT reconciled with the homework mirror: the next issue / cancel touching the number recomputes it.
      if (deadlineAt !== null) {
        // Labels in bank order (`displayOrder`), as the site lists them.
        const labels = [...numbers].sort((left, right) => left.displayOrder - right.displayOrder).map((number) => number.number);
        ctx.notify.create({
          userId: owner.id,
          type: "homework-assigned",
          params: {
            variant: numberIds.length > 1 ? "assigned" : "deadline",
            topic: q.topic(topicId)?.title ?? null,
            numbers: labels.join(", "),
            count: numberIds.length,
            deadlineAt,
          },
          href: "/student/homeworks",
        });
      }
      ctx.emit({ kind: "student-deadlines-changed", studentId: owner.id, topicId });

      return { deadlineAt, homeworkNumberIds: numberIds };
    },

    async getProgressHistory(studentId, homeworkNumberId, cursor) {
      const user = auth.requireUser();
      // The one endpoint whose role refusal has its own text.
      if (user.role === "STUDENT") throw errors.unauthorized((dict) => dict.apiContent.progressHistory.forbidden);
      limits.enforce("api:progress-history");

      const student = ctx.validate.id(studentId);
      const numberId = ctx.validate.id(homeworkNumberId);
      if (student === null || numberId === null) {
        return errors.fail({ status: 400, code: "paramsRequired", message: (dict) => dict.apiContent.progressHistory.paramsRequired });
      }

      const owner = guard.student(user, student, "historyNotFound");
      const number = q.number(numberId);
      if (!number) throw errors.notFound("historyNotFound");

      // `createdAt` desc, then newest written first (the site's `id desc` on time-ordered ids).
      const events = store.progressEvents
        .by("studentNumber", `${owner.id}|${number.id}`)
        .map((event, index) => ({ event, index }))
        .sort((left, right) => right.event.createdAt.localeCompare(left.event.createdAt) || right.index - left.index)
        .map((entry) => entry.event);

      let start = 0;
      const after = ctx.validate.id(cursor);
      if (after !== null) {
        const position = events.findIndex((event) => event.id === after);
        // A cursor that is not an entry of this (student, number) pair.
        if (position === -1) throw errors.notFound("historyNotFound");
        start = position + 1;
      }

      const pageSize = LIMITS.progressHistoryPageSize;
      const page = events.slice(start, start + pageSize);
      // Codes, not labels: the app renders them with `dict.progress.*`.
      const entries: ProgressHistoryEntry[] = page.map((event) => ({
        id: event.id,
        createdAt: event.createdAt,
        source: event.source,
        actorName: event.actorName,
        previousStatus: event.previousStatus,
        requestedStatus: event.requestedStatus,
        status: event.status,
        decision: event.decision,
        reference: referenceOf(user, owner.id, event),
      }));

      return {
        studentName: owner.name,
        number: number.number,
        topicTitle: q.topic(number.topicId)?.title ?? "",
        currentStatus: q.status(owner.id, number.id)?.status ?? null,
        entries,
        nextCursor: events.length > start + pageSize ? (page[page.length - 1]?.id ?? null) : null,
      };
    },

    async listStudentLessons(studentId) {
      const user = auth.requireTeacher();
      const student = guard.student(user, studentId);

      const lessons: TeacherStudentLesson[] = [];
      // Lessons of kind LESSON taught by the viewer, newest `createdAt` first. The site does not close the
      // results of finished lessons on this page (only the lesson list, the board and the group page do).
      for (const lesson of q.lessonsOfStudent(student.id, "LESSON")) {
        if (lesson.teacherId !== user.id) continue;
        const participant = q.participantOf(lesson.id, student.id);
        if (!participant) continue;

        const planPending = q.isPlanPending(participant);
        // A seeded pending generation starts its timer at the first read (90-addendum-6 §5).
        if (planPending) ctx.jobs.touch(participant.id);

        const items: TeacherStudentLesson["items"] = [];
        for (const item of q.items(participant.id)) {
          const number = q.number(item.homeworkNumberId);
          if (!number) continue;
          items.push({
            id: item.id,
            homeworkNumberId: item.homeworkNumberId,
            number: number.number,
            topicTitle: q.topic(number.topicId)?.title ?? "",
            isExtra: item.isExtra,
            result: item.result,
          });
        }

        lessons.push({
          id: lesson.id,
          participantId: participant.id,
          title: lesson.title,
          status: q.lessonStatus(lesson),
          durationMinutes: lesson.durationMinutes,
          createdAt: lesson.createdAt,
          startsAt: lesson.startsAt,
          groupName: q.group(lesson.groupId)?.name ?? null,
          planPending,
          planError: participant.planError,
          items,
        });
      }

      return { lessons };
    },

    async downloadStudentReport(studentId, period) {
      const user = auth.requireStaff();

      // At most two exports are generated at a time, process-wide; the refusal consumes no rate-limit slot.
      // SPEC-GAP: the site tests this before the session; here a missing session is still `401 sessionExpired`.
      if (reportsInFlight >= PDF_EXPORTS_IN_FLIGHT_MAX) {
        return errors.fail({
          status: 503,
          code: "reportsBusy",
          message: (dict) => dict.apiCommon.reportsBusy,
          retryAfterSeconds: RETRY_AFTER_SECONDS.reportsBusy,
        });
      }
      limits.enforce("api:pdf-export");

      const student = guard.student(user, studentId);
      // An unknown period is the default one, as on the site.
      const resolved = parseReportPeriod(typeof period === "string" ? period : null);
      // The name the site sends in `filename*`: «Неделя — Илья Смирнов — 2026-11-16.pdf» (the report is Russian-only).
      const fileName = `${REPORT_PERIOD_META[resolved].fileLabel} — ${student.name} — ${ctx.nowIso().slice(0, 10)}.pdf`;

      reportsInFlight += 1;
      try {
        const uri = await ctx.documents.download("studentReport", fileName);
        return { uri, fileName };
      } catch {
        return errors.fail({ status: 500, code: "exportFailed", message: (_dict, m) => m.common.errors.exportFailed });
      } finally {
        reportsInFlight -= 1;
      }
    },
  };
}
