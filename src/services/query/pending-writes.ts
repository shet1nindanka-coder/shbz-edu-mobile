/**
 * Pending writes — a small durable queue for the few writes that should survive a lost connection.
 *
 * WHY: mutations fail fast offline (see `query-client.ts`). For most actions that is right — the user sees
 * the error and decides. A typed draft is different: losing a note because the train entered a tunnel is
 * not acceptable (docs/spec/02-student-study.md Q12). Such a write is put here instead of being thrown
 * away: it is kept on the device, shown as "will be saved when you are back online", and sent when the
 * connection returns.
 *
 * HOW TO USE (area code):
 *
 * 1. Register the kind once, at module scope or in the composition root:
 *
 *    ```ts
 *    pendingWrites.register<{ note: string }, { note: string }>("student.note", async (write, { api, queryClient }) => {
 *      const saved = await api.studentStudy.saveNumberNote(write.id, write.payload.note);
 *      void queryClient.invalidateQueries({ queryKey: qk("studentStudy", "getNumberDetail") });
 *      return saved;                       // handed to the caller of `submit` as `outcome.result`
 *    });
 *    ```
 *
 * 2. Save through the queue instead of calling the API directly:
 *
 *    ```ts
 *    const outcome = await pendingWrites.submit("student.note", homeworkNumberId, { note });
 *    // "sent"     → the server has it (`outcome.result` = what the handler returned)
 *    // "queued"   → no answer (or nobody may send now); kept locally and sent later
 *    // "rejected" → the server refused it (validation, 404…): show `outcome.error.message`
 *    ```
 *
 * 3. Show the waiting state with `usePendingWrite(kind, id)` (`@/providers`), which re-renders on changes.
 *
 * STATES OF AN ENTRY (one per `kind + id`, owned by `userId`)
 *
 *   (none) ──submit──▶ SENDING ──answer──────────────────────────────▶ (none)          delivered
 *                         │ ──no answer (isRetryable)──▶ WAITING                       kept, attempts + 1
 *                         │ ──session gone (isHeld)────▶ WAITING                       kept, flush stops
 *                         └ ──refusal──▶ REFUSED  if `keepRefused(error)` returns the refusal to remember,
 *                                        (none)   otherwise (and `onRejected` when nobody awaited it)
 *   WAITING ──flush──▶ SENDING      flush: on reconnect, in the foreground, after sign-in, and — when
 *                                   `retryDelaysMs` is set — by itself with backoff while the device is
 *                                   online (a timeout while "online" brings no reconnect event).
 *   REFUSED ──flush──▶ REFUSED      never re-sent by itself (a refused write cannot succeed unchanged); the
 *                                   UI shows `refusal`, the user re-submits or `discard`s it.
 *   any ──submit (newer payload)──▶ SENDING   last write wins; a refusal is forgotten with the old payload.
 *   any ──discard / clear──▶ (none)           `clear` = explicit sign-out (the user confirmed losing them).
 *   other users' entries ──dropOtherUsers(id)──▶ (none)   a different account signed in on this device.
 *
 * WHO MAY SEND: only the signed-in user (`getUserId`) sends, and only their own entries. While nobody is
 * signed in because the session EXPIRED (not a sign-out), `getOwnerId` names the user whose drafts are
 * kept: a submit made then (an editor flushing as the tree unmounts) is stored for that user and sent when
 * the same user signs in again. Another user never sees or sends them, and signing in as someone else
 * drops them.
 *
 * RULES
 * - One entry per `kind + id`: a newer payload replaces the older one (last write wins) — a queue of drafts
 *   for the same field would only replay stale text.
 * - One request per `kind + id` at a time, `submit` and `flush` alike: a write waits until the previous
 *   request for the same entry has settled and then sends the NEWEST payload. Two overlapping requests could
 *   reach the server in the wrong order and the older text would win. A submit whose payload was superseded
 *   while it waited gets the outcome of the request that carried the newer payload.
 * - `flush()` stops at the first failure without an answer (the rest would fail the same way).
 * - Backoff (`retryDelaysMs`): the n-th consecutive failure without an answer waits `retryDelaysMs[n]` (the
 *   last value repeats); a delivery resets it. Nothing is scheduled while signed out, and a timer that fires
 *   while offline leaves the next try to the reconnect event.
 * - NOT for actions with side effects the user must witness (issuing homework, starting a check, uploads).
 *
 * Pure: storage, clock, timers, connectivity, handler context and the error classification are injected.
 */

export interface PendingWritesStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type PendingWrite<P = unknown> = {
  /** Registered kind, e.g. "student.note". */
  kind: string;
  /** What the write addresses inside its kind (an entity id). `kind + id` is unique. */
  id: string;
  payload: P;
  /** Owner of the write; a different signed-in user never sends it. */
  userId: string;
  createdAt: number;
  updatedAt: number;
  /** Failed attempts so far. */
  attempts: number;
  /** Set when the server refused this payload in the background and the refusal is kept for the UI. */
  refusal?: PendingWriteRefusal;
};

