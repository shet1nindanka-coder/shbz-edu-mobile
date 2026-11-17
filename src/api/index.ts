/**
 * Entry point of the API layer: the contract (`ApiClient`, types, `ApiError`), the React binding
 * (`ApiProvider`, `useApi`) and the query-key helper (`qk`).
 *
 * This module never imports an implementation: the composition root builds a client (`MockApiClient` today,
 * `HttpApiClient` later) and hands it to `ApiProvider`. Pure-logic code and tests that must not load React
 * import from `@/api/types`, `@/api/client` or `@/api/errors` directly.
 */
import { createContext, createElement, useContext } from "react";
import type { ReactElement, ReactNode } from "react";

import type { ApiClient, ApiMember, ApiMethodName } from "./client";

export * from "./types";
export * from "./client";
export {
  ApiError,
  errorText,
  hasErrorCode,
  isApiError,
  isNetworkError,
  isNotFoundError,
  isRateLimited,
  isRoleError,
  isSessionExpired,
  retryAfterOf,
} from "./errors";
export type { AnyApiErrorCode, ApiErrorInit } from "./errors";

// ───────────────────────────── React binding ─────────────────────────────

const ApiContext = createContext<ApiClient | null>(null);
ApiContext.displayName = "ApiContext";

export type ApiProviderProps = {
  /** A ready client; the provider does not create, configure or dispose it. */
  client: ApiClient;
  children?: ReactNode;
};

/** Makes `client` available to `useApi()` below it. Mount once, in the composition root. */
export function ApiProvider({ client, children }: ApiProviderProps): ReactElement {
  return createElement(ApiContext.Provider, { value: client }, children);
}

/** The `ApiClient` of the nearest `ApiProvider`. Screens wrap its calls in TanStack Query. */
export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (client === null) {
    throw new Error("useApi() must be called inside <ApiProvider>.");
  }
  return client;
}

// ───────────────────────────── query keys ─────────────────────────────

/** Parameters of one client method. */
export type ApiMethodParams<M extends ApiMember, K extends ApiMethodName<M>> = ApiClient[M][K] extends (
  ...args: infer A
) => unknown
  ? A
  : never;

/** A prefix of a method's arguments (every element optional), so a key can address one call or a family of calls. */
export type ApiQueryKeyArgs<M extends ApiMember, K extends ApiMethodName<M>> = Partial<ApiMethodParams<M, K>> &
  readonly unknown[];

/** `[member]`, `[member, method]` or `[member, method, ...args]`. */
export type ApiQueryKey = readonly [ApiMember, ...unknown[]];

/**
 * Query key of an API call: `[member, method, ...args]` (CLAUDE.md "Data access").
 *
 * - `qk("studentWork", "getHomework", assignmentId)` — the key of one query.
 * - `qk("studentWork", "getHomework")` — prefix of every `getHomework` query (for `invalidateQueries`).
 * - `qk("studentWork")` — prefix of every query of the member.
 *
 * Arguments are type-checked against the method's parameters. Trailing `undefined` arguments are dropped, so
 * an omitted optional argument and an explicit `undefined` produce the same key. Pass only serialisable
 * arguments (never an `AbortSignal`, a listener or upload options).
 */
export function qk<M extends ApiMember>(member: M): readonly [M];
export function qk<M extends ApiMember, K extends ApiMethodName<M>>(
  member: M,
  method: K,
  ...args: ApiQueryKeyArgs<M, K>
): readonly [M, K, ...unknown[]];
export function qk(member: ApiMember, method?: string, ...args: readonly unknown[]): ApiQueryKey {
  if (method === undefined) return [member];
  let end = args.length;
  while (end > 0 && args[end - 1] === undefined) end -= 1;
  return [member, method, ...args.slice(0, end)];
}
