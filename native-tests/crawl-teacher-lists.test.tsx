// Presses every control of every teacher (lists, students, groups, calls, topics) screen (and what each press opens: sheets, dialogs, menus,
// pickers, segments), and types into every field. One cold start per screen, warm restarts in between.
import { describe, it } from '@jest/globals';

import { crawl } from './support/drive';
import type { PersonaLogin } from './support/launch';

const CASES: [PersonaLogin, string][] = [
  ['teacher@example.com', '/teacher'],
  ['teacher@example.com', '/teacher/students'],
  ['teacher@example.com', '/teacher/calls'],
  ['teacher@example.com', '/teacher/more'],
  ['teacher@example.com', '/teacher/topics'],
  ['teacher@example.com', '/teacher/topics/top_linear'],
  ['teacher@example.com', '/teacher/topics/top_linear/numbers/118'],
  ['teacher@example.com', '/teacher/groups'],
  ['teacher@example.com', '/teacher/groups/grp_8a'],
  ['teacher@example.com', '/teacher/groups/grp_empty'],
  ['teacher@example.com', '/teacher/students/usr_ilya'],
  ['teacher@example.com', '/teacher/students/usr_artem'],
  ['teacher@example.com', '/teacher/students/usr_ilya/assign'],
  ['teacher@example.com', '/teacher/students/usr_ilya/lessons'],
  ['teacher3@example.com', '/teacher/students'],
  ['teacher3@example.com', '/teacher/groups'],
  ['teacher3@example.com', '/teacher/calls'],
];

describe('teacher (lists, students, groups, calls, topics): every control of every screen', () => {
  it.each(CASES)('%s %s', async (as, url) => {
    const stats = await crawl({ as, url });
    process.stdout.write(`crawl ${as} ${url}: ${JSON.stringify(stats)}\n`);
  });
});
