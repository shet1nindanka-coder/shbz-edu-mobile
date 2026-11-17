// `stats.main` deep links: the site's `/teacher/statistics?view=teachers|developer&studentId=…`
// (app/(dashboard)/teacher/statistics/page.tsx) choose the view and the timeline student in the app too.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hrefFor, parseAppLink, statsViewParam } from "@/navigation/routes";
import { initialStatsState } from "@/screens/stats/logic";

describe("statsViewParam", () => {
  it("honours teachers and developer only, like the site", () => {
    assert.equal(statsViewParam("teachers"), "teachers");
    assert.equal(statsViewParam("developer"), "developer");
    assert.equal(statsViewParam(["developer", "teachers"]), "developer");
    for (const raw of [undefined, "", "teacher", "TEACHERS", "bogus", []]) assert.equal(statsViewParam(raw), undefined);
  });
});

describe("stats.main links", () => {
  it("carry view and studentId in the query", () => {
    assert.deepEqual(hrefFor({ screen: "stats.main" }, "DEVELOPER"), { pathname: "/developer/statistics" });
    assert.deepEqual(hrefFor({ screen: "stats.main", view: "teachers" }, "DEVELOPER"), {
      pathname: "/developer/statistics",
      params: { view: "teachers" },
    });
    assert.deepEqual(hrefFor({ screen: "stats.main", studentId: "usr_ilya" }, "DEVELOPER"), {
      pathname: "/developer/statistics",
      params: { studentId: "usr_ilya" },
    });
  });

  it("are parsed from untrusted data with the same rules", () => {
    assert.deepEqual(parseAppLink({ screen: "stats.main" }), { screen: "stats.main" });
    assert.deepEqual(parseAppLink({ screen: "stats.main", view: "developer", studentId: "usr_ilya" }), {
      screen: "stats.main",
      view: "developer",
      studentId: "usr_ilya",
    });
    assert.deepEqual(parseAppLink({ screen: "stats.main", view: "nope", studentId: 5 }), { screen: "stats.main" });
  });
});

describe("initialStatsState", () => {
  it("defaults to the progress view of every student", () => {
    assert.deepEqual(initialStatsState(undefined, undefined), { view: "teacher", timelineStudentId: undefined });
    assert.deepEqual(initialStatsState("bogus", undefined), { view: "teacher", timelineStudentId: undefined });
  });

  it("opens the requested view", () => {
    assert.deepEqual(initialStatsState("teachers", undefined), { view: "teachers", timelineStudentId: undefined });
    assert.deepEqual(initialStatsState("developer", undefined), { view: "developer", timelineStudentId: undefined });
  });

  it("filters the timeline only in the progress view", () => {
    assert.deepEqual(initialStatsState(undefined, "usr_ilya"), { view: "teacher", timelineStudentId: "usr_ilya" });
    assert.deepEqual(initialStatsState("teachers", "usr_ilya"), { view: "teachers", timelineStudentId: undefined });
    assert.deepEqual(initialStatsState(undefined, ""), { view: "teacher", timelineStudentId: undefined });
  });
});
