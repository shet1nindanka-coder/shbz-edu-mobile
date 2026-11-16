/**
 * The single limiter of the mock backend (docs/spec/90-addendum-3.md §2, §9; 90-addendum-6 §7.3):
 * - fixed-window buckets — the site's Postgres limiter behind every `enforceApiRateLimit` scope and the three
 *   daily AI budgets (a refused attempt still increments the counter; nothing runs at the window boundary);
 * - sliding buckets — the site's in-memory login limiters (a refused attempt is NOT recorded).
 *
 * Buckets are rows of the shared store, so the demo screen can list and clear them. A `LimiterPin`
 * (`store.controls.limiterPins`) makes a bucket refuse on every evaluation.
 */
import type { RateLimitRule, RateLimitScope, SiteSettings } from "@/api/types";
import { AI_BUDGETS, AI_BUDGET_WINDOW_MS, RATE_LIMITS } from "@/api/types";

import type { LimiterPin, MockLimiterBucketInfo } from "../controls";
import type { LimiterBucket } from "../store/schema";
import type { MockAuth } from "./auth";
import type { MockCore } from "./core";
import type { MessageSelector } from "./errors";

/** Result of one evaluation — the site's `RateLimitResult`. */
export type RateLimitResult = {
  allowed: boolean;
  /** 0 when refused. */
  remaining: number;
  /** 0 when allowed; `max(1, …)` when refused. */
  retryAfterMs: number;
  /** Epoch ms of the next window boundary (fixed) / of the moment a slot frees up (sliding, when refused). */
  resetAt: number;
};

export type AiBudgetScope = keyof typeof AI_BUDGETS;

/** Identifier of the three school-wide AI budget buckets. */
export const AI_BUDGET_IDENTIFIER = "global";

/** `retryAfterSeconds` of a refusal: the site's `max(1, ceil(retryAfterMs / 1000))`. */
export function retryAfterSeconds(result: Pick<RateLimitResult, "retryAfterMs">): number {
  return Math.max(1, Math.ceil(result.retryAfterMs / 1000));
}

/** Bucket scope of a `RATE_LIMITS` key: `"api:homework-plan#issue-delete"` shares the bucket of `"api:homework-plan"`. */
function bucketScope(scope: string): string {
  const hash = scope.indexOf("#");
  return hash === -1 ? scope : scope.slice(0, hash);
}

const bucketId = (scope: string, identifier: string) => `${scope}|${identifier}`;

const windowStartOf = (now: number, windowMs: number) => Math.floor(now / windowMs) * windowMs;

export interface MockLimiter {
  /**
   * The usual call of a mock method: consumes one hit of a per-user rate limit declared in `RATE_LIMITS`
   * (limit, window and window type come from there) and throws `429 rateLimited` with `retryAfterSeconds`
   * when it is exceeded. `identifier` defaults to the signed-in user's id.
   * `ctx.limits.enforce("api:streak")`.
   */
  enforce(scope: RateLimitScope, options?: { identifier?: string; message?: MessageSelector }): void;
  /** Like `enforce`, but returns the result instead of throwing. */
  check(scope: RateLimitScope, identifier?: string): RateLimitResult;
  /** Fixed-window consume with explicit numbers (`consumePersistentRateLimit`). Blocked when the incremented hits exceed `limit`. */
  consumeFixed(scope: string, identifier: string, limit: number, windowMs: number, amount?: number): RateLimitResult;
  /** Gives hits back (`releasePersistentRateLimitHit`): only inside the same window, never below zero. */
  releaseFixed(scope: string, identifier: string, windowMs: number, amount?: number): void;
  /** Sliding-window consume (`consumeRateLimit`): refused when `limit` accepted attempts are inside the window. */
  consumeSliding(scope: string, identifier: string, limit: number, windowMs: number): RateLimitResult;
  /** Deletes one bucket (`resetPersistentRateLimit`). A pin keeps refusing. */
  reset(scope: string, identifier: string): void;
  /**
   * One of the three daily AI budgets (fixed 24-hour window aligned to 00:00 UTC; the limit is read from the
   * settings on every call). Does NOT throw: the caller decides what a refusal means (checks: roll the row
   * back and answer `429 rateLimited`; plans: `budgetExhausted`).
   */
  consumeBudget(scope: AiBudgetScope, amount?: number): RateLimitResult;
  /** Refund of AI budget slots (a failure before the model stage; a refused plan reservation). */
  releaseBudget(scope: AiBudgetScope, amount?: number): void;
  /** Deletes every bucket (demo screen "clear", test set-up). Pins stay — they are controls. */
  clear(): void;
  /** Fills a bucket for the current window (demo screen; the state clears by itself when the window ends). */
  exhaust(scope: string, identifier: string, rule?: { limit: number; windowMs: number; window?: "fixed" | "sliding" }): void;
  /** Buckets with their reset time, for the demo screen. */
  list(): MockLimiterBucketInfo[];
}

