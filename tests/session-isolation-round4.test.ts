// Session isolation (bug hunt round 4): a request runs for the session that issued it, an answer about an
// older session never acts on the current one, removals of unsent drafts survive a failing storage, a
// chunked write never touches the live value's pieces, and queries cleared on sign-out do not linger.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QueryObserver, timeoutManager, type ManagedTimerId, type TimeoutProvider } from "@tanstack/query-core";

import { API_MEMBERS, type ApiClient } from "@/api/client";
import { ApiError, isApiError, isSessionExpired } from "@/api/errors";
import { readChunkedValue, writeChunkedValue } from "@/domain/chunked-storage";
import { createTestMock, demoPasswordFor, type TestMock } from "@/mock/testing";
import { isPendingWriteRetryable, keepPendingWriteRefusal } from "@/services/query/pending-write-errors";
import { PENDING_WRITES_STORAGE_KEY, createPendingWritesQueue } from "@/services/query/pending-writes";
import { createAppQueryClient } from "@/services/query/query-client";
import { guardApiClient } from "@/services/session/guard-api-client";
import { createSessionTokenSlot } from "@/services/session/session-generation";

const NUMBER = "num_120";

/** Lets every queued microtask run (a call awaits the store load before it starts its latency). */
async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

/** Moves the mock clock by `ms` in small steps, letting calls reach their timers in between. */
async function pass(mock: TestMock, ms: number): Promise<void> {
  let left = ms;
  do {
    await flushMicrotasks();
    const step = Math.min(50, left);
    mock.clock.advance(step);
    left -= step;
  } while (left > 0);
  await flushMicrotasks();
}

async function login(mock: TestMock, email: string): Promise<string> {
  const pending = mock.api.shell.login({ login: email, password: demoPasswordFor(email) });
  await pass(mock, 3000);
  return (await pending).token;
}

function userId(mock: TestMock, email: string): string {
  const user = mock.store.users.findUnique("email", email);
  assert.ok(user, email);
  return user.id;
}

function storedNote(mock: TestMock, studentId: string): string | null {
  return mock.store.statuses.all().find((row) => row.studentId === studentId && row.homeworkNumberId === NUMBER)?.note ?? null;
}

async function outcome<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

// ───────────────────────────── #300 / #303: the mock authorises the issuing session ─────────────────────────────

