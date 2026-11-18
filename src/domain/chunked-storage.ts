/**
 * A large string value kept in an async key-value store (AsyncStorage) as several small rows.
 *
 * Why: Android's AsyncStorage (the legacy SQLite module that Expo Go and `useNextStorage: false` builds
 * use) reads a row through a `CursorWindow` of about 2 MB. A larger row is WRITTEN fine, but every later
 * `getItem` of it rejects (`SQLiteBlobTooBigException` inside `multiGet`), so the value is lost at the next
 * start. Splitting by UTF-8 bytes (Cyrillic text is 2 bytes per character) keeps every row far below that.
 *
 * Layout under `key`:
 * - a value that fits one piece is stored as is (also what older builds wrote, so they still read);
 * - a larger one is stored as pieces `key::chunk:<id>:<i>` and then a header `@@chunked:{id,count,length}`
 *   at `key`. Pieces of a new write get a fresh `id`, so the header switches atomically from a complete old
 *   value to a complete new one: a write torn before its header leaves the old value readable; a header
 *   whose pieces are missing (storage edited from outside) is reported as `ChunkedValueCorruptError`,
 *   never half-read.
 *   The id is `<counter>-<content hash>`: the counter is above every id still known for the key, and the
 *   hash (with the length) names the content. When the live header cannot be read (a storage error; or an
 *   oversized row an older build wrote, which Android can never read back — such a key stays writable on
 *   purpose), the counter may repeat the live one, but then the hash differs unless the content is the same,
 *   in which case overwriting a piece with itself changes nothing. So no write ever alters the pieces of the
 *   value that is live. (No clock, no randomness: the content is the source of uniqueness.)
 * - `key::chunks-pending` lists piece sets that may be left over by an interrupted write; the next write or
 *   remove of the same key deletes them. A set whose id is unknown (the header or this list could not be
 *   read) is listed as `*`: the next write or remove sweeps every piece of the key except the live ones,
 *   when the storage can list its keys (`getAllKeys`, as AsyncStorage can). A pending list that could not
 *   be read is never overwritten as if it were empty unless such a sweep can replace what it held.
 *
 * Reads, writes and removals of one key of one storage object run one after another, in call order (a
 * removal never lands half-way through a write and gets undone by its header).
 *
 * Pure (no React Native imports, no clock, no randomness): the storage is injected. Shared by the
 * query-cache persister (`src/services/query/query-persister.ts`) and the mock store
 * (`src/mock/store/persistence.ts`). Not ported from the site — the site keeps its data in Postgres.
 */

/** The subset of AsyncStorage this needs. Every method may reject. */
export interface ChunkStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** Optional (AsyncStorage has it): lets a write sweep pieces whose id was lost. */
  getAllKeys?(): Promise<readonly string[]>;
}

/** Default size of one stored piece: a quarter of Android's 2 MB cursor window. */
export const DEFAULT_CHUNK_BYTES = 512 * 1024;

const HEADER_PREFIX = "@@chunked:";

type ChunkHeader = { id: string; count: number; length: number };

/** The stored value under `key` is a header whose pieces are missing or do not add up. */
export class ChunkedValueCorruptError extends Error {
  constructor(key: string) {
    super(`Chunked value "${key}" is incomplete or corrupt`);
    this.name = "ChunkedValueCorruptError";
  }
}

export function isChunkedValueCorruptError(error: unknown): error is ChunkedValueCorruptError {
  return error instanceof ChunkedValueCorruptError;
}

/** UTF-8 length of `text` in bytes (what SQLite stores), without allocating an encoded copy. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** Splits `text` into pieces of at most `maxBytes` UTF-8 bytes each, never inside a surrogate pair. */
export function splitByUtf8Bytes(text: string, maxBytes: number): string[] {
  const limit = Math.max(4, Math.floor(maxBytes));
  const pieces: string[] = [];
  let start = 0;
  let bytes = 0;
  let index = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    let width = 1;
    let size: number;
    if (code < 0x80) size = 1;
    else if (code < 0x800) size = 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      size = 4;
      width = 2;
    } else size = 3;
    if (bytes + size > limit && index > start) {
      pieces.push(text.slice(start, index));
      start = index;
      bytes = 0;
    }
    bytes += size;
    index += width;
  }
  if (start < text.length || pieces.length === 0) pieces.push(text.slice(start));
  return pieces;
}

const pieceKey = (key: string, id: string, index: number) => `${key}::chunk:${id}:${index}`;
const pendingKey = (key: string) => `${key}::chunks-pending`;

function parseHeader(raw: string): ChunkHeader | null {
  try {
    const value = JSON.parse(raw.slice(HEADER_PREFIX.length)) as unknown;
    if (typeof value !== "object" || value === null) return null;
    const { id, count, length } = value as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) return null;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) return null;
    return { id, count, length };
  } catch {
    return null;
  }
}

