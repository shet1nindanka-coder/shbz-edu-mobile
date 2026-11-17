/**
 * Persistence of the mock store through an injected async key-value adapter, so the same code runs in Node
 * tests (a `Map`) and on a device (AsyncStorage — wired by the shell).
 *
 * Layout: one key per table plus one manifest key, and a table larger than one row may be is split into
 * pieces (`chunked-storage.ts`). Every stored row stays small (Android's AsyncStorage cannot read a row
 * larger than about 2 MB — the `numbers` table outgrows that after a few textbook imports) and a save
 * rewrites only the tables that changed. The manifest is written last, so a torn save is detected at the
 * next load and re-seeded.
 *
 * `load()` tells "nothing stored" and "a stored dataset that is unusable" (both re-seeded) apart from "the
 * storage could not be read": in that case the stored dataset may be fine at the next start, so this run
 * never writes over it (saves are suspended until `resumeSaves()`). One table row that the storage rejects
 * every time while the manifest reads (an over-sized row of an older build) is "unusable", not "could not
 * be read": it would never become readable, and suspending would stop the device from ever saving again.
 */
import type { SiteSettings } from "@/api/types";
import { isChunkedValueCorruptError, readChunkedValue, removeChunkedValue, writeChunkedValue } from "@/domain/chunked-storage";

import type { MockControls } from "../controls";
import {
  MOCK_STORE_VERSION,
  MOCK_TABLE_NAMES,
  type MockMeta,
  type MockSnapshot,
  type MockTableName,
} from "./schema";
import type { MockDirtyKey, MockStore } from "./store";

