/**
 * The single error type thrown by every `ApiClient` method, in both implementations
 * (docs/spec/00-unified-contract.md §0, §1.3; 90-addendum-1 A.2 – A.3).
 *
 * Rules for callers:
 * - Branch on `code`, show `message` verbatim (already localized by the server / mock).
 * - Sign out if and only if `code === "sessionExpired"` (handled centrally).
 * - A 403 never signs the user out; re-fetch `GET /me`.
 * - Never auto-retry a mutation; disable the control until `now + retryAfterSeconds` when it is present.
 */
import type {
  ApiErrorBody,
  ApiErrorCode,
  ApiErrorDetails,
  ApiErrorParams,
  EndpointErrorCode,
  GlobalErrorCode,
  KnownApiErrorCode,
  NetworkErrorCode,
  NotFoundErrorCode,
  UploadErrorCode,
} from "./types/shared";
import { NOT_FOUND_ERROR_CODES } from "./types/shared";

export type {
  ApiErrorBody,
  ApiErrorCode,
  ApiErrorDetails,
  ApiErrorParams,
  EndpointErrorCode,
  GlobalErrorCode,
  KnownApiErrorCode,
  NetworkErrorCode,
  NotFoundErrorCode,
  UploadErrorCode,
};

/** Every value `ApiError.code` can take: a server code or the client-only "network". */
export type AnyApiErrorCode = ApiErrorCode | NetworkErrorCode;

export type ApiErrorInit = {
  code: AnyApiErrorCode;
  /** Localized text, ready to show. */
  message: string;
  /** HTTP status; 0 = no response (network failure, timeout, aborted). */
  status: number;
  retryAfterSeconds?: number;
  params?: ApiErrorParams;
  details?: ApiErrorDetails;
};

const API_ERROR_NAME = "ApiError";

export class ApiError extends Error {
  /** Machine code, lower camelCase — for branching only. "network" is client-only. */
  readonly code: AnyApiErrorCode;
  /** HTTP status; 0 = no response. */
  readonly status: number;
  /** Mirrors `Retry-After`. Always present for `rateLimited`; absent for `budgetExhausted`. */
  readonly retryAfterSeconds?: number;
  /** Values substituted into the dictionary template of `message` — lets the UI re-render it after a language switch. */
  readonly params?: ApiErrorParams;
  /** Machine data the UI acts on (e.g. `{ conflictNumbers: string[] }`, a fresh preview / impact object). */
  readonly details?: ApiErrorDetails;

  constructor(init: ApiErrorInit) {
    super(init.message);
    // Keeps `instanceof` working when the class is transpiled to ES5-style constructors.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = API_ERROR_NAME;
    this.code = init.code;
    this.status = init.status;
    if (init.retryAfterSeconds !== undefined) this.retryAfterSeconds = init.retryAfterSeconds;
    if (init.params !== undefined) this.params = init.params;
    if (init.details !== undefined) this.details = init.details;
  }

  /** Builds the error an HTTP method throws from a non-2xx response (status + envelope). */
  static fromBody(status: number, body: ApiErrorBody): ApiError {
    const { code, message, retryAfterSeconds, params, details } = body.error;
    return new ApiError({ code, message, status, retryAfterSeconds, params, details });
  }

  /** No response, timeout or an aborted call (`signal`): `status: 0`, `code: "network"`. */
  static network(message: string): ApiError {
    return new ApiError({ code: "network", message, status: 0 });
  }

  /** The envelope this error corresponds to (what a server would have sent). */
  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.retryAfterSeconds !== undefined ? { retryAfterSeconds: this.retryAfterSeconds } : {}),
        ...(this.params !== undefined ? { params: this.params } : {}),
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

// ───────────────────────────── type guards ─────────────────────────────

/** True for an `ApiError`, including one created by another copy of this module (checked structurally). */
export function isApiError(error: unknown): error is ApiError {
  if (error instanceof ApiError) return true;
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
  return (
    candidate.name === API_ERROR_NAME &&
    typeof candidate.code === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.message === "string"
  );
}

/** True when `error` is an `ApiError` with one of the given codes; narrows `code`. */
export function hasErrorCode<C extends AnyApiErrorCode>(error: unknown, ...codes: readonly C[]): error is ApiError & { code: C } {
  return isApiError(error) && (codes as readonly string[]).includes(error.code);
}

/** `401 sessionExpired` — the only error that signs the user out. */
export function isSessionExpired(error: unknown): error is ApiError & { code: "sessionExpired" } {
  return hasErrorCode(error, "sessionExpired");
}

/** Client-only: no response, timeout or aborted (`status: 0`). */
export function isNetworkError(error: unknown): error is ApiError & { code: "network" } {
  return hasErrorCode(error, "network");
}

/** `403 unauthorized` / `403 developerRightsRequired`: stay signed in and re-fetch `GET /me`. */
export function isRoleError(error: unknown): error is ApiError & { code: "unauthorized" | "developerRightsRequired" } {
  return hasErrorCode(error, "unauthorized", "developerRightsRequired");
}

/** 404 — the resource is missing or not owned (any entity-specific code). */
export function isNotFoundError(error: unknown): error is ApiError {
  return isApiError(error) && (error.status === 404 || (NOT_FOUND_ERROR_CODES as readonly string[]).includes(error.code));
}

/** 429 with a known wait (`rateLimited`, `tooManyConnections`); `budgetExhausted` carries none. */
export function isRateLimited(error: unknown): error is ApiError & { retryAfterSeconds: number } {
  return isApiError(error) && error.status === 429 && typeof error.retryAfterSeconds === "number";
}