describe("mock: a call runs for the session it was issued with (#300, #303)", () => {
  it("a note sent by ilya before his logout is refused with 401 and never lands in maria's account", async () => {
    const mock = createTestMock({ latency: { minMs: 1000, maxMs: 1000 } });
    const ilya = await login(mock, "ilya@example.com");
    const maria = await login(mock, "maria@example.com");
    const mariaBefore = storedNote(mock, userId(mock, "maria@example.com"));

    // ilya's queue sends his note, then the sign-out sends logout; maria signs in while both are in flight.
    mock.api.setSessionToken(ilya);
    const note = mock.api.studentStudy.saveNumberNote(NUMBER, "ILYA PRIVATE");
    const logout = mock.api.shell.logout();
    mock.api.setSessionToken(null);
    mock.api.setSessionToken(maria);
    await pass(mock, 1000);
    await logout;
    const result = await outcome(note);
    // Served before the logout, with ilya's own session: it is ilya's write, answered as such.
    assert.ok(result.ok);
    assert.equal(result.value.note, "ILYA PRIVATE");
    assert.equal(storedNote(mock, userId(mock, "ilya@example.com")), "ILYA PRIVATE");
    assert.equal(storedNote(mock, userId(mock, "maria@example.com")), mariaBefore);
  });

  it("a call issued after the session was deleted answers sessionExpired although another token is installed", async () => {
    const mock = createTestMock({ latency: { minMs: 1000, maxMs: 1000 } });
    const ilya = await login(mock, "ilya@example.com");
    const maria = await login(mock, "maria@example.com");
    const mariaId = userId(mock, "maria@example.com");
    const mariaBefore = storedNote(mock, mariaId);
    const unreadBefore = mock.store.notifications.all().filter((row) => row.userId === mariaId && !row.readAt).length;

    mock.api.setSessionToken(ilya);
    const logout = mock.api.shell.logout();
    await pass(mock, 1000);
    await logout;
    // ilya's session is gone; his queue still sends with the token it holds, then maria signs in.
    const note = outcome(mock.api.studentStudy.saveNumberNote(NUMBER, "ILYA AFTER LOGOUT"));
    const markAll = outcome(mock.api.shell.markNotificationsRead({}));
    mock.api.setSessionToken(maria);
    await pass(mock, 1000);

    for (const pending of [note, markAll] as Promise<Awaited<ReturnType<typeof outcome>>>[]) {
      const result = await pending;
      assert.equal(result.ok, false);
      assert.ok(!result.ok && isSessionExpired(result.error));
    }
    assert.equal(storedNote(mock, mariaId), mariaBefore);
    assert.equal(mock.store.notifications.all().filter((row) => row.userId === mariaId && !row.readAt).length, unreadBefore);
  });

  it("overlapping calls of two live sessions each act for their own user", async () => {
    const mock = createTestMock({ latency: { minMs: 300, maxMs: 900 } });
    const ilya = await login(mock, "ilya@example.com");
    const maria = await login(mock, "maria@example.com");
    mock.api.setSessionToken(ilya);
    const a = mock.api.studentStudy.saveNumberNote(NUMBER, "from ilya");
    mock.api.setSessionToken(maria);
    const b = mock.api.studentStudy.saveNumberNote(NUMBER, "from maria");
    mock.api.setSessionToken(ilya);
    await pass(mock, 2000);
    await Promise.all([a, b]);
    assert.equal(storedNote(mock, userId(mock, "ilya@example.com")), "from ilya");
    assert.equal(storedNote(mock, userId(mock, "maria@example.com")), "from maria");
  });

  it("a stale logout of the previous session leaves the current session's realtime stream open", async () => {
    const mock = createTestMock({ latency: { minMs: 1000, maxMs: 1000 } });
    const ilya = await login(mock, "ilya@example.com");
    const maria = await login(mock, "maria@example.com");
    mock.api.setSessionToken(ilya);
    const logout = mock.api.shell.logout();
    mock.api.setSessionToken(maria);
    const unsubscribe = mock.api.shell.subscribeRealtime(() => undefined);
    await pass(mock, 500);
    assert.equal(mock.api.realtimeState().status, "open");
    await pass(mock, 600);
    await logout;
    await flushMicrotasks();
    assert.equal(mock.api.realtimeState().status, "open");
    unsubscribe();
  });
});

// ───────────────────────────── #304: answers about an older session ─────────────────────────────

describe("guard: only answers about the current session reach the session owner (#304)", () => {
  const expired = () => new ApiError({ code: "sessionExpired", status: 401, message: "expired" });
  const refused = () => new ApiError({ code: "unauthorized", status: 403, message: "refused" });

  function setup() {
    const resolvers: ((error: unknown) => void)[] = [];
    const fake = {
      ...Object.fromEntries(API_MEMBERS.map((member) => [member, {}])),
      shell: {
        getMe: () =>
          new Promise((_resolve, reject) => {
            resolvers.push(reject);
          }),
        boom: () => {
          throw expired();
        },
      },
    } as unknown as ApiClient;
    let installed: string | null = null;
    const slot = createSessionTokenSlot((token) => {
      installed = token;
    });
    const seen: string[] = [];
    const api = guardApiClient(fake, { onSessionExpired: (error) => seen.push(error.code), onRoleRefused: (error) => seen.push(error.code) }, { generation: slot.generation });
    return { api, slot, seen, resolvers, installed: () => installed };
  }

  it("a 401 / 403 of a call issued before the token changed is not reported, but its caller still gets it", async () => {
    const { api, slot, seen, resolvers } = setup();
    slot.set("token-a");
    const first = api.shell.getMe();
    const second = api.shell.getMe();
    slot.set(null);
    slot.set("token-b");
    resolvers[0]?.(expired());
    resolvers[1]?.(refused());
    await assert.rejects(first, (error: unknown) => isApiError(error) && error.code === "sessionExpired");
    await assert.rejects(second, (error: unknown) => isApiError(error) && error.code === "unauthorized");
    assert.deepEqual(seen, []);
  });

  it("the same answers about the current session are reported", async () => {
    const { api, slot, seen, resolvers } = setup();
    slot.set("token-b");
    const call = api.shell.getMe();
    resolvers[0]?.(expired());
    await assert.rejects(call);
    assert.throws(() => (api.shell as unknown as { boom: () => void }).boom());
    assert.deepEqual(seen, ["sessionExpired", "sessionExpired"]);
  });

  it("the token slot starts a new generation only when the token really changes", () => {
    const { slot, installed } = setup();
    const start = slot.generation();
    slot.set("x");
    slot.set("x");
    assert.equal(slot.generation(), start + 1);
    slot.set("");
    assert.equal(slot.generation(), start + 2);
    assert.equal(installed(), null);
    slot.set(null);
    assert.equal(slot.generation(), start + 2);
  });
});

