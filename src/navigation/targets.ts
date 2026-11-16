/**
 * Link targets: the only thing the app navigates by is a `NavTarget`.
 * Sources: docs/spec/90-addendum-2.md B.6; docs/spec/00-unified-contract.md §3.3.
 *
 * `resolveHrefTarget` is the one pure mapping from a stored site path to a target, shared by the (future)
 * server and the mock: `NotificationItem.target` is computed with it, so the app itself never parses site
 * paths. The other two sources of targets get structured fields instead of an href — number search
 * (`NumberFindResult`) and progress-history references — and have their own tiny builders below.
 *
 * Pure: no React, no expo-router, no `URL` (not reliable on every runtime).
 */
import type { DeveloperPanelTab, NavTarget, NumberFindResult, ProgressHistoryReference, UserRole } from "@/api/types";

import { DEVELOPER_PANEL_TABS, isScreenRegisteredFor } from "./registry";

export type { NavTarget };

/** Default `days` filter of the journal (the site page falls back to it for a missing or invalid value). */
export const JOURNAL_DEFAULT_DAYS = 7;
const JOURNAL_MAX_DAYS = 365;
const HOMEWORK_HASH_PREFIX = "homework-";

type ParsedHref = { segments: string[]; query: ReadonlyMap<string, string>; hash: string };

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Splits a site path into decoded path segments, query and hash. null = not a site path or malformed encoding. */
function parseHref(href: string): ParsedHref | null {
  // Only site-relative paths are targets; absolute and protocol-relative URLs are never opened.
  if (!href.startsWith("/") || href.startsWith("//")) return null;

  const hashAt = href.indexOf("#");
  const rawHash = hashAt === -1 ? "" : href.slice(hashAt + 1);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const rawQuery = queryAt === -1 ? "" : beforeHash.slice(queryAt + 1);
  const rawPath = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);

  const segments: string[] = [];
  for (const raw of rawPath.split("/")) {
    if (raw === "") continue;
    const segment = decode(raw);
    if (segment === null) return null;
    segments.push(segment);
  }

  const query = new Map<string, string>();
  for (const pair of rawQuery.split("&")) {
    if (pair === "") continue;
    const equalsAt = pair.indexOf("=");
    const key = decode((equalsAt === -1 ? pair : pair.slice(0, equalsAt)).replace(/\+/g, " "));
    const value = decode((equalsAt === -1 ? "" : pair.slice(equalsAt + 1)).replace(/\+/g, " "));
    if (key === null || value === null) return null;
    // The first occurrence wins, as with a single-valued search parameter.
    if (!query.has(key)) query.set(key, value);
  }

  const hash = decode(rawHash);
  if (hash === null) return null;

  return { segments, query, hash };
}

/** Port of the site's `parseDeveloperPanelTab`: a known tab, anything else → "status". */
export function parseDeveloperPanelTab(raw: string | undefined): DeveloperPanelTab {
  return DEVELOPER_PANEL_TABS.find((tab) => tab === raw) ?? "status";
}

/** Port of the journal page's `parseDays`: a finite number in 0..365 (floored), anything else → 7. */
export function parseJournalDays(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= JOURNAL_MAX_DAYS ? Math.floor(parsed) : JOURNAL_DEFAULT_DAYS;
}

function studentTarget(rest: readonly string[]): NavTarget | null {
  const [section, id] = rest;
  if (section === "homeworks" && rest.length === 1) return { screen: "student.homeworks" };
  if (section === "homeworks" && rest.length === 2 && id) return { screen: "student.homework", assignmentId: id };
  if (section === "numbers" && rest.length === 2 && id) return { screen: "student.number", number: id };
  return null;
}

