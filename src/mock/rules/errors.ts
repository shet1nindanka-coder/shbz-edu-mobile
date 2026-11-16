/**
 * Error factory of the mock backend. Every mock method fails with the `ApiError` the HTTP method would build
 * from the server's envelope: status, machine code, the message from the SITE dictionary rendered for the
 * request language, plus `params` / `details` / `retryAfterSeconds` (docs/spec/90-addendum-1.md A.2 – A.4,
 * 90-addendum-5 B.6 rule 3).
 */
import { ApiError, type AnyApiErrorCode } from "@/api/errors";
import type { ApiErrorDetails, ApiErrorParams, Locale, NotFoundErrorCode } from "@/api/types";
import { RETRY_AFTER_SECONDS } from "@/api/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { getMobileDictionary, type MobileDictionary } from "@/i18n/mobile";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { format } from "@/lib/i18n/format";

/** Picks the text of an error from the dictionaries of the request language (`dict` = site, `m` = mobile overlay). */
export type MessageSelector = (dict: Dictionary, m: MobileDictionary) => string;

export type FailInit = {
  /** HTTP status the server would answer with. */
  status: number;
  code: AnyApiErrorCode;
  /** A selector into the dictionaries, or a ready (already localised) string. */
  message: MessageSelector | string;
  /** Values substituted into the message template with `format()`; also sent as `error.params`. */
  params?: ApiErrorParams;
  /** Machine data the UI acts on (`error.details`). */
  details?: ApiErrorDetails;
  retryAfterSeconds?: number;
};

/** Default text of every 404 code (an endpoint may pass its own selector where the site has a specific text). */
const NOT_FOUND_MESSAGES: Record<NotFoundErrorCode, MessageSelector> = {
  studentNotFound: (dict) => dict.apiCommon.studentNotFound,
  topicNotFound: (dict) => dict.apiCommon.topicNotFound,
  numberNotFound: (dict) => dict.apiCommon.numberNotFound,
  homeworkNotFound: (dict) => dict.apiCommon.homeworkNotFound,
  lessonNotFound: (dict) => dict.apiCommon.lessonNotFound,
  groupNotFound: (dict) => dict.apiCommon.groupNotFound,
  draftNotFound: (dict) => dict.apiCommon.draftNotFound,
  studentOrNumberNotFound: (dict) => dict.apiCommon.studentOrNumberNotFound,
  participantNotFound: (dict) => dict.apiPlanner.lessonItems.participantNotFound,
  itemNotFound: (dict) => dict.apiPlanner.lessonResult.itemNotFound,
  photoNotFound: (dict) => dict.apiStudent.homeworkSubmissions.photoNotFound,
  historyNotFound: (dict) => dict.apiContent.progressHistory.notFound,
  // The site answers the plain text "Not found" for a file; the mobile overlay supplies the wording.
  fileNotFound: (_dict, m) => m.common.errors.fileNotFound,
  teacherNotFound: (dict) => dict.students.accounts.notices.teacherMissing,
};

export interface MockErrors {
  /**
   * Builds (does not throw) an `ApiError`. The message is rendered for the current request language and
   * `params` are substituted into it.
   */
  make(init: FailInit): ApiError;
  /** Throws `make(init)`. Use for every endpoint-specific error: `ctx.errors.fail({ status: 409, code: "alreadyRunning", message: (d) => d.apiStudent.homeworkChecks.alreadyRunning })`. */
  fail(init: FailInit): never;
  /** `401 sessionExpired` — no valid session; the only error that signs the user out. */
  sessionExpired(): ApiError;
  /** `403 unauthorized` — valid session, wrong role. Pass a selector for an endpoint-specific text. */
  unauthorized(message?: MessageSelector): ApiError;
  /** `403 developerRightsRequired` — developer-only endpoint. */
  developerRightsRequired(): ApiError;
  /** `400 invalidData` — undifferentiated bad input; pass the endpoint's own text when the site has one. */
  invalidData(message?: MessageSelector): ApiError;
  /** `429 rateLimited` with `retryAfterSeconds` (always present). */
  rateLimited(retryAfterSeconds: number, message?: MessageSelector, params?: ApiErrorParams): ApiError;
  /** `503 serviceUnavailable`, `retryAfterSeconds: 5` (limiter store failure). */
  serviceUnavailable(): ApiError;
  /** `404` with an entity code — a missing OR not owned resource (never a 403). */
  notFound(code: NotFoundErrorCode, message?: MessageSelector): ApiError;
  /** `500 internalError` — an uncaught failure. */
  internal(message?: MessageSelector | string): ApiError;
  /** Client-side `network` error (`status: 0`): offline, timeout, aborted. */
  network(): ApiError;
}

export function createErrors(getLocale: () => Locale): MockErrors {
  const render = (message: MessageSelector | string, params?: ApiErrorParams): string => {
    const locale = getLocale();
    const text = typeof message === "string" ? message : message(getDictionary(locale), getMobileDictionary(locale));
    return params ? format(text, params) : text;
  };

  const make = (init: FailInit): ApiError =>
    new ApiError({
      status: init.status,
      code: init.code,
      message: render(init.message, init.params),
      ...(init.params !== undefined ? { params: init.params } : {}),
      ...(init.details !== undefined ? { details: init.details } : {}),
      ...(init.retryAfterSeconds !== undefined ? { retryAfterSeconds: init.retryAfterSeconds } : {}),
    });

  return {
    make,
    fail(init) {
      throw make(init);
    },
    sessionExpired: () => make({ status: 401, code: "sessionExpired", message: (dict) => dict.apiCommon.sessionExpired }),
    unauthorized: (message) => make({ status: 403, code: "unauthorized", message: message ?? ((dict) => dict.apiCommon.unauthorized) }),
    developerRightsRequired: () =>
      make({ status: 403, code: "developerRightsRequired", message: (dict) => dict.apiCommon.developerRightsRequired }),
    invalidData: (message) => make({ status: 400, code: "invalidData", message: message ?? ((dict) => dict.apiCommon.invalidData) }),
    rateLimited: (retryAfterSeconds, message, params) =>
      make({
        status: 429,
        code: "rateLimited",
        message: message ?? ((dict) => dict.apiCommon.rateLimited),
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
        ...(params !== undefined ? { params } : {}),
      }),
    serviceUnavailable: () =>
      make({
        status: 503,
        code: "serviceUnavailable",
        message: (dict) => dict.apiCommon.serviceUnavailable,
        retryAfterSeconds: RETRY_AFTER_SECONDS.serviceUnavailable,
      }),
    notFound: (code, message) => make({ status: 404, code, message: message ?? NOT_FOUND_MESSAGES[code] }),
    internal: (message) => make({ status: 500, code: "internalError", message: message ?? ((_dict, m) => m.common.errors.internalError) }),
    network: () => ApiError.network(render((_dict, m) => m.common.errors.network)),
  };
}
