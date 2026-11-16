/**
 * The executable coverage checklist (docs/spec/09-data-i18n-math.md §2.13 extended by 90-addendum-6 §10,
 * decision D8): every state the screens must be able to show, and how the mock reaches it —
 * - `fixture`: stored rows show it on a freshly seeded store (`check` proves it);
 * - `script`: a fixed sequence of user actions on named fixtures produces it (`steps`);
 * - `control`: a mock control forces it (`control`).
 *
 * `tests/mock-fixtures.test.ts` seeds a store with a fixed clock and asserts the `check` of every fixture
 * row. Adding a required state = adding a row and, if the predicate fails, a fixture.
 */
import type { HomeworkAssignment, Lesson, LessonParticipant } from "@/api/types";
import { PLAN_ERROR_CODES, PLAN_ERROR_PREFIX } from "@/api/types";
import { computeIdleLevel, isExtraPartUnlocked, isLessonItemClosed } from "@/domain/lesson-live";
import { deriveLessonStatus } from "@/domain/lesson-status";
import { DAY_MS, calendarDaysBetweenMsk, isSameMskDay } from "@/domain/moscow-time";
import { resolveParentCallReminder } from "@/domain/parent-call-state";
import { classifySolutionCheckError } from "@/domain/solution-check-error-text";
import { computeStudentStreak } from "@/domain/student-streak";

import { MOCK_CLIENT_IP, PINNED_LOGIN, PINNED_PASSWORD_USER_ID, PINNED_REALTIME_USER_ID, type MockControls } from "../controls";
import type { MockStore } from "../store/store";
import { GROUP, TOPIC, USER, numberId } from "./ids";
import { PLAN_ERROR_LEGACY_EMPTY } from "./lessons";

export type MockStateKind = "fixture" | "script" | "control";

export type MockCoverageRow = {
  /** Stable name of the state, e.g. `"homework.overdue"`. */
  key: string;
  kind: MockStateKind;
  /** Spec sections that require the state. */
  requiredBy: string[];
  /** Fixture rows involved. */
  fixtureIds: string[];
  /** kind "script": user actions in order. */
  steps?: string[];
  /** kind "control": the control that forces the state (`"exhaust"` = the limiter action, `"settings"` = developer settings). */
  control?: keyof MockControls | "exhaust" | "settings";
  /** kind "fixture": true when a freshly seeded store shows the state at `now` (the seed moment in the test). */
  check?: (store: MockStore, now: number) => boolean;
};

// ───────────────────────────── helpers ─────────────────────────────

const SOON_MS = 72 * 60 * 60 * 1000;

function statusOf(store: MockStore, studentId: string, label: string) {
  return store.statuses.findUnique("studentNumber", `${studentId}|${numberId(label)}`);
}

function isCompleted(store: MockStore, assignment: HomeworkAssignment): boolean {
  const links = store.homeworkNumbers.by("assignmentId", assignment.id);
  return (
    links.length > 0 &&
    links.every((link) => {
      const status = store.statuses.findUnique("studentNumber", `${assignment.studentId}|${link.homeworkNumberId}`)?.status;
      return status === "GREEN" || status === "YELLOW";
    })
  );
}

function homework(store: MockStore, id: string): HomeworkAssignment {
  const row = store.homeworks.get(id);
  if (!row) throw new Error(`Coverage: fixture homework "${id}" is missing.`);
  return row;
}

function lesson(store: MockStore, id: string): Lesson {
  const row = store.lessons.get(id);
  if (!row) throw new Error(`Coverage: fixture lesson "${id}" is missing.`);
  return row;
}

function participant(store: MockStore, lessonId: string, studentId: string): LessonParticipant {
  const row = store.participants.findUnique("lessonStudent", `${lessonId}|${studentId}`);
  if (!row) throw new Error(`Coverage: participant of "${studentId}" in "${lessonId}" is missing.`);
  return row;
}

const isOverdue = (store: MockStore, id: string, now: number) => {
  const row = homework(store, id);
  return row.deadlineAt !== null && new Date(row.deadlineAt).getTime() < now && !isCompleted(store, row);
};

const checksOf = (store: MockStore, assignmentId: string) =>
  store.homeworkChecks.by("assignmentId", assignmentId).sort((left, right) => right.createdAt.localeCompare(left.createdAt));

/** Items of a participant with their submissions (oldest first), in set order. */
function itemsOf(store: MockStore, participantId: string) {
  return store.lessonItems
    .by("participantId", participantId)
    .sort((left, right) => left.order - right.order)
    .map((item) => {
      const submissions = store.submissions.by("itemId", item.id).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
      const done = submissions.filter((submission) => submission.status === "DONE");
      return { item, submissions, latest: submissions[submissions.length - 1], latestVerdict: done[done.length - 1]?.verdict ?? null };
    });
}

function lastActivity(store: MockStore, row: LessonParticipant): number | null {
  const times = itemsOf(store, row.id).flatMap((entry) => entry.submissions.map((submission) => new Date(submission.submittedAt).getTime()));
  if (row.joinedAt) times.push(new Date(row.joinedAt).getTime());
  return times.length > 0 ? Math.max(...times) : null;
}

const planCode = (row: LessonParticipant) => (row.planError?.startsWith(PLAN_ERROR_PREFIX) ? row.planError.slice(PLAN_ERROR_PREFIX.length) : null);

const isPending = (row: LessonParticipant) => row.planGeneratedAt === null && row.planError === null;

const streakOf = (store: MockStore, studentId: string, now: number) =>
  computeStudentStreak(
    store.statuses.by("studentId", studentId).map((row) => ({ status: row.status, statusChangedAt: row.statusChangedAt, updatedAt: row.updatedAt })),
    now,
    "ru",
  );

