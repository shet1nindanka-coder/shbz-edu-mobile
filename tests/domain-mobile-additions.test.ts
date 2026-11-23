// Tests for what the app adds on top of the 1:1 ports: the timeline / streak built from status rows in
// Moscow days, status meta as semantic keys, check-error codes, runtime-tolerant password generation and
// the Moscow-time deadline inside notification texts.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as domain from "@/domain";
import { estimateModelCostRub, resolveModelPrice } from "@/domain/ai-pricing";
import {
  AssignmentReason,
  AttendanceStatus,
  AuditCategory,
  HomeworkNumberStatus,
  LessonItemResult,
  LessonKind,
  LessonStatus,
  ParentCallOutcome,
  SolutionCheckStatus,
  SolutionVerdict,
  Subject,
  UserRole
} from "@/domain/enums";
import { allowedPhotoExtensions, allowedPhotoMimeTypes, allowedUploadExtensions, allowedUploadMimeTypes } from "@/domain/files";
import { renderNotificationText } from "@/domain/notification-text";
import { MAX_NUMBERS_PER_INPUT, parseNumbersInput } from "@/domain/numbers";
import { PARENT_CALL_HISTORY_LIMIT, resolveParentCallReminder } from "@/domain/parent-call-state";
import { generatePasswordFromName, generateReadablePassword } from "@/domain/password-generate";
import { validatePasswordStrength } from "@/domain/password-policy";
import { MAX_TIMELINE_DAYS, buildProgressTimelineEntries } from "@/domain/progress-timeline";
import { decideProgressChange } from "@/domain/progress-policy";
import {
  checkErrorText,
  classifySolutionCheckError,
  humanizeSolutionCheckError
} from "@/domain/solution-check-error-text";
import {
  HOMEWORK_STATUS_ORDER,
  LESSON_RESULT_ORDER,
  homeworkStatusLabel,
  homeworkStatusMeta,
  isSolvedStatus,
  lessonResultMeta,
  statusTone
} from "@/domain/statuses";
import { STREAK_WINDOW_DAYS, computeStudentStreak } from "@/domain/student-streak";
import { getDictionary } from "@/i18n/get-dictionary";

declare const process: { env: Record<string, string | undefined> };

const DEVICE_ZONES = ["UTC", "Asia/Vladivostok", "America/Los_Angeles", "Europe/Moscow"];

function inEveryZone(body: (zone: string) => void) {
  const original = process.env.TZ;

  try {
    for (const zone of DEVICE_ZONES) {
      process.env.TZ = zone;
      body(zone);
    }
  } finally {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  }
}

describe("enums: literal values of prisma/schema.prisma", () => {
  it("every value object maps a key to the identical string", () => {
    const enums = {
      UserRole, HomeworkNumberStatus, Subject, LessonStatus, AttendanceStatus, LessonKind, AssignmentReason,
      LessonItemResult, ParentCallOutcome, SolutionCheckStatus, SolutionVerdict, AuditCategory
    };

    for (const [name, values] of Object.entries(enums)) {
      for (const [key, value] of Object.entries(values)) {
        assert.equal(value, key, `${name}.${key}`);
      }
    }

    assert.deepEqual(Object.keys(UserRole), ["TEACHER", "STUDENT", "DEVELOPER"]);
    assert.deepEqual(Object.keys(HomeworkNumberStatus), ["GREEN", "YELLOW", "RED"]);
    assert.deepEqual(Object.keys(Subject), ["MATH", "INFORMATICS"]);
    assert.deepEqual(Object.keys(LessonStatus), ["PLANNED", "ACTIVE", "FINISHED"]);
    assert.deepEqual(Object.keys(AttendanceStatus), ["UNKNOWN", "PRESENT", "LATE", "ABSENT", "EXCUSED"]);
    assert.deepEqual(Object.keys(LessonKind), ["LESSON", "HOMEWORK"]);
    assert.deepEqual(Object.keys(AssignmentReason), ["NEW", "REVIEW", "GAP", "DIAGNOSTIC"]);
    assert.deepEqual(Object.keys(LessonItemResult), ["SOLVED", "PARTIAL", "NOT_SOLVED", "SKIPPED"]);
    assert.deepEqual(Object.keys(ParentCallOutcome), ["REACHED", "NO_ANSWER"]);
    assert.deepEqual(Object.keys(SolutionCheckStatus), ["PENDING", "CHECKING", "DONE", "FAILED"]);
    assert.deepEqual(Object.keys(SolutionVerdict), ["CORRECT", "INCORRECT", "UNCERTAIN"]);
    assert.deepEqual(Object.keys(AuditCategory), ["AI", "DATA", "AUTH"]);
  });
});

