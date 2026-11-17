// One-shot notices between screens (`src/services/notices`): taken once, replaced by a newer key,
// dropped on sign-out.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  clearOneShotNotices,
  noticeChannel,
  postOneShotNotice,
  subscribeOneShotNotice,
  takeOneShotNotice,
} from "../src/services/notices/one-shot-store";

const TOPICS = noticeChannel<"created" | "deleted">("test.topics");
const STUDENTS = noticeChannel<"studentDeleted">("test.students");

describe("one-shot notices", () => {
  afterEach(() => clearOneShotNotices());

  it("hands a posted key over exactly once", () => {
    assert.equal(takeOneShotNotice(TOPICS), null);
    postOneShotNotice(TOPICS, "deleted");
    assert.equal(takeOneShotNotice(TOPICS), "deleted");
    assert.equal(takeOneShotNotice(TOPICS), null);
  });

  it("keeps channels apart and lets a newer key replace an untaken one", () => {
    postOneShotNotice(TOPICS, "created");
    postOneShotNotice(TOPICS, "deleted");
    postOneShotNotice(STUDENTS, "studentDeleted");
    assert.equal(takeOneShotNotice(STUDENTS), "studentDeleted");
    assert.equal(takeOneShotNotice(TOPICS), "deleted");
  });

  it("drops what nobody took on sign-out: the next account sees nothing", () => {
    postOneShotNotice(TOPICS, "deleted");
    clearOneShotNotices();
    assert.equal(takeOneShotNotice(TOPICS), null);
  });

  it("tells a mounted receiver at once; the receiver consumes the key", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeOneShotNotice(TOPICS, () => {
      const key = takeOneShotNotice(TOPICS);
      if (key) seen.push(key);
    });
    postOneShotNotice(TOPICS, "deleted");
    postOneShotNotice(STUDENTS, "studentDeleted");
    assert.deepEqual(seen, ["deleted"]);
    // Consumed by the receiver: a screen mounted later (another account's list) gets nothing.
    assert.equal(takeOneShotNotice(TOPICS), null);

    unsubscribe();
    postOneShotNotice(TOPICS, "created");
    assert.deepEqual(seen, ["deleted"]);
    assert.equal(takeOneShotNotice(TOPICS), "created");
  });

  it("survives a receiver that unsubscribes while it is being told", () => {
    const calls: string[] = [];
    const unsubscribeFirst = subscribeOneShotNotice(TOPICS, () => {
      calls.push("first");
      unsubscribeFirst();
    });
    const unsubscribeSecond = subscribeOneShotNotice(TOPICS, () => calls.push("second"));
    postOneShotNotice(TOPICS, "deleted");
    assert.deepEqual(calls, ["first", "second"]);
    unsubscribeSecond();
  });
});
