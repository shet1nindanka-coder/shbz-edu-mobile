// Storage limits of Android's legacy AsyncStorage (the SQLite module Expo Go and `useNextStorage: false`
// builds use): a row larger than the 2 MB cursor window is written fine but every later read of it
// rejects (`AsyncStorageModule.multiGet` → `cursor.getString` → SQLiteBlobTooBigException), and the whole
// database is capped at 6 MB. The fake below enforces both, so these tests fail on a single-row layout.
//
// Covered: the chunked value layout (`src/domain/chunked-storage.ts`), the query-cache persister
// (`src/services/query/query-persister.ts`) and the mock store persistence (`src/mock/store/persistence.ts`,
// `MockApiClient` load / re-seed paths).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

import {
  ChunkedValueCorruptError,
  DEFAULT_CHUNK_BYTES,
  readChunkedValue,
  removeChunkedValue,
  splitByUtf8Bytes,
  utf8ByteLength,
  writeChunkedValue,
} from "@/domain/chunked-storage";
import { DAY_MS, HOUR_MS } from "@/domain/moscow-time";
import { createMemoryStorage } from "@/mock/store/persistence";
import { MOCK_STORE_VERSION } from "@/mock/store/schema";
import { createTestMock } from "@/mock/testing";
import { PERSIST_MAX_BYTES, PERSIST_MAX_QUERY_BYTES, PERSIST_STORAGE_KEY } from "@/services/query/persist-policy";
import { createQueryPersister, trimPersistedClient } from "@/services/query/query-persister";
import { removePersistedQueries } from "@/services/query/query-client";

const CURSOR_WINDOW_BYTES = 2 * 1024 * 1024;
const DATABASE_BYTES = 6 * 1024 * 1024;

const bytes = utf8ByteLength;

/** A `createMemoryStorage` with the read limit of one row and the size cap of the whole database. */
function androidStorage(options: { databaseBytes?: number } = {}) {
  const memory = createMemoryStorage();
  const databaseBytes = options.databaseBytes ?? DATABASE_BYTES;
  const state = { failReads: false, failWritesAfter: Infinity, reads: 0 };
  const total = () => [...memory.data].reduce((sum, [key, value]) => sum + bytes(key) + bytes(value), 0);
  const storage = {
    data: memory.data,
    getItem: async (key: string) => {
      state.reads += 1;
      if (state.failReads) throw new Error("Failed to get a database");
      const value = memory.data.get(key) ?? null;
      if (value !== null && bytes(value) > CURSOR_WINDOW_BYTES) {
        throw new Error("Row too big to fit into CursorWindow requiredPos=0, totalRows=1");
      }
      return value;
    },
    setItem: async (key: string, value: string) => {
      if (state.failWritesAfter <= 0) throw new Error("App killed");
      state.failWritesAfter -= 1;
      const previous = memory.data.get(key);
      memory.data.set(key, value);
      if (total() > databaseBytes) {
        if (previous === undefined) memory.data.delete(key);
        else memory.data.set(key, previous);
        throw new Error("database or disk is full (code 13 SQLITE_FULL)");
      }
    },
    removeItem: async (key: string) => {
      memory.data.delete(key);
    },
  };
  return { storage, state };
}

/** Cyrillic text of at least `size` UTF-8 bytes (2 bytes per letter), with an emoji to cross pieces. */
function cyrillic(size: number, seed = 0): string {
  const unit = `Решите уравнение ${seed} 😀 `;
  return unit.repeat(Math.ceil(size / bytes(unit)));
}

