// Small pure rules of the shared layers: the wait countdown, the login error line, first-load failure
// detection, error texts, and reminders that are kept while their data is unknown.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, errorText, retryAfterOf } from "@/api/errors";
import { isLoadFailed, isWaitingForNetwork, loadFailureOf } from "@/components/load-failure/load-state";
import { formatWait, secondsLeft } from "@/components/retry-wait/use-countdown";
import { getDictionary } from "@/i18n/get-dictionary";
import { getMobileDictionary } from "@/i18n/mobile";
import { loginFailureOf, loginFailureText, type LoginErrorTexts } from "@/screens/shell/login-error";
import { diffReminders, reminderCategoryOf, reminderIdentifier, type LocalReminder } from "@/services/notifications/reminders";

describe("wait countdown", () => {
  it("never shows more than the server's retryAfterSeconds, whatever the fraction of the second", () => {
    for (const startedAt of [1_700_000_000_000, 1_700_000_000_001, 1_700_000_000_400, 1_700_000_000_999]) {
      const until = startedAt + 420 * 1000;
      // Right after the answer and a few milliseconds later: 7 minutes, not 8.
      assert.equal(secondsLeft(until, startedAt), 420);
      assert.equal(secondsLeft(until, startedAt + 3), 420);
      assert.equal(Math.ceil(secondsLeft(until, startedAt + 3) / 60), 7);
    }
  });

  it("counts down in whole seconds and stays locked until the wait is really over", () => {
    const until = 10_000;
    assert.equal(secondsLeft(until, 9_000), 1);
    assert.equal(secondsLeft(until, 9_001), 1);
    assert.equal(secondsLeft(until, 9_999), 1);
    assert.equal(secondsLeft(until, 10_000), 0);
    assert.equal(secondsLeft(until, 25_000), 0);
    assert.equal(secondsLeft(null, 5), 0);
  });

  it("formats minutes with the site's forms and seconds with the mobile ones", () => {
    const forms = { secondForms: getMobileDictionary("ru").common.errors.secondForms, minuteForms: getDictionary("ru").login.minuteForms };
    assert.equal(formatWait(420, "ru", forms), "7 минут");
    assert.equal(formatWait(61, "ru", forms), "2 минуты");
    assert.equal(formatWait(45, "ru", forms), "45 секунд");
    assert.equal(formatWait(0, "ru", forms), "1 секунду");
    const en = { secondForms: getMobileDictionary("en").common.errors.secondForms, minuteForms: getDictionary("en").login.minuteForms };
    assert.equal(formatWait(60, "en", en), "1 minute");
  });
});

describe("login error line", () => {
  const texts = (locale: "ru" | "en"): LoginErrorTexts => ({
    login: getDictionary(locale).login,
    network: getMobileDictionary(locale).common.errors.network,
    generic: getMobileDictionary(locale).common.errors.generic,
  });

  it("follows the interface language instead of the language of the failed request", () => {
    const failure = loginFailureOf(new ApiError({ code: "invalidCredentials", message: "Неверный логин или пароль.", status: 401 }));
    assert.equal(loginFailureText(failure, "ru", texts("ru")), "Неверный логин или пароль.");
    assert.equal(loginFailureText(failure, "en", texts("en")), getDictionary("en").login.errors.invalid);
    assert.equal(/[А-Яа-яЁё]/.test(loginFailureText(failure, "en", texts("en"))), false);
  });

  it("renders the rate limit from its minutes, and the client-side cases from the dictionary", () => {
    const limited = loginFailureOf(
      new ApiError({ code: "rateLimited", message: "…через 7 минут.", status: 429, params: { minutes: 7 }, retryAfterSeconds: 420 }),
    );
    assert.equal(limited.minutes, 7);
    assert.equal(loginFailureText(limited, "ru", texts("ru")), "Слишком много попыток входа. Попробуйте снова через 7 минут.");
    assert.match(loginFailureText(limited, "en", texts("en")), /7 minutes/);
    // No minutes named: the site's generic rate-limit line.
    const bare = loginFailureOf(new ApiError({ code: "rateLimited", message: "x", status: 429 }));
    assert.equal(loginFailureText(bare, "ru", texts("ru")), getDictionary("ru").login.errors.rateLimited);
    assert.equal(loginFailureText({ code: "empty" }, "en", texts("en")), getDictionary("en").login.errors.empty);
    assert.equal(loginFailureText(loginFailureOf(ApiError.network("нет сети")), "en", texts("en")), texts("en").network);
  });

  it("keeps the server's own text for a code the login has no line for", () => {
    const failure = loginFailureOf(new ApiError({ code: "serviceUnavailable", message: "Сервис временно недоступен.", status: 503 }));
    assert.equal(loginFailureText(failure, "en", texts("en")), "Сервис временно недоступен.");
    assert.equal(loginFailureText({ code: "unknown" }, "ru", texts("ru")), texts("ru").generic);
  });
});

