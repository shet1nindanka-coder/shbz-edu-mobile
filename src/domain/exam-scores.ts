// Ported 1:1 from the site (lib/exam-scores.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
/*
 * Справочные таблицы баллов для вкладки «Общая инфа» ученика.
 * Числа — здесь; подписи к заданиям и оценкам — в словаре (student.examInfo),
 * при обновлении шкал ФИПИ правится этот файл и обе языковые версии словаря.
 * Источник — шкалы ФИПИ (ЕГЭ профиль — 32 первичных, ОГЭ — 31 первичный).
 */

import type { Dictionary } from "@/lib/i18n";

// Подписи передаются аргументом (dict.student.examInfo): модуль работает в
// client-компоненте и не тянет словари в бандл.
type ExamInfoCopy = Dictionary["student"]["examInfo"];

export type ScoreRow = { primary: number; secondary: number };
export type TaskScoringRow = { badge: string; text: string };
export type GradeRow = { grade: number; range: string; note?: string };

/** ЕГЭ профильная математика: первичный → тестовый балл. */
export const EGE_PROFILE_SCALE: ScoreRow[] = [
  [1, 6], [2, 11], [3, 17], [4, 22], [5, 27], [6, 34], [7, 40], [8, 46],
  [9, 52], [10, 58], [11, 64], [12, 70], [13, 72], [14, 74], [15, 76], [16, 78],
  [17, 80], [18, 82], [19, 84], [20, 86], [21, 88], [22, 90], [23, 92], [24, 94],
  [25, 95], [26, 96], [27, 97], [28, 98], [29, 99], [30, 100], [31, 100], [32, 100]
].map(([primary, secondary]) => ({ primary, secondary }));

export const EGE_PROFILE_MAX_PRIMARY = 32;
export const EGE_PROFILE_MIN_PRIMARY = 5; // порог «сдал» (27 тестовых)

/** Разбалловка ЕГЭ профиль: бейдж — сколько первичных даёт задание. */
export function getEgeProfileTasks(copy: ExamInfoCopy): TaskScoringRow[] {
  return copy.egeTasks.map((text, index) => ({
    badge: String(index + 1),
    text
  }));
}

/** ОГЭ математика: 25 заданий, 31 первичный балл, оценка по первичным. */
export const OGE_MAX_PRIMARY = 31;

export function getOgeTasks(copy: ExamInfoCopy): TaskScoringRow[] {
  return copy.ogeTasks.map((text, index) => ({
    badge: String(index + 1),
    text
  }));
}

const OGE_GRADE_RANGES: { grade: number; range: string }[] = [
  { grade: 5, range: "22–31" },
  { grade: 4, range: "15–21" },
  { grade: 3, range: "8–14" },
  { grade: 2, range: "0–7" }
];

export function getOgeGrades(copy: ExamInfoCopy): GradeRow[] {
  const note = copy.ogeGrade3Note;

  return OGE_GRADE_RANGES.map((row) => (row.grade === 3 ? { ...row, note } : { ...row }));
}

