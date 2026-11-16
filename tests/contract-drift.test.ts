// Definitions that exist twice on purpose must not drift apart: enum unions and shapes (compile time),
// enum value lists, numeric limits and the keys of the bundled mock files (run time).
//
// `src/domain` is ported 1:1 from the site and must not import `src/api` (and the theme must not import
// either), so the Prisma enums and a few shapes exist in two places. The compiler checks here that every
// pair is the SAME type — `npm run typecheck` fails the moment one side gains, loses or renames a member —
// and the runtime half checks the value lists the two layers iterate over.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type * as Api from "../src/api/types";
import {
  ASSIGNMENT_REASONS,
  ATTENDANCE_STATUSES,
  AUDIT_CATEGORIES,
  HOMEWORK_NUMBER_STATUSES,
  LESSON_ITEM_RESULTS,
  LESSON_KINDS,
  LESSON_STATUSES,
  PARENT_CALL_OUTCOMES,
  SOLUTION_CHECK_STATUSES,
  SOLUTION_VERDICTS,
  ERROR_KINDS,
  LIMITS,
  META_LIMITS,
  SERVER_TIME_ZONE,
  SUBJECTS,
  USER_ROLES,
} from "../src/api/types";
import { MIN_PASSWORD_LENGTH } from "../src/domain/account-validation";
import { allowedUploadExtensions, allowedUploadMimeTypes } from "../src/domain/files";
import {
  DEFAULT_DAILY_MINUTES,
  MAX_DAILY_MINUTES,
  MAX_HOMEWORK_DAYS,
  MIN_DAILY_MINUTES,
  MIN_HOMEWORK_DAYS,
} from "../src/domain/homework-plan";
import { LESSON_SUBMISSION_MAX_PHOTOS } from "../src/domain/lesson-live";
import {
  MAX_DURATION_MINUTES,
  MAX_GROUP_SIZE,
  MAX_PLAN_ITEMS,
  MAX_SPEED,
  MAX_TEACHER_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_DURATION_MINUTES,
  MIN_SPEED,
} from "../src/domain/lesson-plan";
import { SCHOOL_TIME_ZONE } from "../src/domain/moscow-time";
import { MAX_NUMBERS_PER_INPUT } from "../src/domain/numbers";
import { PARENT_CALL_DUE_DAYS, PARENT_CALL_HISTORY_LIMIT, PARENT_CALL_OVERDUE_DAYS } from "../src/domain/parent-call-state";
import { MAX_PASSWORD_LENGTH } from "../src/domain/password-policy";
import { MAX_TIMELINE_DAYS } from "../src/domain/progress-timeline";
import { MAX_COMPLETED_CHECKS_PER_STUDENT } from "../src/domain/solution-check-history";
import { ERROR_KINDS as DOMAIN_ERROR_KINDS } from "../src/domain/solution-check-parse";
import { MAX_LOGIN_LENGTH, MAX_USER_NAME_LENGTH } from "../src/domain/text";
import { MAX_ORIGINAL_FILE_NAME_LENGTH, MAX_UPLOAD_SIZE_BYTES } from "../src/domain/upload-validation";
import type * as DomainAttendance from "../src/domain/attendance";
import type * as DomainPanelTabs from "../src/domain/developer-panel-tabs";
import * as DomainEnums from "../src/domain/enums";
import type * as DomainLessonStatus from "../src/domain/lesson-status";
import type * as DomainNotificationText from "../src/domain/notification-text";
import type * as DomainParentCalls from "../src/domain/parent-call-state";
import type * as DomainPasswordPolicy from "../src/domain/password-policy";
import type * as DomainPlanError from "../src/domain/plan-error";
import type * as DomainProgressPolicy from "../src/domain/progress-policy";
import type * as DomainTimeline from "../src/domain/progress-timeline";
import type * as DomainReportPeriod from "../src/domain/report-period";
import type * as DomainCheckParse from "../src/domain/solution-check-parse";
import type * as DomainStatuses from "../src/domain/statuses";
import type * as DomainStreak from "../src/domain/student-streak";
import type * as DomainStreakColors from "../src/domain/student-streak-colors";
import type * as DomainTopicImport from "../src/domain/topic-import";
import type * as DomainTopicNumbers from "../src/domain/topic-numbers-change";
import { MOCK_DOCUMENT_SAMPLES, MOCK_FILE_SAMPLES, MOCK_SAMPLE_SCHEME, mockSampleUrl, parseMockSampleUrl } from "../src/mock/assets";
import type * as MockRateLimit from "../src/mock/rules/rate-limit";
import { MOCK_SAMPLE_MIME } from "../src/services/files/mock-samples";
import type * as ThemeStatus from "../src/theme/status";
import type * as ThemeTheme from "../src/theme/theme";

