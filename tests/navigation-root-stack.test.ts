// The bottom of the root stack (src/navigation/root-stack.ts) and the landing href of a segmented tab
// (src/navigation/routes.ts `tabLandingHref`): the launch route never stays under the session's screens,
// and a link into the teacher's «занятия» tab lands on the segment that is the root of its stack.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeRootStack, sessionBottomRoute } from "@/navigation/root-stack";
import { tabLandingHref } from "@/navigation/routes";

const r = (name: string) => ({ key: `${name}-k`, name });
const names = (state: { routes: readonly { name: string }[] } | null) => state?.routes.map((route) => route.name) ?? null;

describe("normalizeRootStack", () => {
  it("drops the launch route under the role tree after a sign-in", () => {
    const next = normalizeRootStack({ index: 1, routes: [r("index"), r("(student)")] }, "STUDENT");
    assert.deepEqual(names(next), ["(student)"]);
    assert.equal(next?.index, 0);
    // The role tree keeps its key: nothing remounts.
    assert.equal(next?.routes[0].key, "(student)-k");
  });

  it("drops the launch route under the login form after a sign-out", () => {
    assert.deepEqual(names(normalizeRootStack({ index: 1, routes: [r("index"), r("login")] }, null)), ["login"]);
  });

  it("puts the role tree under an overlay opened as the first screen", () => {
    const next = normalizeRootStack({ index: 1, routes: [r("index"), r("number-search")] }, "TEACHER");
    assert.deepEqual(names(next), ["(teacher)", "number-search"]);
    assert.equal(next?.index, 1);
    // A new route without a key: the stack router mints it.
    assert.equal(next?.routes[0].key, undefined);
  });

  it("puts the login form under the demo screen opened signed out", () => {
    assert.deepEqual(names(normalizeRootStack({ index: 1, routes: [r("index"), r("demo")] }, null)), ["login", "demo"]);
  });

  it("keeps the role tree that is already there and drops the launch route elsewhere in the stack", () => {
    const next = normalizeRootStack({ index: 2, routes: [r("index"), r("(developer)"), r("settings")] }, "DEVELOPER");
    assert.deepEqual(names(next), ["(developer)", "settings"]);
    assert.equal(next?.index, 1);
  });

  it("leaves a focused launch route alone (it is redirecting) and a stack without one", () => {
    assert.equal(normalizeRootStack({ index: 0, routes: [r("index")] }, "STUDENT"), null);
    assert.equal(normalizeRootStack({ index: 1, routes: [r("(student)"), r("index")] }, "STUDENT"), null);
    assert.equal(normalizeRootStack({ index: 1, routes: [r("(student)"), r("settings")] }, "STUDENT"), null);
  });

  it("waits while the guards swap the trees or the role lags behind them", () => {
    // Signed out, but the role tree is still in the stack.
    assert.equal(normalizeRootStack({ index: 1, routes: [r("index"), r("(student)")] }, null), null);
    // Signed in, but the login form is still in the stack.
    assert.equal(normalizeRootStack({ index: 1, routes: [r("index"), r("login")] }, "STUDENT"), null);
    // Another role's tree.
    assert.equal(normalizeRootStack({ index: 1, routes: [r("index"), r("(teacher)")] }, "STUDENT"), null);
    // A signed-in screen with no role known yet.
    assert.equal(normalizeRootStack({ index: 1, routes: [r("index"), r("settings")] }, null), null);
  });

  it("names the bottom route of every session", () => {
    assert.equal(sessionBottomRoute("STUDENT"), "(student)");
    assert.equal(sessionBottomRoute("TEACHER"), "(teacher)");
    assert.equal(sessionBottomRoute("DEVELOPER"), "(developer)");
    assert.equal(sessionBottomRoute(null), "login");
  });
});

describe("tabLandingHref", () => {
  const lessons = { pathname: "/teacher/lessons" };

  it("lands on the segment that is the root of the «занятия» stack", () => {
    assert.deepEqual(tabLandingHref(lessons, "homework-plans"), { pathname: "/teacher/homework-plans" });
    assert.deepEqual(tabLandingHref(lessons, "lessons"), lessons);
  });

  it("uses the tab root when the stack does not exist yet or the tab has no segments", () => {
    assert.deepEqual(tabLandingHref(lessons, undefined), lessons);
    assert.deepEqual(tabLandingHref({ pathname: "/teacher/more" }, "topics"), { pathname: "/teacher/more" });
    assert.deepEqual(tabLandingHref({ pathname: "/student/homeworks" }, "[assignmentId]"), { pathname: "/student/homeworks" });
  });
});