describe("domain barrel", () => {
  it("re-exports the helpers of every module under one entry", () => {
    for (const name of [
      "normalizeHomeworkNumber", "compareHomeworkNumbers", "parseNumbersInput", "findHomeworkNumberTwins",
      "homeworkStatusMeta", "getStatusCounts", "completionPercent", "isHomeworkOverdue",
      "homeworkAttentionRank", "sortHomeworksByAttention", "homeworkAssignmentLabel",
      "deriveLessonStatus", "isLessonItemClosed", "isExtraPartUnlocked", "canSubmitLessonItem",
      "computeIdleLevel", "computeSpentMinutes", "decideAutoLessonResult", "decideEndOfLessonResult",
      "nextAttendance", "summarizeAttendance", "decideEndOfLessonAttendance", "formatAttendanceSummary",
      "resolveParentCallReminder", "shouldCreateParentCallNotification", "calendarDaysBetween",
      "decideProgressChange", "getStatusForAiVerdict", "isStatusDowngrade", "toStudentFacingResult",
      "planErrorText", "planErrorValue", "humanizeSolutionCheckError", "buildStudentStreak",
      "groupStudentDeadlinesAsAssignments", "mapStudentHomeworksToDeadlineItems",
      "academicYearStart", "reportPeriodStart", "parseReportPeriod",
      "mondayOf", "buildWeekBuckets", "countByWeek", "getDayOfWeekIndex",
      "validatePasswordStrength", "passwordProblemText",
      "splitLineIntoItems", "splitMathIntoItems", "mergeSoftWrappedLines", "MATH_LINE_BREAKS_SCRIPT",
      "formatDate", "formatShortDate", "formatDateTime", "formatFileSize",
      "getFileExtension", "getMimeTypeFromExtension", "isPdfMime", "isImageMime", "isOfficeMime",
      "validateUploadMetadata", "parseTopicImport", "buildImportPlan", "normalizePlanParams",
      "normalizeHomeworkParams", "renderNotificationText", "auditSummaryFor", "mskDayKey", "formatMsk"
    ]) {
      assert.ok(name in domain, `@/domain is missing "${name}"`);
    }

    assert.equal(domain.LESSON_SUBMISSION_MAX_PHOTOS, 3);
    assert.equal(domain.PARENT_CALL_DUE_DAYS, 30);
    assert.equal(domain.PARENT_CALL_OVERDUE_DAYS, 45);
    assert.equal(domain.MAX_UPLOAD_SIZE_BYTES, 15 * 1024 * 1024);
    assert.equal(domain.MAX_ORIGINAL_FILE_NAME_LENGTH, 255);
    assert.equal(domain.MAX_USER_NAME_LENGTH, 120);
    assert.equal(domain.MAX_LOGIN_LENGTH, 254);
    assert.equal(domain.MAX_PASSWORD_LENGTH, 256);
    assert.equal(domain.MAX_GROUP_SIZE, 30);
    assert.equal(domain.MAX_PLAN_ITEMS, 40);
    assert.equal(domain.MAX_TITLE_LENGTH, 200);
    assert.equal(domain.MAX_TEACHER_NOTE_LENGTH, 500);
    assert.deepEqual(
      [domain.MIN_DURATION_MINUTES, domain.MAX_DURATION_MINUTES, domain.MIN_SPEED, domain.MAX_SPEED],
      [15, 240, 1, 10]
    );
    assert.deepEqual(
      [domain.MIN_DAILY_MINUTES, domain.MAX_DAILY_MINUTES, domain.DEFAULT_DAILY_MINUTES, domain.MAX_HOMEWORK_DAYS],
      [15, 240, 60, 60]
    );
  });
});

