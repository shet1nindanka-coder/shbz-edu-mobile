// The notes pipeline after the third bug hunt: the pending-writes queue's stored copy (a failed read is not an
// empty queue; a payload of the wrong shape is dropped), a flush asked for during a run, the editor status of
// an entry the other editor is sending, and the token storage's sign-out fallbacks.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/api/errors";
import { noteStatus } from "@/screens/student/study/note-model";
import { isPendingWriteRetryable, keepPendingWriteRefusal } from "@/services/query/pending-write-errors";
import { PENDING_WRITES_STORAGE_KEY, createPendingWritesQueue, parsePendingWrites, type PendingWrite } from "@/services/query/pending-writes";
import { createTokenStorage, tokenFingerprint, type StoredValue } from "@/services/session/token-storage.shared";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function draft(id: string, note: unknown, userId = "usr_ilya"): PendingWrite {
  return { kind: "note", id, payload: { note }, userId, createdAt: 1, updatedAt: 1, attempts: 1 };
}

function storageWith(initial: PendingWrite[] | string | null, failReads = 0) {
  const data = new Map<string, string>();
  if (initial !== null) data.set(PENDING_WRITES_STORAGE_KEY, typeof initial === "string" ? initial : JSON.stringify(initial));
  let reads = 0;
  return {
    data,
    reads: () => reads,
    failNext(count: number) {
      failReads = count;
    },
    storage: {
      getItem: async (key: string) => {
        reads += 1;
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

const isNotePayload = (payload: unknown): payload is { note: string } => typeof (payload as { note?: unknown } | null)?.note === "string";

function queueOn(store: ReturnType<typeof storageWith>, options: { online?: () => boolean; guard?: boolean } = {}) {
  const sent: string[] = [];
  const state = { reachable: true, userId: "usr_ilya" as string | null };
  const queue = createPendingWritesQueue<object>({
    storage: store.storage,
    getContext: () => ({}),
    getUserId: () => state.userId,
    isRetryable: isPendingWriteRetryable,
    keepRefused: keepPendingWriteRefusal,
  });
  queue.register<{ note: string }, { note: string }>(
    "note",
    async (write) => {
      if (!state.reachable) throw ApiError.network("no answer");
      sent.push(`${write.id}=${write.payload.note}`);
      return { note: write.payload.note };
    },
    options.guard === false ? undefined : isNotePayload,
  );
  return { queue, sent, state };
}

describe("pending writes: a failed read of the stored queue (#230)", () => {
  it("is not memoised as «nothing stored», and the next change never overwrites the stored drafts", async () => {
    const store = storageWith([draft("num_301", "draft A"), draft("num_302", "draft B")], 1);
    const { queue, state } = queueOn(store);
    state.reachable = false; // the drafts stay waiting, so what is stored can be inspected
    await queue.hydrate();
    assert.equal(queue.list().length, 0, "the first read failed");

    await queue.submit("note", "num_303", { note: "draft C" });
    await tick();
    await tick();
    const stored = parsePendingWrites(store.data.get(PENDING_WRITES_STORAGE_KEY));
    assert.deepEqual(stored.map((write) => (write.payload as { note: string }).note).sort(), ["draft A", "draft B", "draft C"]);
    // The memory has caught up with the stored copy (shown and sent like any other draft).
    assert.deepEqual(queue.list().map((write) => write.id).sort(), ["num_301", "num_302", "num_303"]);
  });

  it("while the store stays unreadable nothing is written over it; the next hydrate reads it again", async () => {
    const store = storageWith([draft("num_301", "draft A")], 100);
    const { queue, state } = queueOn(store);
    state.reachable = false;
    await queue.hydrate();
    await queue.submit("note", "num_303", { note: "draft C" });
    await tick();
    await tick();
    // Every read failed: the stored copy is left as it was.
    assert.deepEqual(parsePendingWrites(store.data.get(PENDING_WRITES_STORAGE_KEY)).map((write) => write.id), ["num_301"]);
    store.failNext(0);
    await queue.hydrate();
    assert.deepEqual(queue.list().map((write) => write.id).sort(), ["num_301", "num_303"]);
    // The draft made while the store was unreadable is written as soon as the read succeeds.
    await tick();
    await tick();
    assert.deepEqual(parsePendingWrites(store.data.get(PENDING_WRITES_STORAGE_KEY)).map((write) => write.id).sort(), ["num_301", "num_303"]);
    // The next change writes all of them.
    await queue.submit("note", "num_304", { note: "draft D" });
    await tick();
    await tick();
    assert.deepEqual(parsePendingWrites(store.data.get(PENDING_WRITES_STORAGE_KEY)).map((write) => write.id).sort(), ["num_301", "num_303", "num_304"]);
  });

  it("a key changed in memory before the late read wins over its stored (older) draft", async () => {
    const store = storageWith([draft("num_301", "старый черновик")], 1);
    const { queue, sent } = queueOn(store);
    await queue.hydrate();
    await queue.submit("note", "num_301", { note: "новый текст" }); // delivered at once
    await queue.flush();
    await tick();
    assert.deepEqual(sent, ["num_301=новый текст"]);
    assert.equal(queue.list().length, 0);
    assert.equal(store.data.get(PENDING_WRITES_STORAGE_KEY), undefined);
  });

  it("an explicit clear removes a stored copy that could not be read", async () => {
    const store = storageWith([draft("num_301", "draft A")], 2);
    const { queue } = queueOn(store);
    await queue.hydrate();
    await queue.clear();
    assert.equal(store.data.get(PENDING_WRITES_STORAGE_KEY), undefined);
  });
});

describe("pending writes: a stored payload of the wrong shape (#229)", () => {
  for (const [label, payload] of [
    ["null", null],
    ["a number note", { note: 5 }],
    ["an object note", { note: {} }],
    ["a string", "x"],
  ] as const) {
    it(`drops an entry whose payload is ${label}, and removes it from storage`, async () => {
      const bad = { ...draft("num_301", ""), payload };
      const store = storageWith(JSON.stringify([bad, draft("num_302", "хороший")]));
      const { queue, state } = queueOn(store);
      state.reachable = false;
      await queue.hydrate();
      assert.deepEqual(queue.list().map((write) => write.id), ["num_302"]);
      await tick();
      await tick();
      assert.deepEqual(parsePendingWrites(store.data.get(PENDING_WRITES_STORAGE_KEY)).map((write) => write.id), ["num_302"]);
    });
  }

  it("a guard registered after the entries were loaded drops the bad ones then", async () => {
    const store = storageWith(JSON.stringify([{ ...draft("num_301", ""), payload: null }]));
    const queue = createPendingWritesQueue<object>({
      storage: store.storage,
      getContext: () => ({}),
      getUserId: () => "usr_ilya",
      isRetryable: isPendingWriteRetryable,
    });
    await queue.hydrate();
    assert.equal(queue.list().length, 1);
    queue.register("note", async () => ({}), isNotePayload);
    assert.equal(queue.list().length, 0);
  });
});

describe("pending writes: a flush asked for during a run (#206)", () => {
  it("makes the run do one more pass, so a write that became sendable meanwhile is sent", async () => {
    const store = storageWith(null);
    let releaseFirst: (() => void) | null = null;
    const sent: string[] = [];
    let failK1 = true;
    const queue = createPendingWritesQueue<object>({
      storage: store.storage,
      getContext: () => ({}),
      getUserId: () => "usr_ilya",
      isRetryable: isPendingWriteRetryable,
    });
    queue.register<{ note: string }>("note", async (write) => {
      if (write.id === "k2" && releaseFirst === null) {
        // The first request of k2 is slow.
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      if (write.id === "k1" && failK1) {
        failK1 = false;
        throw ApiError.network("no answer");
      }
      sent.push(`${write.id}=${write.payload.note}`);
      return {};
    });
    // k2 waits (offline earlier); the reconnect flush starts and k2 is in flight.
    await queue.hydrate();
    const first = queue.flush();
    const k2 = queue.submit("note", "k2", { note: "two" });
    await tick();
    // k1 fails without an answer while that flush runs.
    assert.equal((await queue.submit("note", "k1", { note: "one" })).status, "queued");
    // Its backoff timer fires and asks for a flush: it joins the running one…
    const joined = queue.flush();
    releaseFirst!();
    await k2;
    await first;
    await joined;
    // …which made another pass and sent k1.
    assert.ok(sent.includes("k1=one"), `sent: ${sent.join(", ")}`);
    assert.equal(queue.list().length, 0);
  });
});

describe("note status of an entry the other editor is sending (#207)", () => {
  it("reads «saving» only while a request is in flight, «retrying» for any other waiting entry, «queued» offline", () => {
    assert.equal(noteStatus({ saving: false, queued: true, savedFlash: false, online: true, sending: true }), "saving");
    assert.equal(noteStatus({ saving: false, queued: true, savedFlash: false, online: true, sending: false }), "retrying");
    assert.equal(noteStatus({ saving: false, queued: true, savedFlash: false, online: false, sending: false }), "queued");
    assert.equal(noteStatus({ saving: false, queued: true, savedFlash: false, online: false, sending: true }), "queued");
  });
});

describe("token storage: a sign-out never leaves a token that restores the session (#228)", () => {
  function slot(initial: string | null = null) {
    const state = { value: initial, failGet: false, failSet: false, failRemove: false };
    const value: StoredValue = {
      get: async () => {
        if (state.failGet) throw new Error("get");
        return state.value;
      },
      set: async (next) => {
        if (state.failSet) throw new Error("set");
        state.value = next;
      },
      remove: async () => {
        if (state.failRemove) throw new Error("remove");
        state.value = null;
      },
    };
    return { state, value };
  }

  it("clear removes the token; a plain read and write work as before", async () => {
    const secret = slot("tok_1");
    const marker = slot();
    const storage = createTokenStorage(secret.value, marker.value);
    assert.equal(await storage.read(), "tok_1");
    assert.equal(await storage.clear(), true);
    assert.equal(await storage.read(), null);
    assert.equal(await storage.write("tok_2"), true);
    assert.equal(await storage.read(), "tok_2");
  });

  it("a failed removal falls back to overwriting the token with an empty value (read as none)", async () => {
    const secret = slot("tok_1");
    secret.state.failRemove = true;
    const storage = createTokenStorage(secret.value, slot().value);
    assert.equal(await storage.clear(), true);
    assert.equal(secret.state.value, "");
    assert.equal(await storage.read(), null);
  });

  it("when the secure store refuses every change, start-up refuses exactly the signed-out token", async () => {
    const secret = slot("tok_1");
    const marker = slot();
    secret.state.failRemove = true;
    secret.state.failSet = true;
    const storage = createTokenStorage(secret.value, marker.value);
    assert.equal(await storage.clear(), true);
    assert.equal(marker.state.value, tokenFingerprint("tok_1"));
    assert.ok(!marker.state.value?.includes("tok_1"), "the marker never holds the token");
    assert.equal(await storage.read(), null, "the next start does not restore it");
    // The store works again: the removal is retried at that start and the marker goes.
    secret.state.failRemove = false;
    assert.equal(await storage.read(), null);
    assert.equal(secret.state.value, null);
    assert.equal(marker.state.value, null);
  });

  it("the marker never locks out a later sign-in (another token)", async () => {
    const secret = slot("tok_new");
    const marker = slot(tokenFingerprint("tok_old"));
    const storage = createTokenStorage(secret.value, marker.value);
    assert.equal(await storage.read(), "tok_new");
    assert.equal(marker.state.value, null);
  });

  it("reports failure only when a token may still be restored", async () => {
    const secret = slot("tok_1");
    const marker = slot();
    secret.state.failRemove = true;
    secret.state.failSet = true;
    marker.state.failSet = true;
    assert.equal(await createTokenStorage(secret.value, marker.value).clear(), false);
  });

  it("fingerprints differ for different tokens and are stable", () => {
    assert.equal(tokenFingerprint("abc"), tokenFingerprint("abc"));
    assert.notEqual(tokenFingerprint("abc"), tokenFingerprint("abd"));
    assert.match(tokenFingerprint("x"), /^[0-9a-f]{16}$/);
  });
});
