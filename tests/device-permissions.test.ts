// Pure device-service rules: the three states of the notification permission (what expo-notifications
// reports on each platform) and which scheduled reminders have to be set again for the exact-alarm mode.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { permissionStateOf } from "@/services/notifications/permission-state";
import { reminderIdentifier, remindersToRearm, type LocalReminder } from "@/services/notifications/reminders";

describe("permissionStateOf", () => {
  it("Android 13+ before the first prompt (denied + canAskAgain) is not a refusal: the prompt can still be shown", () => {
    assert.deepEqual(permissionStateOf({ granted: false, status: "denied", canAskAgain: true }), { status: "undetermined", canAskAgain: true });
  });

  it("iOS before the first prompt is undetermined", () => {
    assert.deepEqual(permissionStateOf({ granted: false, status: "undetermined", canAskAgain: true }), { status: "undetermined", canAskAgain: true });
  });

  it("a refusal for good (iOS after a refusal, Android after the second one or below 13) is denied", () => {
    assert.deepEqual(permissionStateOf({ granted: false, status: "denied", canAskAgain: false }), { status: "denied", canAskAgain: false });
    // No prompt can be shown any more, whatever the status string.
    assert.equal(permissionStateOf({ granted: false, status: "undetermined", canAskAgain: false }).status, "denied");
  });

  it("granted and iOS provisional are granted", () => {
    assert.equal(permissionStateOf({ granted: true, status: "granted", canAskAgain: true }).status, "granted");
    assert.equal(permissionStateOf({ granted: false, status: "undetermined", canAskAgain: true, provisional: true }).status, "granted");
  });
});

describe("remindersToRearm", () => {
  const reminder = (id: string): LocalReminder => ({
    id,
    category: "homeworkDeadlines",
    fireAt: Date.UTC(2026, 10, 20, 9),
    title: `t-${id}`,
    body: "b",
    link: { screen: "student.homeworks" },
  });
  const a = reminder("a");
  const b = reminder("b");
  const c = reminder("c");

  it("sets again what is scheduled but was not armed by this run; skips what is not scheduled", () => {
    const scheduled = [reminderIdentifier(a), reminderIdentifier(b), "foreign"];
    assert.deepEqual(remindersToRearm(scheduled, [a, b, c], new Set([reminderIdentifier(b)])), [a]);
  });

  it("a cold start (nothing armed) sets every scheduled wanted reminder once, without duplicates", () => {
    const scheduled = [reminderIdentifier(a), reminderIdentifier(c)];
    assert.deepEqual(remindersToRearm(scheduled, [a, c, a], new Set()), [a, c]);
  });

  it("everything armed: nothing to do", () => {
    const ids = [reminderIdentifier(a), reminderIdentifier(b)];
    assert.deepEqual(remindersToRearm(ids, [a, b], new Set(ids)), []);
  });
});
