// Pure decisions of the developer panel (src/screens/developer/panel/logic.ts): header chips, status tiles,
// the real AI budgets, the action list and the broadcast form.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";

import type { AiBudgetUsage, DeveloperPanelStats, SiteSettings } from "@/api/types";
import { PANEL_ACTIONS } from "@/api/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { createTestMock } from "@/mock/testing";
import {
  PANEL_ACTION_ROWS,
  STORAGE_WARN_BYTES,
  broadcastRequest,
  budgetPercent,
  budgetRows,
  canSubmitBroadcast,
  filterRecipients,
  panelChips,
  pickedStudents,
  statTiles,
  toggleRecipient,
} from "@/screens/developer/panel/logic";

const ru = getDictionary("ru").planner.devPanel;
const en = getDictionary("en").planner.devPanel;

const stats = (patch: Partial<DeveloperPanelStats> = {}): DeveloperPanelStats => ({
  queueLength: 2,
  checksLastDay: 30,
  studentsCount: 10,
  topicsCount: 4,
  filesCount: 57,
  filesSizeBytes: 12 * 1024 * 1024,
  filesSizeLabel: "12.0 MB",
  lastRetentionAt: null,
  lastRetentionLabel: ru.retentionNever,
  lessonQueueLength: 3,
  ...patch,
});
const settings = { aiDailyLimit: 300 } as SiteSettings;

test("budgetPercent: rounded share of the limit, capped at 100, safe for a zero limit", () => {
  assert.equal(budgetPercent(0, 300), 0);
  assert.equal(budgetPercent(30, 300), 10);
  assert.equal(budgetPercent(1, 300), 0);
  assert.equal(budgetPercent(2, 300), 1);
  assert.equal(budgetPercent(350, 300), 100);
  assert.equal(budgetPercent(1, 0), 100);
});

test("panelChips: queue is always green, AI turns yellow at 80 %, storage above 512 MiB", () => {
  const calm = panelChips(stats(), settings, ru);
  assert.deepEqual(
    calm.map((chip) => [chip.key, chip.tone, chip.label]),
    [
      ["queue", "green", "Очередь: 2"],
      ["ai", "green", "ИИ: 30 / 300 за 24 ч"],
      ["storage", "muted", "Хранилище: 12.0 MB"],
    ],
  );
  assert.equal(panelChips(stats({ checksLastDay: 239 }), settings, ru)[1]?.tone, "green");
  assert.equal(panelChips(stats({ checksLastDay: 240 }), settings, ru)[1]?.tone, "yellow");
  assert.equal(panelChips(stats({ filesSizeBytes: STORAGE_WARN_BYTES }), settings, ru)[2]?.tone, "muted");
  assert.equal(panelChips(stats({ filesSizeBytes: STORAGE_WARN_BYTES + 1 }), settings, ru)[2]?.tone, "yellow");
  assert.equal(panelChips(stats(), settings, en)[1]?.label, "AI: 30 / 300 in 24 h");
});

test("statTiles: the seven blocks in the site's order, the bar only on the 24-hour tile", () => {
  const tiles = statTiles(stats(), settings, ru.status, "МСК");
  assert.deepEqual(
    tiles.map((tile) => tile.key),
    ["queue", "runs24h", "lessonQueue", "files", "students", "topics", "lastRetention"],
  );
  const runs = tiles[1];
  assert.equal(runs?.value, "30");
  assert.equal(runs?.valueSuffix, "/ 300");
  assert.equal(runs?.percent, 10);
  assert.equal(runs?.hint, "дневной бюджет ИИ");
  assert.deepEqual(
    tiles.filter((tile) => tile.percent !== undefined).map((tile) => tile.key),
    ["runs24h"],
  );
  assert.equal(tiles[3]?.hint, "12.0 MB");
  assert.equal(tiles[4]?.hint, undefined);
  assert.deepEqual(
    tiles.filter((tile) => tile.wide).map((tile) => tile.key),
    ["lastRetention"],
  );
  // "Not run yet" is not a time: no zone mark. A date-time is Moscow time and says so.
  assert.equal(tiles[6]?.value, "ещё не выполнялся");
  const ran = statTiles(stats({ lastRetentionAt: "2026-11-11T08:10:00.000Z", lastRetentionLabel: "11.11.2026, 11:10" }), settings, ru.status, "МСК");
  assert.equal(ran[6]?.value, "11.11.2026, 11:10 МСК");
});

