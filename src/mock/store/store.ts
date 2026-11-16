/**
 * The shared in-memory store of the mock backend: typed tables, three singletons (meta, site settings,
 * mock controls), id generation and transactions. One instance serves all nine `ApiClient` members and the
 * mock `FileService` (docs/spec/90-addendum-5.md B.6 rule 2).
 *
 * The store knows nothing about time, fixtures or persistence: `MockPersistence` saves it, `buildFixtures`
 * fills it, rules mutate it.
 */
import type { SiteSettings } from "@/api/types";

import type { MockControls } from "../controls";
import {
  MOCK_TABLE_NAMES,
  TABLE_SCHEMAS,
  type MockMeta,
  type MockSnapshot,
  type MockTableName,
  type MockTableRows,
} from "./schema";
import { Table } from "./table";

type Tables = { [K in MockTableName]: Table<MockTableRows[K]> };

/** Name of a singleton in the dirty set (tables use their own name). */
export type MockSingletonName = "meta" | "settings" | "controls";
export type MockDirtyKey = MockTableName | MockSingletonName;

type Singletons = { meta: MockMeta; settings: SiteSettings; controls: MockControls };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MockStore implements Tables {
  // One property per table — `store.users.get(id)`, `store.statuses.by("studentId", id)`.
  readonly users!: Tables["users"];
  readonly sessions!: Tables["sessions"];
  readonly profiles!: Tables["profiles"];
  readonly groups!: Tables["groups"];
  readonly parentCalls!: Tables["parentCalls"];
  readonly files!: Tables["files"];
  readonly topics!: Tables["topics"];
  readonly numbers!: Tables["numbers"];
  readonly statuses!: Tables["statuses"];
  readonly progressEvents!: Tables["progressEvents"];
  readonly homeworks!: Tables["homeworks"];
  readonly homeworkNumbers!: Tables["homeworkNumbers"];
  readonly homeworkPhotos!: Tables["homeworkPhotos"];
  readonly homeworkChecks!: Tables["homeworkChecks"];
  readonly homeworkCheckPhotos!: Tables["homeworkCheckPhotos"];
  readonly homeworkCheckResults!: Tables["homeworkCheckResults"];
  readonly lessons!: Tables["lessons"];
  readonly participants!: Tables["participants"];
  readonly lessonItems!: Tables["lessonItems"];
  readonly submissions!: Tables["submissions"];
  readonly submissionPhotos!: Tables["submissionPhotos"];
  readonly notifications!: Tables["notifications"];
  readonly auditLogs!: Tables["auditLogs"];
  readonly limiterBuckets!: Tables["limiterBuckets"];
  readonly jobs!: Tables["jobs"];
  readonly rowScripts!: Tables["rowScripts"];
  readonly planScripts!: Tables["planScripts"];

  private singletons: Singletons;
  private readonly dirty = new Set<MockDirtyKey>();
  private transactionDepth = 0;

  constructor(snapshot: MockSnapshot) {
    const host = {
      inTransaction: () => this.transactionDepth > 0,
      changed: (table: string) => {
        this.dirty.add(table as MockTableName);
      },
    };
    const tables = this as unknown as Record<MockTableName, Table<{ id: string }>>;
    for (const name of MOCK_TABLE_NAMES) {
      tables[name] = new Table(name, TABLE_SCHEMAS[name] as never, host) as Table<{ id: string }>;
    }
    this.singletons = { meta: snapshot.meta, settings: snapshot.settings, controls: snapshot.controls };
    this.restore(snapshot);
  }

  // ───────────────────────────── singletons ─────────────────────────────

  /** Version, seed anchor `t0`, counters. Change through `patchMeta`. */
  get meta(): Readonly<MockMeta> {
    return this.singletons.meta;
  }

  /** Runtime settings of the developer panel (the mock `SiteSetting` table). Change through `patchSettings`. */
  get settings(): Readonly<SiteSettings> {
    return this.singletons.settings;
  }

  /** Mock controls (demo-screen switches). Change through `patchControls`. */
  get controls(): Readonly<MockControls> {
    return this.singletons.controls;
  }

  patchMeta(patch: Partial<MockMeta>): void {
    this.setSingleton("meta", { ...this.singletons.meta, ...patch });
  }

  patchSettings(patch: Partial<SiteSettings>): void {
    this.setSingleton("settings", { ...this.singletons.settings, ...patch });
  }

  patchControls(patch: Partial<MockControls>): void {
    this.setSingleton("controls", { ...this.singletons.controls, ...patch });
  }

  // ───────────────────────────── ids ─────────────────────────────

  /**
   * A new opaque row id, `"<prefix>_m<n>"`. The counter is part of the persisted meta, so ids never repeat
   * across restarts and never collide with the readable fixture ids (`usr_ilya`, `hw_ilya_overdue`, …).
   */
  nextId(prefix: string): string {
    const next = this.singletons.meta.idCounter + 1;
    this.patchMeta({ idCounter: next });
    return `${prefix}_m${next.toString(36)}`;
  }

  // ───────────────────────────── tables ─────────────────────────────

  /** The table with this name (for generic code; prefer the typed properties). */
  table<K extends MockTableName>(name: K): Tables[K] {
    return (this as unknown as Tables)[name];
  }

  // ───────────────────────────── transactions ─────────────────────────────

  /**
   * Runs `work` atomically: if it throws, every table and singleton change made inside is reverted and the
   * error is re-thrown. Transactions nest (an inner failure caught by the outer work reverts only the inner
   * part). `work` must be synchronous — the store is in memory, so there is nothing to await inside it.
   *
   * Use it wherever the server uses one DB transaction (issuing a homework, finishing a check, deleting a
   * student). Do NOT wrap rate-limit consumption or audit rows that must survive a refusal.
   */
  transaction<T>(work: () => T): T {
    const marks = MOCK_TABLE_NAMES.map((name) => this.table(name).undoMark());
    const singletons = this.singletons;
    this.transactionDepth += 1;
    try {
      const result = work();
      if (isPromiseLike(result)) {
        throw new Error("Mock store: a transaction must be synchronous (do not pass an async function).");
      }
      return result;
    } catch (error) {
      MOCK_TABLE_NAMES.forEach((name, index) => this.table(name).rollbackTo(marks[index]!));
      if (this.singletons !== singletons) {
        this.singletons = singletons;
        this.dirty.add("meta").add("settings").add("controls");
      }
      throw error;
    } finally {
      this.transactionDepth -= 1;
      if (this.transactionDepth === 0) {
        for (const name of MOCK_TABLE_NAMES) this.table(name).commit();
      }
    }
  }

  // ───────────────────────────── snapshot / persistence support ─────────────────────────────

  /** The whole store as plain JSON (a deep copy of the singletons; rows are frozen and shared). */
  snapshot(): MockSnapshot {
    const tables = {} as Record<MockTableName, unknown[]>;
    for (const name of MOCK_TABLE_NAMES) tables[name] = this.table(name).dump();
    return {
      meta: clone(this.singletons.meta),
      settings: clone(this.singletons.settings),
      controls: clone(this.singletons.controls),
      tables: tables as MockSnapshot["tables"],
    };
  }

  /** Replaces the whole content with `snapshot` (seed, reset, load). Everything becomes dirty. */
  restore(snapshot: MockSnapshot): void {
    if (this.transactionDepth > 0) throw new Error("Mock store: cannot restore inside a transaction.");
    for (const name of MOCK_TABLE_NAMES) {
      this.table(name).load((snapshot.tables[name] ?? []) as never);
    }
    this.singletons = {
      meta: clone(snapshot.meta),
      settings: clone(snapshot.settings),
      controls: clone(snapshot.controls),
    };
    this.dirty.add("meta").add("settings").add("controls");
  }

  /** Tables and singletons changed since the last `takeDirty()`. */
  hasDirty(): boolean {
    return this.dirty.size > 0;
  }

  /** Returns the changed keys and clears the set (called by the persistence layer before a save). */
  takeDirty(): MockDirtyKey[] {
    const keys = Array.from(this.dirty);
    this.dirty.clear();
    return keys;
  }

  /** Puts keys back after a failed save. */
  markDirty(keys: readonly MockDirtyKey[]): void {
    for (const key of keys) this.dirty.add(key);
  }

  private setSingleton<K extends MockSingletonName>(name: K, value: Singletons[K]): void {
    // A new object per change: a transaction rolls back by restoring the previous `singletons` reference.
    this.singletons = { ...this.singletons, [name]: value };
    this.dirty.add(name);
  }
}

function isPromiseLike(value: unknown): boolean {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}
