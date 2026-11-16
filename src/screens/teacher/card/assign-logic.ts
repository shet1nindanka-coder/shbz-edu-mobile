// Pure rules of the "Assign homework" segment of the student card (docs/spec/04-teacher-students.md S5,
// §3.4). No React, no RN imports — unit-tested in tests/teacher-card-assign.test.ts.
import type { AssignBoardTopic, IssueHomeworkRequest } from '@/api/types';
import { LIMITS } from '@/api/types/limits';
import { parseMskDateTimeInput } from '@/domain/moscow-time';

export const ASSIGN_TITLE_MAX = LIMITS.maxTitleLength;

export type AssignNumber = AssignBoardTopic['numbers'][number];

/** The topic shown on the board: the chosen one while it still exists, else the first (the site's default). */
export function pickTopic(topics: readonly AssignBoardTopic[], topicId: string | null): AssignBoardTopic | null {
  return topics.find((topic) => topic.id === topicId) ?? topics[0] ?? null;
}

/** Tapping a card adds the number to the end of the selection or takes it out (tap order is kept). */
export function toggleSelection(selected: readonly string[], homeworkNumberId: string): string[] {
  return selected.includes(homeworkNumberId)
    ? selected.filter((id) => id !== homeworkNumberId)
    : [...selected, homeworkNumberId];
}

/** Numbers of the selection that still exist in the topic (a refetch may have removed some). */
export function liveSelection(topic: Pick<AssignBoardTopic, 'numbers'> | null, selected: readonly string[]): string[] {
  if (!topic) return [];
  const ids = new Set(topic.numbers.map((number) => number.id));
  return selected.filter((id) => ids.has(id));
}

/**
 * Statements of the topic's numbers: the board carries them for the first topic only; for any other
 * topic they come from `GET /topics/{topicId}/conditions` and are merged in when they arrive.
 */
export function withConditions(topic: AssignBoardTopic, conditions: Readonly<Record<string, string | null>> | undefined): AssignNumber[] {
  if (topic.conditionsLoaded || !conditions) return topic.numbers;
  return topic.numbers.map((number) => ({ ...number, conditionLatex: conditions[number.id] ?? number.conditionLatex }));
}

/** The assign button is live only with at least one number and a deadline. */
export function canAssign(selectedCount: number, deadline: string): boolean {
  return selectedCount > 0 && deadline.trim() !== '';
}

export type AssignDraft = { studentId: string; topicId: string; selected: readonly string[]; deadline: string; title: string };

/**
 * Body of `POST /teacher/homeworks`, or `null` when nothing is selected or the deadline (a Moscow
 * wall-clock picker value) cannot be read — the site's client-side guard. A blank title is not sent.
 */
export function buildIssueRequest(draft: AssignDraft): IssueHomeworkRequest | null {
  if (draft.selected.length === 0) return null;
  const deadline = parseMskDateTimeInput(draft.deadline);
  if (!deadline) return null;
  const title = draft.title.trim().slice(0, ASSIGN_TITLE_MAX);
  return {
    studentId: draft.studentId,
    topicId: draft.topicId,
    homeworkNumberIds: [...draft.selected],
    deadlineAt: deadline.toISOString(),
    ...(title ? { title } : {}),
  };
}
