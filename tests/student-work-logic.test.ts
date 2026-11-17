// Pure decisions of the student's homework and live-lesson screens (src/screens/student/work/logic.ts).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  GetHomeworkResponse,
  GetLessonResponse,
  HomeworkSummaryDto,
  LessonItemDto,
  LessonSubmissionDto,
  StudentCheckDto
} from "@/api/types";
import { POLLING } from "@/api/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { getMobileDictionary } from "@/i18n/mobile";
import {
  applyDeletedPhoto,
  applyLatestCheck,
  applyLessonState,
  applyStartedCheck,
  applySubmission,
  applyUploadedPhotos,
  buildHomeworkRows,
  buildLessonRows,
  countVerdicts,
  delayUntilLessonEdge,
  freePhotoSlots,
  hasRunningSubmission,
  homeworkDetailMeta,
  homeworkLabel,
  homeworkListMeta,
  homeworkNumbersA11yParts,
  isCheckRunning,
  isHomeworkCompleted,
  isPollBroken,
  lessonItemChip,
  lessonParts,
  nextPollDelay,
  recognizedAnswerOf,
  secondsUntil,
  shortenRecognizedAnswer,
  splitHomeworks,
} from "@/screens/student/work/logic";
import { serverClockOffset } from "@/domain/server-clock";

const ru = getDictionary("ru");
const en = getDictionary("en");

function hw(id: string, solvedCount: number, totalNumbers: number, extra: Partial<HomeworkSummaryDto> = {}): HomeworkSummaryDto {
  return {
    id,
    title: null,
    orderInTopic: 1,
    topicTitle: "Линейные уравнения",
    topicId: "topic",
    deadlineAt: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    totalNumbers,
    solvedCount,
    solvedPercent: totalNumbers ? Math.round((solvedCount / totalNumbers) * 100) : 0,
    photosCount: 0,
    attentionRank: 2,
    latestCheckStatus: null,
    numbers: [],
    ...extra
  };
}

