// Pure rules of the students list forms: when a form may be sent, what the password line says, when a
// password is suggested, the credentials message, and which failures close a dialog.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import { validatePasswordStrength } from "../src/domain/password-policy";
import { generatePasswordFromName } from "../src/domain/password-generate";
import {
  canSubmitPassword,
  canSubmitStudentForm,
  passwordFeedback,
  shouldSuggestPassword,
} from "../src/screens/teacher/students/account-form";
import {
  buildCredentialLines,
  credentialLineText,
  credentialsMessage,
} from "../src/screens/teacher/students/credentials-message";
import { errorText } from "../src/api/errors";
import { isStudentGone } from "../src/screens/teacher/students/error-text";

describe("password line under the field", () => {
  it("says nothing while the field is empty", () => {
    assert.deepEqual(passwordFeedback(""), { kind: "empty" });
  });

  it("reports the first policy problem in the site's order", () => {
    assert.deepEqual(passwordFeedback("abc1"), { kind: "problem", problem: "tooShort" });
    assert.deepEqual(passwordFeedback("12345678901"), { kind: "problem", problem: "noLetter" });
    assert.deepEqual(passwordFeedback("abcdefghij"), { kind: "problem", problem: "noDigit" });
    assert.deepEqual(passwordFeedback("Password123"), { kind: "problem", problem: "common" });
    assert.deepEqual(passwordFeedback(`a1${"x".repeat(255)}`), { kind: "problem", problem: "tooLong" });
  });

  it("accepts a password with letters and digits, Cyrillic included", () => {
    assert.deepEqual(passwordFeedback("Smirnova-beku4725"), { kind: "ok" });
    assert.deepEqual(passwordFeedback("пароль2026"), { kind: "ok" });
    assert.equal(canSubmitPassword("Smirnova-beku4725"), true);
    assert.equal(canSubmitPassword(""), false);
    assert.equal(canSubmitPassword("short1"), false);
  });
});

describe("add-student form", () => {
  const filled = { name: "Мария Смирнова", login: "maria2@example.com", password: "Smirnova-beku4725" };

  it("may be sent only with a name, a login and a valid password", () => {
    assert.equal(canSubmitStudentForm(filled), true);
    assert.equal(canSubmitStudentForm({ ...filled, name: "   " }), false);
    assert.equal(canSubmitStudentForm({ ...filled, login: " \t" }), false);
    assert.equal(canSubmitStudentForm({ ...filled, password: "" }), false);
    assert.equal(canSubmitStudentForm({ ...filled, password: "12345678" }), false);
  });

  it("does not validate the login as an e-mail", () => {
    assert.equal(canSubmitStudentForm({ ...filled, login: "masha" }), true);
  });

  it("offers a password only for an empty field with name and login filled in", () => {
    assert.equal(shouldSuggestPassword({ ...filled, password: "" }), true);
    assert.equal(shouldSuggestPassword(filled), false);
    assert.equal(shouldSuggestPassword({ name: "", login: "maria2@example.com", password: "" }), false);
    assert.equal(shouldSuggestPassword({ name: "Мария Смирнова", login: "  ", password: "" }), false);
  });

  it("is always offered a suggestion that the form then accepts", () => {
    let seed = 7;
    const randomInt = (maxExclusive: number) => {
      seed = (seed * 31 + 11) % 9973;
      return seed % maxExclusive;
    };
    for (const name of ["Мария Смирнова", "Ян Ли", "Ilya Smirnov", "Ёж", ""]) {
      const suggestion = generatePasswordFromName(name, randomInt);
      assert.equal(validatePasswordStrength(suggestion), null, suggestion);
      assert.equal(canSubmitStudentForm({ name: name || "x", login: "login", password: suggestion }), true);
    }
    assert.match(generatePasswordFromName("Мария Смирнова", randomInt), /^Smirnova-[a-z]{4}[2-9]{4}$/);
  });
});

describe("credentials message", () => {
  const lines = buildCredentialLines(
    { site: "Сайт", login: "Логин", password: "Пароль" },
    { host: "shbz-edu.ru", login: "maria2@example.com", password: "Smirnova-beku4725" },
  );

  it("lists site, login and password in that order", () => {
    assert.deepEqual(
      lines.map((line) => line.id),
      ["site", "login", "password"],
    );
    assert.equal(credentialLineText(lines[1]!), "Логин: maria2@example.com");
  });

  it("joins the three lines exactly as they are displayed", () => {
    assert.equal(credentialsMessage(lines), "Сайт: shbz-edu.ru\nЛогин: maria2@example.com\nПароль: Smirnova-beku4725");
  });

  it("copies a single line as the bare value", () => {
    assert.equal(lines[2]?.value, "Smirnova-beku4725");
  });
});

describe("mutation failures", () => {
  const gone = new ApiError({ status: 404, code: "studentNotFound", message: "Такого ученика уже нет в системе." });
  const limited = new ApiError({ status: 429, code: "rateLimited", message: "Слишком много смен пароля.", retryAfterSeconds: 240 });

  it("treats only 404 studentNotFound as 'the student is gone'", () => {
    assert.equal(isStudentGone(gone), true);
    assert.equal(isStudentGone(limited), false);
    assert.equal(isStudentGone(new Error("boom")), false);
    assert.equal(isStudentGone(null), false);
  });

  it("shows the server's message and falls back to the screen's own line", () => {
    assert.equal(errorText(gone, "fallback"), "Такого ученика уже нет в системе.");
    assert.equal(errorText(new Error("boom"), "fallback"), "fallback");
    assert.equal(errorText(undefined, "fallback"), "fallback");
  });
});
