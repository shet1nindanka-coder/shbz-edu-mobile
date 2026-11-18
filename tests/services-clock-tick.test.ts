// The device clock of `useNowTick` / `useServerNow` is the real clock rounded down to the tick, never a
// count of ticks (#408: Android timers stand still while the phone sleeps).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clockSnapshot, delayToNextTick } from "@/services/clock/clock-tick";

describe("clock tick arithmetic", () => {
  it("rounds the wall clock down to the tick, so a snapshot is stable within one tick", () => {
    const at = Date.parse("2026-11-19T05:00:20.000Z");
    assert.equal(clockSnapshot(60_000, at), Date.parse("2026-11-19T05:00:00.000Z"));
    assert.equal(clockSnapshot(60_000, at + 39_999), clockSnapshot(60_000, at));
    assert.equal(clockSnapshot(60_000, at + 40_000), Date.parse("2026-11-19T05:01:00.000Z"));
    assert.equal(clockSnapshot(30_000, at), Date.parse("2026-11-19T05:00:00.000Z"));
  });

  it("aims the next notification at the next boundary, never at 0 ms", () => {
    const at = Date.parse("2026-11-19T05:00:20.000Z");
    assert.equal(delayToNextTick(60_000, at), 40_000);
    assert.equal(delayToNextTick(60_000, Date.parse("2026-11-19T05:01:00.000Z")), 60_000);
    assert.equal(delayToNextTick(30_000, at + 9_999), 1);
  });
});
