// The pending-writes queue (src/services/query/pending-writes.ts): what is kept, what is dropped, in which
// order things are sent, and that the stored queue survives a restart.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, isNetworkError } from "@/api/errors";
import {
  PENDING_WRITES_STORAGE_KEY,
  createPendingWritesQueue,
  parsePendingWrites,
  type PendingWrite,
  type PendingWritesStorage,
} from "@/services/query/pending-writes";

type Context = { sent: string[] };

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: PendingWritesStorage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
  return { storage, data };
}

function harness(options: { initial?: Record<string, string>; userId?: string | null } = {}) {
  const { storage, data } = memoryStorage(options.initial);
  const state = { online: true, userId: options.userId === undefined ? "usr_ilya" : options.userId, now: 1000 };
  const context: Context = { sent: [] };
  const rejected: { write: PendingWrite; error: unknown }[] = [];
  const queue = createPendingWritesQueue<Context>({
    storage,
    getContext: () => context,
    getUserId: () => state.userId,
    isRetryable: isNetworkError,
    onRejected: (write, error) => rejected.push({ write, error }),
    now: () => (state.now += 1),
  });
  /** A sender that fails with the client-side network error while "offline". */
  const registerNote = (refuse?: (write: PendingWrite<{ note: string }>) => ApiError | null) =>
    queue.register<{ note: string }, { note: string }>("note", async (write, ctx) => {
      if (!state.online) throw ApiError.network("offline");
      const refusal = refuse?.(write);
      if (refusal) throw refusal;
      ctx.sent.push(`${write.id}=${write.payload.note}`);
      return { note: write.payload.note.trim() };
    });
  const stored = async () => {
    // Let the serialized save chain settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return parsePendingWrites(data.get(PENDING_WRITES_STORAGE_KEY));
  };
  return { queue, state, context, rejected, registerNote, stored, data };
}

const notFound = () => new ApiError({ code: "numberNotFound", status: 404, message: "Номер не найден." });