function isPieceSet(value: unknown): value is { id: string; count: number } {
  if (typeof value !== "object" || value === null) return false;
  const { id, count } = value as Record<string, unknown>;
  return typeof id === "string" && id.length > 0 && typeof count === "number" && Number.isSafeInteger(count) && count >= 0 && count < 100_000;
}

/** A piece set whose id is unknown: every piece of the key but the live ones is swept. */
const UNKNOWN_SET = { id: "*", count: 0 } as const;

/**
 * The header currently stored at `key`, null (plain value or nothing), or `UNKNOWN_SET` when the row cannot
 * be read (e.g. an over-sized value an older build wrote in one piece): it is replaced, never read. Never throws.
 */
async function storedHeader(storage: ChunkStorage, key: string): Promise<ChunkHeader | typeof UNKNOWN_SET | null> {
  try {
    const raw = await storage.getItem(key);
    return raw !== null && raw.startsWith(HEADER_PREFIX) ? parseHeader(raw) : null;
  } catch {
    return UNKNOWN_SET;
  }
}

/**
 * Piece sets an interrupted write or remove may have left behind, or null when the list cannot be read
 * (which is not "none": it may name sets nothing else knows of). Never throws.
 */
async function leftoverPieceSets(storage: ChunkStorage, key: string): Promise<{ id: string; count: number }[] | null> {
  let raw: string | null;
  try {
    raw = await storage.getItem(pendingKey(key));
  } catch {
    return null;
  }
  if (raw === null) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter(isPieceSet) : [];
  } catch {
    // Readable but garbage: nothing it names can be trusted, so the pieces are swept instead.
    return [UNKNOWN_SET];
  }
}

/** Removes the listed piece sets but `keepId`; a `*` set sweeps every piece of the key but `keepId`'s. */
async function removePieces(storage: ChunkStorage, key: string, sets: readonly { id: string; count: number }[], keepId: string | null): Promise<void> {
  const done = new Set<string>();
  for (const set of sets) {
    if (set.id === keepId || done.has(set.id)) continue;
    done.add(set.id);
    if (set.id === UNKNOWN_SET.id) {
      await sweepPieces(storage, key, keepId);
      continue;
    }
    for (let index = 0; index < set.count; index += 1) await storage.removeItem(pieceKey(key, set.id, index));
  }
}

async function sweepPieces(storage: ChunkStorage, key: string, keepId: string | null): Promise<void> {
  if (!storage.getAllKeys) return;
  const prefix = `${key}::chunk:`;
  const keep = keepId === null ? null : `${prefix}${keepId}:`;
  for (const stored of await storage.getAllKeys()) {
    if (stored.startsWith(prefix) && (keep === null || !stored.startsWith(keep))) await storage.removeItem(stored);
  }
}

/** 53-bit hash of `text` (cyrb53) in base 36: names the content of a piece set. */
function contentHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * The id of a new piece set for `value`: a counter above every id known for the key, plus the length and
 * a hash of the content. Equal to the id of a live set only when that set holds the same value.
 */
function nextPieceSetId(taken: readonly { id: string }[], value: string): string {
  let highest = 0;
  for (const { id } of taken) {
    const counter = parseInt(id, 36);
    if (Number.isSafeInteger(counter) && counter > highest) highest = counter;
  }
  return `${(highest + 1).toString(36)}-${value.length.toString(36)}-${contentHash(value)}`;
}

/**
 * Operations on one key of one storage run one after another. A write is several round trips (pending
 * list, pieces, header) and so is a removal: interleaved, a removal could land between a write's pieces and
 * its header, and the header written last would bring back the value that was just removed (sign-out
 * removing the query cache while the persister's write of the previous user's cache is still running).
 * Each operation is queued synchronously when it is called, so the order of the calls is the order of the
 * effects.
 */
const keyQueues = new WeakMap<object, Map<string, Promise<void>>>();

function serialized<T>(storage: ChunkStorage, key: string, operation: () => Promise<T>): Promise<T> {
  let queues = keyQueues.get(storage);
  if (!queues) {
    queues = new Map();
    keyQueues.set(storage, queues);
  }
  const previous = queues.get(key);
  const run = previous ? previous.then(operation) : operation();
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, tail);
  const owner = queues;
  void tail.then(() => {
    if (owner.get(key) === tail) owner.delete(key);
  });
  return run;
}

export type ChunkedWriteOptions = {
  /** Maximum UTF-8 bytes of one stored row (default `DEFAULT_CHUNK_BYTES`). */
  chunkBytes?: number;
};

/**
 * Stores `value` under `key`, split into pieces when it is larger than one row may be. Rejects when the
 * storage does; the value stored before stays readable in that case.
 */
export function writeChunkedValue(storage: ChunkStorage, key: string, value: string, options: ChunkedWriteOptions = {}): Promise<void> {
  return serialized(storage, key, () => writeNow(storage, key, value, options));
}

