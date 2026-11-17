// Mock member `developer` (DeveloperApi): panel, settings, service actions, broadcast, journal.
// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { AuditLog, JournalEntry, PanelAction, RealtimeEvent, SiteSettings } from "../src/api/types";
import { AI_BUDGET_WINDOW_MS, LIMITS, PANEL_ACTIONS, RATE_LIMITS } from "../src/api/types";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../src/domain/moscow-time";
import { MOCK_COVERAGE } from "../src/mock";
import { defaultSiteSettings } from "../src/mock/fixtures/journal";
import { AUDIT_RETENTION_DAYS, MOCK_AI_PING_MS, STALE_CHECK_UNFREEZE_MS, UNFROZEN_CHECK_ERROR, applySettingsPatch } from "../src/mock/members/developer";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);

const DEVELOPER = "dev@example.com";
const TEACHER = "teacher@example.com";
const ILYA = "ilya@example.com";

const RU = {
  developerRightsRequired: "Нужны права разработчика.",
  sessionExpired: "Сессия истекла. Войдите заново.",
  settingsSaved: "Настройки сохранены и применены — подействуют в течение 15 секунд.",
  aiDisabled: "Автопроверка выключена или не настроен ключ/модель.",
  budgetReset: "Дневной бюджет автопроверки сброшен.",
  cachesFlushed: "Кэши платформы сброшены.",
  broadcastInvalid: "Заполните заголовок и выберите получателей.",
  retentionNever: "ещё не выполнялся",
};

const EN = {
  developerRightsRequired: "Developer rights are required.",
  settingsSaved: "Settings saved and applied — they take effect within 15 seconds.",
  aiDisabled: "AI check is turned off or the key/model is not configured.",
  budgetReset: "The daily AI check budget has been reset.",
  cachesFlushed: "Platform caches flushed.",
  broadcastInvalid: "Fill in the title and choose recipients.",
  retentionNever: "not run yet",
};

/** Awaits a rejection and returns the `ApiError`, asserting its code and status. */
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

/** Lets queued microtasks (realtime delivery) run. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

async function developerMock(options: Parameters<typeof createTestMock>[0] = {}): Promise<TestMock> {
  const mock = createTestMock(options);
  await mock.signIn(DEVELOPER);
  return mock;
}

/** Journal rows with this action, oldest first. */
const auditRows = (mock: TestMock, action: string): AuditLog[] => mock.store.auditLogs.filter((row) => row.action === action);
const lastAudit = (mock: TestMock): AuditLog => mock.store.auditLogs.all().at(-1)!;

/** Every method of the member with a harmless argument — for the role checks. */
function everyCall(mock: TestMock): [string, () => Promise<unknown>][] {
  const api = mock.api.developer;
  return [
    ["getPanel", () => api.getPanel()],
    ["saveSettings", () => api.saveSettings({ aiDailyLimit: 5 })],
    ["runAction", () => api.runAction("flush-caches")],
    ["broadcast", () => api.broadcast({ title: "Привет", toAll: true })],
    ["getJournal", () => api.getJournal({})],
  ];
}

// ───────────────────────────── roles ─────────────────────────────

describe("developer: access", () => {
  it("refuses a teacher and a student with 403 developerRightsRequired and changes nothing", async () => {
    for (const login of [TEACHER, ILYA]) {
      const mock = createTestMock();
      await mock.signIn(login);
      const before = { audit: mock.store.auditLogs.count(), notifications: mock.store.notifications.count(), settings: { ...mock.store.settings } };
      for (const [name, call] of everyCall(mock)) {
        const error = await rejects(call(), "developerRightsRequired", 403);
        assert.equal(error.message, RU.developerRightsRequired, `${login} ${name}`);
      }
      assert.equal(mock.store.auditLogs.count(), before.audit);
      assert.equal(mock.store.notifications.count(), before.notifications);
      assert.deepEqual(mock.store.settings, before.settings);
    }
  });

  it("answers 401 sessionExpired without a session, and localises the role error", async () => {
    const mock = createTestMock();
    for (const [, call] of everyCall(mock)) {
      const error = await rejects(call(), "sessionExpired", 401);
      assert.equal(error.message, RU.sessionExpired);
    }
    await mock.signIn(TEACHER);
    mock.setLocale("en");
    const error = await rejects(mock.api.developer.getPanel(), "developerRightsRequired", 403);
    assert.equal(error.message, EN.developerRightsRequired);
  });

  it("honours the forced errors of the demo screen before touching the store (coverage: anyCall.forcedError)", async () => {
    assert.ok(MOCK_COVERAGE.some((row) => row.key === "anyCall.forcedError" && row.control === "forceNextError"));
    const mock = await developerMock();
    const before = mock.store.auditLogs.count();

    mock.api.controls.set("forceNextError", { method: "developer.runAction", error: "rateLimited", times: 1 });
    const limited = await rejects(mock.api.developer.runAction("flush-caches"), "rateLimited", 429);
    assert.equal(limited.retryAfterSeconds, 30);

    mock.api.controls.set("forceNextError", { method: "developer.getJournal", error: "serviceUnavailable", times: 1 });
    assert.equal((await rejects(mock.api.developer.getJournal({}), "serviceUnavailable", 503)).retryAfterSeconds, 5);

    mock.api.controls.set("forceNextError", { method: "developer.saveSettings", error: "sessionExpired", times: 1 });
    await rejects(mock.api.developer.saveSettings({ aiDailyLimit: 7 }), "sessionExpired", 401);
    assert.equal(mock.store.settings.aiDailyLimit, 300);

    mock.api.controls.set("forceNextError", { method: "developer.broadcast", error: "network", times: 1 });
    await rejects(mock.api.developer.broadcast({ title: "x", toAll: true }), "network", 0);

    mock.setOnline(false);
    await rejects(mock.api.developer.getPanel(), "network", 0);
    mock.setOnline(true);

    assert.equal(mock.store.auditLogs.count(), before);
    // One-shot: the next call works.
    assert.equal((await mock.api.developer.runAction("flush-caches")).ok, true);
  });

  it("has no rate limit: none of the five methods is listed in a limiter scope", async () => {
    const limited = Object.values(RATE_LIMITS).flatMap((rule) => [...rule.methods]);
    assert.deepEqual(limited.filter((method) => method.startsWith("developer.")), []);
    const mock = await developerMock();
    for (let index = 0; index < 130; index += 1) await mock.api.developer.getPanel();
    assert.equal(mock.store.limiterBuckets.filter((bucket) => bucket.identifier === "usr_dev" && bucket.scope.startsWith("api:")).length, 0);
  });
});

// ───────────────────────────── getPanel ─────────────────────────────

