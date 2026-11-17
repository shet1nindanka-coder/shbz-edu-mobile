// Plan state of a participant on the lesson / homework-draft boards (05 §4.2, §5.2, §5.3).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/query-core";
import { patchKeepingFetchTime, serverClockOffset } from "@/screens/planner/shared/board-cache";
import { countReady, planAnchorMs, planSignature, planStateOf, statusRowsOnBoard, statusSignatureRows } from "@/screens/planner/shared/plan-state";

const NOW = Date.parse("2026-11-16T12:00:00.000Z");
const MINUTE = 60_000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const participant = (patch: Partial<Parameters<typeof planStateOf>[0]> = {}) => ({
  id: "p1",
  planGeneratedAt: null,
  planError: null,
  createdAt: iso(-5_000),
  ...patch,
});

test("planStateOf: no plan and no error is pending until 15 minutes pass", () => {
  assert.deepEqual(planStateOf(participant(), NOW), { pending: true, stale: false, failed: false });
  assert.deepEqual(planStateOf(participant({ createdAt: iso(-15 * MINUTE) }), NOW), { pending: true, stale: false, failed: false });
  assert.deepEqual(planStateOf(participant({ createdAt: iso(-15 * MINUTE - 1) }), NOW), { pending: false, stale: true, failed: false });
});

test("planStateOf: a ready or failed participant is never pending or stale", () => {
  assert.deepEqual(planStateOf(participant({ planGeneratedAt: iso(-MINUTE), createdAt: iso(-60 * MINUTE) }), NOW), {
    pending: false,
    stale: false,
    failed: false,
  });
  assert.deepEqual(planStateOf(participant({ planError: "plan-error:failed", createdAt: iso(-60 * MINUTE) }), NOW), {
    pending: false,
    stale: false,
    failed: true,
  });
  // A stored error next to an older plan (manual edits never clear it) is still "failed".
  assert.equal(planStateOf(participant({ planGeneratedAt: iso(-MINUTE), planError: "plan-error:emptyPlan" }), NOW).failed, true);
});

test("planStateOf: an issued draft participant is frozen", () => {
  assert.deepEqual(planStateOf(participant({ issuedAssignmentId: "hw_1", createdAt: iso(-60 * MINUTE) }), NOW), {
    pending: false,
    stale: false,
    failed: false,
  });
});

test("planStateOf: an accepted retry restarts the 15-minute timer of an old participant", () => {
  const old = participant({ createdAt: iso(-3 * 24 * 60 * MINUTE) });
  assert.equal(planStateOf(old, NOW).stale, true);
  assert.deepEqual(planStateOf(old, NOW, iso(-2 * MINUTE)), { pending: true, stale: false, failed: false });
  assert.equal(planStateOf(old, NOW, iso(-16 * MINUTE)).stale, true);
});

test("planAnchorMs: the later of createdAt and the retry time; a broken retry time is ignored", () => {
  assert.equal(planAnchorMs({ createdAt: iso(-10) }, iso(-5)), NOW - 5);
  assert.equal(planAnchorMs({ createdAt: iso(-5) }, iso(-10)), NOW - 5);
  assert.equal(planAnchorMs({ createdAt: iso(-5) }, "nonsense"), NOW - 5);
  assert.equal(planAnchorMs({ createdAt: iso(-5) }, null), NOW - 5);
});

test("countReady counts participants with a plan, failed ones included only when they have one", () => {
  assert.equal(
    countReady([
      { planGeneratedAt: iso(0) },
      { planGeneratedAt: null },
      { planGeneratedAt: iso(-1) },
    ]),
    2,
  );
});

test("planSignature: order-independent, changes when a plan arrives, an error lands or a draft is issued", () => {
  const a = { id: "a", planGeneratedAt: null, planError: null, issuedAssignmentId: null };
  const b = { id: "b", planGeneratedAt: iso(0), planError: null, issuedAssignmentId: null };
  assert.equal(planSignature([a, b]), planSignature([b, a]));
  assert.notEqual(planSignature([a, b]), planSignature([{ ...a, planGeneratedAt: iso(1) }, b]));
  assert.notEqual(planSignature([a, b]), planSignature([{ ...a, planError: "plan-error:failed" }, b]));
  // The lesson board ignores the issue stamp, the draft board does not.
  assert.equal(planSignature([a, b]), planSignature([{ ...a, issuedAssignmentId: "hw" }, b]));
  assert.notEqual(planSignature([a, b], true), planSignature([{ ...a, issuedAssignmentId: "hw" }, b], true));
});

