/**
 * Route table: `ScreenId` (+ params) → expo-router href, and the rule for getting there.
 * Sources: docs/spec/00-unified-contract.md §3.1 – §3.3; docs/spec/90-addendum-2.md B.4 – B.7.
 *
 * Pure: no React, no expo-router — `navigate.ts` applies the result. Unit-tested in
 * `tests/shell-routes.test.ts`, which also checks that every pattern below has a route file.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
 * │ ROUTE TABLE (files under src/app; URL = the path without the `(group)` folders)                      │
 * ├───────────────────────────┬───────────────────────────────────────────────┬──────────────────────────┤
 * │ ScreenId                  │ URL (params; `?x` = query)                    │ Lives in                 │
 * ├───────────────────────────┼───────────────────────────────────────────────┼──────────────────────────┤
 * │ auth.launch               │ /                                             │ root stack               │
 * │ auth.login                │ /login                                        │ root stack (signed out)  │
 * │ shell.settings            │ /settings                                     │ root stack, push         │
 * │ shell.notifications       │ /notifications                                │ root stack, sheet        │
 * │ shell.numberSearch        │ /number-search                                │ root stack, modal        │
 * │ shared.fileViewer         │ /file-viewer ?files ?index                    │ root stack, full screen  │
 * │ (mock builds) Demo data   │ /demo                                         │ root stack               │
 * ├───────────────────────────┼───────────────────────────────────────────────┼──────────────────────────┤
 * │ student.home              │ /student                                      │ tab 1 «обзор» (stack)    │
 * │ student.lesson            │ /student/lesson                               │ tab 2 «урок»             │
 * │ student.homeworks         │ /student/homeworks                            │ tab 3 «дз» (stack)       │
 * │ student.homework          │ /student/homeworks/[assignmentId]             │ tab 3 stack              │
 * │ student.deadlines         │ /student/deadlines                            │ tab 4 «дедлайны»         │
 * │ student.theory            │ /student/theory                               │ tab 5 «теория»           │
 * │ student.info              │ /student/info                                 │ tab 6 «инфа» (tablet dock; a phone opens it from the profile) │
 * │ student.number            │ /student/numbers/[number]                     │ student stack, over tabs │
 * ├───────────────────────────┼───────────────────────────────────────────────┼──────────────────────────┤
 * │ teacher.home              │ /teacher                                      │ tab 1 «обзор»            │
 * │ content.topics            │ /teacher/topics                               │ tab «темы» (stack)       │
 * │ content.topic             │ /teacher/topics/[topicId]                     │ tab «темы» stack         │
 * │ teacher.students          │ /teacher/students                             │ tab «ученики»            │
 * │ groups.list               │ /teacher/groups                               │ tab «группы» (stack)     │
 * │ groups.detail             │ /teacher/groups/[groupId]                     │ tab «группы» stack       │
 * │ planner.lessons           │ /teacher/lessons                              │ tab «занятия» (stack)    │
 * │ planner.drafts            │ /teacher/homework-plans                       │ tab «занятия» (segment 2)│
 * │ calls.list                │ /teacher/calls ?studentId                     │ tab «звонки»             │
 * │ teacher.student.review    │ /teacher/students/[studentId] ?assignmentId   │ teacher stack, over tabs │
 * │ teacher.student.assign    │ /teacher/students/[studentId]/assign          │ teacher stack, over tabs │
 * │ teacher.student.lessons   │ /teacher/students/[studentId]/lessons         │ teacher stack, over tabs │
 * │ planner.lessonNew         │ /teacher/lessons/new ?groupId ?studentId      │ teacher stack, over tabs │
 * │ planner.lessonBoard       │ /teacher/lessons/[lessonId]                   │ teacher stack, over tabs │
 * │ planner.draftNew          │ /teacher/homework-plans/new ?lessonId ?groupId ?studentId │ teacher stack│
 * │ planner.draftBoard        │ /teacher/homework-plans/[planId]              │ teacher stack, over tabs │
 * │ content.number            │ /teacher/topics/[topicId]/numbers/[number]    │ teacher stack, over tabs │
 * ├───────────────────────────┼───────────────────────────────────────────────┼──────────────────────────┤
 * │ content.topics            │ /developer/topics                             │ tab 1 «темы» (stack)     │
 * │ content.topic             │ /developer/topics/[topicId]                   │ tab 1 stack              │
 * │ developer.accounts        │ /developer/accounts                           │ tab 2 «аккаунты»         │
 * │ calls.list                │ /developer/calls ?studentId                   │ tab 3 «звонки»           │
 * │ stats.main                │ /developer/statistics ?view ?studentId        │ tab 4 «статистика»       │
 * │ developer.panel           │ /developer/panel ?tab                         │ tab 5 «дев-панель» (stack)│
 * │ developer.journal         │ /developer/panel/journal ?outcome ?days       │ tab 5 stack              │
 * │ content.topicEdit         │ /developer/topics/[topicId]/edit              │ developer stack, over tabs│
 * │ content.number            │ /developer/topics/[topicId]/numbers/[number]  │ developer stack, over tabs│
 * └───────────────────────────┴───────────────────────────────────────────────┴──────────────────────────┘
 *
 * The role folders are route groups with one real segment inside — `(student)/student/…`,
 * `(teacher)/teacher/…`, `(developer)/developer/…` — so the three trees never share a URL (the same
 * paths as the site) and each group's layout is guarded by the role.
 *
 * HOW A LINK IS OPENED (`placement`):
 * - `tabRoot`    — everything above the tabs is dismissed, the tab is selected, its stack returns to the root.
 * - `tabDetail`  — the same for the tab root it belongs to, then the detail is pushed over it together
 *                  with the lists in between, so "back" always returns to the list (00 §3.1: a homework
 *                  opened from Home, Deadlines or a notification switches to the homework tab).
 * - `tabSegment` — a second root of the same tab (the teacher's homework drafts): the tab is selected and
 *                  its root is REPLACED, never pushed over.
 * - `stack`      — pushed in the role's stack above the tabs; the originating tab stays selected.
 * - `overlay`    — pushed in the root stack (settings, sheets, modals).
 * - `auth`       — never opened by a link; the session state decides.
 *
 * A link whose screen is not registered for the current role resolves to `null` and must be rendered as
 * plain text (A2 B.2): never a tappable element that bounces home.
 */
