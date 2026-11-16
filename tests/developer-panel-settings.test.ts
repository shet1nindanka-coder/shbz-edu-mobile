// The Settings tab as data (src/screens/developer/panel/settings-form.ts): the 25 fields with the site's
// ranges, the draft ⇄ settings conversion and the stepper.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";

import type { SiteSettings } from "@/api/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { createTestMock } from "@/mock/testing";
import {
  SETTINGS_GROUPS,
  canStep,
  draftToSettings,
  invalidFields,
  isDraftDirty,
  parseNumberInput,
  stepNumberInput,
  toDraft,
  type NumberFieldSpec,
} from "@/screens/developer/panel/settings-form";

const settings: SiteSettings = {
  aiEnabled: true,
  aiModel: "gpt-6.1-sol",
  aiShortlistModel: "gpt-6-luna",
  aiReasoningEffort: "high",
  aiMinConfidence: 0.6,
  aiDailyLimit: 300,
  aiPerStudentHourlyLimit: 10,
  aiCheckConcurrency: 3,
  photoRetentionDays: 365,
  maxPhotosPerAssignment: 10,
  completedChecksKept: 50,
  lessonPlanEnabled: true,
  lessonPlanShortlistSize: 30,
  lessonPlanMaxItems: 40,
  lessonPlanConcurrency: 3,
  aiPlanDailyLimit: 300,
  homeworkPlanEnabled: true,
  homeworkPlanMaxItems: 40,
  homeworkPlanShortlistSize: 60,
  lessonCheckEnabled: true,
  lessonCheckDailyLimit: 300,
  lessonCheckPerStudentHourlyLimit: 30,
  lessonIdleWarnMinutes: 8,
  lessonIdleAlertMinutes: 15,
  loginHelpContact: "",
};

const fields = SETTINGS_GROUPS.flatMap((group) => group.fields);
const numberFields = fields.filter((field): field is NumberFieldSpec => field.kind === "int" || field.kind === "float");
const fieldOf = (key: string): NumberFieldSpec => {
  const field = numberFields.find((candidate) => candidate.key === key);
  assert.ok(field, key);
  return field;
};

test("SETTINGS_GROUPS: the five groups of the site, every one of the 25 keys exactly once", () => {
  assert.deepEqual(
    SETTINGS_GROUPS.map((group) => group.key),
    ["aiCheck", "lessonPlan", "classwork", "homeworkPlan", "files"],
  );
  assert.deepEqual(fields.map((field) => field.key).sort(), Object.keys(settings).sort());
  assert.equal(fields.length, 25);
});

test("SETTINGS_GROUPS: every label, hint and group title exists in both dictionaries", () => {
  for (const locale of ["ru", "en"] as const) {
    const t = getDictionary(locale).planner.devPanel.settings;
    for (const group of SETTINGS_GROUPS) {
      assert.equal(typeof t[group.key], "string");
      for (const field of group.fields) {
        assert.equal(typeof t[field.label], "string", `${field.key} label`);
        if ("hint" in field && field.hint) assert.equal(typeof t[field.hint], "string", `${field.key} hint`);
        if (field.kind === "bool" && field.onText && field.offText) {
          assert.equal(typeof t[field.onText], "string");
          assert.equal(typeof t[field.offText], "string");
        }
      }
    }
  }
});

test("ranges are the server's: the mock keeps a bound and clamps one step beyond it", async () => {
  const mock = createTestMock();
  await mock.signIn("dev@example.com");
  for (const field of numberFields) {
    const kept = await mock.api.developer.saveSettings({ [field.key]: field.min });
    assert.equal(kept.settings[field.key], field.min, `${field.key} min`);
    const keptMax = await mock.api.developer.saveSettings({ [field.key]: field.max });
    assert.equal(keptMax.settings[field.key], field.max, `${field.key} max`);
    const below = await mock.api.developer.saveSettings({ [field.key]: field.min - 1 });
    assert.equal(below.settings[field.key], field.min, `${field.key} below min`);
    const above = await mock.api.developer.saveSettings({ [field.key]: field.max + 1 });
    assert.equal(above.settings[field.key], field.max, `${field.key} above max`);
  }
});

test("toDraft → draftToSettings is the identity for stored settings", () => {
  const draft = toDraft(settings);
  assert.equal(draft.aiMinConfidence, "0.6");
  assert.equal(draft.aiDailyLimit, "300");
  assert.equal(draft.aiEnabled, true);
  assert.deepEqual(draftToSettings(draft), settings);
  assert.deepEqual(invalidFields(draft), []);
  assert.equal(isDraftDirty(draft, settings), false);
});

