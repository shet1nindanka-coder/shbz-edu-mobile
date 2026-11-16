/**
 * One in-memory table of the mock store: rows by id (insertion order kept), unique constraints and
 * secondary indexes, an undo log for transactions and a dirty flag for persistence.
 *
 * Rows are IMMUTABLE: `insert` / `update` store a frozen copy and every read returns that frozen object.
 * Mutating a row in place is a bug (it would bypass the indexes, the undo log and persistence) and throws
 * in strict mode — always go through `update`.
 */

export type RowWithId = { id: string };

/** Declarative description of one table: what must be unique and what is looked up often. */
export type TableSchema<T extends RowWithId> = {
  /** Unique constraints: `key` returns the constraint value of a row, or null when the row is exempt. */
  unique?: Record<string, (row: T) => string | null>;
  /** Non-unique lookups (foreign keys): `key` returns the index value of a row, or null to leave it out. */
  indexes?: Record<string, (row: T) => string | null>;
};

/** Thrown when an insert / update would break a primary key or a unique constraint. */
export class MockConstraintError extends Error {
  readonly table: string;
  readonly constraint: string;

  constructor(table: string, constraint: string, value: string) {
    super(`Mock store: unique constraint "${constraint}" of table "${table}" violated by "${value}".`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "MockConstraintError";
    this.table = table;
    this.constraint = constraint;
  }
}

type UndoEntry<T> = { id: string; before: T | undefined };

/** Hooks the owning store installs: transaction state and change notification. */
export type TableHost = {
  /** True while a transaction is open — the table then records undo entries. */
  inTransaction(): boolean;
  /** Called after every successful change (marks the table dirty for persistence). */
  changed(table: string): void;
};

export class Table<T extends RowWithId> {
  readonly name: string;
  private readonly schema: TableSchema<T>;
  private readonly host: TableHost;
  private rows = new Map<string, T>();
  private uniqueMaps = new Map<string, Map<string, string>>();
  private indexMaps = new Map<string, Map<string, Set<string>>>();
  private undo: UndoEntry<T>[] = [];

  constructor(name: string, schema: TableSchema<T>, host: TableHost) {
    this.name = name;
    this.schema = schema;
    this.host = host;
    this.resetIndexes();
  }

  // ───────────────────────────── reads ─────────────────────────────

  /** Number of rows. */
  get size(): number {
    return this.rows.size;
  }

  /** The row with this id, or undefined. */
  get(id: string | null | undefined): T | undefined {
    return id ? this.rows.get(id) : undefined;
  }

  has(id: string | null | undefined): boolean {
    return id ? this.rows.has(id) : false;
  }

  /** Every row, in insertion order (a fresh array — safe to sort). */
  all(): T[] {
    return Array.from(this.rows.values());
  }

  /** Rows matching the predicate, in insertion order. */
  filter(predicate: (row: T) => boolean): T[] {
    const result: T[] = [];
    for (const row of this.rows.values()) {
      if (predicate(row)) result.push(row);
    }
    return result;
  }

  /** First row matching the predicate. */
  find(predicate: (row: T) => boolean): T | undefined {
    for (const row of this.rows.values()) {
      if (predicate(row)) return row;
    }
    return undefined;
  }

  some(predicate: (row: T) => boolean): boolean {
    return this.find(predicate) !== undefined;
  }

  count(predicate?: (row: T) => boolean): number {
    if (!predicate) return this.rows.size;
    let total = 0;
    for (const row of this.rows.values()) {
      if (predicate(row)) total += 1;
    }
    return total;
  }

  /** The row holding `value` in the unique constraint `constraint` (declared in the schema). */
  findUnique(constraint: string, value: string): T | undefined {
    const map = this.uniqueMaps.get(constraint);
    if (!map) throw new Error(`Mock store: table "${this.name}" has no unique constraint "${constraint}".`);
    return this.get(map.get(value));
  }

