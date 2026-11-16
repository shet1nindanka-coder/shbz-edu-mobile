// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PLAN_ERROR_PREFIX } from "../src/api/types";
import { auditSummaryFor, resolveAuditText } from "../src/domain/audit-text";
import { homeworkAttentionRank, sortHomeworksByAttention } from "../src/domain/homework-attention";
import { computeMirroredDeadlines } from "../src/domain/homework-deadline-mirror";
import { homeworkAssignmentLabel } from "../src/domain/homework-label";
import { DAY_MS } from "../src/domain/moscow-time";
import { renderNotificationText } from "../src/domain/notification-text";
import { planErrorText } from "../src/domain/plan-error";
import { getDictionary } from "../src/i18n/get-dictionary";
import { MOCK_FILE_SAMPLES, MOCK_PHOTO_SAMPLES, mockSampleUrl, parseMockSampleUrl } from "../src/mock/assets";
import { DEMO_PASSWORDS, MOCK_COVERAGE, buildFixtures } from "../src/mock/fixtures";
import { createQueries } from "../src/mock/rules";
import { createCore } from "../src/mock/rules/core";
import { createManualClock } from "../src/mock/clock";
import { MOCK_TABLE_NAMES, MockStore } from "../src/mock/store";
import { TEST_T0 } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function seeded(t0 = T0) {
  const store = new MockStore(buildFixtures(t0));
  const q = createQueries(createCore(store, createManualClock(t0), () => "ru"));
  return { store, q };
}

