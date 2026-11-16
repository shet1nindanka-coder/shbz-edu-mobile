// Ported from the site (tests/record-text.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import test from "node:test";
import { auditActorNameFor, auditSummaryFor, renderAuditText, resolveAuditText, withAuditText } from "@/domain/audit-text";
import { legacyNotificationTitle, notificationTextFor, renderNotificationText } from "@/domain/notification-text";

test("renderAuditText substitutes params in both languages", () => {
  const text = { key: "student.created" as const, params: { name: "Илья" } };

  assert.equal(renderAuditText(text, "ru"), "Создан ученик Илья");
  assert.equal(renderAuditText(text, "en"), "Student Илья created");
});

test("renderAuditText maps verdict and progress codes through the dictionary", () => {
  assert.equal(
    renderAuditText({ key: "lesson_item.check", params: { number: "12", verdict: "incorrect" } }, "en"),
    "Classwork: problem 12 — incorrect"
  );
  assert.equal(
    renderAuditText(
      { key: "progress.status", params: { source: "teacher", previousStatus: null, status: "GREEN", decision: "changed" } },
      "ru"
    ),
    "Отметка учителя: Без отметки → Решил. Статус изменён"
  );
  assert.equal(
    renderAuditText(
      { key: "progress.status", params: { source: "homework_check", previousStatus: "RED", status: "RED", decision: "unchanged" } },
      "en"
    ),
    "Homework check: Not solved → Not solved. Status already matches"
  );
});

test("renderAuditText formats *At params as dates of the locale", () => {
  const rendered = renderAuditText({ key: "lesson.scheduled", params: { startsAt: "2026-04-08T09:05:00.000Z" } }, "en");

  assert.match(rendered, /^Lesson time: \d{2}\/\d{2}\/2026, \d{2}:\d{2}$/);
});

test("withAuditText keeps existing meta and resolveAuditText reads it back", () => {
  const meta = withAuditText({ login: "ilya" }, { key: "auth.login.failed", params: { login: "ilya" } });

  assert.deepEqual(meta, { login: "ilya", i18n: { key: "auth.login.failed", params: { login: "ilya" } } });
  assert.deepEqual(resolveAuditText(meta), { key: "auth.login.failed", params: { login: "ilya" } });
  assert.equal(resolveAuditText({ i18n: { key: "unknown.key" } }), null);
  assert.equal(resolveAuditText(null), null);
});

test("auditSummaryFor translates legacy constant summaries and keeps unknown text", () => {
  assert.equal(auditSummaryFor({ summary: "Вход в систему", meta: null }, "en"), "Signed in");
  assert.equal(auditSummaryFor({ summary: "Вход в систему", meta: null }, "ru"), "Вход в систему");
  assert.equal(auditSummaryFor({ summary: "Неудачный вход: x", meta: null }, "en"), "Неудачный вход: x");
  assert.equal(auditSummaryFor({ summary: null, meta: { i18n: { key: "auth.logout" } } }, "en"), "Signed out");
  assert.equal(auditActorNameFor("Автопроверка", "en"), "AI check");
  assert.equal(auditActorNameFor("Иван", "en"), "Иван");
});

test("renderNotificationText builds homework notifications with plural forms and dates", () => {
  const params = { variant: "assigned", topic: "Логарифмы", numbers: "12, 13", count: 2, deadlineAt: "2026-04-08T15:00:00.000Z" };
  const ru = renderNotificationText("homework-assigned", params, "ru");
  const en = renderNotificationText("homework-assigned", params, "en");

  assert.equal(ru?.title, "Учитель выдал ДЗ по теме «Логарифмы»");
  assert.match(ru?.body ?? "", /^Номера 12, 13 · дедлайн 8 апреля/);
  assert.equal(en?.title, "Your teacher assigned homework on “Логарифмы”");
  assert.match(en?.body ?? "", /^Problems 12, 13 · due 8 April/);

  const single = renderNotificationText("homework-assigned", { ...params, variant: "deadline", count: 1, numbers: "7" }, "ru");
  assert.equal(single?.title, "Назначен дедлайн по теме «Логарифмы»");
  assert.match(single?.body ?? "", /^Номер 7 · дедлайн/);
});

test("renderNotificationText composes the auto-check body", () => {
  assert.equal(
    renderNotificationText("homework-checked", { correct: 3, incorrect: 1, uncertain: 0, applied: 4 }, "ru")?.body,
    "Автопроверка: верно — 3, перерешать — 1. Обновлено статусов: 4."
  );
  assert.equal(
    renderNotificationText("homework-checked", { correct: 3, incorrect: 1, uncertain: 2, applied: 0 }, "en")?.body,
    "AI check: correct — 3, to redo — 1, needs manual review — 2. Statuses unchanged."
  );
});

test("notificationTextFor falls back to stored text and translates known legacy titles", () => {
  const legacy = { type: "parent_call_due", title: "Пора позвонить родителям", body: "Иван: успешных звонков ещё не было.", params: null };

  assert.deepEqual(notificationTextFor(legacy, "ru"), { title: "Пора позвонить родителям", body: "Иван: успешных звонков ещё не было." });
  assert.equal(notificationTextFor(legacy, "en").title, "Time to call the parents");
  assert.equal(legacyNotificationTitle("Рассылка от разработчика", "en"), "Рассылка от разработчика");
  assert.equal(
    notificationTextFor({ type: "broadcast", title: "Важное", body: "Текст", params: { any: 1 } }, "en").title,
    "Важное"
  );
});