describe("pending writes", () => {
  it("sends at once when online and hands the handler's result to the caller", async () => {
    const { queue, context, registerNote, stored } = harness();
    registerNote();
    const outcome = await queue.submit<{ note: string }, { note: string }>("note", "n1", { note: " hello " });
    assert.deepEqual(outcome, { status: "sent", result: { note: "hello" } });
    assert.deepEqual(context.sent, ["n1= hello "]);
    assert.equal(queue.get("note", "n1"), null);
    assert.deepEqual(await stored(), []);
  });

  it("keeps the write when there is no connection and sends it on flush", async () => {
    const { queue, state, context, registerNote, stored } = harness();
    registerNote();
    state.online = false;
    assert.deepEqual(await queue.submit("note", "n1", { note: "draft" }), { status: "queued" });
    assert.equal(queue.get<{ note: string }>("note", "n1")?.payload.note, "draft");
    assert.equal(queue.get("note", "n1")?.attempts, 1);
    assert.equal((await stored()).length, 1);

    // Still offline: nothing is lost, the attempt is counted.
    assert.deepEqual(await queue.flush(), { sent: 0, rejected: 0, remaining: 1 });
    assert.equal(queue.get("note", "n1")?.attempts, 2);

    state.online = true;
    assert.deepEqual(await queue.flush(), { sent: 1, rejected: 0, remaining: 0 });
    assert.deepEqual(context.sent, ["n1=draft"]);
    assert.deepEqual(await stored(), []);
  });

  it("keeps one entry per kind + id: the newest payload wins", async () => {
    const { queue, state, context, registerNote } = harness();
    registerNote();
    state.online = false;
    await queue.submit("note", "n1", { note: "first" });
    await queue.submit("note", "n1", { note: "second" });
    await queue.submit("note", "n2", { note: "other" });
    assert.equal(queue.list().length, 2);
    assert.equal(queue.list("note").length, 2);
    state.online = true;
    await queue.flush();
    // Oldest entry first; the replaced payload is never sent.
    assert.deepEqual(context.sent, ["n1=second", "n2=other"]);
  });

  it("drops a write the server refuses and reports it", async () => {
    const { queue, state, rejected, registerNote, stored } = harness();
    registerNote((write) => (write.id === "gone" ? notFound() : null));

    // Awaited submit: the caller gets the error itself.
    const direct = await queue.submit("note", "gone", { note: "x" });
    assert.equal(direct.status, "rejected");
    assert.equal(direct.status === "rejected" && (direct.error as ApiError).code, "numberNotFound");
    assert.equal(queue.get("note", "gone"), null);
    assert.equal(rejected.length, 0);

    // Background flush: nobody awaits, so `onRejected` is told.
    state.online = false;
    await queue.submit("note", "gone", { note: "y" });
    await queue.submit("note", "ok", { note: "z" });
    state.online = true;
    assert.deepEqual(await queue.flush(), { sent: 1, rejected: 1, remaining: 0 });
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.write.id, "gone");
    assert.deepEqual(await stored(), []);
  });

  it("stops a flush at the first network failure", async () => {
    const { queue, state, context } = harness();
    let calls = 0;
    queue.register<{ note: string }>("note", async (write, ctx) => {
      calls += 1;
      if (!state.online) throw ApiError.network("offline");
      ctx.sent.push(write.id);
    });
    state.online = false;
    await queue.submit("note", "a", { note: "1" });
    await queue.submit("note", "b", { note: "2" });
    await queue.submit("note", "c", { note: "3" });
    calls = 0;
    await queue.flush();
    assert.equal(calls, 1);
    assert.deepEqual(context.sent, []);
    assert.equal(queue.list().length, 3);
  });

  it("survives a restart: the stored queue is sent by the next run", async () => {
    const first = harness();
    first.registerNote();
    first.state.online = false;
    await first.queue.submit("note", "n1", { note: "kept" });
    assert.equal((await first.stored()).length, 1);

    // A new run of the app: a new queue over the same device storage.
    const second = harness({ initial: Object.fromEntries(first.data) });
    second.registerNote();
    await second.queue.hydrate();
    assert.equal(second.queue.get<{ note: string }>("note", "n1")?.payload.note, "kept");
    await second.queue.flush();
    assert.deepEqual(second.context.sent, ["n1=kept"]);
  });

  it("never sends another user's draft, and nothing while signed out", async () => {
    const { queue, state, context, registerNote } = harness();
    registerNote();
    state.online = false;
    await queue.submit("note", "n1", { note: "ilya's" });
    state.online = true;

    state.userId = "usr_maria";
    assert.deepEqual(await queue.flush(), { sent: 0, rejected: 0, remaining: 1 });
    state.userId = null;
    assert.deepEqual(await queue.flush(), { sent: 0, rejected: 0, remaining: 1 });
    const signedOut = await queue.submit("note", "n2", { note: "x" });
    assert.equal(signedOut.status, "rejected");

    state.userId = "usr_ilya";
    await queue.flush();
    assert.deepEqual(context.sent, ["n1=ilya's"]);
  });

  it("leaves a write alone while its kind has no sender, and refuses to queue an unknown kind", async () => {
    const stale: PendingWrite = { kind: "later", id: "x", payload: 1, userId: "usr_ilya", createdAt: 1, updatedAt: 1, attempts: 0 };
    const { queue } = harness({ initial: { [PENDING_WRITES_STORAGE_KEY]: JSON.stringify([stale]) } });
    assert.deepEqual(await queue.flush(), { sent: 0, rejected: 0, remaining: 1 });
    const sent: unknown[] = [];
    queue.register<number>("later", async (write) => {
      sent.push(write.payload);
    });
    await queue.flush();
    assert.deepEqual(sent, [1]);

    const unknown = await queue.submit("nobody", "x", {});
    assert.equal(unknown.status, "rejected");
  });

  it("does not lose a payload typed while the previous one was being sent", async () => {
    const { queue, context } = harness();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    queue.register<{ note: string }>("note", async (write, ctx) => {
      if (first) {
        first = false;
        await gate;
      }
      ctx.sent.push(write.payload.note);
    });
    const slow = queue.submit("note", "n1", { note: "old" });
    // Give the first handler a chance to start, then type again.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const fast = queue.submit("note", "n1", { note: "new" });
    release();
    await Promise.all([slow, fast]);
    assert.deepEqual(context.sent.sort(), ["new", "old"]);
    assert.equal(queue.get("note", "n1"), null);
  });

  it("notifies subscribers and bumps the version on every change", async () => {
    const { queue, state, registerNote } = harness();
    registerNote();
    let notified = 0;
    const unsubscribe = queue.subscribe(() => {
      notified += 1;
    });
    const before = queue.version();
    state.online = false;
    await queue.submit("note", "n1", { note: "a" });
    assert.ok(queue.version() > before);
    assert.ok(notified >= 1);
    await queue.discard("note", "n1");
    assert.equal(queue.list().length, 0);
    unsubscribe();
    const count = notified;
    await queue.submit("note", "n2", { note: "b" });
    assert.equal(notified, count);
    await queue.clear();
    assert.equal(queue.list().length, 0);
  });

  it("ignores a corrupted stored queue", () => {
    assert.deepEqual(parsePendingWrites(null), []);
    assert.deepEqual(parsePendingWrites("{"), []);
    assert.deepEqual(parsePendingWrites('{"kind":"x"}'), []);
    assert.deepEqual(parsePendingWrites('[{"kind":"x"},5,null]'), []);
    const good: PendingWrite = { kind: "k", id: "i", payload: { a: 1 }, userId: "u", createdAt: 1, updatedAt: 2, attempts: 0 };
    assert.deepEqual(parsePendingWrites(JSON.stringify([good, { kind: "bad" }])), [good]);
  });
});
