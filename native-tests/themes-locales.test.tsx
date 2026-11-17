// A sample of every area in the other language and the other theme (and with hints off): the texts come
// from other dictionaries and the colours from the other palette, on the same native tree.
import { describe, it } from '@jest/globals';

import { crawl, visit } from './support/drive';
import type { PersonaLogin } from './support/launch';

const SAMPLE: [PersonaLogin | undefined, string][] = [
  [undefined, '/login'],
  ['ilya@example.com', '/student'],
  ['ilya@example.com', '/student/homeworks'],
  ['ilya@example.com', '/student/homeworks/hw_ilya_uncertain'],
  ['polina@example.com', '/student/lesson'],
  ['ilya@example.com', '/student/deadlines'],
  ['ilya@example.com', '/student/theory'],
  ['ilya@example.com', '/student/numbers/118'],
  ['ilya@example.com', '/student/info'],
  ['ilya@example.com', '/settings'],
  ['maria@example.com', '/notifications'],
  ['timur@example.com', '/student'],
  ['teacher@example.com', '/teacher'],
  ['teacher@example.com', '/teacher/students'],
  ['teacher@example.com', '/teacher/students/usr_ilya'],
  ['teacher@example.com', '/teacher/students/usr_ilya/assign'],
  ['teacher@example.com', '/teacher/students/usr_artem/lessons'],
  ['teacher@example.com', '/teacher/calls'],
  ['teacher@example.com', '/teacher/groups/grp_8a'],
  ['teacher@example.com', '/teacher/lessons'],
  ['teacher@example.com', '/teacher/lessons/les_live'],
  ['teacher@example.com', '/teacher/lessons/new?groupId=grp_8a'],
  ['teacher@example.com', '/teacher/homework-plans'],
  ['teacher@example.com', '/teacher/homework-plans/hp_errors'],
  ['teacher3@example.com', '/teacher/students'],
  ['dev@example.com', '/developer/topics'],
  ['dev@example.com', '/developer/topics/top_linear/edit'],
  ['dev@example.com', '/developer/accounts'],
  ['dev@example.com', '/developer/calls'],
  ['dev@example.com', '/developer/statistics'],
  ['dev@example.com', '/developer/panel'],
  ['dev@example.com', '/developer/panel/journal'],
  ['dev@example.com', '/dev-ui'],
];

describe.each([
  ['English, dark theme', { locale: 'en', theme: 'dark' }],
  ['English, light theme, hints off', { locale: 'en', theme: 'light', hints: false }],
  ['Russian, dark theme, hints off', { locale: 'ru', theme: 'dark', hints: false }],
] as const)('%s', (_name, preferences) => {
  it.each(SAMPLE)('%s %s', async (as, url) => {
    await visit({ as, url, ...preferences });
  });
});

describe('English, dark theme: every control of a screen per role', () => {
  it.each([
    ['ilya@example.com', '/student/homeworks/hw_ilya_open'],
    ['teacher@example.com', '/teacher/students/usr_ilya'],
    ['teacher@example.com', '/teacher/calls'],
    ['dev@example.com', '/developer/accounts'],
    ['ilya@example.com', '/settings'],
  ] as const)('%s %s', async (as, url) => {
    await crawl({ as, url, locale: 'en', theme: 'dark' });
  });
});
