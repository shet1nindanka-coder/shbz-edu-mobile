/**
 * Screen registry: every `ScreenId`, the roles it is registered for, its site route, and each role's
 * primary sections (label key, site path, placement) in site order.
 * Sources: docs/spec/90-addendum-2.md B.4 – B.5; docs/spec/00-unified-contract.md §3.1 – §3.2.
 *
 * Pure data + helpers: no React, no expo-router. The shell maps `ScreenId` → routes on top of this.
 *
 * Rules (00 §3.1, A2 B.7):
 * - A screen is mounted only in the navigator of a role it is registered for.
 * - A link / notification target / history reference whose screen is not registered for the current role is
 *   NOT offered (plain text or omitted) — never a tappable element that bounces to the home screen.
 * - `planner.lessons` and `planner.drafts` share one section and one highlight.
 */
import type { NavSection, ScreenId, UserRole } from "@/api/types";

export type { NavSection, ScreenId };

/** Which part of the app a screen belongs to: 6 shared, 8 student, 22 staff. */
export type ScreenArea = "shared" | "student" | "staff";

export type ScreenDefinition = {
  id: ScreenId;
  area: ScreenArea;
  /** Roles the screen is registered for (`●` in A2 B.4). */
  roles: readonly UserRole[];
  /**
   * Roles the site guard allows but that are out of scope in v1 (`○` in A2 B.4, decisions N2 / N3):
   * the screen is NOT mounted for them.
   */
  deferredRoles: readonly UserRole[];
  /**
   * Site routes of the screen, for traceability only (`{param}` = dynamic segment). Staff routes are written
   * with the `/teacher` prefix; `/developer/…` is the same path (site rewrite). Empty = no route on the site
   * (a header control or a panel).
   */
  siteRoutes: readonly string[];
  /** Owner spec section that describes the screen. */
  owner: string;
};

const ALL_ROLES: readonly UserRole[] = ["TEACHER", "DEVELOPER", "STUDENT"];
const STUDENT_ONLY: readonly UserRole[] = ["STUDENT"];
const TEACHER_ONLY: readonly UserRole[] = ["TEACHER"];
const DEVELOPER_ONLY: readonly UserRole[] = ["DEVELOPER"];
const STAFF: readonly UserRole[] = ["TEACHER", "DEVELOPER"];
const NONE: readonly UserRole[] = [];

function screen(
  id: ScreenId,
  area: ScreenArea,
  roles: readonly UserRole[],
  siteRoutes: readonly string[],
  owner: string,
  deferredRoles: readonly UserRole[] = NONE,
): ScreenDefinition {
  return { id, area, roles, deferredRoles, siteRoutes, owner };
}

