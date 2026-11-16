/**
 * `StudentStudyApi` on the mock store — deadlines, theory library, number detail, personal note
 * (docs/spec/02-student-study.md §2 – §4, §6 as corrected by 90-addendum-1 A.6; 00 §1.4.2, §2.5).
 *
 * The three reads are the site's server-component readers (`getStudentHomeworkDeadlines`,
 * `getStudentTheoryLibrary`, `findTopicIdByNumber` + `getStudentNumberDetail`); the write is
 * `POST /api/student/topic-status` without the redundant `topicId`. A student never changes a colour here:
 * the only column this member writes is `StudentTopicNumberStatus.note`.
 */
import type { StudentStudyApi } from "@/api/client";
import type { HomeworkDeadlineSummary, TheoryLibraryResponse } from "@/api/types";
import { LIMITS } from "@/api/types";
import { mskToday } from "@/domain/moscow-time";

import type { MockContext } from "../context";

/** The request body of the note endpoint as the server sees it: the note, or "the `note` key is absent". */
type NoteBody = { provided: true; note: string } | { provided: false };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * What the server would read from `{ note: <argument> }`. The typed method always passes a string; a mock,
 * like a server, does not trust that: `undefined` is a body without the `note` key, `null` clears, any other
 * value is stringified (the site's `String(body.note ?? "")`).
 */
function readNoteBody(value: unknown): NoteBody {
  if (value === undefined) return { provided: false };
  return { provided: true, note: value === null ? "" : String(value) };
}

export function createStudentStudy(ctx: MockContext): StudentStudyApi {
  const { store, errors, auth } = ctx;

  return {
    async getHomeworkDeadlines() {
      const student = auth.requireStudent();

      // `createdAt` asc; the id breaks a tie the same way `q.homeworkOrderInTopic` does, so «ДЗ N» agrees with
      // the full homework list of the `studentWork` member.
      const assignments = ctx.q
        .homeworksOfStudent(student.id)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
      const statuses = ctx.q.statusMap(student.id);
      const orderByTopic = new Map<string, number>();

      const items: HomeworkDeadlineSummary[] = assignments.map((assignment) => {
        // N counts the student's assignments of the topic one by one, titled ones included.
        const orderInTopic = (orderByTopic.get(assignment.topicId) ?? 0) + 1;
        orderByTopic.set(assignment.topicId, orderInTopic);

        const links = store.homeworkNumbers.by("assignmentId", assignment.id);
        let solvedCount = 0;
        for (const link of links) {
          // The CURRENT colour of the number: it is shared by every homework that contains the number.
          const status = statuses.get(link.homeworkNumberId);
          if (status === "GREEN" || status === "YELLOW") solvedCount += 1;
        }

        return {
          id: assignment.id,
          title: assignment.title?.trim() || null,
          orderInTopic,
          topicTitle: ctx.q.topic(assignment.topicId)?.title ?? "",
          // Sent as stored: a homework without a deadline is in the list, the client leaves it out of the calendar.
          deadlineAt: assignment.deadlineAt,
          totalNumbers: links.length,
          solvedCount,
        };
      });

      const now = ctx.now();
      return { serverNow: new Date(now).toISOString(), today: mskToday(now), items };
    },

    async getTheoryLibrary() {
      auth.requireStudent();

      // One list for every student: topics in display order, only those that have a theory file.
      const topics: TheoryLibraryResponse["topics"] = [];
      for (const topic of ctx.q.topicsOrdered()) {
        const theoryFile = ctx.files.storedRef(topic.theoryFileId);
        if (theoryFile) topics.push({ id: topic.id, title: topic.title, description: topic.description, theoryFile });
      }
      return { topics };
    },

    async getNumberDetail(number) {
      const student = auth.requireStudent();

      // The site page: `decodeURIComponent(param).trim()` must be digits, anything else is not a number.
      // SPEC-GAP: 02 §6.6 gives `400 invalidNumber` for "not digits" only. Unlike the number search there is
      // no 20-digit cap here, and "0" / "000" are digits that match no number (404), as on the site page.
      const target = typeof number === "string" ? number.trim() : "";
      if (!/^\d+$/.test(target)) {
        return errors.fail({ status: 400, code: "invalidNumber", message: (dict) => dict.apiStudent.findNumber.invalidNumber });
      }

      // Matched by the normalised form across ALL topics (not only assigned homework); the first topic in
      // display order wins when several topics carry the number.
      const found = ctx.q.findNumberByLabel(target);
      const topic = found ? ctx.q.topic(found.topicId) : undefined;
      if (!found || !topic) throw errors.notFound("numberNotFound", (dict) => dict.apiStudent.findNumber.notFound);

      // Own row only; a number the student never touched has none.
      const row = ctx.q.status(student.id, found.id);

      // A projection: the answer, the answer file and the planner's minutes never reach a student.
      return {
        topic: { id: topic.id, title: topic.title, description: topic.description },
        number: {
          id: found.id,
          number: found.number,
          conditionLatex: found.conditionLatex,
          status: row?.status ?? null,
          note: row?.note ?? "",
          deadlineAt: row?.deadlineAt ?? null,
          statusUpdatedAt: row?.updatedAt ?? null,
        },
        // False only on a database without the `note` column; the mock store always has it.
        notesEnabled: true,
      };
    },

    async saveNumberNote(homeworkNumberId, note, signal) {
      // A request cancelled before it was sent (a newer keystroke superseded it) never reaches the server.
      ctx.throwIfAborted(signal);
      const student = auth.requireStudent();
      ctx.limits.enforce("api:student-status");

      // The typed method sends `{ note }`. If a caller hands over a whole body object instead, it is read as
      // the body, so the server rule "a `status` key is refused" stays enforced: the colour is set by the
      // automatic check or by the teacher, never by the student.
      const rawNote: unknown = note;
      if (isRecord(rawNote) && Object.prototype.hasOwnProperty.call(rawNote, "status")) {
        return errors.fail({ status: 403, code: "statusReadOnly", message: (dict) => dict.apiStudent.topicStatus.statusReadOnly });
      }
      const body = readNoteBody(isRecord(rawNote) ? rawNote.note : rawNote);

      const numberId = ctx.validate.id(homeworkNumberId);
      if (numberId === null || !body.provided) {
        throw errors.invalidData((dict) => dict.apiStudent.topicStatus.invalidData);
      }

      // Numbers are shared: any existing number may carry a note; an unknown id is a 404.
      const number = ctx.guard.number(numberId, (dict) => dict.apiStudent.topicStatus.numberNotFound);

      const saved = body.note.trim().slice(0, LIMITS.noteMaxLength);
      ctx.throwIfAborted(signal);

      const row = store.transaction(() => {
        // Any update of the row moves `updatedAt` (it is what `statusUpdatedAt` reports).
        const updatedAt = ctx.nowIso();
        if (saved) {
          // Creates the row with no colour when the student has none; an existing colour and deadline stay.
          return store.statuses.update(ctx.progress.ensureRow(student.id, number.id).id, { note: saved, updatedAt });
        }
        const existing = ctx.q.status(student.id, number.id);
        if (!existing) return undefined;
        const cleared = store.statuses.update(existing.id, { note: null, updatedAt });
        // The row goes only when it holds nothing at all; a row with `statusChangedAt` survives even with an
        // empty colour (a fresh manual clear protects the number from the answer of an older check).
        ctx.progress.cleanupEmptyRows(student.id, [number.id]);
        return cleared;
      });

      // The teacher's pages refresh; the student's other screens re-fetch the streak.
      ctx.emit({ kind: "student-progress-changed", studentId: student.id, topicId: number.topicId });

      return { status: row?.status ?? null, note: saved, notesEnabled: true };
    },
  };
}