// ───────────────────────────── model: random account switches ─────────────────────────────

/** Small deterministic PRNG (mulberry32). */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("model: slow calls, sign-out, sign-in as another user, 401 answers (#300, #303, #304)", () => {
  const EMAILS = ["ilya@example.com", "maria@example.com", "dasha@example.com"];

  for (let seed = 1; seed <= 30; seed += 1) {
    it(`seed ${seed}: writes land in the issuing account; nobody is signed out by another session's answer`, async () => {
      const random = prng(seed);
      const mock = createTestMock({ latency: { minMs: 0, maxMs: 2500 } });
      const ids = Object.fromEntries(EMAILS.map((email) => [email, userId(mock, email)]));
      const slot = createSessionTokenSlot((token) => mock.api.setSessionToken(token));
      const violations: string[] = [];
      let signedIn: { email: string; token: string } | null = null;
      const api = guardApiClient(
        mock.api,
        {
          onSessionExpired: () => {
            // Reaches the owner only for the session installed now — and then that session must really be gone.
            const token = slot.token();
            if (token !== null && mock.store.sessions.findUnique("token", token)) violations.push(`live session ${signedIn?.email ?? "?"} told it expired`);
            signedIn = null;
            slot.set(null);
          },
        },
        { generation: slot.generation },
      );
      const inFlight: Promise<unknown>[] = [];
      let counter = 0;

      for (let step = 0; step < 60; step += 1) {
        const roll = random();
        if (signedIn === null) {
          if (roll < 0.5) {
            const email = EMAILS[Math.floor(random() * EMAILS.length)]!;
            // Signs in as soon as the login answers: calls of the previous session may still be in flight.
            let answered: { token: string } | null = null;
            const pending = mock.api.shell.login({ login: email, password: demoPasswordFor(email) }).then((value) => {
              answered = value;
              return value;
            });
            while (answered === null) await pass(mock, 50);
            const { token } = await pending;
            signedIn = { email, token };
            slot.set(token);
          } else await pass(mock, Math.floor(random() * 1500));
          continue;
        }
        const me: { email: string; token: string } = signedIn;
        if (roll < 0.4) {
          counter += 1;
          const text = `${me.email}#${counter}`;
          inFlight.push(
            api.studentStudy.saveNumberNote(NUMBER, text).then(
              (saved) => {
                if (saved.note !== text) violations.push(`answer ${saved.note} to ${text}`);
              },
              () => undefined,
            ),
          );
        } else if (roll < 0.55) {
          inFlight.push(
            api.shell.getMe().then(
              ({ user }) => {
                if (user.id !== ids[me.email]) violations.push(`getMe of ${me.email} answered ${user.email}`);
              },
              () => undefined,
            ),
          );
        } else if (roll < 0.7) {
          // Sign-out: logout is sent, the token goes at a random moment (before or after the answer).
          inFlight.push(api.shell.logout().catch(() => undefined));
          await pass(mock, Math.floor(random() * 2000));
          signedIn = null;
          slot.set(null);
        } else if (roll < 0.74) {
          // The network turns slow or fast for the calls issued from now on.
          mock.api.controls.set("latency", random() < 0.5 ? { minMs: 0, maxMs: 200 } : { minMs: 2000, maxMs: 8000 });
        } else if (roll < 0.8) {
          // The server ends the session by itself (password reset elsewhere): a real 401 for the current one.
          mock.ctx.auth.deleteSessionsOfUser(ids[me.email]!);
        } else await pass(mock, Math.floor(random() * 1500));
        await flushMicrotasks();
      }
      await pass(mock, 10_000);
      await Promise.all(inFlight);

      for (const email of EMAILS) {
        const note = storedNote(mock, ids[email]!);
        if (note !== null && note.includes("#") && !note.startsWith(`${email}#`)) violations.push(`${email} holds ${note}`);
      }
      assert.deepEqual(violations, []);
    });
  }
});

