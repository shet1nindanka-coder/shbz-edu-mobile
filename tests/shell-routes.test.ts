// Route table of the shell: every registered screen has a route for the roles it is registered for, every
// route has a file under src/app, links become the right hrefs, and the placement rules of 00 §3.1 hold.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
/// <reference path="../node_modules/@types/node/fs.d.ts" />
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { USER_ROLES, type NavTarget, type UserRole } from "@/api/types";
import { HOME, NAV_SECTIONS, SCREENS, SCREEN_IDS, isScreenRegisteredFor } from "@/navigation/registry";
import {
  allRoutePatterns,
  canOpen,
  fileViewerFilesParam,
  homeHref,
  hrefFor,
  hrefToPath,
  indexParam,
  journalDaysParam,
  journalOutcomeParam,
  panelTabParam,
  parseAppLink,
  planNavigation,
  positionOf,
  requiredParam,
  routeFor,
  stringParam,
  type AppLink,
} from "@/navigation/routes";
import { clearViewerHandoff, handOverViewerFiles, handedOverTitle, viewerRouteFiles, withHandedOverUris } from "@/navigation/viewer-handoff";
import { dockActiveIndex, dockHasMore, dockOverflow, dockSections, moreSections, navItemOf, navLabel, sectionOfPath, tabsForRole } from "@/navigation/tabs";
import { resolveHrefTarget } from "@/navigation/targets";
import { getDictionary } from "@/i18n/get-dictionary";

const SHARED = ["auth.launch", "auth.login", "shell.notifications", "shell.settings", "shell.numberSearch", "shared.fileViewer"] as const;

/** URL pattern of a route file: groups and `index` are dropped, `+not-found` and layouts are not routes. */
function patternOfFile(file: string): string | null {
  const normalized = file.replace(/\\/g, "/");
  if (!/\.tsx?$/.test(normalized)) return null;
  const withoutExtension = normalized.replace(/\.tsx?$/, "");
  const segments = withoutExtension.split("/");
  const last = segments[segments.length - 1] ?? "";
  if (last === "_layout" || last.startsWith("+")) return null;
  const url = segments.filter((segment) => !/^\(.+\)$/.test(segment) && segment !== "index").join("/");
  return `/${url}`;
}

const appFiles = (readdirSync("src/app", { recursive: true }) as string[]).map((file) => file.replace(/\\/g, "/"));
const filePatterns = new Set(appFiles.map(patternOfFile).filter((pattern): pattern is string => pattern !== null));

describe("route table", () => {
  it("gives every registered screen a route for exactly the roles it is registered for", () => {
    for (const screen of SCREEN_IDS) {
      for (const role of USER_ROLES) {
        const route = routeFor(screen, role);
        const shared = (SHARED as readonly string[]).includes(screen);
        if (shared || isScreenRegisteredFor(screen, role)) {
          assert.ok(route, `${screen} has no route for ${role}`);
        } else {
          assert.equal(route, null, `${screen} must not be routable for ${role}`);
        }
      }
    }
  });

  it("keeps the three role trees apart: a role's routes live under its own prefix", () => {
    const prefix: Record<UserRole, string> = { STUDENT: "/student", TEACHER: "/teacher", DEVELOPER: "/developer" };
    for (const role of USER_ROLES) {
      for (const screen of SCREEN_IDS) {
        if ((SHARED as readonly string[]).includes(screen)) continue;
        const route = routeFor(screen, role);
        if (route) assert.ok(route.pattern === prefix[role] || route.pattern.startsWith(`${prefix[role]}/`), `${screen} for ${role}: ${route.pattern}`);
      }
    }
  });

  it("has a route file under src/app for every pattern, and no stray role routes", () => {
    const patterns = allRoutePatterns();
    assert.equal(patterns.length, new Set(patterns).size);
    for (const pattern of patterns) {
      assert.ok(filePatterns.has(pattern), `no route file for ${pattern}`);
    }
    const known = new Set(patterns);
    for (const pattern of filePatterns) {
      if (/^\/(student|teacher|developer)(\/|$)/.test(pattern)) assert.ok(known.has(pattern), `route file ${pattern} is not in the route table`);
    }
  });

  it("mounts the 36 registered screens: 6 shared, 8 student, 17 teacher, 9 developer", () => {
    const count = (role: UserRole) => SCREEN_IDS.filter((screen) => !(SHARED as readonly string[]).includes(screen) && routeFor(screen, role)).length;
    assert.equal(SCREEN_IDS.length, 36);
    assert.equal(SHARED.filter((screen) => routeFor(screen, "STUDENT")).length, 6);
    assert.equal(count("STUDENT"), 8);
    assert.equal(count("TEACHER"), 17);
    assert.equal(count("DEVELOPER"), 9);
  });

  it("uses the site's paths", () => {
    // Staff routes of the registry are written with the `/teacher` prefix; `/developer/…` is the same page.
    for (const screen of SCREEN_IDS) {
      const { siteRoutes } = SCREENS[screen];
      if (siteRoutes.length === 0) continue;
      const site = siteRoutes.map((route) => route.replace(/\{(\w+)\}/g, "[$1]"));
      for (const role of USER_ROLES) {
        const route = routeFor(screen, role);
        if (!route || (SHARED as readonly string[]).includes(screen)) continue;
        const asTeacherPath = route.pattern.replace(/^\/developer/, "/teacher");
        assert.ok(site.includes(asTeacherPath), `${screen} for ${role}: ${route.pattern} is not one of ${site.join(", ")}`);
      }
    }
  });

  it("puts every role's home first", () => {
    assert.deepEqual(homeHref("STUDENT"), { pathname: "/student" });
    assert.deepEqual(homeHref("TEACHER"), { pathname: "/teacher" });
    assert.deepEqual(homeHref("DEVELOPER"), { pathname: "/developer/topics" });
    for (const role of USER_ROLES) assert.equal(routeFor(HOME[role], role)?.placement, "tabRoot");
  });
});

