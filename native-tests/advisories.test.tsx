// The app's own design and accessibility rules (CLAUDE.md "Styling", "Accessibility"), checked on the
// rendered native tree of a cross-section of screens: the UI-kit gallery (every primitive), one screen per
// area, and the sheets the main buttons open. One test per rule; each lists every place that breaks it.
import { describe, expect, it } from '@jest/globals';

import { checkScreen, tap, visit } from './support/drive';
import type { PersonaLogin } from './support/launch';
import { ADVISORY_RULES, advisories } from './support/problems';
import { formatViolations, type Violation } from './support/tree-checks';

const SCREENS: [PersonaLogin | undefined, string, string[]][] = [
  [undefined, '/login', ['#login-demo-toggle']],
  ['dev@example.com', '/dev-ui', []],
  ['dev@example.com', '/dev-math', []],
  ['ilya@example.com', '/student', []],
  ['ilya@example.com', '/student/homeworks/hw_ilya_open', ['#homework-photos-grid-add']],
  ['polina@example.com', '/student/lesson', []],
  ['ilya@example.com', '/student/theory', []],
  ['ilya@example.com', '/student/deadlines', []],
  ['ilya@example.com', '/settings', []],
  ['ilya@example.com', '/notifications', []],
  ['ilya@example.com', '/number-search', []],
  ['teacher@example.com', '/teacher', []],
  ['teacher@example.com', '/teacher/students', ['#students-add']],
  ['teacher@example.com', '/teacher/students/usr_ilya', ['#review-assignment-toggle-hw_ilya_uncertain']],
  ['teacher@example.com', '/teacher/students/usr_ilya/assign', ['#assign-deadline']],
  ['teacher@example.com', '/teacher/calls', ['#call-record-usr_kirill']],
  ['teacher@example.com', '/teacher/groups/grp_8a', ['tab:Посещаемость']],
  ['teacher@example.com', '/teacher/lessons', []],
  ['teacher@example.com', '/teacher/lessons/les_live', ['#lesson-participant-toggle-lp_les_live_artem']],
  ['teacher@example.com', '/teacher/lessons/new?studentId=usr_ilya', ['radio:Выбрать вручную']],
  ['teacher@example.com', '/teacher/homework-plans/hp_ready', ['#draft-participant-toggle-lp_hp_ready_ilya']],
  ['dev@example.com', '/developer/topics/top_linear/edit', []],
  ['dev@example.com', '/developer/accounts', ['#accounts-add']],
  ['dev@example.com', '/developer/statistics', []],
  ['dev@example.com', '/developer/panel?tab=settings', []],
  ['dev@example.com', '/developer/panel/journal', []],
];

/**
 * Advisory violations traced to their source and proven harmless on a phone. Each is a deliberate web-only
 * style that native ignores.
 */
const HARMLESS: { rule: string; path: RegExp; why: string }[] = [
  {
    rule: 'style-text-on-view',
    path: /(assign|lesson-compose)-number-/,
    why:
      'src/components/number-select-card/number-select-card.tsx:69 sets textAlign on the formula wrapper so that, on web, ' +
      'the formula does not inherit the centred text of the <button> a pressable card becomes; native ignores it.',
  },
];

let collected: Violation[] | null = null;

/** Renders the cross-section once (in the first test that asks) and keeps what the walker found. */
async function collect(): Promise<Violation[]> {
  if (collected) return collected;
  const found = new Map<string, Violation>();
  for (const [as, url, presses] of SCREENS) {
    const app = await visit({ as, url, expectPath: null });
    for (const selector of presses) await tap(app, selector);
    checkScreen(app, `${as ?? 'signed out'} ${url}`);
    for (const violation of advisories()) found.set(`${violation.rule}|${violation.message}|${violation.path}|${violation.node}`, violation);
  }
  collected = [...found.values()];
  return collected;
}

describe('design and accessibility rules on the native tree', () => {
  it.each([...ADVISORY_RULES])('%s', async (rule) => {
    const violations = (await collect()).filter(
      (violation) => violation.rule === rule && !HARMLESS.some((entry) => entry.rule === rule && entry.path.test(violation.path)),
    );
    expect(formatViolations(violations)).toBe('');
  });
});