/** The subset of AsyncStorage the mock needs. Every method may reject; a failed save is retried on the next change. */
export interface MockStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** An adapter that keeps everything in a `Map` — for tests and for running without device storage. */
export function createMemoryStorage(initial?: Iterable<readonly [string, string]>): MockStorageAdapter & {
  /** The backing map (tests inspect and copy it). */
  readonly data: Map<string, string>;
} {
  const data = new Map<string, string>(initial);
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

export const DEFAULT_STORAGE_PREFIX = "shbz-mock";

type Manifest = {
  version: number;
  /** Number of the save that wrote this manifest; a table written by a later save means a torn save. */
  saveSeq: number;
  meta: MockMeta;
  settings: SiteSettings;
  controls: MockControls;
  tables: MockTableName[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * What `load()` found:
 * - `snapshot` — a complete dataset;
 * - `empty` — nothing stored at all (first start, or cleared);
 * - `discarded` — something was stored but cannot be used (another store version, a torn save, a table that
 *   does not parse); `idCounter` is the stored id counter when it was readable, so ids never repeat;
 * - `failed` — the storage itself rejected a read (other than one table rejected identically on every
 *   attempt — that is `discarded`). Nothing is known about the stored dataset, and this persistence will
 *   not write over it until `resumeSaves()`.
 */
export type MockLoadResult =
  | { kind: "snapshot"; snapshot: MockSnapshot }
  | { kind: "empty" }
  | { kind: "discarded"; idCounter: number | null }
  | { kind: "failed" };

/** Reads made by `load()` before a rejected read counts as a failure. */
const LOAD_ATTEMPTS = 3;

/** A table read rejected by the storage after the manifest was read (and was usable). */
class TableReadFailure extends Error {
  constructor(
    readonly table: MockTableName,
    readonly idCounter: number | null,
    readonly storageError: unknown,
  ) {
    super(`Table "${table}" could not be read`);
    this.name = "TableReadFailure";
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * The failure every attempt of `load()` ran into, when it is the same table rejected with the same error each
 * time (a row the storage can never read); null when any attempt failed differently (a transient failure).
 */
function deterministicTableFailure(failures: readonly (TableReadFailure | null)[]): TableReadFailure | null {
  const first = failures[0];
  if (!first) return null;
  const text = errorText(first.storageError);
  return failures.every((failure) => failure !== null && failure.table === first.table && errorText(failure.storageError) === text) ? first : null;
}

/** Callbacks of the owner of the store (the mock client) around saves. */
export type MockPersistenceHooks = {
  /**
   * Called instead of a save when the stored manifest was written by ANOTHER writer of the same storage
   * (a web tab) after this persistence last loaded or saved. Writing then would put whole stale tables, an
   * older id counter and a lower save number over that writer's data; the owner reloads instead
   * (`load()`), and the store stays dirty. Without this hook the save goes ahead (single writer).
   */
  onExternalSave?: () => void;
  /** Called synchronously when a save takes its snapshot; the value comes back to `onSaved`. */
  saveStarted?: () => number;
  /** Called after a save landed completely (manifest included), with what `saveStarted` returned. */
  onSaved?: (mark: number) => void;
};

export class MockPersistence {
  private readonly adapter: MockStorageAdapter;
  private readonly prefix: string;
  private readonly debounceMs: number;
  private chain: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingStore: MockStore | null = null;
  private saveSeq = 0;
  private savesSuspended = false;
  private readonly hooks: MockPersistenceHooks;
  private readonly chunkBytes: number | undefined;

  /**
   * @param debounceMs Changes are coalesced for this long before a save starts (0 = save on the next
   * microtask — what tests use).
   * @param hooks See `MockPersistenceHooks`.
   */
  constructor(
    adapter: MockStorageAdapter,
    options: { prefix?: string; debounceMs?: number; hooks?: MockPersistenceHooks; /** Max UTF-8 bytes of one stored row (tests). */ chunkBytes?: number } = {},
  ) {
    this.adapter = adapter;
    this.chunkBytes = options.chunkBytes;
    this.prefix = options.prefix ?? DEFAULT_STORAGE_PREFIX;
    this.debounceMs = Math.max(0, options.debounceMs ?? 0);
    this.hooks = options.hooks ?? {};
  }

  /** The storage key written last by every save — another writer of the same storage changes it. */
  get manifestStorageKey(): string {
    return this.manifestKey();
  }

  /**
   * Drops a save that was requested but has not started (the store is about to be replaced by what another
   * writer stored). A save already running finishes.
   */
  discardPending(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingStore = null;
  }

  /** True after a `load()` whose reads failed: nothing is written until `resumeSaves()`. */
  get suspended(): boolean {
    return this.savesSuspended;
  }

  /**
   * Lets saves write again after a failed load — when the in-memory dataset deliberately replaces whatever
   * is stored (a demo reset). The caller schedules the save.
   */
  resumeSaves(): void {
    this.savesSuspended = false;
  }

  /** Waits for the saves already started (without starting the pending one). */
  async settled(): Promise<void> {
    await this.chain;
  }

  private manifestKey(): string {
    return `${this.prefix}:v${MOCK_STORE_VERSION}:manifest`;
  }

  private tableKey(name: MockTableName): string {
    return `${this.prefix}:v${MOCK_STORE_VERSION}:t:${name}`;
  }

  /**
   * Reads the stored dataset (see `MockLoadResult`). A rejected read is tried again a few times; when it
   * keeps failing the result is `failed` and saves are suspended, so a dataset that a transient storage
   * failure hid is not overwritten by fresh fixtures.
   *
   * `suspendOnFailure: false` (a reload after another writer's save): a failure leaves the save state as it
   * was — the dataset in memory is still this writer's own.
   */
  async load(options: { suspendOnFailure?: boolean } = {}): Promise<MockLoadResult> {
    // Failures of one table read while the manifest read fine, by attempt (null: any other failure).
    const tableFailures: (TableReadFailure | null)[] = [];
    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await this.readStored();
        this.savesSuspended = false;
        return result;
      } catch (error) {
        tableFailures.push(error instanceof TableReadFailure ? error : null);
        if (attempt >= LOAD_ATTEMPTS) {
          const unreadable = deterministicTableFailure(tableFailures);
          if (unreadable) {
            // The manifest reads, but one table row is rejected every time with the same error: a row that
            // can never be read (an older build stored the table in one row larger than Android's 2 MB
            // cursor window). Waiting for a later start cannot help, and suspending saves would stop this
            // device from ever saving again — the dataset is unusable, like a torn save. The next save
            // replaces the row with pieces (`writeChunkedValue` tolerates an unreadable previous row).
            this.savesSuspended = false;
            return { kind: "discarded", idCounter: unreadable.idCounter };
          }
          if (options.suspendOnFailure !== false) this.savesSuspended = true;
          return { kind: "failed" };
        }
      }
    }
  }

  /** One read of the stored dataset. Rejects only when the storage rejects a read. */
  private async readStored(): Promise<MockLoadResult> {
    const manifestText = await this.adapter.getItem(this.manifestKey());
    if (manifestText === null) return { kind: "empty" };
    const manifest = parseJson(manifestText);
    if (!isRecord(manifest)) return { kind: "discarded", idCounter: null };
    const { meta, settings, controls } = manifest as Partial<Manifest>;
    const storedCounter = isRecord(meta) && typeof meta.idCounter === "number" && Number.isSafeInteger(meta.idCounter) ? meta.idCounter : null;
    const discarded: MockLoadResult = { kind: "discarded", idCounter: storedCounter };
    if (manifest.version !== MOCK_STORE_VERSION) return discarded;
    if (!isRecord(meta) || !isRecord(settings) || !isRecord(controls)) return discarded;
    if (meta.version !== MOCK_STORE_VERSION || typeof meta.t0 !== "number") return discarded;

    const saveSeq = typeof manifest.saveSeq === "number" ? manifest.saveSeq : 0;
    // Even when the tables below are rejected, the next save of this writer must number after the stored
    // one (otherwise it would look like another writer's save to itself forever).
    this.saveSeq = Math.max(this.saveSeq, saveSeq);

    const tables = {} as Record<MockTableName, unknown[]>;
    for (const name of MOCK_TABLE_NAMES) {
      let text: string | null;
      try {
        text = await readChunkedValue(this.adapter, this.tableKey(name));
      } catch (error) {
        // Pieces of a split table are missing: as unusable as a torn save. A storage error propagates.
        if (isChunkedValueCorruptError(error)) return discarded;
        throw new TableReadFailure(name, storedCounter, error);
      }
      const stored = parseJson(text);
      if (!isRecord(stored) || !Array.isArray(stored.rows) || typeof stored.seq !== "number") return discarded;
      // Written by a save whose manifest never landed: meta (id counter!) and rows disagree.
      if (stored.seq > saveSeq) return discarded;
      tables[name] = stored.rows;
    }
    this.saveSeq = saveSeq;
    return {
      kind: "snapshot",
      snapshot: {
        meta: meta as unknown as MockMeta,
        settings: settings as unknown as SiteSettings,
        controls: controls as unknown as MockControls,
        tables: tables as MockSnapshot["tables"],
      },
    };
  }

  /**
   * Requests a save of whatever is dirty in `store`. Never throws and is not awaited by API methods: saves
   * run one after another in the background. Use `flush()` to wait for them.
   */
  schedule(store: MockStore): void {
    if (this.savesSuspended || !store.hasDirty()) return;
    this.pendingStore = store;
    if (this.timer !== null) return;
    if (this.debounceMs === 0) {
      this.enqueue();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.enqueue();
    }, this.debounceMs);
  }

  /** Waits until every requested save has finished (saving immediately what is still debounced). */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.enqueue();
    await this.chain;
  }

  /** Removes everything this persistence wrote. */
  async clear(): Promise<void> {
    await this.flush();
    await this.adapter.removeItem(this.manifestKey());
    for (const name of MOCK_TABLE_NAMES) await removeChunkedValue(this.adapter, this.tableKey(name));
  }

  private enqueue(): void {
    const store = this.pendingStore;
    if (!store) return;
    this.pendingStore = null;
    this.chain = this.chain.then(() => this.save(store));
  }

  /** Save number of the stored manifest; null when there is none or it cannot be read. */
  private async storedSaveSeq(): Promise<number | null> {
    try {
      const manifest = parseJson(await this.adapter.getItem(this.manifestKey()));
      if (!isRecord(manifest) || manifest.version !== MOCK_STORE_VERSION) return null;
      return typeof manifest.saveSeq === "number" ? manifest.saveSeq : null;
    } catch {
      return null;
    }
  }

  private async save(store: MockStore): Promise<void> {
    if (this.savesSuspended || !store.hasDirty()) return;
    if (this.hooks.onExternalSave) {
      const stored = await this.storedSaveSeq();
      if (stored !== null && stored > this.saveSeq) {
        this.hooks.onExternalSave();
        return;
      }
      if (!store.hasDirty()) return;
    }
    const dirty = store.takeDirty();
    const mark = this.hooks.saveStarted?.() ?? 0;
    try {
      const snapshot = store.snapshot();
      const seq = this.saveSeq + 1;
      for (const key of dirty) {
        if (key === "meta" || key === "settings" || key === "controls") continue;
        await writeChunkedValue(this.adapter, this.tableKey(key), JSON.stringify({ seq, rows: snapshot.tables[key] }), { chunkBytes: this.chunkBytes });
      }
      const manifest: Manifest = {
        version: MOCK_STORE_VERSION,
        saveSeq: seq,
        meta: snapshot.meta,
        settings: snapshot.settings,
        controls: snapshot.controls,
        tables: MOCK_TABLE_NAMES,
      };
      await this.adapter.setItem(this.manifestKey(), JSON.stringify(manifest));
      this.saveSeq = seq;
      this.hooks.onSaved?.(mark);
    } catch {
      // Storage is full or unavailable: the store stays correct in memory; the same keys are retried with
      // the next change.
      store.markDirty(dirty as MockDirtyKey[]);
    }
  }
}