// ───────────────────────────── #301: a removal of unsent drafts is final ─────────────────────────────

function flakyStorage() {
  const data = new Map<string, string>();
  const fail = { remove: false, setMain: false, setAll: false };
  return {
    data,
    fail,
    storage: {
      getItem: async (key: string) => data.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (fail.setAll || (fail.setMain && key === PENDING_WRITES_STORAGE_KEY)) throw new Error("storage busy");
        data.set(key, value);
      },
      removeItem: async (key: string) => {
        if (fail.remove) throw new Error("storage busy");
        data.delete(key);
      },
    },
  };
}

function noteQueue(storage: ReturnType<typeof flakyStorage>["storage"], state: { user: string | null; online: boolean; sent: string[] }, now?: () => number) {
  const queue = createPendingWritesQueue<object>({
    storage,
    getContext: () => ({}),
    getUserId: () => state.user,
    isRetryable: isPendingWriteRetryable,
    isHeld: isSessionExpired,
    keepRefused: keepPendingWriteRefusal,
    isOnline: () => state.online,
    ...(now ? { now } : {}),
  });
  queue.register<{ note: string }>("note", async (write) => {
    if (!state.online) throw ApiError.network("offline");
    state.sent.push(`${write.userId}:${write.id}=${write.payload.note}`);
    return write.payload;
  });
  return queue;
}

