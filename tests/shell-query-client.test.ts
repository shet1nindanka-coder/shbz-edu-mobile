// The app's QueryClient offline rules: a first load that fails without a connection ends in the error
// state (never an endless skeleton), a refetch over cached data keeps waiting, and sign-out removes the
// persisted cache at once.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { QueryObserver, onlineManager, type QueryClient, type QueryObserverResult } from "@tanstack/react-query";

import { ApiError, isNetworkError } from "@/api/errors";
import { PERSIST_STORAGE_KEY } from "@/services/query/persist-policy";
import { createAppQueryClient, removePersistedQueries } from "@/services/query/query-client";

const NETWORK_TEXT = "Нет связи с сервером.";

/** Resolves with the first result that satisfies `done`; rejects after `timeoutMs`. */
function waitFor<T>(
  observer: QueryObserver<T, unknown>,
  done: (result: QueryObserverResult<T, unknown>) => boolean,
  timeoutMs = 2000,
): Promise<QueryObserverResult<T, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      const last = observer.getCurrentResult();
      reject(new Error(`timed out: status=${last.status} fetchStatus=${last.fetchStatus}`));
    }, timeoutMs);
    const check = (result: QueryObserverResult<T, unknown>) => {
      if (!done(result)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };
    const unsubscribe = observer.subscribe(check);
    check(observer.getCurrentResult());
  });
}

/** A client wired to the online manager the way `QueryClientProvider` wires the app's one. */
function mountedClient(): QueryClient {
  const created = createAppQueryClient({ retryDelayMs: 5 });
  created.mount();
  return created;
}

describe("query client offline rules", () => {
  let client: QueryClient | null = null;

  afterEach(() => {
    client?.clear();
    client?.unmount();
    client = null;
    onlineManager.setOnline(true);
  });

  it("ends a first load that failed offline with the network error instead of waiting for the connection", async () => {
    client = mountedClient();
    onlineManager.setOnline(false);
    let calls = 0;
    const observer = new QueryObserver<string, unknown>(client, {
      queryKey: ["studentWork", "getHomework", "hw1"],
      queryFn: () => {
        calls += 1;
        return Promise.reject(ApiError.network(NETWORK_TEXT));
      },
    });
    const failed = await waitFor(observer, (result) => result.status === "error" && result.fetchStatus === "idle" && isNetworkError(result.error));
    assert.equal(failed.data, undefined);
    assert.equal(isNetworkError(failed.error) && failed.error.message, NETWORK_TEXT);
    // The retry was parked, not run: one request only.
    assert.equal(calls, 1);

    // "Retry" while still offline asks again and ends the same way.
    void observer.refetch();
    await waitFor(observer, (result) => result.fetchStatus === "fetching");
    await waitFor(observer, (result) => result.status === "error" && result.fetchStatus === "idle" && isNetworkError(result.error));
    assert.equal(calls, 2);
  });

  it("loads by itself once the connection is back", async () => {
    client = mountedClient();
    onlineManager.setOnline(false);
    let online = false;
    const observer = new QueryObserver<string, unknown>(client, {
      queryKey: ["studentWork", "getLiveLesson"],
      queryFn: () => (online ? Promise.resolve("lesson") : Promise.reject(ApiError.network(NETWORK_TEXT))),
    });
    const stop = observer.subscribe(() => undefined);
    try {
      await waitFor(observer, (result) => result.status === "error" && result.fetchStatus === "idle");
      online = true;
      onlineManager.setOnline(true);
      const loaded = await waitFor(observer, (result) => result.status === "success");
      assert.equal(loaded.data, "lesson");
    } finally {
      stop();
    }
  });

  it("keeps cached data on screen while its refetch waits for the connection", async () => {
    client = mountedClient();
    const key = ["studentStudy", "getTheoryLibrary"];
    client.setQueryData(key, "cached", { updatedAt: Date.now() - 60_000 });
    onlineManager.setOnline(false);
    const observer = new QueryObserver<string, unknown>(client, {
      queryKey: key,
      queryFn: () => Promise.reject(ApiError.network(NETWORK_TEXT)),
    });
    const stop = observer.subscribe(() => undefined);
    try {
      const waiting = await waitFor(observer, (result) => result.fetchStatus === "paused");
      assert.equal(waiting.status, "success");
      assert.equal(waiting.data, "cached");
      // Still waiting a moment later: nothing turned it into an error.
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.deepEqual([observer.getCurrentResult().status, observer.getCurrentResult().fetchStatus], ["success", "paused"]);
      // Let the parked fetch finish before the client is cleared (a fetch cancelled by `clear()` re-arms
      // the library's 24 h garbage-collection timer, which would keep the test process alive).
      onlineManager.setOnline(true);
      await waitFor(observer, (result) => result.fetchStatus === "idle");
      assert.equal(observer.getCurrentResult().data, "cached");
    } finally {
      stop();
    }
  });

  it("does not touch a failure that happens while online", async () => {
    client = mountedClient();
    let calls = 0;
    const observer = new QueryObserver<string, unknown>(client, {
      queryKey: ["content", "listTopics"],
      queryFn: () => {
        calls += 1;
        return Promise.reject(ApiError.network(NETWORK_TEXT));
      },
    });
    await waitFor(observer, (result) => result.status === "error" && result.fetchStatus === "idle");
    // One retry for a failure that a second attempt can fix.
    assert.equal(calls, 2);
  });

  it("removes the persisted cache from storage at once", async () => {
    const stored = new Map<string, string>([[PERSIST_STORAGE_KEY, "{}"], ["other", "kept"]]);
    const storage = {
      getItem: async (key: string) => stored.get(key) ?? null,
      setItem: async (key: string, value: string) => void stored.set(key, value),
      removeItem: async (key: string) => void stored.delete(key),
    };
    await removePersistedQueries(storage);
    assert.deepEqual([...stored.keys()], ["other"]);
    // A storage that throws must not break sign-out.
    await removePersistedQueries({ ...storage, removeItem: () => Promise.reject(new Error("unavailable")) });
  });
});