/** `true` only when A and B are the same type (not merely assignable one way). */
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/** Compiles only for `true`: `Assert<Same<A, B>>`. */
type Assert<T extends true> = T;

// ── Prisma enums: `src/api/types/primitives.ts` ↔ `src/domain/enums.ts` ──
export type EnumPairs = [
  Assert<Same<Api.UserRole, DomainEnums.UserRole>>,
  Assert<Same<Api.HomeworkNumberStatus, DomainEnums.HomeworkNumberStatus>>,
  Assert<Same<Api.Subject, DomainEnums.Subject>>,
  Assert<Same<Api.LessonStatus, DomainEnums.LessonStatus>>,
  Assert<Same<Api.AttendanceStatus, DomainEnums.AttendanceStatus>>,
  Assert<Same<Api.LessonKind, DomainEnums.LessonKind>>,
  Assert<Same<Api.AssignmentReason, DomainEnums.AssignmentReason>>,
  Assert<Same<Api.LessonItemResult, DomainEnums.LessonItemResult>>,
  Assert<Same<Api.ParentCallOutcome, DomainEnums.ParentCallOutcome>>,
  Assert<Same<Api.SolutionCheckStatus, DomainEnums.SolutionCheckStatus>>,
  Assert<Same<Api.SolutionVerdict, DomainEnums.SolutionVerdict>>,
  Assert<Same<Api.AuditCategory, DomainEnums.AuditCategory>>,
];

// ── other literal unions the ported helpers declare next to their logic ──
export type UnionPairs = [
  Assert<Same<Api.DerivedLessonStatus, DomainLessonStatus.DerivedLessonStatus>>,
  Assert<Same<Api.DeveloperPanelTab, DomainPanelTabs.DeveloperPanelTab>>,
  Assert<Same<Api.ErrorKind, DomainCheckParse.ErrorKind>>,
  Assert<Same<Api.ParentCallReminderState, DomainParentCalls.ParentCallReminderState>>,
  Assert<Same<Api.PasswordProblem, DomainPasswordPolicy.PasswordProblem>>,
  Assert<Same<Api.PlanErrorCode, DomainPlanError.PlanErrorCode>>,
  Assert<Same<Api.ProgressDecisionReason, DomainProgressPolicy.ProgressDecisionReason>>,
  Assert<Same<Api.ProgressSource, DomainProgressPolicy.ProgressSource>>,
  Assert<Same<Api.ReportPeriod, DomainReportPeriod.ReportPeriod>>,
  Assert<Same<Api.StudentStreakColorTier, DomainStreakColors.StudentStreakColorTier>>,
  Assert<Same<Api.TimelinePeriod, DomainTimeline.TimelinePeriod>>,
  // The theme and the mock keep structural copies so they do not depend on the API layer / each other.
  Assert<Same<Api.HomeworkNumberStatus, ThemeStatus.HomeworkNumberStatus>>,
  Assert<Same<Api.LessonItemResult, ThemeStatus.LessonResultValue>>,
  Assert<Same<Api.ThemeMode, ThemeTheme.ThemeMode>>,
  Assert<Same<Api.AiBudgetScope, MockRateLimit.AiBudgetScope>>,
];

// ── the status meta of the domain names a tone; every such tone is a key of the theme's status palette
//    (`statusPalette(colors)[homeworkStatusMeta[status].tone]`). The theme has one more, UI-only key. ──
export type TonePairs = [
  Assert<DomainStatuses.StatusTone extends ThemeStatus.StatusTone ? true : false>,
  Assert<Same<Exclude<ThemeStatus.StatusTone, DomainStatuses.StatusTone>, "idle">>,
];

// ── shapes: what a domain helper returns is what the API type promises, and the reverse ──
// Two same-named pairs are different on purpose and are NOT asserted: `GroupMemberRow` and
// `HomeworkPlanParams` of the domain are the server-side forms (`Date` instants, attention flags as text),
// the API ones are their wire forms (`IsoDateTime`, structured `AttentionFlag`); the mock converts.
export type ShapePairs = [
  Assert<Same<Api.AttendanceSummary, DomainAttendance.AttendanceSummary>>,
  Assert<Same<Api.ImportNumber, DomainTopicImport.ImportNumber>>,
  Assert<Same<Api.NotificationParams, DomainNotificationText.NotificationParams>>,
  Assert<Same<Api.ParentCallReminder, DomainParentCalls.ParentCallReminder>>,
  Assert<Same<Api.StudentStreak, DomainStreak.StudentStreak>>,
  Assert<Same<Api.TimelineEntry, DomainTimeline.TimelineEntry>>,
  Assert<Same<Api.TopicImpactSummary, DomainTopicNumbers.TopicImpactSummary>>,
];