/** The 36 registered screens, in the order of A2 B.4. */
export const SCREENS: Readonly<Record<ScreenId, ScreenDefinition>> = {
  // ── shell and shared ──
  "auth.launch": screen("auth.launch", "shared", ALL_ROLES, ["/", "/dashboard"], "01 §1.1"),
  "auth.login": screen("auth.login", "shared", ALL_ROLES, ["/login"], "01 §1.2"),
  "shell.notifications": screen("shell.notifications", "shared", ALL_ROLES, [], "01 §1.4"),
  "shell.settings": screen(
    "shell.settings",
    "shared",
    ALL_ROLES,
    ["/teacher/settings", "/developer/settings", "/student/settings"],
    "01 §1.5, 08 §9.2",
  ),
  "shell.numberSearch": screen("shell.numberSearch", "shared", ALL_ROLES, [], "01 §3.9"),
  "shared.fileViewer": screen("shared.fileViewer", "shared", ALL_ROLES, ["/files/{fileId}"], "09 §5.2"),

  // ── STUDENT ──
  "student.home": screen("student.home", "student", STUDENT_ONLY, ["/student"], "02 S1"),
  "student.lesson": screen("student.lesson", "student", STUDENT_ONLY, ["/student/lesson"], "03 L1 / L2"),
  "student.homeworks": screen("student.homeworks", "student", STUDENT_ONLY, ["/student/homeworks"], "03 H1"),
  "student.homework": screen("student.homework", "student", STUDENT_ONLY, ["/student/homeworks/{assignmentId}"], "03 H2 – H4"),
  "student.deadlines": screen("student.deadlines", "student", STUDENT_ONLY, ["/student/deadlines"], "02 S4"),
  "student.theory": screen("student.theory", "student", STUDENT_ONLY, ["/student/theory"], "02 S2"),
  "student.info": screen("student.info", "student", STUDENT_ONLY, ["/student/info"], "02 S5"),
  "student.number": screen("student.number", "student", STUDENT_ONLY, ["/student/numbers/{number}"], "02 S3"),

  // ── TEACHER and DEVELOPER ──
  "teacher.home": screen("teacher.home", "staff", TEACHER_ONLY, ["/teacher"], "04 S1"),
  "content.topics": screen("content.topics", "staff", STAFF, ["/teacher/topics"], "07 §1.1, §1.4, §1.5"),
  "content.topic": screen("content.topic", "staff", STAFF, ["/teacher/topics/{topicId}"], "07 §1.2"),
  "content.topicEdit": screen("content.topicEdit", "staff", DEVELOPER_ONLY, ["/teacher/topics/{topicId}/edit"], "07 §1.3, §1.5"),
  "content.number": screen("content.number", "staff", STAFF, ["/teacher/topics/{topicId}/numbers/{number}"], "07 §1.4b"),
  "teacher.students": screen("teacher.students", "staff", TEACHER_ONLY, ["/teacher/students"], "04 S2"),
  "teacher.student.review": screen("teacher.student.review", "staff", TEACHER_ONLY, ["/teacher/students/{studentId}"], "04 S3, S4, S8"),
  "teacher.student.assign": screen("teacher.student.assign", "staff", TEACHER_ONLY, ["/teacher/students/{studentId}/assign"], "04 S5"),
  "teacher.student.lessons": screen("teacher.student.lessons", "staff", TEACHER_ONLY, ["/teacher/students/{studentId}/lessons"], "04 S6"),
  "groups.list": screen("groups.list", "staff", TEACHER_ONLY, ["/teacher/groups"], "06 §1.1", DEVELOPER_ONLY),
  "groups.detail": screen("groups.detail", "staff", TEACHER_ONLY, ["/teacher/groups/{groupId}"], "06 §1.2, §1.3", DEVELOPER_ONLY),
  "planner.lessons": screen("planner.lessons", "staff", TEACHER_ONLY, ["/teacher/lessons"], "05 §1.1", DEVELOPER_ONLY),
  "planner.drafts": screen("planner.drafts", "staff", TEACHER_ONLY, ["/teacher/homework-plans"], "05 §1.5", DEVELOPER_ONLY),
  "planner.lessonNew": screen(
    "planner.lessonNew",
    "staff",
    TEACHER_ONLY,
    ["/teacher/lessons/new", "/teacher/students/{studentId}/lessons/new"],
    "05 §1.2 (= 04 S7)",
    DEVELOPER_ONLY,
  ),
  "planner.lessonBoard": screen("planner.lessonBoard", "staff", TEACHER_ONLY, ["/teacher/lessons/{lessonId}"], "05 §1.3, §1.4", DEVELOPER_ONLY),
  "planner.draftNew": screen("planner.draftNew", "staff", TEACHER_ONLY, ["/teacher/homework-plans/new"], "05 §1.6", DEVELOPER_ONLY),
  "planner.draftBoard": screen("planner.draftBoard", "staff", TEACHER_ONLY, ["/teacher/homework-plans/{planId}"], "05 §1.7", DEVELOPER_ONLY),
  "calls.list": screen("calls.list", "staff", STAFF, ["/teacher/calls"], "06 §1.4"),
  "developer.accounts": screen("developer.accounts", "staff", DEVELOPER_ONLY, ["/teacher/accounts"], "04 S9"),
  "stats.main": screen("stats.main", "staff", DEVELOPER_ONLY, ["/teacher/statistics"], "06 §1.6"),
  "developer.panel": screen("developer.panel", "staff", DEVELOPER_ONLY, ["/teacher/panel"], "07 §1.9"),
  "developer.journal": screen("developer.journal", "staff", DEVELOPER_ONLY, ["/teacher/panel/journal"], "07 §1.10"),
};

/** Every `ScreenId`, in registry order. */
export const SCREEN_IDS = Object.keys(SCREENS) as readonly ScreenId[];

/** True when `value` is a registered `ScreenId`. */
export function isScreenId(value: string): value is ScreenId {
  return Object.prototype.hasOwnProperty.call(SCREENS, value);
}

/** True when the screen is mounted in the navigator of `role`. */
export function isScreenRegisteredFor(screenId: ScreenId, role: UserRole): boolean {
  return SCREENS[screenId].roles.includes(role);
}

/** The screens registered for `role`, in registry order. */
export function screensForRole(role: UserRole): readonly ScreenId[] {
  return SCREEN_IDS.filter((id) => isScreenRegisteredFor(id, role));
}

// ───────────────────────────── primary sections ─────────────────────────────

/** Primary sections of each role's root navigator, in site order (without the settings gear). */
export const SECTIONS: Readonly<Record<UserRole, readonly ScreenId[]>> = {
  STUDENT: ["student.home", "student.lesson", "student.homeworks", "student.deadlines", "student.theory", "student.info"],
  TEACHER: ["teacher.home", "content.topics", "teacher.students", "groups.list", "planner.lessons", "calls.list"],
  DEVELOPER: ["content.topics", "developer.accounts", "calls.list", "stats.main", "developer.panel"],
};

