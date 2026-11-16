/**
 * `ContentApi` on the mock store — 07 — topics, numbers, statements / answers, import, upload (docs/spec/07-developer-content.md; 00 §2.12).
 *
 * NOT IMPLEMENTED YET: every method rejects with `ApiError { code: "internalError" }`. The owner of this
 * member replaces the bodies below using `ctx` (see `../context.ts` for the helpers and the shape of a
 * typical method) and does not need to touch any other file of `src/mock`.
 */
import type { ContentApi } from "@/api/client";

import type { MockContext } from "../context";
import { notImplemented } from "./not-implemented";

// `ctx` is unused until the methods are implemented.
export function createContent(ctx: MockContext): ContentApi {
  return {
    async listTopics() {
      return notImplemented("content.listTopics");
    },
    async getTopic() {
      return notImplemented("content.getTopic");
    },
    async getNumber() {
      return notImplemented("content.getNumber");
    },
    async getTopicConditions() {
      return notImplemented("content.getTopicConditions");
    },
    async uploadFile() {
      return notImplemented("content.uploadFile");
    },
    async createTopic() {
      return notImplemented("content.createTopic");
    },
    async previewNumbersChange() {
      return notImplemented("content.previewNumbersChange");
    },
    async updateTopic() {
      return notImplemented("content.updateTopic");
    },
    async deleteTopicFile() {
      return notImplemented("content.deleteTopicFile");
    },
    async getTopicImpact() {
      return notImplemented("content.getTopicImpact");
    },
    async deleteTopic() {
      return notImplemented("content.deleteTopic");
    },
    async reorderTopics() {
      return notImplemented("content.reorderTopics");
    },
    async saveCondition() {
      return notImplemented("content.saveCondition");
    },
    async deleteCondition() {
      return notImplemented("content.deleteCondition");
    },
    async saveAnswer() {
      return notImplemented("content.saveAnswer");
    },
    async deleteAnswer() {
      return notImplemented("content.deleteAnswer");
    },
    async getImportPrompt() {
      return notImplemented("content.getImportPrompt");
    },
    async previewImport() {
      return notImplemented("content.previewImport");
    },
    async applyImport() {
      return notImplemented("content.applyImport");
    },
  };
}
