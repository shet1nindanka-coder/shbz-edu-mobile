/**
 * The bottom tab bar of each role (docs/spec/00-unified-contract.md §3.1): which primary sections are
 * tabs, in site order, and the route name of each tab inside `(tabs)`.
 *
 * Pure data. `NAV_SECTIONS` of the registry stays the source of the order and the label keys; this file
 * only adds what the navigator needs (route names, the «ещё» tab).
 */
import type { ScreenId, UserRole } from "@/api/types";

import { NAV_SECTIONS } from "./registry";

export type TabDefinition = {
  /** Route name inside the role's `(tabs)` folder. */
  name: string;
  /** The primary section the tab opens, or "more" for the teacher's «ещё» list. */
  section: ScreenId | "more";
  /** Dictionary path of the lower-case label (`nav.<role>.<item>`); null for "more" (a mobile-only string). */
  labelKey: string | null;
};

/** Route name of every section that is a tab, per role. */
const TAB_ROUTE_NAMES: Record<UserRole, Partial<Record<ScreenId, string>>> = {
  STUDENT: {
    "student.home": "(home)",
    "student.lesson": "lesson",
    "student.homeworks": "homeworks",
    "student.deadlines": "deadlines",
    "student.theory": "theory",
  },
  TEACHER: {
    "teacher.home": "(home)",
    "teacher.students": "students",
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

/** Route name of the teacher's «ещё» tab. */
export const MORE_TAB_NAME = "(more)";

/** Tabs of `role` in bar order: the `placement: "tab"` sections in site order, then «ещё» when the role has "more" sections that need a tab. */
export function tabsForRole(role: UserRole): TabDefinition[] {
  const tabs: TabDefinition[] = [];
  for (const section of NAV_SECTIONS[role]) {
    if (section.placement !== "tab") continue;
    const name = TAB_ROUTE_NAMES[role][section.screen];
    if (name) tabs.push({ name, section: section.screen, labelKey: section.labelKey });
  }
  // The student's only "more" section (info) is a row on Home and in Settings, not a tab (00 §3.1).
  if (role === "TEACHER") tabs.push({ name: MORE_TAB_NAME, section: "more", labelKey: null });
  return tabs;
}

/** Sections listed on the teacher's «ещё» screen, in site order. */
export function moreSections(role: UserRole) {
  return NAV_SECTIONS[role].filter((section) => section.placement === "more");
}

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
