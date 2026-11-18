// Server-driven refreshes (realtime events, signature polls) never cancel a read in flight and are followed
// by exactly one more read: a burst of events during slow reads always ends showing the last change, with a
// bounded number of reads (#416).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { cancelPendingRefreshes, refreshQueries } from "@/services/query/refresh-queries";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Harness = {
  queryClient: QueryClient;
  /** The server's current version; a read answers with the version it saw when it reached the server. */
  server: { version: number };
  reads: { started: number; completed: number };
  /** Values the screen showed, in order. */
  shown: number[];
  unsubscribe: () => void;
};

const clients: QueryClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) {
    cancelPendingRefreshes(client);
    client.clear();
  }
});

async function setup(readMs: number, observe = true): Promise<Harness> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(queryClient);
  const server = { version: 0 };
  const reads = { started: 0, completed: 0 };
  const shown: number[] = [];
  const observer = new QueryObserver<number>(queryClient, {
    queryKey: ["planner", "getLessonBoard", "les_live"],
    queryFn: async () => {
      reads.started += 1;
      const seen = server.version;
      await sleep(readMs);
      reads.completed += 1;
      return seen;
    },
  });
  const unsubscribe = observe
    ? observer.subscribe((result) => {
        if (result.data !== undefined && shown.at(-1) !== result.data) shown.push(result.data);
      })
    : () => undefined;
  if (observe) {
    while (shown.length === 0) await sleep(5);
  } else {
    await queryClient.prefetchQuery({ queryKey: ["planner", "getLessonBoard", "les_live"], queryFn: () => 0 });
  }
  return { queryClient, server, reads, shown, unsubscribe };
}

async function settle(harness: Harness): Promise<void> {
  while (harness.queryClient.isFetching() > 0) await sleep(5);
  await sleep(20);
}

describe("refreshQueries (realtime refreshes)", () => {
  it("lets reads land while events arrive faster than a read answers, and ends on the last change", async () => {
    const harness = await setup(60);
    const readsBefore = harness.reads.started;
    for (let event = 1; event <= 12; event += 1) {
      harness.server.version = event;
      void refreshQueries(harness.queryClient, { queryKey: ["planner"] });
      await sleep(25);
    }
    // Reads landed during the burst (with cancelling refetches nothing would be shown before it ends).
    assert.ok(harness.shown.length >= 3, `values shown during the burst: ${JSON.stringify(harness.shown)}`);
    await settle(harness);
    assert.equal(harness.shown.at(-1), 12, `the last change is shown: ${JSON.stringify(harness.shown)}`);
    // Never more than one read in flight and every started read completes: no cancelled work.
    assert.equal(harness.reads.started, harness.reads.completed);
    // 12 events over ~300 ms with 60 ms reads: one read per read-time window plus one follow-up.
    assert.ok(harness.reads.started - readsBefore <= 8, `reads: ${harness.reads.started - readsBefore}`);
  });

  it("an event that joins a running read is followed by exactly one more read", async () => {
    const harness = await setup(80);
    harness.server.version = 1;
    void refreshQueries(harness.queryClient, { queryKey: ["planner"] });
    await sleep(10);
    // Three more changes while that read is still running: they coalesce into one follow-up.
    for (let event = 2; event <= 4; event += 1) {
      harness.server.version = event;
      void refreshQueries(harness.queryClient, { queryKey: ["planner"] });
      await sleep(10);
    }
    await settle(harness);
    assert.deepEqual(harness.shown, [0, 1, 4]);
    // The initial read, the read of event 1 and one follow-up.
    assert.equal(harness.reads.started, 3);
  });

  it("an idle query is read once, without a follow-up", async () => {
    const harness = await setup(30);
    harness.server.version = 1;
    void refreshQueries(harness.queryClient, { queryKey: ["planner", "getLessonBoard", "les_live"], exact: true });
    await settle(harness);
    assert.deepEqual(harness.shown, [0, 1]);
    assert.equal(harness.reads.started, 2);
  });

  it("stops after cancelPendingRefreshes (sign-out)", async () => {
    const harness = await setup(60);
    harness.server.version = 1;
    void refreshQueries(harness.queryClient, { queryKey: ["planner"] });
    await sleep(10);
    harness.server.version = 2;
    void refreshQueries(harness.queryClient, { queryKey: ["planner"] });
    cancelPendingRefreshes(harness.queryClient);
    await settle(harness);
    assert.equal(harness.reads.started, 2);
  });

  it("a query left without observers is only marked stale by the follow-up", async () => {
    const harness = await setup(60);
    harness.server.version = 1;
    void refreshQueries(harness.queryClient, { queryKey: ["planner"] });
    await sleep(10);
    void refreshQueries(harness.queryClient, { queryKey: ["planner"] });
    // The screen closes while the read runs.
    harness.unsubscribe();
    await settle(harness);
    assert.equal(harness.reads.started, 2);
    const query = harness.queryClient.getQueryCache().find({ queryKey: ["planner", "getLessonBoard", "les_live"] });
    assert.equal(query?.state.isInvalidated, true);
  });

  it("a read cancelled by a user's write is not followed up (the write re-reads itself)", async () => {
    const harness = await setup(60);
    harness.server.version = 1;
    void refreshQueries(harness.queryClient, { queryKey: ["planner"] });
    await sleep(10);
    void refreshQueries(harness.queryClient, { queryKey: ["planner"] });
    await harness.queryClient.cancelQueries({ queryKey: ["planner"] });
    await settle(harness);
    assert.equal(harness.reads.started, 2);
  });
});
