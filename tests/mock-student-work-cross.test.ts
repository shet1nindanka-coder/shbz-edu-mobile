// `studentWork` on the mock store, part 3: one shared store (docs/spec/90-addendum-5.md A.6 rule 4).
// What a mocked check or a lesson submission writes must be what the OTHER members read — the student's
// study screens, the shell, the teacher's review and the lesson board — and what a teacher does (cancel a
// homework, finish a lesson early) must be what this member answers next.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { PhotoUpload } from "../src/api/types";
import { createTestMock } from "../src/mock/testing";

const ILYA = "usr_ilya";
const LIVE = "les_live";

async function rejects(promise: Promise<unknown>, code: AnyApiErrorCode, status: number): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError, `expected ApiError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return error;
  }
  throw new assert.AssertionError({ message: `expected a rejection with "${code}"` });
}

function photo(name = "IMG_0001.jpg"): PhotoUpload {
  return { uri: `file:///cache/${name}`, name, mimeType: "image/jpeg", size: 240_000 };
}

describe("studentWork and the other members share one store (A.6 rule 4)", () => {
  it("a finished homework check is what the study screens, the streak and the teacher's review show", async () => {
    const mock = createTestMock();
    const student = await mock.signIn("ilya@example.com");
    assert.equal(student.id, ILYA);
    const solvedBefore = (await mock.api.shell.getStreak()).streak.solvedToday;
    assert.equal((await mock.api.studentStudy.getNumberDetail("218")).number.status, null);

    // hw_ilya_today: one attached photo, numbers 218 and 220 — rule V gives the first unsolved one CORRECT.
    const { check } = await mock.api.studentWork.startHomeworkCheck("hw_ilya_today");
    mock.clock.advance(8000);
    const latest = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_today");
    assert.equal(latest.check?.status, "DONE");
    assert.equal(latest.solvedCount, 1);

    // The student's own screens.
    assert.equal((await mock.api.studentStudy.getNumberDetail("218")).number.status, "GREEN");
    const deadline = (await mock.api.studentStudy.getHomeworkDeadlines()).items.find((item) => item.id === "hw_ilya_today");
    assert.equal(deadline?.solvedCount, 1);
    assert.equal((await mock.api.shell.getStreak()).streak.solvedToday, solvedBefore + 1);
    assert.equal((await mock.api.shell.listNotifications()).notifications[0]?.type, "homework-checked");

    // The teacher's review: the same colour, the same check, the detached batch kept with the check.
    mock.signOut();
    await mock.signIn("teacher@example.com");
    const review = (await mock.api.teacherStudents.getStudentHomeworks(ILYA)).assignments.find((entry) => entry.id === "hw_ilya_today");
    assert.ok(review, "the teacher sees the homework");
    assert.deepEqual(
      review.numbers.map((number) => [number.number, number.status]),
      [["218", "GREEN"], ["220", null]],
    );
    assert.ok(JSON.stringify(review).includes(check.id), "the review carries the check the student started");
  });

  it("an uploaded photo is a stored file the owner and the teacher may read, and nobody else", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const { photos } = await mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_soon", [photo()]);
    const fileId = photos[0]!.fileId;
    const row = mock.store.files.get(fileId);
    assert.ok(row, "a StoredFile row exists under the returned fileId");
    assert.deepEqual([row.mimeType, row.size], ["image/jpeg", 240_000]);

    const readableBy = async (login: string) => {
      mock.signOut();
      const viewer = mock.store.users.get((await mock.signIn(login)).id);
      assert.ok(viewer);
      return mock.ctx.files.canRead(viewer, fileId);
    };
    assert.equal(await readableBy("ilya@example.com"), true);
    assert.equal(await readableBy("teacher@example.com"), true);
    assert.equal(await readableBy("maria@example.com"), false);
  });

  it("a homework the teacher cancels is gone for every method of the student (404 homeworkNotFound)", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    assert.equal((await mock.api.studentWork.getHomework("hw_ilya_open")).assignment.id, "hw_ilya_open");

    mock.signOut();
    await mock.signIn("teacher@example.com");
    await mock.api.teacherStudents.cancelHomework("hw_ilya_open");

    mock.signOut();
    await mock.signIn("ilya@example.com");
    await rejects(mock.api.studentWork.getHomework("hw_ilya_open"), "homeworkNotFound", 404);
    await rejects(mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open"), "homeworkNotFound", 404);
    await rejects(mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_open", [photo()]), "homeworkNotFound", 404);
    await rejects(mock.api.studentWork.startHomeworkCheck("hw_ilya_open"), "homeworkNotFound", 404);
    assert.equal((await mock.api.studentWork.listHomeworks()).assignments.some((entry) => entry.id === "hw_ilya_open"), false);
  });

  it("a lesson submission is what the teacher's board shows, and its result is the number's colour", async () => {
    const mock = createTestMock();
    await mock.signIn("polina@example.com");
    const lesson = (await mock.api.studentWork.getLiveLesson()).active;
    assert.equal(lesson?.lessonId, LIVE);
    const item = lesson.items.find((entry) => entry.canSubmit && entry.submission === null);
    assert.ok(item, "the fixture has an item nobody has handed in yet");

    mock.api.controls.set("nextCheckOutcome", { kind: "verdicts", verdicts: ["CORRECT"] });
    await mock.api.studentWork.submitLessonItem(LIVE, item.id, [photo()]);
    mock.clock.advance(8000);
    const state = await mock.api.studentWork.getLiveLessonState(LIVE);
    assert.equal(state.items.find((entry) => entry.id === item.id)?.result, "SOLVED");
    assert.equal((await mock.api.studentStudy.getNumberDetail(item.number)).number.status, "GREEN");

    mock.signOut();
    await mock.signIn("teacher@example.com");
    const board = await mock.api.planner.getLessonBoard(LIVE);
    const boardItem = board.participants.flatMap((participant) => participant.items).find((entry) => entry.id === item.id);
    assert.deepEqual([boardItem?.result, boardItem?.studentStatus, boardItem?.submission?.status], ["SOLVED", "GREEN", "DONE"]);
  });

  it("a lesson the teacher finishes early is over for the student: state FINISHED, no active lesson, no submit", async () => {
    const mock = createTestMock();
    await mock.signIn("polina@example.com");
    const lesson = (await mock.api.studentWork.getLiveLesson()).active;
    assert.equal(lesson?.lessonId, LIVE);
    const open = lesson.items.find((entry) => entry.canSubmit);
    assert.ok(open);

    mock.signOut();
    await mock.signIn("teacher@example.com");
    await mock.api.planner.finishLesson(LIVE);

    mock.signOut();
    await mock.signIn("polina@example.com");
    // The poll is how the open screen learns it; the tab then re-reads and finds nothing active.
    const state = await mock.api.studentWork.getLiveLessonState(LIVE);
    assert.equal(state.status, "FINISHED");
    assert.equal(state.items.every((entry) => entry.canSubmit === false), true);
    assert.equal((await mock.api.studentWork.getLiveLesson()).active, null);
    await rejects(mock.api.studentWork.submitLessonItem(LIVE, open.id, [photo()]), "lessonNotActive", 409);
    await rejects(mock.api.studentWork.joinLesson(LIVE), "lessonNotActive", 409);
  });
});
