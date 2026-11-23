// Pure model of the teacher's overview in the «Стекло над листом» layout (docs/design/glass-over-paper.md
// §7): the nearest lesson, the students who need attention and everybody's progress. Every block is
// assembled from reads the app already makes — the planner's lessons list, the students list and the
// overview summary. No React, no React Native.
import type { LessonListItem, TeacherStudentListItem } from '@/api/types';
import { toEpochMs } from '@/domain/moscow-time';
import type { NumberCounts } from '@/domain/number-focus';

/**
 * Lessons that are still ahead, nearest first: the running ones, then the planned ones by their start.
 * A lesson without a scheduled start has no "when" to show and is left to the «занятия» section.
 */
export function upcomingLessons(lessons: readonly LessonListItem[]): LessonListItem[] {
  const startOf = (lesson: LessonListItem) => (lesson.startsAt ? toEpochMs(lesson.startsAt) : Number.NaN);
  const scheduled = lessons.filter((lesson) => lesson.status !== 'FINISHED' && !Number.isNaN(startOf(lesson)));
  const rank = (lesson: LessonListItem) => (lesson.status === 'ACTIVE' ? 0 : 1);
  return [...scheduled].sort((left, right) => rank(left) - rank(right) || startOf(left) - startOf(right) || left.id.localeCompare(right.id));
}

/** Who the lesson is for: the group, or the only student of an individual lesson. */
export function lessonAudience(lesson: Pick<LessonListItem, 'groupName' | 'soloStudentName'>): string | null {
  return lesson.groupName ?? lesson.soloStudentName ?? null;
}

/** Students with numbers marked «нужна помощь», the most of them first; the list order breaks ties. */
export function studentsNeedingHelp(students: readonly TeacherStudentListItem[]): TeacherStudentListItem[] {
  return students
    .map((student, index) => ({ student, index }))
    .filter((entry) => entry.student.redCount > 0)
    .sort((left, right) => right.student.redCount - left.student.redCount || left.index - right.index)
    .map((entry) => entry.student);
}

/**
 * The bar of one student in «Прогресс». `totalNumbers` is the size of the shared bank (the overview
 * summary): the grey rest of the bar is what the student has not marked yet. Without it the bar shows
 * only the marked part.
 */
export function progressCounts(student: TeacherStudentListItem, totalNumbers: number | null): NumberCounts {
  const none = totalNumbers === null ? 0 : Math.max(0, totalNumbers - student.markedCount);
  return { green: student.greenCount, yellow: student.yellowCount, red: student.redCount, none };
}