import type { DeveloperPanelTab, NavTarget, ScreenId, UserRole } from "@/api/types";

import { DEVELOPER_PANEL_TABS, HOME, isScreenRegisteredFor } from "./registry";

// ───────────────────────────── params ─────────────────────────────

/**
 * A file handed to the viewer: a stored file, a photo, or an already downloaded document (`localUri`).
 * `localUri` never travels in the URL: `openFiles` hands it over in memory (`viewer-handoff.ts`).
 */
export type FileViewerFile = { id: string; originalName: string; mimeType: string; size?: number; localUri?: string };

/** Route params of every screen (`undefined` = none). These are the props of the screen components. */
/** A non-default view of `stats.main` (the default, the progress view, has no query param). */
export type StatsViewParam = "teachers" | "developer";

export type ScreenParams = {
  "auth.launch": undefined;
  "auth.login": undefined;
  "shell.notifications": undefined;
  "shell.settings": undefined;
  "shell.numberSearch": undefined;
  "shared.fileViewer": { files: FileViewerFile[]; initialIndex?: number; title?: string };
  "student.home": undefined;
  "student.lesson": undefined;
  "student.homeworks": undefined;
  "student.homework": { assignmentId: string };
  "student.deadlines": undefined;
  "student.theory": undefined;
  "student.info": undefined;
  "student.number": { number: string };
  "teacher.home": undefined;
  "teacher.students": undefined;
  /** `assignmentId` — scroll the review list to that homework (history reference). */
  "teacher.student.review": { studentId: string; assignmentId?: string };
  "teacher.student.assign": { studentId: string };
  "teacher.student.lessons": { studentId: string };
  "content.topics": undefined;
  "content.topic": { topicId: string };
  "content.topicEdit": { topicId: string };
  "content.number": { topicId: string; number: string };
  "groups.list": undefined;
  "groups.detail": { groupId: string };
  "planner.lessons": undefined;
  "planner.drafts": undefined;
  /** Neither id = the target chooser; `groupId` = group lesson; `studentId` = individual lesson (N4). */
  "planner.lessonNew": { groupId?: string; studentId?: string };
  "planner.lessonBoard": { lessonId: string };
  /** Never opened without one of the three (the site answers 404). */
  "planner.draftNew": { lessonId?: string; groupId?: string; studentId?: string };
  "planner.draftBoard": { planId: string };
  /** `studentId` — the row is scrolled into view and flashed for 1500 ms; nothing is expanded. */
  "calls.list": { studentId?: string };
  "developer.accounts": undefined;
  /** Initial view and timeline student, like the site's `?view=teachers|developer` / `?studentId=` (06 §1.6). */
  "stats.main": { view?: StatsViewParam; studentId?: string };
  "developer.panel": { tab?: DeveloperPanelTab };
  /** Initial, editable filters. */
  "developer.journal": { outcome?: "failed"; days?: number };
};

