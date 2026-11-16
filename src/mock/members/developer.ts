/**
 * `DeveloperApi` on the mock store — 07 — developer panel, settings, actions, broadcast, journal (docs/spec/07-developer-content.md; 00 §2.12).
 *
 * NOT IMPLEMENTED YET: every method rejects with `ApiError { code: "internalError" }`. The owner of this
 * member replaces the bodies below using `ctx` (see `../context.ts` for the helpers and the shape of a
 * typical method) and does not need to touch any other file of `src/mock`.
 */
import type { DeveloperApi } from "@/api/client";

import type { MockContext } from "../context";
import { notImplemented } from "./not-implemented";

// `ctx` is unused until the methods are implemented.
export function createDeveloper(ctx: MockContext): DeveloperApi {
  return {
    async getPanel() {
      return notImplemented("developer.getPanel");
    },
    async saveSettings() {
      return notImplemented("developer.saveSettings");
    },
    async runAction() {
      return notImplemented("developer.runAction");
    },
    async broadcast() {
      return notImplemented("developer.broadcast");
    },
    async getJournal() {
      return notImplemented("developer.getJournal");
    },
  };
}
