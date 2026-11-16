// Pure decisions of the developer journal (src/screens/developer/panel/journal-logic.ts).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";

import type { JournalEntry } from "@/api/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { createTestMock } from "@/mock/testing";
import {
  JOURNAL_PERIODS,
  activeFilterCount,
  actorOptionLabel,
  categoryFilterLabel,
  collapseError,
  costText,
  initialJournalFilters,
  mergeJournalPages,
  metaJson,
  nextJournalPage,
  periodLabel,
  toJournalQuery,
  tokensText,
  whoText,
} from "@/screens/developer/panel/journal-logic";

const ru = getDictionary("ru").planner.journal;
const en = getDictionary("en").planner.journal;

test("initialJournalFilters: a week by default; the route's outcome and days are the starting filter", () => {
  assert.deepEqual(initialJournalFilters({}), { category: null, actor: null, action: "", days: 7, onlyFailed: false });
  assert.deepEqual(initialJournalFilters({ outcome: "failed", days: 1 }), {
    category: null,
    actor: null,
    action: "",
    days: 1,
    onlyFailed: true,
  });
  assert.equal(initialJournalFilters({ days: 0 }).days, 0);
});

test("toJournalQuery: unset filters are left out, the action is trimmed", () => {
  assert.deepEqual(toJournalQuery(initialJournalFilters({})), { days: 7 });
  assert.deepEqual(
    toJournalQuery({ category: "AI", actor: "usr_dev", action: "  lesson_plan ", days: 30, onlyFailed: true }),
    { days: 30, category: "AI", actor: "usr_dev", action: "lesson_plan", outcome: "failed" },
  );
  assert.deepEqual(toJournalQuery({ ...initialJournalFilters({}), action: "   " }), { days: 7 });
});

test("activeFilterCount: counts what differs from the defaults", () => {
  assert.equal(activeFilterCount(initialJournalFilters({})), 0);
  assert.equal(activeFilterCount(initialJournalFilters({ outcome: "failed", days: 1 })), 2);
  assert.equal(activeFilterCount({ category: "DATA", actor: "u", action: "x", days: 0, onlyFailed: true }), 5);
  assert.equal(activeFilterCount({ ...initialJournalFilters({}), action: "  " }), 0);
});

test("period, category and actor labels come from the site's filter texts", () => {
  assert.deepEqual(
    JOURNAL_PERIODS.map((days) => periodLabel(days, ru.filters)),
    ["Сутки", "Неделя", "Месяц", "Три месяца", "Всё время"],
  );
  assert.equal(periodLabel(14, ru.filters), null);
  assert.equal(categoryFilterLabel("AI", ru.filters), "ИИ и расходы");
  assert.equal(categoryFilterLabel("AUTH", en.filters), "Sign-ins");
  assert.equal(actorOptionLabel({ name: "Игорь Петров", role: "TEACHER" }, ru.roles), "Игорь Петров — учитель");
});

test("whoText: name snapshot, then the role; a dash for a row without an actor", () => {
  assert.equal(whoText({ actorName: "Илья Соколов", actorRole: "STUDENT" }, ru.roles), "Илья Соколов · ученик");
  assert.equal(whoText({ actorName: "AI check", actorRole: null }, en.roles), "AI check");
  assert.equal(whoText({ actorName: null, actorRole: null }, ru.roles), "—");
  assert.equal(whoText({ actorName: null, actorRole: "DEVELOPER" }, en.roles), "— · developer");
});

test("tokensText / costText: absent values give null, a missing side counts as 0, cost has two decimals", () => {
  assert.equal(tokensText({ inputTokens: null, outputTokens: null }), null);
  assert.equal(tokensText({ inputTokens: 1200, outputTokens: 340 }), "1200 → 340");
  assert.equal(tokensText({ inputTokens: 1200, outputTokens: null }), "1200 → 0");
  assert.equal(costText(null), null);
  assert.equal(costText("0.5"), "0.50 ₽");
  assert.equal(costText("12.3456"), "12.35 ₽");
  assert.equal(costText("not a number"), null);
});

test("collapseError: only an error longer than 140 characters is cut", () => {
  const exact = "x".repeat(140);
  assert.deepEqual(collapseError(exact), { text: exact, collapsed: false });
  const long = "y".repeat(141);
  assert.deepEqual(collapseError(long), { text: `${"y".repeat(140)}…`, collapsed: true });
});

test("metaJson: pretty-printed with two spaces", () => {
  assert.equal(metaJson({ count: 2, toAll: true }), '{\n  "count": 2,\n  "toAll": true\n}');
});

const entry = (id: string): JournalEntry => ({
  id,
  createdAt: "2026-11-16T09:00:00.000Z",
  category: "DATA",
  action: "topic.create",
  actionLabel: null,
  outcome: "ok",
  actorName: null,
  actorRole: null,
  progressTarget: null,
  summary: null,
  progressRef: null,
  meta: null,
  error: null,
  inputTokens: null,
  outputTokens: null,
  costRub: null,
});

test("mergeJournalPages: pages in order, a row repeated at a page seam appears once", () => {
  const merged = mergeJournalPages([{ entries: [entry("a"), entry("b")] }, { entries: [entry("b"), entry("c")] }]);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(mergeJournalPages([]), []);
});

test("nextJournalPage: the next number until the last page", () => {
  assert.equal(nextJournalPage({ page: 1, pageCount: 3 }), 2);
  assert.equal(nextJournalPage({ page: 3, pageCount: 3 }), undefined);
  assert.equal(nextJournalPage({ page: 1, pageCount: 1 }), undefined);
});

test("against the mock: the query built from the filters selects what the filters say", async () => {
  const mock = createTestMock();
  await mock.signIn("dev@example.com");
  const all = await mock.api.developer.getJournal(toJournalQuery(initialJournalFilters({ days: 0 })));
  assert.ok(all.total > 0);
  assert.equal(all.pageSize, 50);

  const failed = await mock.api.developer.getJournal(toJournalQuery({ ...initialJournalFilters({ days: 0 }), onlyFailed: true }));
  assert.ok(failed.total < all.total);
  assert.ok(failed.entries.every((row) => row.outcome === "failed"));

  const ai = await mock.api.developer.getJournal(toJournalQuery({ ...initialJournalFilters({ days: 0 }), category: "AI" }));
  assert.ok(ai.entries.every((row) => row.category === "AI"));

  const actor = all.actors[0];
  assert.ok(actor);
  assert.equal(typeof actorOptionLabel(actor, ru.roles), "string");

  // Every loaded page merges without repeats and `nextJournalPage` walks to the end.
  const pages = [all];
  for (let next = nextJournalPage(all); next !== undefined; next = nextJournalPage(pages[pages.length - 1]!)) {
    pages.push(await mock.api.developer.getJournal({ ...toJournalQuery(initialJournalFilters({ days: 0 })), page: next }));
  }
  assert.equal(pages.length, all.pageCount);
  assert.equal(mergeJournalPages(pages).length, all.total);
});