/** A link to any screen: `{ screen }` plus that screen's params. Every `NavTarget` is an `AppLink`. */
export type AppLink = {
  [S in ScreenId]: ScreenParams[S] extends undefined ? { screen: S } : { screen: S } & ScreenParams[S];
}[ScreenId];

/** Compile-time proof that the notification / search targets are a subset of what the app can open. */
type AssertTargetsAreLinks = NavTarget extends AppLink ? true : never;
export const NAV_TARGETS_ARE_LINKS: AssertTargetsAreLinks = true;

/** What `router.push` takes: a pattern with `[param]` segments and string params (path and query). */
export type AppHref = { pathname: string; params?: Record<string, string> };

export type RoutePlacement = "auth" | "overlay" | "tabRoot" | "tabDetail" | "tabSegment" | "stack";

export type RouteDefinition = {
  /** URL pattern, e.g. "/student/homeworks/[assignmentId]". */
  pattern: string;
  placement: RoutePlacement;
  /**
   * `tabDetail` / `tabSegment`: pattern of the root of the tab the screen lives in. The lists between the
   * root and a detail are not listed here: every stack folder declares its list as the `anchor`, and the
   * detail is pushed `withAnchor`, so expo-router puts them underneath by itself.
   */
  root?: string;
};

// ───────────────────────────── the table ─────────────────────────────

const STUDENT_ROUTES: Partial<Record<ScreenId, RouteDefinition>> = {
  "student.home": { pattern: "/student", placement: "tabRoot" },
  "student.info": { pattern: "/student/info", placement: "tabRoot" },
  "student.lesson": { pattern: "/student/lesson", placement: "tabRoot" },
  "student.homeworks": { pattern: "/student/homeworks", placement: "tabRoot" },
  "student.homework": { pattern: "/student/homeworks/[assignmentId]", placement: "tabDetail", root: "/student/homeworks" },
  "student.deadlines": { pattern: "/student/deadlines", placement: "tabRoot" },
  "student.theory": { pattern: "/student/theory", placement: "tabRoot" },
  "student.number": { pattern: "/student/numbers/[number]", placement: "stack" },
};

