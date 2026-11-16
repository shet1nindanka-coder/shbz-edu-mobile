/**
 * Test support for the mock backend: a client on a manual clock with zero latency and in-memory storage.
 * Used by `tests/mock-*.test.ts` — including the tests of the members other owners implement.
 *
 * ```ts
 * const mock = createTestMock();
 * await mock.signIn("teacher@example.com");
 * const { students } = await mock.api.teacherStudents.listStudents();
 * mock.clock.advance(8000);                       // deferred jobs run inside the next call
 * ```
 */
import type { AuthenticatedUser, Locale } from "@/api/types";

import { createMockApiClient, type MockApiClient, type MockApiClientOptions } from "./MockApiClient";
import { createManualClock, type ManualMockClock } from "./clock";
import type { MockContext } from "./context";
import { DEMO_PASSWORDS } from "./fixtures/ids";
import { createMemoryStorage } from "./store/persistence";
import type { MockStore } from "./store/store";

/** Seed moment of the test dataset: Monday 16 November 2026, 12:00 Moscow time. */
export const TEST_T0 = "2026-11-16T09:00:00.000Z";

export type TestMock = {
  api: MockApiClient;
  clock: ManualMockClock;
  storage: ReturnType<typeof createMemoryStorage>;
  /** The backend context: `ctx.store`, `ctx.q`, `ctx.jobs`, … for arranging and asserting. */
  ctx: MockContext;
  store: MockStore;
  /** Signs in with a demo login (the password is derived from the role when omitted) and installs the token. */
  signIn(login: string, password?: string): Promise<AuthenticatedUser>;
  /** Clears the session token (no server call). */
  signOut(): void;
  /** Switches the request language for the following calls. */
  setLocale(locale: Locale): void;
  /** Switches the simulated connectivity for the following calls. */
  setOnline(online: boolean): void;
};

/** Demo password of a fixture login: teachers `teacher123`, the developer `developer123`, everyone else `student123`. */
export function demoPasswordFor(login: string): string {
  if (login.startsWith("dev@")) return DEMO_PASSWORDS.developer;
  if (login.startsWith("teacher")) return DEMO_PASSWORDS.teacher;
  return DEMO_PASSWORDS.student;
}

export function createTestMock(
  options: Omit<MockApiClientOptions, "clock" | "now" | "getLocale" | "isOnline" | "storage"> & {
    /** Storage to reuse (e.g. the `storage` of an earlier `TestMock`, to simulate an app restart). */
    storage?: ReturnType<typeof createMemoryStorage>;
    /** Start of the manual clock (default `TEST_T0`). */
    start?: string | number;
    /** An existing clock, e.g. to open a second client on the same storage later in time. */
    clock?: ManualMockClock;
    locale?: Locale;
  } = {},
): TestMock {
  const { start, clock: givenClock, locale: initialLocale, storage: givenStorage, ...clientOptions } = options;
  const clock = givenClock ?? createManualClock(start ?? TEST_T0);
  const storage = givenStorage ?? createMemoryStorage();
  let locale: Locale = initialLocale ?? "ru";
  let online = true;

  const api = createMockApiClient({
    latency: 0,
    saveDebounceMs: 0,
    ...clientOptions,
    storage,
    clock,
    getLocale: () => locale,
    isOnline: () => online,
  });

  return {
    api,
    clock,
    storage,
    ctx: api.backend,
    store: api.backend.store,
    async signIn(login, password) {
      const result = await api.shell.login({ login, password: password ?? demoPasswordFor(login) });
      api.setSessionToken(result.token);
      return result.user;
    },
    signOut() {
      api.setSessionToken(null);
    },
    setLocale(next) {
      locale = next;
    },
    setOnline(next) {
      online = next;
    },
  };
}
