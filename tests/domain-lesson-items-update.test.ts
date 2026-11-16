// Ported from the site (tests/lesson-items-update.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { planLessonItemsUpdate } from "@/domain/lesson-plan";

const existing = [
  { id: "item-a", homeworkNumberId: "n-a", hasSubmission: false },
  { id: "item-b", homeworkNumberId: "n-b", hasSubmission: true },
  { id: "item-c", homeworkNumberId: "n-c", hasSubmission: false }
];

test("planLessonItemsUpdate: существующие номера обновляются на месте, новые создаются", () => {
  const plan = planLessonItemsUpdate(existing, ["n-c", "n-a", "n-new"], ["n-b"]);

  assert.deepEqual(plan.toUpdate, [
    { id: "item-c", order: 0, isExtra: false },
    { id: "item-a", order: 1, isExtra: false },
    { id: "item-b", order: 3, isExtra: true }
  ]);
  assert.deepEqual(plan.toCreate, [{ homeworkNumberId: "n-new", order: 2, isExtra: false }]);
  assert.deepEqual(plan.toDelete, []);
  assert.deepEqual(plan.blockedItemIds, []);
});

test("planLessonItemsUpdate: номер без сдач удаляется, номер со сдачей — блокирует правку", () => {
  const plan = planLessonItemsUpdate(existing, ["n-a"], []);

  assert.deepEqual(plan.toUpdate, [{ id: "item-a", order: 0, isExtra: false }]);
  assert.deepEqual(plan.toDelete, ["item-c"]);
  assert.deepEqual(plan.blockedItemIds, ["item-b"]);
});

test("planLessonItemsUpdate: пустой список очищает набор без сдач", () => {
  const plan = planLessonItemsUpdate(
    [
      { id: "item-a", homeworkNumberId: "n-a", hasSubmission: false },
      { id: "item-c", homeworkNumberId: "n-c", hasSubmission: false }
    ],
    [],
    []
  );

  assert.deepEqual(plan.toDelete, ["item-a", "item-c"]);
  assert.deepEqual(plan.toUpdate, []);
  assert.deepEqual(plan.toCreate, []);
  assert.deepEqual(plan.blockedItemIds, []);
});

test("planLessonItemsUpdate: перенос из основной части в дополнительную не пересоздаёт строку", () => {
  const plan = planLessonItemsUpdate([{ id: "item-a", homeworkNumberId: "n-a", hasSubmission: true }], [], ["n-a"]);

  assert.deepEqual(plan.toUpdate, [{ id: "item-a", order: 0, isExtra: true }]);
  assert.deepEqual(plan.toCreate, []);
  assert.deepEqual(plan.toDelete, []);
  assert.deepEqual(plan.blockedItemIds, []);
});