function reminderOf(store: MockStore, studentId: string, now: number) {
  const student = store.users.get(studentId)!;
  const reached = store.parentCalls
    .by("studentId", studentId)
    .filter((call) => call.outcome === "REACHED")
    .sort((left, right) => right.calledAt.localeCompare(left.calledAt))[0];
  return resolveParentCallReminder({
    lastReachedAt: reached ? new Date(reached.calledAt) : null,
    studentCreatedAt: new Date(student.createdAt),
    now: new Date(now),
  });
}

const fileOfTopic = (store: MockStore, topicId: string, kind: "theoryFileId" | "homeworkFileId" | "answersFileId") =>
  store.files.get(store.topics.get(topicId)?.[kind]);

// ───────────────────────────── the table ─────────────────────────────

export const MOCK_COVERAGE: MockCoverageRow[] = [
  // ── 09 §2.13 ─────────────────────────────────────────────────────────────────────────────────────────
  {
    key: "homework.overdue",
    kind: "fixture",
    requiredBy: ["09 §2.13", "02", "04", "06"],
    fixtureIds: ["hw_ilya_overdue", "hw_kirill_overdue1", "hw_kirill_overdue2"],
    check: (store, now) => ["hw_ilya_overdue", "hw_kirill_overdue1", "hw_kirill_overdue2"].every((id) => isOverdue(store, id, now)),
  },
  {
    key: "homework.completedPastDeadlineIsNotOverdue",
    kind: "fixture",
    requiredBy: ["09 §2.13"],
    fixtureIds: ["hw_ilya_done"],
    check: (store, now) => {
      const row = homework(store, "hw_ilya_done");
      return row.deadlineAt !== null && new Date(row.deadlineAt).getTime() < now && isCompleted(store, row) && !isOverdue(store, row.id, now);
    },
  },
  {
    key: "homework.deadline.todaySoonFarNone",
    kind: "fixture",
    requiredBy: ["09 §2.13", "02 §4.11"],
    fixtureIds: ["hw_ilya_today", "hw_ilya_soon", "hw_ilya_far", "hw_maria_legacy"],
    check: (store, now) => {
      const today = homework(store, "hw_ilya_today").deadlineAt;
      const soon = homework(store, "hw_ilya_soon").deadlineAt;
      const far = homework(store, "hw_ilya_far").deadlineAt;
      return (
        today !== null &&
        isSameMskDay(today, now) &&
        soon !== null &&
        new Date(soon).getTime() > now &&
        new Date(soon).getTime() - now <= SOON_MS &&
        far !== null &&
        new Date(far).getTime() - now > 14 * DAY_MS &&
        homework(store, "hw_maria_legacy").deadlineAt === null
      );
    },
  },
  {
    key: "check.running",
    kind: "fixture",
    requiredBy: ["09 §2.13", "03 §4.3"],
    fixtureIds: ["hw_artem_running"],
    check: (store) => {
      const check = store.homeworkChecks.findUnique("activeSlot", "hw_artem_running|1");
      return (
        check !== undefined &&
        check.status === "CHECKING" &&
        store.rowScripts.has(check.id) &&
        store.jobs.by("refId", check.id).some((job) => job.kind === "homeworkCheck.finish" && job.state === "waiting") &&
        store.homeworkPhotos.by("assignmentId", "hw_artem_running").length === 2
      );
    },
  },
  {
    key: "check.doneVerdicts.doneEmpty.failedClasses",
    kind: "fixture",
    requiredBy: ["09 §2.13", "03 §4.5"],
    fixtureIds: ["hw_ilya_overdue", "hw_ilya_later", "hw_ilya_failed", "hw_ilya_done", "les_live"],
    check: (store) => {
      const overdue = checksOf(store, "hw_ilya_overdue")[0];
      const later = checksOf(store, "hw_ilya_later")[0];
      const classes = new Set<string>(
        [...checksOf(store, "hw_ilya_failed"), ...checksOf(store, "hw_ilya_done")]
          .filter((check) => check.status === "FAILED")
          .map((check) => classifySolutionCheckError(check.error)),
      );
      for (const submission of store.submissions.filter((row) => row.status === "FAILED")) classes.add(classifySolutionCheckError(submission.error));
      return (
        overdue?.status === "DONE" &&
        store.homeworkCheckResults.by("checkId", overdue.id).some((result) => result.verdict === "INCORRECT") &&
        later?.status === "DONE" &&
        store.homeworkCheckResults.by("checkId", later.id).length === 0 &&
        ["quota", "unavailable", "interrupted", "timeout"].every((code) => classes.has(code))
      );
    },
  },
  {
    key: "check.uncertain.copy.injection",
    kind: "fixture",
    requiredBy: ["09 §2.13", "04 §6.8"],
    fixtureIds: ["hw_ilya_uncertain"],
    check: (store) => {
      const check = checksOf(store, "hw_ilya_uncertain")[0];
      const results = check ? store.homeworkCheckResults.by("checkId", check.id) : [];
      return (
        check?.status === "DONE" &&
        results.some((result) => result.verdict === "UNCERTAIN" && result.injectionSuspected && result.injectionNote !== null && result.comment !== null) &&
        results.some((result) => result.verdict === "CORRECT" && result.copySuspected && result.copyReason !== null)
      );
    },
  },
  {
    key: "photos.limitReached.attachedWithoutCheck",
    kind: "fixture",
    requiredBy: ["09 §2.13", "03"],
    fixtureIds: ["hw_polina_limit", "hw_ilya_open"],
    check: (store) =>
      store.homeworkPhotos.by("assignmentId", "hw_polina_limit").length === store.settings.maxPhotosPerAssignment &&
      store.homeworkPhotos.by("assignmentId", "hw_ilya_open").length === 3 &&
      store.homeworkChecks.by("assignmentId", "hw_ilya_open").length === 0,
  },
  {
    key: "status.note",
    kind: "fixture",
    requiredBy: ["09 §2.13", "02"],
    fixtureIds: ["usr_ilya", "num_113"],
    check: (store) => statusOf(store, USER.ilya, "113")?.note === "Перепутал знак при раскрытии скобок",
  },
  {
    key: "lesson.live.everyItemState",
    kind: "fixture",
    requiredBy: ["09 §2.13", "03", "05 §6"],
    fixtureIds: ["les_live"],
    check: (store, now) => {
      const live = lesson(store, "les_live");
      if (live.status !== "PLANNED" || deriveLessonStatus(live, now) !== "ACTIVE" || !live.startsAt) return false;
      const startedAt = new Date(live.startsAt).getTime();
      const idle = (row: LessonParticipant) =>
        computeIdleLevel(
          { lastActivityAt: lastActivity(store, row), lessonStartedAt: startedAt, warnMinutes: store.settings.lessonIdleWarnMinutes, alertMinutes: store.settings.lessonIdleAlertMinutes },
          now,
        ).level;
      const states = (row: LessonParticipant) => itemsOf(store, row.id).map((entry) => ({ isExtra: entry.item.isExtra, result: entry.item.result, latestVerdict: entry.latestVerdict }));

      const artem = participant(store, live.id, USER.artem);
      const polina = participant(store, live.id, USER.polina);
      const kirill = participant(store, live.id, USER.kirill);
      const artemItems = itemsOf(store, artem.id);
      const polinaMain = itemsOf(store, polina.id).filter((entry) => !entry.item.isExtra);

      return (
        // Артём: main part closed → extra unlocked; extra #1 is being checked, extra #2 is open.
        isExtraPartUnlocked(states(artem)) &&
        artemItems.some((entry) => entry.item.isExtra && entry.latest?.status === "CHECKING") &&
        artemItems.some((entry) => entry.item.isExtra && entry.submissions.length === 0) &&
        artemItems.some((entry) => entry.item.result === "PARTIAL") &&
        // Полина: every state of an item; extra part locked; idle "warn".
        !isExtraPartUnlocked(states(polina)) &&
        polinaMain.some((entry) => entry.item.result === "SOLVED") &&
        polinaMain.some((entry) => entry.item.result === "PARTIAL") &&
        polinaMain.some((entry) => entry.item.result === "NOT_SOLVED" && !isLessonItemClosed({ isExtra: false, result: entry.item.result, latestVerdict: entry.latestVerdict })) &&
        polinaMain.some((entry) => entry.item.result === null && entry.latest?.status === "DONE" && entry.latest.verdict === "UNCERTAIN") &&
        polinaMain.some((entry) => entry.latest?.status === "FAILED") &&
        polinaMain.some((entry) => entry.latest?.status === "PENDING") &&
        polinaMain.some((entry) => entry.submissions.length === 0) &&
        idle(polina) === "warn" &&
        // Кирилл: has not opened the lesson; idle "alert".
        kirill.joinedAt === null &&
        kirill.attendance === "UNKNOWN" &&
        itemsOf(store, kirill.id).every((entry) => entry.submissions.length === 0) &&
        idle(kirill) === "alert"
      );
    },
  },
  {
    key: "lesson.planned.unscheduled.finished.finishedEarly.needsFinalize",
    kind: "fixture",
    requiredBy: ["09 §2.13", "05 §6", "90-addendum-4 §6"],
    fixtureIds: ["les_tomorrow_group", "les_unscheduled", "les_g1", "les_g2", "les_g3", "les_g4", "les_early", "les_g_unfinalized"],
    check: (store, now) => {
      const early = lesson(store, "les_early");
      const unfinalized = lesson(store, "les_g_unfinalized");
      const polina = itemsOf(store, participant(store, unfinalized.id, USER.polina).id);
      const kirill = participant(store, unfinalized.id, USER.kirill);
      return (
        deriveLessonStatus(lesson(store, "les_tomorrow_group"), now) === "PLANNED" &&
        lesson(store, "les_unscheduled").startsAt === null &&
        ["les_g1", "les_g2", "les_g3", "les_g4"].every((id) => lesson(store, id).status === "FINISHED") &&
        early.finishedAt !== null &&
        early.startsAt !== null &&
        new Date(early.finishedAt).getTime() < new Date(early.startsAt).getTime() + early.durationMinutes * 60_000 &&
        // Stored PLANNED, derived FINISHED, inside the 48-hour window.
        unfinalized.status === "PLANNED" &&
        deriveLessonStatus(unfinalized, now) === "FINISHED" &&
        polina.some((entry) => entry.item.result === null && entry.latest?.verdict === "INCORRECT") &&
        polina.some((entry) => entry.item.result === null && entry.submissions.length === 0) &&
        kirill.joinedAt === null &&
        kirill.attendance === "UNKNOWN"
      );
    },
  },
  {
    key: "plan.generating.ready.failed.stale.manual",
    kind: "fixture",
    requiredBy: ["09 §2.13", "05 §6"],
    fixtureIds: ["les_ilya_tomorrow", "hp_generating", "les_tomorrow_group", "les_unscheduled", "les_stale", "hp_stale", "les_manual"],
    check: (store, now) => {
      const stale = (lessonId: string) =>
        store.participants.by("lessonId", lessonId).every((row) => isPending(row) && now - new Date(row.createdAt).getTime() > 15 * 60_000 && store.jobs.by("refId", row.id).length === 0);
      const generating = (lessonId: string) =>
        store.participants.by("lessonId", lessonId).every((row) => isPending(row) && store.jobs.by("refId", row.id).some((job) => job.kind === "planGeneration") && store.planScripts.has(row.id));
      const unscheduled = store.participants.by("lessonId", "les_unscheduled");
      const manual = participant(store, "les_manual", USER.ilya);
      return (
        generating("les_ilya_tomorrow") &&
        generating("hp_generating") &&
        store.participants.by("lessonId", "les_tomorrow_group").every((row) => row.planGeneratedAt !== null && row.planError === null && store.lessonItems.by("participantId", row.id).length > 0) &&
        unscheduled.some((row) => planCode(row) === "failed") &&
        unscheduled.some((row) => row.planError === PLAN_ERROR_LEGACY_EMPTY) &&
        stale("les_stale") &&
        stale("hp_stale") &&
        manual.planGeneratedAt !== null &&
        manual.planSummary === null &&
        store.lessonItems.by("participantId", manual.id).length === 4
      );
    },
  },
  {
    key: "draft.issued.staleStamp.deadlinePassed",
    kind: "fixture",
    requiredBy: ["09 §2.13", "90-addendum-6 §6.2"],
    fixtureIds: ["hp_issued", "hp_past"],
    check: (store, now) => {
      const artem = participant(store, "hp_issued", USER.artem);
      const polina = participant(store, "hp_issued", USER.polina);
      const past = lesson(store, "hp_past");
      return (
        store.homeworks.has(artem.issuedAssignmentId) &&
        artem.issuedAt !== null &&
        // Stale stamp: the stored id names an assignment that no longer exists.
        polina.issuedAssignmentId !== null &&
        !store.homeworks.has(polina.issuedAssignmentId) &&
        past.kind === "HOMEWORK" &&
        past.deadlineAt !== null &&
        new Date(past.deadlineAt).getTime() < now
      );
    },
  },
  {
    key: "attendance.allValues",
    kind: "fixture",
    requiredBy: ["09 §2.13", "06 §6"],
    fixtureIds: ["les_g1", "les_g2", "les_g3", "les_g4", "les_g_unfinalized", "les_live"],
    check: (store) => {
      const values = new Set<string>(
        ["les_g1", "les_g2", "les_g3", "les_g4", "les_g_unfinalized", "les_live"].flatMap((id) => store.participants.by("lessonId", id).map((row) => row.attendance)),
      );
      return ["PRESENT", "LATE", "ABSENT", "EXCUSED", "UNKNOWN"].every((value) => values.has(value));
    },
  },
  {
    key: "parentCalls.everyState",
    kind: "fixture",
    requiredBy: ["09 §2.10", "06 §6"],
    fixtureIds: ["usr_artem", "usr_kirill", "usr_polina", "usr_ilya", "usr_maria", "usr_dasha", "usr_timur"],
    check: (store, now) => {
      const artem = reminderOf(store, USER.artem, now);
      const kirill = reminderOf(store, USER.kirill, now);
      const polina = reminderOf(store, USER.polina, now);
      const ilya = reminderOf(store, USER.ilya, now);
      const maria = reminderOf(store, USER.maria, now);
      const lastAttempt = store.parentCalls.by("studentId", USER.kirill).sort((left, right) => right.calledAt.localeCompare(left.calledAt))[0];
      return (
        artem.state === "due" &&
        !artem.hasReachedCall &&
        artem.daysSinceAnchor === 35 &&
        kirill.state === "overdue" &&
        kirill.daysSinceAnchor === 50 &&
        lastAttempt?.outcome === "NO_ANSWER" &&
        calendarDaysBetweenMsk(lastAttempt.calledAt, now) === 3 &&
        polina.state === "ok" &&
        polina.daysUntilDue === 20 &&
        store.parentCalls.by("studentId", USER.polina).length === 23 &&
        ilya.state === "ok" &&
        ilya.daysUntilDue === 1 &&
        maria.state === "due" &&
        maria.daysSinceAnchor === 30 &&
        reminderOf(store, USER.dasha, now).daysUntilDue === 25 &&
        reminderOf(store, USER.timur, now).daysUntilDue === 30
      );
    },
  },
  {
    key: "notifications.types.unread.cap.legacy.broadcast",
    kind: "fixture",
    requiredBy: ["09 §2.11", "01 §6.9"],
    fixtureIds: ["usr_ilya", "usr_maria", "usr_anna", "usr_dev", "usr_timur", "usr_olga"],
    check: (store) => {
      const of = (userId: string) => store.notifications.by("userId", userId);
      const types = new Set(store.notifications.all().map((row) => row.type));
      const ilya = of(USER.ilya);
      return (
        ["homework-assigned", "homework-checked", "broadcast", "parent_call_due", "dev_errors", "dev_ai_budget_warn", "dev_ai_budget_out", "dev_stale_checks", "dev_storage"].every((type) => types.has(type)) &&
        ilya.length === 8 &&
        ilya.filter((row) => row.readAt === null).length === 3 &&
        ilya.some((row) => row.type === "broadcast" && row.params === null && row.href === null) &&
        ilya.some((row) => row.type === "homework-checked" && row.params === null) &&
        of(USER.maria).length === 22 &&
        of(USER.maria).every((row) => row.readAt !== null) &&
        of(USER.anna).filter((row) => row.readAt === null).length === 2 &&
        of(USER.dev).length === 5 &&
        of(USER.timur).length === 0 &&
        of(USER.olga).length === 0
      );
    },
  },
  {
    key: "streak.active.broken.zero",
    kind: "fixture",
    requiredBy: ["09 §2.13", "01 §4.4"],
    fixtureIds: ["usr_ilya", "usr_maria", "usr_timur"],
    check: (store, now) => {
      const ilya = streakOf(store, USER.ilya, now);
      const maria = streakOf(store, USER.maria, now);
      const timur = streakOf(store, USER.timur, now);
      return (
        ilya.currentStreak === 5 &&
        ilya.bestStreak === 9 &&
        ilya.solvedToday === 1 &&
        maria.currentStreak === 0 &&
        maria.bestStreak === 4 &&
        maria.solvedToday === 0 &&
        timur.currentStreak === 0 &&
        timur.bestStreak === 0 &&
        timur.solvedThisWeek === 0
      );
    },
  },
  {
    key: "emptyStates",
    kind: "fixture",
    requiredBy: ["09 §2.13"],
    fixtureIds: ["usr_timur", "usr_olga", "grp_empty", "top_empty", "top_systems"],
    check: (store) =>
      store.homeworks.by("studentId", USER.timur).length === 0 &&
      store.statuses.by("studentId", USER.timur).length === 0 &&
      store.participants.by("studentId", USER.timur).length === 0 &&
      store.users.by("teacherId", USER.olga).length === 0 &&
      store.groups.by("teacherId", USER.olga).length === 0 &&
      store.lessons.by("teacherId", USER.olga).length === 0 &&
      store.profiles.by("groupId", GROUP.empty).length === 0 &&
      store.lessons.by("groupId", GROUP.empty).length === 0 &&
      store.numbers.by("topicId", TOPIC.empty).length === 0 &&
      store.topics.get(TOPIC.empty)?.description === "" &&
      store.topics.get(TOPIC.systems)?.theoryFileId === null &&
      store.topics.get(TOPIC.systems)?.homeworkFileId === null,
  },
  {
    key: "numbers.edgeCases",
    kind: "fixture",
    requiredBy: ["09 §2.13", "02 §4.11"],
    fixtureIds: ["num_124", "num_127", "num_220", "top_log", "top_word"],
    check: (store) => {
      const n = (label: string) => store.numbers.get(numberId(label));
      return (
        n("124")?.conditionLatex === null &&
        n("124")?.answerLatex === null &&
        n("127")?.conditionLatex !== null &&
        n("127")?.answerLatex === null &&
        n("220")?.conditionLatex?.includes("\\frac{1}{x$") === true &&
        store.numbers.by("topicId", TOPIC.log).length === 12 &&
        store.numbers.by("topicId", TOPIC.log).every((row) => /^0\d{5}$/.test(row.number)) &&
        store.numbers.by("topicId", TOPIC.word).length === 40 &&
        store.numbers.by("topicId", TOPIC.word).filter((row) => row.conditionLatex === null).length === 5 &&
        store.numbers.size === 79 &&
        store.topics.size === 7
      );
    },
  },
  {
    key: "files.kinds",
    kind: "fixture",
    requiredBy: ["09 §2.4", "02 §4.11"],
    fixtureIds: ["top_linear", "top_quadratic", "top_derivative", "top_log", "top_word"],
    check: (store) =>
      fileOfTopic(store, TOPIC.linear, "theoryFileId")?.mimeType === "application/pdf" &&
      (fileOfTopic(store, TOPIC.quadratic, "theoryFileId")?.size ?? 0) > 1024 * 1024 &&
      fileOfTopic(store, TOPIC.quadratic, "homeworkFileId")?.originalName.endsWith(".docx") === true &&
      fileOfTopic(store, TOPIC.derivative, "theoryFileId")?.mimeType === "image/png" &&
      store.topics.get(TOPIC.derivative)?.homeworkFileId === null &&
      fileOfTopic(store, TOPIC.word, "theoryFileId")?.mimeType === "image/jpeg" &&
      fileOfTopic(store, TOPIC.log, "answersFileId") !== undefined &&
      store.topics.filter((topic) => topic.theoryFileId !== null).length === 5,
  },
  {
    key: "ownership.isolation.orphan.noProfile",
    kind: "fixture",
    requiredBy: ["09 §2.13", "04 §6.8"],
    fixtureIds: ["usr_igor", "usr_sofia", "usr_egor", "hw_sofia_1", "les_igor_1", "grp_10b", "usr_orphan", "usr_timur"],
    check: (store) =>
      store.users.by("teacherId", USER.igor).length === 2 &&
      store.users.by("teacherId", USER.anna).length === 7 &&
      store.homeworks.get("hw_sofia_1")?.studentId === USER.sofia &&
      store.lessons.get("les_igor_1")?.teacherId === USER.igor &&
      store.groups.get(GROUP.g10b)?.teacherId === USER.igor &&
      store.users.get(USER.orphan)?.teacherId === null &&
      store.profiles.findUnique("userId", USER.orphan) === undefined &&
      store.profiles.findUnique("userId", USER.timur) === undefined,
  },
  {
    key: "progressHistory.pagination.sourcesAndDecisions",
    kind: "fixture",
    requiredBy: ["09 §2.6", "04 §6.8"],
    fixtureIds: ["usr_ilya", "num_118"],
    check: (store) => {
      const events = store.progressEvents.by("studentNumber", `${USER.ilya}|${numberId("118")}`);
      const has = (source: string, decision: string) => events.some((event) => event.source === source && event.decision === decision);
      const linkedLessons = events.filter((event) => event.context.lessonId && store.lessons.has(event.context.lessonId)).length;
      const linkedHomeworks = events.filter((event) => event.context.assignmentId && store.homeworks.has(event.context.assignmentId)).length;
      return (
        events.length === 25 &&
        has("teacher", "changed") &&
        has("teacher", "reaffirmed") &&
        has("homework_check", "changed") &&
        has("homework_check", "unchanged") &&
        has("homework_check", "downgrade_blocked") &&
        has("homework_check", "newer_status") &&
        has("homework_check", "uncertain") &&
        has("lesson_check", "changed") &&
        has("lesson_check", "lesson_result_preserved") &&
        has("lesson_teacher", "changed") &&
        has("lesson_teacher", "no_status") &&
        events.some((event) => event.source === "lesson_end" && event.decision === "changed" && event.actorId === null) &&
        linkedLessons >= 2 &&
        linkedHomeworks >= 2 &&
        events.some((event) => event.context.lessonId && !store.lessons.has(event.context.lessonId))
      );
    },
  },

  // ── 90-addendum-6 §10 ────────────────────────────────────────────────────────────────────────────────
  {
    key: "homework.issue.solvedConflict.one",
    kind: "script",
    requiredBy: ["04 §3.4", "90-addendum-6 §6.1"],
    fixtureIds: ["usr_ilya", "top_linear"],
    steps: ["sign in as teacher@example.com", "student Илья → Assign homework", "linear → select 112, 120", "submit → 409 solvedConflict with «112»; selection kept; store unchanged"],
  },
  {
    key: "homework.issue.solvedConflict.many",
    kind: "script",
    requiredBy: ["04 §3.4", "90-addendum-6 §6.1"],
    fixtureIds: ["usr_ilya", "top_linear", "top_log"],
    steps: ["linear → 112, 113, 121, 120 → 409 with «112, 113, 121»", "log → 010204, 010203, 010208 → 409 with «010203, 010204» (numeric order, zeros kept)"],
  },
  {
    key: "homework.issue.reissue",
    kind: "script",
    requiredBy: ["04 §3.4", "90-addendum-6 §6.1"],
    fixtureIds: ["usr_ilya", "hw_ilya_overdue"],
    steps: ["linear → 118, 120 (RED and unmarked, both already in hw_ilya_overdue)", "submit → 201: a second assignment «ДЗ 4», notification homework-assigned, event student-deadlines-changed"],
  },
  {
    key: "draft.issue.mixed",
    kind: "fixture",
    requiredBy: ["05 §3.15", "90-addendum-6 §6.2"],
    fixtureIds: ["hp_conflict"],
    steps: [
      "open hp_conflict → «Выдать всем (2)»",
      "200: issued [Кирилл], failed [Артём: solvedConflict «127, 130»; Полина: emptySet]",
      "repeat → only failures",
      "remove 127 and 130 from Артём's set (or clear their statuses) → issue → issued [Артём]",
    ],
    check: (store) => {
      const labelsOf = (studentId: string) =>
        store.lessonItems.by("participantId", participant(store, "hp_conflict", studentId).id).map((item) => store.numbers.get(item.homeworkNumberId)?.number ?? "");
      const solved = (studentId: string, label: string) => ["GREEN", "YELLOW"].includes(statusOf(store, studentId, label)?.status ?? "");
      return (
        // Артём solved 127 and 130 after the draft was generated; 120 has no row, 124 is RED.
        labelsOf(USER.artem).sort().join() === "120,124,127,130" &&
        solved(USER.artem, "127") &&
        solved(USER.artem, "130") &&
        statusOf(store, USER.artem, "120") === undefined &&
        statusOf(store, USER.artem, "124")?.status === "RED" &&
        // Кирилл can be issued: 112 RED, 113 and 118 without a row.
        labelsOf(USER.kirill).sort().join() === "112,113,118" &&
        statusOf(store, USER.kirill, "112")?.status === "RED" &&
        statusOf(store, USER.kirill, "113") === undefined &&
        statusOf(store, USER.kirill, "118") === undefined &&
        // Полина: ready, but the set was emptied.
        labelsOf(USER.polina).length === 0 &&
        participant(store, "hp_conflict", USER.polina).planGeneratedAt !== null &&
        store.participants.by("lessonId", "hp_conflict").every((row) => row.issuedAssignmentId === null)
      );
    },
  },
  {
    key: "draft.issue.fullyIssued",
    kind: "fixture",
    requiredBy: ["05 §6", "90-addendum-6 §6.2"],
    fixtureIds: ["hp_full", "hw_maria_done3"],
    check: (store) => {
      const rows = store.participants.by("lessonId", "hp_full");
      const assignment = store.homeworks.get("hw_maria_done3");
      return (
        rows.length === 1 &&
        rows[0]!.issuedAssignmentId === "hw_maria_done3" &&
        assignment !== undefined &&
        assignment.title === lesson(store, "hp_full").title &&
        assignment.deadlineAt === lesson(store, "hp_full").deadlineAt
      );
    },
  },
  {
    key: "lesson.submission.injection",
    kind: "fixture",
    requiredBy: ["05 §1.3", "90-addendum-6 §6.3"],
    fixtureIds: ["les_live", "les_g4"],
    check: (store) => {
      const latestOf = (lessonId: string, studentId: string, label: string) => {
        const entry = itemsOf(store, participant(store, lessonId, studentId).id).find((row) => row.item.homeworkNumberId === numberId(label));
        return entry ? { latest: entry.latest, result: entry.item.result } : undefined;
      };
      const polina = latestOf("les_live", USER.polina, "010206");
      const artem = latestOf("les_live", USER.artem, "010206");
      const plain = latestOf("les_g4", USER.polina, "218");
      return (
        // UNCERTAIN + flag with a note → both chips.
        polina?.latest?.verdict === "UNCERTAIN" &&
        polina.latest.injectionSuspected &&
        polina.latest.injectionNote !== null &&
        polina.result === null &&
        // Flag on a CORRECT verdict, no note: verdict and result untouched.
        artem?.latest?.verdict === "CORRECT" &&
        artem.latest.injectionSuspected &&
        artem.latest.injectionNote === null &&
        artem.result === "SOLVED" &&
        // Plain UNCERTAIN, result set by the teacher.
        plain?.latest?.verdict === "UNCERTAIN" &&
        !plain.latest.injectionSuspected &&
        plain.result === "PARTIAL"
      );
    },
  },
  {
    key: "plan.error.everyCodeStored",
    kind: "fixture",
    requiredBy: ["05 §6", "90-addendum-6 §6.4"],
    fixtureIds: ["les_ai_off", "hp_errors", "les_unscheduled", "hp_past", "les_budget", "hp_queue"],
    check: (store) => {
      const stored = new Set(store.participants.all().map(planCode));
      const kindOf = (code: string) => new Set(store.participants.filter((row) => planCode(row) === code).map((row) => store.lessons.get(row.lessonId)?.kind));
      const aiOff = store.participants.by("lessonId", "les_ai_off");
      return (
        PLAN_ERROR_CODES.every((code) => stored.has(code)) &&
        // Codes written by one generator only live on the kind that can carry them.
        !kindOf("noCandidates").has("HOMEWORK") &&
        !kindOf("homeworkParams").has("LESSON") &&
        !kindOf("homeworkNoCandidates").has("LESSON") &&
        // A lesson with failed and ready participants side by side.
        aiOff.filter((row) => planCode(row) === "unavailable").length === 2 &&
        aiOff.some((row) => row.planGeneratedAt !== null && row.planError === null && store.lessonItems.by("participantId", row.id).length === 7) &&
        // Create-time refusals are stored on every participant.
        store.participants.by("lessonId", "les_budget").every((row) => planCode(row) === "budgetExhausted") &&
        store.participants.by("lessonId", "hp_queue").every((row) => planCode(row) === "queueFull") &&
        // A failed participant never has items.
        store.participants.filter((row) => row.planError !== null).every((row) => store.lessonItems.by("participantId", row.id).length === 0)
      );
    },
  },
  {
    key: "plan.retryRefused",
    kind: "control",
    requiredBy: ["05 §7 item 17", "90-addendum-6 §9"],
    fixtureIds: ["les_unscheduled", "hp_errors"],
    control: "planQueueFull",
    steps: ["429 budgetExhausted: exhaust('api:ai-plans:global', 'global')", "503 queueFull: planQueueFull = true", "503 plannerUnavailable: settings lessonPlanEnabled / homeworkPlanEnabled = false"],
  },
  {
    key: "lesson.startsWhileWatching",
    kind: "fixture",
    requiredBy: ["03 §6.5", "90-addendum-6 §6.5"],
    fixtureIds: ["les_dasha_soon", "les_stale"],
    check: (store, now) => {
      const soon = lesson(store, "les_dasha_soon");
      const row = participant(store, soon.id, USER.dasha);
      const items = itemsOf(store, row.id);
      return (
        soon.startsAt !== null &&
        new Date(soon.startsAt).getTime() - now === 3 * 60_000 &&
        soon.durationMinutes === 30 &&
        soon.status === "PLANNED" &&
        deriveLessonStatus(soon, now) === "PLANNED" &&
        deriveLessonStatus(soon, now + 4 * 60_000) === "ACTIVE" &&
        deriveLessonStatus(soon, now + 34 * 60_000) === "FINISHED" &&
        row.joinedAt === null &&
        row.planGeneratedAt !== null &&
        items.length === 4 &&
        items.filter((entry) => entry.item.isExtra).length === 1 &&
        items.every((entry) => entry.submissions.length === 0 && entry.item.result === null) &&
        // Her later upcoming lesson stays.
        deriveLessonStatus(lesson(store, "les_stale"), now) === "PLANNED"
      );
    },
  },
  {
    key: "check.userStarted.threeVerdicts",
    kind: "script",
    requiredBy: ["04 §6.8", "90-addendum-6 §4.5 example 1"],
    fixtureIds: ["hw_ilya_overdue"],
    steps: ["sign in as ilya@example.com", "hw_ilya_overdue: attach 3 photos, start a check", "after 8 s: 118 CORRECT → YELLOW, 120 INCORRECT → RED, 124 UNCERTAIN; notification { correct 1, incorrect 1, uncertain 1, applied 2 }"],
  },
  {
    key: "check.userStarted.completedHomework",
    kind: "script",
    requiredBy: ["90-addendum-6 §4.5 example 2"],
    fixtureIds: ["hw_ilya_done"],
    steps: ["hw_ilya_done: attach 2 photos, start a check", "112 CORRECT → unchanged, 113 INCORRECT → downgrade_blocked; applied 0"],
  },
  {
    key: "lesson.autoResults.walkthrough",
    kind: "script",
    requiredBy: ["03 §4.7", "90-addendum-6 §4.5 example 4"],
    fixtureIds: ["les_dasha_soon"],
    steps: ["sign in as dasha@example.com, wait for the lesson to start", "401 → SOLVED", "402 → NOT_SOLVED, unchanged, PARTIAL", "403 → no result, then SOLVED", "404 (extra, unlocked) → SOLVED"],
  },
  {
    key: "check.failedClasses.doneEmpty",
    kind: "control",
    requiredBy: ["03 §4.3", "90-addendum-6 §9.2"],
    fixtureIds: [],
    control: "nextCheckOutcome",
  },
  {
    key: "check.queueFull",
    kind: "control",
    requiredBy: ["03 §6.5"],
    fixtureIds: [],
    control: "checkQueueFull",
  },
  {
    key: "login.lockout",
    kind: "script",
    requiredBy: ["01 §4.3", "90-addendum-6 §7.4"],
    fixtureIds: ["usr_ilya"],
    steps: ["ilya@example.com with a wrong password 8 times → 8 × 401 invalidCredentials", "9th attempt with the correct password → 429 rateLimited, «…через 9 минут.»", "no journal row for the refused attempt"],
  },
  {
    key: "login.lockout.pinned",
    kind: "fixture",
    requiredBy: ["90-addendum-6 §7.4"],
    fixtureIds: ["locked@example.com"],
    check: (store) =>
      store.controls.limiterPins.some((pin) => pin.scope === "login:ip-login" && pin.identifier === `${MOCK_CLIENT_IP}:${PINNED_LOGIN}` && pin.retryAfterMs === 420_000) &&
      // The limiter answers before the lookup: there is no user with that login.
      store.users.findUnique("email", PINNED_LOGIN) === undefined,
  },
  {
    key: "login.unlock",
    kind: "script",
    requiredBy: ["90-addendum-6 §7.4"],
    fixtureIds: ["usr_ilya"],
    steps: ["after login.lockout advance the clock past the first attempt + 10 min", "correct password → 200; the per-login buckets are deleted, login:ip keeps its hits"],
  },
  {
    key: "login.lockout.deviceWide.perLogin",
    kind: "control",
    requiredBy: ["90-addendum-6 §7.4"],
    fixtureIds: [],
    control: "exhaust",
    steps: ["exhaust('login:ip', 'mock-device')", "exhaust('login:login', '<login>')"],
  },
  {
    key: "login.database",
    kind: "control",
    requiredBy: ["01 §3.1", "90-addendum-6 §7.4"],
    fixtureIds: [],
    control: "forceNextError",
    steps: ["forceNextError { method: 'shell.login', error: 'serviceUnavailable' } → 503 database"],
  },
  {
    key: "password.lockout",
    kind: "script",
    requiredBy: ["01 §4.3", "90-addendum-6 §7.4"],
    fixtureIds: [],
    steps: ["a valid new password with a wrong current password 5 times → 5 × 403 passwordCurrent", "6th with the right one → 429 rateLimited; nothing changes", "after the quarter-hour boundary the next attempt succeeds"],
  },
  {
    key: "password.lockout.pinned",
    kind: "fixture",
    requiredBy: ["90-addendum-6 §7.4"],
    fixtureIds: ["usr_egor"],
    check: (store) =>
      store.controls.limiterPins.some((pin) => pin.scope === "profile:password-update" && pin.identifier === PINNED_PASSWORD_USER_ID && pin.retryAfterMs === undefined) &&
      store.users.has(PINNED_PASSWORD_USER_ID),
  },
  {
    key: "realtime.tooManyConnections",
    kind: "fixture",
    requiredBy: ["01 §3.10", "90-addendum-6 §8.4"],
    fixtureIds: ["usr_igor"],
    control: "externalRealtimeConnections",
    check: (store) => store.controls.externalRealtimeConnections[PINNED_REALTIME_USER_ID] === 2 && store.users.has(PINNED_REALTIME_USER_ID),
  },
  {
    key: "realtime.connectRateLimit",
    kind: "control",
    requiredBy: ["90-addendum-6 §8"],
    fixtureIds: [],
    control: "exhaust",
    steps: ["exhaust('api:realtime-connect', '<userId>')"],
  },
  {
    key: "anyCall.forcedError",
    kind: "control",
    requiredBy: ["02 §4.11", "90-addendum-1 A.3 rule 9"],
    fixtureIds: [],
    control: "forceNextError",
  },
  {
    key: "status.nullWithNote.todayEmptyYesterdayActive",
    kind: "fixture",
    requiredBy: ["02 §4.11", "90-addendum-6 §6.6"],
    fixtureIds: ["usr_ilya", "num_120", "usr_sofia"],
    check: (store, now) => {
      const row = statusOf(store, USER.ilya, "120");
      const sofia = streakOf(store, USER.sofia, now);
      return row !== undefined && row.status === null && row.note !== null && row.statusChangedAt === null && sofia.solvedToday === 0 && sofia.currentStreak === 3;
    },
  },
  {
    key: "status.manualClearSurvives",
    kind: "fixture",
    requiredBy: ["09 §2.6"],
    fixtureIds: ["usr_ilya", "num_124"],
    check: (store) => {
      const row = statusOf(store, USER.ilya, "124");
      return row !== undefined && row.status === null && row.statusChangedAt !== null;
    },
  },
  {
    key: "homework.completedBeforeDeadline.twoOnOneDay",
    kind: "fixture",
    requiredBy: ["02 §4.11", "90-addendum-6 §6.6"],
    fixtureIds: ["hw_maria_done1", "hw_maria_done2", "hw_maria_done3"],
    check: (store, now) => {
      const done1 = homework(store, "hw_maria_done1");
      const done2 = homework(store, "hw_maria_done2");
      const done3 = homework(store, "hw_maria_done3");
      return (
        done1.deadlineAt !== null &&
        done2.deadlineAt !== null &&
        done1.deadlineAt !== done2.deadlineAt &&
        isSameMskDay(done1.deadlineAt, done2.deadlineAt) &&
        done3.deadlineAt !== null &&
        new Date(done3.deadlineAt).getTime() > now &&
        isCompleted(store, done3) &&
        store.homeworks.by("studentId", USER.maria).every((row) => isCompleted(store, row))
      );
    },
  },
  {
    key: "group.moreThanThreeMembers.memberWithoutLessons",
    kind: "fixture",
    requiredBy: ["06 §6", "90-addendum-6 §6.6"],
    fixtureIds: ["grp_8a", "usr_maria"],
    check: (store) =>
      store.profiles.by("groupId", GROUP.g8a).length === 4 &&
      store.profiles.findUnique("userId", USER.maria)?.groupId === GROUP.g8a &&
      // She takes part in no lesson and in no GROUP draft.
      store.participants.by("studentId", USER.maria).every((row) => store.lessons.get(row.lessonId)?.kind === "HOMEWORK" && store.lessons.get(row.lessonId)?.groupId === null),
  },
  {
    key: "statistics.unattributed",
    kind: "fixture",
    requiredBy: ["06 §6", "90-addendum-6 §6.6"],
    fixtureIds: ["usr_orphan", "hw_orphan_1", "usr_polina", "les_dev_demo"],
    check: (store) =>
      store.users.get(USER.orphan)?.teacherId === null &&
      store.homeworks.get("hw_orphan_1")?.studentId === USER.orphan &&
      store.parentCalls.filter((call) => call.teacherId === null).length === 1 &&
      store.lessons.filter((row) => row.kind === "LESSON" && store.users.get(row.teacherId)?.role !== "TEACHER").length === 1,
  },
  {
    key: "lesson.planParams.withoutOutputLocale.null",
    kind: "fixture",
    requiredBy: ["90-addendum-4 PP2"],
    fixtureIds: ["les_early", "les_d1"],
    check: (store) => {
      const early = lesson(store, "les_early").planParams;
      return early !== null && !("outputLocale" in early) && lesson(store, "les_d1").planParams === null;
    },
  },
];