describe("homework list", () => {
  it("a homework is completed only when it has numbers and all are solved", () => {
    assert.equal(isHomeworkCompleted({ totalNumbers: 2, solvedCount: 2 }), true);
    assert.equal(isHomeworkCompleted({ totalNumbers: 2, solvedCount: 1 }), false);
    assert.equal(isHomeworkCompleted({ totalNumbers: 0, solvedCount: 0 }), false);
  });

  it("splits active and archived keeping the server order", () => {
    const list = [hw("a", 0, 3), hw("b", 2, 2), hw("c", 1, 3), hw("d", 1, 1)];
    const { active, archived } = splitHomeworks(list);
    assert.deepEqual(active.map((item) => item.id), ["a", "c"]);
    assert.deepEqual(archived.map((item) => item.id), ["b", "d"]);
  });

  it("rows: active cards, then the collapsed archive", () => {
    const rows = buildHomeworkRows([hw("a", 0, 3), hw("b", 2, 2)], false);
    assert.deepEqual(rows.map((row) => row.kind), ["homework", "archiveToggle"]);
    assert.deepEqual(rows[1], { kind: "archiveToggle", key: "archive-toggle", count: 1, open: false });
  });

  it("rows: an open archive lists its cards after the toggle", () => {
    const rows = buildHomeworkRows([hw("a", 0, 3), hw("b", 2, 2), hw("c", 1, 1)], true);
    assert.deepEqual(rows.map((row) => row.key), ["a", "archive-toggle", "b", "c"]);
    assert.equal(rows[2].kind === "homework" && rows[2].archived, true);
  });

  it("rows: nothing active → the 'all done' line before the archive", () => {
    const rows = buildHomeworkRows([hw("b", 2, 2)], false);
    assert.deepEqual(rows.map((row) => row.kind), ["allDone", "archiveToggle"]);
  });

  it("rows: an empty list has no rows (the screen shows the empty state)", () => {
    assert.deepEqual(buildHomeworkRows([], true), []);
  });

  it("label: own title, else «ДЗ N»", () => {
    assert.equal(homeworkLabel({ title: null, orderInTopic: 2 }, ru.common.homeworkN), "ДЗ 2");
    assert.equal(homeworkLabel({ title: "", orderInTopic: 3 }, en.common.homeworkN), "Homework 3");
    assert.equal(homeworkLabel({ title: "Парабола", orderInTopic: 2 }, ru.common.homeworkN), "Парабола");
  });

  it("list meta: deadline, solved counter, photos only when attached", () => {
    const t = ru.student.submissions;
    assert.equal(homeworkListMeta({ solvedCount: 1, totalNumbers: 3, photosCount: 0 }, t, null), "Выполнено 1 из 3");
    assert.equal(
      homeworkListMeta({ solvedCount: 1, totalNumbers: 3, photosCount: 2 }, t, "20 ноября 2026 г."),
      "ДЗ до 20 ноября 2026 г. · Выполнено 1 из 3 · Фото: 2"
    );
    assert.equal(
      homeworkListMeta({ solvedCount: 0, totalNumbers: 2, photosCount: 1 }, en.student.submissions, "20 November 2026"),
      "Due 20 November 2026 · 0 of 2 done · Photos: 1"
    );
  });

  it("card name speaks every number's traffic light, grouped by status in the site's order (#234)", () => {
    const texts = (locale: "ru" | "en") => {
      const dict = locale === "ru" ? ru : en;
      const m = getMobileDictionary(locale).studentWork.list;
      return {
        group: m.numbersGroupA11y,
        numberLabel: dict.topics.widgets.numberLabel,
        unmarked: m.numbersUnmarkedA11y,
        statuses: { GREEN: dict.status.GREEN.label, YELLOW: dict.status.YELLOW.label, RED: dict.status.RED.label }
      };
    };
    const numbers = [
      { number: "118", status: "RED" as const },
      { number: "120", status: null },
      { number: "007", status: "GREEN" as const },
      { number: "124", status: null }
    ];
    assert.deepEqual(homeworkNumbersA11yParts(numbers, texts("ru")), [
      "Решен с первого раза: № 007",
      "Нужна помощь преподавателя: № 118",
      "Не отмечены: № 120, № 124"
    ]);
    assert.deepEqual(homeworkNumbersA11yParts([{ number: "5", status: "YELLOW" }], texts("en")), [
      `${en.status.YELLOW.label}: ${en.topics.widgets.numberLabel.replace("{number}", "5")}`
    ]);
    assert.deepEqual(homeworkNumbersA11yParts([], texts("ru")), []);
  });

  it("detail meta: «Дедлайн до … · Выполнено …»", () => {
    const t = ru.student.homework;
    assert.equal(homeworkDetailMeta({ solvedCount: 2, totalNumbers: 3 }, t, "20.11.2026, 23:59"), "Дедлайн до 20.11.2026, 23:59 · Выполнено 2 из 3");
    assert.equal(homeworkDetailMeta({ solvedCount: 2, totalNumbers: 3 }, t, null), "Выполнено 2 из 3");
  });
});