test("statusSignatureRows: a status payload gives the same signature as the board it describes", () => {
  const board = [
    { id: "p1", planGeneratedAt: null, planError: null },
    { id: "p2", planGeneratedAt: iso(0), planError: null },
  ];
  const status = [
    { participantId: "p2", studentId: "s2", name: "B", planGeneratedAt: iso(0), planError: null, itemsCount: 3 },
    { participantId: "p1", studentId: "s1", name: "A", planGeneratedAt: null, planError: null, itemsCount: 0 },
  ];
  assert.equal(planSignature(statusSignatureRows(status)), planSignature(board));
});

test("statusRowsOnBoard: a participant the lesson board hides does not take part in the comparison", () => {
  const board = [
    { id: "a", planGeneratedAt: null, planError: null },
    { id: "b", planGeneratedAt: iso(-MINUTE), planError: null },
  ];
  const status = [
    { participantId: "a", planGeneratedAt: null, planError: null },
    { participantId: "b", planGeneratedAt: iso(-MINUTE), planError: null },
    // The student moved to another teacher: listed by the status endpoint, hidden by the board.
    { participantId: "moved", planGeneratedAt: null, planError: "plan-error:failed" },
  ];
  const ids = board.map((row) => row.id);
  assert.notEqual(planSignature(statusSignatureRows(status)), planSignature(board));
  assert.equal(planSignature(statusRowsOnBoard(status, ids)), planSignature(board));
  // A real change of a shown participant is still seen.
  const ready = status.map((row) => (row.participantId === "a" ? { ...row, planGeneratedAt: iso(0) } : row));
  assert.notEqual(planSignature(statusRowsOnBoard(ready, ids)), planSignature(board));
});

test("serverClockOffset: serverNow minus the moment the response arrived; unusable input is 0", () => {
  assert.equal(serverClockOffset(iso(90_000), NOW), 90_000);
  assert.equal(serverClockOffset(iso(-5_000), NOW), -5_000);
  assert.equal(serverClockOffset(undefined, NOW), 0);
  assert.equal(serverClockOffset("not a date", NOW), 0);
  assert.equal(serverClockOffset(iso(0), 0), 0);
});

test("patchKeepingFetchTime: a local patch of the board does not move its fetch time", () => {
  const queryClient = new QueryClient();
  const key = ["planner", "getLessonBoard", "les_1"];
  type Board = { serverNow: string; marks: number };

  // Nothing cached yet: nothing to patch.
  patchKeepingFetchTime<Board>(queryClient, key, (current) => ({ ...current, marks: 1 }));
  assert.equal(queryClient.getQueryData(key), undefined);

  // The board was read 12 minutes ago; the server clock is 3 s ahead of the device.
  const fetchedAt = Date.now() - 12 * MINUTE;
  const serverNow = new Date(fetchedAt + 3_000).toISOString();
  queryClient.setQueryData<Board>(key, { serverNow, marks: 0 }, { updatedAt: fetchedAt });

  patchKeepingFetchTime<Board>(queryClient, key, (current) => ({ ...current, marks: current.marks + 1 }));
  const state = queryClient.getQueryState<Board>(key);
  assert.deepEqual(state?.data, { serverNow, marks: 1 });
  assert.equal(state?.dataUpdatedAt, fetchedAt);
  // The board clock therefore stays right: 3 s ahead, not 12 minutes behind.
  assert.equal(serverClockOffset(state?.data?.serverNow, state?.dataUpdatedAt ?? 0), 3_000);

  // The default `setQueryData` is what the helper replaces: it would stamp the patch with "now".
  queryClient.setQueryData<Board>(key, (current) => (current ? { ...current, marks: 9 } : current));
  const moved = queryClient.getQueryState<Board>(key);
  assert.ok(serverClockOffset(moved?.data?.serverNow, moved?.dataUpdatedAt ?? 0) < -11 * MINUTE);
  queryClient.clear();
});