describe("links", () => {
  it("turns a link into pattern + params", () => {
    assert.deepEqual(hrefFor({ screen: "student.homework", assignmentId: "hw_1" }, "STUDENT"), {
      pathname: "/student/homeworks/[assignmentId]",
      params: { assignmentId: "hw_1" },
    });
    assert.deepEqual(hrefFor({ screen: "content.number", topicId: "t1", number: "010203" }, "DEVELOPER"), {
      pathname: "/developer/topics/[topicId]/numbers/[number]",
      params: { topicId: "t1", number: "010203" },
    });
    assert.deepEqual(hrefFor({ screen: "content.number", topicId: "t1", number: "010203" }, "TEACHER"), {
      pathname: "/teacher/topics/[topicId]/numbers/[number]",
      params: { topicId: "t1", number: "010203" },
    });
    assert.deepEqual(hrefFor({ screen: "calls.list" }, "TEACHER"), { pathname: "/teacher/calls" });
    assert.deepEqual(hrefFor({ screen: "calls.list", studentId: "usr_ilya" }, "TEACHER"), {
      pathname: "/teacher/calls",
      params: { studentId: "usr_ilya" },
    });
    assert.deepEqual(hrefFor({ screen: "developer.panel", tab: "status" }, "DEVELOPER"), { pathname: "/developer/panel" });
    assert.deepEqual(hrefFor({ screen: "developer.panel", tab: "actions" }, "DEVELOPER"), {
      pathname: "/developer/panel",
      params: { tab: "actions" },
    });
    assert.deepEqual(hrefFor({ screen: "planner.lessonNew", groupId: "g", studentId: "s" }, "TEACHER"), {
      pathname: "/teacher/lessons/new",
      params: { groupId: "g" },
    });
    assert.deepEqual(hrefFor({ screen: "planner.draftNew", lessonId: "l", studentId: "s" }, "TEACHER"), {
      pathname: "/teacher/homework-plans/new",
      params: { lessonId: "l", studentId: "s" },
    });
  });

  it("builds the site's URLs", () => {
    const path = (link: AppLink, role: UserRole) => {
      const href = hrefFor(link, role);
      return href ? hrefToPath(href) : null;
    };
    assert.equal(path({ screen: "student.homework", assignmentId: "hw 1" }, "STUDENT"), "/student/homeworks/hw%201");
    assert.equal(path({ screen: "student.number", number: "010203" }, "STUDENT"), "/student/numbers/010203");
    assert.equal(path({ screen: "calls.list", studentId: "usr_ilya" }, "TEACHER"), "/teacher/calls?studentId=usr_ilya");
    assert.equal(path({ screen: "developer.journal", outcome: "failed", days: 1 }, "DEVELOPER"), "/developer/panel/journal?outcome=failed&days=1");
    assert.equal(path({ screen: "developer.panel", tab: "actions" }, "DEVELOPER"), "/developer/panel?tab=actions");
    assert.equal(
      path({ screen: "teacher.student.review", studentId: "usr_ilya", assignmentId: "hw_1" }, "TEACHER"),
      "/teacher/students/usr_ilya?assignmentId=hw_1",
    );
  });

  it("round-trips every href the site produces through its target (00 §3.3)", () => {
    const cases: [string, UserRole, string][] = [
      ["/student/homeworks", "STUDENT", "/student/homeworks"],
      ["/student/homeworks/hw_ilya_open", "STUDENT", "/student/homeworks/hw_ilya_open"],
      ["/teacher/calls?studentId=usr_ilya", "TEACHER", "/teacher/calls?studentId=usr_ilya"],
      ["/developer/panel/journal?outcome=failed&days=1", "DEVELOPER", "/developer/panel/journal?outcome=failed&days=1"],
      ["/developer/panel", "DEVELOPER", "/developer/panel"],
      ["/developer/panel?tab=actions", "DEVELOPER", "/developer/panel?tab=actions"],
      ["/student/numbers/010203", "STUDENT", "/student/numbers/010203"],
      ["/teacher/topics/t1/numbers/12", "TEACHER", "/teacher/topics/t1/numbers/12"],
      ["/teacher/topics/t1/numbers/12", "DEVELOPER", "/developer/topics/t1/numbers/12"],
      ["/teacher/lessons/les_1", "TEACHER", "/teacher/lessons/les_1"],
    ];
    for (const [siteHref, role, expected] of cases) {
      const target = resolveHrefTarget(siteHref, role);
      assert.ok(target, `${siteHref} has no target for ${role}`);
      const href = hrefFor(target, role);
      assert.ok(href);
      assert.equal(hrefToPath(href), expected);
    }
  });

  it("never offers a screen of another role (plain text instead of a bounce home)", () => {
    const lesson: NavTarget = { screen: "planner.lessonBoard", lessonId: "les_1" };
    assert.equal(canOpen(lesson, "TEACHER"), true);
    assert.equal(canOpen(lesson, "DEVELOPER"), false);
    assert.equal(planNavigation(lesson, "DEVELOPER"), null);
    assert.equal(hrefFor(lesson, "STUDENT"), null);
    assert.equal(canOpen({ screen: "student.homeworks" }, "TEACHER"), false);
    assert.equal(canOpen({ screen: "content.topicEdit", topicId: "t" }, "TEACHER"), false);
    assert.equal(canOpen({ screen: "content.topicEdit", topicId: "t" }, "DEVELOPER"), true);
    assert.equal(canOpen({ screen: "groups.list" }, "DEVELOPER"), false);
    assert.equal(canOpen(null, "STUDENT"), false);
    // Auth screens are never opened by a link.
    assert.equal(canOpen({ screen: "auth.login" }, "STUDENT"), false);
    assert.equal(planNavigation({ screen: "auth.launch" }, "TEACHER"), null);
  });
});

