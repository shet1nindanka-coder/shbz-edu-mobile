// Presses every control of every student screen (and what each press opens: sheets, dialogs, menus,
// pickers, segments), and types into every field. One cold start per screen, warm restarts in between.
import { describe, it } from '@jest/globals';

import { crawl } from './support/drive';
import type { PersonaLogin } from './support/launch';

const CASES: [PersonaLogin, string][] = [
  ['ilya@example.com', '/student'],
  ['ilya@example.com', '/student/info'],
  ['ilya@example.com', '/student/lesson'],
  ['ilya@example.com', '/student/homeworks'],
  ['ilya@example.com', '/student/homeworks/hw_ilya_open'],
  ['ilya@example.com', '/student/homeworks/hw_ilya_uncertain'],
  ['ilya@example.com', '/student/homeworks/hw_ilya_failed'],
  ['ilya@example.com', '/student/homeworks/hw_ilya_done'],
  ['ilya@example.com', '/student/deadlines'],
  ['ilya@example.com', '/student/theory'],
  ['ilya@example.com', '/student/numbers/118'],
  ['ilya@example.com', '/student/numbers/010207'],
  ['polina@example.com', '/student/lesson'],
  ['artem@example.com', '/student/lesson'],
  ['kirill@example.com', '/student/lesson'],
  ['dasha@example.com', '/student/lesson'],
  ['polina@example.com', '/student/homeworks/hw_polina_limit'],
  ['artem@example.com', '/student/homeworks/hw_artem_running'],
  ['timur@example.com', '/student'],
  ['timur@example.com', '/student/homeworks'],
  ['kirill@example.com', '/student/deadlines'],
];

describe('student: every control of every screen', () => {
  it.each(CASES)('%s %s', async (as, url) => {
    const stats = await crawl({ as, url });
    process.stdout.write(`crawl ${as} ${url}: ${JSON.stringify(stats)}\n`);
  });
});
