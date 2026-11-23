// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NavTarget, UserRole } from "../src/api/types";
import {
  HOME,
  NAV_SECTIONS,
  SCREENS,
  SCREEN_IDS,
  SECTIONS,
  findNavSection,
  isScreenId,
  isScreenRegisteredFor,
  navSections,
  screensForRole,
} from "../src/navigation/registry";
import {
  historyReferenceTarget,
  numberFindTarget,
  parseDeveloperPanelTab,
  parseJournalDays,
  resolveHrefTarget,
  targetForRole,
} from "../src/navigation/targets";

const ROLES: readonly UserRole[] = ["STUDENT", "TEACHER", "DEVELOPER"];

/** Asserts that `href` resolves to `expected` for `allowed` roles and to null for every other role. */
function expectTarget(href: string, expected: NavTarget, allowed: readonly UserRole[]) {
  for (const role of ROLES) {
    assert.deepEqual(
      resolveHrefTarget(href, role),
      allowed.includes(role) ? expected : null,
      `${href} as ${role}`,
    );
  }
}

describe("resolveHrefTarget — every row of 00 §3.3", () => {
  it("notification homework-assigned → student.homeworks", () => {
    expectTarget("/student/homeworks", { screen: "student.homeworks" }, ["STUDENT"]);
  });

  it("notification homework-checked → student.homework { assignmentId }", () => {
    expectTarget("/student/homeworks/hw_ilya_1", { screen: "student.homework", assignmentId: "hw_ilya_1" }, ["STUDENT"]);
  });

  it("notification parent_call_due → calls.list { studentId }", () => {
    // Generated for a TEACHER only; the screen is also registered for a DEVELOPER, a STUDENT gets nothing.
    expectTarget("/teacher/calls?studentId=usr_ilya", { screen: "calls.list", studentId: "usr_ilya" }, ["TEACHER", "DEVELOPER"]);
  });

  it("notification dev_errors → developer.journal { outcome: failed, days: 1 }", () => {
    expectTarget(
      "/developer/panel/journal?outcome=failed&days=1",
      { screen: "developer.journal", outcome: "failed", days: 1 },
      ["DEVELOPER"],
    );
  });

  it("notifications dev_ai_budget_warn / dev_ai_budget_out → developer.panel { tab: status }", () => {
    expectTarget("/developer/panel", { screen: "developer.panel", tab: "status" }, ["DEVELOPER"]);
  });

  it("notifications dev_stale_checks / dev_storage → developer.panel { tab: actions }", () => {
    expectTarget("/developer/panel?tab=actions", { screen: "developer.panel", tab: "actions" }, ["DEVELOPER"]);
  });

  it("notification broadcast (href null) → null", () => {
    for (const role of ROLES) assert.equal(resolveHrefTarget(null, role), null);
  });

  it("number search, STUDENT → student.number { number }", () => {
    expectTarget("/student/numbers/010203", { screen: "student.number", number: "010203" }, ["STUDENT"]);
    assert.deepEqual(numberFindTarget({ number: "010203", topicId: "top_1" }, "STUDENT"), {
      screen: "student.number",
      number: "010203",
    });
  });

  it("number search, TEACHER / DEVELOPER → content.number { topicId, number }", () => {
    const expected: NavTarget = { screen: "content.number", topicId: "top_1", number: "010203" };
    expectTarget("/teacher/topics/top_1/numbers/010203", expected, ["TEACHER", "DEVELOPER"]);
    assert.deepEqual(numberFindTarget({ number: "010203", topicId: "top_1" }, "TEACHER"), expected);
    assert.deepEqual(numberFindTarget({ number: "010203", topicId: "top_1" }, "DEVELOPER"), expected);
  });

  it("history reference lesson → planner.lessonBoard { lessonId }, TEACHER only", () => {
    const expected: NavTarget = { screen: "planner.lessonBoard", lessonId: "les_1" };
    expectTarget("/teacher/lessons/les_1", expected, ["TEACHER"]);
    expectTarget("/developer/lessons/les_1", expected, ["TEACHER"]);
    assert.deepEqual(historyReferenceTarget({ kind: "lesson", lessonId: "les_1" }, "usr_ilya", "TEACHER"), expected);
    // Plain text for a DEVELOPER (decision N2).
    assert.equal(historyReferenceTarget({ kind: "lesson", lessonId: "les_1" }, "usr_ilya", "DEVELOPER"), null);
  });

  it("history reference homework → teacher.student.review { studentId, assignmentId }, TEACHER only", () => {
    const expected: NavTarget = { screen: "teacher.student.review", studentId: "usr_ilya", assignmentId: "hw_ilya_1" };
    expectTarget("/teacher/students/usr_ilya#homework-hw_ilya_1", expected, ["TEACHER"]);
    assert.deepEqual(historyReferenceTarget({ kind: "homework", assignmentId: "hw_ilya_1" }, "usr_ilya", "TEACHER"), expected);
    assert.equal(historyReferenceTarget({ kind: "homework", assignmentId: "hw_ilya_1" }, "usr_ilya", "DEVELOPER"), null);
    assert.equal(historyReferenceTarget(null, "usr_ilya", "TEACHER"), null);
  });
});

