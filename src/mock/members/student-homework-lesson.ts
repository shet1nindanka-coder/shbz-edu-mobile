/**
 * `StudentHomeworkLessonApi` on the mock store — 03 — homeworks, photos, AI check, live lesson (docs/spec/03-student-homework-lesson.md; 90-addendum-5 Part A; 00 §2.6 – §2.7).
 *
 * NOT IMPLEMENTED YET: every method rejects with `ApiError { code: "internalError" }`. The owner of this
 * member replaces the bodies below using `ctx` (see `../context.ts` for the helpers and the shape of a
 * typical method) and does not need to touch any other file of `src/mock`.
 */
import type { StudentHomeworkLessonApi } from "@/api/client";

import type { MockContext } from "../context";
import { notImplemented } from "./not-implemented";

// `ctx` is unused until the methods are implemented.
export function createStudentHomeworkLesson(ctx: MockContext): StudentHomeworkLessonApi {
  return {
    async listHomeworks() {
      return notImplemented("studentWork.listHomeworks");
    },
    async getHomework() {
      return notImplemented("studentWork.getHomework");
    },
    async uploadHomeworkPhotos() {
      return notImplemented("studentWork.uploadHomeworkPhotos");
    },
    async deleteHomeworkPhoto() {
      return notImplemented("studentWork.deleteHomeworkPhoto");
    },
    async startHomeworkCheck() {
      return notImplemented("studentWork.startHomeworkCheck");
    },
    async getLatestHomeworkCheck() {
      return notImplemented("studentWork.getLatestHomeworkCheck");
    },
    async getLiveLesson() {
      return notImplemented("studentWork.getLiveLesson");
    },
    async joinLesson() {
      return notImplemented("studentWork.joinLesson");
    },
    async submitLessonItem() {
      return notImplemented("studentWork.submitLessonItem");
    },
    async getLiveLessonState() {
      return notImplemented("studentWork.getLiveLessonState");
    },
  };
}
