// Model-based random histories of the pending-writes queue (src/services/query/pending-writes.ts) with the
// app's real classification options (src/providers/pending-writes.ts): editors submit every draft as soon as
// it is due, the server answers in any order the queue allows, the network comes and goes, the app restarts
// (sometimes with a failed first read of the stored queue), sessions expire, users sign out and in.
//
// After every step the invariants of the notes pipeline are checked:
// - the newest text of a user is never lost silently (on the server, in the queue, or in a request in flight;
//   a refusal the user was told about, a discard, a confirmed sign-out or another account are the exits);
// - an older text never lands on the server after a newer one;
// - nothing is sent as another user, nor while signed out;
// - no two requests of one entry overlap;
// - no spinning (a timer step sends at most once per entry), at most one backoff timer;
// - while signed in and online, a waiting write has a request in flight or a timer armed (never stuck);
// - the stored copy equals the memory once a read of it has succeeded.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
/// <reference path="../node_modules/@types/node/timers.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, isSessionExpired } from "@/api/errors";
import { isPendingWriteRetryable, keepPendingWriteRefusal } from "@/services/query/pending-write-errors";
import { PENDING_WRITES_STORAGE_KEY, createPendingWritesQueue, parsePendingWrites, type PendingWritesQueue } from "@/services/query/pending-writes";

const RETRY = [5000, 15000, 30000, 60000];
const KIND = "note";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const drain = () => new Promise<void>((resolve) => setImmediate(resolve));
async function settle() {
  for (let i = 0; i < 6; i += 1) await drain();
}

/** "401old": the 401 of a request sent by a session that has since been replaced (the current one is fine). */
type Answer = "ok" | "okLostAnswer" | "network" | "503" | "429" | "400" | "404" | "401" | "401old";
type Action =
  | { t: "submit"; key: string }
  | { t: "answer"; idx: number; kind: Answer }
  | { t: "offline" }
  | { t: "online" }
  | { t: "timer" }
  | { t: "restart"; applyInflight: boolean; readFails: boolean; readFailsTwice?: boolean }
  | { t: "signOut" }
  | { t: "expire" }
  | { t: "signIn"; user: string }
  | { t: "discard"; key: string }
  | { t: "flush"; n: number };

type Call = { user: string; session: number; key: string; text: string; seq: number; resolve: (value: unknown) => void; reject: (error: unknown) => void };
type Fate = "pending" | "told" | "discarded" | "cleared" | "dropped" | "notfound";