function staffTarget(rest: readonly string[], query: ReadonlyMap<string, string>, hash: string): NavTarget | null {
  const [section, id, sub, subId] = rest;

  if (section === "calls" && rest.length === 1) {
    const studentId = query.get("studentId");
    return studentId ? { screen: "calls.list", studentId } : null;
  }

  if (section === "panel" && rest.length === 1) {
    return { screen: "developer.panel", tab: parseDeveloperPanelTab(query.get("tab")) };
  }

  if (section === "panel" && id === "journal" && rest.length === 2) {
    const days = parseJournalDays(query.get("days"));
    return query.get("outcome") === "failed"
      ? { screen: "developer.journal", outcome: "failed", days }
      : { screen: "developer.journal", days };
  }

  if (section === "topics" && sub === "numbers" && rest.length === 4 && id && subId) {
    return { screen: "content.number", topicId: id, number: subId };
  }

  // "/lessons/new" is the compose form, not a lesson id.
  if (section === "lessons" && rest.length === 2 && id && id !== "new") {
    return { screen: "planner.lessonBoard", lessonId: id };
  }

  if (section === "students" && rest.length === 2 && id) {
    const assignmentId = hash.startsWith(HOMEWORK_HASH_PREFIX) ? hash.slice(HOMEWORK_HASH_PREFIX.length) : "";
    return assignmentId
      ? { screen: "teacher.student.review", studentId: id, assignmentId }
      : { screen: "teacher.student.review", studentId: id };
  }

  return null;
}

/** Rule 3: a target whose screen is not registered for `role` may not be opened → null. */
export function targetForRole(target: NavTarget | null, role: UserRole): NavTarget | null {
  return target !== null && isScreenRegisteredFor(target.screen, role) ? target : null;
}

/**
 * Maps a stored site path (`Notification.href`, a history-reference href) to a `NavTarget`.
 * Returns null when nothing may be opened.
 *
 * 1. `/developer/…` and `/teacher/…` are the same path (site rewrite); path segments are URL-decoded.
 * 2. `tab` → `parseDeveloperPanelTab`; `days` → `parseJournalDays`; `outcome` is honoured only when it
 *    equals "failed".
 * 3. A resolved screen that is not registered for `role` → null (e.g. a lesson reference for a DEVELOPER).
 * 4. Any other href → null. The app does not open unknown paths in a browser.
 */
export function resolveHrefTarget(href: string | null, role: UserRole): NavTarget | null {
  if (href === null) return null;
  const parsed = parseHref(href);
  if (parsed === null) return null;

  const [prefix, ...rest] = parsed.segments;
  let target: NavTarget | null = null;
  if (prefix === "student") {
    target = studentTarget(rest);
  } else if (prefix === "teacher" || prefix === "developer") {
    target = staffTarget(rest, parsed.query, parsed.hash);
  }
  return targetForRole(target, role);
}

/**
 * Target of a number-search result: STUDENT → `student.number { number }`;
 * TEACHER / DEVELOPER → `content.number { topicId, number }`.
 */
export function numberFindTarget(result: Pick<NumberFindResult, "number" | "topicId">, role: UserRole): NavTarget | null {
  const target: NavTarget =
    role === "STUDENT"
      ? { screen: "student.number", number: result.number }
      : { screen: "content.number", topicId: result.topicId, number: result.number };
  return targetForRole(target, role);
}

/**
 * Target of a progress-history reference: `lesson` → `planner.lessonBoard { lessonId }` (TEACHER only —
 * plain text for a DEVELOPER); `homework` → `teacher.student.review { studentId, assignmentId }` (TEACHER only).
 * `studentId` is the student whose history is shown.
 */
export function historyReferenceTarget(
  reference: ProgressHistoryReference | null,
  studentId: string,
  role: UserRole,
): NavTarget | null {
  if (reference === null) return null;
  const target: NavTarget =
    reference.kind === "lesson"
      ? { screen: "planner.lessonBoard", lessonId: reference.lessonId }
      : { screen: "teacher.student.review", studentId, assignmentId: reference.assignmentId };
  return targetForRole(target, role);
}