const TEACHER_ROUTES: Partial<Record<ScreenId, RouteDefinition>> = {
  "teacher.home": { pattern: "/teacher", placement: "tabRoot" },
  "teacher.students": { pattern: "/teacher/students", placement: "tabRoot" },
  "planner.lessons": { pattern: "/teacher/lessons", placement: "tabRoot" },
  // The second segment of the same section: it replaces the lessons list, it is not pushed over it.
  "planner.drafts": { pattern: "/teacher/homework-plans", placement: "tabSegment", root: "/teacher/lessons" },
  "calls.list": { pattern: "/teacher/calls", placement: "tabRoot" },
  // Every primary section is a tab of its own; the phone dock shows five of them and «ещё».
  "content.topics": { pattern: "/teacher/topics", placement: "tabRoot" },
  "content.topic": { pattern: "/teacher/topics/[topicId]", placement: "tabDetail", root: "/teacher/topics" },
  "groups.list": { pattern: "/teacher/groups", placement: "tabRoot" },
  "groups.detail": { pattern: "/teacher/groups/[groupId]", placement: "tabDetail", root: "/teacher/groups" },
  "teacher.student.review": { pattern: "/teacher/students/[studentId]", placement: "stack" },
  "teacher.student.assign": { pattern: "/teacher/students/[studentId]/assign", placement: "stack" },
  "teacher.student.lessons": { pattern: "/teacher/students/[studentId]/lessons", placement: "stack" },
  "planner.lessonNew": { pattern: "/teacher/lessons/new", placement: "stack" },
  "planner.lessonBoard": { pattern: "/teacher/lessons/[lessonId]", placement: "stack" },
  "planner.draftNew": { pattern: "/teacher/homework-plans/new", placement: "stack" },
  "planner.draftBoard": { pattern: "/teacher/homework-plans/[planId]", placement: "stack" },
  "content.number": { pattern: "/teacher/topics/[topicId]/numbers/[number]", placement: "stack" },
};

const DEVELOPER_ROUTES: Partial<Record<ScreenId, RouteDefinition>> = {
  "content.topics": { pattern: "/developer/topics", placement: "tabRoot" },
  "content.topic": { pattern: "/developer/topics/[topicId]", placement: "tabDetail", root: "/developer/topics" },
  "developer.accounts": { pattern: "/developer/accounts", placement: "tabRoot" },
  "calls.list": { pattern: "/developer/calls", placement: "tabRoot" },
  "stats.main": { pattern: "/developer/statistics", placement: "tabRoot" },
  "developer.panel": { pattern: "/developer/panel", placement: "tabRoot" },
  "developer.journal": { pattern: "/developer/panel/journal", placement: "tabDetail", root: "/developer/panel" },
  // Opened from the topic and from a content-gap row of the statistics: one screen above the tabs.
  "content.topicEdit": { pattern: "/developer/topics/[topicId]/edit", placement: "stack" },
  "content.number": { pattern: "/developer/topics/[topicId]/numbers/[number]", placement: "stack" },
};

const SHARED_ROUTES: Partial<Record<ScreenId, RouteDefinition>> = {
  "auth.launch": { pattern: "/", placement: "auth" },
  "auth.login": { pattern: "/login", placement: "auth" },
  "shell.settings": { pattern: "/settings", placement: "overlay" },
  "shell.notifications": { pattern: "/notifications", placement: "overlay" },
  "shell.numberSearch": { pattern: "/number-search", placement: "overlay" },
  "shared.fileViewer": { pattern: "/file-viewer", placement: "overlay" },
};

const ROLE_ROUTES: Record<UserRole, Partial<Record<ScreenId, RouteDefinition>>> = {
  STUDENT: STUDENT_ROUTES,
  TEACHER: TEACHER_ROUTES,
  DEVELOPER: DEVELOPER_ROUTES,
};

/** Routes that are not registered screens: the mock-only "Demo data". */
export const EXTRA_ROUTES = {
  demoData: "/demo",
} as const;

/** Folder name of the tab navigator inside every role tree (a segment of `useSegments()`). */
export const TABS_SEGMENT = "(tabs)";

/** First path segment of the routes that sit in the root stack above a role's tree. */
export const OVERLAY_SEGMENTS: readonly string[] = ["settings", "notifications", "number-search", "file-viewer", "demo"];

/** The route of a screen for `role`; null when the screen is not mounted in that role's navigator. */
export function routeFor(screen: ScreenId, role: UserRole): RouteDefinition | null {
  const shared = SHARED_ROUTES[screen];
  if (shared) return shared;
  if (!isScreenRegisteredFor(screen, role)) return null;
  return ROLE_ROUTES[role][screen] ?? null;
}