async function writeNow(storage: ChunkStorage, key: string, value: string, options: ChunkedWriteOptions): Promise<void> {
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  // A plain value that looks like a header would be misread: store it as pieces too.
  const pieces = utf8ByteLength(value) <= chunkBytes && !value.startsWith(HEADER_PREFIX) ? null : splitByUtf8Bytes(value, chunkBytes);
  const previous = await storedHeader(storage, key);
  const leftovers = await leftoverPieceSets(storage, key);
  const garbage = withUnknown([...(leftovers ?? []), ...(previous ? [previous] : [])], leftovers === null);
  const header: ChunkHeader | null = pieces ? { id: nextPieceSetId(garbage, value), count: pieces.length, length: value.length } : null;

  // Everything that may be orphaned if this write stops half-way, so the next one can clean it up. A
  // pending list that could not be read is replaced only when the sweep (`*`) can stand in for it.
  const atRisk = [...garbage, ...(header ? [header] : [])];
  const tracked = leftovers !== null || canSweep(storage);
  if (tracked && atRisk.length > 0) await storage.setItem(pendingKey(key), JSON.stringify(atRisk.map(({ id, count }) => ({ id, count }))));

  if (header && pieces) {
    for (let index = 0; index < pieces.length; index += 1) await storage.setItem(pieceKey(key, header.id, index), pieces[index]!);
    // Last: until this lands, readers still get the previous complete value.
    await storage.setItem(key, HEADER_PREFIX + JSON.stringify(header));
  } else {
    await storage.setItem(key, value);
  }

  await removePieces(storage, key, garbage, header?.id ?? null);
  if (tracked && atRisk.length > 0) await finishPending(storage, key, garbage);
}

const canSweep = (storage: ChunkStorage): boolean => typeof storage.getAllKeys === "function";

/** `sets`, plus the unknown set when something could not be read. */
function withUnknown(sets: { id: string; count: number }[], unknown: boolean): { id: string; count: number }[] {
  return unknown && !sets.some((set) => set.id === UNKNOWN_SET.id) ? [...sets, UNKNOWN_SET] : sets;
}

/**
 * The pending list is done with: removed — unless an unknown set could not be swept (no `getAllKeys`), in
 * which case it stays listed for a later write on storage that can.
 */
async function finishPending(storage: ChunkStorage, key: string, garbage: readonly { id: string }[]): Promise<void> {
  if (!canSweep(storage) && garbage.some((set) => set.id === UNKNOWN_SET.id)) {
    await storage.setItem(pendingKey(key), JSON.stringify([UNKNOWN_SET]));
    return;
  }
  await storage.removeItem(pendingKey(key));
}

/**
 * The value stored under `key`, or null when nothing is stored. Rejects with the storage's own error when a
 * read fails (tell that apart from "nothing stored"), and with `ChunkedValueCorruptError` when a header's
 * pieces are missing or do not add up.
 */
export function readChunkedValue(storage: ChunkStorage, key: string): Promise<string | null> {
  return serialized(storage, key, () => readNow(storage, key));
}

async function readNow(storage: ChunkStorage, key: string): Promise<string | null> {
  const raw = await storage.getItem(key);
  if (raw === null) return null;
  if (!raw.startsWith(HEADER_PREFIX)) return raw;
  const header = parseHeader(raw);
  if (!header) throw new ChunkedValueCorruptError(key);
  const parts: string[] = [];
  for (let index = 0; index < header.count; index += 1) {
    const part = await storage.getItem(pieceKey(key, header.id, index));
    if (part === null) throw new ChunkedValueCorruptError(key);
    parts.push(part);
  }
  const value = parts.join("");
  if (value.length !== header.length) throw new ChunkedValueCorruptError(key);
  return value;
}

/** Removes the value under `key` with all its pieces (and leftovers of interrupted writes). */
export function removeChunkedValue(storage: ChunkStorage, key: string): Promise<void> {
  return serialized(storage, key, () => removeNow(storage, key));
}

async function removeNow(storage: ChunkStorage, key: string): Promise<void> {
  const previous = await storedHeader(storage, key);
  const leftovers = await leftoverPieceSets(storage, key);
  const garbage = withUnknown([...(leftovers ?? []), ...(previous ? [previous] : [])], leftovers === null);
  const tracked = leftovers !== null || canSweep(storage);
  if (tracked && garbage.length > 0) await storage.setItem(pendingKey(key), JSON.stringify(garbage.map(({ id, count }) => ({ id, count }))));
  await storage.removeItem(key);
  await removePieces(storage, key, garbage, null);
  if (tracked && garbage.length > 0) await finishPending(storage, key, garbage);
}

/**
 * `storage` seen through the chunked layout: `getItem` / `setItem` / `removeItem` of a key read, write and
 * remove the whole chunked value. For libraries that take an AsyncStorage-like object (the query persister).
 */
export function chunkedStorage(storage: ChunkStorage, options: ChunkedWriteOptions = {}): ChunkStorage {
  return {
    getItem: (key) => readChunkedValue(storage, key),
    setItem: (key, value) => writeChunkedValue(storage, key, value, options),
    removeItem: (key) => removeChunkedValue(storage, key),
  };
}
