// Pure rules of the "new lesson" forms (docs/spec/05-teacher-lessons-plans.md §1.2.d, §1.2.e): topic
// search, the duration stepper, per-student speeds and the request bodies. No React, no RN imports —
// unit-tested in tests/planner-lessons.test.ts.
import type { ComposeBoardTopic, CreateLessonInput, LessonFormMember, TopicOption } from '@/api/types';
import { META_LIMITS } from '@/api/types/limits';
import { parseMskDateTimeInput } from '@/domain/moscow-time';

export const DURATION_STEP = 5;

const DURATION = META_LIMITS.lessonDurationMinutes;

/** Keeps a duration inside 15..240; anything unusable becomes the default 60. */
export function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return DURATION.default;
  return Math.min(DURATION.max, Math.max(DURATION.min, Math.round(value)));
}

/** One press of the stepper: ±5 minutes, snapped to the 5-minute grid and clamped to 15..240. */
export function stepDuration(value: number, direction: 1 | -1): number {
  const current = clampDuration(value);
  const snapped = direction > 0 ? Math.floor(current / DURATION_STEP) * DURATION_STEP : Math.ceil(current / DURATION_STEP) * DURATION_STEP;
  return clampDuration(snapped + direction * DURATION_STEP);
}

/**
 * Topics matching the query: case-insensitive substring in the Russian locale, as the site's combobox.
 * An empty query keeps every topic (the phone picker is a full list with a search field).
 */
export function filterTopics<T extends TopicOption>(topics: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase('ru-RU');
  if (!needle) return [...topics];
  return topics.filter((topic) => topic.title.toLocaleLowerCase('ru-RU').includes(needle));
}

/** Rows of the target chooser matching the search (group or student names). */
export function filterByName<T extends { name: string }>(rows: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase('ru-RU');
  if (!needle) return [...rows];
  return rows.filter((row) => row.name.toLocaleLowerCase('ru-RU').includes(needle));
}

/**
 * Students the form sends (§1.2.d, §1.6 "all checked"): every CURRENT member except those the teacher
 * unchecked. The member list is re-read while the form is open (it first renders from the cached answer),
 * so the default is derived from the list on every render instead of being copied once: a student who
 * joined the group since the last visit is checked, one who left is not sent.
 */
export function checkedMemberIds(members: readonly { id: string }[], uncheckedIds: readonly string[]): string[] {
  return members.filter((member) => !uncheckedIds.includes(member.id)).map((member) => member.id);
}

/**
 * Speeds the form shows and sends: the member's CURRENT profile speed (`null` = "not set") unless the
 * teacher picked another one for this lesson. Picks of students that are no longer on the list are dropped.
 */
export function currentSpeeds(members: readonly LessonFormMember[], picked: Readonly<Record<string, number | null>>): Record<string, number | null> {
  return Object.fromEntries(members.map((member) => [member.id, member.id in picked ? (picked[member.id] ?? null) : (member.speed ?? null)]));
}

export type AiFormState = {
  title: string;
  durationMinutes: number;
  /** Moscow wall clock `YYYY-MM-DDTHH:mm`, or "" when not set. */
  startsAt: string;
  topicIds: string[];
  teacherNote: string;
  studentIds: string[];
  speeds: Record<string, number | null>;
};

/** `startsAt` on the wire: an ISO instant read from the Moscow wall clock; omitted when not set. */
function startsAtIso(value: string): string | undefined {
  if (!value) return undefined;
  const instant = parseMskDateTimeInput(value);
  // A malformed picker value still goes out as typed: the server answers `400 invalidStartsAt`.
  return instant ? instant.toISOString() : value;
}

/** Body of `POST /teacher/lessons` for the AI form. Only the speeds of checked students are sent. */
export function buildAiLessonInput(state: AiFormState, groupId: string | null): CreateLessonInput {
  const title = state.title.trim();
  const startsAt = startsAtIso(state.startsAt);
  return {
    ...(groupId ? { groupId } : {}),
    studentIds: state.studentIds,
    ...(title ? { title } : {}),
    durationMinutes: clampDuration(state.durationMinutes),
    ...(startsAt ? { startsAt } : {}),
    topicIds: state.topicIds,
    teacherNote: state.teacherNote.trim(),
    speeds: Object.fromEntries(state.studentIds.map((studentId) => [studentId, state.speeds[studentId] ?? null])),
  };
}

/** Body of `POST /teacher/lessons` for a manually composed individual lesson (no AI). */
export function buildManualLessonInput(input: {
  studentId: string;
  durationMinutes: number;
  startsAt: string;
  numberIds: string[];
}): CreateLessonInput {
  const startsAt = startsAtIso(input.startsAt);
  return {
    studentIds: [input.studentId],
    durationMinutes: clampDuration(input.durationMinutes),
    ...(startsAt ? { startsAt } : {}),
    topicIds: [],
    teacherNote: '',
    skipPlan: true,
    numberIds: input.numberIds,
  };
}

/** Adds or removes an id, keeping the order of selection (it is the order of the lesson). */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];
}

export type ComposeNumber = ComposeBoardTopic['numbers'][number];

/**
 * Statement of a number on the manual grid (A4 §3.10 rules C2, C4): the inlined one when the topic came
 * with its statements, otherwise the lazily fetched record of that topic (or nothing while it loads).
 */
export function composeStatement(
  topic: Pick<ComposeBoardTopic, 'conditionsLoaded'>,
  number: Pick<ComposeNumber, 'id' | 'conditionLatex'>,
  fetched: Record<string, string | null> | undefined,
): string | null {
  if (topic.conditionsLoaded) return number.conditionLatex ?? null;
  return fetched?.[number.id] ?? null;
}
