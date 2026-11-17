// Presses every control of every shell screen (and what each press opens: sheets, dialogs, menus,
// pickers, segments), and types into every field. One cold start per screen, warm restarts in between.
import { describe, it } from '@jest/globals';

import { crawl } from './support/drive';
import type { PersonaLogin } from './support/launch';

const CASES: [PersonaLogin, string][] = [
  ['ilya@example.com', '/settings'],
  ['teacher@example.com', '/settings'],
  ['dev@example.com', '/settings'],
  ['ilya@example.com', '/notifications'],
  ['maria@example.com', '/notifications'],
  ['teacher@example.com', '/notifications'],
  ['dev@example.com', '/notifications'],
  ['ilya@example.com', '/number-search'],
  ['teacher@example.com', '/number-search'],
  ['ilya@example.com', '/demo'],
  ['dev@example.com', '/dev-ui'],
  ['dev@example.com', '/dev-math'],
];

describe('shell: every control of every screen', () => {
  it.each(CASES)('%s %s', async (as, url) => {
    const stats = await crawl({ as, url });
    process.stdout.write(`crawl ${as} ${url}: ${JSON.stringify(stats)}\n`);
  });
});
