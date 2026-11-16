/**
 * Content: topics, numbers, statements / answers, import (owner spec 07).
 * Source: docs/spec/00-unified-contract.md §1.4.8.
 *
 * TEACHER reads topics (read-only); DEVELOPER manages them. None of these types is ever sent to a STUDENT
 * (they carry `answerLatex`).
 */
import type { StoredFileRef } from "./shared";

export type TopicListItem = {
  id: string;
  title: string;
  description: string;
  displayOrder: number;
  totalNumbers: number;
  studentsWithActivity: number;
};

export type TopicNumber = {
  /** `homeworkNumberId` */
  id: string;
  number: string;
  displayOrder: number;
  estimatedMinutes: number | null;
  conditionLatex: string | null;
  answerLatex: string | null;
};

/** `GET /topics/{topicId}` and the result of `PATCH /topics/{topicId}`. */
export type TopicDetail = {
  topic: {
    id: string;
    title: string;
    description: string;
    displayOrder: number;
    theoryFile: StoredFileRef | null;
    homeworkFile: StoredFileRef | null;
    homeworkNumbers: TopicNumber[];
  };
  stats: {
    totalNumbers: number;
    theoryAttached: boolean;
    homeworkAttached: boolean;
    conditionsCount: number;
    answersCount: number;
  };
};

/** `GET /topics/{topicId}/numbers/{number}`. */
export type NumberDetail = {
  topic: { id: string; title: string; description: string };
  number: { id: string; number: string; conditionLatex: string | null; answerLatex: string | null };
};

/** Wire body of `GET /topics/{topicId}/conditions`; keys are `homeworkNumberId`s. The typed method returns the bare record. */
export type TopicConditions = { conditions: Record<string, string | null> };

export type TopicImpactSummary = {
  totalNumbers: number;
  numbersWithWork: number;
  statusCount: number;
  noteCount: number;
  activeAssignments: number;
  checkResults: number;
  lessonItems: number;
  numbersWithCondition: number;
  numbersWithAnswer: number;
};

/** `GET /topics/{topicId}/impact` — what deleting the topic destroys. `lines` are localized. */
export type TopicImpact = { summary: TopicImpactSummary; lines: string[] };

/** `POST /topics/{topicId}/numbers-preview` — also `details` of `409 numbersConfirm` / `409 numbersAssigned`. */
export type NumbersChangePreview = {
  keptCount: number;
  added: string[];
  /** Some removed numbers have student work → `confirmNumbersRemoval` is required. */
  requiresConfirmation: boolean;
  /** Some removed numbers are in an issued homework → `allowAssignedRemoval` is required. */
  requiresAssignedConfirmation: boolean;
  removed: { number: string; summary: string; hasStudentWork: boolean; isAssigned: boolean }[];
};

/** `POST /topics`. `numbers` is the raw field text; both files are pre-uploaded through `POST /uploads`. */
export type CreateTopicRequest = {
  title: string;
  description?: string;
  numbers: string;
  theoryFileId: string;
  homeworkFileId: string;
};

/** `PATCH /topics/{topicId}`. The `numbers` field REPLACES the whole set. */
export type UpdateTopicRequest = {
  title: string;
  description: string;
  numbers: string;
  theoryFileId?: string;
  homeworkFileId?: string;
  /** The removed numbers the user confirmed (from the preview). */
  confirmNumbersRemoval?: string[];
  allowAssignedRemoval?: boolean;
};

export type ImportTarget = { topicId: string } | { createTopic: true };

/** Wire body of `POST /topic-import`. `mode: "preview"` writes nothing. `text` ≤ 2 MiB. */
export type ImportRequest = { mode: "preview" | "apply"; text: string; target: ImportTarget; overwriteFilled?: boolean };

export type ImportNumber = { number: string; conditionLatex: string; answerLatex: string | null };

export type ImportPreview = {
  fileTitle: string;
  fileDescription?: string;
  willCreateTopic?: true;
  duplicateTitle?: boolean;
  totalInFile: number;
  willAddNumbers: number;
  willFillEmpty: number;
  willOverwrite: number;
  untouched: number;
  sample: ImportNumber[];
  warnings: string[];
  issues: string[];
};

/** `topicId` is present when the import created a topic. Import never deletes numbers. */
export type ImportApplyResult = { topicId?: string; created: number; filled: number; overwritten: number; skipped: number };