/** What the queue remembers about a refused write (see `keepRefused`). */
export type PendingWriteRefusal = {
  /** Machine code of the refusal, or null. */
  code: string | null;
  /** Localised text at the time of the refusal, or null (the UI shows its fallback). */
  message: string | null;
  /** Epoch ms before which the server will refuse again (`rateLimited`), or null. */
  retryAt: number | null;
  at: number;
};

/** What `keepRefused` extracts from an error; `retryAfterSeconds` becomes `retryAt`. */
export type PendingWriteRefusalInfo = { code: string | null; message: string | null; retryAfterSeconds: number | null };

/** Timer functions (injected in tests). */
export type PendingWritesTimers = { set: (callback: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

/** Sends one write. What it resolves to is handed to the caller of `submit` (e.g. the server's normalised value). */
export type PendingWriteHandler<P, C, R = unknown> = (write: PendingWrite<P>, context: C) => Promise<R>;

export type SubmitOutcome<R = unknown> =
  | { status: "sent"; result: R }
  | { status: "queued" }
  | { status: "rejected"; error: unknown };

export type FlushResult = { sent: number; rejected: number; remaining: number };

export type PendingWritesOptions<C> = {
  storage: PendingWritesStorage;
  /** Storage key of the serialized queue. */
  storageKey?: string;
  /** Builds what handlers receive (API client, query client). Called per flush / submit. */
  getContext: () => C;
  /** The signed-in user id, or null when signed out (nothing is sent then). */
  getUserId: () => string | null;
  /** True when a failure means "no response" and the write should wait; anything else is a final refusal. */
  isRetryable: (error: unknown) => boolean;
  /** True when the failure means "this session may not send" (it expired): kept, the flush stops, no backoff. */
  isHeld?: (error: unknown) => boolean;
  /**
   * A refusal to keep with the entry (state REFUSED) so the UI can show it later, or null to drop the entry.
   * Without it every refusal drops the entry.
   */
  keepRefused?: (error: unknown) => PendingWriteRefusalInfo | null;
  /** A write the server refused during a background flush (nobody is awaiting it). */
  onRejected?: (write: PendingWrite, error: unknown) => void;
  /**
   * Who owns writes submitted while nobody is signed in (the user whose session expired), or null. Such a
   * write is kept for that user and not sent. Without it a submit while signed out is refused.
   */
  getOwnerId?: () => string | null;
  /** Backoff of the automatic flush after a failure without an answer; empty or absent = no automatic flush. */
  retryDelaysMs?: readonly number[];
  /** Connectivity; an automatic flush is skipped while offline (the reconnect flushes). Default: online. */
  isOnline?: () => boolean;
  timers?: PendingWritesTimers;
  now?: () => number;
};

export interface PendingWritesQueue<C> {
  /** Loads the stored queue. Idempotent; every other method waits for it. */
  hydrate(): Promise<void>;
  /** Registers the sender of a kind; returns the unregister function. */
  register<P, R = unknown>(kind: string, handler: PendingWriteHandler<P, C, R>): () => void;
  /** Tries to send now; on a network failure the write is kept for later. */
  submit<P, R = unknown>(kind: string, id: string, payload: P): Promise<SubmitOutcome<R>>;
  /** Sends everything that can be sent. Concurrent calls share one run. */
  flush(): Promise<FlushResult>;
  get<P = unknown>(kind: string, id: string): PendingWrite<P> | null;
  list(kind?: string): PendingWrite[];
  /** Drops one entry (the user discarded the draft). */
  discard(kind: string, id: string): Promise<void>;
  /** Drops every entry (explicit sign-out). */
  clear(): Promise<void>;
  /** Drops the entries of every user but `userId` (another account signed in on this device). */
  dropOtherUsers(userId: string): Promise<void>;
  /** Called after every change of the queue. */
  subscribe(listener: () => void): () => void;
  /** Monotonic counter of changes — a cheap snapshot for `useSyncExternalStore`. */
  version(): number;
}

export const PENDING_WRITES_STORAGE_KEY = "shbz-pending-writes";

function entryKey(kind: string, id: string): string {
  return `${kind}\u0000${id}`;
}

function isRefusal(value: unknown): value is PendingWriteRefusal {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    (row.code === null || typeof row.code === "string") &&
    (row.message === null || typeof row.message === "string") &&
    (row.retryAt === null || typeof row.retryAt === "number") &&
    typeof row.at === "number"
  );
}

function isPendingWrite(value: unknown): value is PendingWrite {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    (row.refusal === undefined || isRefusal(row.refusal)) &&
    typeof row.kind === "string" &&
    typeof row.id === "string" &&
    typeof row.userId === "string" &&
    typeof row.createdAt === "number" &&
    typeof row.updatedAt === "number" &&
    typeof row.attempts === "number" &&
    "payload" in row
  );
}