describe("developer.getPanel", () => {
  it("returns the seeded status numbers, the settings and every student by name", async () => {
    const mock = await developerMock();
    const panel = await mock.api.developer.getPanel();
    const files = mock.store.files.all();
    const bytes = files.reduce((total, file) => total + file.size, 0);

    assert.deepEqual(Object.keys(panel).sort(), ["aiBudgets", "settings", "stats", "students"]);
    assert.deepEqual(panel.stats, {
      // Полина's waiting lesson submission: the check queue is shared by homework and lesson checks.
      queueLength: 1,
      checksLastDay: 4,
      studentsCount: 10,
      topicsCount: mock.store.topics.count(),
      filesCount: files.length,
      filesSizeBytes: bytes,
      filesSizeLabel: `${(bytes / (1024 * 1024)).toFixed(1)} МБ`,
      // The seeded `developer.retention_run` row, five days before the seed, 11:10 Moscow time.
      lastRetentionAt: "2026-11-11T08:10:00.000Z",
      lastRetentionLabel: "11.11.2026, 11:10",
      // Seeded generations in flight: the three participants of `hp_generating` and `les_ilya_tomorrow`.
      lessonQueueLength: 4,
    });
    assert.ok(files.length > 100);

    assert.deepEqual(panel.settings, defaultSiteSettings());
    assert.equal(Object.keys(panel.settings).length, 25);

    assert.equal(panel.students.length, 10);
    assert.deepEqual(panel.students.map((student) => student.name), [...panel.students.map((student) => student.name)].sort((a, b) => a.localeCompare(b, "ru")));
    for (const student of panel.students) {
      assert.deepEqual(Object.keys(student).sort(), ["id", "name"]);
      assert.equal(mock.store.users.get(student.id)?.role, "STUDENT");
    }
    // The stranded student without a teacher is a recipient too; teachers and the developer are not.
    assert.ok(panel.students.some((student) => student.id === "usr_orphan"));
    assert.equal(panel.students.some((student) => student.id === "usr_anna" || student.id === "usr_dev"), false);
  });

  it("renders the labels for the request language and says when retention never ran", async () => {
    const mock = await developerMock();
    mock.setLocale("en");
    const english = await mock.api.developer.getPanel();
    assert.match(english.stats.filesSizeLabel, /^\d+\.\d MB$/);
    // en-GB date order, still Moscow time.
    assert.equal(english.stats.lastRetentionLabel, "11/11/2026, 11:10");

    mock.store.auditLogs.deleteWhere((row) => row.action === "developer.retention_run");
    const never = await mock.api.developer.getPanel();
    assert.equal(never.stats.lastRetentionAt, null);
    assert.equal(never.stats.lastRetentionLabel, EN.retentionNever);
    mock.setLocale("ru");
    assert.equal((await mock.api.developer.getPanel()).stats.lastRetentionLabel, RU.retentionNever);
  });

  it("ignores a failed retention row when it looks for the last run", async () => {
    const mock = await developerMock();
    mock.clock.advance(HOUR_MS);
    mock.ctx.audit.write({ category: "DATA", action: "developer.retention_run", outcome: "failed", text: { key: "developer.retention_failed" } });
    assert.equal((await mock.api.developer.getPanel()).stats.lastRetentionAt, "2026-11-11T08:10:00.000Z");
  });

  it("counts the checks of the trailing 24 hours — a row exactly 24 h old still counts", async () => {
    const mock = await developerMock();
    // Seeded rows of the last day: 05:59, 06:00, 08:00 and 08:59:40 UTC (T0 is 09:00 UTC).
    mock.clock.set(T0 + 23 * HOUR_MS);
    assert.equal((await mock.api.developer.getPanel()).stats.checksLastDay, 2);
    mock.clock.advance(1);
    assert.equal((await mock.api.developer.getPanel()).stats.checksLastDay, 1);
    mock.clock.advance(DAY_MS);
    assert.equal((await mock.api.developer.getPanel()).stats.checksLastDay, 0);
  });

  it("follows the store: new students, topics, files, queued checks and generations", async () => {
    const mock = await developerMock();
    const before = (await mock.api.developer.getPanel()).stats;

    mock.ctx.cascade.deleteStudent("usr_orphan");
    const check = mock.store.homeworkChecks.insert({
      id: "chk_test_queued", assignmentId: "hw_ilya_later", status: "PENDING", activeSlot: 1, modelUsed: null, error: null, createdAt: mock.ctx.nowIso(), checkedAt: null,
    });
    // A handler-less job kind: the row counts as queued, and nothing runs it behind the test's back.
    mock.ctx.jobs.schedule("test.queued", check.id, HOUR_MS);
    // A waiting row whose job is gone (lost in a restart) is not in the queue.
    mock.store.homeworkChecks.insert({
      id: "chk_test_lost", assignmentId: "hw_ilya_done", status: "PENDING", activeSlot: 1, modelUsed: null, error: null, createdAt: mock.ctx.nowIso(), checkedAt: null,
    });
    // One generation finishes (its job is gone); a job whose participant no longer exists is not counted.
    const generation = mock.store.jobs.find((job) => job.kind === "planGeneration")!;
    mock.ctx.jobs.cancel(generation.refId);
    mock.ctx.jobs.schedule("planGeneration", "pt_test_missing", HOUR_MS);

    const after = (await mock.api.developer.getPanel()).stats;
    assert.equal(after.studentsCount, before.studentsCount - 1);
    assert.equal(after.queueLength, before.queueLength + 1);
    assert.equal(after.checksLastDay, before.checksLastDay + 2);
    assert.equal(after.lessonQueueLength, before.lessonQueueLength - 1);
    assert.ok(mock.store.participants.has(generation.refId));
  });

  it("exposes the three real budget buckets in a fixed order, separate from the 24-hour tile", async () => {
    const mock = await developerMock();
    const nextMidnight = new Date(Math.floor(T0 / AI_BUDGET_WINDOW_MS) * AI_BUDGET_WINDOW_MS + AI_BUDGET_WINDOW_MS).toISOString();
    assert.deepEqual((await mock.api.developer.getPanel()).aiBudgets, [
      { scope: "api:homework-checks:global", limit: 300, used: 0, resetAt: nextMidnight },
      { scope: "api:lesson-checks:global", limit: 300, used: 0, resetAt: nextMidnight },
      { scope: "api:ai-plans:global", limit: 300, used: 0, resetAt: nextMidnight },
    ]);

    mock.ctx.limits.consumeBudget("api:homework-checks:global");
    mock.ctx.limits.consumeBudget("api:ai-plans:global", 7);
    mock.api.controls.exhaust("api:lesson-checks:global", "global");
    await mock.api.developer.saveSettings({ aiPlanDailyLimit: 40 });
    const used = await mock.api.developer.getPanel();
    assert.deepEqual(used.aiBudgets!.map((budget) => [budget.used, budget.limit]), [[1, 300], [300, 300], [7, 40]]);
    // The tile is a row count, not a bucket.
    assert.equal(used.stats.checksLastDay, 4);

    // The window is fixed: at 00:00 UTC every counter starts again, with nothing running at the boundary.
    mock.clock.set(Date.parse(nextMidnight) - 1);
    assert.deepEqual((await mock.api.developer.getPanel()).aiBudgets!.map((budget) => budget.used), [1, 300, 7]);
    mock.clock.advance(1);
    const next = await mock.api.developer.getPanel();
    assert.deepEqual(next.aiBudgets!.map((budget) => budget.used), [0, 0, 0]);
    assert.equal(next.aiBudgets![0]!.resetAt, new Date(Date.parse(nextMidnight) + AI_BUDGET_WINDOW_MS).toISOString());
  });
});

// ───────────────────────────── saveSettings ─────────────────────────────

/** Integer settings with the site's ranges (07 §4.5). */
const INT_RANGES: [keyof SiteSettings, number, number][] = [
  ["aiDailyLimit", 1, 100_000],
  ["aiPerStudentHourlyLimit", 1, 1000],
  ["aiCheckConcurrency", 1, 8],
  ["photoRetentionDays", 0, 3650],
  ["maxPhotosPerAssignment", 1, 30],
  ["completedChecksKept", 1, 500],
  ["lessonPlanShortlistSize", 20, 150],
  ["lessonPlanMaxItems", 5, 60],
  ["lessonPlanConcurrency", 1, 10],
  ["aiPlanDailyLimit", 1, 100_000],
  ["homeworkPlanMaxItems", 3, 60],
  ["homeworkPlanShortlistSize", 20, 150],
  ["lessonCheckDailyLimit", 1, 100_000],
  ["lessonCheckPerStudentHourlyLimit", 1, 1000],
  ["lessonIdleWarnMinutes", 1, 120],
  ["lessonIdleAlertMinutes", 1, 240],
];

