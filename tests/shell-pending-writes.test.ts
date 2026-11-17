// The pending-writes queue (src/services/query/pending-writes.ts): what is kept, what is dropped, in which
// order things are sent, and that the stored queue survives a restart.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, isNetworkError } from "@/api/errors";
import { isPendingWriteRetryable, keepPendingWriteRefusal, summarizePendingWrites } from "@/services/query/pending-write-errors";
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

  it("sends one request per entry at a time, so a slow older save can never land after a newer one", async () => {
    const { queue } = harness();
    let server = "";
    let inFlight = 0;
    let overlap = false;
    // The first request is slow, the next ones are fast: unserialized, "one" would be applied last.
    const delays = [40, 1, 1];
    queue.register<{ note: string }, { note: string }>("note", async (write) => {
      inFlight += 1;
      if (inFlight > 1) overlap = true;
      await new Promise((resolve) => setTimeout(resolve, delays.shift() ?? 1));
      server = write.payload.note;
      inFlight -= 1;
      return { note: write.payload.note };
    });
    const first = queue.submit("note", "n1", { note: "one" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = queue.submit("note", "n1", { note: "one two" });
    const [a, b] = await Promise.all([first, second]);
    assert.equal(overlap, false);
    assert.equal(server, "one two");
    assert.deepEqual(a, { status: "sent", result: { note: "one" } });
    assert.deepEqual(b, { status: "sent", result: { note: "one two" } });
    assert.equal(queue.get("note", "n1"), null);
  });

  it("a payload superseded while it waited is not sent; its submit gets the newer request's answer", async () => {
    const { queue } = harness();
    const sent: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    queue.register<{ note: string }, { note: string }>("note", async (write) => {
      if (sent.length === 0) await gate;
      sent.push(write.payload.note);
      return { note: write.payload.note };
    });
    const a = queue.submit("note", "n1", { note: "a" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const b = queue.submit("note", "n1", { note: "ab" });
    const c = queue.submit("note", "n1", { note: "abc" });
    release();
    const outcomes = await Promise.all([a, b, c]);
    assert.deepEqual(sent, ["a", "abc"]);
    assert.deepEqual(outcomes, [
      { status: "sent", result: { note: "a" } },
      { status: "sent", result: { note: "abc" } },
      { status: "sent", result: { note: "abc" } },
    ]);
  });

  it("a background flush and an editor's submit of the same entry do not overlap", async () => {
    const { queue, state } = harness();
    let inFlight = 0;
    let overlap = false;
    const applied: string[] = [];
    queue.register<{ note: string }>("note", async (write) => {
      if (!state.online) throw ApiError.network("offline");
      inFlight += 1;
      if (inFlight > 1) overlap = true;
      await new Promise((resolve) => setTimeout(resolve, 5));
      applied.push(write.payload.note);
      inFlight -= 1;
    });
    state.online = false;
    assert.equal((await queue.submit("note", "n1", { note: "offline text" })).status, "queued");
    state.online = true;
    const flushing = queue.flush();
    const typed = queue.submit("note", "n1", { note: "newer text" });
    await Promise.all([flushing, typed]);
    assert.equal(overlap, false);
    assert.equal(applied[applied.length - 1], "newer text");
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

// ───────────── the app's configuration: refusals kept, expired sessions held, backoff while online ─────────────

const sessionExpired = () => new ApiError({ code: "sessionExpired", status: 401, message: "Сессия истекла." });
const unavailable = () => new ApiError({ code: "serviceUnavailable", status: 503, message: "Сервис недоступен.", retryAfterSeconds: 5 });
const saveFailed = () => new ApiError({ code: "saveFailed", status: 500, message: "Не удалось сохранить." });
const rateLimited = () => new ApiError({ code: "rateLimited", status: 429, message: "Слишком часто.", retryAfterSeconds: 30 });

/** A manual timer list: `fire()` runs the earliest timer. */
function fakeTimers() {
  const pending: { id: number; ms: number; callback: () => void }[] = [];
  let next = 1;
  return {
    pending,
    timers: {
      set: (callback: () => void, ms: number) => {
        const id = next++;
        pending.push({ id, ms, callback });
        return id;
      },
      clear: (handle: unknown) => {
        const index = pending.findIndex((timer) => timer.id === handle);
        if (index >= 0) pending.splice(index, 1);
      },
    },
    fire() {
      const timer = pending.shift();
      assert.ok(timer, "a timer is scheduled");
      timer.callback();
    },
  };
}

function appHarness(options: { initial?: Record<string, string> } = {}) {
  const { storage, data } = memoryStorage(options.initial);
  const state = {
    online: true,
    /** The server answers (false = timeout / unreachable while the device is "online"). */
    reachable: true,
    userId: "usr_ilya" as string | null,
    ownerId: null as string | null,
    now: 1000,
    refuse: null as ApiError | null,
  };
  const clock = fakeTimers();
  const sent: string[] = [];
  const rejected: PendingWrite[] = [];
  const queue = createPendingWritesQueue<Context>({
    storage,
    getContext: () => ({ sent }),
    getUserId: () => state.userId,
    getOwnerId: () => state.ownerId,
    // The rules the app passes (src/providers/pending-writes.ts).
    isRetryable: isPendingWriteRetryable,
    isHeld: (error) => error instanceof ApiError && error.code === "sessionExpired",
    keepRefused: keepPendingWriteRefusal,
    onRejected: (write) => rejected.push(write),
    retryDelaysMs: [5000, 15000, 30000, 60000],
    isOnline: () => state.online,
    timers: clock.timers,
    now: () => (state.now += 1),
  });
  queue.register<{ note: string }, { note: string }>("note", async (write, ctx) => {
    if (!state.online || !state.reachable) throw ApiError.network("no answer");
    if (state.refuse) throw state.refuse;
    ctx.sent.push(`${write.id}=${write.payload.note}`);
    return { note: write.payload.note };
  });
  const stored = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return parsePendingWrites(data.get(PENDING_WRITES_STORAGE_KEY));
  };
  /** Lets the lane bookkeeping (which schedules the backoff) settle. */
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { queue, state, clock, sent, rejected, stored, data, tick };
}

describe("pending writes: the state machine of the app's queue", () => {
  it("WAITING while online: re-sent by itself with backoff, not only on a reconnect event", async () => {
    const { queue, state, clock, sent, tick } = appHarness();
    state.reachable = false; // online, but the server does not answer (timeout)
    assert.equal((await queue.submit("note", "n1", { note: "draft" })).status, "queued");
    await tick();
    assert.deepEqual(clock.pending.map((timer) => timer.ms), [5000]);

    // The next try fails too: the wait grows.
    clock.fire();
    await tick();
    await tick();
    assert.deepEqual(sent, []);
    assert.deepEqual(clock.pending.map((timer) => timer.ms), [15000]);

    state.reachable = true;
    clock.fire();
    await tick();
    await tick();
    assert.deepEqual(sent, ["n1=draft"]);
    assert.equal(queue.get("note", "n1"), null);
    assert.equal(clock.pending.length, 0, "nothing left: no timer");

    // A delivery resets the backoff.
    state.reachable = false;
    await queue.submit("note", "n2", { note: "next" });
    await tick();
    assert.deepEqual(clock.pending.map((timer) => timer.ms), [5000]);
  });

  it("a timer that fires offline leaves the next try to the reconnect; nothing is scheduled while signed out", async () => {
    const { queue, state, clock, sent, tick } = appHarness();
    state.online = false;
    await queue.submit("note", "n1", { note: "offline" });
    await tick();
    assert.equal(clock.pending.length, 1);
    clock.fire(); // still offline: no request, no new timer
    await tick();
    assert.equal(clock.pending.length, 0);
    assert.equal(queue.get("note", "n1")?.attempts, 1);

    state.online = true;
    await queue.flush(); // the reconnect event
    assert.deepEqual(sent, ["n1=offline"]);

    state.reachable = false;
    state.userId = null;
    state.ownerId = "usr_ilya";
    await queue.submit("note", "n2", { note: "x" });
    await tick();
    assert.equal(clock.pending.length, 0);
  });

  it("clear (explicit sign-out) cancels the backoff", async () => {
    const { queue, state, clock, tick } = appHarness();
    state.reachable = false;
    await queue.submit("note", "n1", { note: "draft" });
    await tick();
    assert.equal(clock.pending.length, 1);
    await queue.clear();
    assert.equal(clock.pending.length, 0);
  });

  it("REFUSED in the background: kept with its refusal, never re-sent by itself, replaced by a newer submit", async () => {
    const { queue, state, sent, rejected, stored } = appHarness();
    state.online = false;
    await queue.submit("note", "n1", { note: "refused text" });
    state.online = true;
    state.refuse = saveFailed();
    assert.deepEqual(await queue.flush(), { sent: 0, rejected: 1, remaining: 1 });
    assert.equal(rejected.length, 1);
    const kept = queue.get<{ note: string }>("note", "n1");
    assert.equal(kept?.payload.note, "refused text");
    assert.equal(kept?.refusal?.code, "saveFailed");
    assert.equal(kept?.refusal?.message, "Не удалось сохранить.");
    assert.equal(kept?.refusal?.retryAt, null);
    // It survives a restart with the refusal.
    assert.equal((await stored())[0]?.refusal?.code, "saveFailed");

    // Not repeated by a flush, even when the server would accept it now.
    state.refuse = null;
    assert.deepEqual(await queue.flush(), { sent: 0, rejected: 0, remaining: 1 });
    assert.deepEqual(sent, []);

    // The student sends it again: the refusal goes with the old payload.
    const again = await queue.submit("note", "n1", { note: "refused text" });
    assert.equal(again.status, "sent");
    assert.equal(queue.get("note", "n1"), null);
  });

  it("a transient 503 (serviceUnavailable) in the background is waited out and re-sent, not parked as refused", async () => {
    const { queue, state, clock, sent, rejected, tick } = appHarness();
    state.online = false;
    await queue.submit("note", "n1", { note: "typed offline" });
    await tick();
    clock.fire(); // the offline timer: leaves the try to the reconnect
    state.online = true;
    state.refuse = unavailable();
    // The reconnect flush meets the 503.
    assert.deepEqual(await queue.flush(), { sent: 0, rejected: 0, remaining: 1 });
    assert.equal(rejected.length, 0);
    // An awaited save that meets it waits too.
    assert.equal((await queue.submit("note", "n1", { note: "typed offline" })).status, "queued");
    assert.equal(queue.get("note", "n1")?.refusal, undefined, "still waiting, not refused");
    assert.deepEqual(summarizePendingWrites(queue.list(), "usr_ilya"), { waiting: 1, refused: 0 });
    await tick();
    assert.equal(clock.pending.length, 1, "re-sent by itself with backoff");

    state.refuse = null;
    clock.fire();
    await tick();
    await tick();
    assert.deepEqual(sent, ["n1=typed offline"]);
    assert.equal(queue.get("note", "n1"), null);
  });

  it("settings count: refused drafts are not «waiting to be sent»; another user's drafts are not counted", async () => {
    const { queue, state } = appHarness();
    state.refuse = saveFailed();
    assert.equal((await queue.submit("note", "b", { note: "refused" })).status, "rejected");
    assert.ok(queue.get("note", "b")?.refusal);
    state.refuse = null;
    state.online = false;
    assert.equal((await queue.submit("note", "c", { note: "offline" })).status, "queued");
    assert.deepEqual(summarizePendingWrites(queue.list(), "usr_ilya"), { waiting: 1, refused: 1 });
    assert.deepEqual(summarizePendingWrites(queue.list(), "usr_maria"), { waiting: 0, refused: 0 });
  });

  it("REFUSED by an awaited submit is kept too (the editor may go away); a rate limit remembers its wait", async () => {
    const { queue, state } = appHarness();
    state.refuse = rateLimited();
    const outcome = await queue.submit("note", "n1", { note: "too fast" });
    assert.equal(outcome.status, "rejected");
    const kept = queue.get("note", "n1");
    assert.ok(kept?.refusal);
    assert.ok(kept.refusal.retryAt !== null && kept.refusal.retryAt >= kept.refusal.at + 30_000);
    await queue.discard("note", "n1");
    assert.equal(queue.get("note", "n1"), null);
  });

  it("a refusal for a target that is gone drops the entry (nothing could ever show it)", async () => {
    const { queue, state } = appHarness();
    state.refuse = notFound();
    assert.equal((await queue.submit("note", "gone", { note: "x" })).status, "rejected");
    assert.equal(queue.get("note", "gone"), null);
  });

  it("session expired: the entry is held (flush stops), not dropped as refused", async () => {
    const { queue, state, sent, rejected, clock, tick } = appHarness();
    state.online = false;
    await queue.submit("note", "a", { note: "1" });
    await queue.submit("note", "b", { note: "2" });
    state.online = true;
    state.refuse = sessionExpired();
    assert.deepEqual(await queue.flush(), { sent: 0, rejected: 0, remaining: 2 });
    assert.equal(rejected.length, 0);
    assert.equal(queue.get("note", "a")?.refusal, undefined);
    await tick();
    // An awaited submit that meets the expiry is "queued", not "rejected".
    assert.equal((await queue.submit("note", "c", { note: "3" })).status, "queued");
    clock.pending.length = 0;

    // The provider holds the drafts for the expired user; the same user signs in again and they go out.
    state.userId = null;
    state.ownerId = "usr_ilya";
    state.refuse = null;
    assert.deepEqual(await queue.flush(), { sent: 0, rejected: 0, remaining: 3 });
    state.userId = "usr_ilya";
    state.ownerId = null;
    await queue.flush();
    assert.deepEqual(sent.sort(), ["a=1", "b=2", "c=3"]);
  });

  it("a draft flushed while the expired session is torn down belongs to that user, and only to them", async () => {
    const { queue, state, sent, stored } = appHarness();
    state.userId = null;
    state.ownerId = "usr_ilya";
    // The editor's flush as the tree unmounts after the forced sign-out.
    assert.equal((await queue.submit("note", "n1", { note: "typed at the 401" })).status, "queued");
    assert.equal(queue.get("note", "n1")?.userId, "usr_ilya");
    assert.equal((await stored()).length, 1, "kept on the device");
    assert.deepEqual(sent, []);

    // Another account signs in: never sent for them, and dropped from the device.
    state.ownerId = null;
    state.userId = "usr_maria";
    assert.deepEqual(await queue.flush(), { sent: 0, rejected: 0, remaining: 1 });
    await queue.dropOtherUsers("usr_maria");
    assert.equal(queue.get("note", "n1"), null);
    assert.deepEqual(await stored(), []);
    assert.deepEqual(sent, []);
  });

  it("the same user signing in again gets the held draft delivered", async () => {
    const { queue, state, sent } = appHarness();
    state.userId = null;
    state.ownerId = "usr_ilya";
    await queue.submit("note", "n1", { note: "held" });
    state.ownerId = null;
    state.userId = "usr_ilya";
    await queue.dropOtherUsers("usr_ilya");
    assert.equal(queue.get<{ note: string }>("note", "n1")?.payload.note, "held");
    await queue.flush();
    assert.deepEqual(sent, ["n1=held"]);
  });

  it("parses a stored refusal and drops a malformed one", () => {
    const good: PendingWrite = {
      kind: "k",
      id: "i",
      payload: 1,
      userId: "u",
      createdAt: 1,
      updatedAt: 2,
      attempts: 0,
      refusal: { code: "x", message: null, retryAt: null, at: 3 },
    };
    assert.deepEqual(parsePendingWrites(JSON.stringify([good, { ...good, id: "bad", refusal: { code: 1 } }])), [good]);
  });
});