describe("duplicated definitions stay identical", () => {
  // The API layer lists enum values as arrays, the domain as `@prisma/client`-style objects.
  const pairs: [name: string, api: readonly string[], domain: Record<string, string>][] = [
    ["UserRole", USER_ROLES, DomainEnums.UserRole],
    ["HomeworkNumberStatus", HOMEWORK_NUMBER_STATUSES, DomainEnums.HomeworkNumberStatus],
    ["Subject", SUBJECTS, DomainEnums.Subject],
    ["LessonStatus", LESSON_STATUSES, DomainEnums.LessonStatus],
    ["AttendanceStatus", ATTENDANCE_STATUSES, DomainEnums.AttendanceStatus],
    ["LessonKind", LESSON_KINDS, DomainEnums.LessonKind],
    ["AssignmentReason", ASSIGNMENT_REASONS, DomainEnums.AssignmentReason],
    ["LessonItemResult", LESSON_ITEM_RESULTS, DomainEnums.LessonItemResult],
    ["ParentCallOutcome", PARENT_CALL_OUTCOMES, DomainEnums.ParentCallOutcome],
    ["SolutionCheckStatus", SOLUTION_CHECK_STATUSES, DomainEnums.SolutionCheckStatus],
    ["SolutionVerdict", SOLUTION_VERDICTS, DomainEnums.SolutionVerdict],
    ["AuditCategory", AUDIT_CATEGORIES, DomainEnums.AuditCategory],
  ];

  for (const [name, api, domain] of pairs) {
    it(`${name}: the API value list equals the domain enum object, in schema order`, () => {
      assert.deepEqual(Object.values(domain), [...api]);
      // A Prisma-style enum object maps every key to itself.
      for (const [key, value] of Object.entries(domain)) assert.equal(key, value);
    });
  }

  it("covers every enum the domain declares", () => {
    const declared = Object.keys(DomainEnums).sort();
    assert.deepEqual(declared, pairs.map(([name]) => name).sort());
  });
});

