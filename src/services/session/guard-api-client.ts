/**
 * Central reaction to the two errors that concern the session rather than the screen that got them
 * (docs/spec/90-addendum-1.md A.3 rules 1 – 2):
 *
 * - `sessionExpired` (only ever sent with 401) → the session is gone: the owner signs the user out and
 *   shows `message` on the login screen. `401 invalidCredentials` of the login call is NOT this code.
 * - `403 unauthorized` / `developerRightsRequired` → the role may have changed: the owner re-reads `GET /me`.
 *
 * The error is always re-thrown, so the calling screen still handles it like any other failure.
 * Pure: no React, no storage — the provider passes the two callbacks.
 */
import { API_MEMBERS, type ApiClient, type ApiMember } from "@/api/client";
import { isApiError, isRoleError, isSessionExpired, type ApiError } from "@/api/errors";

export type SessionErrorHandlers = {
  /** A call was refused because the session no longer exists. */
  onSessionExpired: (error: ApiError) => void;
  /** A call was refused for the role; `GET /me` should be re-read. */
  onRoleRefused?: (error: ApiError) => void;
};

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

/**
 * Wraps every method of every member, whatever its shape. A returned promise (or any thenable) is observed
 * on a side branch, never replaced by a different outcome. A synchronous return passes through untouched,
 * and a synchronous throw — `planner.getHandoutUrl` checks the session before it builds the URL, and an
 * HTTP client may validate arguments before it sends anything — is reported the same way and re-thrown
 * as it is (`shell.subscribeRealtime`, the other synchronous method, never throws by contract).
 */
export function guardApiClient<T extends ApiClient>(client: T, handlers: SessionErrorHandlers): T {
  const report = (error: unknown) => {
    if (!isApiError(error)) return;
    if (isSessionExpired(error)) handlers.onSessionExpired(error);
    else if (isRoleError(error)) handlers.onRoleRefused?.(error);
  };

  const guardMember = <M extends ApiMember>(member: ApiClient[M]): ApiClient[M] => {
    const guarded: Record<string, unknown> = {};
    for (const [name, method] of Object.entries(member as unknown as Record<string, unknown>)) {
      if (typeof method !== "function") {
        guarded[name] = method;
        continue;
      }
      guarded[name] = (...args: unknown[]) => {
        let result: unknown;
        try {
          result = (method as (...a: unknown[]) => unknown).apply(member, args);
        } catch (error) {
          report(error);
          throw error;
        }
        if (isThenable(result)) {
          // Observe on a side branch: the caller receives the original promise and its original rejection.
          result.then(undefined, report);
        }
        return result;
      };
    }
    return guarded as unknown as ApiClient[M];
  };

  const guarded = { ...client } as T;
  for (const member of API_MEMBERS) {
    (guarded as ApiClient)[member] = guardMember(client[member]) as never;
  }
  return guarded;
}