describe("check results", () => {
  it("counts verdicts", () => {
    assert.deepEqual(
      countVerdicts([{ verdict: "CORRECT" }, { verdict: "INCORRECT" }, { verdict: "CORRECT" }, { verdict: "UNCERTAIN" }]),
      { correct: 2, incorrect: 1, uncertain: 1 }
    );
    assert.deepEqual(countVerdicts([]), { correct: 0, incorrect: 0, uncertain: 0 });
  });

  it("running = PENDING or CHECKING", () => {
    assert.equal(isCheckRunning("PENDING"), true);
    assert.equal(isCheckRunning("CHECKING"), true);
    assert.equal(isCheckRunning("DONE"), false);
    assert.equal(isCheckRunning("FAILED"), false);
    assert.equal(isCheckRunning(null), false);
  });

  it("shortens a long list of answers to the first two and the last", () => {
    const answer = "x = 1; x = 2; x = 3; x = 4; x = 5; x = 6; x = 7; x = 8; x = 9; x = 10; x = 11; x = 12; x = 13";
    assert.ok(answer.length > 80);
    assert.equal(shortenRecognizedAnswer(answer), "x = 1; x = 2; …; x = 13");
  });

  it("keeps a short list and cuts any other long text at 137 characters", () => {
    assert.equal(shortenRecognizedAnswer("x = 1; x = 2; x = 3; x = 4; x = 5"), "x = 1; x = 2; x = 3; x = 4; x = 5");
    const long = `${"a".repeat(136)} ${"b".repeat(20)}`;
    const short = shortenRecognizedAnswer(long);
    assert.equal(short, `${"a".repeat(136)}…`);
    assert.equal(shortenRecognizedAnswer("x = 3"), "x = 3");
  });

  it("answer line: hidden for UNCERTAIN and for an empty answer", () => {
    assert.equal(recognizedAnswerOf({ verdict: "CORRECT", recognizedAnswer: " x = 3 " }), "x = 3");
    assert.equal(recognizedAnswerOf({ verdict: "UNCERTAIN", recognizedAnswer: "x = 3" }), null);
    assert.equal(recognizedAnswerOf({ verdict: "INCORRECT", recognizedAnswer: "  " }), null);
    assert.equal(recognizedAnswerOf({ verdict: "INCORRECT", recognizedAnswer: null }), null);
  });
});

describe("polling back-off (03 §5.2)", () => {
  const rule = POLLING.studentCheck;

  it("4 s after a success, then 8, 16, 32, 32", () => {
    assert.deepEqual([0, 1, 2, 3, 4].map((failures) => nextPollDelay(failures, rule)), [4000, 8000, 16000, 32000, 32000]);
  });

  it("gives up after five consecutive failures", () => {
    assert.equal(isPollBroken(4, rule), false);
    assert.equal(isPollBroken(5, rule), true);
  });
});

function detail(): GetHomeworkResponse {
  return {
    serverNow: "2026-11-16T10:00:00.000Z",
    limits: { maxPhotosPerAssignment: 10, noteMaxLength: 240 },
    notesEnabled: true,
    aiCheckAvailable: true,
    assignment: {
      ...hw("hw", 1, 3, { photosCount: 1, latestCheckStatus: null }),
      photos: [{ id: "p1", fileId: "f1", originalName: "IMG_1.jpg", mimeType: "image/jpeg", createdAt: "2026-11-16T09:00:00.000Z" }],
      latestCheck: null,
      numbers: [
        { homeworkNumberId: "n1", number: "118", conditionLatex: null, status: "RED", note: "" },
        { homeworkNumberId: "n2", number: "120", conditionLatex: null, status: null, note: "спросить" },
        { homeworkNumberId: "n3", number: "124", conditionLatex: null, status: "GREEN", note: "" }
      ]
    }
  };
}

const pendingCheck: StudentCheckDto = {
  id: "chk",
  status: "PENDING",
  errorCode: null,
  createdAt: "2026-11-16T10:00:01.000Z",
  checkedAt: null,
  results: []
};