// The API layer's limit table (client-side validation, `GET /meta`) and the constants the ported site code
// validates with are two spellings of the same numbers.
describe("limits: the API table equals the constants of the ported rules", () => {
  it("accounts", () => {
    assert.equal(LIMITS.userNameMaxLength, MAX_USER_NAME_LENGTH);
    assert.equal(LIMITS.loginMaxLength, MAX_LOGIN_LENGTH);
    assert.deepEqual(LIMITS.password, { minLength: MIN_PASSWORD_LENGTH, maxLength: MAX_PASSWORD_LENGTH });
  });

  it("uploads", () => {
    assert.equal(LIMITS.uploadMaxBytes, MAX_UPLOAD_SIZE_BYTES);
    assert.equal(LIMITS.uploadFileNameMaxLength, MAX_ORIGINAL_FILE_NAME_LENGTH);
    assert.deepEqual([...LIMITS.allowedUploadExtensions], [...allowedUploadExtensions]);
    assert.deepEqual([...LIMITS.allowedUploadMimeTypes].sort(), [...allowedUploadMimeTypes].sort());
    assert.equal(LIMITS.lessonSubmissionMaxPhotos, LESSON_SUBMISSION_MAX_PHOTOS);
  });

  it("lessons and homework drafts", () => {
    assert.deepEqual(
      { min: LIMITS.lessonDurationMinutes.min, max: LIMITS.lessonDurationMinutes.max },
      { min: MIN_DURATION_MINUTES, max: MAX_DURATION_MINUTES },
    );
    assert.deepEqual(LIMITS.homeworkDailyMinutes, { min: MIN_DAILY_MINUTES, max: MAX_DAILY_MINUTES, default: DEFAULT_DAILY_MINUTES });
    assert.deepEqual(LIMITS.homeworkDaysToDeadline, { min: MIN_HOMEWORK_DAYS, max: MAX_HOMEWORK_DAYS });
    assert.deepEqual(LIMITS.speed, { min: MIN_SPEED, max: MAX_SPEED });
    assert.equal(LIMITS.maxStudentsPerLesson, MAX_GROUP_SIZE);
    assert.equal(LIMITS.maxItemsPerPart, MAX_PLAN_ITEMS);
    assert.equal(LIMITS.maxTitleLength, MAX_TITLE_LENGTH);
    assert.equal(LIMITS.maxTeacherNoteLength, MAX_TEACHER_NOTE_LENGTH);
    assert.equal(LIMITS.maxNumbersPerInput, MAX_NUMBERS_PER_INPUT);
  });

  it("parent calls, streak, retention, time zone", () => {
    assert.equal(LIMITS.parentCallDueDays, PARENT_CALL_DUE_DAYS);
    assert.equal(LIMITS.parentCallOverdueDays, PARENT_CALL_OVERDUE_DAYS);
    assert.equal(LIMITS.parentCallHistoryShown, PARENT_CALL_HISTORY_LIMIT);
    assert.equal(LIMITS.streakWindowDays, MAX_TIMELINE_DAYS);
    assert.equal(LIMITS.completedChecksKeptDefault, MAX_COMPLETED_CHECKS_PER_STUDENT);
    assert.equal(SERVER_TIME_ZONE, SCHOOL_TIME_ZONE);
  });

  it("`GET /meta` limits repeat the table", () => {
    assert.equal(META_LIMITS.uploadMaxBytes, LIMITS.uploadMaxBytes);
    assert.deepEqual([...META_LIMITS.allowedUploadExtensions], [...LIMITS.allowedUploadExtensions]);
    assert.deepEqual([...META_LIMITS.photoExtensions], [...LIMITS.photoExtensions]);
    assert.equal(META_LIMITS.lessonSubmissionMaxPhotos, LIMITS.lessonSubmissionMaxPhotos);
    assert.equal(META_LIMITS.parentCallDueDays, LIMITS.parentCallDueDays);
    assert.equal(META_LIMITS.parentCallOverdueDays, LIMITS.parentCallOverdueDays);
    assert.deepEqual(META_LIMITS.lessonDurationMinutes, LIMITS.lessonDurationMinutes);
    assert.deepEqual(META_LIMITS.homeworkDailyMinutes, LIMITS.homeworkDailyMinutes);
    assert.deepEqual(META_LIMITS.speed, LIMITS.speed);
    assert.equal(META_LIMITS.maxStudentsPerLesson, LIMITS.maxStudentsPerLesson);
    assert.equal(META_LIMITS.maxItemsPerPart, LIMITS.maxItemsPerPart);
    assert.equal(META_LIMITS.maxTitleLength, LIMITS.maxTitleLength);
    assert.equal(META_LIMITS.maxTeacherNoteLength, LIMITS.maxTeacherNoteLength);
  });

  it("error kinds of the AI check are listed in the same order", () => {
    assert.deepEqual([...ERROR_KINDS], [...DOMAIN_ERROR_KINDS]);
  });
});

// The mock backend names bundled sample files by key and must not import the device layer that owns the
// bytes, so the key list exists on both sides.
describe("mock sample files: the backend's keys are the device layer's keys", () => {
  it("every sample the backend can name has a bundled file", () => {
    for (const sample of MOCK_FILE_SAMPLES) assert.ok(sample in MOCK_SAMPLE_MIME, `no bundled file for "${sample}"`);
  });

  it("a generated document declares the type of the sample that stands in for it", () => {
    for (const [kind, document] of Object.entries(MOCK_DOCUMENT_SAMPLES)) {
      assert.equal(document.mimeType, MOCK_SAMPLE_MIME[document.sample], kind);
    }
  });

  it("the handout URL of the mock round-trips through the scheme the file viewer resolves", () => {
    const url = mockSampleUrl(MOCK_DOCUMENT_SAMPLES.lessonHandout.sample, { kind: "lessonHandout", lessonId: "les_live", answers: "1" });
    assert.ok(url.startsWith(MOCK_SAMPLE_SCHEME));
    assert.deepEqual(parseMockSampleUrl(url), {
      sample: MOCK_DOCUMENT_SAMPLES.lessonHandout.sample,
      query: { kind: "lessonHandout", lessonId: "les_live", answers: "1" },
    });
    assert.equal(parseMockSampleUrl("https://example.com/handout.pdf"), null);
    assert.equal(parseMockSampleUrl(`${MOCK_SAMPLE_SCHEME}nope`), null);
  });
});