  /** Rows whose secondary index `index` equals `value`, in insertion order. */
  by(index: string, value: string | null | undefined): T[] {
    const map = this.indexMaps.get(index);
    if (!map) throw new Error(`Mock store: table "${this.name}" has no index "${index}".`);
    if (value === null || value === undefined) return [];
    const ids = map.get(value);
    if (!ids) return [];
    const result: T[] = [];
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row) result.push(row);
    }
    return result;
  }

  // ───────────────────────────── writes ─────────────────────────────

  /** Adds a row. Throws `MockConstraintError` on a duplicate id or a unique violation. */
  insert(row: T): T {
    if (this.rows.has(row.id)) throw new MockConstraintError(this.name, "id", row.id);
    this.assertUnique(row, undefined);
    return this.put(row, undefined);
  }

  /** Adds several rows (all-or-nothing only inside a store transaction). */
  insertMany(rows: readonly T[]): T[] {
    return rows.map((row) => this.insert(row));
  }

  /**
   * Replaces fields of an existing row and returns the new frozen row; throws when the id is unknown.
   * `patch` may be an object or a function of the current row.
   */
  update(id: string, patch: Partial<T> | ((row: T) => Partial<T>)): T {
    const before = this.rows.get(id);
    if (!before) throw new Error(`Mock store: no row "${id}" in table "${this.name}".`);
    const changes = typeof patch === "function" ? patch(before) : patch;
    const next = { ...before, ...changes, id } as T;
    this.assertUnique(next, id);
    return this.put(next, before);
  }

  /** Updates every row matching the predicate; returns the number of rows changed. */
  updateWhere(predicate: (row: T) => boolean, patch: Partial<T> | ((row: T) => Partial<T>)): number {
    const targets = this.filter(predicate);
    for (const row of targets) this.update(row.id, patch);
    return targets.length;
  }

  /** Inserts the row, or replaces the existing row with the same id. */
  upsert(row: T): T {
    const before = this.rows.get(row.id);
    this.assertUnique(row, before ? row.id : undefined);
    return this.put(row, before);
  }

  /** Removes a row; returns it, or undefined when there was none. */
  delete(id: string): T | undefined {
    const before = this.rows.get(id);
    if (!before) return undefined;
    this.record(id, before);
    this.rows.delete(id);
    this.unindex(before);
    this.host.changed(this.name);
    return before;
  }

  /** Removes every row matching the predicate; returns the removed rows. */
  deleteWhere(predicate: (row: T) => boolean): T[] {
    const targets = this.filter(predicate);
    for (const row of targets) this.delete(row.id);
    return targets;
  }

  // ───────────────────────────── snapshot / transactions (used by the store) ─────────────────────────────

  /** Plain copy of the rows for a snapshot (the rows themselves are frozen and shared). */
  dump(): T[] {
    return this.all();
  }

  /** Replaces the whole content (seed, restore, load). Does not record undo entries. */
  load(rows: readonly T[]): void {
    this.rows = new Map();
    this.resetIndexes();
    this.undo = [];
    for (const row of rows) {
      if (this.rows.has(row.id)) throw new MockConstraintError(this.name, "id", row.id);
      this.assertUnique(row, undefined);
      const frozen = Object.freeze({ ...row });
      this.rows.set(frozen.id, frozen);
      this.index(frozen);
    }
    this.host.changed(this.name);
  }

  /** Marks the current end of the undo log (start of a transaction / savepoint). */
  undoMark(): number {
    return this.undo.length;
  }

  /** Reverts every change made after `mark`. */
  rollbackTo(mark: number): void {
    if (this.undo.length <= mark) return;
    for (let index = this.undo.length - 1; index >= mark; index -= 1) {
      const entry = this.undo[index]!;
      const current = this.rows.get(entry.id);
      if (current) {
        this.rows.delete(entry.id);
        this.unindex(current);
      }
      if (entry.before) {
        this.rows.set(entry.id, entry.before);
        this.index(entry.before);
      }
    }
    this.undo.length = mark;
    this.host.changed(this.name);
  }

  /** Drops the undo log (the outermost transaction committed). */
  commit(): void {
    this.undo = [];
  }

  // ───────────────────────────── internals ─────────────────────────────

  private put(row: T, before: T | undefined): T {
    const frozen = Object.freeze({ ...row });
    this.record(frozen.id, before);
    if (before) this.unindex(before);
    this.rows.set(frozen.id, frozen);
    this.index(frozen);
    this.host.changed(this.name);
    return frozen;
  }

  private record(id: string, before: T | undefined): void {
    if (this.host.inTransaction()) this.undo.push({ id, before });
  }

  private assertUnique(row: T, ownId: string | undefined): void {
    const unique = this.schema.unique;
    if (!unique) return;
    for (const constraint of Object.keys(unique)) {
      const value = unique[constraint]!(row);
      if (value === null) continue;
      const holder = this.uniqueMaps.get(constraint)!.get(value);
      if (holder !== undefined && holder !== ownId) throw new MockConstraintError(this.name, constraint, value);
    }
  }

  private index(row: T): void {
    const unique = this.schema.unique;
    if (unique) {
      for (const constraint of Object.keys(unique)) {
        const value = unique[constraint]!(row);
        if (value !== null) this.uniqueMaps.get(constraint)!.set(value, row.id);
      }
    }
    const indexes = this.schema.indexes;
    if (indexes) {
      for (const name of Object.keys(indexes)) {
        const value = indexes[name]!(row);
        if (value === null) continue;
        const map = this.indexMaps.get(name)!;
        let ids = map.get(value);
        if (!ids) {
          ids = new Set();
          map.set(value, ids);
        }
        ids.add(row.id);
      }
    }
  }

  private unindex(row: T): void {
    const unique = this.schema.unique;
    if (unique) {
      for (const constraint of Object.keys(unique)) {
        const value = unique[constraint]!(row);
        if (value === null) continue;
        const map = this.uniqueMaps.get(constraint)!;
        if (map.get(value) === row.id) map.delete(value);
      }
    }
    const indexes = this.schema.indexes;
    if (indexes) {
      for (const name of Object.keys(indexes)) {
        const value = indexes[name]!(row);
        if (value === null) continue;
        const ids = this.indexMaps.get(name)!.get(value);
        if (!ids) continue;
        ids.delete(row.id);
        if (ids.size === 0) this.indexMaps.get(name)!.delete(value);
      }
    }
  }

  private resetIndexes(): void {
    this.uniqueMaps = new Map();
    this.indexMaps = new Map();
    for (const constraint of Object.keys(this.schema.unique ?? {})) this.uniqueMaps.set(constraint, new Map());
    for (const name of Object.keys(this.schema.indexes ?? {})) this.indexMaps.set(name, new Map());
  }
}
