// The pending-writes queue after the review of the third round: a sign-in flush that joins a run ending on
// "hold", another account's drafts in a stored copy that is read late, drafts merged by a late read, and the
// queue's own knowledge of a request in flight (the note's «Сохраняем…»).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, isSessionExpired } from "@/api/errors";
import { isPendingWriteRetryable } from "@/services/query/pending-write-errors";
import { PENDING_WRITES_STORAGE_KEY, createPendingWritesQueue, parsePendingWrites, type PendingWrite } from "@/services/query/pending-writes";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle() {
  for (let i = 0; i < 8; i += 1) await tick();
}

function stored(id: string, note: string, userId: string): PendingWrite {
  return { kind: "note", id, payload: { note }, userId, createdAt: 1, updatedAt: 1, attempts: 1 };
}

function memoryStorage(initial: PendingWrite[] = [], failReads = 0) {
  const data = new Map<string, string>();
  if (initial.length > 0) data.set(PENDING_WRITES_STORAGE_KEY, JSON.stringify(initial));
  return {
    data,
    storage: {
      getItem: async (key: string) => {
        if (failReads > 0) {
          failReads -= 1;
          throw new Error("storage busy");
        }
        return data.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: async (key: string) => {
        data.delete(key);
      },
    },
  };
}

const expired = () => new ApiError({ code: "sessionExpired", status: 401, message: "expired" });

describe("pending writes: a sign-in flush joining a run that ends on «hold» (#206)", () => {
  it("is not lost: the run makes one more pass for the new session", async () => {
    const { storage } = memoryStorage();
    let user: string | null = "A";
    let held: string | null = null;
    let calls = 0;
    let rejectFirst: ((error: unknown) => void) | null = null;
    const timers: number[] = [];
    const queue = createPendingWritesQueue<object>({
      storage,
      getContext: () => ({}),
      getUserId: () => user,
      getOwnerId: () => held,
      isRetryable: isPendingWriteRetryable,
      isHeld: isSessionExpired,
      retryDelaysMs: [5000],
      timers: { set: (_callback, ms) => timers.push(ms), clear: () => undefined },
    });
    queue.register("note", async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
      return {};
    });
    // A draft waits (kept while the session had expired), then the flush sends it and the request hangs.
    user = null;
    held = "A";
    assert.equal((await queue.submit("note", "k1", { note: "x" })).status, "queued");
    user = "A";
    held = null;
    const first = queue.flush();
    await settle();
    assert.equal(queue.isSending("note", "k1"), true);
    // The session expires and the same user signs in again: the sign-in flush joins the running one.
    user = null;
    held = "A";
    user = "A";
    held = null;
    const joined = queue.flush();
    // The hung request (old session) answers 401.
    rejectFirst!(expired());
    await first;
    await joined;
    await settle();
    assert.equal(calls, 2);
    assert.equal(queue.get("note", "k1"), null);
    assert.equal(queue.isSending("note", "k1"), false);
  });

  it("still stops on «hold» when nobody has signed in since (a flush asked for while signed out)", async () => {
    const { storage } = memoryStorage([stored("k1", "x", "A")]);
    let user: string | null = "A";
    let calls = 0;
    let rejectFirst: ((error: unknown) => void) | null = null;
    const queue = createPendingWritesQueue<object>({
      storage,
      getContext: () => ({}),
      getUserId: () => user,
      getOwnerId: () => "A",
      isRetryable: isPendingWriteRetryable,
      isHeld: isSessionExpired,
    });
    queue.register("note", async () => {
      calls += 1;
      await new Promise((_resolve, reject) => {
        rejectFirst = reject;
      });
      return {};
    });
    const first = queue.flush();
    await settle();
    user = null; // expired, nobody signed in again
    const joined = queue.flush();
    rejectFirst!(expired());
    await first;
    await joined;
    await settle();
    assert.equal(calls, 1);
    assert.notEqual(queue.get("note", "k1"), null);
  });
});