describe("mock fixtures: integrity", () => {
  it("is deterministic and loads without breaking a unique constraint", () => {
    assert.deepEqual(buildFixtures(T0), buildFixtures(T0));
    assert.doesNotThrow(() => new MockStore(buildFixtures(T0)));
    // A different anchor shifts every timestamp but keeps the shape.
    const later = buildFixtures(T0 + 5 * DAY_MS);
    for (const name of MOCK_TABLE_NAMES) assert.equal(later.tables[name].length, buildFixtures(T0).tables[name].length, name);
    assert.notEqual(later.tables.users[0]!.createdAt, buildFixtures(T0).tables.users[0]!.createdAt);
  });

  it("has the 14 demo accounts with the documented logins and passwords", () => {
    const { store } = seeded();
    assert.equal(store.users.size, 14);
    assert.equal(store.users.by("role", "TEACHER").length, 3);
    assert.equal(store.users.by("role", "STUDENT").length, 10);
    assert.equal(store.users.by("role", "DEVELOPER").length, 1);

    const logins: [string, string, string][] = [
      // The three accounts of the site's own seed, unchanged.
      ["teacher@example.com", DEMO_PASSWORDS.teacher, "Анна Петрова"],
      ["ilya@example.com", DEMO_PASSWORDS.student, "Илья Смирнов"],
      ["maria@example.com", DEMO_PASSWORDS.student, "Мария Волкова"],
      ["dev@example.com", DEMO_PASSWORDS.developer, "Разработчик ШБЗ"],
      ["teacher2@example.com", "teacher123", "Игорь Соколов"],
      ["teacher3@example.com", "teacher123", "Ольга Новикова"],
      ["lev@example.com", "student123", "Лев Без-Учителя"],
    ];
    for (const [login, password, name] of logins) {
      const user = store.users.findUnique("email", login);
      assert.ok(user, login);
      assert.equal(user.password, password);
      assert.equal(user.name, name);
    }
    // Logins are stored normalised (lower case) and staff / orphan accounts have no owner.
    for (const user of store.users.all()) {
      assert.equal(user.email, user.email.trim().toLowerCase());
      if (user.role !== "STUDENT") assert.equal(user.teacherId, null);
    }
  });

  it("has the documented totals", () => {
    const { store } = seeded();
    assert.equal(store.groups.size, 3);
    assert.equal(store.topics.size, 7);
    assert.equal(store.numbers.size, 79);
    assert.deepEqual(
      store.topics.all().sort((a, b) => a.displayOrder - b.displayOrder).map((topic) => store.numbers.by("topicId", topic.id).length),
      [8, 8, 6, 12, 5, 0, 40],
    );

    const lessons = store.lessons.filter((lesson) => lesson.kind === "LESSON");
    const drafts = store.lessons.filter((lesson) => lesson.kind === "HOMEWORK");
    assert.equal(lessons.filter((lesson) => lesson.teacherId === "usr_anna").length, 18);
    assert.deepEqual(lessons.filter((lesson) => lesson.teacherId !== "usr_anna").map((lesson) => lesson.id).sort(), ["les_dev_demo", "les_igor_1"]);
    assert.equal(drafts.length, 9);
    assert.ok(drafts.every((draft) => draft.teacherId === "usr_anna"));
    assert.equal(store.lessons.by("teacherId", "usr_olga").length, 0);
    assert.equal(store.profiles.by("groupId", "grp_8a").length, 4);
    assert.equal(store.homeworks.by("studentId", "usr_ilya").length, 9);
    assert.equal(store.parentCalls.by("studentId", "usr_polina").length, 23);
    assert.equal(store.auditLogs.size, 70);
  });

  it("resolves every reference (soft references are the documented exceptions)", () => {
    const { store } = seeded();
    const user = (id: string | null) => id === null || store.users.has(id);
    const check = (ok: boolean, what: string) => assert.ok(ok, what);

    for (const row of store.users.all()) check(row.teacherId === null || store.users.get(row.teacherId)?.role === "TEACHER", `owner of ${row.id}`);
    for (const row of store.profiles.all()) {
      check(store.users.get(row.userId)?.role === "STUDENT", `profile ${row.id}`);
      check(row.groupId === null || store.groups.has(row.groupId), `group of ${row.id}`);
      // A student is in a group of their own teacher.
      if (row.groupId) assert.equal(store.groups.get(row.groupId)!.teacherId, store.users.get(row.userId)!.teacherId);
    }
    for (const row of store.groups.all()) check(store.users.get(row.teacherId)?.role === "TEACHER", `teacher of ${row.id}`);
    for (const row of store.parentCalls.all()) check(store.users.get(row.studentId)?.role === "STUDENT" && user(row.teacherId), `call ${row.id}`);
    for (const row of store.files.all()) {
      check(user(row.uploadedById), `uploader of ${row.id}`);
      assert.ok((row.sample === null) !== (row.localUri === null), `storage of ${row.id}`);
      assert.ok(row.size > 0);
    }
    for (const row of store.topics.all()) {
      for (const fileId of [row.theoryFileId, row.homeworkFileId, row.answersFileId]) check(fileId === null || store.files.has(fileId), `file of ${row.id}`);
    }
    for (const row of store.numbers.all()) {
      check(store.topics.has(row.topicId), `topic of ${row.id}`);
      assert.match(row.number, /^\d+$/);
    }
    for (const row of store.statuses.all()) check(store.users.get(row.studentId)?.role === "STUDENT" && store.numbers.has(row.homeworkNumberId), `status ${row.id}`);
    for (const row of store.progressEvents.all()) check(store.users.has(row.studentId) && store.numbers.has(row.homeworkNumberId) && user(row.actorId), `event ${row.id}`);
    for (const row of store.homeworks.all()) check(store.users.get(row.studentId)?.role === "STUDENT" && store.topics.has(row.topicId), `homework ${row.id}`);
    for (const row of store.homeworkNumbers.all()) {
      const assignment = store.homeworks.get(row.assignmentId);
      const number = store.numbers.get(row.homeworkNumberId);
      check(assignment !== undefined && number !== undefined && number.topicId === assignment.topicId, `link ${row.id}`);
    }
    for (const row of store.homeworkPhotos.all()) check(store.homeworks.has(row.assignmentId) && store.files.has(row.fileId), `photo ${row.id}`);
    for (const row of store.homeworkChecks.all()) check(store.homeworks.has(row.assignmentId), `check ${row.id}`);
    for (const row of store.homeworkCheckPhotos.all()) check(store.homeworkChecks.has(row.checkId) && store.files.has(row.fileId), `check photo ${row.id}`);
    for (const row of store.homeworkCheckResults.all()) {
      const assignmentId = store.homeworkChecks.get(row.checkId)?.assignmentId;
      check(assignmentId !== undefined && store.homeworkNumbers.findUnique("assignmentNumber", `${assignmentId}|${row.homeworkNumberId}`) !== undefined, `result ${row.id}`);
    }
    for (const row of store.lessons.all()) {
      check(user(row.teacherId) && (row.groupId === null || store.groups.has(row.groupId)) && (row.topicId === null || store.topics.has(row.topicId)), `lesson ${row.id}`);
      if (row.kind === "HOMEWORK") check(row.topicId !== null && row.deadlineAt !== null && row.startsAt === null, `draft ${row.id}`);
    }
    for (const row of store.participants.all()) check(store.lessons.has(row.lessonId) && store.users.get(row.studentId)?.role === "STUDENT", `participant ${row.id}`);
    for (const row of store.lessonItems.all()) check(store.participants.has(row.participantId) && store.numbers.has(row.homeworkNumberId), `item ${row.id}`);
    for (const row of store.submissions.all()) check(store.lessonItems.has(row.itemId), `submission ${row.id}`);
    for (const row of store.submissionPhotos.all()) check(store.submissions.has(row.submissionId) && store.files.has(row.fileId), `submission photo ${row.id}`);
    for (const row of store.notifications.all()) check(store.users.has(row.userId), `notification ${row.id}`);
    for (const row of store.rowScripts.all()) check(store.homeworkChecks.has(row.id) || store.submissions.has(row.id), `row script ${row.id}`);
    for (const row of store.planScripts.all()) check(store.participants.has(row.id), `plan script ${row.id}`);
    for (const row of store.jobs.all()) {
      check(store.homeworkChecks.has(row.refId) || store.submissions.has(row.refId) || store.participants.has(row.refId), `job ${row.id}`);
      assert.equal(row.state, "waiting");
      assert.equal(row.dueAt, null);
    }

    // The only stamped participant whose assignment is gone is the stale-stamp fixture.
    const stale = store.participants.filter((row) => row.issuedAssignmentId !== null && !store.homeworks.has(row.issuedAssignmentId));
    assert.deepEqual(stale.map((row) => row.id), ["lp_hp_issued_polina"]);
    // Every solution photo file is referenced by exactly the row it was made for; nothing is orphaned.
    for (const file of store.files.filter((row) => row.uploadedById !== "usr_dev")) {
      const references =
        store.homeworkPhotos.by("fileId", file.id).length + store.homeworkCheckPhotos.by("fileId", file.id).length + store.submissionPhotos.by("fileId", file.id).length;
      assert.ok(references >= 1, `orphan photo ${file.id}`);
      assert.ok(file.mimeType === "image/png" || file.mimeType === "image/jpeg");
    }
  });

  it("gives every fixture file a bundled sample of the right kind", () => {
    const { store } = seeded();
    const photos: readonly string[] = MOCK_PHOTO_SAMPLES;
    for (const file of store.files.all()) {
      assert.ok(file.sample !== null && (MOCK_FILE_SAMPLES as readonly string[]).includes(file.sample), `sample of ${file.id}`);
      if (file.mimeType === "application/pdf") assert.ok(file.sample === "pdfLong" || file.sample === "pdfShort", file.id);
      else if (file.mimeType.startsWith("image/")) assert.ok(file.sample === "cheatsheet" || photos.includes(file.sample), file.id);
      else assert.equal(file.sample, "docx", file.id);
    }
    // The 12-page PDF is the long sample; every solution photo is one of the eight pictures, all of them used.
    assert.equal(store.files.get("file_quadratic_theory")!.sample, "pdfLong");
    const usedPhotos = new Set(store.files.filter((file) => file.uploadedById !== "usr_dev").map((file) => file.sample));
    assert.deepEqual([...usedPhotos].sort(), [...MOCK_PHOTO_SAMPLES]);
    // The declared metadata keeps the variety the screens must handle (JPEG and PNG, a DOCX, a big PDF).
    const attached = store.homeworkPhotos.by("assignmentId", "hw_ilya_open").map((photo) => store.files.get(photo.fileId)!);
    assert.deepEqual(attached.map((file) => [file.originalName, file.mimeType]), [["IMG_2041.jpg", "image/jpeg"], ["IMG_2042.jpg", "image/jpeg"], ["решение-305.png", "image/png"]]);

    const url = mockSampleUrl("pdfLong", { lessonId: "les_live", studentId: undefined, answers: "1" });
    assert.equal(url, "mock-sample://pdfLong?lessonId=les_live&answers=1");
    assert.deepEqual(parseMockSampleUrl(url), { sample: "pdfLong", query: { lessonId: "les_live", answers: "1" } });
    assert.deepEqual(parseMockSampleUrl("mock-sample://photo3"), { sample: "photo3", query: {} });
    assert.equal(parseMockSampleUrl("mock-sample://unknown"), null);
    assert.equal(parseMockSampleUrl("https://example.com/a.pdf"), null);
  });

  it("stores valid instants, none of them created in the future", () => {
    const { store } = seeded();
    const snapshot = store.snapshot();
    const createdFields = ["createdAt", "updatedAt", "uploadedAt", "calledAt", "submittedAt", "checkedAt", "statusChangedAt", "readAt", "joinedAt", "issuedAt", "planGeneratedAt"];
    for (const name of MOCK_TABLE_NAMES) {
      for (const row of snapshot.tables[name] as unknown as Record<string, unknown>[]) {
        for (const field of createdFields) {
          const value = row[field];
          if (typeof value !== "string") continue;
          assert.match(value, ISO, `${name}.${field}`);
          assert.ok(Date.parse(value) <= T0, `${name}.${String(row.id)}.${field} is in the future`);
        }
        for (const field of ["deadlineAt", "startsAt", "finishedAt", "expiresAt"]) {
          const value = row[field];
          if (typeof value === "string") assert.match(value, ISO, `${name}.${field}`);
        }
      }
    }
  });

  it("keeps the status rows consistent with the homeworks", () => {
    const { store } = seeded();
    for (const row of store.statuses.all()) {
      // A coloured row always knows when the colour was set.
      if (row.status !== null) assert.ok(row.statusChangedAt, `statusChangedAt of ${row.id}`);
    }
    // Issuing a homework creates a status row for each of its numbers, and the row mirrors the nearest deadline.
    for (const student of store.users.by("role", "STUDENT")) {
      const assignments = store.homeworks.by("studentId", student.id);
      const facts = assignments.map((assignment) => ({
        deadlineAt: assignment.deadlineAt ? new Date(assignment.deadlineAt) : null,
        numbers: store.homeworkNumbers.by("assignmentId", assignment.id),
      }));
      const assigned = Array.from(new Set(facts.flatMap((fact) => fact.numbers.map((link) => link.homeworkNumberId))));
      const mirrored = computeMirroredDeadlines(assigned, facts);
      for (const numberId of assigned) {
        const row = store.statuses.findUnique("studentNumber", `${student.id}|${numberId}`);
        assert.ok(row, `status row of ${student.id} / ${numberId}`);
        assert.equal(row.deadlineAt, mirrored.get(numberId)?.toISOString() ?? null);
      }
      for (const row of store.statuses.by("studentId", student.id)) {
        if (!assigned.includes(row.homeworkNumberId)) assert.equal(row.deadlineAt, null, `deadline without a homework: ${row.id}`);
      }
    }
  });

  it("keeps checks, submissions and sets well-formed", () => {
    const { store } = seeded();
    for (const check of store.homeworkChecks.all()) {
      const active = check.status === "PENDING" || check.status === "CHECKING";
      assert.equal(check.activeSlot, active ? 1 : null, check.id);
      assert.equal(check.checkedAt === null, active, check.id);
      if (check.status === "FAILED") assert.ok(check.error, check.id);
      if (check.status !== "DONE") assert.equal(store.homeworkCheckResults.by("checkId", check.id).length, 0);
    }
    for (const submission of store.submissions.all()) {
      const active = submission.status === "PENDING" || submission.status === "CHECKING";
      assert.equal(submission.activeSlot, active ? 1 : null, submission.id);
      assert.equal(submission.verdict !== null, submission.status === "DONE", submission.id);
      const photos = store.submissionPhotos.by("submissionId", submission.id).length;
      assert.ok(photos >= 1 && photos <= 3, submission.id);
    }
    for (const participant of store.participants.all()) {
      const lesson = store.lessons.get(participant.lessonId)!;
      const items = store.lessonItems.by("participantId", participant.id).sort((a, b) => a.order - b.order);
      // order = 0..n-1, main part first, then the extra part.
      assert.deepEqual(items.map((item) => item.order), items.map((_, index) => index), participant.id);
      const firstExtra = items.findIndex((item) => item.isExtra);
      if (firstExtra !== -1) assert.ok(items.slice(firstExtra).every((item) => item.isExtra), participant.id);
      if (lesson.kind === "HOMEWORK") {
        assert.ok(items.every((item) => !item.isExtra && item.result === null), participant.id);
        assert.ok(items.every((item) => store.numbers.get(item.homeworkNumberId)!.topicId === lesson.topicId), participant.id);
        assert.equal(participant.attendance, "UNKNOWN");
      }
      // A set exists only for a ready plan.
      if (participant.planGeneratedAt === null) assert.equal(items.length, 0, participant.id);
      if (participant.planError !== null) assert.equal(participant.planGeneratedAt, null, participant.id);
    }
    // A finalised lesson has no unmarked item and no UNKNOWN attendance.
    for (const lesson of store.lessons.filter((row) => row.kind === "LESSON" && row.status === "FINISHED")) {
      for (const participant of store.participants.by("lessonId", lesson.id)) {
        assert.notEqual(participant.attendance, "UNKNOWN", participant.id);
        assert.ok(store.lessonItems.by("participantId", participant.id).every((item) => item.result !== null), participant.id);
      }
    }
  });
});