describe("resolveHrefTarget — rules of A2 B.6", () => {
  it("rule 1: /developer/… and /teacher/… are the same path", () => {
    expectTarget("/developer/calls?studentId=usr_ilya", { screen: "calls.list", studentId: "usr_ilya" }, ["TEACHER", "DEVELOPER"]);
    expectTarget("/teacher/panel?tab=broadcast", { screen: "developer.panel", tab: "broadcast" }, ["DEVELOPER"]);
    expectTarget("/teacher/panel/journal", { screen: "developer.journal", days: 7 }, ["DEVELOPER"]);
    expectTarget(
      "/developer/topics/top_1/numbers/7",
      { screen: "content.number", topicId: "top_1", number: "7" },
      ["TEACHER", "DEVELOPER"],
    );
    expectTarget("/developer/students/usr_ilya", { screen: "teacher.student.review", studentId: "usr_ilya" }, ["TEACHER"]);
  });

  it("rule 1: path segments, query values and the hash are URL-decoded", () => {
    assert.deepEqual(resolveHrefTarget("/student/homeworks/hw%201", "STUDENT"), {
      screen: "student.homework",
      assignmentId: "hw 1",
    });
    assert.deepEqual(resolveHrefTarget("/teacher/calls?studentId=usr%2Filya", "TEACHER"), {
      screen: "calls.list",
      studentId: "usr/ilya",
    });
    assert.deepEqual(resolveHrefTarget("/teacher/students/usr_ilya#homework-hw%201", "TEACHER"), {
      screen: "teacher.student.review",
      studentId: "usr_ilya",
      assignmentId: "hw 1",
    });
  });

  it("rule 2: tab is one of status | actions | broadcast | settings, anything else → status", () => {
    for (const tab of ["status", "actions", "broadcast", "settings"] as const) {
      assert.deepEqual(resolveHrefTarget(`/developer/panel?tab=${tab}`, "DEVELOPER"), { screen: "developer.panel", tab });
      assert.equal(parseDeveloperPanelTab(tab), tab);
    }
    assert.deepEqual(resolveHrefTarget("/developer/panel?tab=journal", "DEVELOPER"), { screen: "developer.panel", tab: "status" });
    assert.deepEqual(resolveHrefTarget("/developer/panel?tab=", "DEVELOPER"), { screen: "developer.panel", tab: "status" });
    assert.equal(parseDeveloperPanelTab(undefined), "status");
    assert.equal(parseDeveloperPanelTab("ACTIONS"), "status");
  });

  it("rule 2: days is a finite number in 0..365 (floored), anything else → 7", () => {
    assert.equal(parseJournalDays("1"), 1);
    assert.equal(parseJournalDays("0"), 0);
    assert.equal(parseJournalDays("365"), 365);
    assert.equal(parseJournalDays("30.9"), 30);
    assert.equal(parseJournalDays("366"), 7);
    assert.equal(parseJournalDays("-1"), 7);
    assert.equal(parseJournalDays("abc"), 7);
    assert.equal(parseJournalDays("Infinity"), 7);
    assert.equal(parseJournalDays(undefined), 7);
    assert.deepEqual(resolveHrefTarget("/developer/panel/journal?days=30", "DEVELOPER"), { screen: "developer.journal", days: 30 });
    assert.deepEqual(resolveHrefTarget("/developer/panel/journal?days=900", "DEVELOPER"), { screen: "developer.journal", days: 7 });
  });

  it("rule 2: outcome is honoured only when it equals failed", () => {
    assert.deepEqual(resolveHrefTarget("/developer/panel/journal?outcome=ok&days=3", "DEVELOPER"), {
      screen: "developer.journal",
      days: 3,
    });
    assert.deepEqual(resolveHrefTarget("/developer/panel/journal?outcome=failed", "DEVELOPER"), {
      screen: "developer.journal",
      outcome: "failed",
      days: 7,
    });
  });

  it("rule 3: a screen that is not registered for the role → null", () => {
    // Student paths for staff.
    assert.equal(resolveHrefTarget("/student/homeworks", "TEACHER"), null);
    assert.equal(resolveHrefTarget("/student/homeworks/hw_1", "DEVELOPER"), null);
    assert.equal(resolveHrefTarget("/student/numbers/010203", "TEACHER"), null);
    // Staff paths for a student.
    assert.equal(resolveHrefTarget("/teacher/calls?studentId=usr_ilya", "STUDENT"), null);
    assert.equal(resolveHrefTarget("/teacher/topics/top_1/numbers/7", "STUDENT"), null);
    // Developer screens for a teacher.
    assert.equal(resolveHrefTarget("/developer/panel", "TEACHER"), null);
    assert.equal(resolveHrefTarget("/developer/panel/journal?outcome=failed&days=1", "TEACHER"), null);
    // Teacher screens for a developer (N2: the lesson reference is inert; no student card).
    assert.equal(resolveHrefTarget("/developer/lessons/les_1", "DEVELOPER"), null);
    assert.equal(resolveHrefTarget("/teacher/students/usr_ilya#homework-hw_1", "DEVELOPER"), null);
    assert.equal(targetForRole({ screen: "planner.lessonBoard", lessonId: "les_1" }, "DEVELOPER"), null);
    assert.equal(targetForRole(null, "TEACHER"), null);
  });

  it("rule 4: any other href → null", () => {
    const unknown = [
      "",
      "/",
      "/login",
      "/dashboard",
      "/student",
      "/student/lesson",
      "/student/settings",
      "/student/homeworks/hw_1/extra",
      "/student/numbers",
      "/student/calls?studentId=usr_ilya",
      "/teacher",
      "/teacher/lessons",
      "/teacher/lessons/new",
      "/teacher/lessons/les_1/pdf",
      "/teacher/homework-plans/plan_1",
      "/teacher/groups/grp_1",
      "/teacher/students",
      "/teacher/students/usr_ilya/assign",
      "/teacher/topics/top_1",
      "/teacher/topics/top_1/numbers",
      "/teacher/calls",
      "/teacher/calls?studentId=",
      "/developer/accounts",
      "/developer/statistics",
      "/developer/panel/journal/extra",
      "/files/file_1",
      "/admin/panel",
      "student/homeworks",
      "https://example.com/student/homeworks",
      "//example.com/student/homeworks",
      "javascript:alert(1)",
      "/student/homeworks/%E0%A4%A",
    ];
    for (const href of unknown) {
      for (const role of ROLES) {
        assert.equal(resolveHrefTarget(href, role), null, `${JSON.stringify(href)} as ${role}`);
      }
    }
  });

  it("tolerates a trailing slash and ignores unrelated query parameters", () => {
    assert.deepEqual(resolveHrefTarget("/student/homeworks/", "STUDENT"), { screen: "student.homeworks" });
    assert.deepEqual(resolveHrefTarget("/student/homeworks?from=push", "STUDENT"), { screen: "student.homeworks" });
    assert.deepEqual(resolveHrefTarget("/teacher/calls?x=1&studentId=usr_ilya&studentId=other", "TEACHER"), {
      screen: "calls.list",
      studentId: "usr_ilya",
    });
  });
});