describe("developer.saveSettings", () => {
  it("stores a partial body, returns the stored values and writes the journal row", async () => {
    const mock = await developerMock();
    const result = await mock.api.developer.saveSettings({ aiDailyLimit: 500, aiReasoningEffort: "low", lessonIdleWarnMinutes: 12 });

    assert.deepEqual(Object.keys(result).sort(), ["message", "ok", "settings"]);
    assert.equal(result.ok, true);
    assert.equal(result.message, RU.settingsSaved);
    assert.deepEqual(result.settings, { ...defaultSiteSettings(), aiDailyLimit: 500, aiReasoningEffort: "low", lessonIdleWarnMinutes: 12 });
    assert.deepEqual(mock.store.settings, result.settings);
    assert.deepEqual((await mock.api.developer.getPanel()).settings, result.settings);

    const row = lastAudit(mock);
    assert.deepEqual(
      [row.category, row.action, row.outcome, row.actorId, row.actorName, row.actorRole, row.summary],
      ["DATA", "developer.settings_saved", "ok", "usr_dev", "Разработчик ШБЗ", "DEVELOPER", RU.settingsSaved],
    );
    assert.deepEqual(row.meta, { i18n: { key: "developer.settings_saved" } });
    assert.equal(row.createdAt, TEST_T0);

    mock.setLocale("en");
    assert.equal((await mock.api.developer.saveSettings({})).message, EN.settingsSaved);
  });

  it("clamps every integer to its range, floors fractions and keeps the boundaries", async () => {
    const mock = await developerMock();
    for (const [key, min, max] of INT_RANGES) {
      const save = async (value: number) => (await mock.api.developer.saveSettings({ [key]: value } as Partial<SiteSettings>)).settings[key];
      assert.equal(await save(min), min, `${key} min`);
      assert.equal(await save(max), max, `${key} max`);
      assert.equal(await save(min - 1), min, `${key} below`);
      assert.equal(await save(max + 1), max, `${key} above`);
      assert.equal(await save(min + 0.9), min, `${key} floor`);
    }
    assert.equal(INT_RANGES.length, 16);
    assert.deepEqual([LIMITS.maxPhotosPerAssignment.min, LIMITS.maxPhotosPerAssignment.max], [1, 30]);
  });

  it("clamps the confidence threshold without flooring it", async () => {
    const mock = await developerMock();
    const save = async (value: number) => (await mock.api.developer.saveSettings({ aiMinConfidence: value })).settings.aiMinConfidence;
    assert.equal(await save(0.65), 0.65);
    assert.equal(await save(0), 0);
    assert.equal(await save(1), 1);
    assert.equal(await save(-0.2), 0);
    assert.equal(await save(1.4), 1);
  });

  it("resets a blank or non-numeric number to the default of the key, not to the previous value", async () => {
    const mock = await developerMock();
    await mock.api.developer.saveSettings({ aiDailyLimit: 500, aiMinConfidence: 0.9 });
    const loose = mock.api.developer.saveSettings as (values: Record<string, unknown>) => ReturnType<typeof mock.api.developer.saveSettings>;
    for (const blank of ["", "   ", "abc", null, Number.NaN, Number.POSITIVE_INFINITY, true, {}]) {
      await mock.api.developer.saveSettings({ aiDailyLimit: 500, aiMinConfidence: 0.9 });
      const { settings } = await loose({ aiDailyLimit: blank, aiMinConfidence: blank });
      assert.equal(settings.aiDailyLimit, 300, String(blank));
      assert.equal(settings.aiMinConfidence, 0.6, String(blank));
    }
    // A numeric string is a number, like a form field.
    assert.equal((await loose({ aiDailyLimit: " 42 " })).settings.aiDailyLimit, 42);
  });

  it("trims and cuts texts, validates the effort and reads the switches", async () => {
    const mock = await developerMock();
    const long = "м".repeat(260);
    const texts = await mock.api.developer.saveSettings({ aiModel: `  ${long}  `, aiShortlistModel: "   ", loginHelpContact: ` ${long}` });
    assert.equal(texts.settings.aiModel, long.slice(0, 100));
    assert.equal(texts.settings.aiShortlistModel, "");
    assert.equal(texts.settings.loginHelpContact, long.slice(0, 200));
    assert.equal((await mock.api.developer.saveSettings({ aiModel: "x".repeat(100), loginHelpContact: "y".repeat(200) })).settings.aiModel.length, 100);

    const loose = mock.api.developer.saveSettings as (values: Record<string, unknown>) => ReturnType<typeof mock.api.developer.saveSettings>;
    assert.equal((await loose({ aiReasoningEffort: "medium" })).settings.aiReasoningEffort, "medium");
    // Not one of the three values → the default of the key.
    assert.equal((await loose({ aiReasoningEffort: "extreme" })).settings.aiReasoningEffort, "high");
    assert.equal((await loose({ aiModel: 15 })).settings.aiModel, "");

    const off = await mock.api.developer.saveSettings({ aiEnabled: false, lessonPlanEnabled: false, homeworkPlanEnabled: false, lessonCheckEnabled: false });
    assert.deepEqual(
      [off.settings.aiEnabled, off.settings.lessonPlanEnabled, off.settings.homeworkPlanEnabled, off.settings.lessonCheckEnabled],
      [false, false, false, false],
    );
    const on = await loose({ aiEnabled: true, lessonPlanEnabled: "on", homeworkPlanEnabled: "true", lessonCheckEnabled: "yes" });
    assert.deepEqual([on.settings.aiEnabled, on.settings.lessonPlanEnabled, on.settings.homeworkPlanEnabled, on.settings.lessonCheckEnabled], [true, true, true, false]);
  });

  it("ignores unknown keys and a body that is not an object, and still records the save", async () => {
    const mock = await developerMock();
    const loose = mock.api.developer.saveSettings as (values: unknown) => ReturnType<typeof mock.api.developer.saveSettings>;
    const before = auditRows(mock, "developer.settings_saved").length;
    for (const body of [null, undefined, "aiDailyLimit=1", [{ aiDailyLimit: 1 }], { apiKey: "secret", aiDailyLimit: undefined }]) {
      const result = await loose(body);
      assert.equal(result.ok, true);
      assert.deepEqual(result.settings, defaultSiteSettings());
    }
    assert.equal(Object.keys(mock.store.settings).length, 25);
    assert.equal(auditRows(mock, "developer.settings_saved").length, before + 5);
  });

  it("applySettingsPatch is pure and validates all 25 keys", () => {
    const defaults = defaultSiteSettings();
    const current = { ...defaults, aiDailyLimit: 77 };
    const next = applySettingsPatch(current, defaults, { aiDailyLimit: "", lessonPlanMaxItems: 999, loginHelpContact: "  @help  " });
    assert.deepEqual(next, { ...defaults, lessonPlanMaxItems: 60, loginHelpContact: "@help" });
    assert.equal(current.aiDailyLimit, 77);
    assert.deepEqual(Object.keys(next).sort(), Object.keys(defaults).sort());
  });

  it("takes effect at once for the other members (coverage: states reached through developer settings)", async () => {
    // 90-addendum-6 §9.2 rule 1: settings are not controls — the planner / check switches are reached here.
    const retry = MOCK_COVERAGE.find((row) => row.key === "plan.retryRefused");
    assert.ok(retry?.steps?.some((step) => step.includes("lessonPlanEnabled / homeworkPlanEnabled = false")));

    const mock = await developerMock();
    await mock.api.developer.saveSettings({
      lessonPlanEnabled: false, homeworkPlanEnabled: false, aiEnabled: false, lessonCheckEnabled: false, maxPhotosPerAssignment: 3, loginHelpContact: "  @new_contact ",
    });
    const live = mock.ctx.settings();
    assert.deepEqual(
      [live.lessonPlanEnabled, live.homeworkPlanEnabled, live.aiEnabled, live.lessonCheckEnabled, live.maxPhotosPerAssignment],
      [false, false, false, false, 3],
    );
    assert.equal((await mock.api.shell.getMeta()).loginHelpContact, "@new_contact");

    // A lowered daily limit is compared with the hits already counted in the window.
    mock.ctx.limits.consumeBudget("api:ai-plans:global", 5);
    await mock.api.developer.saveSettings({ aiPlanDailyLimit: 5 });
    assert.equal(mock.ctx.limits.consumeBudget("api:ai-plans:global").allowed, false);
  });
});

// ───────────────────────────── runAction ─────────────────────────────