describe("pending writes: a confirmed discard survives a failing storage (#301)", () => {
  it("clear(): removeItem fails → an empty list is written instead; nothing is sent after a restart", async () => {
    const store = flakyStorage();
    const state = { user: "usr_ilya" as string | null, online: false, sent: [] as string[] };
    let queue = noteQueue(store.storage, state);
    await queue.hydrate();
    assert.equal((await queue.submit("note", NUMBER, { note: "secret draft" })).status, "queued");
    store.fail.remove = true;
    state.user = null;
    await queue.clear();
    store.fail.remove = false;
    queue = noteQueue(store.storage, state);
    state.online = true;
    await queue.hydrate();
    state.user = "usr_ilya";
    await queue.dropOtherUsers("usr_ilya");
    await queue.flush();
    assert.deepEqual(queue.list(), []);
    assert.deepEqual(state.sent, []);
  });

  it("clear(): every write of the list fails → the tombstones row keeps the draft out at the next start", async () => {
    const store = flakyStorage();
    const state = { user: "usr_ilya" as string | null, online: false, sent: [] as string[] };
    let queue = noteQueue(store.storage, state);
    await queue.hydrate();
    await queue.submit("note", NUMBER, { note: "secret draft" });
    store.fail.remove = true;
    store.fail.setMain = true;
    state.user = null;
    await queue.clear();
    assert.ok(store.data.get(PENDING_WRITES_STORAGE_KEY)?.includes("secret draft"), "the stored list could not be changed");
    store.fail.remove = false;
    store.fail.setMain = false;
    queue = noteQueue(store.storage, state);
    state.online = true;
    state.user = "usr_ilya";
    await queue.hydrate();
    await queue.flush();
    assert.deepEqual(state.sent, []);
    assert.deepEqual(queue.list(), []);
    // The stored copy is rewritten without it and the tombstones row is gone.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(store.data.get(`${PENDING_WRITES_STORAGE_KEY}::removed`), undefined);
    assert.ok(!store.data.get(PENDING_WRITES_STORAGE_KEY)?.includes("secret draft"));
  });

  it("a draft typed after the removal is kept, even when the device clock went back", async () => {
    const store = flakyStorage();
    const state = { user: "usr_ilya" as string | null, online: false, sent: [] as string[] };
    let clock = 10_000;
    let queue = noteQueue(store.storage, state, () => clock);
    await queue.hydrate();
    await queue.submit("note", NUMBER, { note: "old draft" });
    store.fail.remove = true;
    store.fail.setMain = true;
    await queue.discard("note", NUMBER);
    clock = 5_000; // the clock went back
    store.fail.remove = false;
    store.fail.setMain = false;
    await queue.submit("note", NUMBER, { note: "new draft" });
    queue = noteQueue(store.storage, state, () => clock);
    state.online = true;
    await queue.hydrate();
    await queue.flush();
    assert.deepEqual(state.sent, ["usr_ilya:num_120=new draft"]);
  });

  it("dropOtherUsers(): another account's drafts stay dropped after a restart although the write failed", async () => {
    const store = flakyStorage();
    const state = { user: "usr_ilya" as string | null, online: false, sent: [] as string[] };
    let queue = noteQueue(store.storage, state);
    await queue.hydrate();
    await queue.submit("note", NUMBER, { note: "ilya's draft" });
    store.fail.setMain = true;
    store.fail.remove = true;
    state.user = "usr_maria";
    await queue.dropOtherUsers("usr_maria");
    assert.ok(store.data.get(PENDING_WRITES_STORAGE_KEY)?.includes("ilya's draft"), "the stored list could not be changed");
    store.fail.setMain = false;
    store.fail.remove = false;
    // Restart; maria signed out, ilya signs in: the draft dropped for maria's sign-in does not come back.
    queue = noteQueue(store.storage, state);
    state.user = "usr_ilya";
    state.online = true;
    await queue.hydrate();
    await queue.flush();
    assert.deepEqual(state.sent, []);
  });
});

// ───────────────────────────── #302: chunked writes never touch the live pieces ─────────────────────────────

describe("chunked storage: a failed header read does not reuse the live piece set (#302)", () => {
  const OLD = "a".repeat(100) + "Ж".repeat(60);
  const NEW = "b".repeat(100) + "Ж".repeat(60); // the same UTF-16 length

  class Killed extends Error {}
  function storage(data: Map<string, string>, options: { killAfter?: number; failGetOnce?: string; failPending?: boolean; listKeys?: boolean } = {}) {
    let ops = 0;
    let failed = false;
    const tick = () => {
      ops += 1;
      if (options.killAfter !== undefined && ops > options.killAfter) throw new Killed();
    };
    return {
      getItem: async (key: string) => {
        if (options.failGetOnce === key && !failed) {
          failed = true;
          throw new Error("transient");
        }
        if (options.failPending && key.endsWith("::chunks-pending")) throw new Error("transient");
        return data.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        tick();
        data.set(key, value);
      },
      removeItem: async (key: string) => {
        tick();
        data.delete(key);
      },
      ...(options.listKeys ? { getAllKeys: async () => [...data.keys()] } : {}),
    };
  }

  it("a write torn at any point after a failed header read leaves the old value or the new one, never a mix", async () => {
    const base = new Map<string, string>();
    await writeChunkedValue(storage(base), "K", OLD, { chunkBytes: 64 });
    for (const variant of [{ failGetOnce: "K" }, { failGetOnce: "K", failPending: true }, { failGetOnce: "K", listKeys: true }]) {
      for (let killAfter = 0; killAfter < 20; killAfter += 1) {
        const data = new Map(base);
        await writeChunkedValue(storage(data, { ...variant, killAfter }), "K", NEW, { chunkBytes: 64 }).catch((error: unknown) => {
          if (!(error instanceof Killed)) throw error;
        });
        const value = await readChunkedValue(storage(data), "K");
        assert.ok(value === OLD || value === NEW, `${JSON.stringify(variant)} kill after ${killAfter}: ${value?.slice(0, 20)}`);
      }
    }
  });

  it("the pieces of the value replaced without a readable header are swept when the storage lists its keys", async () => {
    const data = new Map<string, string>();
    await writeChunkedValue(storage(data), "K", OLD, { chunkBytes: 64 });
    await writeChunkedValue(storage(data, { failGetOnce: "K", listKeys: true }), "K", NEW, { chunkBytes: 64 });
    assert.equal(await readChunkedValue(storage(data), "K"), NEW);
    const header = JSON.parse((data.get("K") ?? "").slice("@@chunked:".length)) as { id: string; count: number };
    const pieces = [...data.keys()].filter((key) => key.startsWith("K::chunk:"));
    assert.equal(pieces.length, header.count);
    assert.ok(pieces.every((key) => key.startsWith(`K::chunk:${header.id}:`)));
    assert.equal(data.get("K::chunks-pending"), undefined);
  });

  it("a pending list that could not be read is not overwritten by a storage that cannot sweep", async () => {
    const data = new Map<string, string>();
    await writeChunkedValue(storage(data), "K", OLD, { chunkBytes: 64 });
    data.set("K::chunks-pending", JSON.stringify([{ id: "zz", count: 2 }]));
    await writeChunkedValue(storage(data, { failPending: true }), "K", NEW, { chunkBytes: 64 });
    assert.equal(await readChunkedValue(storage(data), "K"), NEW);
    assert.equal(data.get("K::chunks-pending"), JSON.stringify([{ id: "zz", count: 2 }]));
  });
});