describe("mock fixtures: personas", () => {
  it("orders Илья's nine homeworks by attention and labels the untitled ones «ДЗ N»", () => {
    const { store, q } = seeded();
    const statuses = q.statusMap("usr_ilya");
    const views = q.homeworksOfStudent("usr_ilya").map((assignment) => {
      const latest = q.latestHomeworkCheck(assignment.id);
      return {
        id: assignment.id,
        createdAt: assignment.createdAt,
        deadlineAt: assignment.deadlineAt,
        numbers: q.homeworkNumbers(assignment.id).map((number) => ({ status: statuses.get(number.id) ?? null })),
        latestCheck: latest ? { status: latest.status, results: q.checkResults(latest.id) } : null,
        label: homeworkAssignmentLabel({ title: assignment.title, orderInTopic: q.homeworkOrderInTopic(assignment) }, "ru"),
      };
    });
    const rank = Object.fromEntries(views.map((view) => [view.id, homeworkAttentionRank(view, T0)]));
    assert.deepEqual(rank, {
      hw_ilya_done: 5,
      hw_ilya_overdue: 0,
      hw_ilya_uncertain: 1,
      hw_ilya_failed: 2,
      hw_ilya_open: 2,
      hw_ilya_soon: 3,
      hw_ilya_later: 4,
      hw_ilya_today: 2,
      hw_ilya_far: 2,
    });
    assert.deepEqual(sortHomeworksByAttention(views, T0).map((view) => view.id), [
      "hw_ilya_overdue",
      "hw_ilya_uncertain",
      "hw_ilya_today",
      "hw_ilya_open",
      "hw_ilya_failed",
      "hw_ilya_far",
      "hw_ilya_soon",
      "hw_ilya_later",
      "hw_ilya_done",
    ]);

    const label = Object.fromEntries(views.map((view) => [view.id, view.label]));
    assert.equal(label.hw_ilya_overdue, "ДЗ 2");
    assert.equal(label.hw_ilya_soon, "ДЗ 3");
    assert.equal(label.hw_ilya_later, "ДЗ 2");
    assert.equal(label.hw_ilya_open, "ДЗ 1");
    assert.equal(label.hw_ilya_today, "ДЗ 2");
    assert.equal(label.hw_ilya_far, "ДЗ 1");
    assert.equal(label.hw_ilya_done, "Повторение перед контрольной");
    assert.equal(store.homeworkNumbers.by("assignmentId", "hw_ilya_far").length, 12);
  });

  it("gives the group students their strong / average / weak profiles", () => {
    const { store } = seeded();
    const share = (studentId: string) => {
      const marked = store.statuses.by("studentId", studentId).filter((row) => row.status !== null);
      return marked.filter((row) => row.status === "GREEN").length / marked.length;
    };
    assert.ok(share("usr_artem") >= 0.8 && share("usr_artem") <= 0.9, `Артём ${share("usr_artem")}`);
    assert.ok(share("usr_polina") >= 0.5 && share("usr_polina") <= 0.65, `Полина ${share("usr_polina")}`);
    assert.ok(share("usr_kirill") >= 0.3 && share("usr_kirill") <= 0.4, `Кирилл ${share("usr_kirill")}`);

    // Кирилл: nothing changed for nine days, at least five reds in the last month (group statistics flags).
    const kirill = store.statuses.by("studentId", "usr_kirill").filter((row) => row.status !== null);
    const last = Math.max(...kirill.map((row) => Date.parse(row.statusChangedAt!)));
    assert.equal(Math.floor((T0 - last) / DAY_MS), 8);
    assert.ok(kirill.filter((row) => row.status === "RED" && T0 - Date.parse(row.statusChangedAt!) < 30 * DAY_MS).length >= 5);
    // Артём changed something today; Даша has three coloured rows; Тимур has none.
    assert.ok(store.statuses.by("studentId", "usr_artem").some((row) => row.statusChangedAt !== null && T0 - Date.parse(row.statusChangedAt) < 60 * 60_000));
    assert.equal(store.statuses.by("studentId", "usr_dasha").filter((row) => row.status !== null).length, 3);
    assert.equal(store.statuses.by("studentId", "usr_timur").length, 0);
  });

  it("stores a consistent 25-event history for (Илья, 118)", () => {
    const { store } = seeded();
    const events = store.progressEvents.by("studentNumber", "usr_ilya|num_118").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    assert.equal(events.length, 25);
    let status: string | null = null;
    for (const event of events) {
      assert.equal(event.previousStatus, status, `previous of ${event.id}`);
      const wrote = event.decision === "changed" || event.decision === "reaffirmed";
      // An event that does not write leaves the status as it was.
      if (!wrote) assert.equal(event.status, event.previousStatus, event.id);
      else assert.equal(event.status, event.requestedStatus, event.id);
      status = event.status;
    }
    const row = store.statuses.findUnique("studentNumber", "usr_ilya|num_118")!;
    assert.equal(row.status, status);
    assert.equal(row.status, "RED");
    assert.equal(row.statusChangedAt, events[events.length - 1]!.createdAt);
  });

  it("renders stored notifications and journal rows in both languages", () => {
    const { store } = seeded();
    for (const row of store.notifications.filter((notification) => notification.params !== null)) {
      const ru = renderNotificationText(row.type, row.params, "ru");
      assert.ok(ru, row.id);
      // The stored snapshot is the Russian rendering of type + params.
      assert.equal(row.title, ru.title, row.id);
      assert.equal(row.body, ru.body, row.id);
      const en = renderNotificationText(row.type, row.params, "en");
      assert.ok(en && !/[а-яё]{4,}/i.test(en.title.replace(/«[^»]*»|“[^”]*”/g, "")), row.id);
    }

    const byCategory = { AI: 0, DATA: 0, AUTH: 0 };
    let legacy = 0;
    for (const row of store.auditLogs.all()) {
      byCategory[row.category] += 1;
      const text = resolveAuditText(row.meta);
      if (!text) {
        legacy += 1;
        assert.ok(row.summary, row.id);
        continue;
      }
      assert.equal(row.summary, auditSummaryFor(row, "ru"), row.id);
      assert.ok(auditSummaryFor(row, "en"), row.id);
      assert.ok(!String(auditSummaryFor(row, "en")).includes("{"), row.id);
    }
    assert.deepEqual(byCategory, { AI: 25, DATA: 20, AUTH: 25 });
    assert.equal(legacy, 3);
    assert.equal(store.auditLogs.filter((row) => row.outcome === "failed" && T0 - Date.parse(row.createdAt) <= DAY_MS).length, 4);
  });

  it("stores plan errors that the ported `planErrorText` understands", () => {
    const { store } = seeded();
    const texts = getDictionary("ru").planner.planErrors;
    for (const participant of store.participants.filter((row) => row.planError !== null)) {
      const text = planErrorText(participant.planError!, texts);
      assert.ok(Object.values(texts).includes(text), `${participant.id}: ${participant.planError}`);
    }
    // One participant carries the frozen legacy sentence instead of a code.
    assert.equal(store.participants.filter((row) => row.planError !== null && !row.planError.startsWith(PLAN_ERROR_PREFIX)).length, 1);
  });
});

