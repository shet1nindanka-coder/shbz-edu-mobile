// Presses every control of every teacher (lessons and homework drafts) screen (and what each press opens: sheets, dialogs, menus,
// pickers, segments), and types into every field. One cold start per screen, warm restarts in between.
import { describe, it } from '@jest/globals';

import { crawl } from './support/drive';
import type { PersonaLogin } from './support/launch';

const CASES: [PersonaLogin, string][] = [
  ['teacher@example.com', '/teacher/lessons'],
  ['teacher@example.com', '/teacher/homework-plans'],
  ['teacher@example.com', '/teacher/lessons/new'],
  ['teacher@example.com', '/teacher/lessons/new?groupId=grp_8a'],
  ['teacher@example.com', '/teacher/lessons/new?studentId=usr_ilya'],
  ['teacher@example.com', '/teacher/lessons/les_live'],
  ['teacher@example.com', '/teacher/lessons/les_g4'],
  ['teacher@example.com', '/teacher/lessons/les_tomorrow_group'],
  ['teacher@example.com', '/teacher/lessons/les_manual'],
  ['teacher@example.com', '/teacher/lessons/les_stale'],
  ['teacher@example.com', '/teacher/homework-plans/new?studentId=usr_ilya'],
  ['teacher@example.com', '/teacher/homework-plans/new?lessonId=les_g4'],
  ['teacher@example.com', '/teacher/homework-plans/hp_ready'],
  ['teacher@example.com', '/teacher/homework-plans/hp_issued'],
  ['teacher@example.com', '/teacher/homework-plans/hp_errors'],
  ['teacher@example.com', '/teacher/homework-plans/hp_conflict'],
  ['teacher3@example.com', '/teacher/lessons'],
];

describe('teacher (lessons and homework drafts): every control of every screen', () => {
  it.each(CASES)('%s %s', async (as, url) => {
    const stats = await crawl({ as, url });
    process.stdout.write(`crawl ${as} ${url}: ${JSON.stringify(stats)}\n`);
  });
});
