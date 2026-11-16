/**
 * `TeacherStudentsApi` on the mock store — 04 — teacher home, students, homework review / assign, progress history, report (docs/spec/04-teacher-students.md; 00 §2.8).
 *
 * NOT IMPLEMENTED YET: every method rejects with `ApiError { code: "internalError" }`. The owner of this
 * member replaces the bodies below using `ctx` (see `../context.ts` for the helpers and the shape of a
 * typical method) and does not need to touch any other file of `src/mock`.
 */
import type { TeacherStudentsApi } from "@/api/client";

import type { MockContext } from "../context";
import { notImplemented } from "./not-implemented";

// `ctx` is unused until the methods are implemented.
export function createTeacherStudents(ctx: MockContext): TeacherStudentsApi {
  return {
    async getTeacherHome() {
      return notImplemented("teacherStudents.getTeacherHome");
    },
    async listStudents() {
      return notImplemented("teacherStudents.listStudents");
    },
    async createStudent() {
      return notImplemented("teacherStudents.createStudent");
    },
    async deleteStudent() {
      return notImplemented("teacherStudents.deleteStudent");
    },
    async resetStudentPassword() {
      return notImplemented("teacherStudents.resetStudentPassword");
    },
    async getStudentCard() {
      return notImplemented("teacherStudents.getStudentCard");
    },
    async getStudentHomeworks() {
      return notImplemented("teacherStudents.getStudentHomeworks");
    },
    async getAssignBoard() {
      return notImplemented("teacherStudents.getAssignBoard");
    },
    async issueHomework() {
      return notImplemented("teacherStudents.issueHomework");
    },
    async cancelHomework() {
      return notImplemented("teacherStudents.cancelHomework");
    },
    async setNumberStatus() {
      return notImplemented("teacherStudents.setNumberStatus");
    },
    async setNumberStatuses() {
      return notImplemented("teacherStudents.setNumberStatuses");
    },
    async setNumberDeadlines() {
      return notImplemented("teacherStudents.setNumberDeadlines");
    },
    async getProgressHistory() {
      return notImplemented("teacherStudents.getProgressHistory");
    },
    async listStudentLessons() {
      return notImplemented("teacherStudents.listStudentLessons");
    },
    async downloadStudentReport() {
      return notImplemented("teacherStudents.downloadStudentReport");
    },
  };
}