describe("homework detail cache", () => {
  it("uploaded photos are appended once", () => {
    const created = { id: "p2", fileId: "f2", originalName: "IMG_2.jpg", mimeType: "image/jpeg", createdAt: "2026-11-16T10:00:00.000Z" };
    const next = applyUploadedPhotos(detail(), [created], 2);
    assert.deepEqual(next.assignment.photos.map((photo) => photo.id), ["p1", "p2"]);
    assert.equal(next.assignment.photosCount, 2);
    assert.equal(applyUploadedPhotos(next, [created], 2).assignment.photos.length, 2);
  });

  it("a deleted photo leaves the batch", () => {
    const next = applyDeletedPhoto(detail(), "p1", 0);
    assert.deepEqual(next.assignment.photos, []);
    assert.equal(next.assignment.photosCount, 0);
  });

  it("a started check becomes the latest one", () => {
    const next = applyStartedCheck(detail(), pendingCheck);
    assert.equal(next.assignment.latestCheck?.id, "chk");
    assert.equal(next.assignment.latestCheckStatus, "PENDING");
  });

  it("a finished poll replaces the check, the batch, the statuses and the counters; notes stay", () => {
    const done: StudentCheckDto = {
      ...pendingCheck,
      status: "DONE",
      checkedAt: "2026-11-16T10:00:09.000Z",
      results: [{ number: "118", homeworkNumberId: "n1", verdict: "CORRECT", recognizedAnswer: "x = 3", comment: "Верно." }]
    };
    const next = applyLatestCheck(detail(), {
      check: done,
      photos: [],
      numbers: [
        { homeworkNumberId: "n1", status: "YELLOW" },
        { homeworkNumberId: "n2", status: null },
        { homeworkNumberId: "n3", status: "GREEN" }
      ],
      solvedCount: 2
    });
    assert.equal(next.assignment.latestCheck?.status, "DONE");
    assert.equal(next.assignment.latestCheckStatus, "DONE");
    assert.deepEqual(next.assignment.photos, []);
    assert.equal(next.assignment.photosCount, 0);
    assert.deepEqual(next.assignment.numbers.map((number) => number.status), ["YELLOW", null, "GREEN"]);
    assert.equal(next.assignment.numbers[1].note, "спросить");
    assert.equal(next.assignment.solvedCount, 2);
    assert.equal(next.assignment.solvedPercent, 67);
  });

  it("a poll that knows no check clears the latest one", () => {
    const next = applyLatestCheck(applyStartedCheck(detail(), pendingCheck), {
      check: null,
      photos: detail().assignment.photos,
      numbers: [],
      solvedCount: 1
    });
    assert.equal(next.assignment.latestCheck, null);
    assert.equal(next.assignment.latestCheckStatus, null);
    assert.equal(next.assignment.photos.length, 1);
  });
});

function submission(itemId: string, extra: Partial<LessonSubmissionDto> = {}): LessonSubmissionDto {
  return {
    id: `sub-${itemId}`,
    itemId,
    status: "PENDING",
    verdict: null,
    comment: null,
    errorCode: null,
    submittedAt: "2026-11-16T10:05:00.000Z",
    checkedAt: null,
    ...extra
  };
}

function item(id: string, order: number, extra: Partial<LessonItemDto> = {}): LessonItemDto {
  return {
    id,
    order,
    isExtra: false,
    number: `40${order + 1}`,
    homeworkNumberId: `n-${id}`,
    topicId: "topic",
    topicTitle: "Системы уравнений",
    conditionLatex: null,
    result: null,
    submission: null,
    closed: false,
    canSubmit: true,
    ...extra
  };
}

function lesson(items: LessonItemDto[]): GetLessonResponse {
  return {
    serverNow: "2026-11-16T10:00:00.000Z",
    limits: { maxPhotosPerSubmission: 3 },
    lessonCheckAvailable: true,
    active: {
      lessonId: "les",
      title: "Индивидуальное · Системы уравнений",
      groupName: null,
      startsAt: "2026-11-16T10:00:00.000Z",
      durationMinutes: 30,
      endsAt: "2026-11-16T10:30:00.000Z",
      joinedAt: null,
      items
    },
    upcoming: null
  };
}

