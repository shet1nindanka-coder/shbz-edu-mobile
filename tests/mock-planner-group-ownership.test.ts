// `planner` member of the mock backend — a teacher's group that holds another teacher's student (a developer
// may put one there). The site builds the lesson and homework-draft forms from the owner-filtered
// `getGroupDetail`, so the foreign member is neither listed nor sent; the mock also drops it on create.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import { DAY_MS } from "../src/domain/moscow-time";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

const OWN_MEMBERS = ["usr_artem", "usr_kirill", "usr_maria", "usr_polina"];

/** Anna's group 8А with Sofia (Igor's student) added by the developer; signed in as Anna afterwards. */
async function mixedGroup(): Promise<TestMock> {
  const mock = createTestMock();
  await mock.api.ready();
  await mock.signIn("dev@example.com");
  await mock.api.groups.addGroupMember("grp_8a", { studentId: "usr_sofia" });
  assert.equal(mock.store.profiles.all().find((profile) => profile.userId === "usr_sofia")?.groupId, "grp_8a");
  mock.signOut();
  await mock.signIn("teacher@example.com");
  return mock;
}

describe("planner: a foreign student in the teacher's group", () => {
  it("the lesson and draft forms list only the teacher's own members", async () => {
    const mock = await mixedGroup();
    const lessonForm = await mock.api.planner.getLessonNewForm({ groupId: "grp_8a" });
    assert.deepEqual(lessonForm.members.map((member) => member.id), OWN_MEMBERS);
    const draftForm = await mock.api.planner.getHomeworkPlanNewForm({ groupId: "grp_8a" });
    assert.deepEqual(draftForm.members.map((member) => member.id), OWN_MEMBERS);
  });

  it("a lesson never gets the foreign student as a participant", async () => {
    const mock = await mixedGroup();
    const everyone = await mock.api.planner.createLesson({ groupId: "grp_8a", studentIds: [], skipPlan: true });
    assert.deepEqual(mock.ctx.q.participants(everyone.lessonId).map((row) => row.studentId), OWN_MEMBERS);
    const explicit = await mock.api.planner.createLesson({ groupId: "grp_8a", studentIds: ["usr_sofia", "usr_artem"], skipPlan: true });
    assert.deepEqual(mock.ctx.q.participants(explicit.lessonId).map((row) => row.studentId), ["usr_artem"]);
    await assert.rejects(
      mock.api.planner.createLesson({ groupId: "grp_8a", studentIds: ["usr_sofia"], skipPlan: true }),
      (error: unknown) => error instanceof ApiError && error.code === "selectAtLeastOneStudent" && error.status === 400,
    );
  });

  it("a homework draft never gets the foreign student either", async () => {
    const mock = await mixedGroup();
    const { planId } = await mock.api.planner.createHomeworkPlan({ topicId: "top_linear", deadlineAt: iso(3 * DAY_MS), groupId: "grp_8a", studentIds: [] });
    assert.deepEqual(mock.ctx.q.participants(planId).map((row) => row.studentId), OWN_MEMBERS);
    await assert.rejects(
      mock.api.planner.createHomeworkPlan({ topicId: "top_linear", deadlineAt: iso(3 * DAY_MS), groupId: "grp_8a", studentIds: ["usr_sofia"] }),
      (error: unknown) => error instanceof ApiError && error.code === "selectAtLeastOneStudent" && error.status === 400,
    );
  });

  it("the developer still sees and plans for every member", async () => {
    const mock = await mixedGroup();
    mock.signOut();
    await mock.signIn("dev@example.com");
    const form = await mock.api.planner.getLessonNewForm({ groupId: "grp_8a" });
    assert.ok(form.members.some((member) => member.id === "usr_sofia"));
    const { lessonId } = await mock.api.planner.createLesson({ groupId: "grp_8a", studentIds: [], skipPlan: true });
    assert.ok(mock.ctx.q.participants(lessonId).some((row) => row.studentId === "usr_sofia"));
  });
});