describe("navigation plans (00 §3.1)", () => {
  it("opens a homework over the homework list, whatever the entry point", () => {
    assert.deepEqual(planNavigation({ screen: "student.homework", assignmentId: "hw_1" }, "STUDENT"), {
      kind: "tab",
      root: { pathname: "/student/homeworks" },
      detail: { pathname: "/student/homeworks/[assignmentId]", params: { assignmentId: "hw_1" } },
    });
  });

  it("opens the student's info as a section of its own", () => {
    assert.deepEqual(planNavigation({ screen: "student.info" }, "STUDENT"), { kind: "tab", root: { pathname: "/student/info" } });
  });

  it("selects a tab for a primary section", () => {
    assert.deepEqual(planNavigation({ screen: "student.homeworks" }, "STUDENT"), { kind: "tab", root: { pathname: "/student/homeworks" } });
    assert.deepEqual(planNavigation({ screen: "calls.list", studentId: "s" }, "TEACHER"), {
      kind: "tab",
      root: { pathname: "/teacher/calls", params: { studentId: "s" } },
    });
    assert.deepEqual(planNavigation({ screen: "content.topics" }, "DEVELOPER"), { kind: "tab", root: { pathname: "/developer/topics" } });
  });

  it("gives the teacher's topics and groups tabs of their own", () => {
    assert.deepEqual(planNavigation({ screen: "content.topics" }, "TEACHER"), { kind: "tab", root: { pathname: "/teacher/topics" } });
    assert.deepEqual(planNavigation({ screen: "groups.list" }, "TEACHER"), { kind: "tab", root: { pathname: "/teacher/groups" } });
    assert.deepEqual(planNavigation({ screen: "groups.detail", groupId: "g" }, "TEACHER"), {
      kind: "tab",
      root: { pathname: "/teacher/groups" },
      detail: { pathname: "/teacher/groups/[groupId]", params: { groupId: "g" } },
    });
    assert.deepEqual(planNavigation({ screen: "content.topic", topicId: "t" }, "TEACHER"), {
      kind: "tab",
      root: { pathname: "/teacher/topics" },
      detail: { pathname: "/teacher/topics/[topicId]", params: { topicId: "t" } },
    });
  });

  it("treats lessons and homework drafts as two roots of one tab", () => {
    assert.deepEqual(planNavigation({ screen: "planner.lessons" }, "TEACHER"), { kind: "tab", root: { pathname: "/teacher/lessons" } });
    assert.deepEqual(planNavigation({ screen: "planner.drafts" }, "TEACHER"), {
      kind: "tab",
      root: { pathname: "/teacher/lessons" },
      replaceRoot: { pathname: "/teacher/homework-plans" },
    });
  });

  it("pushes cross-tab screens above the tabs and shell screens in the root stack", () => {
    assert.equal(planNavigation({ screen: "student.number", number: "12" }, "STUDENT")?.kind, "stack");
    assert.equal(planNavigation({ screen: "teacher.student.review", studentId: "s" }, "TEACHER")?.kind, "stack");
    assert.equal(planNavigation({ screen: "planner.lessonBoard", lessonId: "l" }, "TEACHER")?.kind, "stack");
    assert.equal(planNavigation({ screen: "planner.draftBoard", planId: "p" }, "TEACHER")?.kind, "stack");
    assert.equal(planNavigation({ screen: "content.number", topicId: "t", number: "1" }, "DEVELOPER")?.kind, "stack");
    assert.equal(planNavigation({ screen: "content.topicEdit", topicId: "t" }, "DEVELOPER")?.kind, "stack");
    assert.equal(planNavigation({ screen: "shell.settings" }, "DEVELOPER")?.kind, "overlay");
    assert.equal(planNavigation({ screen: "shell.notifications" }, "STUDENT")?.kind, "overlay");
    assert.deepEqual(planNavigation({ screen: "developer.journal", outcome: "failed", days: 1 }, "DEVELOPER"), {
      kind: "tab",
      root: { pathname: "/developer/panel" },
      detail: { pathname: "/developer/panel/journal", params: { outcome: "failed", days: "1" } },
    });
  });

  it("tells a tab position from a screen above the tabs", () => {
    assert.equal(positionOf(["(student)", "student", "(tabs)", "homeworks", "[assignmentId]"]), "tabs");
    assert.equal(positionOf(["(teacher)", "teacher", "(tabs)", "(more)", "topics"]), "tabs");
    assert.equal(positionOf(["(student)", "student", "numbers", "[number]"]), "above");
    assert.equal(positionOf(["settings"]), "above");
    assert.equal(positionOf(["notifications"]), "above");
    assert.equal(positionOf([]), "above");
  });
});