/** Every `[pattern, placement]` of the table, for the route-file completeness test. */
export function allRoutePatterns(): string[] {
  const patterns = new Set<string>(Object.values(EXTRA_ROUTES));
  for (const table of [SHARED_ROUTES, STUDENT_ROUTES, TEACHER_ROUTES, DEVELOPER_ROUTES]) {
    for (const route of Object.values(table)) if (route) patterns.add(route.pattern);
  }
  return [...patterns].sort();
}

// ───────────────────────────── link → href ─────────────────────────────

function paramsOf(link: AppLink): Record<string, string> {
  const params: Record<string, string> = {};
  switch (link.screen) {
    case "shared.fileViewer":
      // References only: a `localUri` in a URL would let any deep link choose what the viewer shows.
      params.files = JSON.stringify(link.files.map(({ localUri: _handedOverInMemory, ...reference }) => reference));
      if (link.initialIndex !== undefined && link.initialIndex > 0) params.index = String(Math.floor(link.initialIndex));
      // `title` is not a URL param either (it would be shown in the app's own chrome): `viewer-handoff.ts`.
      break;
    case "student.homework":
      params.assignmentId = link.assignmentId;
      break;
    case "student.number":
      params.number = link.number;
      break;
    case "teacher.student.review":
      params.studentId = link.studentId;
      if (link.assignmentId) params.assignmentId = link.assignmentId;
      break;
    case "teacher.student.assign":
    case "teacher.student.lessons":
      params.studentId = link.studentId;
      break;
    case "content.topic":
    case "content.topicEdit":
      params.topicId = link.topicId;
      break;
    case "content.number":
      params.topicId = link.topicId;
      params.number = link.number;
      break;
    case "groups.detail":
      params.groupId = link.groupId;
      break;
    case "planner.lessonNew":
      if (link.groupId) params.groupId = link.groupId;
      else if (link.studentId) params.studentId = link.studentId;
      break;
    case "planner.lessonBoard":
      params.lessonId = link.lessonId;
      break;
    case "planner.draftNew":
      if (link.lessonId) params.lessonId = link.lessonId;
      if (link.groupId) params.groupId = link.groupId;
      if (link.studentId) params.studentId = link.studentId;
      break;
    case "planner.draftBoard":
      params.planId = link.planId;
      break;
    case "calls.list":
      if (link.studentId) params.studentId = link.studentId;
      break;
    case "developer.panel":
      // "status" is the default tab: no query, like the site's bare `/developer/panel`.
      if (link.tab && link.tab !== "status") params.tab = link.tab;
      break;
    case "stats.main":
      if (link.view) params.view = link.view;
      if (link.studentId) params.studentId = link.studentId;
      break;
    case "developer.journal":
      if (link.outcome === "failed") params.outcome = link.outcome;
      if (link.days !== undefined) params.days = String(link.days);
      break;
    default:
      break;
  }
  return params;
}

/** The href of a link for `role`; null when the role cannot open it. */
export function hrefFor(link: AppLink, role: UserRole): AppHref | null {
  const route = routeFor(link.screen, role);
  if (!route) return null;
  const params = paramsOf(link);
  return Object.keys(params).length > 0 ? { pathname: route.pattern, params } : { pathname: route.pattern };
}

/** Whether `role` can open `link` — render it as plain text otherwise. */
export function canOpen(link: AppLink | null | undefined, role: UserRole): link is AppLink {
  return link != null && routeFor(link.screen, role) !== null && routeFor(link.screen, role)?.placement !== "auth";
}

/** Where the role lands after sign-in and where "home" buttons lead. */
export function homeHref(role: UserRole): AppHref {
  const route = routeFor(HOME[role], role);
  // HOME is registered for its role by construction; the fallback only satisfies the type.
  return { pathname: route?.pattern ?? "/" };
}

