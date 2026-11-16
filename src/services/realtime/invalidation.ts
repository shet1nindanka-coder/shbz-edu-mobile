/**
 * Which queries a realtime event makes stale (docs/spec/01-shell-auth.md §5.4, §5.7; 00 §2.3 "Channel per
 * feature"). The site refreshes the whole page on an event; the app invalidates query-key PREFIXES instead
 * (`[member]` or `[member, method]`), debounced by 1500 ms.
 *
 * Pure: no React, no QueryClient — the bridge hook applies the result.
 */
import type { ApiMember, ApiMethodName } from "@/api/client";
import type { RealtimeEvent, UserRole } from "@/api/types";

/** A query-key prefix: every query of a member, or every query of one method. */
export type InvalidationPrefix = readonly [ApiMember] | readonly [ApiMember, string];

function key<M extends ApiMember>(member: M, method?: ApiMethodName<M>): InvalidationPrefix {
  return method === undefined ? [member] : [member, method];
}

/** The bell: refreshed on every event addressed to the user (the site lacks this; 01 §5.7, 00 §2.3). */
const NOTIFICATIONS = key("shell", "listNotifications");

const STUDENT_HOMEWORK: readonly InvalidationPrefix[] = [
  key("studentWork", "listHomeworks"),
  key("studentWork", "getHomework"),
  key("studentStudy", "getHomeworkDeadlines"),
];

const STUDENT_KEYS: Record<RealtimeEvent["kind"], readonly InvalidationPrefix[]> = {
  // Never delivered to a student; listed so the table is total.
  "students-changed": [],
  "topic-content-changed": [
    key("studentStudy", "getTheoryLibrary"),
    key("studentStudy", "getNumberDetail"),
    key("studentWork", "getHomework"),
    key("studentWork", "getLiveLesson"),
  ],
  "student-progress-changed": [key("shell", "getStreak"), key("studentStudy", "getNumberDetail"), ...STUDENT_HOMEWORK],
  "student-deadlines-changed": STUDENT_HOMEWORK,
  "lesson-activity": [key("studentWork", "getLiveLesson"), key("studentWork", "getLiveLessonState")],
};

/**
 * Staff members whose screens show live data. The site re-renders the current page on ANY delivered
 * event; here every staff query is marked stale and only the mounted ones refetch.
 */
const STAFF_MEMBERS: readonly ApiMember[] = ["teacherStudents", "accounts", "planner", "groups", "content", "developer"];

/** Prefixes to invalidate for one delivered event. The result never contains duplicates. */
export function invalidationPrefixesFor(event: RealtimeEvent, role: UserRole): InvalidationPrefix[] {
  const prefixes: InvalidationPrefix[] = [NOTIFICATIONS];
  if (role === "STUDENT") prefixes.push(...STUDENT_KEYS[event.kind]);
  else prefixes.push(...STAFF_MEMBERS.map((member) => key(member)));
  return dedupePrefixes(prefixes);
}

/** Everything that depends on the server: used once after a reconnect, when events may have been missed. */
export function invalidationPrefixesAfterGap(role: UserRole): InvalidationPrefix[] {
  const members: readonly ApiMember[] = role === "STUDENT" ? ["studentStudy", "studentWork"] : STAFF_MEMBERS;
  const prefixes: InvalidationPrefix[] = [NOTIFICATIONS, ...members.map((member) => key(member))];
  if (role === "STUDENT") prefixes.push(key("shell", "getStreak"));
  return prefixes;
}

export function prefixId(prefix: InvalidationPrefix): string {
  return prefix.join("/");
}

/** Drops repeats and method prefixes already covered by their member prefix. */
export function dedupePrefixes(prefixes: readonly InvalidationPrefix[]): InvalidationPrefix[] {
  const wholeMembers = new Set(prefixes.filter((prefix) => prefix.length === 1).map((prefix) => prefix[0]));
  const seen = new Set<string>();
  const result: InvalidationPrefix[] = [];
  for (const prefix of prefixes) {
    if (prefix.length === 2 && wholeMembers.has(prefix[0])) continue;
    const id = prefixId(prefix);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(prefix);
  }
  return result;
}
