/**
 * `DeveloperAccountsApi` on the mock store — 04 S9 — developer accounts (docs/spec/04-teacher-students.md; 00 §2.9).
 *
 * NOT IMPLEMENTED YET: every method rejects with `ApiError { code: "internalError" }`. The owner of this
 * member replaces the bodies below using `ctx` (see `../context.ts` for the helpers and the shape of a
 * typical method) and does not need to touch any other file of `src/mock`.
 */
import type { DeveloperAccountsApi } from "@/api/client";

import type { MockContext } from "../context";
import { notImplemented } from "./not-implemented";

// `ctx` is unused until the methods are implemented.
export function createDeveloperAccounts(ctx: MockContext): DeveloperAccountsApi {
  return {
    async getAccounts() {
      return notImplemented("accounts.getAccounts");
    },
    async createAccount() {
      return notImplemented("accounts.createAccount");
    },
    async changeStudentOwners() {
      return notImplemented("accounts.changeStudentOwners");
    },
    async resetTeacherPassword() {
      return notImplemented("accounts.resetTeacherPassword");
    },
    async deleteTeacher() {
      return notImplemented("accounts.deleteTeacher");
    },
  };
}