export type NavigationPlan =
  /**
   * A screen inside a tab: go to the tab's `root`; then `replaceRoot` swaps it for a sibling root (a
   * segment), or `detail` is pushed over it together with its anchor lists.
   */
  | { kind: "tab"; root: AppHref; replaceRoot?: AppHref; detail?: AppHref }
  /** Push in the role's stack above the tabs (closing an open sheet / modal first). */
  | { kind: "stack"; href: AppHref }
  /** Push in the root stack. */
  | { kind: "overlay"; href: AppHref };

/** How to open `link` as `role`; null = not offered to this role (or an auth screen). */
export function planNavigation(link: AppLink, role: UserRole): NavigationPlan | null {
  const route = routeFor(link.screen, role);
  const href = hrefFor(link, role);
  if (!route || !href) return null;
  switch (route.placement) {
    case "auth":
      return null;
    case "stack":
    case "overlay":
      return { kind: route.placement, href };
    case "tabRoot":
      return { kind: "tab", root: href };
    case "tabSegment":
      return route.root ? { kind: "tab", root: { pathname: route.root }, replaceRoot: href } : null;
    case "tabDetail":
      return route.root ? { kind: "tab", root: { pathname: route.root }, detail: href } : null;
  }
}

/**
 * Tabs whose stack has several possible roots (`tabSegment`, 90-addendum-2 N1): the tab root pattern →
 * every segment that can be the bottom of its stack. A segment switch REPLACES the root, so the stack may
 * start with any of them; a link into the tab must land on the root that is there, not push another one.
 */
const TAB_SEGMENTS: Readonly<Record<string, readonly string[]>> = {
  "/teacher/lessons": ["/teacher/lessons", "/teacher/homework-plans"],
};

/**
 * The href that selects the tab of `tabRoot` without pushing inside its stack: the segment that is the
 * stack's first route now (`firstRouteName` = the route name in the tab's stack, the last path segment),
 * else the tab root itself (a tab without segments, or a stack that has not been created yet).
 */
export function tabLandingHref(tabRoot: AppHref, firstRouteName: string | null | undefined): AppHref {
  const segments = TAB_SEGMENTS[tabRoot.pathname];
  if (!segments || !firstRouteName) return tabRoot;
  const current = segments.find((pattern) => pattern.slice(pattern.lastIndexOf("/") + 1) === firstRouteName);
  return current ? { pathname: current } : tabRoot;
}

/**
 * Where the user is, from `useSegments()`: inside a tab ("tabs") or on a screen that sits above the tabs
 * ("above": a role-stack screen, settings, a sheet or a modal). Getting to a tab differs between the two.
 */
export function positionOf(segments: readonly string[]): "tabs" | "above" {
  return segments.includes(TABS_SEGMENT) && !OVERLAY_SEGMENTS.includes(segments[0] ?? "") ? "tabs" : "above";
}

/** Fills the `[param]` segments and appends the rest as a query — the concrete URL (tests, logs, web links). */
export function hrefToPath(href: AppHref): string {
  const rest = { ...(href.params ?? {}) };
  const path = href.pathname.replace(/\[([^\]]+)\]/g, (_match, name: string) => {
    const value = rest[name] ?? "";
    delete rest[name];
    return encodeURIComponent(value);
  });
  const query = Object.entries(rest)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? `${path}?${query}` : path;
}

// ───────────────────────────── params → props (route files) ─────────────────────────────

type RawParam = string | string[] | undefined;

/** A single string out of an expo-router param (arrays come from repeated query keys). */
export function stringParam(value: RawParam): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === "string" && single.length > 0 ? single : undefined;
}

/** Like `stringParam`, but "" when missing — for required path params (the screen then shows "not found"). */
export function requiredParam(value: RawParam): string {
  return stringParam(value) ?? "";
}

export function panelTabParam(value: RawParam): DeveloperPanelTab {
  const raw = stringParam(value);
  return (DEVELOPER_PANEL_TABS as readonly string[]).includes(raw ?? "") ? (raw as DeveloperPanelTab) : "status";
}

/**
 * `view` of the statistics page, parsed like the site (teacher/statistics/page.tsx): "teachers" and
 * "developer" are honoured, anything else is the default progress view (undefined).
 */