describe("pending writes: another account's drafts in a stored copy read late (#230)", () => {
  it("are dropped when the read finally succeeds, and the stored copy loses them", async () => {
    const store = memoryStorage([stored("kA", "secret of A", "A")], 2);
    let user: string | null = null;
    const sent: string[] = [];
    const queue = createPendingWritesQueue<object>({
      storage: store.storage,
      getContext: () => ({}),
      getUserId: () => user,
      isRetryable: isPendingWriteRetryable,
    });
    queue.register<{ note: string }>("note", async (write) => {
      sent.push(`${write.userId}:${write.id}`);
      return {};
    });
    await queue.hydrate(); // read 1 fails
    user = "B";
    await queue.dropOtherUsers("B"); // read 2 fails
    assert.equal((await queue.submit("note", "kB", { note: "b" })).status, "sent");
    await settle();
    assert.equal(queue.get("note", "kA"), null);
    assert.deepEqual(sent, ["B:kB"]);
    assert.deepEqual(parsePendingWrites(store.data.get(PENDING_WRITES_STORAGE_KEY)), []);
  });

  it("keeps the drafts of the account that signed in", async () => {
    const store = memoryStorage([stored("kA", "draft of A", "A"), stored("kB", "draft of B", "B")], 2);
    let user: string | null = null;
    let online = false;
    const queue = createPendingWritesQueue<object>({
      storage: store.storage,
      getContext: () => ({}),
      getUserId: () => user,
      isRetryable: isPendingWriteRetryable,
      isOnline: () => online,
    });
    queue.register<{ note: string }>("note", async () => {
      if (!online) throw ApiError.network("offline");
      return {};
    });
    await queue.hydrate();
    user = "A";
    await queue.dropOtherUsers("A");
    await queue.hydrate(); // succeeds now
    assert.deepEqual(queue.list().map((write) => write.id), ["kA"]);
    await settle();
    assert.deepEqual(parsePendingWrites(store.data.get(PENDING_WRITES_STORAGE_KEY)).map((write) => write.id), ["kA"]);
  });

  it("drops everything stored when two different accounts signed in before the read succeeded", async () => {
    const store = memoryStorage([stored("kA", "draft of A", "A"), stored("kB", "draft of B", "B")], 3);
    let user: string | null = null;
    const queue = createPendingWritesQueue<object>({
      storage: store.storage,
      getContext: () => ({}),
      getUserId: () => user,
      isRetryable: isPendingWriteRetryable,
      isOnline: () => false,
    });
    queue.register("note", async () => ({}));
    await queue.hydrate();
    user = "B";
    await queue.dropOtherUsers("B");
    user = "A";
    await queue.dropOtherUsers("A");
    await queue.hydrate();
    assert.deepEqual(queue.list(), []);
  });
});

describe("pending writes: drafts merged by a late successful read (#230)", () => {
  it("are sent at once while signed in and online, not left for an outside event", async () => {
    const store = memoryStorage([stored("k1", "earlier draft", "A")], 2);
    let user: string | null = null;
    const sent: string[] = [];
    const queue = createPendingWritesQueue<object>({
      storage: store.storage,
      getContext: () => ({}),
      getUserId: () => user,
      isRetryable: isPendingWriteRetryable,
      retryDelaysMs: [5000],
      timers: { set: () => 1, clear: () => undefined },
    });
    queue.register<{ note: string }>("note", async (write) => {
      sent.push(`${write.id}=${write.payload.note}`);
      return {};
    });
    await queue.hydrate(); // cold start: read 1 fails
    user = "A";
    await queue.flush(); // the sign-in flush: read 2 fails, nothing to send
    assert.equal(sent.length, 0);
    // The student saves another note: the write of the stored copy reads it successfully and merges k1.
    assert.equal((await queue.submit("note", "k2", { note: "new" })).status, "sent");
    await settle();
    assert.ok(sent.includes("k1=earlier draft"), `sent: ${sent.join(", ")}`);
    assert.deepEqual(queue.list(), []);
  });

  it("waits for the reconnect while offline", async () => {
    const store = memoryStorage([stored("k1", "earlier draft", "A")], 1);
    const sent: string[] = [];
    const queue = createPendingWritesQueue<object>({
      storage: store.storage,
      getContext: () => ({}),
      getUserId: () => "A",
      isRetryable: isPendingWriteRetryable,
      isOnline: () => false,
    });
    queue.register<{ note: string }>("note", async (write) => {
      sent.push(write.id);
      throw ApiError.network("offline");
    });
    await queue.hydrate();
    await queue.hydrate();
    await settle();
    assert.deepEqual(sent, []);
    assert.equal(queue.list().length, 1);
  });
});

describe("pending writes: isSending (#207)", () => {
  it("is true exactly while a request for the entry is in flight, and its start and end notify", async () => {
    const { storage } = memoryStorage();
    let release: (() => void) | null = null;
    const queue = createPendingWritesQueue<object>({
      storage,
      getContext: () => ({}),
      getUserId: () => "A",
      isRetryable: isPendingWriteRetryable,
    });
    queue.register("note", async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {};
    });
    let notified = 0;
    queue.subscribe(() => {
      notified += 1;
    });
    const outcome = queue.submit("note", "k1", { note: "x" });
    await settle();
    assert.equal(queue.isSending("note", "k1"), true);
    assert.equal(queue.isSending("note", "k2"), false);
    const before = notified;
    release!();
    assert.equal((await outcome).status, "sent");
    await settle();
    assert.equal(queue.isSending("note", "k1"), false);
    assert.ok(notified > before);
  });

  it("is false for a waiting entry nobody is sending (an earlier one of the pass got no answer)", async () => {
    const { storage } = memoryStorage([
      { ...stored("k1", "older", "A"), updatedAt: 1, attempts: 0 },
      { ...stored("k2", "note", "A"), updatedAt: 2, attempts: 0 },
    ]);
    const queue = createPendingWritesQueue<object>({
      storage,
      getContext: () => ({}),
      getUserId: () => "A",
      isRetryable: isPendingWriteRetryable,
    });
    queue.register("note", async () => {
      throw ApiError.network("no answer");
    });
    await queue.flush();
    assert.equal(queue.get("note", "k2")?.attempts, 0);
    assert.equal(queue.isSending("note", "k2"), false);
  });
});