describe("route params", () => {
  it("reads single strings and tolerates arrays and blanks", () => {
    assert.equal(stringParam("a"), "a");
    assert.equal(stringParam(["a", "b"]), "a");
    assert.equal(stringParam(""), undefined);
    assert.equal(stringParam(undefined), undefined);
    assert.equal(requiredParam(undefined), "");
    assert.equal(requiredParam("x"), "x");
  });

  it("parses the developer panel and journal params like the site", () => {
    assert.equal(panelTabParam("actions"), "actions");
    assert.equal(panelTabParam("nope"), "status");
    assert.equal(panelTabParam(undefined), "status");
    assert.equal(journalOutcomeParam("failed"), "failed");
    assert.equal(journalOutcomeParam("ok"), undefined);
    assert.equal(journalDaysParam("1"), 1);
    assert.equal(journalDaysParam("7.9"), 7);
    assert.equal(journalDaysParam("0"), 0);
    assert.equal(journalDaysParam("366"), undefined);
    assert.equal(journalDaysParam("-1"), undefined);
    assert.equal(journalDaysParam("abc"), undefined);
    assert.equal(journalDaysParam(undefined), undefined);
  });

  it("round-trips the files of the viewer and drops malformed entries", () => {
    const files = [
      { id: "f1", originalName: "a.pdf", mimeType: "application/pdf", size: 10 },
      { id: "f2", originalName: "b.jpg", mimeType: "image/jpeg", localUri: "file:///b.jpg" },
    ];
    const href = hrefFor({ screen: "shared.fileViewer", files, initialIndex: 1, title: "Тема" }, "STUDENT");
    assert.equal(href?.pathname, "/file-viewer");
    // A downloaded document's `localUri` never travels in the URL (a deep link could forge it).
    const references = [files[0], { id: "f2", originalName: "b.jpg", mimeType: "image/jpeg" }];
    assert.deepEqual(fileViewerFilesParam(href?.params?.files), references);
    assert.equal(String(href?.params?.files).includes("file:///"), false);
    assert.deepEqual(
      fileViewerFilesParam('[{"id":"x","originalName":"x.jpg","mimeType":"image/jpeg","localUri":"https://example.org/x.jpg"}]'),
      [{ id: "x", originalName: "x.jpg", mimeType: "image/jpeg" }],
    );
    assert.equal(indexParam(href?.params?.index), 1);
    // Neither does the header title: a link must not be able to put its own words into the viewer's chrome.
    assert.equal(href?.params?.title, undefined);
    assert.deepEqual(fileViewerFilesParam("not json"), []);
    assert.deepEqual(fileViewerFilesParam('{"id":"x"}'), []);
    assert.deepEqual(fileViewerFilesParam('[{"id":"x"},{"id":"y","originalName":"y","mimeType":"image/png","size":"big"}]'), [
      { id: "y", originalName: "y", mimeType: "image/png" },
    ]);
    assert.equal(indexParam("-2"), 0);
    assert.equal(indexParam("1.5"), 0);
    assert.equal(indexParam(undefined), 0);
  });

  it("hands a downloaded document to the viewer in memory, never through the URL", () => {
    clearViewerHandoff();
    const forged = [{ id: "report", originalName: "Введите пароль заново", mimeType: "application/pdf", localUri: "https://example.org/evil.pdf" }];
    // Nothing was handed over: the link keeps its id only — its `localUri`, its name (which the viewer would
    // show in its own chrome) and its type (which would pick the kind of page) are dropped; the viewer
    // describes the file from the stored row.
    assert.deepEqual(withHandedOverUris(forged), [{ id: "report", originalName: "", mimeType: "" }]);
    assert.deepEqual(viewerRouteFiles(forged), { files: [{ id: "report", originalName: "", mimeType: "" }], linkOnlyIds: ["report"] });
    assert.deepEqual(withHandedOverUris([{ id: "x", originalName: "x", mimeType: "image/png" }]), [{ id: "x", originalName: "", mimeType: "" }]);
    assert.deepEqual(withHandedOverUris([{ id: "x", originalName: "x", mimeType: "text/html; Сессия истекла", size: 5 }]), [
      { id: "x", originalName: "", mimeType: "" },
    ]);
    handOverViewerFiles([
      { id: "report", originalName: "r.pdf", mimeType: "application/pdf", localUri: "file:///cache/r.pdf" },
      { id: "stored", originalName: "s.jpg", mimeType: "image/jpeg", size: 12 },
    ]);
    // Handed over by the app's own screen: the real reference comes back, whatever the link says.
    assert.deepEqual(withHandedOverUris([...forged, { id: "stored", originalName: "Фальшивое имя", mimeType: "application/pdf" }]), [
      { id: "report", originalName: "r.pdf", mimeType: "application/pdf", localUri: "file:///cache/r.pdf" },
      { id: "stored", originalName: "s.jpg", mimeType: "image/jpeg", size: 12 },
    ]);
    // Only the files nobody handed over are described from the stored file.
    assert.deepEqual(viewerRouteFiles([...forged, { id: "other", originalName: "o", mimeType: "image/png" }]).linkOnlyIds, ["other"]);
    // The title is handed over for exactly that set of files; another set (a forged link) gets none.
    const photos = [{ id: "p1", originalName: "1.jpg", mimeType: "image/jpeg" }, { id: "p2", originalName: "2.jpg", mimeType: "image/jpeg" }];
    handOverViewerFiles(photos, "Квадратные уравнения");
    assert.equal(handedOverTitle(photos), "Квадратные уравнения");
    assert.equal(handedOverTitle([photos[0]!]), undefined);
    assert.equal(handedOverTitle(forged), undefined);
    handOverViewerFiles(photos);
    assert.equal(handedOverTitle(photos), undefined);
    clearViewerHandoff();
    assert.deepEqual(withHandedOverUris(forged), [{ id: "report", originalName: "", mimeType: "" }]);
  });

  it("validates a link that arrives as plain data (a tapped reminder)", () => {
    assert.deepEqual(parseAppLink({ screen: "student.homework", assignmentId: "hw_1" }), { screen: "student.homework", assignmentId: "hw_1" });
    assert.deepEqual(parseAppLink({ screen: "student.lesson" }), { screen: "student.lesson" });
    assert.deepEqual(parseAppLink({ screen: "calls.list", studentId: "s" }), { screen: "calls.list", studentId: "s" });
    assert.deepEqual(parseAppLink({ screen: "calls.list" }), { screen: "calls.list" });
    assert.equal(parseAppLink({ screen: "student.homework" }), null);
    assert.equal(parseAppLink({ screen: "student.homework", assignmentId: 5 }), null);
    assert.equal(parseAppLink({ screen: "auth.login" }), null);
    assert.equal(parseAppLink({ screen: "nope" }), null);
    assert.equal(parseAppLink("student.home"), null);
    assert.equal(parseAppLink(null), null);
    assert.deepEqual(parseAppLink({ screen: "developer.panel", tab: "weird" }), { screen: "developer.panel", tab: "status" });
  });
});