export function statsViewParam(value: RawParam): StatsViewParam | undefined {
  const raw = stringParam(value);
  return raw === "teachers" || raw === "developer" ? raw : undefined;
}

/** `outcome` is honoured only when it equals "failed" (A2 B.6 rule 2). */
export function journalOutcomeParam(value: RawParam): "failed" | undefined {
  return stringParam(value) === "failed" ? "failed" : undefined;
}

/** A finite number in 0..365 (floored); anything else → undefined (the screen applies its default of 7). */
export function journalDaysParam(value: RawParam): number | undefined {
  const raw = stringParam(value);
  if (raw === undefined) return undefined;
  const days = Number(raw);
  return Number.isFinite(days) && days >= 0 && days <= 365 ? Math.floor(days) : undefined;
}

/**
 * Parses the `files` param of the viewer route; anything malformed yields an empty list. A `localUri` in
 * the param is ignored on purpose (the param is untrusted input, see `viewer-handoff.ts`).
 */
export function fileViewerFilesParam(value: RawParam): FileViewerFile[] {
  const raw = stringParam(value);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const files: FileViewerFile[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const { id, originalName, mimeType, size } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof originalName !== "string" || typeof mimeType !== "string") continue;
    const file: FileViewerFile = { id, originalName, mimeType };
    if (typeof size === "number" && Number.isFinite(size)) file.size = size;
    files.push(file);
  }
  return files;
}

export function indexParam(value: RawParam): number {
  const index = Number(stringParam(value));
  return Number.isInteger(index) && index > 0 ? index : 0;
}

// ───────────────────────────── untrusted link → AppLink ─────────────────────────────

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Validates a link that crossed a boundary as plain data (the payload of a tapped local reminder).
 * Unknown screens and missing required params yield null.
 */
export function parseAppLink(raw: unknown): AppLink | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  switch (data.screen) {
    case "student.home":
    case "student.lesson":
    case "student.homeworks":
    case "student.deadlines":
    case "student.theory":
    case "student.info":
    case "teacher.home":
    case "teacher.students":
    case "content.topics":
    case "groups.list":
    case "planner.lessons":
    case "planner.drafts":
    case "developer.accounts":
    case "shell.settings":
    case "shell.notifications":
      return { screen: data.screen };
    case "student.homework": {
      const assignmentId = text(data.assignmentId);
      return assignmentId ? { screen: "student.homework", assignmentId } : null;
    }
    case "student.number": {
      const number = text(data.number);
      return number ? { screen: "student.number", number } : null;
    }
    case "content.number": {
      const topicId = text(data.topicId);
      const number = text(data.number);
      return topicId && number ? { screen: "content.number", topicId, number } : null;
    }
    case "calls.list": {
      const studentId = text(data.studentId);
      return studentId ? { screen: "calls.list", studentId } : { screen: "calls.list" };
    }
    case "planner.lessonBoard": {
      const lessonId = text(data.lessonId);
      return lessonId ? { screen: "planner.lessonBoard", lessonId } : null;
    }
    case "teacher.student.review": {
      const studentId = text(data.studentId);
      if (!studentId) return null;
      const assignmentId = text(data.assignmentId);
      return assignmentId ? { screen: "teacher.student.review", studentId, assignmentId } : { screen: "teacher.student.review", studentId };
    }
    case "stats.main": {
      const link: AppLink = { screen: "stats.main" };
      const view = statsViewParam(text(data.view));
      if (view) link.view = view;
      const studentId = text(data.studentId);
      if (studentId) link.studentId = studentId;
      return link;
    }
    case "developer.panel":
      return { screen: "developer.panel", tab: panelTabParam(text(data.tab)) };
    case "developer.journal": {
      const link: AppLink = { screen: "developer.journal" };
      if (data.outcome === "failed") link.outcome = "failed";
      if (typeof data.days === "number" && Number.isFinite(data.days)) link.days = Math.floor(data.days);
      return link;
    }
    default:
      return null;
  }
}
