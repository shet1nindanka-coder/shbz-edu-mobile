/**
 * `GroupsCallsStatsApi` on the mock store — groups and membership, the AI profile of a student, group
 * statistics, attendance, the attendance PDF, parent calls and the developer statistics
 * (docs/spec/06-teacher-groups-calls-stats.md; 00 §1.4.7, §2.11; 90-addendum-1 A.10).
 *
 * Order of checks. Operations that are route handlers on the site (attendance mark, attendance PDF, parent
 * calls, statistics drilldown) keep the handler's order: role → rate limit → input → ownership. Operations
 * that are server actions or page reads on the site (groups, membership, AI profile, overviews) have no
 * HTTP contract there and follow the project rule: role → ownership → input → effect. One exception:
 * `renameGroup` checks the name first, because the site's action is specified that way (06 §3.2).
 *
 * PRIVACY: `ParentCallLog.comment` is personal data. It leaves this module only inside `ParentCallEntry`
 * (overview, history, the answer to the teacher who wrote it) and never reaches a notification, an audit
 * row, a realtime event, a statistics payload or an error.
 */
import type { GroupsCallsStatsApi } from "@/api/client";
import type {
  AttendanceLessonStatus,
  AttentionFlag,
  DeveloperStatistics,
  GroupAttendanceLesson,
  GroupListItem,
  GroupListMember,
  GroupMember,
  GroupMemberRow,
  HomeworkNumberStatus,
  IsoDateTime,
  Lesson,
  ParentCallEntry,
  ParentCallLog,
  ParentCallReminder,
  ParentCallStudentOverview,
  ReportPeriod,
  StatsStudent,
  StatsTopic,
  StudentGroup,
  StudentProfile,
  Subject,
  TeacherLessonEntry,
  TeacherStatsEntry,
  TeacherTopicsOverview,
  TimelineEntry,
} from "@/api/types";
import { ATTENDANCE_STATUSES, LIMITS, PARENT_CALL_OUTCOMES, REPORT_PERIODS } from "@/api/types";
import { buildGroupStatistics, type GroupMemberActivity } from "@/domain/group-statistics";
import { DAY_MS } from "@/domain/moscow-time";
import { calendarDaysBetween, resolveParentCallReminder } from "@/domain/parent-call-state";
import { MAX_TIMELINE_DAYS, buildProgressTimelineEntries, type TimelineStatusRow } from "@/domain/progress-timeline";
import { REPORT_PERIOD_META, parseReportPeriod, reportPeriodStart } from "@/domain/report-period";
import { completionPercent } from "@/domain/statuses";
import { buildStudentStreak } from "@/domain/student-streak";
import { normalizeMultilineText, normalizeSingleLineText } from "@/domain/text";
import { buildWeekBuckets, countByWeek } from "@/domain/week-buckets";

import type { MockContext } from "../context";
import type { MessageSelector } from "../rules/errors";
import type { MockUser } from "../store/schema";

/** `MAX_GROUP_NAME_LENGTH` of the site's group actions: a longer name is cut, not refused. */
const MAX_GROUP_NAME_LENGTH = 120;
const GROUP_GRADE = { min: 1, max: 11 } as const;
/** Lessons shown in the "group lessons" block of the group card. */
const GROUP_RECENT_LESSONS = 3;
/** `IDLE_ATTENTION_DAYS` and the red threshold of `lib/group-statistics.ts` (not exported by the ported module). */
const IDLE_ATTENTION_DAYS = 7;
const RED_MONTH_ATTENTION = 5;
/** `TEACHER_STATS_WEEKS`, `TEACHER_STATS_RECENT_LESSONS` and the top-topics cut of `lib/teacher-statistics.ts`. */
const TEACHER_STATS_WEEKS = 12;
const TEACHER_STATS_RECENT_LESSONS = 8;
const TEACHER_STATS_TOP_TOPICS = 5;

const REMINDER_ORDER = { overdue: 0, due: 1, ok: 2 } as const;

type StatusCounts = { GREEN: number; YELLOW: number; RED: number };

const emptyCounts = (): StatusCounts => ({ GREEN: 0, YELLOW: 0, RED: 0 });

/** A statement / answer that is missing or whitespace-only counts as "not filled". */
const isBlankLatex = (value: string | null): boolean => (value ?? "").replace(/\s/g, "") === "";

