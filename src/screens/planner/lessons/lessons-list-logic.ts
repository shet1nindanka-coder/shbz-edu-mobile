// Pure rules of the lessons list (docs/spec/05-teacher-lessons-plans.md §1.1): which section a lesson
// belongs to and in which order. No React, no RN imports — unit-tested in tests/planner-lessons.test.ts.
import type { DerivedLessonStatus, LessonListItem } from '@/api/types';
import { deriveLessonStatus } from '@/domain/lesson-status';
import { isSameMskDay, toEpochMs } from '@/domain/moscow-time';

export type LessonSectionKey = 'today' | 'upcoming' | 'past';

export type LessonSection = { key: LessonSectionKey; lessons: LessonListItem[] };

/** "Lesson date" of the site: the scheduled start, or the creation time of an unscheduled lesson. */
export function lessonDateOf(lesson: Pick<LessonListItem, 'startsAt' | 'createdAt'>): string {
  return lesson.startsAt ?? lesson.createdAt;
}

/**
 * Today (same Moscow calendar day as `now`, ascending) → Upcoming (not today, not finished, ascending) →
 * Past (not today, finished, descending). Empty sections are dropped. An unscheduled, never-finished
 * lesson created last week therefore sits in "Upcoming" — as on the site.
 */
export function groupLessons(lessons: readonly LessonListItem[], now: number): LessonSection[] {
  const today: LessonListItem[] = [];
  const upcoming: LessonListItem[] = [];
  const past: LessonListItem[] = [];

  for (const lesson of lessons) {
    if (isSameMskDay(lessonDateOf(lesson), now)) today.push(lesson);
    else if (lesson.status === 'FINISHED') past.push(lesson);
    else upcoming.push(lesson);
  }

  const ascending = (left: LessonListItem, right: LessonListItem) =>
    toEpochMs(lessonDateOf(left)) - toEpochMs(lessonDateOf(right)) || left.id.localeCompare(right.id);

  today.sort(ascending);
  upcoming.sort(ascending);
  past.sort((left, right) => ascending(right, left));

  const sections: LessonSection[] = [
    { key: 'today', lessons: today },
    { key: 'upcoming', lessons: upcoming },
    { key: 'past', lessons: past },
  ];
  return sections.filter((section) => section.lessons.length > 0);
}

/** Who the lesson is for on the meta line: the group, or the only student of an individual lesson. */
export function lessonAudience(lesson: Pick<LessonListItem, 'groupName' | 'soloStudentName'>): string | null {
  return lesson.groupName ?? lesson.soloStudentName ?? null;
}

export type LessonChips = {
  /** Participants whose plan failed; `null` = no chip. */
  errors: number | null;
  /** «подбор идёт {ready} / {total}»: shown while not every participant is ready (failed ones included). */
  selecting: { ready: number; total: number } | null;
};

export function lessonChips(lesson: Pick<LessonListItem, 'failedCount' | 'readyCount' | 'participantsCount'>): LessonChips {
  return {
    errors: lesson.failedCount > 0 ? lesson.failedCount : null,
    selecting:
      lesson.readyCount < lesson.participantsCount ? { ready: lesson.readyCount, total: lesson.participantsCount } : null,
  };
}

const STATUS_RANK: Record<DerivedLessonStatus, number> = { PLANNED: 0, ACTIVE: 1, FINISHED: 2 };

/**
 * True when the schedule has moved a lesson past the status it arrived with (a planned lesson has
 * started, a running one has ended): the list is then re-read. Only forward moves count — a lesson the
 * teacher finished early stays FINISHED although its scheduled time is not over.
 */
export function hasScheduleAdvanced(
  lessons: readonly Pick<LessonListItem, 'startsAt' | 'durationMinutes' | 'status'>[],
  now: number,
): boolean {
  return lessons.some((lesson) => {
    if (!lesson.startsAt) return false;
    const scheduled = deriveLessonStatus({ startsAt: lesson.startsAt, durationMinutes: lesson.durationMinutes, status: lesson.status }, now);
    return STATUS_RANK[scheduled] > STATUS_RANK[lesson.status];
  });
}
