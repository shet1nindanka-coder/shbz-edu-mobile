// Pure model of the call counters of the teacher's overview (docs/spec/04-teacher-students.md S1): which of
// the two reads of the counters wins. The site's three navigation cards are not shown: the «Стекло над
// листом» overview has the nearest lesson and who needs attention, the sections are opened from the dock.
// No React, no React Native — unit-tested in tests/teacher-home.test.ts.
import type { ParentCallCounts } from '@/api/types';

/** A read with the moment it arrived (`dataUpdatedAt` of its query). */
export type Dated<T> = { data: T; updatedAt: number };

/**
 * The calls widget has two sources: the counters inside `GET /teacher/home` and the dedicated
 * `GET /teacher/parent-calls/counts`, which the calls section refreshes after a recorded call
 * (00 §3.2). Whichever arrived last wins; a tie goes to the dedicated read.
 */
export function pickCallCounts(home: Dated<ParentCallCounts>, counts: Dated<ParentCallCounts> | null): ParentCallCounts {
  if (!counts) return home.data;
  return counts.updatedAt >= home.updatedAt ? counts.data : home.data;
}
