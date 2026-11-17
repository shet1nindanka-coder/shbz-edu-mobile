// Every control of a screen per role, in English and the dark theme.
import { describe, it } from '@jest/globals';

import { crawl } from './support/drive';

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