async function run(actions: Action[]): Promise<string | null> {
  const data = new Map<string, string>();
  let failNextReads = 0;
  const storage = {
    getItem: async (key: string) => {
      if (failNextReads > 0) {
        failNextReads -= 1;
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
  };
  let now = 1_000_000;
  let online = true;
  let currentUser: string | null = "A";
  let heldUser: string | null = null;
  let sessionUser: string | null = "A";
  let sessionExpired = false;
  /** Bumped by every sign-in: a request remembers the session that sent it. */
  let sessionId = 0;
  type Timer = { at: number; callback: () => void; generation: number; id: number };
  let timers: Timer[] = [];
  let timerId = 0;
  let generation = 0;
  let calls: Call[] = [];
  const inflight = new Map<string, number>();
  const server = new Map<string, { text: string; seq: number }>();
  let seqCounter = 0;
  const latest = new Map<string, { seq: number; text: string; fate: Fate }>();
  let sendsThisStep = 0;
  let violation: string | null = null;
  const fail = (message: string) => {
    violation ??= message;
  };

  const makeQueue = (): PendingWritesQueue<object> => {
    const mine = generation;
    const queue = createPendingWritesQueue<object>({
      storage,
      getContext: () => ({}),
      getUserId: () => currentUser,
      getOwnerId: () => heldUser,
      isRetryable: isPendingWriteRetryable,
      isHeld: isSessionExpired,
      keepRefused: keepPendingWriteRefusal,
      retryDelaysMs: RETRY,
      isOnline: () => online,
      timers: {
        set: (callback, ms) => {
          const timer = { at: now + ms, callback, generation: mine, id: ++timerId };
          timers.push(timer);
          return timer.id;
        },
        clear: (handle) => {
          timers = timers.filter((timer) => timer.id !== handle);
        },
      },
      now: () => now,
    });
    queue.register<{ note: string }, { note: string }>(
      KIND,
      (write) => {
        sendsThisStep += 1;
        if (mine !== generation) fail("sent from a dead queue instance");
        if (currentUser === null) fail(`sent while signed out: ${write.id}=${write.payload.note}`);
        else if (write.userId !== currentUser) fail(`sent ${write.userId}'s write as ${currentUser}`);
        if (!online) return Promise.reject(ApiError.network("offline"));
        const lane = `${currentUser}|${write.id}`;
        if ((inflight.get(lane) ?? 0) > 0) fail(`overlapping sends of ${write.id}`);
        inflight.set(lane, (inflight.get(lane) ?? 0) + 1);
        const seq = Number(write.payload.note.split("#")[1]);
        return new Promise<{ note: string }>((resolve, reject) => {
          calls.push({ user: currentUser!, session: sessionId, key: write.id, text: write.payload.note, seq, resolve: (value) => resolve(value as { note: string }), reject });
        });
      },
      (payload): payload is { note: string } => typeof (payload as { note?: unknown } | null)?.note === "string",
    );
    return queue;
  };
  let queue = makeQueue();
  void queue.hydrate();

  const land = (call: Call) => {
    const key = `${call.user}|${call.key}`;
    const previous = server.get(key);
    if (previous && previous.seq > call.seq) fail(`older text ${call.text} landed after newer ${previous.text}`);
    server.set(key, { text: call.text, seq: call.seq });
  };
  const finish = (call: Call) => {
    calls = calls.filter((other) => other !== call);
    const lane = `${call.user}|${call.key}`;
    inflight.set(lane, (inflight.get(lane) ?? 1) - 1);
  };
  const markFates = (predicate: (user: string) => boolean, fate: Fate) => {
    for (const [key, value] of latest) if (value.fate === "pending" && predicate(key.split("|")[0])) value.fate = fate;
  };
  const enter = (user: string) => {
    currentUser = user;
    heldUser = null;
    sessionUser = user;
    sessionExpired = false;
    sessionId += 1;
    markFates((owner) => owner !== user, "dropped");
    void queue.dropOtherUsers(user);
    void queue.flush();
  };
  const expire = () => {
    if (currentUser === null) return;
    heldUser = currentUser;
    currentUser = null;
    sessionExpired = true;
  };
  /** Until a read of the stored copy succeeded, storage may hold more than memory. */
  let storedReadOk = true;

  for (let step = 0; step < actions.length; step += 1) {
    const action = actions[step];
    sendsThisStep = 0;
    now += 1 + ((step * 37) % 400);
    const entriesBefore = queue.list().length;
    switch (action.t) {
      case "submit": {
        const owner = currentUser ?? heldUser;
        if (owner === null) break;
        const seq = ++seqCounter;
        const text = `${action.key}#${seq}`;
        const key = `${owner}|${action.key}`;
        latest.set(key, { seq, text, fate: "pending" });
        void queue.submit<{ note: string }, { note: string }>(KIND, action.key, { note: text }).then((outcome) => {
          if (outcome.status === "sent" && Number(outcome.result.note.split("#")[1]) < seq) fail(`submit of ${text} answered with older ${outcome.result.note}`);
          if (outcome.status === "rejected") {
            const entry = latest.get(key);
            if (entry && entry.seq === seq && entry.fate === "pending") entry.fate = "told";
          }
        });
        break;
      }
      case "answer": {
        if (calls.length === 0) break;
        const call = calls[action.idx % calls.length];
        finish(call);
        switch (action.kind) {
          case "ok":
            land(call);
            call.resolve({ note: call.text });
            break;
          case "okLostAnswer":
            land(call);
            call.reject(ApiError.network("timeout"));
            break;
          case "network":
            call.reject(ApiError.network("timeout"));
            break;
          case "503":
            call.reject(new ApiError({ code: "serviceUnavailable", status: 503, message: "later" }));
            break;
          case "429":
            call.reject(new ApiError({ code: "rateLimited", status: 429, message: "wait", retryAfterSeconds: 30 }));
            break;
          case "400":
            call.reject(new ApiError({ code: "invalidData", status: 400, message: "bad" }));
            break;
          case "404": {
            const entry = latest.get(`${call.user}|${call.key}`);
            if (entry && entry.text === call.text && entry.fate === "pending") entry.fate = "notfound";
            call.reject(new ApiError({ code: "numberNotFound", status: 404, message: "gone" }));
            break;
          }
          case "401":
            if (currentUser === call.user) expire();
            call.reject(new ApiError({ code: "sessionExpired", status: 401, message: "expired" }));
            break;
          case "401old":
            // Only a request of a replaced session gets a 401 the current session survives.
            if (call.session === sessionId && currentUser === call.user) expire();
            call.reject(new ApiError({ code: "sessionExpired", status: 401, message: "expired" }));
            break;
        }
        break;
      }
      case "offline":
        online = false;
        break;
      case "online":
        online = true;
        if (currentUser !== null) void queue.flush();
        break;
      case "timer": {
        timers.sort((a, b) => a.at - b.at);
        const timer = timers.shift();
        if (timer) {
          now = Math.max(now, timer.at);
          if (timer.generation === generation) timer.callback();
        } else now += 1000;
        break;
      }
      case "restart": {
        await settle();
        for (const call of calls) if (action.applyInflight) land(call);
        calls = [];
        inflight.clear();
        timers = [];
        generation += 1;
        heldUser = null;
        currentUser = null;
        failNextReads = action.readFails ? (action.readFailsTwice ? 2 : 1) : 0;
        storedReadOk = !action.readFails;
        queue = makeQueue();
        await queue.hydrate();
        if (sessionUser && !sessionExpired) enter(sessionUser);
        break;
      }
      case "signOut":
        if (currentUser === null) break;
        markFates(() => true, "cleared");
        currentUser = null;
        heldUser = null;
        sessionUser = null;
        void queue.clear();
        break;
      case "expire":
        expire();
        break;
      case "signIn":
        if (currentUser !== null) break;
        enter(action.user);
        break;
      case "discard": {
        if (currentUser === null) break;
        const entry = latest.get(`${currentUser}|${action.key}`);
        if (entry && entry.fate === "pending") entry.fate = "discarded";
        void queue.discard(KIND, action.key);
        break;
      }
      case "flush":
        if (currentUser === null) break;
        for (let i = 0; i < action.n; i += 1) void queue.flush();
        break;
    }
    await settle();

    if (action.t === "timer" && sendsThisStep > Math.max(entriesBefore, queue.list().length) + 1) fail(`spin: ${sendsThisStep} sends in one step`);
    const live = timers.filter((timer) => timer.generation === generation);
    if (live.length > 1) fail(`timer storm: ${live.length} timers`);
    const stored = parsePendingWrites(data.get(PENDING_WRITES_STORAGE_KEY));
    const memory = queue.list();
    const norm = (writes: unknown[]) => JSON.stringify(writes.map((write) => JSON.stringify(write)).sort());
    // The read that failed at the restart is retried by the next hydrate / write; once it succeeded the
    // stored copy follows the memory again.
    if (norm(stored) !== norm(memory)) {
      if (storedReadOk) fail("storage differs from memory");
    } else storedReadOk = true;
    for (const [key, entry] of latest) {
      if (entry.fate !== "pending") continue;
      const [user, id] = key.split("|");
      const onServer = server.get(key);
      if (onServer && onServer.text === entry.text) continue;
      const queued = queue.get<{ note: string }>(KIND, id);
      if (queued && queued.userId === user && queued.payload.note === entry.text) continue;
      if (calls.some((call) => call.user === user && call.key === id && call.text === entry.text)) continue;
      // Not read back yet after a failed read: the stored copy still holds it (checked once merged).
      if (!storedReadOk && stored.some((write) => write.userId === user && write.id === id && (write.payload as { note: string }).note === entry.text)) continue;
      fail(`newest text ${entry.text} of ${user} lost silently (server=${onServer?.text ?? "-"})`);
    }
    // A write dropped because another account signed in never comes back (also from a stored copy read late).
    for (const write of memory) {
      const entry = latest.get(`${write.userId}|${write.id}`);
      if (entry && entry.fate === "dropped" && (write.payload as { note: string }).note === entry.text) fail(`dropped write ${entry.text} of ${write.userId} came back`);
    }
    if (currentUser !== null && online) {
      const waiting = queue.list().filter((write) => write.userId === currentUser && !write.refusal);
      if (waiting.length > 0 && calls.length === 0 && live.length === 0) {
        fail(`stuck: ${waiting.map((write) => (write.payload as { note: string }).note).join(",")} waits online with no timer and no request`);
      }
    }
    if (violation) return `step ${step}: ${violation}`;
  }
  return null;
}

function generate(seed: number, length: number): Action[] {
  const random = rng(seed);
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  const keys = ["k1", "k2", "k3"].slice(0, 1 + Math.floor(random() * 3));
  const answers: readonly Answer[] = ["ok", "ok", "ok", "okLostAnswer", "network", "503", "429", "400", "404", "401", "401old"];
  const actions: Action[] = [];
  for (let i = 0; i < length; i += 1) {
    const x = random();
    if (x < 0.25) actions.push({ t: "submit", key: pick(keys) });
    else if (x < 0.55) actions.push({ t: "answer", idx: Math.floor(random() * 4), kind: pick(answers) });
    else if (x < 0.6) actions.push({ t: "offline" });
    else if (x < 0.66) actions.push({ t: "online" });
    else if (x < 0.76) actions.push({ t: "timer" });
    else if (x < 0.79) actions.push({ t: "restart", applyInflight: random() < 0.5, readFails: random() < 0.4, readFailsTwice: random() < 0.5 });
    else if (x < 0.8) actions.push({ t: "signOut" });
    else if (x < 0.82) actions.push({ t: "expire" });
    else if (x < 0.87) actions.push({ t: "signIn", user: random() < 0.75 ? "A" : "B" });
    else if (x < 0.9) actions.push({ t: "discard", key: pick(keys) });
    else actions.push({ t: "flush", n: 1 + Math.floor(random() * 3) });
  }
  return actions;
}

describe("pending writes: random histories (model)", () => {
  it("a flush requested during a run is not lost (minimal history of the stuck note)", async () => {
    const history: Action[] = [
      { t: "offline" },
      { t: "submit", key: "k2" }, // queued offline; its timer then fires offline (left to the reconnect)
      { t: "timer" },
      { t: "online" }, // the reconnect flush sends k2: slow answer
      { t: "submit", key: "k1" },
      { t: "answer", idx: 1, kind: "503" }, // k1 waits with a backoff timer
      { t: "timer" }, // fires while the reconnect flush still runs: joins it
      { t: "answer", idx: 0, kind: "ok" }, // k2 answered; k1 must still be sent
      { t: "timer" },
      { t: "timer" },
    ];
    assert.equal(await run(history), null);
  });

  it("a failed read of the stored queue at start-up never lets the next change overwrite it", async () => {
    const history: Action[] = [
      { t: "offline" },
      { t: "submit", key: "k1" }, // stored offline
      { t: "restart", applyInflight: false, readFails: true },
      { t: "submit", key: "k2" }, // the first change after the failed read
      { t: "timer" },
      { t: "online" },
      { t: "answer", idx: 0, kind: "ok" },
      { t: "answer", idx: 0, kind: "ok" },
    ];
    assert.equal(await run(history), null);
  });

  it("a sign-in flush that joins a run ending on «hold» is not lost", async () => {
    const history: Action[] = [
      { t: "offline" },
      { t: "submit", key: "k1" }, // waits; its timer then fires offline (left to the reconnect)
      { t: "timer" },
      { t: "online" }, // the reconnect flush sends k1: slow answer
      { t: "expire" },
      { t: "signIn", user: "A" }, // the sign-in flush joins the running one
      { t: "answer", idx: 0, kind: "401old" }, // the old session's answer ends that run on «hold»
      { t: "answer", idx: 0, kind: "ok" },
    ];
    assert.equal(await run(history), null);
  });

  it("two failed reads at a restart: a late read neither brings back another account's drafts nor leaves them stuck", async () => {
    const lateMerge: Action[] = [
      { t: "offline" },
      { t: "submit", key: "k1" },
      { t: "online" }, // k1 in flight when the app is killed: stored with attempts 0
      { t: "restart", applyInflight: false, readFails: true, readFailsTwice: true }, // the sign-in flush reads nothing
      { t: "submit", key: "k2" }, // its read succeeds and merges k1: k1 must be sent too
      { t: "answer", idx: 0, kind: "ok" },
      { t: "answer", idx: 0, kind: "ok" },
    ];
    assert.equal(await run(lateMerge), null);
    const otherAccount: Action[] = [
      { t: "offline" },
      { t: "submit", key: "k1" },
      { t: "expire" },
      { t: "restart", applyInflight: false, readFails: true, readFailsTwice: true },
      { t: "signIn", user: "B" },
      { t: "submit", key: "k2" }, // reads A's k1 back: it must stay dropped
      { t: "online" },
      { t: "answer", idx: 0, kind: "ok" },
    ];
    assert.equal(await run(otherAccount), null);
  });

  it("holds every invariant over seeded random histories", async () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 160; seed += 1) {
      const violation = await run(generate(seed, 50));
      if (violation) failures.push(`seed ${seed}: ${violation}`);
    }
    assert.deepEqual(failures, []);
  });
});
