// Teacher screens, part 3: the teacher with nothing, the second owner (isolation, no realtime), and
// entities that do not exist.
import { describe, it } from '@jest/globals';

import { visit } from './support/drive';

const ANNA = 'teacher@example.com';
const STUDENTS = ['usr_ilya', 'usr_maria', 'usr_artem', 'usr_polina', 'usr_kirill', 'usr_dasha', 'usr_timur'];
const LESSONS = [
  'les_early', 'les_g4', 'les_d2', 'les_g_unfinalized', 'les_live', 'les_dasha_soon', 'les_tomorrow_group', 'les_ilya_tomorrow',
  'les_unscheduled', 'les_ai_off', 'les_budget', 'les_stale', 'les_manual',
];
const DRAFTS = ['hp_generating', 'hp_ready', 'hp_issued', 'hp_stale', 'hp_past', 'hp_conflict', 'hp_full', 'hp_queue', 'hp_errors'];
const TOPICS = ['top_linear', 'top_quadratic', 'top_derivative', 'top_log', 'top_systems', 'top_empty', 'top_word'];

const LISTS: [string, string][] = [
  ['teacher.home', '/teacher'],
  ['teacher.students', '/teacher/students'],
  ['planner.lessons', '/teacher/lessons'],
  ['planner.drafts', '/teacher/homework-plans'],
  ['calls.list', '/teacher/calls'],
  ['(more list)', '/teacher/more'],
  ['content.topics', '/teacher/topics'],
  ['groups.list', '/teacher/groups'],
  ['planner.lessonNew (target chooser)', '/teacher/lessons/new'],
];

describe('teacher screens as teacher3@example.com (empty states)', () => {
  it.each(LISTS)('%s  %s', async (_screen, url) => {
    await visit({ as: 'teacher3@example.com', url });
  });
});

describe('teacher screens as teacher2@example.com (second owner, realtime refused)', () => {
  it.each(LISTS)('%s  %s', async (_screen, url) => {
    await visit({ as: 'teacher2@example.com', url });
  });

  it.each(['/teacher/students/usr_sofia', '/teacher/students/usr_sofia/assign', '/teacher/students/usr_sofia/lessons', '/teacher/groups/grp_10b', '/teacher/lessons/les_igor_1'])('%s', async (url) => {
    await visit({ as: 'teacher2@example.com', url });
  });

  it.each(['/teacher/students/usr_ilya', '/teacher/groups/grp_8a', '/teacher/lessons/les_live', '/teacher/homework-plans/hp_ready'])("another teacher's %s is the 404 shell", async (url) => {
    await visit({ as: 'teacher2@example.com', url, expectNotFound: true });
  });
});

describe('teacher screens: entities that do not exist', () => {
  it.each(['/teacher/students/usr_nobody', '/teacher/topics/top_nothing', '/teacher/topics/top_linear/numbers/999', '/teacher/groups/grp_nothing', '/teacher/lessons/les_nothing', '/teacher/homework-plans/hp_nothing'])(
    '%s is the 404 shell',
    async (url) => {
      await visit({ as: ANNA, url, expectNotFound: true });
    },
  );

  it('planner.draftNew without a source is the 404 shell', async () => {
    await visit({ as: ANNA, url: '/teacher/homework-plans/new', expectNotFound: true });
  });

  it("a developer's route does not exist for a teacher: the app opens the teacher's home", async () => {
    await visit({ as: ANNA, url: '/developer/panel', expectPath: '/teacher' });
  });
});