describe("mock fixtures: coverage checklist (09 §2.13 + 90-addendum-6 §10)", () => {
  const fixtureRows = MOCK_COVERAGE.filter((row) => row.kind === "fixture");

  it("describes every row completely", () => {
    const keys = new Set<string>();
    for (const row of MOCK_COVERAGE) {
      assert.ok(!keys.has(row.key), `duplicate key ${row.key}`);
      keys.add(row.key);
      assert.ok(row.requiredBy.length > 0, row.key);
      if (row.kind === "fixture") assert.equal(typeof row.check, "function", row.key);
      if (row.kind === "script") assert.ok(row.steps && row.steps.length > 0, row.key);
      if (row.kind === "control") assert.ok(row.control, row.key);
    }
    assert.ok(fixtureRows.length >= 30);
  });

  it("names fixture rows that exist", () => {
    const { store } = seeded();
    const exists = (id: string) =>
      MOCK_TABLE_NAMES.some((name) => store.table(name).has(id)) ||
      // The pinned pseudo-login is a limiter bucket, not a user.
      store.controls.limiterPins.some((pin) => pin.identifier.endsWith(id));
    for (const row of MOCK_COVERAGE) {
      for (const id of row.fixtureIds) assert.ok(exists(id), `${row.key}: ${id}`);
    }
  });

  for (const row of fixtureRows) {
    it(`fixture: ${row.key}`, () => {
      const { store } = seeded();
      assert.equal(row.check!(store, T0), true);
    });
  }

  it("holds whatever the time of day of the seed is", () => {
    // Just after midnight, late evening, a month boundary, the last minute of a year (all Moscow time).
    for (const iso of ["2026-11-15T21:05:00.000Z", "2026-11-16T20:30:00.000Z", "2026-02-28T21:30:00.000Z", "2026-12-31T20:59:00.000Z"]) {
      const t0 = Date.parse(iso);
      const { store } = seeded(t0);
      const failed = fixtureRows.filter((row) => !row.check!(store, t0)).map((row) => row.key);
      assert.deepEqual(failed, [], iso);
    }
  });
});