test("budgetRows: bucket counters with their own state, in the server's order; an absent list gives none", () => {
  const budgets: AiBudgetUsage[] = [
    { scope: "api:homework-checks:global", limit: 300, used: 300, resetAt: "2026-11-17T00:00:00.000Z" },
    { scope: "api:lesson-checks:global", limit: 300, used: 240, resetAt: "2026-11-17T00:00:00.000Z" },
    { scope: "api:ai-plans:global", limit: 300, used: 12, resetAt: "2026-11-17T00:00:00.000Z" },
  ];
  assert.deepEqual(
    budgetRows(budgets).map((row) => [row.key, row.state, row.percent]),
    [
      ["homework", "out", 100],
      ["lesson", "warn", 80],
      ["plans", "ok", 4],
    ],
  );
  assert.deepEqual(budgetRows(undefined), []);
  // A refused attempt is counted too: the counter may exceed the limit.
  assert.equal(budgetRows([{ ...budgets[0]!, used: 305 }])[0]?.percent, 100);
});

test("PANEL_ACTION_ROWS: every panel action once, in the site's order; only reset budget and unfreeze confirm", () => {
  assert.deepEqual(
    PANEL_ACTION_ROWS.map((row) => row.action),
    [...PANEL_ACTIONS],
  );
  assert.deepEqual(
    PANEL_ACTION_ROWS.filter((row) => row.confirm).map((row) => row.action),
    ["reset-ai-budget", "unfreeze-checks"],
  );
  for (const row of PANEL_ACTION_ROWS) {
    assert.equal(typeof ru.actions[row.label], "string");
    assert.equal(row.hint, `${row.label}Hint`);
  }
});

const students = [
  { id: "a", name: "Артём Белов" },
  { id: "d", name: "Дарья Орлова" },
  { id: "i", name: "Илья Соколов" },
];

test("filterRecipients: case-insensitive substring of the name; a blank query keeps everyone", () => {
  assert.deepEqual(filterRecipients(students, "  "), students);
  assert.deepEqual(
    filterRecipients(students, "ОРЛ").map((student) => student.id),
    ["d"],
  );
  assert.deepEqual(
    filterRecipients(students, "ов").map((student) => student.id),
    ["a", "d", "i"],
  );
  assert.deepEqual(filterRecipients(students, "zzz"), []);
});

test("toggleRecipient / pickedStudents: picks keep the list order and drop ids that left the list", () => {
  assert.deepEqual(toggleRecipient([], "i"), ["i"]);
  assert.deepEqual(toggleRecipient(["i", "a"], "i"), ["a"]);
  assert.deepEqual(
    pickedStudents(students, ["i", "gone", "a"]).map((student) => student.id),
    ["a", "i"],
  );
});

test("canSubmitBroadcast: only an empty title is held back on the phone, like the site's `required`", () => {
  assert.equal(canSubmitBroadcast(""), false);
  assert.equal(canSubmitBroadcast("   "), true);
  assert.equal(canSubmitBroadcast("Завтра занятия не будет"), true);
});

test("broadcastRequest: `toAll` without ids, `selected` with ids, a blank body is left out", () => {
  assert.deepEqual(broadcastRequest({ title: "Привет", body: "  ", mode: "all", pickedIds: ["a"] }), { title: "Привет", toAll: true });
  assert.deepEqual(broadcastRequest({ title: "Привет", body: "Подробности", mode: "selected", pickedIds: ["a", "i"] }), {
    title: "Привет",
    body: "Подробности",
    toAll: false,
    recipientIds: ["a", "i"],
  });
});

test("against the mock: a blank title and an empty selection are refused by the server with its message", async () => {
  const mock = createTestMock();
  await mock.signIn("dev@example.com");
  const blank = await mock.api.developer.broadcast(broadcastRequest({ title: "   ", body: "", mode: "all", pickedIds: [] }));
  assert.equal(blank.ok, false);
  const nobody = await mock.api.developer.broadcast(broadcastRequest({ title: "Привет", body: "", mode: "selected", pickedIds: [] }));
  assert.equal(nobody.ok, false);
  assert.equal(nobody.message, "Заполните заголовок и выберите получателей.");

  const panel = await mock.api.developer.getPanel();
  const sent = await mock.api.developer.broadcast(
    broadcastRequest({ title: "Привет", body: "", mode: "selected", pickedIds: [panel.students[0]!.id] }),
  );
  assert.equal(sent.ok, true);
  assert.equal(sent.count, 1);

  // The panel payload feeds the pure helpers as is.
  assert.equal(panelChips(panel.stats, panel.settings, ru).length, 3);
  assert.equal(statTiles(panel.stats, panel.settings, ru.status, "МСК").length, 7);
  assert.deepEqual(
    budgetRows(panel.aiBudgets).map((row) => row.key),
    ["homework", "lesson", "plans"],
  );
});
