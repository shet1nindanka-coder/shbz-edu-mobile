// Every student screen, opened by deep link on a cold start, for the "everything" student and for the
// personas whose state changes what the screen shows.
import { describe, it } from '@jest/globals';

import { visit } from './support/drive';
import type { PersonaLogin } from './support/launch';

const SCREENS: [string, string][] = [
  ['student.home', '/student'],
  ['student.info', '/student/info'],
  ['student.lesson', '/student/lesson'],
  ['student.homeworks', '/student/homeworks'],
  ['student.deadlines', '/student/deadlines'],
  ['student.theory', '/student/theory'],
];

const PERSONAS: [PersonaLogin, string, string[]][] = [
  ['ilya@example.com', 'the "everything" student', ['hw_ilya_done', 'hw_ilya_overdue', 'hw_ilya_uncertain', 'hw_ilya_open', 'hw_ilya_failed', 'hw_ilya_soon', 'hw_ilya_later', 'hw_ilya_today', 'hw_ilya_far']],
  ['timur@example.com', 'empty states', []],
  ['kirill@example.com', 'overdue, weak profile', ['hw_kirill_overdue1', 'hw_kirill_overdue2']],
  ['polina@example.com', 'live lesson in progress, photo limit', ['hw_polina_limit']],
  ['artem@example.com', 'live lesson with the extra part, a check running', ['hw_artem_running', 'hw_artem_issued']],
  ['dasha@example.com', 'a lesson about to start', ['hw_dasha_first']],
  ['maria@example.com', 'everything done, 22 notifications', ['hw_maria_legacy', 'hw_maria_done3']],
  ['egor@example.com', 'pinned password limiter', []],
];

const NUMBERS = ['118', '204', '010207', '301', '501'];

describe.each(PERSONAS)('student screens as %s (%s)', (login, _note, homeworks) => {
  it.each(SCREENS)('%s  %s', async (_screen, url) => {
    await visit({ as: login, url });
  });

  if (homeworks.length > 0) {
    it.each(homeworks)('student.homework  /student/homeworks/%s', async (assignmentId) => {
      await visit({ as: login, url: `/student/homeworks/${assignmentId}` });
    });
  }

  it.each(login === 'ilya@example.com' ? NUMBERS : NUMBERS.slice(0, 2))('student.number  /student/numbers/%s', async (number) => {
    await visit({ as: login, url: `/student/numbers/${number}` });
  });
});

describe('student screens: entities that do not exist', () => {
  it('a homework of another student leads to the homework list (00 §3.3)', async () => {
    await visit({ as: 'ilya@example.com', url: '/student/homeworks/hw_kirill_overdue1', expectPath: '/student/homeworks' });
  });

  it('an unknown number is the 404 shell', async () => {
    await visit({ as: 'ilya@example.com', url: '/student/numbers/999999', expectNotFound: true });
  });

  it("a teacher's route does not exist for a student: the app opens the student's home", async () => {
    await visit({ as: 'ilya@example.com', url: '/teacher/students', expectPath: '/student' });
  });
});
