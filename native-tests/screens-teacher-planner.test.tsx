// Teacher screens, part 2: the planner (lessons, homework drafts) by deep link on a cold start.
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

describe('planner screens as teacher@example.com', () => {
  it.each(['groupId=grp_8a', 'groupId=grp_empty', 'studentId=usr_ilya', 'studentId=usr_timur'])('planner.lessonNew  /teacher/lessons/new?%s', async (query) => {
    await visit({ as: ANNA, url: `/teacher/lessons/new?${query}` });
  });

  it.each(LESSONS)('planner.lessonBoard  /teacher/lessons/%s', async (lessonId) => {
    await visit({ as: ANNA, url: `/teacher/lessons/${lessonId}` });
  });

  it.each(['studentId=usr_ilya', 'groupId=grp_8a', 'lessonId=les_g4', 'lessonId=les_d2'])('planner.draftNew  /teacher/homework-plans/new?%s', async (query) => {
    await visit({ as: ANNA, url: `/teacher/homework-plans/new?${query}` });
  });

  it.each(DRAFTS)('planner.draftBoard  /teacher/homework-plans/%s', async (planId) => {
    await visit({ as: ANNA, url: `/teacher/homework-plans/${planId}` });
  });
});