export function createLimiter(core: MockCore, auth: MockAuth): MockLimiter {
  const { store, errors } = core;

  const pinFor = (scope: string, identifier: string): LimiterPin | undefined =>
    store.controls.limiterPins.find((pin) => pin.scope === scope && pin.identifier === identifier);

  const limitOf = (rule: RateLimitRule): number => {
    if (typeof rule.limit === "number") return rule.limit;
    const value = store.settings[rule.limit.setting];
    return typeof value === "number" && Number.isFinite(value) ? value : rule.limit.default;
  };

  const consumeFixed = (scope: string, identifier: string, limit: number, windowMs: number, amount = 1): RateLimitResult => {
    const now = core.now();
    const windowStart = windowStartOf(now, windowMs);
    const resetAt = windowStart + windowMs;
    const id = bucketId(scope, identifier);
    const current = store.limiterBuckets.get(id);
    const hits = !current || current.kind !== "fixed" || current.windowStart !== windowStart ? amount : current.hits + amount;
    // The increment is stored even when the call is refused (90-addendum-3 §2 rule 3).
    const next: LimiterBucket = { id, scope, identifier, kind: "fixed", windowStart, hits, stamps: [], windowMs, updatedAt: now };
    store.limiterBuckets.upsert(next);

    const pin = pinFor(scope, identifier);
    if (pin || hits > limit) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, pin?.retryAfterMs ?? resetAt - now), resetAt };
    }
    return { allowed: true, remaining: Math.max(0, limit - hits), retryAfterMs: 0, resetAt };
  };

  const releaseFixed = (scope: string, identifier: string, windowMs: number, amount = 1): void => {
    if (!Number.isInteger(amount) || amount < 1) return;
    const bucket = store.limiterBuckets.get(bucketId(scope, identifier));
    if (!bucket || bucket.kind !== "fixed") return;
    // After the boundary the counter has already started again: nothing to give back.
    if (bucket.windowStart !== windowStartOf(core.now(), windowMs) || bucket.hits < amount) return;
    store.limiterBuckets.update(bucket.id, { hits: bucket.hits - amount, updatedAt: core.now() });
  };

  const consumeSliding = (scope: string, identifier: string, limit: number, windowMs: number): RateLimitResult => {
    const now = core.now();
    const id = bucketId(scope, identifier);
    const current = store.limiterBuckets.get(id);
    const active = (current?.kind === "sliding" ? current.stamps : []).filter((stamp) => now - stamp < windowMs);

    const pin = pinFor(scope, identifier);
    if (pin) {
      const wait = Math.max(1, pin.retryAfterMs ?? windowMs);
      return { allowed: false, remaining: 0, retryAfterMs: wait, resetAt: now + wait };
    }
    if (active.length >= limit) {
      // A refused attempt is not recorded; the wait is until the oldest accepted attempt leaves the window.
      const oldest = active[0] ?? now;
      const wait = Math.max(1, windowMs - (now - oldest));
      store.limiterBuckets.upsert({ id, scope, identifier, kind: "sliding", windowStart: 0, hits: active.length, stamps: active, windowMs, updatedAt: now });
      return { allowed: false, remaining: 0, retryAfterMs: wait, resetAt: now + wait };
    }
    const stamps = [...active, now];
    store.limiterBuckets.upsert({ id, scope, identifier, kind: "sliding", windowStart: 0, hits: stamps.length, stamps, windowMs, updatedAt: now });
    return { allowed: true, remaining: Math.max(0, limit - stamps.length), retryAfterMs: 0, resetAt: now + windowMs };
  };

  const check = (scope: RateLimitScope, identifier?: string): RateLimitResult => {
    const rule: RateLimitRule = RATE_LIMITS[scope];
    const id = identifier ?? auth.currentUser()?.id ?? "anonymous";
    const windowMs = rule.windowSeconds * 1000;
    return rule.window === "sliding"
      ? consumeSliding(bucketScope(scope), id, limitOf(rule), windowMs)
      : consumeFixed(bucketScope(scope), id, limitOf(rule), windowMs);
  };

  const budgetLimit = (scope: AiBudgetScope): number => {
    const setting: keyof SiteSettings = AI_BUDGETS[scope];
    const value = store.settings[setting];
    return typeof value === "number" && Number.isFinite(value) ? Math.max(1, value) : 300;
  };

  return {
    enforce(scope, options) {
      const result = check(scope, options?.identifier);
      if (!result.allowed) throw errors.rateLimited(retryAfterSeconds(result), options?.message);
    },
    check,
    consumeFixed,
    releaseFixed,
    consumeSliding,
    reset(scope, identifier) {
      store.limiterBuckets.delete(bucketId(scope, identifier));
    },
    consumeBudget: (scope, amount = 1) => consumeFixed(scope, AI_BUDGET_IDENTIFIER, budgetLimit(scope), AI_BUDGET_WINDOW_MS, amount),
    releaseBudget: (scope, amount = 1) => releaseFixed(scope, AI_BUDGET_IDENTIFIER, AI_BUDGET_WINDOW_MS, amount),
    clear() {
      store.limiterBuckets.deleteWhere(() => true);
    },
    exhaust(scope, identifier, rule) {
      const now = core.now();
      const known = (RATE_LIMITS as Record<string, RateLimitRule | undefined>)[scope];
      const budget = (AI_BUDGETS as Record<string, keyof SiteSettings | undefined>)[scope];
      const resolved =
        rule ??
        (known
          ? { limit: limitOf(known), windowMs: known.windowSeconds * 1000, window: known.window }
          : budget
            ? { limit: budgetLimit(scope as AiBudgetScope), windowMs: AI_BUDGET_WINDOW_MS, window: "fixed" as const }
            : undefined);
      if (!resolved) throw new Error(`Mock limiter: unknown scope "${scope}" — pass the limit and the window explicitly.`);

      const id = bucketId(bucketScope(scope), identifier);
      const base = { id, scope: bucketScope(scope), identifier, windowMs: resolved.windowMs, updatedAt: now };
      if (resolved.window === "sliding") {
        const stamps = Array.from({ length: resolved.limit }, () => now);
        store.limiterBuckets.upsert({ ...base, kind: "sliding", windowStart: 0, hits: stamps.length, stamps });
      } else {
        // "hits = limit for the current window": the next consume is the first refused one.
        store.limiterBuckets.upsert({ ...base, kind: "fixed", windowStart: windowStartOf(now, resolved.windowMs), hits: resolved.limit, stamps: [] });
      }
    },
    list() {
      const now = core.now();
      const rows: MockLimiterBucketInfo[] = store.limiterBuckets.all().map((bucket) => {
        const pinned = pinFor(bucket.scope, bucket.identifier) !== undefined;
        if (bucket.kind === "fixed") {
          const live = bucket.windowStart === windowStartOf(now, bucket.windowMs);
          return {
            scope: bucket.scope,
            identifier: bucket.identifier,
            kind: bucket.kind,
            hits: live ? bucket.hits : 0,
            resetAt: new Date(windowStartOf(now, bucket.windowMs) + bucket.windowMs).toISOString(),
            pinned,
          };
        }
        const active = bucket.stamps.filter((stamp) => now - stamp < bucket.windowMs);
        return {
          scope: bucket.scope,
          identifier: bucket.identifier,
          kind: bucket.kind,
          hits: active.length,
          resetAt: active.length > 0 ? new Date(active[0]! + bucket.windowMs).toISOString() : null,
          pinned,
        };
      });
      // Pins without a bucket yet are listed too: they refuse from the very first evaluation.
      for (const pin of store.controls.limiterPins) {
        if (!rows.some((row) => row.scope === pin.scope && row.identifier === pin.identifier)) {
          rows.push({ scope: pin.scope, identifier: pin.identifier, kind: pin.retryAfterMs === undefined ? "fixed" : "sliding", hits: 0, resetAt: null, pinned: true });
        }
      }
      return rows;
    },
  };
}
