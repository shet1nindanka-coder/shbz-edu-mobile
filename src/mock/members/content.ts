/**
 * `ContentApi` on the mock store — topics, numbers, statements / answers, import, upload
 * (docs/spec/07-developer-content.md §3 – §4; 00 §2.4, §2.12; 90-addendum-1 A.8, A.11; 90-addendum-2 A.2.9, A.2.11).
 *
 * The bank is shared: no content endpoint has an owner scope. TEACHER and DEVELOPER read, only a DEVELOPER
 * writes (`403 developerRightsRequired` for everybody else). None of these DTOs ever reaches a STUDENT —
 * they carry `answerLatex`.
 *
 * Order inside every method: role → the addressed resource (404) → rate limit → input validation → effect →
 * realtime event. Every content mutation publishes `topic-content-changed` (07 §5), with the `topicId` the
 * site sends for it.
 */
import type { ContentApi } from "@/api/client";
import { ApiError } from "@/api/errors";
import type {
  ImportApplyResult,
  ImportPreview,
  ImportTarget,
  NumbersChangePreview,
  Topic,
  TopicDetail,
  TopicHomeworkNumber,
  TopicImpact,
  TopicListItem,
} from "@/api/types";
import { LIMITS } from "@/api/types";
import { findHomeworkNumberTwins, parseNumbersInput } from "@/domain/numbers";
import { normalizeMultilineText, normalizeSingleLineText } from "@/domain/text";
import { buildImportPlan, buildImportUpdateData, parseTopicImportText, type ParsedImport } from "@/domain/topic-import";
import { TOPIC_IMPORT_PROMPT } from "@/domain/topic-import-prompt";
import {
  buildTopicNumbersChangePlan,
  describeTopicImpact,
  isRemovalConfirmationValid,
  summarizeTopicImpact,
  type TopicNumberFacts,
  type TopicNumbersChangePlan,
} from "@/domain/topic-numbers-change";
import { UploadValidationError, validateUploadMetadata } from "@/domain/upload-validation";
import { format } from "@/lib/i18n/format";

import type { MockContext } from "../context";
import type { FailInit } from "../rules/errors";
import type { MockUser } from "../store/schema";

/** Numbers shown under «Как это увидит ученик» of the import preview (`SAMPLE_SIZE` of the site route). */
const IMPORT_SAMPLE_SIZE = 5;

const isBlank = (value: string | null | undefined): boolean => (value ?? "").trim().length === 0;