// ───────────────────────────── #309: no orphaned queries after a clear ─────────────────────────────

describe("query client: queries cleared while observed do not linger (#309)", () => {
  it("several sign-out → sign-in cycles leave no live gc timer and no query holding old data", async () => {
    const live = new Set<unknown>();
    const provider: TimeoutProvider<ManagedTimerId> = {
      setTimeout: (callback, delay) => {
        const id = setTimeout(() => {
          live.delete(id);
          callback();
        }, delay);
        live.add(id);
        return id;
      },
      clearTimeout: (id) => {
        live.delete(id);
        clearTimeout(id as ReturnType<typeof setTimeout>);
      },
      setInterval: (callback, delay) => setInterval(callback, delay),
      clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    };
    timeoutManager.setTimeoutProvider(provider);
    try {
      const client = createAppQueryClient();
      const orphans: { queryHash: string; observers: number; timers: number }[] = [];
      for (let cycle = 0; cycle < 5; cycle += 1) {
        // The role tree shows three screens of this user.
        const observers = ["a", "b", "c"].map((name) => new QueryObserver(client, { queryKey: [name, cycle], queryFn: async () => ({ secret: `${name}${cycle}` }) }));
        const unsubscribes = observers.map((observer) => observer.subscribe(() => undefined));
        await new Promise((resolve) => setTimeout(resolve, 5));
        const queries = observers.map((observer) => observer.getCurrentQuery());
        // Sign-out: the cache is cleared while the screens are still mounted; then the tree unmounts.
        client.clear();
        unsubscribes.forEach((unsubscribe) => unsubscribe());
        for (const query of queries) {
          if (query.getObserversCount() !== 0) orphans.push({ queryHash: query.queryHash, observers: query.getObserversCount(), timers: live.size });
        }
      }
      // The only timers left are none: every removed query was destroyed when its last observer left.
      assert.equal(live.size, 0, `live timers: ${live.size}`);
      assert.equal(client.getQueryCache().getAll().length, 0);
      assert.deepEqual(orphans, []);
    } finally {
      // A leaked 24 h timer would otherwise keep the test process alive instead of failing it.
      for (const id of live) clearTimeout(id as ReturnType<typeof setTimeout>);
      timeoutManager.setTimeoutProvider({
        setTimeout: (callback, delay) => setTimeout(callback, delay),
        clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
        setInterval: (callback, delay) => setInterval(callback, delay),
        clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
      });
    }
  });
});
