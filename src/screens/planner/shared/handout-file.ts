// Naming of a lesson handout handed to the file viewer (docs/spec/05-teacher-lessons-plans.md §3.12).
// Pure — unit-tested in tests/planner-board.test.ts.
import { mskDayKey } from '@/domain/moscow-time';

export type HandoutVariant = { answers?: boolean; format?: 'pdf' | 'html'; studentId?: string };

/**
 * File name of a handout as the site sends it: `urok-YYYY-MM-DD.pdf`, `otvety-…` for the answer sheet;
 * the date is the Moscow day the lesson (or the homework draft) was created.
 */
export function handoutFileName(createdAt: string, options: Pick<HandoutVariant, 'answers' | 'format'> = {}): string {
  const day = mskDayKey(createdAt);
  const base = options.answers ? 'otvety' : 'urok';
  const extension = options.format === 'html' ? 'html' : 'pdf';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${base}-${day}.${extension}` : `${base}.${extension}`;
}

/** A stable viewer / cache key that differs between the variants of one lesson's handout. */
export function handoutFileId(lessonId: string, options: HandoutVariant = {}): string {
  return ['handout', lessonId, options.answers ? 'answers' : 'tasks', options.format === 'html' ? 'html' : 'pdf', options.studentId ?? 'all'].join('-');
}

export function handoutMimeType(format: 'pdf' | 'html' | undefined): string {
  return format === 'html' ? 'text/html' : 'application/pdf';
}