describe("chunked values", () => {
  it("measures and splits by UTF-8 bytes without cutting a surrogate pair", () => {
    assert.equal(utf8ByteLength("aЖ€😀"), 1 + 2 + 3 + 4);
    assert.equal(utf8ByteLength("x".repeat(10)), 10);
    const text = "😀".repeat(10) + "ЖЖЖ";
    const pieces = splitByUtf8Bytes(text, 9);
    assert.equal(pieces.join(""), text);
    for (const piece of pieces) {
      assert.ok(bytes(piece) <= 9);
      assert.ok(!/[\uD800-\uDBFF]$/.test(piece), "a piece never ends inside a surrogate pair");
    }
    assert.deepEqual(splitByUtf8Bytes("", 10), [""]);
  });

  it("keeps a value larger than the cursor window readable, every row small", async () => {
    const { storage } = androidStorage();
    const value = cyrillic(3 * 1024 * 1024);
    // The single-row layout loses it: written fine, never read back.
    await storage.setItem("plain", value);
    await assert.rejects(storage.getItem("plain"), /CursorWindow/);
    await storage.removeItem("plain");

    await writeChunkedValue(storage, "big", value);
    assert.equal(await readChunkedValue(storage, "big"), value);
    for (const stored of storage.data.values()) assert.ok(bytes(stored) <= DEFAULT_CHUNK_BYTES);
    assert.ok(storage.data.size > 4);

    // Shrinking to one row removes the pieces; removing removes everything.
    await writeChunkedValue(storage, "big", "small");
    assert.deepEqual([...storage.data.keys()], ["big"]);
    assert.equal(await readChunkedValue(storage, "big"), "small");
    await writeChunkedValue(storage, "big", value);
    await removeChunkedValue(storage, "big");
    assert.equal(storage.data.size, 0);
    assert.equal(await readChunkedValue(storage, "big"), null);
  });

  it("reads a value an older build stored in one row, and replaces an unreadable one", async () => {
    const { storage } = androidStorage();
    await storage.setItem("legacy", '{"buster":"x"}');
    assert.equal(await readChunkedValue(storage, "legacy"), '{"buster":"x"}');
    await storage.setItem("legacy", "x".repeat(CURSOR_WINDOW_BYTES + 1));
    await writeChunkedValue(storage, "legacy", "y".repeat(CURSOR_WINDOW_BYTES + 1));
    assert.equal(await readChunkedValue(storage, "legacy"), "y".repeat(CURSOR_WINDOW_BYTES + 1));
  });

  it("never half-reads a torn write and cleans its pieces up with the next one", async () => {
    const { storage, state } = androidStorage();
    const before = cyrillic(1.5 * 1024 * 1024, 1);
    await writeChunkedValue(storage, "key", before);
    const keysBefore = new Set(storage.data.keys());

    // The app dies after two pieces of the next value: the previous value is still what is read.
    state.failWritesAfter = 3;
    await assert.rejects(writeChunkedValue(storage, "key", cyrillic(1.5 * 1024 * 1024, 2)), /App killed/);
    assert.equal(await readChunkedValue(storage, "key"), before);
    assert.ok(storage.data.size > keysBefore.size, "orphan pieces were left");

    state.failWritesAfter = Infinity;
    const after = cyrillic(1.2 * 1024 * 1024, 3);
    await writeChunkedValue(storage, "key", after);
    assert.equal(await readChunkedValue(storage, "key"), after);
    const expectedPieces = splitByUtf8Bytes(after, DEFAULT_CHUNK_BYTES).length;
    assert.equal(storage.data.size, expectedPieces + 1, "only the live header and its pieces remain");
  });

  it("reports missing pieces as corrupt and a failed read as a failure, never as nothing stored", async () => {
    const { storage, state } = androidStorage();
    await writeChunkedValue(storage, "key", cyrillic(1.2 * 1024 * 1024));
    const piece = [...storage.data.keys()].find((key) => key.includes("::chunk:"))!;
    storage.data.delete(piece);
    await assert.rejects(readChunkedValue(storage, "key"), ChunkedValueCorruptError);
    state.failReads = true;
    await assert.rejects(readChunkedValue(storage, "key"), /Failed to get a database/);
  });
});

/** A dehydrated query of about `size` bytes. */
function query(name: string, size: number, updatedAt: number): PersistedClient["clientState"]["queries"][number] {
  return {
    queryKey: ["content", "getTopic", name],
    queryHash: JSON.stringify(["content", "getTopic", name]),
    dehydratedAt: updatedAt,
    state: {
      data: { title: name, body: cyrillic(size) },
      dataUpdateCount: 1,
      dataUpdatedAt: updatedAt,
      error: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      fetchMeta: null,
      isInvalidated: false,
      status: "success",
      fetchStatus: "idle",
    },
  };
}

function persistedClient(queries: PersistedClient["clientState"]["queries"]): PersistedClient {
  return { buster: "shbz-query-v1", timestamp: Date.now(), clientState: { mutations: [], queries } };
}