export function createGroupsCallsStats(ctx: MockContext): GroupsCallsStatsApi {
  const { store, errors, auth, q, limits } = ctx;

  // ───────────────────────────── scope ─────────────────────────────

  /** A TEACHER sees own students / groups / lessons, a DEVELOPER everything (`ownStudentsWhere`, `ownResourceWhere`). */
  const ownsStudent = (viewer: MockUser, student: MockUser): boolean => viewer.role === "DEVELOPER" || student.teacherId === viewer.id;
  const ownsResource = (viewer: MockUser, row: { teacherId: string }): boolean => viewer.role === "DEVELOPER" || row.teacherId === viewer.id;

  /** The group, else `404 groupNotFound` with an endpoint-specific text (the default is `apiCommon.groupNotFound`). */
  const accessibleGroup = (viewer: MockUser, groupId: string, message?: MessageSelector): StudentGroup => {
    const row = q.group(ctx.validate.id(groupId));
    if (!row || !ownsResource(viewer, row)) throw errors.notFound("groupNotFound", message);
    return row;
  };

  /**
   * Members of a group the viewer may see, name asc. A student transferred to another teacher keeps pointing
   * at the old group until someone cleans it up; the previous owner must not see them.
   */
  const visibleMembers = (viewer: MockUser, groupId: string): MockUser[] => q.groupMembers(groupId).filter((student) => ownsStudent(viewer, student));

  /** Lessons that ended by schedule are closed lazily before a group read, as the group page does. */
  const finalizeFor = (viewer: MockUser): void => {
    ctx.lessons.finalizeDue(viewer.role === "TEACHER" ? { teacherId: viewer.id } : {});
  };

  // ───────────────────────────── groups: projections ─────────────────────────────

  const toListMember = (student: MockUser): GroupListMember => {
    const profile = q.profile(student.id);
    return { id: student.id, name: student.name, email: student.email, speed: profile?.speed ?? null, aiNote: profile?.aiNote ?? null };
  };

  /** A member with the counts of their GREEN / YELLOW / RED statuses over the whole bank. */
  const toMember = (student: MockUser): GroupMember => {
    const progress = { greenCount: 0, yellowCount: 0, redCount: 0 };
    for (const row of q.statusesOfStudent(student.id)) {
      if (row.status === "GREEN") progress.greenCount += 1;
      else if (row.status === "YELLOW") progress.yellowCount += 1;
      else if (row.status === "RED") progress.redCount += 1;
    }
    return { ...toListMember(student), progress };
  };

  const toListItem = (viewer: MockUser, group: StudentGroup): GroupListItem => {
    const members = visibleMembers(viewer, group.id).map(toListMember);
    return { id: group.id, name: group.name, subject: group.subject, grade: group.grade, createdAt: group.createdAt, membersCount: members.length, members };
  };

  /** Lessons (kind LESSON) of a group the viewer owns, newest created first. */
  const groupLessons = (viewer: MockUser, groupId: string): Lesson[] =>
    store.lessons
      .by("groupId", groupId)
      .filter((lesson) => lesson.kind === "LESSON" && ownsResource(viewer, lesson))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  /** `StudentProfile.upsert`: a brand-new account has no profile row yet. */
  const upsertProfile = (studentId: string, patch: Partial<Pick<StudentProfile, "groupId" | "speed" | "aiNote">>): StudentProfile => {
    const now = ctx.nowIso();
    const existing = q.profile(studentId);
    if (existing) return store.profiles.update(existing.id, { ...patch, updatedAt: now });
    return store.profiles.insert({
      id: store.nextId("prof"),
      userId: studentId,
      subject: null,
      grade: null,
      levelScore: null,
      placedAt: null,
      speed: null,
      aiNote: null,
      aiPortrait: null,
      portraitUpdatedAt: null,
      groupId: null,
      createdAt: now,
      updatedAt: now,
      ...patch,
    });
  };

  // ───────────────────────────── group statistics ─────────────────────────────

  /** The site's `getGroupStatistics` inputs for one member (06 §4.2). */
  const activityOf = (student: MockUser, now: number): GroupMemberActivity => {
    const timeline = buildProgressTimelineEntries(q.timelineRows(student.id), MAX_TIMELINE_DAYS, now);
    const last7 = timeline.slice(-7);
    const last30 = timeline.slice(-30);

    let lastActivity: number | null = null;
    for (const row of q.statusesOfStudent(student.id)) {
      if (!row.status) continue;
      // Same rule as the timeline: `statusChangedAt`, and `updatedAt` for rows written before that column.
      const at = new Date(row.statusChangedAt ?? row.updatedAt).getTime();
      if (Number.isFinite(at) && (lastActivity === null || at > lastActivity)) lastActivity = at;
    }

    let overdueHomeworks = 0;
    let activeHomeworks = 0;
    for (const assignment of q.homeworksOfStudent(student.id)) {
      if (q.isHomeworkCompleted(assignment.id)) continue;
      if (assignment.deadlineAt && new Date(assignment.deadlineAt).getTime() < now) overdueHomeworks += 1;
      else activeHomeworks += 1;
    }

    return {
      id: student.id,
      name: student.name,
      closed7: last7.reduce((sum, entry) => sum + entry.closedCount, 0),
      closed30: last30.reduce((sum, entry) => sum + entry.closedCount, 0),
      red30: last30.reduce((sum, entry) => sum + entry.redCount, 0),
      streak: buildStudentStreak(timeline).currentStreak,
      overdueHomeworks,
      activeHomeworks,
      lastActivityAt: lastActivity === null ? null : new Date(lastActivity),
    };
  };

  /** The attention flags as codes, in the site's order (the app renders them with `dict.planner.groupStatistics`). */
  const attentionOf = (row: { overdueHomeworks: number; idleDays: number | null; red30: number }): AttentionFlag[] => {
    const flags: AttentionFlag[] = [];
    if (row.overdueHomeworks > 0) flags.push({ code: "overdue_homework", count: row.overdueHomeworks });
    if (row.idleDays === null) flags.push({ code: "not_started" });
    else if (row.idleDays >= IDLE_ATTENTION_DAYS) flags.push({ code: "idle", days: row.idleDays });
    if (row.red30 >= RED_MONTH_ATTENTION) flags.push({ code: "red_month", count: row.red30 });
    return flags;
  };

  // ───────────────────────────── attendance ─────────────────────────────

  /**
   * Lessons of the attendance table (`getGroupAttendance`): scheduled, started inside [since, now], not
   * PLANNED by the schedule; ordered by `startsAt` asc. A lesson without a time never appears.
   */
  const attendanceLessons = (viewer: MockUser, groupId: string, since: number, now: number): GroupAttendanceLesson[] => {
    const rows: { lesson: Lesson; startsAt: IsoDateTime; startsAtMs: number; status: AttendanceLessonStatus }[] = [];
    for (const lesson of groupLessons(viewer, groupId)) {
      if (!lesson.startsAt) continue;
      const startsAtMs = new Date(lesson.startsAt).getTime();
      if (!(startsAtMs >= since && startsAtMs <= now)) continue;
      const status = q.lessonStatus(lesson);
      if (status === "PLANNED") continue;
      rows.push({ lesson, startsAt: lesson.startsAt, startsAtMs, status });
    }
    return rows
      .sort((left, right) => left.startsAtMs - right.startsAtMs || left.lesson.id.localeCompare(right.lesson.id))
      .map(({ lesson, startsAt, status }) => ({
        id: lesson.id,
        title: lesson.title,
        startsAt,
        status,
        // Everyone who took part, including students who have left the group since.
        participants: q.participants(lesson.id).map((participant) => ({
          participantId: participant.id,
          studentId: participant.studentId,
          attendance: participant.attendance,
          joinedAt: participant.joinedAt,
        })),
      }));
  };

  // ───────────────────────────── parent calls ─────────────────────────────

  /**
   * Journal of a student, newest first: `calledAt` desc, then the later insert first (the site's `id desc`
   * on monotonic ids) — two calls saved in the same instant keep a stable order.
   */
  const callsNewestFirst = (studentId: string): ParentCallLog[] =>
    store.parentCalls
      .by("studentId", studentId)
      .map((row, index) => ({ row, index }))
      .sort((left, right) => right.row.calledAt.localeCompare(left.row.calledAt) || right.index - left.index)
      .map((entry) => entry.row);

  /** The only projection that carries the comment. */
  const toCallEntry = (call: ParentCallLog): ParentCallEntry => ({
    id: call.id,
    outcome: call.outcome,
    comment: call.comment,
    calledAt: call.calledAt,
    // null when the teacher who called was deleted.
    teacherName: q.user(call.teacherId)?.name ?? null,
  });

  /** Reminder of a student: the anchor is the newest REACHED call, else the creation of the account. */
  const reminderOf = (student: MockUser, calls: ParentCallLog[], now: Date): { reminder: ParentCallReminder; lastReachedAt: IsoDateTime | null } => {
    const lastReached = calls.find((call) => call.outcome === "REACHED");
    const reminder = resolveParentCallReminder({
      lastReachedAt: lastReached ? new Date(lastReached.calledAt) : null,
      studentCreatedAt: new Date(student.createdAt),
      now,
    });
    return { reminder, lastReachedAt: lastReached?.calledAt ?? null };
  };

  const overviewOf = (student: MockUser, now: Date): ParentCallStudentOverview => {
    const calls = callsNewestFirst(student.id);
    const { reminder, lastReachedAt } = reminderOf(student, calls, now);
    const lastAttempt = calls[0];
    // The newest entry is an unanswered attempt made after the last successful call (or there was none).
    const attemptAfterLastReached =
      lastAttempt !== undefined &&
      lastAttempt.outcome === "NO_ANSWER" &&
      (lastReachedAt === null || new Date(lastAttempt.calledAt).getTime() > new Date(lastReachedAt).getTime());

    return {
      studentId: student.id,
      studentName: student.name,
      teacherId: student.teacherId,
      teacherName: q.user(student.teacherId)?.name ?? null,
      reminder,
      studentCreatedAt: student.createdAt,
      lastReachedAt,
      attemptAfterLastReached,
      attemptDaysAgo: attemptAfterLastReached && lastAttempt ? Math.max(0, calendarDaysBetween(new Date(lastAttempt.calledAt), now)) : null,
      // The whole journal is counted; the overview carries only the newest entries.
      totalCalls: calls.length,
      history: calls.slice(0, LIMITS.parentCallHistoryShown).map(toCallEntry),
    };
  };

  // ───────────────────────────── statistics (DEVELOPER: every student) ─────────────────────────────

  /** `getTeacherTopicsOverview` for a developer: counters per student and per topic over the whole bank. */
  const buildOverview = (): TeacherTopicsOverview => {
    const students = q.allStudents();
    const studentIds = new Set(students.map((student) => student.id));
    const byStudent = new Map<string, StatusCounts>();
    const byTopic = new Map<string, StatusCounts>();
    const activeByTopic = new Map<string, Set<string>>();

    for (const row of store.statuses.all()) {
      if (!row.status || !studentIds.has(row.studentId)) continue;
      const number = q.number(row.homeworkNumberId);
      if (!number) continue;
      const studentCounts = byStudent.get(row.studentId) ?? emptyCounts();
      studentCounts[row.status] += 1;
      byStudent.set(row.studentId, studentCounts);
      const topicCounts = byTopic.get(number.topicId) ?? emptyCounts();
      topicCounts[row.status] += 1;
      byTopic.set(number.topicId, topicCounts);
      const active = activeByTopic.get(number.topicId) ?? new Set<string>();
      active.add(row.studentId);
      activeByTopic.set(number.topicId, active);
    }

    const topicRows = q.topicsOrdered();
    const topics: StatsTopic[] = topicRows.map((topic) => {
      const counts = byTopic.get(topic.id) ?? emptyCounts();
      const totalNumbers = store.numbers.by("topicId", topic.id).length;
      const totalSlots = totalNumbers * students.length;
      const markedCount = counts.GREEN + counts.YELLOW + counts.RED;
      return {
        id: topic.id,
        title: topic.title,
        greenCount: counts.GREEN,
        yellowCount: counts.YELLOW,
        redCount: counts.RED,
        markedCount,
        totalStudents: students.length,
        totalNumbers,
        totalSlots,
        studentsWithActivity: activeByTopic.get(topic.id)?.size ?? 0,
        progressPercent: completionPercent(markedCount, totalSlots),
      };
    });

    const studentCards: StatsStudent[] = students.map((student) => {
      const counts = byStudent.get(student.id) ?? emptyCounts();
      return {
        id: student.id,
        name: student.name,
        email: student.email,
        greenCount: counts.GREEN,
        yellowCount: counts.YELLOW,
        redCount: counts.RED,
        markedCount: counts.GREEN + counts.YELLOW + counts.RED,
        solvedCount: counts.GREEN + counts.YELLOW,
      };
    });

    // Files in use: theory / homework files of topics and answer files of numbers (the site's count).
    const fileIds = new Set<string>();
    for (const topic of topicRows) {
      if (topic.theoryFileId) fileIds.add(topic.theoryFileId);
      if (topic.homeworkFileId) fileIds.add(topic.homeworkFileId);
    }
    for (const number of store.numbers.all()) {
      if (number.answerFileId) fileIds.add(number.answerFileId);
    }
    let totalFiles = 0;
    for (const fileId of fileIds) {
      if (store.files.has(fileId)) totalFiles += 1;
    }

    return {
      students: studentCards,
      topics,
      stats: {
        totalTopics: topics.length,
        totalStudents: students.length,
        totalFiles,
        totalNumbers: topics.reduce((sum, topic) => sum + topic.totalNumbers, 0),
        totalMarked: topics.reduce((sum, topic) => sum + topic.markedCount, 0),
      },
    };
  };

  /** `getDeveloperStatistics().homework` (06 §4.7). */
  const buildHomeworkStats = (): DeveloperStatistics["homework"] => {
    const now = ctx.now();
    const statusByKey = new Map<string, HomeworkNumberStatus>();
    for (const row of store.statuses.all()) {
      if (row.status) statusByKey.set(`${row.studentId}|${row.homeworkNumberId}`, row.status);
    }

    // Distinct (student, number) pairs issued in any homework.
    const issued = new Set<string>();
    let total = 0;
    let completedCount = 0;
    let overdueCount = 0;
    let inProgressCount = 0;
    let withPhotosCount = 0;
    let photosTotal = 0;

    for (const assignment of store.homeworks.all()) {
      if (!q.student(assignment.studentId)) continue;
      total += 1;
      const links = store.homeworkNumbers.by("assignmentId", assignment.id);
      let solved = 0;
      for (const link of links) {
        const key = `${assignment.studentId}|${link.homeworkNumberId}`;
        issued.add(key);
        const status = statusByKey.get(key);
        if (status === "GREEN" || status === "YELLOW") solved += 1;
      }

      if (links.length > 0 && solved === links.length) completedCount += 1;
      else if (assignment.deadlineAt && new Date(assignment.deadlineAt).getTime() < now) overdueCount += 1;
      else inProgressCount += 1;

      // Attached photos plus the batches already consumed by checks (they live in the check history).
      const photos =
        store.homeworkPhotos.by("assignmentId", assignment.id).length +
        store.homeworkChecks.by("assignmentId", assignment.id).reduce((sum, check) => sum + store.homeworkCheckPhotos.by("checkId", check.id).length, 0);
      if (photos > 0) withPhotosCount += 1;
      photosTotal += photos;
    }

    let green = 0;
    let yellow = 0;
    let red = 0;
    for (const key of issued) {
      const status = statusByKey.get(key);
      if (status === "GREEN") green += 1;
      else if (status === "YELLOW") yellow += 1;
      else if (status === "RED") red += 1;
    }

    return {
      total,
      completedCount,
      overdueCount,
      inProgressCount,
      withPhotosCount,
      photosTotal,
      issuedNumbersTotal: issued.size,
      issuedNumbersSolved: green + yellow,
      issuedNumbersGreen: green,
      issuedNumbersYellow: yellow,
      issuedNumbersRed: red,
      issuedNumbersUnmarked: issued.size - (green + yellow + red),
    };
  };

  /** `getDeveloperStatistics().content`: completeness of the bank and the list of gaps. */
  const buildContentStats = (): DeveloperStatistics["content"] => {
    const gaps: DeveloperStatistics["content"]["gaps"] = [];
    let totalNumbers = 0;
    let numbersWithCondition = 0;
    let numbersWithAnswer = 0;
    let topicsWithTheory = 0;
    let topicsWithHomeworkFile = 0;
    const topics = q.topicsOrdered();

    for (const topic of topics) {
      const numbers = store.numbers.by("topicId", topic.id);
      const missingConditions = numbers.filter((number) => isBlankLatex(number.conditionLatex)).length;
      const missingAnswers = numbers.filter((number) => isBlankLatex(number.answerLatex)).length;
      totalNumbers += numbers.length;
      numbersWithCondition += numbers.length - missingConditions;
      numbersWithAnswer += numbers.length - missingAnswers;
      if (topic.theoryFileId) topicsWithTheory += 1;
      if (topic.homeworkFileId) topicsWithHomeworkFile += 1;

      if (!topic.theoryFileId || !topic.homeworkFileId || missingConditions > 0 || missingAnswers > 0) {
        gaps.push({
          topicId: topic.id,
          title: topic.title,
          noTheoryFile: !topic.theoryFileId,
          noHomeworkFile: !topic.homeworkFileId,
          missingConditions,
          missingAnswers,
        });
      }
    }

    return { totalTopics: topics.length, totalNumbers, numbersWithCondition, numbersWithAnswer, topicsWithTheory, topicsWithHomeworkFile, gaps };
  };

  /** 112 Moscow days, oldest first: one student, or every student when `studentId` is null. */
  const buildTimeline = (studentId: string | null): TimelineEntry[] => {
    const rows: TimelineStatusRow[] =
      studentId !== null
        ? q.timelineRows(studentId)
        : store.statuses
            .filter((row) => q.student(row.studentId) !== undefined)
            .map((row) => ({ status: row.status, statusChangedAt: row.statusChangedAt, updatedAt: row.updatedAt }));
    return buildProgressTimelineEntries(rows, MAX_TIMELINE_DAYS, ctx.now());
  };

  return {
    // ───────────────────────────── groups ─────────────────────────────

    async listGroups() {
      const user = auth.requireStaff();
      const groups = user.role === "DEVELOPER" ? store.groups.all().sort((left, right) => left.createdAt.localeCompare(right.createdAt)) : q.groupsOfTeacher(user.id);
      return { groups: groups.map((group) => toListItem(user, group)), canCreate: user.role === "TEACHER" };
    },

    async createGroup(input) {
      // Only a teacher creates groups: a developer must not own one (`403 unauthorized`).
      const user = auth.requireTeacher();
      const name = normalizeSingleLineText(String(input?.name ?? "")).slice(0, MAX_GROUP_NAME_LENGTH);
      if (!name) throw errors.invalidData((dict) => dict.planner.groups.list.notices.invalid);
      // Site parity: a grade outside 1..11 is stored as "not set", not refused; the subject defaults to MATH.
      const grade = ctx.validate.integer(input?.grade, GROUP_GRADE.min, GROUP_GRADE.max);
      const subject: Subject = input?.subject === "INFORMATICS" ? "INFORMATICS" : "MATH";

      const now = ctx.nowIso();
      const group = store.groups.insert({ id: store.nextId("grp"), name, subject, grade, teacherId: user.id, createdAt: now, updatedAt: now });
      return { group: toListItem(user, group) };
    },

    async getGroup(groupId) {
      const user = auth.requireStaff();
      const group = accessibleGroup(user, groupId);
      finalizeFor(user);

      const lessons = groupLessons(user, group.id);
      return {
        group: {
          id: group.id,
          name: group.name,
          subject: group.subject,
          grade: group.grade,
          createdAt: group.createdAt,
          totalNumbers: store.numbers.size,
          members: visibleMembers(user, group.id).map(toMember),
          // Every student the viewer may add, members included; `groupId` drives the "will be moved here" warning.
          allStudents: q.visibleStudents(user).map((student) => ({
            id: student.id,
            name: student.name,
            email: student.email,
            groupId: q.profile(student.id)?.groupId ?? null,
          })),
        },
        lessons: {
          total: lessons.length,
          recent: lessons.slice(0, GROUP_RECENT_LESSONS).map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            startsAt: lesson.startsAt,
            createdAt: lesson.createdAt,
            durationMinutes: lesson.durationMinutes,
            status: q.lessonStatus(lesson),
          })),
        },
      };
    },

    async renameGroup(groupId, input) {
      const user = auth.requireStaff();
      // The site's action checks the form before it looks the group up (06 §3.2): an empty name is
      // `invalid` whatever the group is.
      const name = normalizeSingleLineText(String(input?.name ?? "")).slice(0, MAX_GROUP_NAME_LENGTH);
      if (!name) throw errors.invalidData((dict) => dict.planner.groups.list.notices.invalid);
      const group = accessibleGroup(user, groupId, (dict) => dict.planner.groups.list.notices.missing);
      const updated = store.groups.update(group.id, { name, updatedAt: ctx.nowIso() });
      return { group: { id: updated.id, name: updated.name } };
    },

    async deleteGroup(groupId) {
      const user = auth.requireStaff();
      const group = accessibleGroup(user, groupId, (dict) => dict.planner.groups.list.notices.missing);
      // Students, their progress and profile stay; the group's lessons survive without a group.
      store.transaction(() => ctx.cascade.deleteGroup(group.id));
    },

    async addGroupMember(groupId, input) {
      const user = auth.requireStaff();
      const group = accessibleGroup(user, groupId);
      // A teacher adds only own students; a foreign one is indistinguishable from a missing one.
      const student = ctx.guard.student(user, ctx.validate.id(input?.studentId) ?? "");

      const previousGroupId = q.profile(student.id)?.groupId ?? null;
      // A student is in at most one group: adding moves them here, without a confirmation step.
      upsertProfile(student.id, { groupId: group.id });
      return { member: toMember(student), movedFromGroupId: previousGroupId !== null && previousGroupId !== group.id ? previousGroupId : null };
    },

    async removeGroupMember(groupId, studentId) {
      const user = auth.requireStaff();
      const group = accessibleGroup(user, groupId);
      // Idempotent: a student who is not in this group (or does not exist) changes nothing.
      const profile = q.profile(ctx.validate.id(studentId) ?? "");
      if (profile && profile.groupId === group.id) store.profiles.update(profile.id, { groupId: null, updatedAt: ctx.nowIso() });
    },

    async setStudentAiProfile(studentId, input) {
      const user = auth.requireStaff();
      const student = ctx.guard.student(user, ctx.validate.id(studentId) ?? "");

      // Full overwrite of both fields. "Not set" is null (the site's empty select value).
      const rawSpeed: unknown = input?.speed;
      let speed: number | null = null;
      if (rawSpeed !== null && rawSpeed !== undefined && rawSpeed !== "") {
        speed = ctx.validate.integer(rawSpeed, LIMITS.speed.min, LIMITS.speed.max);
        // 90-addendum-1 A.10: a speed outside 1..10 is refused (the site stores null silently).
        if (speed === null) throw errors.invalidData();
      }
      const aiNote = normalizeSingleLineText(String(input?.aiNote ?? "")).slice(0, LIMITS.aiNoteMaxLength) || null;

      const profile = upsertProfile(student.id, { speed, aiNote });
      return { studentId: student.id, speed: profile.speed, aiNote: profile.aiNote };
    },

    async getGroupStatistics(groupId) {
      const user = auth.requireStaff();
      const group = accessibleGroup(user, groupId);
      // Finalisation writes "not solved" marks, so it runs before the numbers are counted.
      finalizeFor(user);

      const now = ctx.now();
      const statistics = buildGroupStatistics(
        visibleMembers(user, group.id).map((student) => activityOf(student, now)),
        new Date(now),
      );
      const members: GroupMemberRow[] = statistics.members.map((row) => ({
        id: row.id,
        name: row.name,
        closed7: row.closed7,
        closed30: row.closed30,
        red30: row.red30,
        streak: row.streak,
        overdueHomeworks: row.overdueHomeworks,
        activeHomeworks: row.activeHomeworks,
        lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
        rank: row.rank,
        idleDays: row.idleDays,
        attention: attentionOf(row),
      }));

      return {
        generatedAt: new Date(now).toISOString(),
        members,
        mostActiveId: statistics.mostActive?.id ?? null,
        leastActiveId: statistics.leastActive?.id ?? null,
        totals: statistics.totals,
      };
    },

    // ───────────────────────────── attendance ─────────────────────────────

    async getGroupAttendance(groupId, period) {
      const user = auth.requireStaff();
      const group = accessibleGroup(user, groupId);
      // Closing a lesson that ended by schedule also sets the automatic PRESENT / ABSENT marks.
      finalizeFor(user);

      // SPEC-GAP: the contract names only the default ("year"); an unknown value falls back to it.
      const resolved: ReportPeriod = ctx.validate.oneOf(period, REPORT_PERIODS) ? period : "year";
      const now = ctx.now();
      const since = reportPeriodStart(resolved, new Date(now));

      return {
        period: resolved,
        since: since.toISOString(),
        until: new Date(now).toISOString(),
        // Rows of the table are the CURRENT members; a former member's participations stay inside the lessons.
        members: visibleMembers(user, group.id).map((student) => ({ id: student.id, name: student.name })),
        lessons: attendanceLessons(user, group.id, since.getTime(), now),
      };
    },

    async setAttendance(lessonId, participantId, attendance) {
      const user = auth.requireStaff();
      limits.enforce("api:lesson-attendance");

      if (!ctx.validate.oneOf(attendance, ATTENDANCE_STATUSES)) {
        return errors.fail({ status: 400, code: "invalidMark", message: (dict) => dict.apiPlanner.attendance.invalidMark });
      }

      // A draft, a foreign lesson and a student transferred to another teacher all read as "not found".
      const participant = q.participant(participantId);
      const lesson = participant ? q.lesson(participant.lessonId) : undefined;
      const student = participant ? q.student(participant.studentId) : undefined;
      if (!participant || !lesson || !student || lesson.id !== lessonId || lesson.kind !== "LESSON" || !ownsResource(user, lesson) || !ownsStudent(user, student)) {
        throw errors.notFound("participantNotFound", (dict) => dict.apiPlanner.attendance.participantNotFound);
      }

      // Only the mark changes: `joinedAt`, results and progress are untouched; any lesson status is allowed.
      store.participants.update(participant.id, { attendance, updatedAt: ctx.nowIso() });
      ctx.emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: lesson.teacherId, studentId: participant.studentId });
      return { attendance };
    },

    async downloadGroupAttendancePdf(groupId, period) {
      const user = auth.requireStaff();
      // Shared with the student report; consumed before the group is looked up, as on the site.
      limits.enforce("api:pdf-export");
      const group = accessibleGroup(user, groupId);

      // Only "30d" and "year" are recognised; anything else is the week.
      const resolved = parseReportPeriod(typeof period === "string" ? period : null);
      // SPEC-GAP: the site sends an ASCII `filename` and a UTF-8 `filename*`; the readable one is returned
      // (the document is Russian-only, so is its name). The date part is the UTC date, as on the site.
      const fileName = `Посещаемость — ${group.name} — ${REPORT_PERIOD_META[resolved].fileLabel} — ${ctx.nowIso().slice(0, 10)}.pdf`;
      try {
        return { uri: await ctx.documents.download("groupAttendance", fileName), fileName };
      } catch {
        throw errors.make({ status: 500, code: "exportFailed", message: (_dict, m) => m.common.errors.exportFailed });
      }
    },

    // ───────────────────────────── parent calls ─────────────────────────────

    async getParentCallsOverview() {
      const user = auth.requireStaff();
      // Entering the calls section generates the lazy reminders of a teacher (throttled inside).
      if (user.role === "TEACHER") ctx.notify.ensureParentCallReminders(user.id);

      const now = ctx.nowDate();
      // Name order first; the sort below is stable, so equal rows keep it.
      const students = q
        .visibleStudents(user)
        .map((student) => overviewOf(student, now))
        .sort(
          (left, right) =>
            REMINDER_ORDER[left.reminder.state] - REMINDER_ORDER[right.reminder.state] || right.reminder.daysSinceAnchor - left.reminder.daysSinceAnchor,
        );

      return {
        canRecord: user.role === "TEACHER",
        students,
        counts: {
          overdue: students.filter((row) => row.reminder.state === "overdue").length,
          due: students.filter((row) => row.reminder.state === "due").length,
          total: students.length,
        },
      };
    },

    async getParentCallCounts() {
      const user = auth.requireStaff();
      const now = ctx.nowDate();
      let due = 0;
      let overdue = 0;
      // Counters only: no history, no comments.
      for (const student of q.visibleStudents(user)) {
        const { reminder } = reminderOf(student, callsNewestFirst(student.id), now);
        if (reminder.state === "due") due += 1;
        else if (reminder.state === "overdue") overdue += 1;
      }
      return { due, overdue };
    },

    async getParentCallHistory(studentId, page) {
      const user = auth.requireStaff();
      const id = ctx.validate.id(studentId);
      if (id === null) {
        return errors.fail({ status: 400, code: "studentRequired", message: (dict) => dict.apiPlanner.parentCalls.studentRequired });
      }
      // A teacher must not learn whether a foreign student exists.
      const student = ctx.guard.student(user, id);

      const calls = callsNewestFirst(student.id);
      const limit = ctx.validate.clampInteger(page?.limit, 1, LIMITS.parentCallHistoryPageSize, LIMITS.parentCallHistoryPageSize);
      let start = 0;
      const before = ctx.validate.id(page?.before);
      if (before !== null) {
        const index = calls.findIndex((call) => call.id === before);
        // SPEC-GAP: a cursor that is not a call of this student is undifferentiated bad input.
        if (index === -1) throw errors.invalidData();
        start = index + 1;
      }

      return { studentId: student.id, calls: calls.slice(start, start + limit).map(toCallEntry), hasMore: start + limit < calls.length };
    },

    async recordParentCall(input) {
      // A developer is read-only for calls (`403 unauthorized`).
      const user = auth.requireTeacher();
      limits.enforce("api:parent-calls");

      const studentId = String(input?.studentId ?? "").trim();
      const outcome: unknown = typeof input?.outcome === "string" ? input.outcome.trim() : input?.outcome;
      // Cut silently; an empty comment is stored as null.
      const comment = normalizeMultilineText(String(input?.comment ?? "")).slice(0, LIMITS.parentCallCommentMaxLength) || null;

      if (!studentId) {
        return errors.fail({ status: 400, code: "studentRequired", message: (dict) => dict.apiPlanner.parentCalls.studentRequired });
      }
      if (!ctx.validate.oneOf(outcome, PARENT_CALL_OUTCOMES)) {
        return errors.fail({ status: 400, code: "outcomeRequired", message: (dict) => dict.apiPlanner.parentCalls.outcomeRequired });
      }
      const student = ctx.guard.student(user, studentId);

      // Append-only: `calledAt` is always "now", there is no edit and no delete.
      const now = ctx.nowIso();
      const call = store.transaction(() => {
        const row = store.parentCalls.insert({ id: store.nextId("call"), studentId: student.id, teacherId: user.id, outcome, comment, calledAt: now, createdAt: now });
        // Only a successful call closes the reminders about this student; NO_ANSWER keeps the countdown.
        if (outcome === "REACHED") ctx.notify.markParentCallRemindersRead(user.id, student.id);
        return row;
      });

      return { call: toCallEntry(call), reminder: reminderOf(student, callsNewestFirst(student.id), ctx.nowDate()).reminder };
    },

    // ───────────────────────────── statistics (DEVELOPER only) ─────────────────────────────

    async getStatisticsProgress(studentId) {
      auth.requireDeveloper();
      const overview = buildOverview();
      // An unknown id is not an error: the filter falls back to "all students", like the site page.
      const wanted = ctx.validate.id(studentId);
      const timelineStudentId = overview.students.find((student) => student.id === wanted)?.id ?? null;
      return { overview, homework: buildHomeworkStats(), timeline: buildTimeline(timelineStudentId), timelineStudentId };
    },

    async getStatisticsDrilldown(topicId, studentId) {
      auth.requireDeveloper();
      limits.enforce("api:statistics-drilldown");

      const topic = ctx.validate.id(topicId);
      const student = ctx.validate.id(studentId);
      if (topic === null || student === null) {
        return errors.fail({ status: 400, code: "paramsRequired", message: (dict) => dict.apiContent.statistics.paramsRequired });
      }
      if (!q.student(student)) throw errors.notFound("studentNotFound");

      // One entry per number of the topic in display order; an unknown topic is an empty list, not a 404.
      return {
        numbers: q.numbersOfTopic(topic).map((number) => {
          const row = q.status(student, number.id);
          return { status: row?.status ?? null, deadlineAt: row?.deadlineAt ?? null };
        }),
      };
    },

    async getStatisticsTeachers() {
      auth.requireDeveloper();
      const now = ctx.now();
      const buckets = buildWeekBuckets(new Date(now), TEACHER_STATS_WEEKS);
      const windowStart = buckets[0]?.start.getTime() ?? now;
      const since30d = now - 30 * DAY_MS;

      const entries = new Map<string, TeacherStatsEntry>(
        q.teachers().map((teacher) => [
          teacher.id,
          {
            teacherId: teacher.id,
            teacherName: teacher.name,
            teacherEmail: teacher.email,
            studentsCount: 0,
            homeworkTotal: 0,
            homework30d: 0,
            callsReached: 0,
            callsNoAnswer: 0,
            lessonsTotal: 0,
            lessonsFinished: 0,
            lessonsByWeek: buckets.map(() => 0),
            recentLessons: [],
            topTopics: [],
          },
        ]),
      );
      const unattributed = { students: 0, homework: 0, calls: 0, lessons: 0 };

      // Students and homework are attributed to the student's owner.
      const ownerOf = new Map<string, string | null>();
      for (const student of q.allStudents()) {
        ownerOf.set(student.id, student.teacherId);
        const entry = student.teacherId ? entries.get(student.teacherId) : undefined;
        if (entry) entry.studentsCount += 1;
        else unattributed.students += 1;
      }
      for (const assignment of store.homeworks.all()) {
        const owner = ownerOf.get(assignment.studentId) ?? null;
        const entry = owner ? entries.get(owner) : undefined;
        if (!entry) {
          unattributed.homework += 1;
          continue;
        }
        entry.homeworkTotal += 1;
        if (new Date(assignment.createdAt).getTime() >= since30d) entry.homework30d += 1;
      }

      // Calls belong to whoever made them. Counts only — a comment never reaches the statistics.
      for (const call of store.parentCalls.all()) {
        const entry = call.teacherId ? entries.get(call.teacherId) : undefined;
        if (!entry) unattributed.calls += 1;
        else if (call.outcome === "REACHED") entry.callsReached += 1;
        else entry.callsNoAnswer += 1;
      }

      // Lessons belong to their creator; homework drafts are not lessons.
      const windowLessons = new Map<string, { lesson: Lesson; happenedAt: number }[]>();
      for (const lesson of store.lessons.all()) {
        if (lesson.kind !== "LESSON") continue;
        const entry = entries.get(lesson.teacherId);
        if (!entry) {
          unattributed.lessons += 1;
          continue;
        }
        entry.lessonsTotal += 1;
        // The STORED status: "held" means the results were finalised, not that the time has passed.
        if (lesson.status === "FINISHED") entry.lessonsFinished += 1;

        // A lesson "happens" at its scheduled time, else when it was created.
        const happenedAt = new Date(lesson.startsAt ?? lesson.createdAt).getTime();
        if (happenedAt >= windowStart) {
          const list = windowLessons.get(lesson.teacherId) ?? [];
          list.push({ lesson, happenedAt });
          windowLessons.set(lesson.teacherId, list);
        }
      }

      for (const entry of entries.values()) {
        const lessons = windowLessons.get(entry.teacherId) ?? [];
        entry.lessonsByWeek = countByWeek(
          lessons.map((row) => new Date(row.happenedAt)),
          buckets,
        );

        const topicCounts = new Map<string, number>();
        for (const { lesson } of lessons) {
          const title = q.topic(lesson.topicId)?.title;
          if (title) topicCounts.set(title, (topicCounts.get(title) ?? 0) + 1);
        }
        entry.topTopics = [...topicCounts]
          .map(([title, count]) => ({ title, count }))
          .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title, "ru"))
          .slice(0, TEACHER_STATS_TOP_TOPICS);

        // Lessons that already happened, by the displayed date (not by creation).
        entry.recentLessons = lessons
          .filter((row) => row.happenedAt <= now)
          .sort((left, right) => right.happenedAt - left.happenedAt || right.lesson.id.localeCompare(left.lesson.id))
          .slice(0, TEACHER_STATS_RECENT_LESSONS)
          .map(
            ({ lesson }): TeacherLessonEntry => ({
              id: lesson.id,
              title: lesson.title,
              topicTitle: q.topic(lesson.topicId)?.title ?? null,
              groupName: q.group(lesson.groupId)?.name ?? null,
              participantsCount: store.participants.by("lessonId", lesson.id).length,
              startsAt: lesson.startsAt,
              createdAt: lesson.createdAt,
              status: lesson.status,
            }),
          );
      }

      return { teachers: [...entries.values()], weekStarts: buckets.map((bucket) => bucket.start.toISOString()), unattributed };
    },

    async getStatisticsPlatform() {
      auth.requireDeveloper();
      return { overview: buildOverview(), homework: buildHomeworkStats(), content: buildContentStats() };
    },
  };
}
