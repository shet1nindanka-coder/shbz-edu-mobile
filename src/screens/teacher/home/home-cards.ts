// Pure model of the counters of the teacher's overview (docs/spec/04-teacher-students.md S1): the site's
// three cards with their numbers and links, and which of the two reads of the call counters wins. The
// «Стекло над листом» overview shows the nearest lesson and who needs attention instead of the cards (the
// sections are opened from the dock); it still uses `pickCallCounts`. No React, no React Native —
// unit-tested in tests/teacher-home.test.ts.
import type { ParentCallCounts, TeacherHomeSummary } from '@/api/types';
import type { Dictionary } from '@/lib/i18n/dictionary';

export type HomeCardId = 'topics' | 'students' | 'calls';

/** Where a card leads; each is a section of the teacher's navigation. */
export type HomeCardLink = { screen: 'content.topics' } | { screen: 'teacher.students' } | { screen: 'calls.list' };

export type HomeCardStat = { label: string; value: number };

export type HomeCard = {
  id: HomeCardId;
  kicker: string;
  title: string;
  /** Always two tiles, in the site's order. */
  stats: readonly [HomeCardStat, HomeCardStat];
  link: HomeCardLink;
};

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

/** The three navigation cards of the overview, top to bottom. */
export function buildHomeCards(
  stats: TeacherHomeSummary['stats'],
  calls: ParentCallCounts,
  t: Dictionary['teacherHome'],
): HomeCard[] {
  return [
    {
      id: 'topics',
      kicker: t.topics.kicker,
      title: t.topics.title,
      stats: [
        { label: t.topics.topics, value: stats.totalTopics },
        { label: t.topics.numbers, value: stats.totalNumbers },
      ],
      link: { screen: 'content.topics' },
    },
    {
      id: 'students',
      kicker: t.students.kicker,
      title: t.students.title,
      stats: [
        { label: t.students.students, value: stats.totalStudents },
        { label: t.students.files, value: stats.totalFiles },
      ],
      link: { screen: 'teacher.students' },
    },
    {
      id: 'calls',
      kicker: t.calls.kicker,
      title: t.calls.title,
      stats: [
        { label: t.calls.due, value: calls.due },
        { label: t.calls.overdue, value: calls.overdue },
      ],
      link: { screen: 'calls.list' },
    },
  ];
}

/** What a screen reader says for a card: «Темы. Материалы и ответы. Темы: 6, Номера: 62». */
export function homeCardA11yLabel(card: HomeCard): string {
  const stats = card.stats.map((stat) => `${stat.label}: ${stat.value}`).join(', ');
  return `${card.kicker}. ${card.title}. ${stats}`;
}