describe("developer.runAction", () => {
  it("rejects an unknown action with 400 invalidData and writes nothing", async () => {
    const mock = await developerMock();
    const before = mock.store.auditLogs.count();
    for (const action of ["reset", "", "TEST-AI", undefined, null, 5]) {
      await rejects(mock.api.developer.runAction(action as PanelAction), "invalidData", 400);
    }
    assert.equal(mock.store.auditLogs.count(), before);
    assert.deepEqual([...PANEL_ACTIONS], ["test-ai", "run-retention", "reset-ai-budget", "unfreeze-checks", "flush-caches"]);
  });

  it("answers only { ok, message } for every action", async () => {
    const mock = await developerMock();
    for (const action of PANEL_ACTIONS) {
      const result = await mock.api.developer.runAction(action);
      assert.deepEqual(Object.keys(result).sort(), ["message", "ok"], action);
      assert.equal(result.ok, true, action);
      assert.ok(result.message.length > 0);
    }
  });

  describe("test-ai", () => {
    it("pings the main model and records an AI row", async () => {
      const mock = await developerMock();
      const result = await mock.api.developer.runAction("test-ai");
      assert.deepEqual(result, { ok: true, message: `Модель отвечает: gpt-6.1-sol · ${MOCK_AI_PING_MS} мс.` });

      const row = lastAudit(mock);
      assert.deepEqual([row.category, row.action, row.outcome, row.actorId], ["AI", "developer.ai_ping", "ok", "usr_dev"]);
      assert.deepEqual(row.meta, {
        model: "gpt-6.1-sol", elapsedMs: MOCK_AI_PING_MS, mode: "reasoning", i18n: { key: "developer.ai_ping", params: { model: "gpt-6.1-sol", elapsedMs: MOCK_AI_PING_MS } },
      });
      // The ping is not a priced call: no tokens, no cost.
      assert.deepEqual([row.inputTokens, row.outputTokens, row.costRub, row.error], [null, null, null, null]);

      mock.setLocale("en");
      assert.equal((await mock.api.developer.runAction("test-ai")).message, `The model responds: gpt-6.1-sol · ${MOCK_AI_PING_MS} ms.`);
      await mock.api.developer.saveSettings({ aiModel: "openai/gpt-4o" });
      await mock.api.developer.runAction("test-ai");
      assert.equal(lastAudit(mock).meta?.mode, "classic");
    });

    it("answers ok: false without a journal row when the AI is off or no model is set", async () => {
      const mock = await developerMock();
      await mock.api.developer.saveSettings({ aiEnabled: false });
      const before = mock.store.auditLogs.count();
      assert.deepEqual(await mock.api.developer.runAction("test-ai"), { ok: false, message: RU.aiDisabled });

      await mock.api.developer.saveSettings({ aiEnabled: true, aiModel: "   " });
      mock.setLocale("en");
      assert.deepEqual(await mock.api.developer.runAction("test-ai"), { ok: false, message: EN.aiDisabled });
      assert.equal(auditRows(mock, "developer.ai_ping").length, 0);
      // Only the settings save in between was recorded.
      assert.equal(mock.store.auditLogs.count(), before + 1);
    });

    it("reports a model the provider does not serve as a failed AI row", async () => {
      const mock = await developerMock();
      await mock.api.developer.saveSettings({ aiModel: "sol-9" });
      const result = await mock.api.developer.runAction("test-ai");
      const reason = 'HTTP 404 {"error":{"message":"The model `sol-9` does not exist"}}';
      assert.deepEqual(result, { ok: false, message: `Модель недоступна: ${reason}.` });

      const row = lastAudit(mock);
      assert.deepEqual([row.category, row.action, row.outcome, row.summary], ["AI", "developer.ai_ping", "failed", `Модель недоступна: ${reason}.`]);
      assert.deepEqual(row.meta, { model: "sol-9", status: 404, i18n: { key: "developer.ai_ping_failed", params: { reason } } });

      // The failed row is what the "only errors" filter of the journal shows first.
      const failed = await mock.api.developer.getJournal({ outcome: "failed" });
      assert.deepEqual([failed.entries[0]!.action, failed.entries[0]!.outcome, failed.entries[0]!.category], ["developer.ai_ping", "failed", "AI"]);
      mock.setLocale("en");
      assert.equal((await mock.api.developer.runAction("test-ai")).message, `The model is unavailable: ${reason}.`);
    });
  });

  describe("run-retention", () => {
    it("deletes nothing while auto-delete is off, but stamps the run", async () => {
      const mock = await developerMock();
      mock.clock.advance(90 * MINUTE_MS);
      const before = { files: mock.store.files.count(), photos: mock.store.homeworkPhotos.count() };
      const result = await mock.api.developer.runAction("run-retention");
      assert.deepEqual(result, { ok: true, message: "Автоудаление выполнено: снято ссылок на фото — 0, удалено файлов — 0." });
      assert.deepEqual({ files: mock.store.files.count(), photos: mock.store.homeworkPhotos.count() }, before);

      const row = lastAudit(mock);
      assert.deepEqual([row.category, row.action, row.outcome, row.actorId], ["DATA", "developer.retention_run", "ok", "usr_dev"]);
      assert.deepEqual(row.meta, { submissionPhotos: 0, checkPhotos: 0, lessonPhotos: 0, files: 0, i18n: { key: "developer.retention_run", params: { photos: 0, files: 0 } } });

      const stats = (await mock.api.developer.getPanel()).stats;
      assert.equal(stats.lastRetentionAt, new Date(T0 + 90 * MINUTE_MS).toISOString());
      assert.equal(stats.lastRetentionLabel, "16.11.2026, 13:30");
    });

    it("removes expired photo links of homeworks, checks and lessons and the files nothing uses", async () => {
      const removed: string[] = [];
      const mock = await developerMock({ onFileRemoved: (fileId) => removed.push(fileId) });
      await mock.api.developer.saveSettings({ photoRetentionDays: 1 });
      const cutoff = new Date(T0 - DAY_MS).toISOString();
      const store = mock.store;

      const expired = {
        attached: store.homeworkPhotos.filter((photo) => photo.createdAt < cutoff),
        snapshots: store.homeworkCheckPhotos.filter((photo) => store.homeworkChecks.get(photo.checkId)!.createdAt < cutoff),
        lesson: store.submissionPhotos.filter((photo) => store.submissions.get(photo.submissionId)!.submittedAt < cutoff),
      };
      const kept = {
        attached: store.homeworkPhotos.count() - expired.attached.length,
        snapshots: store.homeworkCheckPhotos.count() - expired.snapshots.length,
        lesson: store.submissionPhotos.count() - expired.lesson.length,
      };
      // The dataset has both kinds in every table, otherwise the test would prove nothing.
      for (const rows of Object.values(expired)) assert.ok(rows.length > 0);
      for (const count of Object.values(kept)) assert.ok(count > 0);
      const filesBefore = store.files.count();
      const topicFileIds = store.topics.all().flatMap((topic) => [topic.theoryFileId, topic.homeworkFileId, topic.answersFileId]).filter((id): id is string => id !== null);

      const result = await mock.api.developer.runAction("run-retention");
      const files = filesBefore - store.files.count();
      assert.ok(files > 0);
      // The message counts homework photos (attached + snapshots); lesson photos are only in `meta`.
      const photos = expired.attached.length + expired.snapshots.length;
      assert.deepEqual(result, { ok: true, message: `Автоудаление выполнено: снято ссылок на фото — ${photos}, удалено файлов — ${files}.` });
      assert.deepEqual(lastAudit(mock).meta, {
        submissionPhotos: expired.attached.length,
        checkPhotos: expired.snapshots.length,
        lessonPhotos: expired.lesson.length,
        files,
        i18n: { key: "developer.retention_run", params: { photos, files } },
      });

      assert.deepEqual([store.homeworkPhotos.count(), store.homeworkCheckPhotos.count(), store.submissionPhotos.count()], [kept.attached, kept.snapshots, kept.lesson]);
      assert.equal(store.homeworkPhotos.some((photo) => photo.createdAt < cutoff), false);
      // A file goes only when no remaining row points at it; topic files are never touched.
      const stillUsed = new Set([...store.homeworkPhotos.all(), ...store.homeworkCheckPhotos.all(), ...store.submissionPhotos.all()].map((photo) => photo.fileId));
      for (const photo of [...expired.attached, ...expired.snapshots, ...expired.lesson]) {
        assert.equal(store.files.has(photo.fileId), stillUsed.has(photo.fileId), photo.fileId);
      }
      for (const fileId of topicFileIds) assert.ok(store.files.has(fileId));
      assert.equal(removed.length, files);
      assert.equal((await mock.api.developer.getPanel()).stats.filesCount, filesBefore - files);

      // A second run finds nothing.
      mock.setLocale("en");
      assert.equal((await mock.api.developer.runAction("run-retention")).message, "Auto-deletion done: photo links removed — 0, files deleted — 0.");
    });

    it("keeps a photo that is exactly as old as the retention period", async () => {
      const mock = await developerMock();
      await mock.api.developer.saveSettings({ photoRetentionDays: 3650 });
      const cutoff = T0 - 3650 * DAY_MS;
      const sample = mock.store.files.get(mock.store.homeworkPhotos.all()[0]!.fileId)!;
      for (const [id, createdAt] of [["edge", cutoff], ["old", cutoff - 1]] as const) {
        mock.store.files.insert({ ...sample, id: `file_test_${id}` });
        mock.store.homeworkPhotos.insert({ id: `hwp_test_${id}`, assignmentId: "hw_ilya_later", fileId: `file_test_${id}`, createdAt: new Date(createdAt).toISOString() });
      }
      const result = await mock.api.developer.runAction("run-retention");
      assert.equal(result.message, "Автоудаление выполнено: снято ссылок на фото — 1, удалено файлов — 1.");
      assert.deepEqual([mock.store.homeworkPhotos.has("hwp_test_edge"), mock.store.files.has("file_test_edge")], [true, true]);
      assert.deepEqual([mock.store.homeworkPhotos.has("hwp_test_old"), mock.store.files.has("file_test_old")], [false, false]);
    });
  });

  describe("reset-ai-budget", () => {
    it("clears the homework-check bucket only and leaves the 24-hour tile alone", async () => {
      const mock = await developerMock();
      for (const scope of ["api:homework-checks:global", "api:lesson-checks:global", "api:ai-plans:global"]) mock.api.controls.exhaust(scope, "global");
      // The per-student hourly bucket is a different scope.
      mock.api.controls.exhaust("api:homework-checks", "usr_ilya");
      const before = await mock.api.developer.getPanel();
      assert.deepEqual(before.aiBudgets!.map((budget) => budget.used), [300, 300, 300]);

      const result = await mock.api.developer.runAction("reset-ai-budget");
      assert.deepEqual(result, { ok: true, message: RU.budgetReset });
      const row = lastAudit(mock);
      assert.deepEqual([row.category, row.action, row.outcome, row.actorId, row.summary], ["DATA", "developer.ai_budget_reset", "ok", "usr_dev", RU.budgetReset]);

      const after = await mock.api.developer.getPanel();
      assert.deepEqual(after.aiBudgets!.map((budget) => budget.used), [0, 300, 300]);
      assert.equal(after.stats.checksLastDay, before.stats.checksLastDay);
      assert.equal(mock.store.homeworkChecks.count(), 12);
      assert.equal(mock.ctx.limits.check("api:homework-checks", "usr_ilya").allowed, false);

      // A full daily limit is available again; the two other budgets still refuse.
      assert.deepEqual(mock.ctx.limits.consumeBudget("api:homework-checks:global"), { allowed: true, remaining: 299, retryAfterMs: 0, resetAt: Date.parse(after.aiBudgets![0]!.resetAt) });
      assert.equal(mock.ctx.limits.consumeBudget("api:lesson-checks:global").allowed, false);
      assert.equal(mock.ctx.limits.consumeBudget("api:ai-plans:global").allowed, false);

      mock.setLocale("en");
      assert.equal((await mock.api.developer.runAction("reset-ai-budget")).message, EN.budgetReset);
    });
  });

  describe("reset-ai-budget with the student member", () => {
    it("reopens homework checks for the students; the tile counts rows, the bucket counts attempts", async () => {
      const mock = createTestMock();
      mock.api.controls.exhaust("api:homework-checks:global", "global");
      await mock.signIn("polina@example.com");
      // `hw_polina_limit` has photos attached and no check running.
      const refused = await rejects(mock.api.studentWork.startHomeworkCheck("hw_polina_limit"), "rateLimited", 429);
      // Until 00:00 UTC — the fixed window, 15 hours after the seed moment.
      assert.equal(refused.retryAfterSeconds, 15 * 3600);

      await mock.signIn(DEVELOPER);
      const exhausted = await mock.api.developer.getPanel();
      // The refused attempt stays in the bucket; its row was rolled back, so the tile did not move.
      assert.equal(exhausted.aiBudgets![0]!.used, 301);
      assert.equal(exhausted.stats.checksLastDay, 4);
      assert.equal((await mock.api.developer.runAction("reset-ai-budget")).ok, true);

      await mock.signIn("polina@example.com");
      const started = await mock.api.studentWork.startHomeworkCheck("hw_polina_limit");
      assert.equal(started.check.status, "PENDING");

      await mock.signIn(DEVELOPER);
      const after = await mock.api.developer.getPanel();
      assert.equal(after.aiBudgets![0]!.used, 1);
      assert.equal(after.stats.checksLastDay, 5);
      assert.equal(after.stats.queueLength, exhausted.stats.queueLength + 1);
    });
  });

  describe("unfreeze-checks", () => {
    it("fails PENDING and CHECKING homework checks older than 15 minutes, strictly", async () => {
      const mock = await developerMock();
      const store = mock.store;
      const running = store.homeworkChecks.get("chk_artem_running_1")!;
      assert.deepEqual([running.status, running.createdAt], ["CHECKING", new Date(T0 - 20_000).toISOString()]);
      assert.ok(store.jobs.by("refId", running.id).length > 0);

      // Nothing is stale at the seed moment.
      assert.deepEqual(await mock.api.developer.runAction("unfreeze-checks"), { ok: true, message: "Зависших проверок снято: 0." });
      assert.deepEqual(lastAudit(mock).meta, { count: 0, i18n: { key: "developer.checks_unfrozen", params: { count: 0 } } });

      // Exactly 15 minutes old is not "older than 15 minutes".
      mock.clock.set(Date.parse(running.createdAt) + STALE_CHECK_UNFREEZE_MS);
      assert.equal((await mock.api.developer.runAction("unfreeze-checks")).message, "Зависших проверок снято: 0.");
      assert.equal(store.homeworkChecks.get(running.id)!.status, "CHECKING");

      mock.clock.advance(1);
      const now = mock.ctx.nowIso();
      store.homeworkChecks.insert({ id: "chk_test_stale", assignmentId: "hw_ilya_later", status: "PENDING", activeSlot: 1, modelUsed: null, error: null, createdAt: new Date(mock.clock.now() - 16 * MINUTE_MS).toISOString(), checkedAt: null });
      store.homeworkChecks.insert({ id: "chk_test_fresh", assignmentId: "hw_ilya_done", status: "PENDING", activeSlot: 1, modelUsed: null, error: null, createdAt: new Date(mock.clock.now() - 5 * MINUTE_MS).toISOString(), checkedAt: null });
      mock.ctx.limits.consumeBudget("api:homework-checks:global", 5);
      const finished = store.homeworkChecks.filter((check) => check.status === "DONE" || check.status === "FAILED").map((check) => ({ ...check }));
      const lessonSubmissions = store.submissions.filter((row) => row.status === "PENDING" || row.status === "CHECKING").map((row) => ({ ...row }));
      assert.ok(lessonSubmissions.length >= 2);

      const result = await mock.api.developer.runAction("unfreeze-checks");
      assert.deepEqual(result, { ok: true, message: "Зависших проверок снято: 2." });
      for (const id of [running.id, "chk_test_stale"]) {
        const check = store.homeworkChecks.get(id)!;
        assert.deepEqual([check.status, check.activeSlot, check.error, check.checkedAt], ["FAILED", null, UNFROZEN_CHECK_ERROR, now], id);
        // The deferred transitions of a cleared check never run.
        assert.equal(store.jobs.by("refId", id).length, 0);
        assert.equal(store.rowScripts.has(id), false);
      }
      assert.equal(UNFROZEN_CHECK_ERROR, "Проверка снята разработчиком как зависшая. Запустите её заново.");
      assert.deepEqual([store.homeworkChecks.get("chk_test_fresh")!.status, store.homeworkChecks.get("chk_test_fresh")!.activeSlot], ["PENDING", 1]);
      // Finished checks and the lesson submissions (a different table on the site too) are not touched.
      for (const check of finished) assert.deepEqual(store.homeworkChecks.get(check.id), check);
      for (const row of lessonSubmissions) assert.deepEqual(store.submissions.get(row.id), row);
      // No budget slot is given back.
      assert.equal((await mock.api.developer.getPanel()).aiBudgets![0]!.used, 5);

      const row = auditRows(mock, "developer.checks_unfrozen").at(-1)!;
      assert.deepEqual([row.category, row.outcome, row.actorId, row.summary], ["DATA", "ok", "usr_dev", "Зависших проверок снято: 2."]);
      assert.deepEqual(row.meta, { count: 2, i18n: { key: "developer.checks_unfrozen", params: { count: 2 } } });

      // The assignment is free for a new check: the active slot is released.
      assert.equal(mock.ctx.q.activeHomeworkCheck("hw_ilya_later"), undefined);
      mock.setLocale("en");
      assert.equal((await mock.api.developer.runAction("unfreeze-checks")).message, "Stuck checks cleared: 0.");
    });
  });

  describe("flush-caches", () => {
    it("only records the action", async () => {
      const mock = await developerMock();
      const snapshot = () => JSON.stringify({ ...mock.store.snapshot().tables, auditLogs: [], sessions: [] });
      const before = snapshot();
      assert.deepEqual(await mock.api.developer.runAction("flush-caches"), { ok: true, message: RU.cachesFlushed });
      assert.equal(snapshot(), before);
      const row = lastAudit(mock);
      assert.deepEqual([row.category, row.action, row.outcome, row.actorId, row.summary], ["DATA", "developer.caches_flushed", "ok", "usr_dev", RU.cachesFlushed]);
      mock.setLocale("en");
      assert.equal((await mock.api.developer.runAction("flush-caches")).message, EN.cachesFlushed);
    });
  });
});

