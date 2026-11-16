/**
 * What the query cache may keep on disk (pure rules, unit-tested).
 *
 * The persisted cache is what makes already-opened theory, statements and homework lists readable without
 * a connection. It is NOT a place for everything:
 * - personal data (parent-call comments, 06 §1.4) and developer tooling (journal, panel, accounts) never
 *   leave memory;
 * - polled, short-lived states (check progress, live lesson state, plan status) would only restore stale
 *   spinners;
 * - failed or still-loading queries are not worth restoring.
 */
import type { ApiMember } from "@/api/client";

/** Lifetime of the persisted cache on disk; older snapshots are dropped at start. */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Unused queries stay in memory this long (so a restored query survives until its screen opens). */
export const QUERY_GC_TIME_MS = 24 * 60 * 60 * 1000;

/** Data younger than this is shown without a refetch on mount. */
export const QUERY_STALE_TIME_MS = 15_000;

/** Bump to discard every persisted cache written by an older build (shape changes of responses). */
export const PERSIST_BUSTER = "shbz-query-v1";

export const PERSIST_STORAGE_KEY = "shbz-query-cache";

/** Members whose data never goes to disk. */
const MEMORY_ONLY_MEMBERS: ReadonlySet<ApiMember> = new Set<ApiMember>(["accounts", "developer"]);

/** `member.method` pairs that never go to disk. */
const MEMORY_ONLY_METHODS: ReadonlySet<string> = new Set([
  // Personal data: parent-call comments.
  "groups.getParentCallsOverview",
  "groups.getParentCallHistory",
  // Volatile, polled.
  "studentWork.getLatestHomeworkCheck",
  "studentWork.getLiveLessonState",
  "planner.getLessonStatus",
  "planner.getHomeworkPlanStatus",
  "planner.getLessonLive",
  // Session and public config are restored by their own paths.
  "shell.getMe",
  "shell.getMeta",
  "shell.findNumber",
]);

/** Whether a successful query with this key is written to the persisted cache. */
export function isPersistableQueryKey(queryKey: readonly unknown[]): boolean {
  const [member, method] = queryKey;
  // Only keys of the API layer (`qk(...)`) are persisted; ad-hoc keys stay in memory.
  if (typeof member !== "string" || typeof method !== "string") return false;
  if (MEMORY_ONLY_MEMBERS.has(member as ApiMember)) return false;
  return !MEMORY_ONLY_METHODS.has(`${member}.${method}`);
}
