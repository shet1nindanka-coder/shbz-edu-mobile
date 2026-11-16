// Ported from the site (tests/check-queue-state.test.ts): the same cases against the ported module.
// [MOBILE] The site's process-wide tracker (`trackCheck` / `untrackCheck`) is server state and is not ported.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { pickNextCheckIndex } from "@/domain/check-queue-state";

test("pickNextCheckIndex: сдачи на уроке раньше ДЗ, внутри вида — по порядку", () => {
  assert.equal(pickNextCheckIndex([]), -1);
  assert.equal(pickNextCheckIndex([{ kind: "HOMEWORK" }, { kind: "HOMEWORK" }]), 0);
  assert.equal(
    pickNextCheckIndex([{ kind: "HOMEWORK" }, { kind: "LESSON_ITEM" }, { kind: "LESSON_ITEM" }]),
    1
  );
});