describe("screen registry — A2 B.4 – B.5, 00 §3", () => {
  it("has 36 screens: 6 shared, 8 student, 22 staff", () => {
    assert.equal(SCREEN_IDS.length, 36);
    const byArea = (area: string) => SCREEN_IDS.filter((id) => SCREENS[id].area === area).length;
    assert.equal(byArea("shared"), 6);
    assert.equal(byArea("student"), 8);
    assert.equal(byArea("staff"), 22);
    for (const id of SCREEN_IDS) assert.equal(SCREENS[id].id, id);
  });

  it("registers 17 staff screens for a TEACHER and 9 for a DEVELOPER; student screens for a STUDENT only", () => {
    const staff = SCREEN_IDS.filter((id) => SCREENS[id].area === "staff");
    assert.equal(staff.filter((id) => isScreenRegisteredFor(id, "TEACHER")).length, 17);
    assert.deepEqual(
      staff.filter((id) => isScreenRegisteredFor(id, "DEVELOPER")),
      [
        "content.topics",
        "content.topic",
        "content.topicEdit",
        "content.number",
        "calls.list",
        "developer.accounts",
        "stats.main",
        "developer.panel",
        "developer.journal",
      ],
    );
    assert.equal(staff.some((id) => isScreenRegisteredFor(id, "STUDENT")), false);
    assert.equal(screensForRole("STUDENT").length, 6 + 8);
    assert.equal(screensForRole("TEACHER").length, 6 + 17);
    assert.equal(screensForRole("DEVELOPER").length, 6 + 9);
    for (const id of SCREEN_IDS.filter((screenId) => SCREENS[screenId].area === "student")) {
      assert.deepEqual(SCREENS[id].roles, ["STUDENT"]);
    }
  });

  it("keeps planner and groups out of the DEVELOPER navigator (N2 / N3) and the student card teacher-only", () => {
    for (const id of SCREEN_IDS.filter((screenId) => screenId.startsWith("planner.") || screenId.startsWith("groups."))) {
      assert.equal(isScreenRegisteredFor(id, "DEVELOPER"), false, id);
      assert.deepEqual(SCREENS[id].deferredRoles, ["DEVELOPER"], id);
    }
    for (const id of ["teacher.home", "teacher.students", "teacher.student.review", "teacher.student.assign", "teacher.student.lessons"] as const) {
      assert.deepEqual(SCREENS[id].roles, ["TEACHER"]);
      assert.deepEqual(SCREENS[id].deferredRoles, []);
    }
    assert.deepEqual(SCREENS["content.topicEdit"].roles, ["DEVELOPER"]);
  });

  it("lists the primary sections in site order with the role home first", () => {
    assert.deepEqual(SECTIONS.STUDENT, ["student.home", "student.lesson", "student.homeworks", "student.deadlines", "student.theory", "student.info"]);
    assert.deepEqual(SECTIONS.TEACHER, ["teacher.home", "content.topics", "teacher.students", "groups.list", "planner.lessons", "calls.list"]);
    assert.deepEqual(SECTIONS.DEVELOPER, ["content.topics", "developer.accounts", "calls.list", "stats.main", "developer.panel"]);
    assert.deepEqual(HOME, { STUDENT: "student.home", TEACHER: "teacher.home", DEVELOPER: "content.topics" });
    for (const role of ROLES) assert.equal(SECTIONS[role][0], HOME[role]);
  });

  it("NAV_SECTIONS = SECTIONS + the settings gear, every screen registered for the role", () => {
    for (const role of ROLES) {
      const sections = NAV_SECTIONS[role];
      assert.deepEqual(sections.slice(0, -1).map((section) => section.screen), SECTIONS[role]);
      const gear = sections[sections.length - 1];
      assert.deepEqual(gear, {
        screen: "shell.settings",
        labelKey: `nav.${role.toLowerCase()}.settings`,
        webPath: `/${role.toLowerCase()}/settings`,
        placement: "gear",
      });
      assert.deepEqual(navSections(role, "gear"), [gear]);
      for (const section of sections) {
        assert.equal(isScreenRegisteredFor(section.screen, role), true, `${section.screen} for ${role}`);
        assert.ok(section.labelKey.startsWith(`nav.${role.toLowerCase()}.`), section.labelKey);
        assert.ok(section.webPath === `/${role.toLowerCase()}` || section.webPath.startsWith(`/${role.toLowerCase()}/`), section.webPath);
      }
    }
  });

  it("places the sections of the phone dock and the rest (docs/design/glass-over-paper.md §5)", () => {
    assert.deepEqual(
      navSections("STUDENT", "tab").map((section) => section.labelKey),
      ["nav.student.overview", "nav.student.lesson", "nav.student.homeworks", "nav.student.deadlines", "nav.student.theory"],
    );
    assert.deepEqual(navSections("STUDENT", "more").map((section) => section.screen), ["student.info"]);
    assert.deepEqual(
      navSections("TEACHER", "tab").map((section) => section.labelKey),
      ["nav.teacher.overview", "nav.teacher.students", "nav.teacher.groups", "nav.teacher.lessons"],
    );
    assert.deepEqual(navSections("TEACHER", "more").map((section) => section.screen), ["content.topics", "calls.list"]);
    assert.deepEqual(
      navSections("DEVELOPER", "tab").map((section) => section.labelKey),
      ["nav.developer.topics", "nav.developer.accounts", "nav.developer.calls", "nav.developer.statistics", "nav.developer.panel"],
    );
    assert.deepEqual(navSections("DEVELOPER", "more"), []);
  });

  it("finds a section per role and recognises screen ids", () => {
    assert.equal(findNavSection("TEACHER", "calls.list")?.labelKey, "nav.teacher.calls");
    assert.equal(findNavSection("DEVELOPER", "calls.list")?.labelKey, "nav.developer.calls");
    assert.equal(findNavSection("STUDENT", "calls.list"), null);
    assert.equal(findNavSection("TEACHER", "planner.drafts"), null);
    assert.equal(isScreenId("student.home"), true);
    assert.equal(isScreenId("student.overview"), false);
    assert.equal(isScreenId("toString"), false);
  });
});