// ───────────────────────────── broadcast ─────────────────────────────

describe("developer.broadcast", () => {
  const broadcasts = (mock: TestMock, title: string) => mock.store.notifications.filter((row) => row.type === "broadcast" && row.title === title);

  it("sends one notification to every student, as typed, without a realtime event", async () => {
    const mock = await developerMock();
    const events: RealtimeEvent[] = [];
    // A developer's stream receives every event the backend publishes.
    const unsubscribe = mock.api.shell.subscribeRealtime((event) => events.push(event));
    await settle();
    mock.clock.advance(5 * MINUTE_MS);

    const result = await mock.api.developer.broadcast({ title: "  Завтра занятия не будет  ", body: " Перенос на пятницу ", toAll: true, recipientIds: ["usr_anna"] });
    assert.deepEqual(result, { ok: true, message: "Уведомление отправлено ученикам: 10.", count: 10 });

    const rows = broadcasts(mock, "Завтра занятия не будет");
    assert.equal(rows.length, 10);
    assert.deepEqual(rows.map((row) => row.userId).sort(), mock.store.users.by("role", "STUDENT").map((user) => user.id).sort());
    for (const row of rows) {
      assert.deepEqual(
        { body: row.body, href: row.href, params: row.params, readAt: row.readAt, createdAt: row.createdAt },
        { body: "Перенос на пятницу", href: null, params: null, readAt: null, createdAt: new Date(T0 + 5 * MINUTE_MS).toISOString() },
      );
    }

    const audit = lastAudit(mock);
    assert.deepEqual([audit.category, audit.action, audit.outcome, audit.actorId, audit.summary], ["DATA", "developer.broadcast_sent", "ok", "usr_dev", "Уведомление отправлено ученикам: 10."]);
    assert.deepEqual(audit.meta, { recipients: 10, toAll: true, title: "Завтра занятия не будет", i18n: { key: "developer.broadcast_sent", params: { count: 10 } } });

    await settle();
    assert.deepEqual(events, []);
    unsubscribe();

    // A student sees it in the bell at the next read — untranslated, with no target.
    await mock.signIn(ILYA);
    mock.setLocale("en");
    const bell = await mock.api.shell.listNotifications();
    const item = bell.notifications[0]!;
    assert.deepEqual(
      { type: item.type, title: item.title, body: item.body, target: item.target, href: item.href, readAt: item.readAt },
      { type: "broadcast", title: "Завтра занятия не будет", body: "Перенос на пятницу", target: null, href: null, readAt: null },
    );
  });

  it("sends to the selected students only and drops ids that are not students", async () => {
    const mock = await developerMock();
    const unreadBefore = mock.store.notifications.count((row) => row.userId === "usr_ilya" && row.readAt === null);
    const result = await mock.api.developer.broadcast({ title: "Проверьте ДЗ", toAll: false, recipientIds: ["usr_ilya", " usr_maria ", "usr_ilya", "usr_anna", "usr_dev", "nobody", ""] });
    assert.deepEqual(result, { ok: true, message: "Уведомление отправлено ученикам: 2.", count: 2 });
    const rows = broadcasts(mock, "Проверьте ДЗ");
    assert.deepEqual(rows.map((row) => row.userId).sort(), ["usr_ilya", "usr_maria"]);
    // An empty body is stored as null.
    assert.deepEqual(rows.map((row) => row.body), [null, null]);
    assert.equal(mock.store.notifications.count((row) => row.userId === "usr_ilya" && row.readAt === null), unreadBefore + 1);
    assert.deepEqual(lastAudit(mock).meta, { recipients: 2, toAll: false, title: "Проверьте ДЗ", i18n: { key: "developer.broadcast_sent", params: { count: 2 } } });

    // Only non-students selected: still a successful send to nobody, like the site.
    mock.setLocale("en");
    const nobody = await mock.api.developer.broadcast({ title: "Staff only", body: "   ", toAll: false, recipientIds: ["usr_anna", "usr_dev"] });
    assert.deepEqual(nobody, { ok: true, message: "Notification sent to students: 0.", count: 0 });
    assert.equal(broadcasts(mock, "Staff only").length, 0);
    assert.equal(lastAudit(mock).action, "developer.broadcast_sent");
  });

  it("refuses an empty title or an empty selection with ok: false and no journal row", async () => {
    const mock = await developerMock();
    const before = { audit: mock.store.auditLogs.count(), notifications: mock.store.notifications.count() };
    const loose = mock.api.developer.broadcast as (input: unknown) => ReturnType<typeof mock.api.developer.broadcast>;
    const invalid: unknown[] = [
      { title: "", toAll: true },
      { title: "    ", body: "текст", toAll: true },
      { title: "Заголовок", toAll: false },
      { title: "Заголовок", toAll: false, recipientIds: [] },
      { title: "Заголовок", toAll: false, recipientIds: ["", "  "] },
      // Only a real `true` means "all students".
      { title: "Заголовок", toAll: "on" },
      { title: 42, toAll: true },
      {},
      null,
    ];
    for (const input of invalid) {
      assert.deepEqual(await loose(input), { ok: false, message: RU.broadcastInvalid }, JSON.stringify(input));
    }
    mock.setLocale("en");
    assert.deepEqual(await mock.api.developer.broadcast({ title: "", toAll: true }), { ok: false, message: EN.broadcastInvalid });
    assert.deepEqual({ audit: mock.store.auditLogs.count(), notifications: mock.store.notifications.count() }, before);
  });

  it("cuts the title to 120 and the body to 300 characters", async () => {
    const mock = await developerMock();
    assert.deepEqual(LIMITS.broadcast, { titleMinLength: 1, titleMaxLength: 120, bodyMaxLength: 300 });

    await mock.api.developer.broadcast({ title: "т".repeat(120), body: "б".repeat(300), toAll: false, recipientIds: ["usr_ilya"] });
    const exact = broadcasts(mock, "т".repeat(120));
    assert.equal(exact.length, 1);
    assert.equal(exact[0]!.body, "б".repeat(300));

    await mock.api.developer.broadcast({ title: `${"з".repeat(120)}хвост`, body: `${"д".repeat(300)}хвост`, toAll: false, recipientIds: ["usr_maria"] });
    const cut = broadcasts(mock, "з".repeat(120));
    assert.equal(cut.length, 1);
    assert.equal(cut[0]!.body, "д".repeat(300));
    assert.equal(lastAudit(mock).meta?.title, "з".repeat(120));

    // One character is enough.
    assert.equal((await mock.api.developer.broadcast({ title: "!", toAll: false, recipientIds: ["usr_ilya"] })).count, 1);
  });
});

