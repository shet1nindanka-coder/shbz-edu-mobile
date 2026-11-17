// Naming of a lesson handout handed to the file viewer (docs/spec/05-teacher-lessons-plans.md §3.12).
// Pure — unit-tested in tests/planner-board.test.ts.
import { mskDayKey } from '@/domain/moscow-time';

export type HandoutVariant = { answers?: boolean; format?: 'pdf' | 'html'; studentId?: string };

/**
 * File name of a handout in the site's pattern: `urok-YYYY-MM-DD.pdf`, `otvety-…` for the answer sheet.
 * Deliberate deviation: the date is the MOSCOW day the lesson (or the homework draft) was created. The
 * site's pdf route slices `createdAt.toISOString()`, i.e. the UTC day, so for a lesson created between
 * 00:00 and 03:00 Moscow time it names the previous day — every other date the teacher sees is a Moscow
 * day (CLAUDE.md "Time"). The name is only the cache / share-sheet file name; the viewer shows its own title.
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
