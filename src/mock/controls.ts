/**
 * Mock controls — the switches of the "Demo data" screen (docs/spec/90-addendum-6.md §9).
 *
 * The VALUES live in the shared store (`store.controls`) so they survive an app restart and are restored
 * to their defaults by "Reset demo data". The ACTIONS (`MockControlActions`) are methods of the object
 * `createMockApiClient` returns as `controls`; they are not part of `ApiClient` and have no HTTP counterpart.
 */
import type { CheckErrorCode, IsoDateTime, PlanErrorCode, SolutionVerdict } from "@/api/types";

/** Scope of a limiter bucket: the site's scope names (`RATE_LIMITS`, `AI_BUDGETS`) or any other string. */
export type MockLimiterScope = string;

/** A bucket that is exhausted again whenever it is evaluated — a limiter state that does not decay with T0. */
export type LimiterPin = {
  scope: MockLimiterScope;
  identifier: string;
  /** Sliding scopes: the wait reported on every evaluation. Fixed-window scopes: omit (rest of the real window). */
  retryAfterMs?: number;
};

/** Errors `forceNextError` can produce (90-addendum-6 §9.2 rule 2). */
export type ForcedError = "sessionExpired" | "unauthorized" | "notFound" | "rateLimited" | "serviceUnavailable" | "network";

/** Generation-time plan errors that can be forced for the next generated participant. */
export type ForcedPlanOutcome = Exclude<PlanErrorCode, "budgetExhausted" | "queueFull">;

export type MockControls = {
  /** Simulated latency of every method: `minMs + (callCounter × 137) % (maxMs − minMs + 1)`. Default 200..600. */
  latency: { minMs: number; maxMs: number };
  /** Fail the next call(s) of one method ("member.method") or of any method ("*"). One-shot: resets when `times` reaches 0. */
  forceNextError: null | { method: string; error: ForcedError; times: number };
  /** One-shot outcome of the next started homework check / lesson submission (precedence 1 of rule V). */
  nextCheckOutcome:
    | null
    | { kind: "failed"; errorClass: CheckErrorCode }
    /** Homework only: DONE with empty `results`. */
    | { kind: "doneEmpty" }
    /** By index of `found` (homework) / the single value (lesson). */
    | { kind: "verdicts"; verdicts: SolutionVerdict[] };
  /** `503 queueFull` (`retryAfterSeconds: 120`) on the two student start endpoints. */
  checkQueueFull: boolean;
  /** One-shot generation-time error for the next generated participant. */
  nextPlanOutcome: null | ForcedPlanOutcome;
  /** `reservePlanGenerations` answers `queueFull` (create: stored on every participant; retry: 503). */
  planQueueFull: boolean;
  /** Buckets exhausted on every evaluation. Seeded with the two pins of 90-addendum-6 §7.4. */
  limiterPins: LimiterPin[];
  /** Realtime streams held by other clients of the same user (0..2). Seeded with `{ usr_igor: 2 }`. */
  externalRealtimeConnections: Record<string, 0 | 1 | 2>;
};

/** One row of the limiter list shown on the demo screen. */
export type MockLimiterBucketInfo = {
  scope: MockLimiterScope;
  identifier: string;
  kind: "fixed" | "sliding";
  /** Hits counted in the current window (fixed) / accepted attempts still inside the window (sliding). */
  hits: number;
  /** When the bucket frees a slot or resets; null when unknown (a sliding bucket that is not full). */
  resetAt: IsoDateTime | null;
  pinned: boolean;
};

/** What the demo screen shows about the dataset. */
export type MockDatasetInfo = {
  /** Seed anchor of every fixture timestamp. */
  t0: IsoDateTime;
  /** `now − T0`, milliseconds. */
  ageMs: number;
  /** Bumps on every seed / reset (lets the UI drop cached queries). */
  generation: number;
  /** Whether the dataset is re-seeded automatically at start once it is older than 24 hours. */
  autoReseed: boolean;
  /**
   * The stored dataset could not be read at start (the storage rejected the reads): this run works on fresh
   * fixtures in memory and saves nothing, so the stored data is not overwritten. A demo reset ends it.
   */
  storageReadFailed: boolean;
};

/** Actions of the demo screen (methods of `MockApiClient.controls`). */
export interface MockControlActions {
  /** Current control values (a copy). */
  get(): MockControls;
  /** Changes one control; persisted with the store. */
  set<K extends keyof MockControls>(key: K, value: MockControls[K]): void;
  /** New T0, every fixture restored, limiter buckets cleared, pins and controls back to their defaults. */
  resetDemoData(): Promise<void>;
  /** Deletes every limiter bucket (pins keep refusing — they are controls, not buckets). */
  clearLimiters(): void;
  /**
   * Fills a bucket for the current window: a fixed-window scope gets `hits = limit`, a sliding scope gets
   * `limit` accepted attempts at "now". Limit and window come from `RATE_LIMITS` / the AI budget settings;
   * pass `rule` for a scope that is in neither. The state clears by itself when the window ends.
   */
  exhaust(scope: MockLimiterScope, identifier: string, rule?: { limit: number; windowMs: number; window?: "fixed" | "sliding" }): void;
  /** `les_dasha_soon`: `startsAt = now + 60 s`, clears `joinedAt`, submissions, results, `finishedAt`; status PLANNED. */
  rearmSoonLesson(): void;
  /** Buckets with their remaining time, for the "Limits" block. */
  listLimiters(): MockLimiterBucketInfo[];
  /** Age of the dataset and the re-seed setting. */
  datasetInfo(): MockDatasetInfo;
  /** Opt in / out of the automatic 24-hour re-seed (09 §2.2 item 1). */
  setAutoReseed(enabled: boolean): void;
}

/** Identifier that plays the role of the client IP in the login limiters (the device is one address). */
export const MOCK_CLIENT_IP = "mock-device";

export const DEFAULT_MOCK_LATENCY = { minMs: 200, maxMs: 600 } as const;

/** The pseudo-login that is always rate-limited and the user who can never change the password. */
export const PINNED_LOGIN = "locked@example.com";
export const PINNED_PASSWORD_USER_ID = "usr_egor";
/** The user whose realtime stream is always refused (two streams held by "other clients"). */
export const PINNED_REALTIME_USER_ID = "usr_igor";

/** Control values of a freshly seeded store. `latency` may be overridden by the client options. */
export function defaultMockControls(latency: { minMs: number; maxMs: number } = DEFAULT_MOCK_LATENCY): MockControls {
  return {
    latency: { minMs: latency.minMs, maxMs: latency.maxMs },
    forceNextError: null,
    nextCheckOutcome: null,
    checkQueueFull: false,
    nextPlanOutcome: null,
    planQueueFull: false,
    limiterPins: [
      { scope: "login:ip-login", identifier: `${MOCK_CLIENT_IP}:${PINNED_LOGIN}`, retryAfterMs: 420_000 },
      { scope: "profile:password-update", identifier: PINNED_PASSWORD_USER_ID },
    ],
    externalRealtimeConnections: { [PINNED_REALTIME_USER_ID]: 2 },
  };
}