describe("live lesson", () => {
  it("parts: main and extra by order, closed counter, lock of the extra part", () => {
    const parts = lessonParts([
      item("e1", 3, { isExtra: true }),
      item("b", 1),
      item("a", 0, { closed: true, canSubmit: false, result: "SOLVED" }),
      item("c", 2)
    ]);
    assert.deepEqual(parts.main.map((entry) => entry.id), ["a", "b", "c"]);
    assert.deepEqual(parts.extra.map((entry) => entry.id), ["e1"]);
    assert.equal(parts.closedMain, 1);
    assert.equal(parts.remainingMain, 2);
    assert.equal(parts.extraUnlocked, false);
  });

  it("the extra part is unlocked when every main item is closed — also with no main items", () => {
    assert.equal(lessonParts([item("a", 0, { closed: true }), item("e", 1, { isExtra: true })]).extraUnlocked, true);
    assert.equal(lessonParts([item("e", 0, { isExtra: true })]).extraUnlocked, true);
  });

  it("rows: main section, then a locked extra part without its statements", () => {
    const rows = buildLessonRows(lessonParts([item("a", 0), item("b", 1), item("e", 2, { isExtra: true })]));
    assert.deepEqual(rows.map((row) => row.kind), ["section", "item", "item", "section", "extraLocked"]);
    assert.deepEqual(rows[4], { kind: "extraLocked", key: "extra-locked", remaining: 2 });
  });

  it("rows: an unlocked extra part is numbered from 1 again", () => {
    const rows = buildLessonRows(lessonParts([item("a", 0, { closed: true }), item("e1", 1, { isExtra: true }), item("e2", 2, { isExtra: true })]));
    const indices = rows.flatMap((row) => (row.kind === "item" ? [row.index] : []));
    assert.deepEqual(indices, [1, 1, 2]);
  });

  it("rows: no main items → the 'set is not ready' row; no extra section without extra items", () => {
    const rows = buildLessonRows(lessonParts([]));
    assert.deepEqual(rows.map((row) => row.kind), ["section", "noItems"]);
  });

  it("chip: the result wins, else the verdict of a finished latest submission", () => {
    assert.deepEqual(lessonItemChip({ result: "PARTIAL", submission: submission("a", { status: "DONE", verdict: "CORRECT" }) }), {
      kind: "result",
      result: "PARTIAL"
    });
    assert.deepEqual(lessonItemChip({ result: null, submission: submission("a", { status: "DONE", verdict: "UNCERTAIN" }) }), {
      kind: "verdict",
      verdict: "UNCERTAIN"
    });
    assert.equal(lessonItemChip({ result: null, submission: submission("a") }), null);
    assert.equal(lessonItemChip({ result: null, submission: submission("a", { status: "FAILED", errorCode: "timeout" }) }), null);
    assert.equal(lessonItemChip({ result: null, submission: null }), null);
  });

  it("something is running while any latest submission is PENDING or CHECKING", () => {
    assert.equal(hasRunningSubmission([item("a", 0), item("b", 1, { submission: submission("b", { status: "CHECKING" }) })]), true);
    assert.equal(hasRunningSubmission([item("a", 0, { submission: submission("a", { status: "DONE", verdict: "CORRECT" }) })]), false);
  });

  it("an accepted submission makes the item 'checking' and not submittable", () => {
    const next = applySubmission(lesson([item("a", 0), item("b", 1)]), submission("b"));
    assert.equal(next.active?.items[1].submission?.status, "PENDING");
    assert.equal(next.active?.items[1].canSubmit, false);
    assert.equal(next.active?.items[0].canSubmit, true);
  });

  it("a poll merges result, submission and flags; reports a changed result", () => {
    const before = applySubmission(lesson([item("a", 0), item("b", 1)]), submission("a"));
    const done = submission("a", { status: "DONE", verdict: "CORRECT", comment: "Верно.", checkedAt: "2026-11-16T10:05:08.000Z" });
    const merged = applyLessonState(before, {
      serverNow: "2026-11-16T10:05:09.000Z",
      status: "ACTIVE",
      items: [
        { id: "a", result: "SOLVED", submission: done, closed: true, canSubmit: false },
        { id: "b", result: null, submission: null, closed: false, canSubmit: true }
      ]
    });
    assert.equal(merged.changed, true);
    assert.equal(merged.resultChanged, true);
    assert.equal(merged.next.active?.items[0].result, "SOLVED");
    assert.equal(merged.next.active?.items[0].closed, true);
    assert.equal(merged.next.active?.items[0].submission?.comment, "Верно.");
    // Untouched items keep their identity, so their cards do not re-render.
    assert.equal(merged.next.active?.items[1], before.active?.items[1]);
  });

  it("a poll without differences returns the same object", () => {
    const before = applySubmission(lesson([item("a", 0)]), submission("a"));
    const merged = applyLessonState(before, {
      serverNow: "2026-11-16T10:05:02.000Z",
      status: "ACTIVE",
      items: [{ id: "a", result: null, submission: submission("a"), closed: false, canSubmit: false }]
    });
    assert.equal(merged.changed, false);
    assert.equal(merged.next, before);
  });

  it("a verdict without a result change (UNCERTAIN) is a change, but not a result change", () => {
    const before = applySubmission(lesson([item("a", 0)]), submission("a"));
    const merged = applyLessonState(before, {
      serverNow: "2026-11-16T10:05:09.000Z",
      status: "ACTIVE",
      items: [{ id: "a", result: null, submission: submission("a", { status: "DONE", verdict: "UNCERTAIN" }), closed: false, canSubmit: true }]
    });
    assert.equal(merged.changed, true);
    assert.equal(merged.resultChanged, false);
    assert.equal(merged.next.active?.items[0].canSubmit, true);
  });

  it("nothing is merged when no lesson is active", () => {
    const idle: GetLessonResponse = { ...lesson([]), active: null };
    assert.equal(applyLessonState(idle, { serverNow: "", status: "FINISHED", items: [] }).next, idle);
    assert.equal(applySubmission(idle, submission("a")), idle);
  });
});

