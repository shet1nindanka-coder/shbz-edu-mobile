/**
 * Placeholder for members that are not implemented in the mock yet: every method rejects with
 * `ApiError { status: 500, code: "internalError" }`. A member's owner replaces the whole factory body with
 * real methods and deletes the use of this helper.
 */
import { ApiError } from "@/api/errors";

/** Developer-facing text (never shown as product copy: the screens that call these methods do not exist yet). */
export const NOT_IMPLEMENTED_MESSAGE = "not implemented in mock yet";

function notImplementedError(method: string): ApiError {
  return new ApiError({ status: 500, code: "internalError", message: NOT_IMPLEMENTED_MESSAGE, details: { method } });
}

/** A rejected promise for an async method: `async getTopic() { return notImplemented("content.getTopic"); }`. */
export function notImplemented(method: string): Promise<never> {
  return Promise.reject(notImplementedError(method));
}

/** The synchronous variant, for the one non-Promise method (`planner.getHandoutUrl`). */
export function notImplementedSync(method: string): never {
  throw notImplementedError(method);
}
