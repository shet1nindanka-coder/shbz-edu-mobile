// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_MEMBERS, API_METHODS, API_METHOD_COUNT } from "../src/api/client";
import { ApiError, isNetworkError, isSessionExpired } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { RealtimeConnectionState, RealtimeEvent } from "../src/api/types";
import { META_LIMITS } from "../src/api/types";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../src/domain/moscow-time";
import { DEMO_PERSONAS, createMockApiClient } from "../src/mock";
import { latencyFor } from "../src/mock/rules";
import { TEST_T0, createTestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);

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

/** Lets queued microtasks (realtime delivery, saves) run. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe("MockApiClient: composition", () => {
  it("implements exactly the 112 methods of the nine members, each name once", () => {
    const { api } = createTestMock();
    const seen = new Map<string, string>();
    let total = 0;
    for (const member of API_MEMBERS) {
      const implementation = api[member] as unknown as Record<string, unknown>;
      assert.deepEqual(Object.keys(implementation).sort(), [...API_METHODS[member]].sort(), member);
      for (const name of Object.keys(implementation)) {
        assert.equal(typeof implementation[name], "function", `${member}.${name}`);
        assert.equal(seen.has(name), false, `${name} occurs in ${seen.get(name)} and ${member}`);
        seen.set(name, member);
        total += 1;
      }
    }
    assert.equal(total, API_METHOD_COUNT);
    assert.equal(total, 112);
  });

  it("never resolves synchronously and applies the deterministic latency", async () => {
    assert.deepEqual([1, 2, 3, 4].map((call) => latencyFor(call, { minMs: 200, maxMs: 600 })), [337, 474, 210, 347]);
    assert.equal(latencyFor(7, { minMs: 0, maxMs: 0 }), 0);
    for (let call = 0; call < 500; call += 1) {
      const delay = latencyFor(call, { minMs: 200, maxMs: 600 });
      assert.ok(delay >= 200 && delay <= 600);
    }

    const fast = createTestMock();
    let resolved = false;
    const pending = fast.api.shell.getMeta().then(() => { resolved = true; });
    assert.equal(resolved, false);
    await pending;

    // With the default range the first call takes 337 ms of mock time.
    const slow = createTestMock({ latency: { minMs: 200, maxMs: 600 } });
    await slow.api.ready();
    let done = false;
    const call = slow.api.shell.getMeta().then(() => { done = true; });
    await settle();
    slow.clock.advance(336);
    await settle();
    assert.equal(done, false);
    slow.clock.advance(1);
    await call;
    assert.equal(done, true);
  });
});

describe("shell: meta, sign-in, session", () => {
  it("serves the public meta without a session", async () => {
    const { api } = createTestMock();
    const meta = await api.shell.getMeta();
    assert.deepEqual(meta, { serverNow: TEST_T0, timeZone: "Europe/Moscow", locales: ["ru", "en"], loginHelpContact: "@shbz_teacher", limits: META_LIMITS });
  });

  it("signs in with a normalised login and returns an opaque token with a 30-day session", async () => {
    const mock = createTestMock();
    const result = await mock.api.shell.login({ login: "  Ilya@Example.COM ", password: "student123" });
    assert.match(result.token, /^[0-9a-f]{64}$/);
    assert.equal(result.expiresAt, new Date(T0 + 30 * DAY_MS).toISOString());
    assert.deepEqual(result.user, { id: "usr_ilya", name: "Илья Смирнов", email: "ilya@example.com", role: "STUDENT", createdAt: mock.store.users.get("usr_ilya")!.createdAt });
    assert.equal("password" in result.user, false);

    // The client does not switch the token by itself.
    assert.equal(mock.api.getSessionToken(), null);
    await rejects(mock.api.shell.getMe(), "sessionExpired", 401);
    mock.api.setSessionToken(result.token);
    assert.deepEqual(await mock.api.shell.getMe(), { user: result.user, sessionExpiresAt: result.expiresAt });

    const journal = mock.store.auditLogs.filter((row) => row.action === "auth.login" && row.createdAt === TEST_T0);
    assert.equal(journal.length, 1);
    assert.equal(journal[0]!.actorId, "usr_ilya");
    assert.equal(journal[0]!.outcome, "ok");

    // Every demo account signs in with its documented password.
    for (const [login, password] of [["teacher@example.com", "teacher123"], ["maria@example.com", "student123"], ["dev@example.com", "developer123"]] as const) {
      assert.equal((await mock.api.shell.login({ login, password })).user.email, login);
    }
  });

  it("lets every demo persona sign in with the listed password", async () => {
    const mock = createTestMock();
    assert.equal(DEMO_PERSONAS.length, 13);
    for (const persona of DEMO_PERSONAS) {
      if (persona.role === null) {
        await rejects(mock.api.shell.login({ login: persona.login, password: persona.password }), "rateLimited", 429);
        continue;
      }
      const { user } = await mock.api.shell.login({ login: persona.login, password: persona.password });
      assert.deepEqual([user.role, user.name], [persona.role, persona.name], persona.login);
    }
  });

  it("refuses empty input and wrong credentials with the site's texts", async () => {
    const mock = createTestMock();
    const empty = await rejects(mock.api.shell.login({ login: "   ", password: "x" }), "empty", 400);
    assert.equal(empty.message, "Введите логин и пароль.");
    await rejects(mock.api.shell.login({ login: "ilya@example.com", password: "" }), "empty", 400);
    await rejects(mock.api.shell.login({ login: "a".repeat(255), password: "student123" }), "empty", 400);
    // Validation consumes no limiter slot.
    assert.equal(mock.store.limiterBuckets.size, 0);

    const wrong = await rejects(mock.api.shell.login({ login: "ilya@example.com", password: "Student123" }), "invalidCredentials", 401);
    assert.equal(wrong.message, "Неверный логин или пароль.");
    assert.equal(isSessionExpired(wrong), false);
    // An unknown login gets the same answer (no account enumeration).
    const unknown = await rejects(mock.api.shell.login({ login: "nobody@example.com", password: "student123" }), "invalidCredentials", 401);
    assert.equal(unknown.message, wrong.message);

    const failed = mock.store.auditLogs.filter((row) => row.createdAt === TEST_T0 && row.outcome === "failed");
    assert.equal(failed.length, 2);
    assert.equal(failed[0]!.summary, "Неудачный вход: ilya@example.com");
    assert.equal(mock.store.sessions.size, 0);

    mock.setLocale("en");
    assert.equal((await rejects(mock.api.shell.login({ login: "ilya@example.com", password: "nope" }), "invalidCredentials", 401)).message, "Wrong login or password.");
  });

  it("expires a session after 30 days and signs out only the session that logs out", async () => {
    const mock = createTestMock();
    const first = await mock.api.shell.login({ login: "ilya@example.com", password: "student123" });
    mock.clock.advance(DAY_MS);
    const second = await mock.api.shell.login({ login: "ilya@example.com", password: "student123" });
    assert.notEqual(first.token, second.token);
    assert.equal(mock.store.sessions.by("userId", "usr_ilya").length, 2);

    // Unknown token.
    mock.api.setSessionToken("f".repeat(64));
    await rejects(mock.api.shell.getMe(), "sessionExpired", 401);

    // Logout deletes this one session; the other device stays signed in.
    mock.api.setSessionToken(second.token);
    await mock.api.shell.logout();
    const expired = await rejects(mock.api.shell.getMe(), "sessionExpired", 401);
    assert.equal(expired.message, "Сессия истекла. Войдите заново.");
    mock.api.setSessionToken(first.token);
    assert.equal((await mock.api.shell.getMe()).user.id, "usr_ilya");
    assert.equal(mock.store.auditLogs.filter((row) => row.action === "auth.logout" && row.actorId === "usr_ilya").length, 1);

    // The TTL is absolute: activity does not renew it.
    mock.clock.set(T0 + 30 * DAY_MS - 1);
    assert.equal((await mock.api.shell.getMe()).sessionExpiresAt, first.expiresAt);
    mock.clock.advance(1);
    await rejects(mock.api.shell.getMe(), "sessionExpired", 401);
    assert.equal(mock.store.sessions.findUnique("token", first.token), undefined);
  });

  it("answers 403 (not 401) for a wrong role and keeps the session", async () => {
    const mock = createTestMock();
    await mock.signIn("teacher@example.com");
    const error = await rejects(mock.api.shell.getStreak(), "unauthorized", 403);
    assert.equal(error.message, "Нет доступа.");
    assert.equal((await mock.api.shell.getMe()).user.role, "TEACHER");
    mock.signOut();
    await rejects(mock.api.shell.getStreak(), "sessionExpired", 401);
  });
});

describe("shell: login rate limits (90-addendum-6 §7)", () => {
  it("refuses the 9th attempt for one login within 10 minutes, also with the correct password", async () => {
    const mock = createTestMock();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await rejects(mock.api.shell.login({ login: "ilya@example.com", password: "wrong" }), "invalidCredentials", 401);
      mock.clock.advance(10_000);
    }
    // 9th attempt at t1 + 80 s: the oldest hit leaves the window in 520 s → "in 9 minutes".
    const refused = await rejects(mock.api.shell.login({ login: "ilya@example.com", password: "student123" }), "rateLimited", 429);
    assert.equal(refused.retryAfterSeconds, 520);
    assert.deepEqual(refused.params, { minutes: 9 });
    assert.equal(refused.message, "Слишком много попыток входа. Попробуйте снова через 9 минут.");

    // Eight journal rows for the wrong passwords, none for the refused attempt, no session.
    assert.equal(mock.store.auditLogs.filter((row) => row.action === "auth.login" && row.outcome === "failed" && row.createdAt >= TEST_T0).length, 8);
    assert.equal(mock.store.sessions.size, 0);
    // Another login from the same device is not affected.
    assert.equal((await mock.api.shell.login({ login: "maria@example.com", password: "student123" })).user.id, "usr_maria");

    // login.unlock: one slot frees 10 minutes after the first attempt; success clears the per-login buckets.
    mock.clock.set(T0 + 10 * MINUTE_MS);
    const ok = await mock.api.shell.login({ login: "ilya@example.com", password: "student123" });
    assert.equal(ok.user.id, "usr_ilya");
    assert.equal(mock.store.limiterBuckets.get("login:ip-login|mock-device:ilya@example.com"), undefined);
    assert.equal(mock.store.limiterBuckets.get("login:login|ilya@example.com"), undefined);
    assert.ok(mock.store.limiterBuckets.get("login:ip|mock-device")!.stamps.length > 0);
  });

  it("always refuses the pinned pseudo-login, in the request language", async () => {
    const mock = createTestMock();
    const ru = await rejects(mock.api.shell.login({ login: "locked@example.com", password: "anything1" }), "rateLimited", 429);
    assert.equal(ru.retryAfterSeconds, 420);
    assert.equal(ru.message, "Слишком много попыток входа. Попробуйте снова через 7 минут.");
    mock.clock.advance(HOUR_MS);
    mock.setLocale("en");
    const en = await rejects(mock.api.shell.login({ login: "LOCKED@example.com", password: "anything1" }), "rateLimited", 429);
    assert.equal(en.message, "Too many sign-in attempts. Try again in 7 minutes.");
    // The pin survives "clear limiters".
    mock.api.controls.clearLimiters();
    await rejects(mock.api.shell.login({ login: "locked@example.com", password: "anything1" }), "rateLimited", 429);
  });

  it("locks the whole device after 25 attempts and one login in its fixed window through the controls", async () => {
    const mock = createTestMock();
    mock.api.controls.exhaust("login:ip", "mock-device");
    const device = await rejects(mock.api.shell.login({ login: "maria@example.com", password: "student123" }), "rateLimited", 429);
    assert.equal(device.retryAfterSeconds, 600);
    assert.deepEqual(device.params, { minutes: 10 });
    mock.api.controls.clearLimiters();

    mock.api.controls.exhaust("login:login", "maria@example.com");
    // The fixed window is aligned to the epoch: 12:00 → the window ends at 12:15.
    const perLogin = await rejects(mock.api.shell.login({ login: "maria@example.com", password: "student123" }), "rateLimited", 429);
    assert.equal(perLogin.retryAfterSeconds, 900);
    assert.equal((await mock.api.shell.login({ login: "ilya@example.com", password: "student123" })).user.id, "usr_ilya");
    mock.clock.advance(15 * MINUTE_MS);
    assert.equal((await mock.api.shell.login({ login: "maria@example.com", password: "student123" })).user.id, "usr_maria");
  });

  it("maps a limiter-store failure to 503 database", async () => {
    const mock = createTestMock();
    mock.api.controls.set("forceNextError", { method: "shell.login", error: "serviceUnavailable", times: 1 });
    const error = await rejects(mock.api.shell.login({ login: "ilya@example.com", password: "student123" }), "database", 503);
    assert.match(error.message, /^Не удалось войти/);
    assert.equal(mock.api.controls.get().forceNextError, null);
    assert.equal((await mock.api.shell.login({ login: "ilya@example.com", password: "student123" })).user.id, "usr_ilya");
  });
});

describe("shell: profile and password", () => {
  it("updates the display name with the site's normalisation", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const { user } = await mock.api.shell.updateProfile({ name: "  Илья \n  Сергеевич\tСмирнов " });
    assert.equal(user.name, "Илья Сергеевич Смирнов");
    assert.equal((await mock.api.shell.getMe()).user.name, "Илья Сергеевич Смирнов");
    assert.equal(mock.store.users.get("usr_ilya")!.updatedAt, TEST_T0);

    assert.equal((await rejects(mock.api.shell.updateProfile({ name: "   " }), "infoInvalid", 400)).message, "Укажите имя для профиля.");
    await rejects(mock.api.shell.updateProfile({ name: "я".repeat(121) }), "infoInvalid", 400);
    assert.equal((await mock.api.shell.getMe()).user.name, "Илья Сергеевич Смирнов");
    mock.signOut();
    await rejects(mock.api.shell.updateProfile({ name: "Имя" }), "sessionExpired", 401);
  });

  it("validates a password change in the site's order", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const change = (currentPassword: string, newPassword: string, confirmPassword = newPassword) =>
      mock.api.shell.changePassword({ currentPassword, newPassword, confirmPassword });

    const short = await rejects(change("student123", "abc1"), "passwordInvalid", 400);
    assert.deepEqual(short.details, { problem: "tooShort" });
    assert.match(short.message, /^Новый пароль: минимум 8 символов/);
    assert.deepEqual((await rejects(change("student123", "abcdefghij"), "passwordInvalid", 400)).details, { problem: "noDigit" });
    assert.deepEqual((await rejects(change("student123", "password123"), "passwordInvalid", 400)).details, { problem: "common" });
    await rejects(change("", "newpass123"), "passwordInvalid", 400);
    assert.equal((await rejects(change("student123", "newpass123", "newpass124"), "passwordMismatch", 400)).message, "Новый пароль и подтверждение не совпадают.");
    // None of the above consumed a slot of the limiter.
    assert.equal(mock.store.limiterBuckets.get("profile:password-update|usr_ilya"), undefined);

    assert.equal((await rejects(change("wrong-current", "newpass123"), "passwordCurrent", 403)).message, "Текущий пароль указан неверно.");
    assert.equal(mock.store.limiterBuckets.get("profile:password-update|usr_ilya")!.hits, 1);
    assert.equal(mock.store.users.get("usr_ilya")!.password, "student123");
  });

  it("rotates the session: every other device is signed out, the returned token works", async () => {
    const mock = createTestMock();
    const other = await mock.api.shell.login({ login: "ilya@example.com", password: "student123" });
    const current = await mock.api.shell.login({ login: "ilya@example.com", password: "student123" });
    mock.api.setSessionToken(current.token);

    mock.clock.advance(HOUR_MS);
    const rotated = await mock.api.shell.changePassword({ currentPassword: "student123", newPassword: "newpass123", confirmPassword: "newpass123" });
    assert.notEqual(rotated.token, current.token);
    assert.equal(rotated.expiresAt, new Date(T0 + HOUR_MS + 30 * DAY_MS).toISOString());
    assert.deepEqual(mock.store.sessions.by("userId", "usr_ilya").map((session) => session.token), [rotated.token]);

    // The old token of this device and the other device are both gone.
    await rejects(mock.api.shell.getMe(), "sessionExpired", 401);
    mock.api.setSessionToken(other.token);
    await rejects(mock.api.shell.getMe(), "sessionExpired", 401);
    mock.api.setSessionToken(rotated.token);
    assert.equal((await mock.api.shell.getMe()).user.id, "usr_ilya");

    await rejects(mock.api.shell.login({ login: "ilya@example.com", password: "student123" }), "invalidCredentials", 401);
    assert.equal((await mock.api.shell.login({ login: "ilya@example.com", password: "newpass123" })).user.id, "usr_ilya");
  });

  it("refuses the 6th validated attempt of a 15-minute window, successful changes included", async () => {
    const mock = createTestMock({ start: T0 + 4 * MINUTE_MS });
    await mock.signIn("maria@example.com");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await rejects(mock.api.shell.changePassword({ currentPassword: "wrong", newPassword: "newpass123", confirmPassword: "newpass123" }), "passwordCurrent", 403);
    }
    const refused = await rejects(mock.api.shell.changePassword({ currentPassword: "student123", newPassword: "newpass123", confirmPassword: "newpass123" }), "rateLimited", 429);
    assert.equal(refused.message, "Слишком много попыток сменить пароль. Подождите 15 минут и попробуйте снова.");
    // 12:04 → the window ends at 12:15.
    assert.equal(refused.retryAfterSeconds, 11 * 60);
    assert.equal(mock.store.users.get("usr_maria")!.password, "student123");
    assert.equal((await mock.api.shell.getMe()).user.id, "usr_maria");

    mock.clock.advance(11 * MINUTE_MS);
    const rotated = await mock.api.shell.changePassword({ currentPassword: "student123", newPassword: "newpass123", confirmPassword: "newpass123" });
    assert.equal(mock.store.users.get("usr_maria")!.password, "newpass123");
    assert.match(rotated.token, /^[0-9a-f]{64}$/);
  });

  it("never lets the pinned account change its password", async () => {
    const mock = createTestMock();
    await mock.signIn("egor@example.com");
    const refused = await rejects(mock.api.shell.changePassword({ currentPassword: "student123", newPassword: "newpass123", confirmPassword: "newpass123" }), "rateLimited", 429);
    assert.equal(refused.retryAfterSeconds, 900);
    mock.clock.advance(20 * MINUTE_MS);
    await rejects(mock.api.shell.changePassword({ currentPassword: "student123", newPassword: "newpass123", confirmPassword: "newpass123" }), "rateLimited", 429);
    assert.equal(mock.store.users.get("usr_egor")!.password, "student123");
  });
});

describe("shell: notifications", () => {
  it("lists the newest 20 with the unread count, rendered for the request language", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const ru = await mock.api.shell.listNotifications();
    assert.equal(ru.notifications.length, 8);
    assert.equal(ru.unreadCount, 3);
    assert.deepEqual(ru.notifications.map((item) => item.createdAt), [...ru.notifications.map((item) => item.createdAt)].sort().reverse());

    const newest = ru.notifications[0]!;
    assert.equal(newest.type, "homework-assigned");
    assert.equal(newest.title, "Учитель выдал ДЗ по теме «Логарифмические уравнения»");
    assert.equal(newest.body, "Номера 010203, 010204, 010209 · дедлайн 26 ноября в 20:00");
    assert.deepEqual(newest.target, { screen: "student.homeworks" });
    assert.equal(newest.readAt, null);
    const checked = ru.notifications.find((item) => item.href === "/student/homeworks/hw_ilya_uncertain")!;
    assert.deepEqual(checked.target, { screen: "student.homework", assignmentId: "hw_ilya_uncertain" });
    assert.equal(checked.body, "Автопроверка: верно — 3, перерешать — 0, нужна ручная проверка — 1. Обновлено статусов: 2.");
    const broadcast = ru.notifications.find((item) => item.type === "broadcast")!;
    assert.deepEqual([broadcast.target, broadcast.params, broadcast.href], [null, null, null]);

    mock.setLocale("en");
    const en = await mock.api.shell.listNotifications();
    assert.equal(en.notifications[0]!.title, "Your teacher assigned homework on “Логарифмические уравнения”");
    // A legacy row without params: the title is translated, the body stays as stored.
    const legacy = en.notifications.find((item) => item.params === null && item.type === "homework-checked")!;
    assert.equal(legacy.title, "Your AI check result is ready");
    assert.equal(legacy.body, "Автопроверка: часть номеров нужно перерешать.");
    // A broadcast is free text of the developer: shown as stored in any language.
    assert.equal(en.notifications.find((item) => item.type === "broadcast")!.title, "Каникулы: занятий 4 ноября не будет");

    // The cap of 20 and the empty list.
    await mock.signIn("maria@example.com");
    const maria = await mock.api.shell.listNotifications();
    assert.equal(maria.notifications.length, 20);
    assert.equal(maria.unreadCount, 0);
    await mock.signIn("timur@example.com");
    assert.deepEqual(await mock.api.shell.listNotifications(), { notifications: [], unreadCount: 0 });
  });

  it("marks one or all read; an unknown or foreign id is a no-op", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const before = await mock.api.shell.listNotifications();
    const unread = before.notifications.filter((item) => item.readAt === null);

    assert.deepEqual(await mock.api.shell.markNotificationsRead({ notificationId: unread[0]!.id }), { unreadCount: 2 });
    assert.deepEqual(await mock.api.shell.markNotificationsRead({ notificationId: unread[0]!.id }), { unreadCount: 2 });
    assert.deepEqual(await mock.api.shell.markNotificationsRead({ notificationId: "ntf_anna_2" }), { unreadCount: 2 });
    assert.equal(mock.store.notifications.get("ntf_anna_2")!.readAt, null);
    assert.deepEqual(await mock.api.shell.markNotificationsRead({ notificationId: "does-not-exist" }), { unreadCount: 2 });
    assert.deepEqual(await mock.api.shell.markNotificationsRead({}), { unreadCount: 0 });

    const after = await mock.api.shell.listNotifications();
    assert.equal(after.unreadCount, 0);
    assert.equal(after.notifications.find((item) => item.id === unread[0]!.id)!.readAt, TEST_T0);
  });

  it("creates parent-call reminders lazily on the teacher's read, once per debt period", async () => {
    const mock = createTestMock();
    await mock.signIn("teacher@example.com");
    const first = await mock.api.shell.listNotifications();
    // Two seeded unread reminders + the one for Мария, who reached the 30-day boundary today.
    assert.equal(first.unreadCount, 3);
    const created = first.notifications[0]!;
    assert.equal(created.type, "parent_call_due");
    assert.equal(created.title, "Пора позвонить родителям");
    assert.equal(created.body, "Мария Волкова: последний звонок был 30 дн. назад.");
    assert.deepEqual(created.params, { state: "due", name: "Мария Волкова", days: 30, hasReachedCall: true });
    assert.deepEqual(created.target, { screen: "calls.list", studentId: "usr_maria" });
    assert.equal(first.notifications.find((item) => item.href === "/teacher/calls?studentId=usr_artem")!.body, "Артём Кузнецов: успешных звонков ещё не было.");
    assert.equal(first.notifications.find((item) => item.params?.state === "overdue")!.title, "Звонок родителям просрочен");
    // A comment of a call never leaks into a notification.
    assert.equal(JSON.stringify(first).includes("мессенджер"), false);

    // No duplicates on later reads, also after the one-minute throttle.
    mock.clock.advance(2 * MINUTE_MS);
    assert.equal((await mock.api.shell.listNotifications()).notifications.length, first.notifications.length);

    // Escalation: 15 days later Мария and Артём are overdue → one more reminder each.
    mock.clock.advance(15 * DAY_MS);
    await mock.signIn("teacher@example.com");
    const later = await mock.api.shell.listNotifications();
    const overdue = later.notifications.filter((item) => item.createdAt === mock.ctx.nowIso());
    assert.deepEqual(overdue.map((item) => item.params?.name).sort(), ["Артём Кузнецов", "Илья Смирнов", "Мария Волкова"]);
    assert.deepEqual(overdue.map((item) => item.params?.state).sort(), ["due", "overdue", "overdue"]);

    // Another teacher gets reminders about own students only; an empty teacher gets none.
    await mock.signIn("teacher2@example.com");
    const igor = await mock.api.shell.listNotifications();
    assert.deepEqual(igor.notifications.map((item) => item.params?.name), ["Софья Орлова"]);
    await mock.signIn("teacher3@example.com");
    assert.equal((await mock.api.shell.listNotifications()).notifications.length, 0);
  });

  it("gives the developer every alert type and creates no duplicate while the cooldown lasts", async () => {
    const mock = createTestMock();
    await mock.signIn("dev@example.com");
    const list = await mock.api.shell.listNotifications();
    assert.equal(list.notifications.length, 5);
    assert.equal(list.unreadCount, 2);
    const errors = list.notifications.find((item) => item.type === "dev_errors")!;
    assert.equal(errors.title, "Ошибки на платформе: 4 за сутки");
    assert.deepEqual(errors.target, { screen: "developer.journal", outcome: "failed", days: 1 });
    assert.deepEqual(list.notifications.find((item) => item.type === "dev_stale_checks")!.target, { screen: "developer.panel", tab: "actions" });

    // After the 6-hour cooldown a new failure produces a fresh alert.
    mock.clock.advance(7 * HOUR_MS);
    mock.signOut();
    await rejects(mock.api.shell.login({ login: "ilya@example.com", password: "wrong" }), "invalidCredentials", 401);
    await mock.signIn("dev@example.com");
    const later = await mock.api.shell.listNotifications();
    const fresh = later.notifications.filter((item) => item.createdAt === mock.ctx.nowIso());
    // … and the check that has been "running" for seven hours by now is reported as stuck.
    assert.deepEqual(fresh.map((item) => item.type).sort(), ["dev_errors", "dev_stale_checks"]);
    assert.equal(fresh.find((item) => item.type === "dev_errors")!.params?.count, 5);
    assert.equal(fresh.find((item) => item.type === "dev_stale_checks")!.params?.count, 1);
    assert.equal(later.notifications.length, 7);
  });

  it("limits the bell to 60 requests a minute per user", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    for (let call = 0; call < 30; call += 1) {
      await mock.api.shell.listNotifications();
      await mock.api.shell.markNotificationsRead({ notificationId: "none" });
    }
    const refused = await rejects(mock.api.shell.listNotifications(), "rateLimited", 429);
    assert.equal(refused.message, "Слишком много запросов. Подождите немного и попробуйте снова.");
    assert.equal(refused.retryAfterSeconds, 60);
    mock.clock.advance(MINUTE_MS);
    assert.equal((await mock.api.shell.listNotifications()).notifications.length, 8);
  });
});

describe("shell: streak and number search", () => {
  it("computes the streak from the current status rows", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const { streak } = await mock.api.shell.getStreak();
    assert.deepEqual(
      { current: streak.currentStreak, best: streak.bestStreak, today: streak.solvedToday, week: streak.solvedThisWeek, active: streak.activeDaysThisWeek },
      { current: 5, best: 9, today: 1, week: 6, active: 5 },
    );
    assert.equal(streak.dailyActivity.length, 7);
    assert.deepEqual(streak.dailyActivity[6], { date: "2026-11-16", dayLabel: "Пн", count: 1 });
    assert.deepEqual(streak.dailyActivity.map((day) => day.count), [0, 0, 1, 1, 1, 2, 1]);

    mock.setLocale("en");
    assert.equal((await mock.api.shell.getStreak()).streak.dailyActivity[6]!.dayLabel, "Mon");

    // One store for everybody: a mark by the teacher shows up in the student's streak.
    mock.ctx.progress.write({ source: "teacher", status: "GREEN", studentId: "usr_ilya", homeworkNumberId: "num_218", actor: mock.store.users.get("usr_anna")! });
    assert.equal((await mock.api.shell.getStreak()).streak.solvedToday, 2);
    // Re-marking a number moves it to the new day: 112 was closed 20 days ago.
    mock.ctx.progress.write({ source: "teacher", status: "RED", studentId: "usr_ilya", homeworkNumberId: "num_010207", actor: mock.store.users.get("usr_anna")! });
    assert.equal((await mock.api.shell.getStreak()).streak.solvedToday, 1);

    await mock.signIn("sofia@example.com");
    const sofia = (await mock.api.shell.getStreak()).streak;
    assert.deepEqual([sofia.solvedToday, sofia.currentStreak, sofia.bestStreak], [0, 3, 3]);
    await mock.signIn("maria@example.com");
    assert.deepEqual([(await mock.api.shell.getStreak()).streak.currentStreak, (await mock.api.shell.getStreak()).streak.bestStreak], [0, 4]);
    await mock.signIn("timur@example.com");
    const timur = (await mock.api.shell.getStreak()).streak;
    assert.deepEqual([timur.currentStreak, timur.bestStreak, timur.solvedThisWeek, timur.activeDaysThisWeek], [0, 0, 0, 0]);
  });

  it("finds a number by its normalised form and answers with the recorded spelling", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const expected = { number: "010203", topicId: "top_log", topicTitle: "Логарифмические уравнения" };
    assert.deepEqual(await mock.api.shell.findNumber("010203"), expected);
    assert.deepEqual(await mock.api.shell.findNumber("10203"), expected);
    assert.deepEqual(await mock.api.shell.findNumber(" 00010203 "), expected);
    assert.deepEqual(await mock.api.shell.findNumber("0112"), { number: "112", topicId: "top_linear", topicTitle: "Линейные уравнения" });

    for (const bad of ["", "12a", "0", "000", "1".repeat(21), "-5", "1 2"]) {
      const error = await rejects(mock.api.shell.findNumber(bad), "invalidNumber", 400);
      assert.equal(error.message, "Введите корректный номер.");
    }
    assert.equal((await rejects(mock.api.shell.findNumber("999"), "numberNotFound", 404)).message, "Такой номер не найден.");

    // Staff: the same shape, their own texts and a tighter limit (30 a minute).
    await mock.signIn("teacher@example.com");
    assert.deepEqual(await mock.api.shell.findNumber("10203"), expected);
    assert.equal((await rejects(mock.api.shell.findNumber("x"), "invalidNumber", 400)).message, "Укажите корректный номер.");
    assert.equal((await rejects(mock.api.shell.findNumber("999"), "numberNotFound", 404)).message, "Номер не найден.");
    for (let call = 0; call < 27; call += 1) await mock.api.shell.findNumber("112");
    assert.equal((await rejects(mock.api.shell.findNumber("112"), "rateLimited", 429)).retryAfterSeconds, 60);
    // The student's bucket is a different scope.
    await mock.signIn("ilya@example.com");
    assert.equal((await mock.api.shell.findNumber("112")).topicId, "top_linear");
  });
});

describe("MockApiClient: offline, forced errors, persistence", () => {
  it("rejects every call with the network error while offline and changes nothing", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    await mock.api.flush();
    const before = JSON.stringify(mock.store.snapshot());

    mock.setOnline(false);
    for (const call of [
      () => mock.api.shell.getMeta(),
      () => mock.api.shell.getMe(),
      () => mock.api.shell.login({ login: "ilya@example.com", password: "wrong" }),
      () => mock.api.shell.markNotificationsRead({}),
      () => mock.api.shell.updateProfile({ name: "Офлайн" }),
      () => mock.api.studentWork.listHomeworks(),
    ]) {
      const error = await rejects(call(), "network", 0);
      assert.ok(isNetworkError(error));
      assert.equal(error.message, "Нет связи с сервером. Проверьте подключение и попробуйте снова.");
    }
    assert.equal(JSON.stringify(mock.store.snapshot()), before);

    mock.setOnline(true);
    assert.equal((await mock.api.shell.getMe()).user.id, "usr_ilya");
  });

  it("forces errors before any store access and consumes them one call at a time", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");

    mock.api.controls.set("forceNextError", { method: "*", error: "sessionExpired", times: 2 });
    assert.ok(isSessionExpired(await rejects(mock.api.shell.getMe(), "sessionExpired", 401)));
    await rejects(mock.api.shell.getStreak(), "sessionExpired", 401);
    assert.equal((await mock.api.shell.getMe()).user.id, "usr_ilya");

    // Only the named method fails; the entity code of a 404 follows the method.
    mock.api.controls.set("forceNextError", { method: "shell.findNumber", error: "notFound", times: 1 });
    assert.equal((await mock.api.shell.getStreak()).streak.currentStreak, 5);
    await rejects(mock.api.shell.findNumber("112"), "numberNotFound", 404);
    mock.api.controls.set("forceNextError", { method: "studentWork.getHomework", error: "notFound", times: 1 });
    assert.equal((await rejects(mock.api.studentWork.getHomework("hw_ilya_done"), "homeworkNotFound", 404)).message, "ДЗ не найдено.");
    mock.api.controls.set("forceNextError", { method: "planner.getHomeworkPlanBoard", error: "notFound", times: 1 });
    await rejects(mock.api.planner.getHomeworkPlanBoard("hp_ready"), "draftNotFound", 404);

    mock.api.controls.set("forceNextError", { method: "*", error: "rateLimited", times: 1 });
    assert.equal((await rejects(mock.api.shell.getMe(), "rateLimited", 429)).retryAfterSeconds, 30);
    mock.api.controls.set("forceNextError", { method: "*", error: "serviceUnavailable", times: 1 });
    assert.equal((await rejects(mock.api.shell.getMe(), "serviceUnavailable", 503)).retryAfterSeconds, 5);
    mock.api.controls.set("forceNextError", { method: "*", error: "unauthorized", times: 1 });
    await rejects(mock.api.shell.getMe(), "unauthorized", 403);
    mock.api.controls.set("forceNextError", { method: "*", error: "network", times: 1 });
    await rejects(mock.api.shell.getMe(), "network", 0);

    // A forced failure of a mutation leaves the store untouched.
    mock.api.controls.set("forceNextError", { method: "shell.updateProfile", error: "serviceUnavailable", times: 1 });
    await rejects(mock.api.shell.updateProfile({ name: "Не сохранится" }), "serviceUnavailable", 503);
    assert.equal(mock.store.users.get("usr_ilya")!.name, "Илья Смирнов");
  });

  it("keeps the store across a restart: same dataset, same session, same changes", async () => {
    const first = createTestMock();
    const user = await first.signIn("ilya@example.com");
    const token = first.api.getSessionToken()!;
    await first.api.shell.updateProfile({ name: "Илья Сохранённый" });
    await first.api.shell.markNotificationsRead({});
    first.api.controls.set("checkQueueFull", true);
    await first.api.flush();
    const snapshot = JSON.stringify(first.store.snapshot());
    first.api.dispose();

    // "Restart" three hours later on the same storage.
    first.clock.advance(3 * HOUR_MS);
    const second = createTestMock({ storage: first.storage, clock: first.clock });
    await second.api.ready();
    assert.equal(JSON.stringify(second.store.snapshot()), snapshot);
    assert.equal(second.api.controls.datasetInfo().t0, TEST_T0);
    assert.equal(second.api.controls.datasetInfo().ageMs, 3 * HOUR_MS);
    assert.equal(second.api.controls.get().checkQueueFull, true);

    second.api.setSessionToken(token);
    assert.deepEqual((await second.api.shell.getMe()).user, { ...user, name: "Илья Сохранённый" });
    assert.equal((await second.api.shell.listNotifications()).unreadCount, 0);
    // New ids continue after the persisted counter.
    assert.ok(second.store.meta.idCounter >= first.store.meta.idCounter);
  });

  it("re-seeds a dataset older than 24 hours at start, unless the user opted out", async () => {
    const first = createTestMock();
    await first.signIn("ilya@example.com");
    const token = first.api.getSessionToken()!;
    await first.api.shell.updateProfile({ name: "Временное имя" });
    await first.api.flush();

    first.clock.advance(25 * HOUR_MS);
    const second = createTestMock({ storage: first.storage, clock: first.clock });
    await second.api.ready();
    const info = second.api.controls.datasetInfo();
    assert.equal(info.t0, new Date(T0 + 25 * HOUR_MS).toISOString());
    assert.equal(info.generation, 2);
    assert.equal(second.store.users.get("usr_ilya")!.name, "Илья Смирнов");
    // Time-driven fixtures are fresh again, and the tester stays signed in.
    assert.equal(second.store.lessons.get("les_live")!.startsAt, new Date(T0 + 25 * HOUR_MS - 25 * MINUTE_MS).toISOString());
    second.api.setSessionToken(token);
    assert.equal((await second.api.shell.getMe()).user.id, "usr_ilya");

    // Opt out: the old dataset is kept however old it is.
    second.api.controls.setAutoReseed(false);
    await second.api.flush();
    second.clock.advance(10 * DAY_MS);
    const third = createTestMock({ storage: second.storage, clock: second.clock });
    await third.api.ready();
    assert.equal(third.api.controls.datasetInfo().generation, 2);
    assert.equal(third.api.controls.datasetInfo().ageMs, 10 * DAY_MS);
  });

  it("replaces a stored dataset that was seeded from other fixtures", async () => {
    const first = createTestMock();
    await first.signIn("ilya@example.com");
    await first.api.shell.updateProfile({ name: "Старые данные" });
    first.store.patchMeta({ fixtures: 0 });
    await first.api.flush();

    first.clock.advance(HOUR_MS);
    const second = createTestMock({ storage: first.storage, clock: first.clock });
    await second.api.ready();
    assert.equal(second.api.controls.datasetInfo().generation, 2);
    assert.equal(second.api.controls.datasetInfo().ageMs, 0);
    assert.equal(second.store.users.get("usr_ilya")!.name, "Илья Смирнов");
  });

  it("resets the demo data: fixtures, limiters and controls return to their defaults", async () => {
    const mock = createTestMock();
    await mock.signIn("teacher@example.com");
    await mock.api.shell.updateProfile({ name: "Анна Изменённая" });
    mock.api.controls.exhaust("login:ip", "mock-device");
    mock.api.controls.set("planQueueFull", true);
    mock.api.controls.set("externalRealtimeConnections", { usr_anna: 2 });
    mock.store.users.delete("usr_timur");

    mock.clock.advance(2 * HOUR_MS);
    await mock.api.controls.resetDemoData();
    assert.equal(mock.api.controls.datasetInfo().ageMs, 0);
    assert.equal(mock.api.controls.datasetInfo().generation, 2);
    assert.equal(mock.store.users.get("usr_anna")!.name, "Анна Петрова");
    assert.ok(mock.store.users.has("usr_timur"));
    assert.equal(mock.store.limiterBuckets.size, 0);
    const controls = mock.api.controls.get();
    assert.equal(controls.planQueueFull, false);
    assert.deepEqual(controls.externalRealtimeConnections, { usr_igor: 2 });
    assert.equal(controls.limiterPins.length, 2);
    assert.deepEqual(controls.latency, { minMs: 0, maxMs: 0 });
    // The tester is still signed in, and the reset reached the storage.
    assert.equal((await mock.api.shell.getMe()).user.name, "Анна Петрова");
    const reopened = createTestMock({ storage: mock.storage, clock: mock.clock });
    await reopened.api.ready();
    assert.equal(reopened.api.controls.datasetInfo().generation, 2);
  });

  it("re-arms the lesson that starts in a minute", async () => {
    const mock = createTestMock();
    await mock.api.ready();
    mock.clock.advance(HOUR_MS);
    const item = mock.store.lessonItems.get("li_les_dasha_soon_dasha_401")!;
    mock.store.lessonItems.update(item.id, { result: "SOLVED" });
    mock.store.participants.update("lp_les_dasha_soon_dasha", { joinedAt: mock.ctx.nowIso(), attendance: "PRESENT" });
    mock.store.lessons.update("les_dasha_soon", { status: "FINISHED" });
    assert.equal(mock.ctx.q.lessonStatus(mock.store.lessons.get("les_dasha_soon")!), "FINISHED");

    mock.api.controls.rearmSoonLesson();
    const lesson = mock.store.lessons.get("les_dasha_soon")!;
    assert.equal(lesson.startsAt, new Date(mock.clock.now() + MINUTE_MS).toISOString());
    assert.equal(lesson.status, "PLANNED");
    assert.equal(mock.ctx.q.lessonStatus(lesson), "PLANNED");
    assert.equal(mock.store.lessonItems.get(item.id)!.result, null);
    assert.equal(mock.store.participants.get("lp_les_dasha_soon_dasha")!.joinedAt, null);
    mock.clock.advance(MINUTE_MS + 1000);
    assert.equal(mock.ctx.q.lessonStatus(mock.store.lessons.get("les_dasha_soon")!), "ACTIVE");
  });

  it("works without any option on the real clock", async () => {
    const api = createMockApiClient({ latency: 0, saveDebounceMs: 0 });
    const meta = await api.shell.getMeta();
    assert.ok(Math.abs(Date.parse(meta.serverNow) - Date.now()) < 5000);
    const { token } = await api.shell.login({ login: "dev@example.com", password: "developer123" });
    api.setSessionToken(token);
    assert.equal((await api.shell.getMe()).user.role, "DEVELOPER");
    await api.flush();
    api.dispose();
  });
});

describe("shell: realtime", () => {
  function listen(mock: ReturnType<typeof createTestMock>) {
    const events: RealtimeEvent[] = [];
    const states: RealtimeConnectionState[] = [];
    const unsubscribe = mock.api.shell.subscribeRealtime((event) => events.push(event), { onState: (state) => states.push(state) });
    return { events, states, unsubscribe };
  }

  it("opens one stream per signed-in user and delivers only what the role may receive", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const { events, states, unsubscribe } = listen(mock);
    await settle();
    assert.deepEqual(states, [{ status: "connecting" }, { status: "open", connectedAt: TEST_T0 }]);

    mock.ctx.emit({ kind: "student-progress-changed", studentId: "usr_ilya", topicId: "top_linear" });
    mock.ctx.emit({ kind: "student-progress-changed", studentId: "usr_maria" });
    mock.ctx.emit({ kind: "students-changed" });
    mock.ctx.emit({ kind: "topic-content-changed", topicId: "top_log" });
    mock.ctx.emit({ kind: "lesson-activity", lessonId: "les_live", teacherId: "usr_anna" });
    mock.ctx.emit({ kind: "lesson-activity", lessonId: "les_manual", teacherId: "usr_anna", studentId: "usr_ilya" });
    mock.ctx.emit({ kind: "student-deadlines-changed", studentId: "usr_ilya" });
    assert.equal(events.length, 0, "delivery is asynchronous");
    await settle();
    assert.deepEqual(events, [
      { kind: "student-progress-changed", studentId: "usr_ilya", topicId: "top_linear", occurredAt: TEST_T0 },
      { kind: "topic-content-changed", topicId: "top_log", occurredAt: TEST_T0 },
      { kind: "lesson-activity", lessonId: "les_manual", teacherId: "usr_anna", studentId: "usr_ilya", occurredAt: TEST_T0 },
      { kind: "student-deadlines-changed", studentId: "usr_ilya", occurredAt: TEST_T0 },
    ]);

    // A second listener shares the stream and learns its state; the last unsubscribe closes it.
    const second = listen(mock);
    await settle();
    assert.deepEqual(second.states, [{ status: "open", connectedAt: TEST_T0 }]);
    unsubscribe();
    assert.equal(mock.api.realtimeState().status, "open");
    second.unsubscribe();
    assert.deepEqual(mock.api.realtimeState(), { status: "closed" });
    mock.ctx.emit({ kind: "topic-content-changed" });
    await settle();
    assert.equal(events.length, 4);
    assert.equal(second.events.length, 0);
  });

  it("filters by ownership for a teacher and delivers everything to a developer", async () => {
    const mock = createTestMock();
    const publish = () => {
      mock.ctx.emit({ kind: "students-changed" });
      mock.ctx.emit({ kind: "student-progress-changed", studentId: "usr_ilya" });
      mock.ctx.emit({ kind: "student-deadlines-changed", studentId: "usr_sofia" });
      mock.ctx.emit({ kind: "lesson-activity", lessonId: "les_live", teacherId: "usr_anna" });
      mock.ctx.emit({ kind: "lesson-activity", lessonId: "les_igor_1", teacherId: "usr_igor", studentId: "usr_sofia" });
    };

    await mock.signIn("teacher@example.com");
    const anna = listen(mock);
    await settle();
    publish();
    await settle();
    assert.deepEqual(anna.events.map((event) => event.kind), ["students-changed", "student-progress-changed", "lesson-activity"]);
    assert.deepEqual(anna.events.filter((event) => event.kind === "lesson-activity").map((event) => event.lessonId), ["les_live"]);

    // Switching the session closes Anna's stream and opens one for the new user.
    await mock.signIn("dev@example.com");
    await settle();
    assert.deepEqual(anna.states.map((state) => state.status), ["connecting", "open", "closed", "connecting", "open"]);
    publish();
    await settle();
    assert.equal(anna.events.length, 3 + 5);

    // Sign-out closes the stream and frees the slot.
    mock.signOut();
    await settle();
    assert.equal(mock.api.realtimeState().status, "closed");
    publish();
    await settle();
    assert.equal(anna.events.length, 8);
    anna.unsubscribe();
  });

  it("is refused for a user whose two streams are held by other clients, with backoff 5, 10, 20, 40, 60 s", async () => {
    const mock = createTestMock();
    await mock.signIn("teacher2@example.com");
    const { events, states, unsubscribe } = listen(mock);
    await settle();
    const refusedAt = (offsetSeconds: number) => ({ status: "refused", code: "tooManyConnections", retryAt: new Date(T0 + offsetSeconds * 1000).toISOString() });
    assert.deepEqual(states, [{ status: "connecting" }, refusedAt(5)]);

    // A refused stream delivers nothing, although the API itself keeps working.
    mock.ctx.emit({ kind: "students-changed" });
    await settle();
    assert.equal(events.length, 0);
    assert.equal((await mock.api.shell.getMe()).user.id, "usr_igor");

    mock.clock.advance(5000);
    mock.clock.advance(10_000);
    mock.clock.advance(20_000);
    mock.clock.advance(40_000);
    mock.clock.advance(60_000);
    assert.deepEqual(states.slice(2), [refusedAt(15), refusedAt(35), refusedAt(75), refusedAt(135), refusedAt(195)]);

    // One of the other clients goes away: the next scheduled reconnect succeeds.
    mock.api.controls.set("externalRealtimeConnections", { usr_igor: 1 });
    mock.clock.advance(60_000);
    assert.deepEqual(mock.api.realtimeState(), { status: "open", connectedAt: new Date(T0 + 195_000).toISOString() });
    mock.ctx.emit({ kind: "students-changed" });
    await settle();
    assert.equal(events.length, 1);
    unsubscribe();
    assert.equal(mock.clock.pendingTimers(), 0);
  });

  it("reports the connect rate limit and an offline handshake through onState, never by throwing", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    mock.api.controls.exhaust("api:realtime-connect", "usr_ilya");
    const limited = listen(mock);
    await settle();
    assert.deepEqual(limited.states[1], { status: "refused", code: "rateLimited", retryAt: new Date(T0 + 60_000).toISOString() });
    // At the whole minute the fixed window starts again.
    mock.clock.advance(60_000);
    assert.equal(mock.api.realtimeState().status, "open");
    limited.unsubscribe();

    mock.setOnline(false);
    const offline = listen(mock);
    await settle();
    assert.equal(offline.states[1]!.status, "refused");
    mock.setOnline(true);
    mock.clock.advance(5000);
    assert.equal(mock.api.realtimeState().status, "open");
    offline.unsubscribe();

    // Without a session there is nothing to connect to.
    mock.signOut();
    await settle();
    const anonymous = listen(mock);
    await settle();
    assert.deepEqual(anonymous.states, [{ status: "connecting" }, { status: "closed" }]);
    anonymous.unsubscribe();
  });
});