test("parseNumberInput: blank, text and out-of-range values are refused; a decimal comma is accepted; integers floor", () => {
  const concurrency = fieldOf("aiCheckConcurrency");
  assert.equal(parseNumberInput("3", concurrency), 3);
  assert.equal(parseNumberInput(" 8 ", concurrency), 8);
  assert.equal(parseNumberInput("3.9", concurrency), 3);
  assert.equal(parseNumberInput("", concurrency), null);
  assert.equal(parseNumberInput("abc", concurrency), null);
  assert.equal(parseNumberInput("0", concurrency), null);
  assert.equal(parseNumberInput("9", concurrency), null);
  assert.equal(parseNumberInput("1e2", concurrency), null);

  const confidence = fieldOf("aiMinConfidence");
  assert.equal(parseNumberInput("0,65", confidence), 0.65);
  assert.equal(parseNumberInput("0.", confidence), 0);
  assert.equal(parseNumberInput(".5", confidence), 0.5);
  assert.equal(parseNumberInput("1", confidence), 1);
  assert.equal(parseNumberInput("1.01", confidence), null);
  assert.equal(parseNumberInput("-0.1", confidence), null);

  // 0 is a meaningful value of the retention field («0 — не удалять автоматически»).
  assert.equal(parseNumberInput("0", fieldOf("photoRetentionDays")), 0);
});

test("an invalid field blocks the save and is reported by key", () => {
  const draft = { ...toDraft(settings), aiDailyLimit: "", lessonIdleWarnMinutes: "500" };
  assert.deepEqual(invalidFields(draft), ["aiDailyLimit", "lessonIdleWarnMinutes"]);
  assert.equal(draftToSettings(draft), null);
  assert.equal(isDraftDirty(draft, settings), true);
});

test("isDraftDirty: numbers compare by value, texts and switches exactly", () => {
  const base = toDraft(settings);
  assert.equal(isDraftDirty({ ...base, aiMinConfidence: "0,60" }, settings), false);
  assert.equal(isDraftDirty({ ...base, aiMinConfidence: "0.65" }, settings), true);
  assert.equal(isDraftDirty({ ...base, aiModel: "gpt-6.1-sol " }, settings), true);
  assert.equal(isDraftDirty({ ...base, aiEnabled: false }, settings), true);
  assert.equal(isDraftDirty({ ...base, aiReasoningEffort: "low" }, settings), true);
});

test("draftToSettings sends real types for all 25 keys", () => {
  const draft = { ...toDraft(settings), aiMinConfidence: "0,75", aiCheckConcurrency: "8", aiEnabled: false, loginHelpContact: "@help" };
  const values = draftToSettings(draft);
  assert.ok(values);
  assert.equal(Object.keys(values).length, 25);
  assert.equal(values.aiMinConfidence, 0.75);
  assert.equal(values.aiCheckConcurrency, 8);
  assert.equal(values.aiEnabled, false);
  assert.equal(values.loginHelpContact, "@help");
});

test("stepNumberInput: one step inside the range, no float noise, a blank field starts at the bound", () => {
  const confidence = fieldOf("aiMinConfidence");
  assert.equal(stepNumberInput("0.6", confidence, 1), "0.65");
  assert.equal(stepNumberInput("0.65", confidence, 1), "0.7");
  assert.equal(stepNumberInput("0,6", confidence, -1), "0.55");
  assert.equal(stepNumberInput("1", confidence, 1), "1");
  assert.equal(stepNumberInput("0", confidence, -1), "0");

  const concurrency = fieldOf("aiCheckConcurrency");
  assert.equal(stepNumberInput("3", concurrency, 1), "4");
  assert.equal(stepNumberInput("8", concurrency, 1), "8");
  assert.equal(stepNumberInput("", concurrency, 1), "1");
  assert.equal(stepNumberInput("", concurrency, -1), "8");
  assert.equal(stepNumberInput("abc", concurrency, 1), "1");
  // An out-of-range value comes back into the range.
  assert.equal(stepNumberInput("50", concurrency, 1), "8");
  assert.equal(stepNumberInput("50", concurrency, -1), "8");
});

test("canStep: disabled at the bound, enabled for a value that needs fixing", () => {
  const concurrency = fieldOf("aiCheckConcurrency");
  assert.equal(canStep("8", concurrency, 1), false);
  assert.equal(canStep("8", concurrency, -1), true);
  assert.equal(canStep("1", concurrency, -1), false);
  assert.equal(canStep("", concurrency, 1), true);
  assert.equal(canStep("99", concurrency, -1), true);
});
