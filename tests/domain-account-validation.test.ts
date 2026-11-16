// Account form rules lifted from the site's server actions (login, create account, profile, password).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MIN_PASSWORD_LENGTH,
  normalizeUserName,
  validateDeveloperAccountInput,
  validateLoginInput,
  validateNewAccountInput,
  validatePasswordChangeInput
} from "@/domain/account-validation";
import { MAX_PASSWORD_LENGTH } from "@/domain/password-policy";
import { MAX_LOGIN_LENGTH, MAX_USER_NAME_LENGTH } from "@/domain/text";

describe("validateLoginInput", () => {
  it("normalises the login and keeps the password as typed", () => {
    assert.deepEqual(validateLoginInput("  Ilya@Example.COM ", " student123 "), {
      ok: true,
      login: "ilya@example.com",
      password: " student123 "
    });
  });

  it("rejects empty and overlong fields with the site's «empty» error", () => {
    assert.deepEqual(validateLoginInput("", "x"), { ok: false, error: "empty" });
    assert.deepEqual(validateLoginInput("   ", "x"), { ok: false, error: "empty" });
    assert.deepEqual(validateLoginInput("user", ""), { ok: false, error: "empty" });
    assert.deepEqual(validateLoginInput("a".repeat(MAX_LOGIN_LENGTH + 1), "x"), { ok: false, error: "empty" });
    assert.deepEqual(validateLoginInput("user", "p".repeat(MAX_PASSWORD_LENGTH + 1)), { ok: false, error: "empty" });
    assert.equal(validateLoginInput("a".repeat(MAX_LOGIN_LENGTH), "p".repeat(MAX_PASSWORD_LENGTH)).ok, true);
  });
});

describe("normalizeUserName", () => {
  it("collapses whitespace and enforces 1..120 characters", () => {
    assert.equal(normalizeUserName("  Мария \n  Смирнова "), "Мария Смирнова");
    assert.equal(normalizeUserName(""), null);
    assert.equal(normalizeUserName(" \t "), null);
    assert.equal(normalizeUserName("я".repeat(MAX_USER_NAME_LENGTH)), "я".repeat(MAX_USER_NAME_LENGTH));
    assert.equal(normalizeUserName("я".repeat(MAX_USER_NAME_LENGTH + 1)), null);
  });
});

describe("validateNewAccountInput", () => {
  it("accepts a valid student and returns the normalised fields", () => {
    assert.deepEqual(validateNewAccountInput({ name: " Илья  Петров ", login: " ILYA ", password: "Petrov-beku4725" }), {
      ok: true,
      name: "Илья Петров",
      login: "ilya",
      password: "Petrov-beku4725"
    });
  });

  it("rejects bad names, logins and weak passwords, reporting the password problem", () => {
    assert.deepEqual(validateNewAccountInput({ name: "", login: "ilya", password: "Petrov-beku4725" }), {
      ok: false, error: "invalid", passwordProblem: null
    });
    assert.deepEqual(validateNewAccountInput({ name: "Илья", login: " ", password: "Petrov-beku4725" }), {
      ok: false, error: "invalid", passwordProblem: null
    });
    assert.deepEqual(validateNewAccountInput({ name: "Илья", login: "ilya", password: "short1" }), {
      ok: false, error: "invalid", passwordProblem: "tooShort"
    });
    assert.deepEqual(validateNewAccountInput({ name: "Илья", login: "ilya", password: "12345678" }), {
      ok: false, error: "invalid", passwordProblem: "noLetter"
    });
    assert.deepEqual(validateNewAccountInput({ name: "Илья", login: "ilya", password: "password" }), {
      ok: false, error: "invalid", passwordProblem: "noDigit"
    });
    assert.deepEqual(validateNewAccountInput({ name: "Илья", login: "ilya", password: "password123" }), {
      ok: false, error: "invalid", passwordProblem: "common"
    });
    assert.equal(validateNewAccountInput({ name: "Илья", login: "ilya", password: `a1${"x".repeat(MAX_PASSWORD_LENGTH)}` }).ok, false);
    assert.equal(validateNewAccountInput({ name: "Илья", login: "l".repeat(MAX_LOGIN_LENGTH + 1), password: "Petrov-beku4725" }).ok, false);
  });
});

describe("validateDeveloperAccountInput", () => {
  const base = { name: "Анна Орлова", login: "anna", password: "Orlova-beku4725" };

  it("creates teachers without and students with a teacher", () => {
    assert.deepEqual(validateDeveloperAccountInput({ ...base, role: "TEACHER", teacherId: "ignored" }), {
      ok: true, role: "TEACHER", teacherId: null, ...base
    });
    assert.deepEqual(validateDeveloperAccountInput({ ...base, role: "STUDENT", teacherId: " t1 " }), {
      ok: true, role: "STUDENT", teacherId: "t1", ...base
    });
  });

  it("rejects other roles and a student without a teacher", () => {
    assert.equal(validateDeveloperAccountInput({ ...base, role: "DEVELOPER" }).ok, false);
    assert.equal(validateDeveloperAccountInput({ ...base, role: "" }).ok, false);
    assert.equal(validateDeveloperAccountInput({ ...base, role: "STUDENT" }).ok, false);
    assert.equal(validateDeveloperAccountInput({ ...base, role: "STUDENT", teacherId: "  " }).ok, false);
    assert.deepEqual(validateDeveloperAccountInput({ ...base, role: "TEACHER", password: "weak" }), {
      ok: false, error: "invalid", passwordProblem: "tooShort"
    });
  });
});

describe("validatePasswordChangeInput", () => {
  it("accepts a strong new password that matches its confirmation", () => {
    assert.equal(MIN_PASSWORD_LENGTH, 8);
    assert.deepEqual(
      validatePasswordChangeInput({ currentPassword: "old-pass1", newPassword: "New-pass-2026", confirmPassword: "New-pass-2026" }),
      { ok: true, currentPassword: "old-pass1", newPassword: "New-pass-2026" }
    );
  });

  it("follows the site's order: shape → mismatch → strength", () => {
    const change = (currentPassword: string, newPassword: string, confirmPassword: string) =>
      validatePasswordChangeInput({ currentPassword, newPassword, confirmPassword });

    assert.equal(change("", "New-pass-2026", "New-pass-2026").ok, false);
    assert.deepEqual(change("old", "short1", "short1"), { ok: false, error: "invalid", passwordProblem: "tooShort" });
    // Too short wins over a mismatch (the site checks the shape first).
    assert.deepEqual(change("old", "short1", "other22"), { ok: false, error: "invalid", passwordProblem: "tooShort" });
    assert.deepEqual(change("old", "New-pass-2026", "New-pass-2027"), { ok: false, error: "mismatch", passwordProblem: null });
    assert.deepEqual(change("old", "passwordonly", "passwordonly"), { ok: false, error: "invalid", passwordProblem: "noDigit" });
    assert.deepEqual(change("old", "password123", "password123"), { ok: false, error: "invalid", passwordProblem: "common" });
    assert.equal(change("o".repeat(MAX_PASSWORD_LENGTH + 1), "New-pass-2026", "New-pass-2026").ok, false);
  });
});
