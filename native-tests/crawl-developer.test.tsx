// Presses every control of every developer screen (and what each press opens: sheets, dialogs, menus,
// pickers, segments), and types into every field. One cold start per screen, warm restarts in between.
import { describe, it } from '@jest/globals';

import { crawl } from './support/drive';
import type { PersonaLogin } from './support/launch';

const CASES: [PersonaLogin, string][] = [
  ['dev@example.com', '/developer/topics'],
  ['dev@example.com', '/developer/topics/top_linear'],
  ['dev@example.com', '/developer/topics/top_linear/edit'],
  ['dev@example.com', '/developer/topics/top_empty/edit'],
  ['dev@example.com', '/developer/topics/top_linear/numbers/118'],
  ['dev@example.com', '/developer/topics/top_log/numbers/010207'],
  ['dev@example.com', '/developer/accounts'],
  ['dev@example.com', '/developer/calls'],
  ['dev@example.com', '/developer/statistics'],
  ['dev@example.com', '/developer/panel'],
  ['dev@example.com', '/developer/panel?tab=actions'],
  ['dev@example.com', '/developer/panel?tab=broadcast'],
  ['dev@example.com', '/developer/panel?tab=settings'],
  ['dev@example.com', '/developer/panel/journal'],
];

describe('developer: every control of every screen', () => {
  it.each(CASES)('%s %s', async (as, url) => {
    const stats = await crawl({ as, url });
    process.stdout.write(`crawl ${as} ${url}: ${JSON.stringify(stats)}\n`);
  });
});
