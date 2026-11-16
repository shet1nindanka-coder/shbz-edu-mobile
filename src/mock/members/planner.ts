/**
 * `TeacherPlannerApi` on the mock store — 05 — lessons, live board, homework drafts (docs/spec/05-teacher-lessons-plans.md; 00 §2.10).
 *
 * NOT IMPLEMENTED YET: every method rejects with `ApiError { code: "internalError" }`. The owner of this
 * member replaces the bodies below using `ctx` (see `../context.ts` for the helpers and the shape of a
 * typical method) and does not need to touch any other file of `src/mock`.
 */
import type { TeacherPlannerApi } from "@/api/client";

import type { MockContext } from "../context";
import { notImplemented, notImplementedSync } from "./not-implemented";

// `ctx` is unused until the methods are implemented.
export function createPlanner(ctx: MockContext): TeacherPlannerApi {
  return {
    async listLessons() {
      return notImplemented("planner.listLessons");
    },
    async getLessonTargets() {
      return notImplemented("planner.getLessonTargets");
    },
    async getLessonNewForm() {
      return notImplemented("planner.getLessonNewForm");
    },
    async getNumberBank() {
      return notImplemented("planner.getNumberBank");
    },
    async createLesson() {
      return notImplemented("planner.createLesson");
    },
    async getLessonBoard() {
      return notImplemented("planner.getLessonBoard");
    },
    async getLessonStatus() {
      return notImplemented("planner.getLessonStatus");
    },
    async getLessonLive() {
      return notImplemented("planner.getLessonLive");
    },
    async scheduleLesson() {
      return notImplemented("planner.scheduleLesson");
    },
    async finishLesson() {
      return notImplemented("planner.finishLesson");
    },
    async deleteLesson() {
      return notImplemented("planner.deleteLesson");
    },
    async saveLessonItems() {
      return notImplemented("planner.saveLessonItems");
    },
    async regenerateParticipant() {
      return notImplemented("planner.regenerateParticipant");
    },
    async setItemResult() {
      return notImplemented("planner.setItemResult");
    },
    getHandoutUrl() {
      return notImplementedSync("planner.getHandoutUrl");
    },
    async listHomeworkPlans() {
      return notImplemented("planner.listHomeworkPlans");
    },
    async getHomeworkPlanNewForm() {
      return notImplemented("planner.getHomeworkPlanNewForm");
    },
    async createHomeworkPlan() {
      return notImplemented("planner.createHomeworkPlan");
    },
    async getHomeworkPlanBoard() {
      return notImplemented("planner.getHomeworkPlanBoard");
    },
    async getHomeworkPlanStatus() {
      return notImplemented("planner.getHomeworkPlanStatus");
    },
    async issueHomeworkPlan() {
      return notImplemented("planner.issueHomeworkPlan");
    },
    async deleteHomeworkPlan() {
      return notImplemented("planner.deleteHomeworkPlan");
    },
  };
}
