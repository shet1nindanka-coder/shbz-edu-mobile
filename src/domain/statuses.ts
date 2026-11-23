// Traffic-light status helpers. The counting / overdue helpers are ported 1:1 from the site (lib/utils.ts).
//
// [MOBILE] `homeworkStatusMeta` on the site maps a status to CSS class names. Here it maps a status to
// SEMANTIC keys only: the colours live in the theme (`statusPalette(colors)[tone]`), the labels in the
// dictionary (`dict.status[status]`). Nothing in this folder knows a colour value.
import type { Dictionary } from "@/lib/i18n/dictionary";

import { HomeworkNumberStatus, LessonItemResult } from "./enums";

/** Key of the theme's status palette: a status, "none" (not marked) or "neutral" (lesson "not reached"). */
export type StatusTone = HomeworkNumberStatus | "none" | "neutral";

/** Display order everywhere a status is chosen or listed. */
export const HOMEWORK_STATUS_ORDER: readonly HomeworkNumberStatus[] = [
  HomeworkNumberStatus.GREEN,
  HomeworkNumberStatus.YELLOW,
  HomeworkNumberStatus.RED
];

export const homeworkStatusMeta: Record<
  HomeworkNumberStatus,
  {
    /** Palette key for cards, option buttons and subtle surfaces (one tone per status, as on the site). */
    tone: HomeworkNumberStatus;
    /** GREEN and YELLOW count as "solved" (closed); RED needs the teacher. */
    isSolved: boolean;
    /** GREEN 3 > YELLOW 2 > RED 1 — the homework check never lowers it (`isStatusDowngrade`). */
    rank: number;
  }
> = {
  GREEN: { tone: "GREEN", isSolved: true, rank: 3 },
  YELLOW: { tone: "YELLOW", isSolved: true, rank: 2 },
  RED: { tone: "RED", isSolved: false, rank: 1 }
};

/** Palette key of a status badge: the status itself, or "none" for "not marked". */
export function statusTone(status: HomeworkNumberStatus | null | undefined): HomeworkNumberStatus | "none" {
  return status ?? "none";
}

/** GREEN or YELLOW. */
export function isSolvedStatus(status: HomeworkNumberStatus | null | undefined): boolean {
  return status === HomeworkNumberStatus.GREEN || status === HomeworkNumberStatus.YELLOW;
}

/** Long label of a status («Решен с первого раза»); `null` → «Не отмечено». */
export function homeworkStatusLabel(
  status: HomeworkNumberStatus | null | undefined,
  dict: { status: Dictionary["status"]; student: { statusBadge: Dictionary["student"]["statusBadge"] } }
): string {
  return status ? dict.status[status].label : dict.student.statusBadge.unmarked;
}

/** Display order of the lesson-result toggle. */
export const LESSON_RESULT_ORDER: readonly LessonItemResult[] = [
  LessonItemResult.SOLVED,
  LessonItemResult.PARTIAL,
  LessonItemResult.NOT_SOLVED,
  LessonItemResult.SKIPPED
];

/**
 * Lesson result → palette key of the active option and the number status it mirrors onto
 * (the site's `lessonResultMeta` + `RESULT_TO_STATUS`). Labels: `dict.students.lessonResult[result]`.
 */
export const lessonResultMeta: Record<
  LessonItemResult,
  { tone: HomeworkNumberStatus | "neutral"; status: HomeworkNumberStatus | null }
> = {
  SOLVED: { tone: "GREEN", status: HomeworkNumberStatus.GREEN },
  PARTIAL: { tone: "YELLOW", status: HomeworkNumberStatus.YELLOW },
  NOT_SOLVED: { tone: "RED", status: HomeworkNumberStatus.RED },
  SKIPPED: { tone: "neutral", status: null }
};

export function completionPercent(done: number, total: number) {
  if (!total) {
    return 0;
  }

  return Math.round((done / total) * 100);
}

export function getStatusCounts(statuses: (HomeworkNumberStatus | null | undefined)[]) {
  const counts = {
    GREEN: 0,
    YELLOW: 0,
    RED: 0
  };

  for (const status of statuses) {
    if (status) {
      counts[status] += 1;
    }
  }

  return counts;
}

export function isHomeworkOverdue(deadlineAt: string | null, isCompleted: boolean, now: number = Date.now()) {
  if (!deadlineAt || isCompleted) {
    return false;
  }

  const deadline = new Date(deadlineAt);

  return !Number.isNaN(deadline.getTime()) && deadline.getTime() < now;
}