describe("limits exposed next to the ports", () => {
  it("numbers, uploads, photos and call history", () => {
    assert.equal(MAX_NUMBERS_PER_INPUT, 2000);
    assert.equal(parseNumbersInput("1-5000").length, 0); // a range spanning ≥ 2000 is a typo — skipped
    assert.equal(parseNumbersInput("1-1999").length, 1999);
    assert.equal(parseNumbersInput("1-1999 3000-3999").length, 2000);
    assert.equal(PARENT_CALL_HISTORY_LIMIT, 20);
    assert.deepEqual(allowedUploadExtensions, [".pdf", ".docx", ".png", ".jpg", ".jpeg"]);
    assert.deepEqual(allowedPhotoExtensions, [".png", ".jpg", ".jpeg"]);
    assert.deepEqual([...allowedPhotoMimeTypes], ["image/png", "image/jpeg"]);
    assert.equal(allowedUploadMimeTypes.has("application/octet-stream"), true);
    assert.equal(allowedUploadMimeTypes.has("image/gif"), false);
  });
});

describe("statuses: semantic meta and labels", () => {
  it("exposes palette keys and ranks, never colours", () => {
    assert.deepEqual(HOMEWORK_STATUS_ORDER, ["GREEN", "YELLOW", "RED"]);
    assert.deepEqual(homeworkStatusMeta.GREEN, { tone: "GREEN", isSolved: true, rank: 3 });
    assert.deepEqual(homeworkStatusMeta.YELLOW, { tone: "YELLOW", isSolved: true, rank: 2 });
    assert.deepEqual(homeworkStatusMeta.RED, { tone: "RED", isSolved: false, rank: 1 });
    assert.doesNotMatch(JSON.stringify({ homeworkStatusMeta, lessonResultMeta }), /#[0-9a-f]{3,8}\b|rgba?\(/i);
    assert.equal(statusTone("YELLOW"), "YELLOW");
    assert.equal(statusTone(null), "none");
    assert.equal(statusTone(undefined), "none");
    assert.equal(isSolvedStatus("GREEN"), true);
    assert.equal(isSolvedStatus("YELLOW"), true);
    assert.equal(isSolvedStatus("RED"), false);
    assert.equal(isSolvedStatus(null), false);
  });

  it("takes labels from the dictionary in the interface language", () => {
    const ru = getDictionary("ru");
    const en = getDictionary("en");

    assert.equal(homeworkStatusLabel("GREEN", ru), "Решен с первого раза");
    assert.equal(homeworkStatusLabel("RED", en), "Needs the teacher's help");
    assert.equal(homeworkStatusLabel(null, ru), "Не отмечено");
  });

  it("lesson results reuse the traffic light and agree with the progress policy", () => {
    assert.deepEqual(LESSON_RESULT_ORDER, ["SOLVED", "PARTIAL", "NOT_SOLVED", "SKIPPED"]);
    assert.deepEqual(lessonResultMeta.SKIPPED, { tone: "neutral", status: null });

    for (const result of ["SOLVED", "PARTIAL", "NOT_SOLVED"] as const) {
      const decision = decideProgressChange(null, { source: "lesson_end", result });

      assert.equal(decision.write, true);
      assert.equal(decision.status, lessonResultMeta[result].status);
      assert.equal(lessonResultMeta[result].tone, lessonResultMeta[result].status);
    }

    assert.equal(decideProgressChange(null, { source: "lesson_end", result: "SKIPPED" }).write, false);
  });
});

describe("timeline entries and streak from status rows (Moscow days)", () => {
  const now = "2026-11-16T09:00:00.000Z"; // Monday, 12:00 Moscow time

  it("builds one entry per Moscow day, oldest first, today last", () => {
    const entries = buildProgressTimelineEntries([], 7, now);

    assert.deepEqual(entries.map((entry) => entry.date), [
      "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"
    ]);
    assert.ok(entries.every((entry) => entry.closedCount === 0 && entry.redCount === 0));
    assert.equal(buildProgressTimelineEntries([], 9999, now).length, MAX_TIMELINE_DAYS);
    assert.equal(buildProgressTimelineEntries([], 0, now).length, 1);
    assert.equal(buildProgressTimelineEntries([], undefined, now).length, 112);
    assert.equal(STREAK_WINDOW_DAYS, 112);
  });

  it("counts each marked row once, on the Moscow day its colour last changed", () => {
    const entries = buildProgressTimelineEntries(
      [
        { status: "GREEN", statusChangedAt: "2026-11-16T05:00:00.000Z" },
        { status: "YELLOW", statusChangedAt: "2026-11-15T21:05:00.000Z" }, // 00:05 Moscow time on the 16th
        { status: "RED", statusChangedAt: "2026-11-15T20:55:00.000Z" }, // 23:55 Moscow time on the 15th
        { status: "GREEN", statusChangedAt: null, updatedAt: "2026-11-14T10:00:00.000Z" }, // fallback
        { status: "GREEN", statusChangedAt: new Date("2026-11-14T11:00:00.000Z"), updatedAt: "2026-11-16T08:00:00.000Z" },
        { status: null, statusChangedAt: "2026-11-16T05:00:00.000Z" }, // cleared mark — not counted
        { status: "GREEN", statusChangedAt: "2026-11-01T05:00:00.000Z" }, // outside the 7-day window
        { status: "GREEN" }, // no usable date
        { status: "RED", statusChangedAt: "garbage" }
      ],
      7,
      now
    );
    const byDate = new Map(entries.map((entry) => [entry.date, entry]));

    assert.deepEqual(byDate.get("2026-11-16"), { date: "2026-11-16", closedCount: 2, redCount: 0 });
    assert.deepEqual(byDate.get("2026-11-15"), { date: "2026-11-15", closedCount: 0, redCount: 1 });
    assert.deepEqual(byDate.get("2026-11-14"), { date: "2026-11-14", closedCount: 2, redCount: 0 });
    assert.equal(entries.reduce((sum, entry) => sum + entry.closedCount + entry.redCount, 0), 5);
  });

  it("computes the streak with Moscow weekday labels", () => {
    const rows = [
      { status: "GREEN" as const, statusChangedAt: "2026-11-16T05:00:00.000Z" }, // Mon
      { status: "GREEN" as const, statusChangedAt: "2026-11-15T10:00:00.000Z" }, // Sun
      { status: "YELLOW" as const, statusChangedAt: "2026-11-14T10:00:00.000Z" }, // Sat
      { status: "RED" as const, statusChangedAt: "2026-11-13T10:00:00.000Z" }, // Fri — RED does not count
      { status: "GREEN" as const, statusChangedAt: "2026-11-11T10:00:00.000Z" } // Wed
    ];
    const streak = computeStudentStreak(rows, now);

    assert.equal(streak.currentStreak, 3);
    assert.equal(streak.bestStreak, 3);
    assert.equal(streak.solvedToday, 1);
    assert.equal(streak.solvedThisWeek, 4);
    assert.equal(streak.activeDaysThisWeek, 4);
    assert.deepEqual(streak.dailyActivity.map((day) => day.dayLabel), ["Вт", "Ср", "Чт", "Пт", "Сб", "Вс", "Пн"]);
    assert.deepEqual(streak.dailyActivity.map((day) => day.count), [0, 1, 0, 0, 1, 1, 1]);
    assert.deepEqual(
      computeStudentStreak(rows, now, "en").dailyActivity.map((day) => day.dayLabel),
      ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"]
    );
  });

  it("an empty today keeps yesterday's streak alive", () => {
    const streak = computeStudentStreak(
      [
        { status: "GREEN", statusChangedAt: "2026-11-15T10:00:00.000Z" },
        { status: "GREEN", statusChangedAt: "2026-11-14T10:00:00.000Z" }
      ],
      now
    );

    assert.equal(streak.solvedToday, 0);
    assert.equal(streak.currentStreak, 2);
  });

  it("gives the same answer in every device zone, including right after Moscow midnight", () => {
    const justAfterMidnight = "2026-11-16T21:10:00.000Z"; // 00:10 Moscow time on Tuesday the 17th
    const rows = [
      { status: "GREEN" as const, statusChangedAt: "2026-11-16T21:05:00.000Z" }, // 00:05 on the 17th
      { status: "GREEN" as const, statusChangedAt: "2026-11-16T20:55:00.000Z" } // 23:55 on the 16th
    ];

    inEveryZone((zone) => {
      const entries = buildProgressTimelineEntries(rows, 3, justAfterMidnight);

      assert.deepEqual(entries, [
        { date: "2026-11-15", closedCount: 0, redCount: 0 },
        { date: "2026-11-16", closedCount: 1, redCount: 0 },
        { date: "2026-11-17", closedCount: 1, redCount: 0 }
      ], zone);

      const streak = computeStudentStreak(rows, justAfterMidnight);

      assert.equal(streak.currentStreak, 2, zone);
      assert.equal(streak.solvedToday, 1, zone);
      assert.equal(streak.dailyActivity.at(-1)?.dayLabel, "Вт", zone);
      assert.equal(streak.dailyActivity.at(-1)?.date, "2026-11-17", zone);
    });
  });
});

describe("parent calls: calendar days are Moscow days in every device zone", () => {
  it("turns «due» at the 30th Moscow day, however few hours passed", () => {
    inEveryZone((zone) => {
      const reminder = resolveParentCallReminder({
        lastReachedAt: new Date("2026-07-22T20:30:00.000Z"), // 23:30 Moscow time, 22 July
        studentCreatedAt: new Date("2025-09-01T07:00:00.000Z"),
        now: new Date("2026-08-20T21:10:00.000Z") // 00:10 Moscow time, 21 August
      });

      assert.equal(reminder.daysSinceAnchor, 30, zone);
      assert.equal(reminder.state, "due", zone);
      assert.equal(reminder.daysUntilDue, 0, zone);
    });
  });
});

describe("solution-check errors as codes", () => {
  const ru = getDictionary("ru").student.checkErrors;
  const en = getDictionary("en").student.checkErrors;

  it("classifies raw provider text without leaking it", () => {
    assert.equal(classifySolutionCheckError("Request timed out after 60000ms"), "timeout");
    assert.equal(classifySolutionCheckError("ProxyAPI вернул статус 503"), "unavailable");
    assert.equal(classifySolutionCheckError("insufficient_quota: check your billing"), "quota");
    assert.equal(classifySolutionCheckError("Проверка прервана перезапуском сервера"), "interrupted");
    assert.equal(classifySolutionCheckError("Автопроверка отключена"), "disabled");
    assert.equal(classifySolutionCheckError("Очередь проверок переполнена"), "queue");
    assert.equal(classifySolutionCheckError("unsupported format of image"), "image");
    assert.equal(classifySolutionCheckError("something nobody expected"), "unknown");
    assert.equal(classifySolutionCheckError(""), "unknown");
    assert.equal(classifySolutionCheckError("   "), "unknown");
    assert.equal(classifySolutionCheckError(null), "unknown");
  });

  it("code → text agrees with the site's humanizer", () => {
    for (const raw of [
      "Request timed out after 60000ms",
      "ProxyAPI вернул статус 503",
      "insufficient_quota",
      "Проверка прервана перезапуском сервера",
      "Автопроверка отключена",
      "Очередь проверок переполнена",
      "unsupported format of image",
      "something nobody expected",
      null
    ]) {
      const code = classifySolutionCheckError(raw);

      assert.equal(checkErrorText(code, ru), humanizeSolutionCheckError(raw, ru));
      assert.equal(checkErrorText(code, en), humanizeSolutionCheckError(raw, en));
    }

    assert.equal(checkErrorText("unknown", ru), ru.fallback);
    assert.equal(checkErrorText(null, en), en.fallback);
    assert.equal(checkErrorText("timeout", en), en.timeout);
  });
});

describe("password generation without a guaranteed Web Crypto", () => {
  it("produces policy-compliant passwords with the default and with an injected source", () => {
    for (let index = 0; index < 50; index += 1) {
      assert.equal(validatePasswordStrength(generateReadablePassword()), null);
      assert.equal(validatePasswordStrength(generatePasswordFromName("Анна Смирнова")), null);
    }

    let calls = 0;
    const counter = (maxExclusive: number) => calls++ % maxExclusive;
    const first = generateReadablePassword(counter);

    calls = 0;
    assert.equal(generateReadablePassword(counter), first); // deterministic with an injected source
    assert.match(first, /^[A-Z][a-z]{5}-[2-9]{4}$/);
    assert.match(generatePasswordFromName("Анна Смирнова", counter), /^Smirnova-[a-z]{4}[2-9]{4}$/);
  });

  it("falls back when the runtime has no crypto.getRandomValues", () => {
    const holder = globalThis as { crypto?: unknown };
    const descriptor = Object.getOwnPropertyDescriptor(holder, "crypto");

    Object.defineProperty(holder, "crypto", { value: undefined, configurable: true, writable: true });

    try {
      const password = generateReadablePassword();

      assert.match(password, /^[A-Z][a-z]{5}-[2-9]{4}$/);
      assert.equal(validatePasswordStrength(password), null);
    } finally {
      if (descriptor) {
        Object.defineProperty(holder, "crypto", descriptor);
      } else {
        delete holder.crypto;
      }
    }
  });
});

describe("ai-pricing without process.env", () => {
  it("uses the built-in table by default and still accepts explicit overrides", () => {
    assert.deepEqual(resolveModelPrice("openai/gpt-6.1-sol"), { input: 420, output: 2100 });
    assert.deepEqual(resolveModelPrice("gpt-6-luna"), { input: 30, output: 150 });
    assert.deepEqual(resolveModelPrice("unknown-model"), { input: 420, output: 2100 });
    assert.deepEqual(resolveModelPrice("gpt-6-luna", { AI_MODEL_PRICES: "gpt-6-luna=10/20" }), { input: 10, output: 20 });
    assert.equal(estimateModelCostRub("gpt-6-luna", 1_000_000, 1_000_000), 180);
    assert.equal(estimateModelCostRub("gpt-6-luna", null, null), null);
  });
});

describe("notification text: the deadline is Moscow time", () => {
  it("renders the same deadline in every device zone and both languages", () => {
    const params = { topic: "Квадратные уравнения", count: 2, numbers: "101, 102", deadlineAt: "2026-11-16T20:59:00.000Z" };

    inEveryZone((zone) => {
      const ru = renderNotificationText("homework-assigned", params, "ru");
      const en = renderNotificationText("homework-assigned", params, "en");

      assert.ok(ru?.body?.includes("16 ноября в 23:59"), `${zone}: ${ru?.body}`);
      assert.ok(en?.body?.includes("16 November at 23:59"), `${zone}: ${en?.body}`);
    });
  });
});