describe("server clock and schedule edges (03 §5.3)", () => {
  const startsAt = "2026-11-16T10:00:00.000Z";
  const start = Date.parse(startsAt);

  it("offset = server time minus the device time at which the response arrived", () => {
    assert.equal(serverClockOffset("2026-11-16T10:00:00.000Z", Date.parse("2026-11-16T09:59:30.000Z")), 30_000);
    assert.equal(serverClockOffset("2026-11-16T10:00:00.000Z", Date.parse("2026-11-16T10:02:00.000Z")), -120_000);
    assert.equal(serverClockOffset("broken", 1000), 0);
    assert.equal(serverClockOffset("2026-11-16T10:00:00.000Z", 0), 0);
  });

  it("the re-read is due one second after the moment", () => {
    assert.equal(delayUntilLessonEdge(startsAt, start - 60_000), 61_000);
    assert.equal(delayUntilLessonEdge(startsAt, start), 1000);
    assert.equal(delayUntilLessonEdge(startsAt, start + 5000), 0);
  });

  it("no timer for a broken date or a moment beyond the timer limit", () => {
    assert.equal(delayUntilLessonEdge("broken", start), null);
    assert.equal(delayUntilLessonEdge(startsAt, start - 40 * 24 * 60 * 60 * 1000), null);
    assert.equal(delayUntilLessonEdge(startsAt, Number.NaN), null);
  });

  it("seconds until a moment never go negative", () => {
    assert.equal(secondsUntil(startsAt, start - 90_500), 91);
    assert.equal(secondsUntil(startsAt, start + 1), 0);
    assert.equal(secondsUntil("broken", start), 0);
  });
});

describe("photo slots", () => {
  it("free slots = max − attached − uploading, never negative", () => {
    assert.equal(freePhotoSlots(10, 3), 7);
    assert.equal(freePhotoSlots(10, 9, 1), 0);
    assert.equal(freePhotoSlots(10, 12), 0);
    assert.equal(freePhotoSlots(3, 0), 3);
  });
});