/** Reads a stored queue; anything malformed is dropped entry by entry. */
export function parsePendingWrites(raw: string | null | undefined): PendingWrite[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPendingWrite) : [];
  } catch {
    return [];
  }
}

export function createPendingWritesQueue<C>(options: PendingWritesOptions<C>): PendingWritesQueue<C> {
  const { storage, getContext, getUserId, isRetryable, onRejected, isHeld, keepRefused, getOwnerId } = options;
  const storageKey = options.storageKey ?? PENDING_WRITES_STORAGE_KEY;
  const now = options.now ?? Date.now;
  const retryDelays = options.retryDelaysMs ?? [];
  const isOnline = options.isOnline ?? (() => true);
  const timers: PendingWritesTimers = options.timers ?? {
    set: (callback, ms) => setTimeout(callback, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };

  const entries = new Map<string, PendingWrite>();
  const handlers = new Map<string, PendingWriteHandler<unknown, C>>();
  const listeners = new Set<() => void>();
  let changes = 0;
  let hydration: Promise<void> | null = null;
  let flushing: Promise<FlushResult> | null = null;
  let saveChain: Promise<void> = Promise.resolve();

  const changed = () => {
    changes += 1;
    listeners.forEach((listener) => listener());
    // Saves are serialized so an older snapshot can never overwrite a newer one.
    const snapshot = JSON.stringify([...entries.values()]);
    saveChain = saveChain.then(async () => {
      try {
        if (snapshot === "[]") await storage.removeItem(storageKey);
        else await storage.setItem(storageKey, snapshot);
      } catch {
        // The queue keeps working in memory for this run of the app.
      }
    });
  };

  const hydrate = (): Promise<void> => {
    hydration ??= (async () => {
      let stored: PendingWrite[] = [];
      try {
        stored = parsePendingWrites(await storage.getItem(storageKey));
      } catch {
        stored = [];
      }
      let added = false;
      for (const write of stored) {
        const key = entryKey(write.kind, write.id);
        // A write made before hydration finished is newer than the stored one.
        if (entries.has(key)) continue;
        entries.set(key, write);
        added = true;
      }
      if (added) {
        changes += 1;
        listeners.forEach((listener) => listener());
      }
    })();
    return hydration;
  };

  // ── backoff of the automatic flush ──
  let retryTimer: unknown = null;
  let retryStep = 0;
  /** Entries the signed-in user could send now (not refused). */
  const hasWaiting = () => {
    const userId = getUserId();
    if (userId === null) return false;
    for (const write of entries.values()) if (write.userId === userId && !write.refusal) return true;
    return false;
  };
  const cancelRetry = () => {
    if (retryTimer !== null) timers.clear(retryTimer);
    retryTimer = null;
  };
  const scheduleRetry = () => {
    if (retryDelays.length === 0 || retryTimer !== null || !hasWaiting()) return;
    const delay = retryDelays[Math.min(retryStep, retryDelays.length - 1)] ?? 0;
    retryStep += 1;
    retryTimer = timers.set(() => {
      retryTimer = null;
      // Offline: the reconnect event flushes. Signed out: the next sign-in flushes.
      if (getUserId() === null || !isOnline()) return;
      void flush();
    }, delay);
  };

  type Attempt = "sent" | "retry" | "hold" | "rejected" | "skipped";
  type AttemptOutcome = { result: Attempt; error?: unknown; value?: unknown; sentAt?: number };

  /** Tail of the requests of each entry: the next request for a key starts when this settles. */
  const lanes = new Map<string, Promise<void>>();
  /** The last request that reached an answer per key, for submits whose payload it carried. */
  const answered = new Map<string, AttemptOutcome & { sentAt: number }>();

  /** Sends one entry. The entry is removed unless a NEWER payload replaced it while the request was running. */
  const send = async (key: string): Promise<AttemptOutcome> => {
    const write = entries.get(key);
    if (!write) return { result: "skipped" };
    const handler = handlers.get(write.kind);
    // No sender yet (its module is not loaded), another user's draft, or a refusal waiting for the user.
    if (!handler || write.userId !== getUserId() || write.refusal) return { result: "skipped" };

    const sentAt = write.updatedAt;
    const isStillSame = () => entries.get(key)?.updatedAt === sentAt;
    try {
      const value = await handler(write, getContext());
      if (isStillSame()) {
        entries.delete(key);
        changed();
      }
      return { result: "sent", value, sentAt };
    } catch (error) {
      if (isRetryable(error)) {
        const current = entries.get(key);
        if (current && isStillSame()) {
          entries.set(key, { ...current, attempts: current.attempts + 1 });
          changed();
        }
        return { result: "retry", error, sentAt };
      }
      if (isHeld?.(error)) return { result: "hold", error, sentAt };
      if (isStillSame()) {
        const current = entries.get(key);
        const info = keepRefused?.(error) ?? null;
        if (current && info) {
          const at = now();
          const retryAt = info.retryAfterSeconds ? at + info.retryAfterSeconds * 1000 : null;
          entries.set(key, { ...current, refusal: { code: info.code, message: info.message, retryAt, at } });
        } else entries.delete(key);
        changed();
      }
      return { result: "rejected", error, sentAt };
    }
  };

  /** `send`, queued behind the request already running for the same entry (one request per key). */
  const attempt = (key: string): Promise<AttemptOutcome> => {
    const previous = lanes.get(key) ?? Promise.resolve();
    const run = previous.then(() => send(key));
    const tail = run.then(
      (outcome) => {
        if (outcome.sentAt !== undefined) answered.set(key, { ...outcome, sentAt: outcome.sentAt });
        if (outcome.result === "retry") scheduleRetry();
        else if (outcome.result === "sent") retryStep = 0;
        if (!hasWaiting()) {
          cancelRetry();
          retryStep = 0;
        }
      },
      () => undefined,
    );
    lanes.set(key, tail);
    void tail.then(() => {
      if (lanes.get(key) === tail) {
        lanes.delete(key);
        answered.delete(key);
      }
    });
    return run;
  };

  const flush = (): Promise<FlushResult> => {
    flushing ??= (async () => {
      await hydrate();
      let sent = 0;
      let rejected = 0;
      // Oldest first, so writes reach the server in the order they were made.
      const keys = [...entries.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt).map(([key]) => key);
      for (const key of keys) {
        const write = entries.get(key);
        const outcome = await attempt(key);
        if (outcome.result === "sent") sent += 1;
        else if (outcome.result === "rejected") {
          rejected += 1;
          if (write) onRejected?.(write, outcome.error);
        } else if (outcome.result === "retry" || outcome.result === "hold") break;
      }
      return { sent, rejected, remaining: entries.size };
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  };

  return {
    hydrate,
    register<P, R = unknown>(kind: string, handler: PendingWriteHandler<P, C, R>) {
      handlers.set(kind, handler as PendingWriteHandler<unknown, C>);
      return () => {
        if (handlers.get(kind) === (handler as PendingWriteHandler<unknown, C>)) handlers.delete(kind);
      };
    },
    async submit<P, R = unknown>(kind: string, id: string, payload: P): Promise<SubmitOutcome<R>> {
      await hydrate();
      // While a session that expired is being torn down, its user still owns what the editors flush.
      const userId = getUserId() ?? getOwnerId?.() ?? null;
      if (userId === null) return { status: "rejected", error: new Error("pending-writes: no signed-in user") };
      if (!handlers.has(kind)) return { status: "rejected", error: new Error(`pending-writes: kind "${kind}" is not registered`) };

      const key = entryKey(kind, id);
      const previous = entries.get(key);
      const stamp = now();
      entries.set(key, {
        kind,
        id,
        payload,
        userId,
        createdAt: previous?.createdAt ?? stamp,
        // Strictly increasing per entry, so "still the same payload" checks hold even within one millisecond.
        updatedAt: previous ? Math.max(stamp, previous.updatedAt + 1) : stamp,
        attempts: 0,
      });
      changed();
      const mine = entries.get(key)?.updatedAt ?? stamp;

      let outcome = await attempt(key);
      if (outcome.result === "skipped") {
        // An earlier request of this entry already carried this payload (or a newer one): its answer is ours.
        const carrier = answered.get(key);
        if (carrier && carrier.sentAt >= mine) outcome = carrier;
      }
      if (outcome.result === "sent") return { status: "sent", result: outcome.value as R };
      if (outcome.result === "rejected") return { status: "rejected", error: outcome.error };
      return { status: "queued" };
    },
    flush,
    get<P = unknown>(kind: string, id: string) {
      return (entries.get(entryKey(kind, id)) as PendingWrite<P> | undefined) ?? null;
    },
    list(kind) {
      const all = [...entries.values()];
      return kind === undefined ? all : all.filter((write) => write.kind === kind);
    },
    async discard(kind, id) {
      await hydrate();
      if (entries.delete(entryKey(kind, id))) changed();
    },
    async clear() {
      await hydrate();
      cancelRetry();
      retryStep = 0;
      if (entries.size === 0) return;
      entries.clear();
      changed();
      await saveChain;
    },
    async dropOtherUsers(userId) {
      await hydrate();
      let dropped = false;
      for (const [key, write] of entries) {
        if (write.userId === userId) continue;
        entries.delete(key);
        dropped = true;
      }
      if (dropped) changed();
      await saveChain;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => changes,
  };
}
