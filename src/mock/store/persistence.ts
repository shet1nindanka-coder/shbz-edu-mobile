/**
 * Persistence of the mock store through an injected async key-value adapter, so the same code runs in Node
 * tests (a `Map`) and on a device (AsyncStorage — wired by the shell).
 *
 * Layout: one key per table plus one manifest key. Splitting keeps every stored value small (Android's
 * AsyncStorage cannot read a row larger than about 2 MB) and lets a save rewrite only the tables that
 * changed. The manifest is written last, so a torn save is detected at the next load and re-seeded.
 */
import type { SiteSettings } from "@/api/types";

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

export class MockPersistence {
  private readonly adapter: MockStorageAdapter;
  private readonly prefix: string;
  private readonly debounceMs: number;
  private chain: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingStore: MockStore | null = null;
  private saveSeq = 0;

  /**
   * @param debounceMs Changes are coalesced for this long before a save starts (0 = save on the next
   * microtask — what tests use).
   */
  constructor(adapter: MockStorageAdapter, options: { prefix?: string; debounceMs?: number } = {}) {
    this.adapter = adapter;
    this.prefix = options.prefix ?? DEFAULT_STORAGE_PREFIX;
    this.debounceMs = Math.max(0, options.debounceMs ?? 0);
  }

  private manifestKey(): string {
    return `${this.prefix}:v${MOCK_STORE_VERSION}:manifest`;
  }

  private tableKey(name: MockTableName): string {
    return `${this.prefix}:v${MOCK_STORE_VERSION}:t:${name}`;
  }

  /**
   * Reads a stored snapshot. Resolves to null when nothing is stored, the stored version differs, a table
   * is missing or anything fails to parse — the caller then seeds the fixtures.
   */
  async load(): Promise<MockSnapshot | null> {
    try {
      const manifest = parseJson(await this.adapter.getItem(this.manifestKey()));
      if (!isRecord(manifest) || manifest.version !== MOCK_STORE_VERSION) return null;
      const { meta, settings, controls } = manifest as Partial<Manifest>;
      if (!isRecord(meta) || !isRecord(settings) || !isRecord(controls)) return null;
      if (meta.version !== MOCK_STORE_VERSION || typeof meta.t0 !== "number") return null;

      const saveSeq = typeof manifest.saveSeq === "number" ? manifest.saveSeq : 0;

      const tables = {} as Record<MockTableName, unknown[]>;
      for (const name of MOCK_TABLE_NAMES) {
        const stored = parseJson(await this.adapter.getItem(this.tableKey(name)));
        if (!isRecord(stored) || !Array.isArray(stored.rows) || typeof stored.seq !== "number") return null;
        // Written by a save whose manifest never landed: meta (id counter!) and rows disagree.
        if (stored.seq > saveSeq) return null;
        tables[name] = stored.rows;
      }
      this.saveSeq = saveSeq;
      return {
        meta: meta as unknown as MockMeta,
        settings: settings as unknown as SiteSettings,
        controls: controls as unknown as MockControls,
        tables: tables as MockSnapshot["tables"],
      };
    } catch {
      return null;
    }
  }

  /**
   * Requests a save of whatever is dirty in `store`. Never throws and is not awaited by API methods: saves
   * run one after another in the background. Use `flush()` to wait for them.
   */
  schedule(store: MockStore): void {
    if (!store.hasDirty()) return;
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
    for (const name of MOCK_TABLE_NAMES) await this.adapter.removeItem(this.tableKey(name));
  }

  private enqueue(): void {
    const store = this.pendingStore;
    if (!store) return;
    this.pendingStore = null;
    this.chain = this.chain.then(() => this.save(store));
  }

  private async save(store: MockStore): Promise<void> {
    if (!store.hasDirty()) return;
    const dirty = store.takeDirty();
    try {
      const snapshot = store.snapshot();
      const seq = this.saveSeq + 1;
      for (const key of dirty) {
        if (key === "meta" || key === "settings" || key === "controls") continue;
        await this.adapter.setItem(this.tableKey(key), JSON.stringify({ seq, rows: snapshot.tables[key] }));
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
    } catch {
      // Storage is full or unavailable: the store stays correct in memory; the same keys are retried with
      // the next change.
      store.markDirty(dirty as MockDirtyKey[]);
    }
  }
}