/** UTF-8 size of a text without `TextEncoder` (not guaranteed in every React Native runtime). */
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
      // A surrogate pair is one 4-byte sequence.
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function createContent(ctx: MockContext): ContentApi {
  const { store, errors, auth, guard, limits, q } = ctx;

  // ───────────────────────────── projections ─────────────────────────────

  const toTopicDetail = (topic: Topic): TopicDetail => {
    const numbers = q.numbersOfTopic(topic.id);
    const theoryFile = ctx.files.storedRef(topic.theoryFileId);
    const homeworkFile = ctx.files.storedRef(topic.homeworkFileId);
    return {
      topic: {
        id: topic.id,
        title: topic.title,
        description: topic.description,
        displayOrder: topic.displayOrder,
        theoryFile,
        homeworkFile,
        homeworkNumbers: numbers.map((number) => ({
          id: number.id,
          number: number.number,
          displayOrder: number.displayOrder,
          estimatedMinutes: number.estimatedMinutes,
          conditionLatex: number.conditionLatex,
          answerLatex: number.answerLatex,
        })),
      },
      stats: {
        totalNumbers: numbers.length,
        theoryAttached: theoryFile !== null,
        homeworkAttached: homeworkFile !== null,
        conditionsCount: numbers.filter((number) => !isBlank(number.conditionLatex)).length,
        answersCount: numbers.filter((number) => !isBlank(number.answerLatex)).length,
      },
    };
  };

  /** The mock `loadTopicNumberFacts`: what would disappear with every number of the topic (07 §4.3). */
  const numberFacts = (topicId: string): TopicNumberFacts[] =>
    q.numbersOfTopic(topicId).map((number) => {
      const statuses = store.statuses.by("homeworkNumberId", number.id);
      return {
        id: number.id,
        number: number.number,
        studentsWithStatus: statuses.filter((row) => row.status !== null).length,
        studentsWithNote: statuses.filter((row) => (row.note ?? "").replace(/\s/g, "") !== "").length,
        studentsWithDeadline: statuses.filter((row) => row.deadlineAt !== null).length,
        activeAssignments: store.homeworkNumbers.by("homeworkNumberId", number.id).length,
        checkResults: store.homeworkCheckResults.by("homeworkNumberId", number.id).length,
        lessonItems: store.lessonItems.by("homeworkNumberId", number.id).length,
        hasCondition: !isBlank(number.conditionLatex),
        hasAnswer: !isBlank(number.answerLatex),
        hasAnswerFile: number.answerFileId !== null,
      };
    });

  const toNumbersPreview = (plan: TopicNumbersChangePlan): NumbersChangePreview => ({
    keptCount: plan.keptCount,
    added: plan.added,
    requiresConfirmation: plan.requiresConfirmation,
    requiresAssignedConfirmation: plan.requiresAssignedConfirmation,
    removed: plan.removed.map((entry) => ({
      number: entry.number,
      summary: entry.summary,
      hasStudentWork: entry.hasStudentWork,
      isAssigned: entry.isAssigned,
    })),
  });

  const topicImpact = (topicId: string): TopicImpact => {
    const summary = summarizeTopicImpact(numberFacts(topicId));
    return { summary, lines: describeTopicImpact(summary, ctx.locale()) };
  };

  // ───────────────────────────── shared write helpers ─────────────────────────────

  /** `displayOrder` of a topic appended at the end of the list. */
  const nextTopicOrder = (): number => store.topics.all().reduce((max, topic) => Math.max(max, topic.displayOrder), 0) + 1;

  const insertNumber = (
    topicId: string,
    number: string,
    displayOrder: number,
    latex: { conditionLatex: string | null; answerLatex: string | null } = { conditionLatex: null, answerLatex: null },
  ): TopicHomeworkNumber =>
    store.numbers.insert({
      id: store.nextId("num"),
      topicId,
      number,
      displayOrder,
      conditionLatex: latex.conditionLatex,
      answerLatex: latex.answerLatex,
      answerFileId: null,
      estimatedMinutes: null,
      // Column default of the site.
      usableInDiagnostic: false,
    });

  /**
   * Runs a write the way the site runs a DB transaction: all or nothing, and a failure that is not an
   * `ApiError` (a broken constraint) becomes the endpoint's `500` instead of leaking out.
   */
  const write = <T>(failure: FailInit, work: () => T): T => {
    try {
      return store.transaction(work);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      return errors.fail(failure);
    }
  };

  /** A pre-uploaded file usable by this developer (`uploadedById` must be the caller — 07 §3.1). */
  const isOwnUpload = (user: MockUser, fileId: string): boolean => store.files.get(fileId)?.uploadedById === user.id;

  const filesUnavailable = (): never =>
    errors.fail({ status: 400, code: "filesUnavailable", message: (dict) => dict.apiContent.topics.filesUnavailable });

  // ───────────────────────────── import ─────────────────────────────

  type ImportInput = { text?: unknown; target?: ImportTarget; overwriteFilled?: unknown };
  type ImportContext = { parsed: ParsedImport; topic: Topic | null };

  /** Everything `POST /topic-import` does before the mode-specific part (07 §3.10). */
  const prepareImport = (input: ImportInput): ImportContext => {
    auth.requireDeveloper();

    const target = input?.target as { topicId?: unknown; createTopic?: unknown } | undefined;
    const topicId = ctx.validate.id(target?.topicId) ?? "";
    const createTopic = target?.createTopic === true;
    // The addressed topic first: a deleted topic is a 404 whatever the file contains.
    const topic = !createTopic && topicId ? (q.topic(topicId) ?? null) : null;
    if (!createTopic && topicId && !topic) {
      return errors.fail({ status: 404, code: "topicDeleted", message: (dict) => dict.apiContent.topicImport.topicDeleted });
    }

    // Preview and apply each count.
    limits.enforce("api:topic-import");

    const text = typeof input?.text === "string" ? input.text : "";
    // The site refuses by `Content-Length`; the text is all the mock has of the body.
    const tooBig = text.length > LIMITS.importTextMaxBytes || (text.length * 3 > LIMITS.importTextMaxBytes && utf8ByteLength(text) > LIMITS.importTextMaxBytes);
    if (tooBig) {
      return errors.fail({ status: 413, code: "fileTooBig", message: (dict) => dict.apiContent.topicImport.fileTooBig });
    }

    if (!topicId && !createTopic) {
      return errors.fail({ status: 400, code: "topicMissing", message: (dict) => dict.apiContent.topicImport.topicMissing });
    }

    const parsed = parseTopicImportText(text, ctx.locale());
    // The parser's own (localised) sentence is the message.
    if (!parsed.ok) return errors.fail({ status: 400, code: "importInvalid", message: parsed.error });

    return { parsed: parsed.data, topic };
  };

  const existingNumbersOf = (topicId: string) =>
    q.numbersOfTopic(topicId).map((number) => ({ number: number.number, conditionLatex: number.conditionLatex, answerLatex: number.answerLatex }));

  return {
    // ───────────────────────────── read (TEACHER · DEVELOPER) ─────────────────────────────

    async listTopics() {
      const user = auth.requireStaff();

      // A TEACHER counts activity among own students only, a DEVELOPER among everybody (07 §1.1).
      const visible = new Set(q.visibleStudents(user).map((student) => student.id));
      const active = new Map<string, Set<string>>();
      for (const row of store.statuses.all()) {
        if (row.status === null || !visible.has(row.studentId)) continue;
        const topicId = store.numbers.get(row.homeworkNumberId)?.topicId;
        if (!topicId) continue;
        const students = active.get(topicId) ?? new Set<string>();
        students.add(row.studentId);
        active.set(topicId, students);
      }

      return q.topicsOrdered().map(
        (topic): TopicListItem => ({
          id: topic.id,
          title: topic.title,
          description: topic.description,
          displayOrder: topic.displayOrder,
          totalNumbers: store.numbers.by("topicId", topic.id).length,
          studentsWithActivity: active.get(topic.id)?.size ?? 0,
        }),
      );
    },

    async getTopic(topicId) {
      auth.requireStaff();
      return toTopicDetail(guard.topic(topicId));
    },

    async getNumber(topicId, number) {
      auth.requireStaff();
      // The segment must be digits; the lookup is by the normalised form inside the topic. An unknown topic
      // and an unknown number are the same 404.
      const topic = q.topic(topicId);
      const label = typeof number === "string" && /^\d+$/.test(number) ? number : null;
      const found = topic && label !== null ? q.findNumberByLabel(label, topic.id) : undefined;
      if (!topic || !found) throw errors.notFound("numberNotFound");
      return {
        topic: { id: topic.id, title: topic.title, description: topic.description },
        // The recorded spelling, leading zeros kept.
        number: { id: found.id, number: found.number, conditionLatex: found.conditionLatex, answerLatex: found.answerLatex },
      };
    },

    async getTopicConditions(topicId) {
      auth.requireStaff();
      limits.enforce("api:topic-conditions");
      // Never fails: an empty or unknown topic id yields an empty map (90-addendum-2 A.2.9).
      const conditions: Record<string, string | null> = {};
      const id = ctx.validate.id(topicId);
      if (id === null) return conditions;
      for (const number of store.numbers.by("topicId", id)) conditions[number.id] = number.conditionLatex;
      return conditions;
    },

    // ───────────────────────────── upload (DEVELOPER) ─────────────────────────────

    async uploadFile(file, opts) {
      const user = auth.requireDeveloper();
      ctx.throwIfAborted(opts?.signal);
      limits.enforce("api:teacher-uploads");

      const size = typeof file?.size === "number" ? file.size : Number.NaN;
      if (!file || typeof file.uri !== "string" || !file.uri || size === 0) {
        return errors.fail({ status: 400, code: "fileRequired", message: (dict) => dict.apiContent.uploads.fileRequired });
      }

      let metadata: ReturnType<typeof validateUploadMetadata>;
      try {
        metadata = validateUploadMetadata(String(file.name ?? ""), String(file.mimeType ?? ""), size, ctx.locale());
      } catch (error) {
        if (!(error instanceof UploadValidationError)) {
          return errors.fail({ status: 500, code: "uploadFailed", message: (dict) => dict.apiContent.uploads.uploadFailed });
        }
        // The validator reports a sentence; the code is its class (90-addendum-1 A.7 / A.8).
        const texts = ctx.dict().topics.lib.upload;
        const max = LIMITS.uploadFileNameMaxLength;
        const message = error.message;
        if (message === format(texts.nameTooLong, { max })) return errors.fail({ status: 400, code: "uploadBadName", message, params: { max } });
        if (message === texts.badChars) return errors.fail({ status: 400, code: "uploadBadName", message });
        if (message === texts.tooBig) return errors.fail({ status: 413, code: "uploadTooLarge", message });
        if (message === texts.emptySize || message === texts.sizeMismatch) return errors.fail({ status: 400, code: "uploadRejected", message });
        return errors.fail({ status: 400, code: "uploadUnsupportedType", message });
      }

      ctx.throwIfAborted(opts?.signal);
      // The stored name is the trimmed one and the stored type comes from the extension, never from the client.
      const stored = ctx.files.createFromUpload({ uri: file.uri, name: metadata.originalName, mimeType: metadata.mimeType, size }, user.id);

      // The file this slot held before: removed when it is the caller's own and nothing uses it.
      const previousFileId = ctx.validate.id(opts?.previousFileId);
      if (previousFileId !== null && previousFileId !== stored.id && isOwnUpload(user, previousFileId)) {
        ctx.files.removeIfUnreferenced(previousFileId);
      }

      opts?.onProgress?.(100);
      return { id: stored.id, originalName: stored.originalName, mimeType: stored.mimeType, size: stored.size, uploadedAt: stored.uploadedAt };
    },

    // ───────────────────────────── topics: write (DEVELOPER) ─────────────────────────────

    async createTopic(input) {
      const user = auth.requireDeveloper();
      limits.enforce("api:topics-create");

      const title = normalizeSingleLineText(String(input?.title ?? ""));
      const description = normalizeMultilineText(String(input?.description ?? ""));
      const numbers = parseNumbersInput(String(input?.numbers ?? ""));
      const theoryFileId = String(input?.theoryFileId ?? "").trim();
      const homeworkFileId = String(input?.homeworkFileId ?? "").trim();

      // The description is optional.
      if (!title || numbers.length === 0 || !theoryFileId || !homeworkFileId) {
        return errors.fail({ status: 400, code: "formInvalid", message: (dict) => dict.apiContent.topics.formInvalid });
      }
      // Two different files, both uploaded by the caller (the site counts the rows it finds).
      if (theoryFileId === homeworkFileId || !isOwnUpload(user, theoryFileId) || !isOwnUpload(user, homeworkFileId)) return filesUnavailable();

      const topic = write({ status: 500, code: "saveFailed", message: (dict) => dict.apiContent.topics.saveFailed }, () => {
        const now = ctx.nowIso();
        const created = store.topics.insert({
          id: store.nextId("top"),
          title,
          description,
          displayOrder: nextTopicOrder(),
          subject: "MATH",
          grade: null,
          theoryFileId,
          homeworkFileId,
          answersFileId: null,
          createdAt: now,
          updatedAt: now,
        });
        numbers.forEach((number, index) => insertNumber(created.id, number, index + 1));
        return created;
      });

      // No journal row: the site writes none for a manual creation (07 §3.1).
      ctx.emit({ kind: "topic-content-changed", topicId: topic.id });
      return { topicId: topic.id };
    },

    async previewNumbersChange(topicId, numbers) {
      auth.requireDeveloper();
      const topic = guard.topic(topicId);
      limits.enforce("api:topic-numbers-preview");

      const next = parseNumbersInput(String(numbers ?? ""));
      if (next.length === 0) {
        return errors.fail({ status: 400, code: "emptyNumbers", message: (dict) => dict.apiContent.topicNumbersPreview.emptyNumbers });
      }

      const facts = numberFacts(topic.id);
      // Twins before the plan: otherwise the preview would say "10203 goes, 010203 comes" and the save would still refuse.
      const twin = findHomeworkNumberTwins(facts.map((entry) => entry.number), next)[0];
      if (twin) {
        return errors.fail({
          status: 400,
          code: "numbersTwin",
          message: (dict) => dict.apiContent.topicNumbersPreview.twins,
          params: { typed: twin.typed, existing: twin.existing },
        });
      }

      return toNumbersPreview(buildTopicNumbersChangePlan(facts, next, ctx.locale()));
    },

    async updateTopic(topicId, input) {
      const user = auth.requireDeveloper();
      const topic = guard.topic(topicId);

      const title = normalizeSingleLineText(String(input?.title ?? ""));
      const description = normalizeMultilineText(String(input?.description ?? ""));
      const numbers = parseNumbersInput(String(input?.numbers ?? ""));
      if (!title || numbers.length === 0) throw errors.invalidData((dict) => dict.topics.edit.notices.invalid);

      const existing = q.numbersOfTopic(topic.id);
      // «010203» next to a stored «10203» is the same number written differently: refused, never merged.
      if (findHomeworkNumberTwins(existing.map((number) => number.number), numbers).length > 0) {
        return errors.fail({ status: 400, code: "numbersTwin", message: (dict) => dict.topics.edit.notices.numbersTwin });
      }

      // The gate is recomputed here: a confirmation answers one concrete list of numbers, so it is void when
      // the set of dangerous numbers changed since the preview. Both refusals carry the fresh preview.
      const plan = buildTopicNumbersChangePlan(numberFacts(topic.id), numbers, ctx.locale());
      if (plan.requiresConfirmation) {
        const confirmed = Array.isArray(input?.confirmNumbersRemoval)
          ? input.confirmNumbersRemoval.map((value) => String(value).trim()).filter((value) => /^\d+$/.test(value))
          : [];
        if (!isRemovalConfirmationValid(plan, confirmed)) {
          return errors.fail({ status: 409, code: "numbersConfirm", message: (dict) => dict.topics.edit.notices.numbersConfirm, details: toNumbersPreview(plan) });
        }
        if (plan.requiresAssignedConfirmation && input?.allowAssignedRemoval !== true) {
          return errors.fail({ status: 409, code: "numbersAssigned", message: (dict) => dict.topics.edit.notices.numbersAssigned, details: toNumbersPreview(plan) });
        }
      }

      // SPEC-GAP: the site receives replacement files inside the form; the mobile contract passes ids of
      // files pre-uploaded through `POST /uploads` and names no error for a bad id. The rule of
      // `POST /topics` is applied: the file must exist and be the caller's own upload, else `400 filesUnavailable`.
      const replacement = (requested: unknown, current: string | null): string | null => {
        const id = ctx.validate.id(requested);
        if (id === null || id === current) return current;
        if (!isOwnUpload(user, id)) return filesUnavailable();
        return id;
      };
      const theoryFileId = replacement(input?.theoryFileId, topic.theoryFileId);
      const homeworkFileId = replacement(input?.homeworkFileId, topic.homeworkFileId);

      const nextSet = new Set(numbers);
      const removed = existing.filter((number) => !nextSet.has(number.number));
      const orphanedFileIds = new Set<string>();
      if (theoryFileId !== topic.theoryFileId && topic.theoryFileId) orphanedFileIds.add(topic.theoryFileId);
      if (homeworkFileId !== topic.homeworkFileId && topic.homeworkFileId) orphanedFileIds.add(topic.homeworkFileId);
      for (const number of removed) if (number.answerFileId) orphanedFileIds.add(number.answerFileId);

      const updated = write({ status: 500, code: "saveFailed", message: (dict) => dict.topics.edit.notices.save }, () => {
        const row = store.topics.update(topic.id, { title, description, theoryFileId, homeworkFileId, updatedAt: ctx.nowIso() });

        // A removed number takes every student's status, note and deadline for it, its homework entries,
        // check verdicts, lesson items and progress history along (07 §0.3). Kept numbers keep their id,
        // statement, answer and all student data; only the order changes.
        for (const number of removed) {
          // Detached first, so the answer file is cleaned up below through the file rules.
          if (number.answerFileId) store.numbers.update(number.id, { answerFileId: null });
          ctx.cascade.deleteNumber(number.id);
        }
        const byLabel = new Map(existing.map((number) => [number.number, number] as const));
        numbers.forEach((label, index) => {
          const current = byLabel.get(label);
          if (!current) insertNumber(topic.id, label, index + 1);
          else if (current.displayOrder !== index + 1) store.numbers.update(current.id, { displayOrder: index + 1 });
        });
        return row;
      });

      // Best effort, after the save: replaced topic files and answer files of removed numbers.
      for (const fileId of orphanedFileIds) ctx.files.removeIfUnreferenced(fileId);
      ctx.emit({ kind: "topic-content-changed", topicId: topic.id });
      return toTopicDetail(updated);
    },

    async deleteTopicFile(topicId, kind) {
      auth.requireDeveloper();
      // SPEC-GAP: the contract lists no endpoint error here; the site bounces an unknown topic to the list
      // with `error=save`. The entity 404 is used, as for every other topic endpoint.
      const topic = guard.topic(topicId);
      // The legacy `answers` kind of the site action has no UI and is not part of the mobile contract.
      if (kind !== "theory" && kind !== "homework") throw errors.invalidData();

      const fileId = kind === "theory" ? topic.theoryFileId : topic.homeworkFileId;
      // Idempotent: nothing attached is a success and changes nothing.
      if (!fileId) return;

      store.topics.update(topic.id, { ...(kind === "theory" ? { theoryFileId: null } : { homeworkFileId: null }), updatedAt: ctx.nowIso() });
      ctx.files.removeIfUnreferenced(fileId);
      ctx.emit({ kind: "topic-content-changed", topicId: topic.id });
    },

    async getTopicImpact(topicId) {
      auth.requireDeveloper();
      return topicImpact(guard.topic(topicId).id);
    },

    async deleteTopic(topicId, acknowledgedNumbersWithWork) {
      const user = auth.requireDeveloper();
      const topic = guard.topic(topicId);

      // Deleting a topic erases every student's progress on it, so the caller sends back the amount of work
      // it showed in the dialog; if that changed meanwhile, the user confirmed something else.
      const impact = topicImpact(topic.id);
      if (impact.summary.numbersWithWork > 0) {
        const raw: unknown = acknowledgedNumbersWithWork;
        const acknowledged = typeof raw === "number" ? raw : Number(String(raw ?? "").trim() || Number.NaN);
        if (!Number.isInteger(acknowledged) || acknowledged !== impact.summary.numbersWithWork) {
          return errors.fail({ status: 409, code: "deleteChanged", message: (dict) => dict.topics.edit.notices.deleteChanged, details: impact });
        }
      }

      const numbers = store.numbers.by("topicId", topic.id);
      const fileIds = new Set<string>();
      for (const fileId of [topic.theoryFileId, topic.homeworkFileId, topic.answersFileId]) if (fileId) fileIds.add(fileId);
      for (const number of numbers) if (number.answerFileId) fileIds.add(number.answerFileId);

      write({ status: 500, code: "deleteFailed", message: (dict) => dict.topics.list.notices.delete }, () => {
        // Files are detached first and cleaned up after the delete, through the file rules.
        store.topics.update(topic.id, { theoryFileId: null, homeworkFileId: null, answersFileId: null });
        for (const number of numbers) if (number.answerFileId) store.numbers.update(number.id, { answerFileId: null });
        // Numbers with statuses, notes, deadlines, verdicts, lesson items and history; the topic's homeworks.
        ctx.cascade.deleteTopic(topic.id);
      });
      for (const fileId of fileIds) ctx.files.removeIfUnreferenced(fileId);

      // The site reports the number of files it set out to clean up.
      ctx.audit.write({
        category: "DATA",
        action: "topic.delete",
        actor: user,
        targetType: "Topic",
        targetId: topic.id,
        text: { key: "topic.deleted", params: { count: fileIds.size } },
        meta: { cleanedFileCount: fileIds.size },
      });
      // Published without a topic id: the topic is gone.
      ctx.emit({ kind: "topic-content-changed" });
    },

    async reorderTopics(orderedTopicIds) {
      auth.requireDeveloper();
      limits.enforce("api:topics-order");

      if (!Array.isArray(orderedTopicIds)) {
        return errors.fail({ status: 400, code: "invalidRequest", message: (dict) => dict.apiContent.topicsOrder.invalidRequest });
      }
      const requested = orderedTopicIds.map((value) => String(value).trim()).filter(Boolean);

      // Only a permutation of the current set is accepted: otherwise the caller's list is stale (a topic
      // was created or deleted elsewhere).
      const currentIds = new Set(store.topics.all().map((topic) => topic.id));
      const isSameSet = requested.length === currentIds.size && new Set(requested).size === requested.length && requested.every((id) => currentIds.has(id));
      if (!isSameSet) {
        return errors.fail({ status: 409, code: "listChanged", message: (dict) => dict.apiContent.topicsOrder.listChanged });
      }

      write({ status: 500, code: "saveFailed", message: (dict) => dict.apiContent.topicsOrder.saveFailed }, () => {
        const now = ctx.nowIso();
        requested.forEach((id, index) => store.topics.update(id, { displayOrder: index + 1, updatedAt: now }));
      });

      // The order is global — students' topic lists follow it.
      ctx.emit({ kind: "topic-content-changed" });
      return requested;
    },

    // ───────────────────────────── statement and answer of a number (DEVELOPER) ─────────────────────────────

    async saveCondition(homeworkNumberId, conditionLatex) {
      auth.requireDeveloper();
      const number = guard.number(homeworkNumberId);
      limits.enforce("api:number-conditions");

      const value = normalizeMultilineText(String(conditionLatex ?? ""));
      if (!value) {
        return errors.fail({ status: 400, code: "latexRequired", message: (dict) => dict.apiContent.numberConditions.latexRequired });
      }

      store.numbers.update(number.id, { conditionLatex: value });
      ctx.emit({ kind: "topic-content-changed", topicId: number.topicId });
      return value;
    },

    async deleteCondition(homeworkNumberId) {
      auth.requireDeveloper();
      const number = guard.number(homeworkNumberId);
      limits.enforce("api:number-conditions");

      // Idempotent: nothing stored is a success without an event.
      if (!number.conditionLatex) return;
      store.numbers.update(number.id, { conditionLatex: null });
      ctx.emit({ kind: "topic-content-changed", topicId: number.topicId });
    },

    async saveAnswer(homeworkNumberId, answerLatex) {
      auth.requireDeveloper();
      const number = guard.number(homeworkNumberId);
      limits.enforce("api:number-answers");

      // Only trimmed — the answer route does not run the multiline normaliser.
      const value = String(answerLatex ?? "").trim();
      if (!value) {
        return errors.fail({ status: 400, code: "latexRequired", message: (dict) => dict.apiContent.numberAnswers.latexRequired });
      }

      // A LaTeX answer replaces the legacy per-number answer file.
      store.numbers.update(number.id, { answerLatex: value, answerFileId: null });
      ctx.files.removeIfUnreferenced(number.answerFileId);
      ctx.emit({ kind: "topic-content-changed", topicId: number.topicId });
      return value;
    },

    async deleteAnswer(homeworkNumberId) {
      auth.requireDeveloper();
      const number = guard.number(homeworkNumberId);
      limits.enforce("api:number-answers");

      if (!number.answerFileId && !number.answerLatex) return;
      store.numbers.update(number.id, { answerLatex: null, answerFileId: null });
      ctx.files.removeIfUnreferenced(number.answerFileId);
      ctx.emit({ kind: "topic-content-changed", topicId: number.topicId });
    },

    // ───────────────────────────── import (DEVELOPER) ─────────────────────────────

    async getImportPrompt() {
      auth.requireDeveloper();
      // A runtime string, Russian in both interface languages (07 Appendix A).
      return TOPIC_IMPORT_PROMPT;
    },

    async previewImport(input) {
      const { parsed, topic } = prepareImport(input);
      const common = {
        totalInFile: parsed.numbers.length,
        sample: parsed.numbers.slice(0, IMPORT_SAMPLE_SIZE),
        warnings: parsed.warnings,
        issues: parsed.issues,
      };

      if (!topic) {
        // A topic with the same title is a warning, not a refusal: titles are not unique.
        const preview: ImportPreview = {
          fileTitle: parsed.title,
          fileDescription: parsed.description,
          willCreateTopic: true,
          duplicateTitle: store.topics.some((row) => row.title === parsed.title),
          ...common,
          willAddNumbers: parsed.numbers.length,
          willFillEmpty: 0,
          willOverwrite: 0,
          untouched: 0,
        };
        return preview;
      }

      const plan = buildImportPlan(parsed.numbers, existingNumbersOf(topic.id));
      return {
        fileTitle: parsed.title,
        ...common,
        willAddNumbers: plan.toCreate.length,
        willFillEmpty: plan.toFill.length,
        willOverwrite: plan.toOverwrite.length,
        untouched: plan.untouched,
      };
    },

    async applyImport(input) {
      const { parsed, topic } = prepareImport(input);
      const overwriteFilled = input?.overwriteFilled === true;

      if (!topic) {
        // A topic created by import has no files; they are attached later on its edit screen.
        const created = write({ status: 500, code: "createFailed", message: (dict) => dict.apiContent.topicImport.createFailed }, () => {
          const now = ctx.nowIso();
          const row = store.topics.insert({
            id: store.nextId("top"),
            title: parsed.title,
            description: parsed.description,
            displayOrder: nextTopicOrder(),
            subject: "MATH",
            grade: null,
            theoryFileId: null,
            homeworkFileId: null,
            answersFileId: null,
            createdAt: now,
            updatedAt: now,
          });
          parsed.numbers.forEach((item, index) => insertNumber(row.id, item.number, index + 1, item));
          return row;
        });
        ctx.emit({ kind: "topic-content-changed", topicId: created.id });
        const result: ImportApplyResult = { topicId: created.id, created: parsed.numbers.length, filled: 0, overwritten: 0, skipped: 0 };
        return result;
      }

      const plan = buildImportPlan(parsed.numbers, existingNumbersOf(topic.id));
      // Empty fields are always filled; filled ones are overwritten only on request.
      const toWrite = overwriteFilled ? [...plan.toFill, ...plan.toOverwrite] : plan.toFill;

      write({ status: 500, code: "writeFailed", message: (dict) => dict.apiContent.topicImport.writeFailed }, () => {
        // New numbers go after the current last one; import never deletes and never reorders.
        const nextOrder = store.numbers.by("topicId", topic.id).reduce((max, number) => Math.max(max, number.displayOrder), 0) + 1;
        plan.toCreate.forEach((item, index) => insertNumber(topic.id, item.number, nextOrder + index, item));
        for (const item of toWrite) {
          // Written under the spelling recorded in the topic (file «010203» updates topic «10203»). The
          // answer is written only when the file has one: a book without answers never erases a manual answer.
          const current = store.numbers.findUnique("topicNumber", `${topic.id}|${item.existingNumber}`);
          if (!current) throw new Error(`Mock import: number "${item.existingNumber}" disappeared from topic "${topic.id}".`);
          store.numbers.update(current.id, buildImportUpdateData(item));
        }
      });

      ctx.emit({ kind: "topic-content-changed", topicId: topic.id });
      return {
        created: plan.toCreate.length,
        filled: plan.toFill.length,
        overwritten: overwriteFilled ? plan.toOverwrite.length : 0,
        skipped: overwriteFilled ? 0 : plan.toOverwrite.length,
      };
    },
  };
}
