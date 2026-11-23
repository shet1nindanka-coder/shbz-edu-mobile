/**
 * The primary sections of each role as the navigators and the dock need them
 * (docs/design/glass-over-paper.md §5):
 *
 * - `tabsForRole(role)` — the tab ROUTES of the role's tab navigator: every primary section is one, in site
 *   order, so a section keeps its own stack and its state whichever device shows it in the dock.
 * - `dockSections(role, layout)` — what the bottom dock shows. A phone has room for five items: the
 *   registry's `placement: "tab"` sections. A tablet shows all of them.
 * - `dockOverflow(role, layout)` — sections the phone dock has no room for and that have no other entrance:
 *   they live in the sheet behind the «ещё» item (the teacher's topics and calls; settings join them there).
 *   The student's «общая инфа» is not there: on a phone it is opened from the profile.
 *
 * Pure data. `NAV_SECTIONS` of the registry stays the source of the order, the label keys and the placement.
 */
import type { NavSection, ScreenId, UserRole } from "@/api/types";

import { NAV_SECTIONS, SECTION_SEGMENTS } from "./registry";

export type DockLayout = "phone" | "tablet";

export type TabDefinition = {
  /** Route name inside the role's `(tabs)` folder. */
  name: string;
  /** The primary section the tab holds. */
  section: ScreenId;
  /** Dictionary path of the lower-case label (`nav.<role>.<item>`). */
  labelKey: string;
};

/** Route name of every primary section, per role. */
const TAB_ROUTE_NAMES: Record<UserRole, Partial<Record<ScreenId, string>>> = {
  STUDENT: {
    "student.home": "(home)",
    "student.lesson": "lesson",
    "student.homeworks": "homeworks",
    "student.deadlines": "deadlines",
    "student.theory": "theory",
    "student.info": "info",
  },
  TEACHER: {
    "teacher.home": "(home)",
    "content.topics": "topics",
    "teacher.students": "students",
    "groups.list": "groups",
    "planner.lessons": "(planner)",
    "calls.list": "calls",
  },
  DEVELOPER: {
    "content.topics": "topics",
    "developer.accounts": "accounts",
    "calls.list": "calls",
    "stats.main": "statistics",
    "developer.panel": "panel",
  },
};

/** The primary sections of `role` (without the settings gear), in site order. */
function primarySections(role: UserRole): NavSection[] {
  return NAV_SECTIONS[role].filter((section) => section.placement !== "gear");
}

/** Tab routes of `role` in site order: one per primary section. */
export function tabsForRole(role: UserRole): TabDefinition[] {
  const tabs: TabDefinition[] = [];
  for (const section of primarySections(role)) {
    const name = TAB_ROUTE_NAMES[role][section.screen];
    if (name) tabs.push({ name, section: section.screen, labelKey: section.labelKey });
  }
  return tabs;
}

/** Sections shown in the dock: the five `tab` sections on a phone, every primary section on a tablet. */
export function dockSections(role: UserRole, layout: DockLayout): NavSection[] {
  const sections = primarySections(role);
  return layout === "tablet" ? sections : sections.filter((section) => section.placement === "tab");
}

/** Whether the phone dock ends with «ещё»: only where sections would otherwise have no entrance. */
export function dockHasMore(role: UserRole, layout: DockLayout): boolean {
  return layout === "phone" && role === "TEACHER";
}

/** Sections behind «ещё», in site order (settings are appended by the sheet itself). */
export function dockOverflow(role: UserRole, layout: DockLayout): NavSection[] {
  if (!dockHasMore(role, layout)) return [];
  return primarySections(role).filter((section) => section.placement === "more");
}

/** Sections that are not in the phone dock (`placement: "more"`), in site order. */
export function moreSections(role: UserRole) {
  return NAV_SECTIONS[role].filter((section) => section.placement === "more");
}

/** URL prefixes that belong to a section besides its own `webPath`. */
const EXTRA_SECTION_PATHS: Readonly<Partial<Record<ScreenId, readonly string[]>>> = {
  // A number is opened from a homework: the «дз» item stays lit, as on the site.
  "student.homeworks": ["/student/numbers"],
  "planner.lessons": ["/teacher/homework-plans"],
};

function pathMatches(pathname: string, prefix: string, exact: boolean): boolean {
  if (pathname === prefix) return true;
  return !exact && pathname.startsWith(`${prefix}/`);
}

/**
 * The primary section a path belongs to, or null (settings and the other screens above the role tree).
 * The role home (`/student`, `/teacher`) matches only itself; every other section owns its sub-paths.
 */
export function sectionOfPath(role: UserRole, pathname: string): ScreenId | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: { screen: ScreenId; length: number } | null = null;
  for (const section of primarySections(role)) {
    const home = section.webPath.split("/").filter(Boolean).length === 1;
    const prefixes = [section.webPath, ...(EXTRA_SECTION_PATHS[section.screen] ?? [])];
    for (const prefix of prefixes) {
      if (pathMatches(path, prefix, home && prefix === section.webPath) && (!best || prefix.length > best.length)) {
        best = { screen: section.screen, length: prefix.length };
      }
    }
  }
  return best?.screen ?? null;
}

/**
 * Which dock item is lit for `pathname`: the index in `dockSections`, `dockSections.length` for «ещё»
 * (a section of the overflow sheet, or settings where the dock has «ещё»), or -1 — no lens.
 */
export function dockActiveIndex(role: UserRole, layout: DockLayout, pathname: string): number {
  const sections = dockSections(role, layout);
  const section = sectionOfPath(role, pathname);
  if (section !== null) {
    const direct = sections.findIndex((candidate) => candidate.screen === section);
    if (direct >= 0) return direct;
    return dockHasMore(role, layout) ? sections.length : -1;
  }
  const settings = pathname === "/settings" || pathname.startsWith("/settings/");
  return settings && dockHasMore(role, layout) ? sections.length : -1;
}

/** Screens of one section besides its first (`SECTION_SEGMENTS`), re-exported for the dock's callers. */
export { SECTION_SEGMENTS };

/** Last segment of a label key: "nav.teacher.lessons" → "lessons" (the key of `navIcons.<role>` and `m.shell.tabs`). */
export function navItemOf(labelKey: string): string {
  return labelKey.slice(labelKey.lastIndexOf(".") + 1);
}

/** Reads `dict.nav.<role>.<item>` by its label key; "" for an unknown key. */
export function navLabel(dictNav: Record<string, unknown>, labelKey: string): string {
  const [, role, item] = labelKey.split(".");
  const group = role ? dictNav[role] : undefined;
  if (typeof group !== "object" || group === null || !item) return "";
  const value = (group as Record<string, unknown>)[item];
  return typeof value === "string" ? value : "";
}