describe("query cache persister", () => {
  // Four textbook topics opened by a teacher: 4 × ~600 KB — the measured case of the bug report.
  const topics = () => [1, 2, 3, 4].map((index) => query(`top_${index}`, 600 * 1024, 1000 + index));

  it("loses the cache on Android with the stock single-key persister (the bug)", async () => {
    const { storage } = androidStorage();
    const stock = createAsyncStoragePersister({ storage, key: PERSIST_STORAGE_KEY, throttleTime: 0 });
    await stock.persistClient(persistedClient(topics()));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(bytes(storage.data.get(PERSIST_STORAGE_KEY)!) > CURSOR_WINDOW_BYTES);
    await assert.rejects(async () => stock.restoreClient(), /CursorWindow/);
  });

  it("stores a large cache in small rows within the budget, newest queries first", async () => {
    const { storage } = androidStorage();
    const persister = createQueryPersister(storage, { throttleTime: 0 });
    const huge = query("huge", PERSIST_MAX_QUERY_BYTES + 1024, 9999);
    await persister.persistClient(persistedClient([...topics(), huge]));
    await new Promise((resolve) => setTimeout(resolve, 10));

    for (const value of storage.data.values()) assert.ok(bytes(value) <= DEFAULT_CHUNK_BYTES);
    const total = [...storage.data.values()].reduce((sum, value) => sum + bytes(value), 0);
    assert.ok(total <= PERSIST_MAX_BYTES + 1024, `stored ${total} bytes`);

    const restored = await persister.restoreClient();
    assert.ok(restored);
    const names = restored.clientState.queries.map((entry) => entry.queryKey[2]);
    // The over-sized one is never written; the oldest go first until the rest fits.
    assert.ok(!names.includes("huge"));
    assert.deepEqual(names, ["top_3", "top_4"]);
  });

  it("leaves a cache within the budget untouched", () => {
    const client = persistedClient([query("a", 1000, 1), query("b", 1000, 2)]);
    assert.equal(trimPersistedClient(client), client);
  });

  it("restores nothing (without throwing) when the stored cache cannot be read", async () => {
    const { storage, state } = androidStorage();
    const persister = createQueryPersister(storage, { throttleTime: 0 });
    await persister.persistClient(persistedClient(topics()));
    await new Promise((resolve) => setTimeout(resolve, 10));
    state.failReads = true;
    assert.equal(await persister.restoreClient(), undefined);
    state.failReads = false;
    // A piece lost from outside: also nothing restored, and the next write replaces it.
    storage.data.delete([...storage.data.keys()].find((key) => key.includes("::chunk:"))!);
    assert.equal(await persister.restoreClient(), undefined);
    await persister.persistClient(persistedClient([query("fresh", 100, 1)]));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal((await persister.restoreClient())!.clientState.queries.length, 1);
  });

  it("a removal issued while a large write is still running is not undone by that write's header", async () => {
    // Every storage call is a native round trip: it resolves on a later macrotask, like AsyncStorage.
    const memory = createMemoryStorage();
    const slow = {
      getItem: (key: string) => new Promise<string | null>((resolve) => setTimeout(() => resolve(memory.data.get(key) ?? null), 1)),
      setItem: (key: string, value: string) => new Promise<void>((resolve) => setTimeout(() => resolve(void memory.data.set(key, value)), 1)),
      removeItem: (key: string) => new Promise<void>((resolve) => setTimeout(() => resolve(void memory.data.delete(key)), 1)),
    };
    const persister = createQueryPersister(slow, { throttleTime: 0 });
    // Sign-out: the persister's immediate write of the previous user's cache starts, the removal one tick later.
    const writing = persister.persistClient(persistedClient(topics()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await removePersistedQueries(slow);
    await writing;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual([...memory.data.keys()], []);
    assert.equal(await persister.restoreClient(), undefined);
  });

  it("sign-out removes every piece of the persisted cache", async () => {
    const { storage } = androidStorage();
    await storage.setItem("other", "kept");
    const persister = createQueryPersister(storage, { throttleTime: 0 });
    await persister.persistClient(persistedClient(topics()));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(storage.data.size > 2);
    await removePersistedQueries(storage);
    assert.deepEqual([...storage.data.keys()], ["other"]);
  });
});

describe("mock store on Android storage", () => {
  const numbersKey = `shbz-mock:v${MOCK_STORE_VERSION}:t:numbers`;

  /** Grows the numbers table past the cursor window, like a few maximum-size textbook imports. */
  function growNumbers(mock: ReturnType<typeof createTestMock>): void {
    const template = mock.store.numbers.all()[0]!;
    for (let index = 0; index < 700; index += 1) {
      mock.store.numbers.insert({ ...template, id: `num_big_${index}`, number: String(900000 + index), conditionLatex: cyrillic(4000, index) });
    }
  }

  it("keeps a numbers table larger than 2 MB across a restart instead of re-seeding", async () => {
    const { storage } = androidStorage({ databaseBytes: 64 * 1024 * 1024 });
    const replaced: string[] = [];
    const first = createTestMock({ storage, onDatasetReplaced: () => replaced.push("first") });
    await first.signIn("dev@example.com");
    growNumbers(first);
    await first.api.flush();
    const tableBytes = [...storage.data].filter(([key]) => key.startsWith(numbersKey)).reduce((sum, [, value]) => sum + bytes(value), 0);
    assert.ok(tableBytes > CURSOR_WINDOW_BYTES, `numbers table is ${tableBytes} bytes`);
    for (const value of storage.data.values()) assert.ok(bytes(value) <= DEFAULT_CHUNK_BYTES);

    first.clock.advance(HOUR_MS);
    const second = createTestMock({ storage, clock: first.clock, onDatasetReplaced: () => replaced.push("second") });
    await second.api.ready();
    assert.ok(second.store.numbers.has("num_big_699"));
    assert.equal(second.api.controls.datasetInfo().storageReadFailed, false);
    // Only the very first start (nothing stored) counted as a replaced dataset.
    assert.deepEqual(replaced, ["first"]);
  });

  it("never re-seeds over a dataset it could not read, and resumes saving after a demo reset", async () => {
    const { storage, state } = androidStorage();
    const first = createTestMock({ storage });
    await first.signIn("ilya@example.com");
    await first.api.shell.updateProfile({ name: "Сохранённое имя" });
    await first.api.flush();
    const stored = new Map(storage.data);

    state.failReads = true;
    let replaced = 0;
    const second = createTestMock({ storage, clock: first.clock, onDatasetReplaced: () => (replaced += 1) });
    await second.api.ready();
    assert.equal(second.api.controls.datasetInfo().storageReadFailed, true);
    state.failReads = false;
    // Works on fixtures in memory; nothing is written over the stored dataset.
    await second.signIn("maria@example.com");
    await second.api.shell.updateProfile({ name: "Не сохранится" });
    await second.api.flush();
    assert.deepEqual(new Map(storage.data), stored);
    assert.equal(replaced, 0);
    // Its ids stay clear of the stored dataset's (device-side file copies are keyed by id).
    assert.ok(second.store.meta.idCounter > first.store.meta.idCounter + 1000);

    // The next start reads the dataset again.
    const third = createTestMock({ storage, clock: first.clock });
    await third.api.ready();
    assert.equal(third.store.users.get("usr_ilya")!.name, "Сохранённое имя");

    // An explicit reset in the failed run replaces what is stored.
    await second.api.controls.resetDemoData();
    assert.equal(second.api.controls.datasetInfo().storageReadFailed, false);
    // (Its save first reloads the stored dataset — written after this run's failed load — and replays the
    // reset on it, so the cleanup may run twice; it is idempotent.)
    assert.ok(replaced >= 1);
    const fourth = createTestMock({ storage, clock: first.clock });
    await fourth.api.ready();
    assert.equal(fourth.store.users.get("usr_ilya")!.name, "Илья Смирнов");
  });

  it("re-seeds once over a table an older build stored as one over-sized row, then saves normally", async () => {
    const { storage } = androidStorage({ databaseBytes: 64 * 1024 * 1024 });
    const first = createTestMock({ storage });
    await first.signIn("maria@example.com");
    await first.api.flush();
    const counter = first.store.meta.idCounter;
    // What pre-chunking builds wrote: the whole table in one row larger than the cursor window.
    const manifest = JSON.parse(storage.data.get(`shbz-mock:v${MOCK_STORE_VERSION}:manifest`)!) as { saveSeq: number };
    storage.data.set(numbersKey, JSON.stringify({ seq: manifest.saveSeq, rows: [], padding: cyrillic(2.5 * 1024 * 1024) }));

    let replaced = 0;
    const second = createTestMock({ storage, clock: first.clock, onDatasetReplaced: () => (replaced += 1) });
    await second.api.ready();
    assert.equal(second.api.controls.datasetInfo().storageReadFailed, false);
    assert.equal(replaced, 1);
    assert.ok(second.store.meta.idCounter >= counter);
    await second.signIn("maria@example.com");
    await second.api.shell.updateProfile({ name: "Новое имя" });
    await second.api.flush();
    for (const value of storage.data.values()) assert.ok(bytes(value) <= DEFAULT_CHUNK_BYTES);

    const third = createTestMock({ storage, clock: first.clock });
    await third.api.ready();
    assert.equal(third.api.controls.datasetInfo().storageReadFailed, false);
    assert.equal(third.store.users.get("usr_maria")!.name, "Новое имя");
  });

  it("still suspends saves when a table read fails differently between attempts (transient)", async () => {
    const memory = createMemoryStorage();
    const first = createTestMock({ storage: memory });
    await first.signIn("ilya@example.com");
    await first.api.flush();
    let failures = 0;
    const flaky = {
      getItem: async (key: string) => {
        if (key === numbersKey) {
          failures += 1;
          throw new Error(`I/O error #${failures}`);
        }
        return memory.getItem(key);
      },
      setItem: memory.setItem,
      removeItem: memory.removeItem,
      data: memory.data,
    };
    const second = createTestMock({ storage: flaky, clock: first.clock });
    await second.api.ready();
    assert.equal(second.api.controls.datasetInfo().storageReadFailed, true);
  });

  it("keeps the id counter after a torn save, and cleans device files on every re-seed path", async () => {
    const first = createTestMock();
    await first.signIn("ilya@example.com");
    await first.signIn("maria@example.com");
    await first.signIn("teacher@example.com");
    await first.api.flush();
    const counter = first.store.meta.idCounter;
    const ids = first.store.sessions.all().map((session) => session.id);
    assert.ok(counter > 0);

    // A save torn before its manifest: one table is newer than the manifest.
    const manifest = JSON.parse(first.storage.data.get(`shbz-mock:v${MOCK_STORE_VERSION}:manifest`)!) as { saveSeq: number };
    const usersKey = `shbz-mock:v${MOCK_STORE_VERSION}:t:users`;
    const users = JSON.parse(first.storage.data.get(usersKey)!) as { seq: number; rows: unknown[] };
    first.storage.data.set(usersKey, JSON.stringify({ ...users, seq: manifest.saveSeq + 1 }));

    let replaced = 0;
    const second = createTestMock({ storage: first.storage, clock: first.clock, onDatasetReplaced: () => (replaced += 1) });
    await second.api.ready();
    assert.equal(replaced, 1);
    assert.ok(second.store.meta.idCounter >= counter);
    await second.signIn("ilya@example.com");
    const fresh = second.store.sessions.all().map((session) => session.id);
    assert.ok(fresh.every((id) => !ids.includes(id)), `${fresh.join()} reuses one of ${ids.join()}`);
    await second.api.flush();

    // The automatic 24-hour re-seed and a fixtures-revision change clean the device files too.
    second.clock.advance(DAY_MS + HOUR_MS);
    const third = createTestMock({ storage: second.storage, clock: second.clock, onDatasetReplaced: () => (replaced += 1) });
    await third.api.ready();
    assert.equal(third.api.controls.datasetInfo().generation, 2);
    assert.equal(replaced, 2);
    third.store.patchMeta({ fixtures: 0 });
    await third.api.flush();
    const fourth = createTestMock({ storage: third.storage, clock: third.clock, onDatasetReplaced: () => (replaced += 1) });
    await fourth.api.ready();
    assert.equal(replaced, 3);
    // A demo reset as well (the Demo data screen also cleans on its own).
    await fourth.api.controls.resetDemoData();
    assert.equal(replaced, 4);
  });
});
