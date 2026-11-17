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
 *    // "queued"   → no connection; kept locally and retried later
 *    // "rejected" → the server refused it (validation, 404…): show `outcome.error.message`
 *    ```
 *
 * 3. Show the waiting state with `usePendingWrite(kind, id)` (`@/providers`), which re-renders on changes.
 *
 * RULES
 * - One entry per `kind + id`: a newer payload replaces the older one (last write wins) — a queue of drafts
 *   for the same field would only replay stale text.
 * - One request per `kind + id` at a time, `submit` and `flush` alike: a write waits until the previous
 *   request for the same entry has settled and then sends the NEWEST payload. Two overlapping requests could
 *   reach the server in the wrong order and the older text would win. A submit whose payload was superseded
 *   while it waited gets the outcome of the request that carried the newer payload.
 * - Only a `network` failure keeps the entry. Any answer from the server is final: success removes it, a
 *   refusal removes it and is reported (`onRejected`), because repeating a refused write cannot succeed.
 * - `flush()` is called when the connection returns, when the app comes to the foreground and after
 *   sign-in. It stops at the first network failure (the rest would fail the same way).
 * - Entries are tied to the user that created them: another account never sends them.
 * - NOT for actions with side effects the user must witness (issuing homework, starting a check, uploads).
 *
 * Pure: storage, clock, handler context and the "is this a network error" test are injected.
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
};

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
  /** A write the server refused during a background flush (nobody is awaiting it). */
  onRejected?: (write: PendingWrite, error: unknown) => void;
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
  /** Drops every entry (sign-out). */
  clear(): Promise<void>;
  /** Called after every change of the queue. */
  subscribe(listener: () => void): () => void;
  /** Monotonic counter of changes — a cheap snapshot for `useSyncExternalStore`. */
  version(): number;
}

export const PENDING_WRITES_STORAGE_KEY = "shbz-pending-writes";

function entryKey(kind: string, id: string): string {
  return `${kind}\u0000${id}`;
}

function isPendingWrite(value: unknown): value is PendingWrite {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
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
  const { storage, getContext, getUserId, isRetryable, onRejected } = options;
  const storageKey = options.storageKey ?? PENDING_WRITES_STORAGE_KEY;
  const now = options.now ?? Date.now;

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

  type Attempt = "sent" | "retry" | "rejected" | "skipped";
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
    // No sender yet (its module is not loaded) or another user's draft: leave it alone.
    if (!handler || write.userId !== getUserId()) return { result: "skipped" };

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
      if (isStillSame()) {
        entries.delete(key);
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
        } else if (outcome.result === "retry") break;
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
      const userId = getUserId();
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
      if (entries.size === 0) return;
      entries.clear();
      changed();
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
