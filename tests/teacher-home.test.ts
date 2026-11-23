// Pure model of the teacher's overview: the source of the calls widget, the count-up.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { countUpFrame } from "../src/components/count-up/count-up-frame";
import { pickCallCounts } from "../src/screens/teacher/home/home-cards";

describe("calls widget source", () => {
  const fromHome = { data: { due: 1, overdue: 0 }, updatedAt: 1_000 };

  it("uses the home summary until the dedicated counters arrive", () => {
    assert.deepEqual(pickCallCounts(fromHome, null), { due: 1, overdue: 0 });
  });

  it("prefers whichever read is newer; a tie goes to the dedicated counters", () => {
    assert.deepEqual(pickCallCounts(fromHome, { data: { due: 0, overdue: 0 }, updatedAt: 2_000 }), { due: 0, overdue: 0 });
    assert.deepEqual(pickCallCounts(fromHome, { data: { due: 3, overdue: 2 }, updatedAt: 1_000 }), { due: 3, overdue: 2 });
    assert.deepEqual(pickCallCounts(fromHome, { data: { due: 3, overdue: 2 }, updatedAt: 500 }), { due: 1, overdue: 0 });
  });
});

describe("count-up frame", () => {
  it("starts at zero and ends on the target", () => {
    assert.equal(countUpFrame(62, 0), 0);
    assert.equal(countUpFrame(62, 1), 62);
    assert.equal(countUpFrame(0, 0.5), 0);
  });

  it("eases out: more than half of the way at half of the time", () => {
    assert.equal(countUpFrame(100, 0.5), 88);
    assert.ok(countUpFrame(100, 0.25) > 50);
  });

  it("clamps progress outside 0..1 (a late frame never overshoots)", () => {
    assert.equal(countUpFrame(40, -1), 0);
    assert.equal(countUpFrame(40, 1.7), 40);
  });
});