describe("reading an error", () => {
  it("takes the server's message, else the fallback; and the wait only when one is named", () => {
    const limited = new ApiError({ code: "rateLimited", message: "Слишком много запросов.", status: 429, retryAfterSeconds: 30 });
    assert.equal(errorText(limited, "fallback"), "Слишком много запросов.");
    assert.equal(errorText(new Error("boom"), "fallback"), "fallback");
    assert.equal(errorText(null, "fallback"), "fallback");
    assert.equal(retryAfterOf(limited), 30);
    // A 503 names a wait as well (A.3 rule 4): every control that waits reacts to it.
    assert.equal(retryAfterOf(new ApiError({ code: "serviceUnavailable", message: "x", status: 503, retryAfterSeconds: 5 })), 5);
    assert.equal(retryAfterOf(new ApiError({ code: "invalidData", message: "x", status: 400 })), 0);
    assert.equal(retryAfterOf(new Error("boom")), 0);
  });
});

describe("first-load failure", () => {
  const network = ApiError.network("Нет связи с сервером.");

  it("treats a failed read and a read parked offline as failures, a running one as loading", () => {
    assert.equal(isLoadFailed({ isError: true, fetchStatus: "idle" }), true);
    assert.equal(isLoadFailed({ isError: false, fetchStatus: "paused" }), true);
    assert.equal(isLoadFailed({ isError: false, fetchStatus: "fetching" }), false);
    assert.deepEqual(loadFailureOf({ isError: true, error: network, fetchStatus: "idle" }), { error: network });
    assert.deepEqual(loadFailureOf({ isError: false, error: null, failureReason: network, fetchStatus: "paused" }), { error: network });
    assert.equal(loadFailureOf({ isError: false, error: null, fetchStatus: "fetching" }), null);
  });

  it("waits for the network only when nothing is cached", () => {
    assert.equal(isWaitingForNetwork({ data: undefined, fetchStatus: "paused" }), true);
    assert.equal(isWaitingForNetwork({ data: { rows: [] }, fetchStatus: "paused" }), false);
    assert.equal(isWaitingForNetwork({ data: undefined, fetchStatus: "fetching" }), false);
  });
});

describe("reminders while their data is unknown", () => {
  const reminder = (category: LocalReminder["category"], id: string): LocalReminder => ({
    id,
    category,
    fireAt: 1_800_000_000_000,
    title: "t",
    body: "b",
    link: { screen: "student.home" },
  });

  it("keeps what is scheduled for a category whose query has not answered yet", () => {
    const call = reminderIdentifier(reminder("parentCalls", "stu_1"));
    const homework = reminderIdentifier(reminder("homeworkDeadlines", "hw_1:24h"));
    const scheduled = [call, homework, "someone-else:1"];
    // Nothing planned at all (a cold start without a connection): the unknown category survives.
    assert.deepEqual(diffReminders(scheduled, [], ["parentCalls"]), { cancel: [homework], schedule: [] });
    assert.deepEqual(diffReminders(scheduled, [], ["parentCalls", "homeworkDeadlines"]), { cancel: [], schedule: [] });
    // Once the data is known the category is synced as usual.
    assert.deepEqual(diffReminders(scheduled, []).cancel, [call, homework]);
  });

  it("reads the category back from an identifier", () => {
    assert.equal(reminderCategoryOf(reminderIdentifier(reminder("lessonStart", "les_1:start"))), "lessonStart");
    assert.equal(reminderCategoryOf("someone-else:1"), null);
  });
});