// ───────────────────────────── getJournal ─────────────────────────────

const ENTRY_KEYS = [
  "action", "actionLabel", "actorName", "actorRole", "category", "costRub", "createdAt", "error", "id", "inputTokens", "meta", "outcome",
  "outputTokens", "progressRef", "progressTarget", "summary",
];

describe("developer.getJournal", () => {
  const within = (mock: TestMock, days: number) => mock.store.auditLogs.filter((row) => days === 0 || row.createdAt >= new Date(mock.clock.now() - days * DAY_MS).toISOString());

  /** Every page of a query, in order. */
  async function allEntries(mock: TestMock, query: Parameters<TestMock["api"]["developer"]["getJournal"]>[0]): Promise<JournalEntry[]> {
    const first = await mock.api.developer.getJournal(query);
    const entries = [...first.entries];
    for (let page = 2; page <= first.pageCount; page += 1) entries.push(...(await mock.api.developer.getJournal({ ...query, page })).entries);
    return entries;
  }

  it("lists the last week by default, newest first, 50 per page", async () => {
    const mock = await developerMock();
    const journal = await mock.api.developer.getJournal({});
    const expected = within(mock, 7);

    assert.deepEqual(Object.keys(journal).sort(), ["actors", "entries", "page", "pageCount", "pageSize", "retentionDays", "total"]);
    assert.deepEqual([journal.total, journal.page, journal.pageSize, journal.pageCount, journal.retentionDays], [expected.length, 1, 50, 1, AUDIT_RETENTION_DAYS]);
    assert.equal(AUDIT_RETENTION_DAYS, 90);
    assert.equal(LIMITS.journalPageSize, 50);
    assert.ok(expected.length > 30 && expected.length < mock.store.auditLogs.count());
    assert.equal(journal.entries.length, expected.length);
    assert.deepEqual(journal.entries.map((entry) => entry.id).sort(), expected.map((row) => row.id).sort());
    for (let index = 1; index < journal.entries.length; index += 1) {
      assert.ok(journal.entries[index - 1]!.createdAt >= journal.entries[index]!.createdAt);
    }
    // The newest row is the developer's own sign-in.
    const top = journal.entries[0]!;
    assert.deepEqual(Object.keys(top).sort(), ENTRY_KEYS);
    assert.deepEqual(top, {
      id: top.id, createdAt: TEST_T0, category: "AUTH", action: "auth.login", actionLabel: "Вход в систему", outcome: "ok",
      actorName: "Разработчик ШБЗ", actorRole: "DEVELOPER", progressTarget: null, summary: "Вход в систему", progressRef: null,
      meta: { i18n: { key: "auth.login" } }, error: null, inputTokens: null, outputTokens: null, costRub: null,
    });
  });

  it("offers the users that have journal rows as actors, by name", async () => {
    const mock = await developerMock();
    const { actors } = await mock.api.developer.getJournal({ days: 1 });
    const ids = new Set(mock.store.auditLogs.all().flatMap((row) => (row.actorId ? [row.actorId] : [])));
    // The list does not depend on the filters.
    assert.equal(actors.length, ids.size);
    assert.deepEqual(actors.map((actor) => actor.name), [...actors.map((actor) => actor.name)].sort((a, b) => a.localeCompare(b, "ru")));
    for (const actor of actors) {
      assert.deepEqual(Object.keys(actor).sort(), ["id", "name", "role"]);
      assert.equal(mock.store.users.get(actor.id)?.role, actor.role);
    }
    assert.deepEqual(new Set(actors.map((actor) => actor.role)), new Set(["TEACHER", "STUDENT", "DEVELOPER"]));
    // A user without rows is not offered; a deleted user disappears from the list.
    assert.equal(actors.some((actor) => actor.id === "usr_olga"), false);
    mock.ctx.cascade.deleteStudent("usr_ilya");
    assert.equal((await mock.api.developer.getJournal({})).actors.some((actor) => actor.id === "usr_ilya"), false);
  });

  it("filters by category, actor, action substring and outcome", async () => {
    const mock = await developerMock();
    const all = mock.store.auditLogs.all();

    for (const category of ["AI", "DATA", "AUTH"] as const) {
      const entries = await allEntries(mock, { days: 0, category });
      assert.equal(entries.length, all.filter((row) => row.category === category).length);
      assert.ok(entries.length > 0 && entries.every((entry) => entry.category === category));
    }
    // Anything else is "no filter".
    const loose = mock.api.developer.getJournal as (query: Record<string, unknown>) => ReturnType<typeof mock.api.developer.getJournal>;
    for (const category of ["ai", "ALL", "", 7, null]) assert.equal((await loose({ days: 0, category })).total, all.length);

    const anna = await allEntries(mock, { days: 0, actor: "usr_anna" });
    assert.equal(anna.length, all.filter((row) => row.actorId === "usr_anna").length);
    assert.ok(anna.length > 5 && anna.every((entry) => entry.actorName === "Анна Петрова" && entry.actorRole === "TEACHER"));
    assert.equal((await mock.api.developer.getJournal({ days: 0, actor: "usr_nobody" })).total, 0);
    assert.equal((await mock.api.developer.getJournal({ days: 0, actor: "   " })).total, all.length);

    const plans = await allEntries(mock, { days: 0, action: " lesson_plan " });
    assert.deepEqual([...new Set(plans.map((entry) => entry.action))].sort(), ["lesson_plan.generate", "lesson_plan.shortlist"]);
    // A substring of the system name, case-sensitive.
    assert.equal((await mock.api.developer.getJournal({ days: 0, action: "plan" })).total, all.filter((row) => row.action.includes("plan")).length);
    assert.equal((await mock.api.developer.getJournal({ days: 0, action: "LESSON_PLAN" })).total, 0);
    // The label is not searched: «Вход» finds nothing, "auth." finds the sign-ins.
    assert.equal((await mock.api.developer.getJournal({ days: 0, action: "Вход" })).total, 0);
    assert.equal((await mock.api.developer.getJournal({ days: 0, action: "auth." })).total, all.filter((row) => row.category === "AUTH").length);

    const failed = await allEntries(mock, { days: 0, outcome: "failed" });
    assert.equal(failed.length, all.filter((row) => row.outcome === "failed").length);
    assert.ok(failed.length >= 7 && failed.every((entry) => entry.outcome === "failed"));
    assert.equal((await loose({ days: 0, outcome: "ok" })).total, all.length);

    const combined = await mock.api.developer.getJournal({ days: 0, category: "AI", outcome: "failed", action: "solution" });
    assert.equal(combined.total, 3);
    assert.deepEqual(combined.entries.map((entry) => entry.error), ["Provider responded with статус 429: rate limit exceeded", "insufficient quota", "Request timed out"]);
    assert.ok(combined.entries.every((entry) => entry.summary === "Автопроверка не удалась" && entry.actorName === "Автопроверка" && entry.actorRole === null));
  });

  it("parses the period: 0 is all time, 0..365 floored, anything else is a week; the boundary row is included", async () => {
    const mock = await developerMock();
    const total = async (days: unknown) => (await (mock.api.developer.getJournal as (query: Record<string, unknown>) => ReturnType<typeof mock.api.developer.getJournal>)({ days })).total;
    const everything = mock.store.auditLogs.count();
    const week = within(mock, 7).length;

    assert.equal(await total(0), everything);
    assert.equal(await total(365), everything);
    assert.equal(await total(1), within(mock, 1).length);
    assert.equal(await total(1.9), within(mock, 1).length);
    assert.equal(await total(30), within(mock, 30).length);
    assert.equal(await total("30"), within(mock, 30).length);
    assert.ok(within(mock, 1).length < week && week < within(mock, 30).length);
    for (const invalid of [366, -1, Number.NaN, "", "week", null, undefined]) assert.equal(await total(invalid), week, String(invalid));
    assert.deepEqual(LIMITS.journalDays, { min: 0, max: 365, default: 7 });

    // A row written exactly `days` × 24 h ago is still inside the period.
    mock.clock.advance(HOUR_MS);
    const marker = mock.ctx.audit.write({ category: "DATA", action: "test.boundary", summary: "граница" });
    mock.clock.advance(DAY_MS);
    assert.equal((await mock.api.developer.getJournal({ days: 1, action: "test.boundary" })).total, 1);
    mock.clock.advance(1);
    assert.equal((await mock.api.developer.getJournal({ days: 1, action: "test.boundary" })).total, 0);
    const found = await mock.api.developer.getJournal({ days: 2, action: "test.boundary" });
    // No template and no label: the stored summary and the raw action name.
    assert.deepEqual([found.entries[0]!.id, found.entries[0]!.actionLabel, found.entries[0]!.summary, found.entries[0]!.actorName], [marker.id, null, "граница", null]);
  });

  it("pages by 50 and answers a page past the end as asked, empty", async () => {
    const mock = await developerMock();
    const everything = mock.store.auditLogs.count();
    assert.ok(everything > 50 && everything <= 100);

    const first = await mock.api.developer.getJournal({ days: 0 });
    const second = await mock.api.developer.getJournal({ days: 0, page: 2 });
    assert.deepEqual([first.total, first.page, first.pageCount, first.entries.length], [everything, 1, 2, 50]);
    assert.deepEqual([second.total, second.page, second.pageCount, second.entries.length], [everything, 2, 2, everything - 50]);
    assert.equal(new Set([...first.entries, ...second.entries].map((entry) => entry.id)).size, everything);
    assert.ok(first.entries.at(-1)!.createdAt >= second.entries[0]!.createdAt);

    const beyond = await mock.api.developer.getJournal({ days: 0, page: 3 });
    assert.deepEqual([beyond.entries.length, beyond.page, beyond.pageCount, beyond.total], [0, 3, 2, everything]);

    const loose = mock.api.developer.getJournal as (query: Record<string, unknown>) => ReturnType<typeof mock.api.developer.getJournal>;
    for (const page of [0, -3, 1.7, "x", null, undefined, Number.NaN]) assert.equal((await loose({ days: 0, page })).page, 1, String(page));
    assert.equal((await loose({ days: 0, page: "2" })).page, 2);
    assert.equal((await loose({ days: 0, page: 2.9 })).page, 2);

    // Exactly 100 rows are two full pages; one more opens a third.
    while (mock.store.auditLogs.count() < 100) mock.ctx.audit.write({ category: "DATA", action: "test.fill" });
    assert.equal((await mock.api.developer.getJournal({ days: 0 })).pageCount, 2);
    mock.ctx.audit.write({ category: "DATA", action: "test.fill" });
    const third = await mock.api.developer.getJournal({ days: 0, page: 3 });
    assert.deepEqual([third.pageCount, third.entries.length], [3, 1]);
    // An empty result still has one page.
    assert.deepEqual([(await mock.api.developer.getJournal({ action: "no.such.action" })).pageCount, (await mock.api.developer.getJournal({ action: "no.such.action" })).total], [1, 0]);
  });

  it("orders rows written at the same instant newest first", async () => {
    const mock = await developerMock();
    await mock.api.developer.runAction("flush-caches");
    await mock.api.developer.runAction("reset-ai-budget");
    const { entries } = await mock.api.developer.getJournal({ days: 1 });
    assert.deepEqual(entries.slice(0, 3).map((entry) => entry.action), ["developer.ai_budget_reset", "developer.caches_flushed", "auth.login"]);
    assert.deepEqual(entries.slice(0, 2).map((entry) => entry.actionLabel), ["Панель: сброс бюджета ИИ", "Панель: сброс кэшей"]);
  });

  it("renders labels, summaries and system actors for the request language", async () => {
    const mock = await developerMock();
    // Lazy finalisation writes progress.status rows with the system actor «Автозавершение урока».
    mock.ctx.lessons.finalizeDue({ lessonId: "les_g_unfinalized" });
    const russian = await allEntries(mock, { days: 0 });
    mock.setLocale("en");
    const english = await allEntries(mock, { days: 0 });
    assert.deepEqual(english.map((entry) => entry.id), russian.map((entry) => entry.id));
    const pick = (entries: JournalEntry[], id: string) => entries.find((entry) => entry.id === id)!;
    const idOf = (predicate: (row: AuditLog) => boolean) => mock.store.auditLogs.find(predicate)!.id;

    const check = idOf((row) => row.action === "solution.check" && row.outcome === "ok");
    assert.deepEqual([pick(russian, check).actionLabel, pick(russian, check).actorName], ["Автопроверка ДЗ", "Автопроверка"]);
    assert.deepEqual([pick(english, check).actionLabel, pick(english, check).actorName], ["Homework AI check", "AI check"]);
    assert.match(pick(russian, check).summary!, /^Автопроверка: верно \d+, с ошибкой \d+, не распознано \d+$/);
    assert.match(pick(english, check).summary!, /^AI check: correct \d+, incorrect \d+, unrecognised \d+$/);

    const autoFinish = idOf((row) => row.action === "lesson.auto_results");
    // As on the site, the row has no actor: the journal shows «—».
    assert.equal(pick(russian, autoFinish).actorName, null);
    assert.equal(pick(english, autoFinish).actionLabel, "Lesson results closed automatically");
    const lessonEnd = idOf((row) => row.action === "progress.status" && row.actorName === "Автозавершение урока");
    assert.equal(pick(russian, lessonEnd).actorName, "Автозавершение урока");
    assert.equal(pick(english, lessonEnd).actorName, "Lesson auto-finish");
    // No template text for the row: the target label is the fallback.
    const itemCheck = idOf((row) => row.action === "lesson_item.check");
    assert.match(pick(english, itemCheck).summary!, /^Classwork: problem \d+ — (correct|incorrect|unrecognised)$/);

    // Old rows without `meta.i18n`: a parameter-less template is translated, any other text stays as stored.
    const legacySaved = idOf((row) => row.action === "developer.settings_saved" && row.meta === null);
    assert.equal(pick(russian, legacySaved).summary, RU.settingsSaved);
    assert.equal(pick(english, legacySaved).summary, EN.settingsSaved);
    assert.equal(pick(english, legacySaved).meta, null);
    const legacyStudent = idOf((row) => row.summary === "Создан ученик Тестовый Ученик");
    assert.equal(pick(english, legacyStudent).summary, "Создан ученик Тестовый Ученик");
    // Seeded rows carry the site's action names (07 §4.6), so they get their labels.
    assert.equal(pick(english, legacyStudent).action, "student.create");
    assert.equal(pick(english, legacyStudent).actionLabel, "Student created");
    assert.equal(pick(russian, legacyStudent).actionLabel, "Создание ученика");
    // Every seeded DATA row uses a name the journal has a label for (none is left with a template key).
    assert.deepEqual(
      russian.filter((entry) => entry.category === "DATA" && entry.actionLabel === null).map((entry) => entry.action),
      [],
    );
    const seededTopicDelete = idOf((row) => row.action === "topic.delete" && row.targetLabel === "Пробная тема");
    assert.equal(pick(russian, seededTopicDelete).actionLabel, "Удаление темы");

    const failedLogin = idOf((row) => row.action === "auth.login" && row.outcome === "failed");
    assert.match(pick(russian, failedLogin).summary!, /^Неудачный вход: \S+@\S+$/);
    assert.match(pick(english, failedLogin).summary!, /^Failed sign-in: \S+@\S+$/);
    assert.deepEqual([pick(english, failedLogin).actorName, pick(english, failedLogin).actorRole, pick(english, failedLogin).actionLabel], [null, null, "Sign in"]);

    // A date parameter is formatted in Moscow time for the language.
    const scheduled = idOf((row) => row.action === "lesson.schedule");
    assert.equal(pick(russian, scheduled).summary, "Время урока: 08.11.2026, 17:00");
    assert.equal(pick(english, scheduled).summary, "Lesson time: 08/11/2026, 17:00");
  });

  it("passes tokens and cost of AI rows through and nothing for the others", async () => {
    const mock = await developerMock();
    const entries = await allEntries(mock, { days: 0 });
    const byId = new Map(mock.store.auditLogs.all().map((row) => [row.id, row]));
    let priced = 0;
    for (const entry of entries) {
      const row = byId.get(entry.id)!;
      assert.deepEqual([entry.inputTokens, entry.outputTokens, entry.costRub, entry.error], [row.inputTokens, row.outputTokens, row.costRub, row.error]);
      if (entry.category !== "AI") assert.deepEqual([entry.inputTokens, entry.outputTokens, entry.costRub], [null, null, null]);
      if (entry.costRub !== null) {
        priced += 1;
        // A decimal as a string, four places.
        assert.match(entry.costRub, /^\d+\.\d{4}$/);
        assert.equal(typeof entry.inputTokens, "number");
      }
    }
    assert.ok(priced >= 20);
  });

  it("links a progress.status row to its history: target line and reference", async () => {
    const mock = await developerMock();
    const seeded = (await mock.api.developer.getJournal({ days: 0, action: "progress.status" })).entries;
    assert.equal(seeded.length, 4);
    // The seeded row that points at a stored history event (its meta predates the ids).
    const linked = seeded.filter((entry) => entry.progressTarget !== null);
    assert.equal(linked.length, 1);
    assert.deepEqual(
      [linked[0]!.progressTarget, linked[0]!.progressRef, linked[0]!.summary, linked[0]!.actorName, linked[0]!.actionLabel],
      ["Илья Смирнов · № 118 · Линейные уравнения", { studentId: "usr_ilya", homeworkNumberId: "num_118" }, "Проверка ДЗ: Без отметки → Не решил. Статус изменён", "Автопроверка", "Решение об изменении прогресса"],
    );
    // Rows without a target event and without ids in meta open nothing.
    for (const entry of seeded.filter((row) => row.progressTarget === null)) assert.equal(entry.progressRef, null);

    // A live change: the row written by the progress rule carries the pair in meta.
    const anna = mock.store.users.get("usr_anna")!;
    mock.clock.advance(MINUTE_MS);
    const written = mock.ctx.progress.write({ source: "teacher", status: "GREEN", studentId: "usr_maria", homeworkNumberId: "num_118", actor: anna });
    const number = mock.store.numbers.get("num_118")!;
    const topic = mock.store.topics.get(number.topicId)!;
    const live = (await mock.api.developer.getJournal({ days: 1, action: "progress" })).entries[0]!;
    assert.equal(live.progressTarget, `Мария Волкова · № ${number.number} · ${topic.title}`);
    assert.deepEqual(live.progressRef, { studentId: "usr_maria", homeworkNumberId: "num_118" });
    assert.deepEqual([live.category, live.action, live.actorName, live.actorRole, live.outcome], ["DATA", "progress.status", "Анна Петрова", "TEACHER", "ok"]);
    assert.equal(live.meta?.eventId, written.event.id);
    assert.equal(live.meta?.studentId, "usr_maria");
    assert.match(live.summary!, /^Отметка учителя: .+ → Решил\. /);
    mock.setLocale("en");
    const english = (await mock.api.developer.getJournal({ days: 1, action: "progress" })).entries[0]!;
    assert.match(english.summary!, /^Teacher's mark: .+ → Solved\. /);
    assert.equal(english.actionLabel, "Progress change decision");
    // The pair is exactly what the progress-history endpoint takes.
    const history = await mock.api.teacherStudents.getProgressHistory("usr_maria", "num_118");
    assert.equal(history.entries[0]!.id, written.event.id);

    // The history event is gone with the student: no bold line, the reference from meta stays (site rule).
    mock.ctx.cascade.deleteStudent("usr_maria");
    const orphaned = (await mock.api.developer.getJournal({ days: 1, action: "progress" })).entries[0]!;
    assert.equal(orphaned.progressTarget, null);
    assert.deepEqual(orphaned.progressRef, { studentId: "usr_maria", homeworkNumberId: "num_118" });
  });

  it("returns a copy of meta and never the stored-only columns or personal data", async () => {
    const mock = await developerMock();
    const stored = mock.ctx.audit.write({ category: "DATA", action: "test.meta", meta: { nested: { value: 1 } }, model: "gpt-6.1-sol", durationMs: 1200 });
    const entry = (await mock.api.developer.getJournal({ action: "test.meta" })).entries[0]!;
    assert.deepEqual(entry.meta, { nested: { value: 1 } });
    (entry.meta!.nested as { value: number }).value = 2;
    assert.deepEqual(mock.store.auditLogs.get(stored.id)!.meta, { nested: { value: 1 } });

    const entries = await allEntries(mock, { days: 0 });
    for (const row of entries) assert.deepEqual(Object.keys(row).sort(), ENTRY_KEYS);
    const wire = JSON.stringify(entries);
    assert.equal(wire.includes("clientIp"), false);
    assert.equal(wire.includes("203.0.113."), false);
    // Parent-call comments are personal data: no journal row carries one.
    const comments = mock.store.parentCalls.all().flatMap((call) => (call.comment ? [call.comment] : []));
    assert.ok(comments.length > 0);
    for (const comment of comments) assert.equal(wire.includes(comment), false);
    // Passwords of the demo accounts never reach the panel either.
    assert.equal(JSON.stringify(await mock.api.developer.getPanel()).includes("student123"), false);
  });

  it("shows what the panel did: every action and the broadcast appear with their labels", async () => {
    const mock = await developerMock();
    mock.clock.advance(MINUTE_MS);
    await mock.api.developer.saveSettings({ aiDailyLimit: 310 });
    for (const action of PANEL_ACTIONS) await mock.api.developer.runAction(action);
    await mock.api.developer.broadcast({ title: "Всем привет", toAll: true });

    const { entries } = await mock.api.developer.getJournal({ days: 1, actor: "usr_dev", action: "developer." });
    assert.deepEqual(
      entries.map((entry) => [entry.action, entry.actionLabel, entry.category]).reverse(),
      [
        ["developer.settings_saved", "Панель: настройки сохранены", "DATA"],
        ["developer.ai_ping", "Панель: проверка связи с ИИ", "AI"],
        ["developer.retention_run", "Панель: очистка по сроку хранения", "DATA"],
        ["developer.ai_budget_reset", "Панель: сброс бюджета ИИ", "DATA"],
        ["developer.checks_unfrozen", "Панель: снятие зависших проверок", "DATA"],
        ["developer.caches_flushed", "Панель: сброс кэшей", "DATA"],
        ["developer.broadcast_sent", "Панель: рассылка уведомлений", "DATA"],
      ],
    );
    assert.ok(entries.every((entry) => entry.actorName === "Разработчик ШБЗ" && entry.actorRole === "DEVELOPER" && entry.outcome === "ok"));
    assert.equal(entries[0]!.summary, "Уведомление отправлено ученикам: 10.");
    assert.deepEqual(entries[0]!.meta, { recipients: 10, toAll: true, title: "Всем привет", i18n: { key: "developer.broadcast_sent", params: { count: 10 } } });
  });
});