/** Role home: where the app lands after sign-in and where the logo leads. */
export const HOME: Readonly<Record<UserRole, ScreenId>> = {
  STUDENT: "student.home",
  TEACHER: "teacher.home",
  DEVELOPER: "content.topics",
};

/**
 * The navigation model of each role: its primary sections in site order, then the settings gear.
 * `labelKey` is a path under `dict` (the lower-case `dict.nav.<role>.<item>` strings); `placement` is where
 * the section sits on a PHONE (docs/design/glass-over-paper.md §5): "tab" — in the dock; "more" — not in
 * the phone dock (the teacher's topics and calls are behind «ещё», the student's info is in the profile);
 * a tablet shows every section in the dock. STUDENT: 5 + info; TEACHER: обзор · ученики · группы · занятия
 * + «ещё» (the owner's decision: groups in the dock, calls behind «ещё»); DEVELOPER: exactly 5.
 */
export const NAV_SECTIONS: Readonly<Record<UserRole, readonly NavSection[]>> = {
  STUDENT: [
    { screen: "student.home", labelKey: "nav.student.overview", webPath: "/student", placement: "tab" },
    { screen: "student.lesson", labelKey: "nav.student.lesson", webPath: "/student/lesson", placement: "tab" },
    { screen: "student.homeworks", labelKey: "nav.student.homeworks", webPath: "/student/homeworks", placement: "tab" },
    { screen: "student.deadlines", labelKey: "nav.student.deadlines", webPath: "/student/deadlines", placement: "tab" },
    { screen: "student.theory", labelKey: "nav.student.theory", webPath: "/student/theory", placement: "tab" },
    { screen: "student.info", labelKey: "nav.student.info", webPath: "/student/info", placement: "more" },
    { screen: "shell.settings", labelKey: "nav.student.settings", webPath: "/student/settings", placement: "gear" },
  ],
  TEACHER: [
    { screen: "teacher.home", labelKey: "nav.teacher.overview", webPath: "/teacher", placement: "tab" },
    { screen: "content.topics", labelKey: "nav.teacher.topics", webPath: "/teacher/topics", placement: "more" },
    { screen: "teacher.students", labelKey: "nav.teacher.students", webPath: "/teacher/students", placement: "tab" },
    { screen: "groups.list", labelKey: "nav.teacher.groups", webPath: "/teacher/groups", placement: "tab" },
    { screen: "planner.lessons", labelKey: "nav.teacher.lessons", webPath: "/teacher/lessons", placement: "tab" },
    { screen: "calls.list", labelKey: "nav.teacher.calls", webPath: "/teacher/calls", placement: "more" },
    { screen: "shell.settings", labelKey: "nav.teacher.settings", webPath: "/teacher/settings", placement: "gear" },
  ],
  DEVELOPER: [
    { screen: "content.topics", labelKey: "nav.developer.topics", webPath: "/developer/topics", placement: "tab" },
    { screen: "developer.accounts", labelKey: "nav.developer.accounts", webPath: "/developer/accounts", placement: "tab" },
    { screen: "calls.list", labelKey: "nav.developer.calls", webPath: "/developer/calls", placement: "tab" },
    { screen: "stats.main", labelKey: "nav.developer.statistics", webPath: "/developer/statistics", placement: "tab" },
    { screen: "developer.panel", labelKey: "nav.developer.panel", webPath: "/developer/panel", placement: "tab" },
    { screen: "shell.settings", labelKey: "nav.developer.settings", webPath: "/developer/settings", placement: "gear" },
  ],
};

/** Sections of `role` with the given placement, in site order. */
export function navSections(role: UserRole, placement?: NavSection["placement"]): readonly NavSection[] {
  const sections = NAV_SECTIONS[role];
  return placement === undefined ? sections : sections.filter((section) => section.placement === placement);
}

/** The section entry of `screenId` for `role`, or null when the screen is not a primary section of that role. */
export function findNavSection(role: UserRole, screenId: ScreenId): NavSection | null {
  return NAV_SECTIONS[role].find((section) => section.screen === screenId) ?? null;
}

/**
 * Screens that belong to one primary section although only the first is listed in `SECTIONS`:
 * the teacher's "занятия / lessons" section is a two-segment root — «Уроки» (`planner.lessons`, default)
 * and «Домашние задания» (`planner.drafts`) — like the site's `isPlannerPath`.
 */
export const SECTION_SEGMENTS: Readonly<Partial<Record<ScreenId, readonly ScreenId[]>>> = {
  "planner.lessons": ["planner.lessons", "planner.drafts"],
};

/** Tabs of `developer.panel`, in site order; an unknown value falls back to the first ("status"). */
export const DEVELOPER_PANEL_TABS = ["status", "actions", "broadcast", "settings"] as const;
