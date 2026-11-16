/**
 * Student study: deadlines, theory, number detail, note (owner spec 02).
 * Source: docs/spec/00-unified-contract.md §1.4.2.
 *
 * Exam info (`student.info`) has no endpoint: the scale tables and texts are bundled.
 */
import type { DateKey, HomeworkNumberStatus, IsoDateTime } from "./primitives";
import type { StoredFileRef } from "./shared";

/**
 * Light homework list item (home, calendar).
 * Label = `title ?? format(dict.common.homeworkN, { n: orderInTopic })` — built on the client.
 */
export type HomeworkDeadlineSummary = {
  id: string;
  /** Custom title, or null. */
  title: string | null;
  /** 1-based ordinal of the homework inside its topic for this student. */
  orderInTopic: number;
  topicTitle: string;
  deadlineAt: IsoDateTime | null;
  totalNumbers: number;
  /** GREEN + YELLOW. */
  solvedCount: number;
};

/** `GET /student/homework-deadlines`. `items` sorted by `createdAt` asc. */
export type HomeworkDeadlinesResponse = {
  serverNow: IsoDateTime;
  /** Moscow calendar day of `serverNow`. */
  today: DateKey;
  items: HomeworkDeadlineSummary[];
};

/** `GET /student/theory`. Only topics that have a theory file. */
export type TheoryLibraryResponse = {
  topics: { id: string; title: string; description: string; theoryFile: StoredFileRef }[];
};

/** `GET /student/numbers/{number}`. Never contains answers. */
export type StudentNumberDetailResponse = {
  topic: { id: string; title: string; description: string };
  number: {
    /** `homeworkNumberId` — what `saveNumberNote` takes. */
    id: string;
    number: string;
    conditionLatex: string | null;
    status: HomeworkNumberStatus | null;
    /** "" when none. */
    note: string;
    deadlineAt: IsoDateTime | null;
    statusUpdatedAt: IsoDateTime | null;
  };
  /** false hides the note field (the `note` column is missing on the server). */
  notesEnabled: boolean;
};

/** `PUT /student/numbers/{homeworkNumberId}/note`. Server trims and cuts to 240; "" clears. A `status` key → `403 statusReadOnly`. */
export type SaveNoteRequest = { note: string };
/** Wire body; the typed method resolves to it without `ok`. */
export type SaveNoteResponse = { ok: true; status: HomeworkNumberStatus | null; note: string; notesEnabled: boolean };
