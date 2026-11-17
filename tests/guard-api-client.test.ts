// The session guard over every shape a member method can have: async resolve / reject, a non-Promise
// thenable, a synchronous return and a synchronous throw (`planner.getHandoutUrl` checks the session before
// it builds the URL). 90-addendum-1 A.3 rules 1 – 2 apply to all of them.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_MEMBERS, type ApiClient } from "@/api/client";
import { ApiError } from "@/api/errors";
import { createTestMock } from "@/mock/testing";
import { guardApiClient } from "@/services/session/guard-api-client";

const expired = () => new ApiError({ code: "sessionExpired", status: 401, message: "Сессия истекла. Войдите заново." });
const refused = () => new ApiError({ code: "unauthorized", status: 403, message: "Недостаточно прав." });
const other = () => new ApiError({ code: "lessonNotFound", status: 404, message: "Урок не найден." });

type Shape = (error: () => unknown) => (...args: unknown[]) => unknown;

/** Every way a method may answer, keyed by name. Each factory gets the failure it should produce. */
const SHAPES: Record<string, Shape> = {
  asyncReject: (error) => async () => {
    throw error();
  },
  syncThrow: (error) => () => {
    throw error();
  },
  promiseReject: (error) => () => Promise.reject(error()),
  thenableReject: (error) => () => ({
    then(_resolve: unknown, reject?: (reason: unknown) => void) {
      reject?.(error());
      return undefined;
    },
  }),
};

function fakeClient(error: () => unknown): Record<string, Record<string, (...args: unknown[]) => unknown>> {
  return Object.fromEntries(
    API_MEMBERS.map((member) => [
      member,
      {
        ...Object.fromEntries(Object.entries(SHAPES).map(([name, shape]) => [name, shape(error)])),
        syncValue: () => `${member}:value`,
        asyncValue: async () => `${member}:value`,
      },
    ]),
  );
}

function guarded(error: () => unknown) {
  const seen = { expired: 0, refused: 0 };
  const client = guardApiClient(fakeClient(error) as unknown as ApiClient, {
    onSessionExpired: () => {
      seen.expired += 1;
    },
    onRoleRefused: () => {
      seen.refused += 1;
    },
  }) as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;
  return { client, seen };
}

/** Calls a method whatever its shape and returns how it failed (the original reason, unchanged). */
async function failureOf(call: () => unknown): Promise<unknown> {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error("the call did not fail");
}

describe("guardApiClient: every method shape", () => {
  for (const shape of Object.keys(SHAPES)) {
    it(`${shape}: sessionExpired signs out on every member and the caller still gets the same error`, async () => {
      const { client, seen } = guarded(expired);
      for (const member of API_MEMBERS) {
        const error = await failureOf(() => client[member]![shape]!());
        assert.ok(error instanceof ApiError && error.code === "sessionExpired", `${member}.${shape}`);
      }
      // Observers run on a later microtask for the async shapes.
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(seen.expired, API_MEMBERS.length);
      assert.equal(seen.refused, 0);
    });

    it(`${shape}: a role refusal re-reads the user, other errors are left to the screen`, async () => {
      const role = guarded(refused);
      for (const member of API_MEMBERS) await failureOf(() => role.client[member]![shape]!());
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(role.seen, { expired: 0, refused: API_MEMBERS.length });

      const plain = guarded(other);
      for (const member of API_MEMBERS) await failureOf(() => plain.client[member]![shape]!());
      const bug = guarded(() => new TypeError("bug"));
      for (const member of API_MEMBERS) assert.ok((await failureOf(() => bug.client[member]![shape]!())) instanceof TypeError);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(plain.seen, { expired: 0, refused: 0 });
      assert.deepEqual(bug.seen, { expired: 0, refused: 0 });
    });
  }

  it("a synchronous throw stays synchronous (no promise in its place)", () => {
    const { client, seen } = guarded(expired);
    assert.throws(() => client.planner!.syncThrow!(), (error: unknown) => error instanceof ApiError && error.code === "sessionExpired");
    assert.equal(seen.expired, 1);
  });

  it("values pass through unchanged, synchronous ones synchronously", async () => {
    const { client, seen } = guarded(expired);
    for (const member of API_MEMBERS) {
      assert.equal(client[member]!.syncValue!(), `${member}:value`);
      assert.equal(await client[member]!.asyncValue!(), `${member}:value`);
    }
    assert.deepEqual(seen, { expired: 0, refused: 0 });
  });
});

describe("guardApiClient: the real synchronous methods of the mock client", () => {
  it("planner.getHandoutUrl with an expired session signs the user out", () => {
    const mock = createTestMock();
    const seen: string[] = [];
    const api = guardApiClient(mock.api, { onSessionExpired: (error) => seen.push(error.code) });
    // No token installed: the session check of the handout throws 401 sessionExpired synchronously.
    assert.throws(
      () => api.planner.getHandoutUrl("les_g1", { format: "pdf" }),
      (error: unknown) => error instanceof ApiError && error.code === "sessionExpired",
    );
    assert.deepEqual(seen, ["sessionExpired"]);
  });

  it("planner.getHandoutUrl refused for the role re-reads the user", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const expiredSeen: string[] = [];
    const roleSeen: string[] = [];
    const api = guardApiClient(mock.api, {
      onSessionExpired: (error) => expiredSeen.push(error.code),
      onRoleRefused: (error) => roleSeen.push(error.code),
    });
    assert.throws(() => api.planner.getHandoutUrl("les_g1", { format: "pdf" }), (error: unknown) => error instanceof ApiError && error.status === 403);
    assert.deepEqual(expiredSeen, []);
    assert.equal(roleSeen.length, 1);
  });

  it("shell.subscribeRealtime still returns its unsubscribe function", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const api = guardApiClient(mock.api, { onSessionExpired: () => undefined });
    const unsubscribe = api.shell.subscribeRealtime(() => undefined);
    assert.equal(typeof unsubscribe, "function");
    unsubscribe();
  });
});
