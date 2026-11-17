// Every teacher screen, opened by deep link on a cold start: the teacher with data, the second owner
// (isolation, no realtime) and the teacher with nothing.
import { describe, it } from '@jest/globals';

import { visit } from './support/drive';

const ANNA = 'teacher@example.com';
const STUDENTS = ['usr_ilya', 'usr_maria', 'usr_artem', 'usr_polina', 'usr_kirill', 'usr_dasha', 'usr_timur'];
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

describe('teacher screens as teacher@example.com (7 students, 2 groups)', () => {
  it.each(LISTS)('%s  %s', async (_screen, url) => {
    await visit({ as: ANNA, url });
  });

  it('calls.list with a student to flash  /teacher/calls?studentId=usr_kirill', async () => {
    await visit({ as: ANNA, url: '/teacher/calls?studentId=usr_kirill' });
  });

  it.each(TOPICS)('content.topic  /teacher/topics/%s', async (topicId) => {
    await visit({ as: ANNA, url: `/teacher/topics/${topicId}` });
  });

  it.each([['top_linear', '118'], ['top_quadratic', '204'], ['top_log', '010207'], ['top_word', '501']])('content.number  /teacher/topics/%s/numbers/%s', async (topicId, number) => {
    await visit({ as: ANNA, url: `/teacher/topics/${topicId}/numbers/${number}` });
  });

  it.each(['grp_8a', 'grp_empty'])('groups.detail  /teacher/groups/%s', async (groupId) => {
    await visit({ as: ANNA, url: `/teacher/groups/${groupId}` });
  });

  it.each(STUDENTS)('teacher.student.review  /teacher/students/%s', async (studentId) => {
    await visit({ as: ANNA, url: `/teacher/students/${studentId}` });
  });

  it('teacher.student.review scrolled to a homework  ?assignmentId=hw_ilya_uncertain', async () => {
    await visit({ as: ANNA, url: '/teacher/students/usr_ilya?assignmentId=hw_ilya_uncertain' });
  });

  it.each(['usr_ilya', 'usr_timur', 'usr_kirill'])('teacher.student.assign  /teacher/students/%s/assign', async (studentId) => {
    await visit({ as: ANNA, url: `/teacher/students/${studentId}/assign` });
  });

  it.each(['usr_ilya', 'usr_timur', 'usr_artem', 'usr_dasha'])('teacher.student.lessons  /teacher/students/%s/lessons', async (studentId) => {
    await visit({ as: ANNA, url: `/teacher/students/${studentId}/lessons` });
  });

});
