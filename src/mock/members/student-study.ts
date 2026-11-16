/**
 * `StudentStudyApi` on the mock store — 02 — deadlines, theory, number detail, note (docs/spec/02-student-study.md; 00 §2.5).
 *
 * NOT IMPLEMENTED YET: every method rejects with `ApiError { code: "internalError" }`. The owner of this
 * member replaces the bodies below using `ctx` (see `../context.ts` for the helpers and the shape of a
 * typical method) and does not need to touch any other file of `src/mock`.
 */
import type { StudentStudyApi } from "@/api/client";

import type { MockContext } from "../context";
import { notImplemented } from "./not-implemented";

// `ctx` is unused until the methods are implemented.
export function createStudentStudy(ctx: MockContext): StudentStudyApi {
  return {
    async getHomeworkDeadlines() {
      return notImplemented("studentStudy.getHomeworkDeadlines");
    },
    async getTheoryLibrary() {
      return notImplemented("studentStudy.getTheoryLibrary");
    },
    async getNumberDetail() {
      return notImplemented("studentStudy.getNumberDetail");
    },
    async saveNumberNote() {
      return notImplemented("studentStudy.saveNumberNote");
    },
  };
}