describe("tabs and the dock (docs/design/glass-over-paper.md §5)", () => {
  const tabs = (role: UserRole) => tabsForRole(role).map((tab) => tab.section);
  const dock = (role: UserRole, layout: "phone" | "tablet") => dockSections(role, layout).map((section) => section.screen);

  it("makes every primary section a tab route, in site order", () => {
    assert.deepEqual(tabs("STUDENT"), ["student.home", "student.lesson", "student.homeworks", "student.deadlines", "student.theory", "student.info"]);
    assert.deepEqual(tabs("TEACHER"), ["teacher.home", "content.topics", "teacher.students", "groups.list", "planner.lessons", "calls.list"]);
    assert.deepEqual(tabs("DEVELOPER"), ["content.topics", "developer.accounts", "calls.list", "stats.main", "developer.panel"]);
    for (const role of USER_ROLES) {
      const order = NAV_SECTIONS[role].filter((section) => section.placement !== "gear").map((section) => section.screen);
      assert.deepEqual(tabs(role), order);
    }
  });

  it("shows five sections in the phone dock and every section in the tablet dock", () => {
    assert.deepEqual(dock("STUDENT", "phone"), ["student.home", "student.lesson", "student.homeworks", "student.deadlines", "student.theory"]);
    assert.deepEqual(dock("STUDENT", "tablet"), [...dock("STUDENT", "phone"), "student.info"]);
    // The owner's decision: groups are in the phone dock, calls are behind «ещё».
    assert.deepEqual(dock("TEACHER", "phone"), ["teacher.home", "teacher.students", "groups.list", "planner.lessons"]);
    assert.deepEqual(dock("TEACHER", "tablet"), ["teacher.home", "content.topics", "teacher.students", "groups.list", "planner.lessons", "calls.list"]);
    assert.deepEqual(dock("DEVELOPER", "phone"), ["content.topics", "developer.accounts", "calls.list", "stats.main", "developer.panel"]);
    assert.deepEqual(dock("DEVELOPER", "tablet"), dock("DEVELOPER", "phone"));
  });

  it("puts «ещё» only in the teacher's phone dock: topics and calls live behind it", () => {
    assert.equal(dockHasMore("TEACHER", "phone"), true);
    assert.equal(dockHasMore("TEACHER", "tablet"), false);
    assert.equal(dockHasMore("STUDENT", "phone"), false);
    assert.equal(dockHasMore("DEVELOPER", "phone"), false);
    assert.deepEqual(
      dockOverflow("TEACHER", "phone").map((section) => section.screen),
      ["content.topics", "calls.list"],
    );
    assert.deepEqual(dockOverflow("TEACHER", "tablet"), []);
    // The student's info is not behind «ещё»: a phone opens it from the profile.
    assert.deepEqual(dockOverflow("STUDENT", "phone"), []);
    assert.deepEqual(
      moreSections("STUDENT").map((section) => section.screen),
      ["student.info"],
    );
    assert.deepEqual(moreSections("DEVELOPER"), []);
  });

  it("finds the section of a path", () => {
    assert.equal(sectionOfPath("STUDENT", "/student"), "student.home");
    assert.equal(sectionOfPath("STUDENT", "/student/homeworks/a1"), "student.homeworks");
    assert.equal(sectionOfPath("STUDENT", "/student/numbers/051004"), "student.homeworks");
    assert.equal(sectionOfPath("STUDENT", "/student/info"), "student.info");
    assert.equal(sectionOfPath("TEACHER", "/teacher"), "teacher.home");
    assert.equal(sectionOfPath("TEACHER", "/teacher/students/s1/assign"), "teacher.students");
    assert.equal(sectionOfPath("TEACHER", "/teacher/homework-plans/p1"), "planner.lessons");
    assert.equal(sectionOfPath("TEACHER", "/teacher/lessons/new"), "planner.lessons");
    assert.equal(sectionOfPath("TEACHER", "/teacher/topics/t1/numbers/051004"), "content.topics");
    assert.equal(sectionOfPath("DEVELOPER", "/developer/panel/journal"), "developer.panel");
    assert.equal(sectionOfPath("TEACHER", "/settings"), null);
    assert.equal(sectionOfPath("STUDENT", "/teacher/students"), null);
  });

  it("lights the dock item of the current path, «ещё» for its sections, nothing for the rest", () => {
    assert.equal(dockActiveIndex("STUDENT", "phone", "/student/homeworks/a1"), 2);
    assert.equal(dockActiveIndex("STUDENT", "phone", "/student/info"), -1);
    assert.equal(dockActiveIndex("STUDENT", "tablet", "/student/info"), 5);
    assert.equal(dockActiveIndex("STUDENT", "phone", "/settings"), -1);
    assert.equal(dockActiveIndex("TEACHER", "phone", "/teacher/groups/g1"), 2);
    assert.equal(dockActiveIndex("TEACHER", "phone", "/teacher/calls"), 4);
    assert.equal(dockActiveIndex("TEACHER", "phone", "/teacher/topics/t1"), 4);
    assert.equal(dockActiveIndex("TEACHER", "phone", "/settings"), 4);
    assert.equal(dockActiveIndex("TEACHER", "tablet", "/teacher/calls"), 5);
    assert.equal(dockActiveIndex("TEACHER", "tablet", "/settings"), -1);
    assert.equal(dockActiveIndex("DEVELOPER", "phone", "/developer/topics/t1/edit"), 0);
  });

  it("has a route (file or folder) for every tab", () => {
    const folder: Record<UserRole, string> = {
      STUDENT: "(student)/student/(tabs)",
      TEACHER: "(teacher)/teacher/(tabs)",
      DEVELOPER: "(developer)/developer/(tabs)",
    };
    for (const role of USER_ROLES) {
      for (const tab of tabsForRole(role)) {
        const base = `${folder[role]}/${tab.name}`;
        const exists = appFiles.some((file) => file === `${base}.tsx` || file === `${base}/_layout.tsx`);
        assert.ok(exists, `no route for tab ${tab.name} of ${role}`);
      }
    }
  });

  it("labels the dock with the site's lower-case section names", () => {
    const ru = getDictionary("ru").nav;
    const en = getDictionary("en").nav;
    const labels = (role: UserRole, nav: typeof ru) => dockSections(role, "phone").map((section) => navLabel(nav, section.labelKey));
    assert.deepEqual(labels("STUDENT", ru), ["обзор", "урок", "дз", "дедлайны", "теория"]);
    assert.deepEqual(labels("TEACHER", ru), ["обзор", "ученики", "группы", "занятия"]);
    assert.deepEqual(labels("DEVELOPER", ru), ["темы", "аккаунты", "звонки", "статистика", "дев-панель"]);
    assert.deepEqual(labels("DEVELOPER", en), ["topics", "accounts", "calls", "statistics", "dev panel"]);
    assert.equal(navItemOf("nav.teacher.lessons"), "lessons");
    assert.equal(navLabel(ru, "nav.nobody.nothing"), "");
  });
});
