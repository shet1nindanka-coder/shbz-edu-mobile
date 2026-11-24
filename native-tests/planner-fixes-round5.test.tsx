// Regressions of the planner area (bug-hunt round 5), driven through the UI on the real mock server: the
// lesson board's «add a problem» sheet pins its fallback topic (#414), and the board says when the lesson is
// (or how much of it is left) in its body, not only in the one-line app bar (#417).
import { describe, expect, it } from '@jest/globals';

import { byTestId, hasTestId, tap, visibleText, visit } from './support/drive';
import { textOf, type HostNode } from './support/tree';

const ANNA = 'teacher@example.com';

/** Whether `node` is rendered inside `ancestor`. */
function within(ancestor: HostNode, node: HostNode): boolean {
  for (let current: HostNode | null = node; current; current = current.parent) if (current === ancestor) return true;
  return false;
}

describe('lesson board «add a problem»: the fallback topic is pinned once the pinned one is deleted (#414)', () => {
  it('deleting the shown topic, then reordering, keeps the fallback topic and the picked number', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_d2' });
    const add = app.screen.queryAllByTestId(/^lesson-participant-add-/)[0];
    expect(add).toBeDefined();
    await app.rntl.fireEvent.press(add);
    await app.settle();
    const { qk } = require('@/api') as typeof import('@/api'); // eslint-disable-line @typescript-eslint/no-require-imports
    type Bank = { topics: { topicId: string; topicTitle: string; numbers: { id: string }[] }[] };
    const key = qk('planner', 'getNumberBank');
    const bank = app.queryClient.getQueryData<Bank>(key);
    const withNumbers = bank?.topics.filter((topic) => topic.numbers.length > 1) ?? [];
    expect(withNumbers.length).toBeGreaterThan(2);
    const [first, second, third] = withNumbers;
    const topicSelect = () => String((byTestId(app, 'lesson-add-topic')?.props.accessibilityValue as { text?: string } | undefined)?.text ?? '');
    const numberSelect = () => String((byTestId(app, 'lesson-add-number')?.props.accessibilityValue as { text?: string } | undefined)?.text ?? '');
    const addMainDisabled = () => ((byTestId(app, 'lesson-add-to-main')?.props.accessibilityState ?? {}) as { disabled?: boolean }).disabled === true;

    await app.rntl.act(async () => {
      app.queryClient.setQueryData<Bank>(key, { topics: [first, second, third] });
    });
    await app.settle();
    expect(topicSelect()).toBe(first.topicTitle);

    // The developer deleted the pinned topic: the sheet falls back to the next one.
    await app.rntl.act(async () => {
      app.queryClient.setQueryData<Bank>(key, { topics: [second, third] });
    });
    await app.settle();
    expect(topicSelect()).toBe(second.topicTitle);

    await tap(app, '#lesson-add-number');
    await app.settle();
    await app.rntl.fireEvent.press(app.screen.getAllByRole('menuitem')[0]);
    await app.settle();
    const pickedBefore = numberSelect();
    expect(pickedBefore).not.toBe('');
    expect(addMainDisabled()).toBe(false);

    // Then the developer moved another topic to the top: the fallback stays, and so does the number.
    await app.rntl.act(async () => {
      app.queryClient.setQueryData<Bank>(key, { topics: [third, second] });
    });
    await app.settle();
    expect(topicSelect()).toBe(second.topicTitle);
    expect(numberSelect()).toBe(pickedBefore);
    expect(addMainDisabled()).toBe(false);
  });
});

describe('lesson board: when the lesson is and how much of it is left are in the body (#417)', () => {
  // The one caption line of the board (the site's page kicker) is in the content, above the class: whose
  // lesson it is and — while it runs — how long it still lasts (mockup «11А · осталось 52 минуты»); before
  // and after — the short date and the time. The status word and the planned duration are no longer spelled
  // out (docs/design/glass-over-paper.md §1a): a running lesson counts down.
  it('ru, live: the line with the minutes left is shown below the app bar', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live' });
    const kicker = byTestId(app, 'lesson-board-kicker');
    expect(kicker).toBeTruthy();
    expect(textOf(kicker!)).toMatch(/^8А — алгебра · осталось \d+ мин$/);
    expect(visibleText(app)).toContain(textOf(kicker!));
    // Not a part of the header, whose one-line title would cut it.
    expect(byTestId(app, 'lesson-board-app-bar')).toBeTruthy();
    expect(within(byTestId(app, 'lesson-board-app-bar')!, kicker!)).toBe(false);
  });

  it('en, live: the same line in English', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live', locale: 'en' });
    const kicker = byTestId(app, 'lesson-board-kicker');
    expect(kicker).toBeTruthy();
    expect(textOf(kicker!)).toMatch(/^.+ · \d+ min left$/);
    expect(within(byTestId(app, 'lesson-board-app-bar')!, kicker!)).toBe(false);
  });

  it('a lesson that is not running: the date and the time of its start', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons' });
    const pending = app.mock.planner.listLessons();
    await app.advance(1500);
    const lessons = (await pending).lessons.filter((row) => row.status !== 'ACTIVE' && row.startsAt !== null);
    // One of a group (the line starts with the group's name) and one for a single student (the date alone).
    const picked = [lessons.find((row) => row.groupName !== null), lessons.find((row) => row.groupName === null)];
    expect(picked.filter(Boolean)).toHaveLength(2);
    const { formatClockTime } = require('@/domain/dates') as typeof import('@/domain/dates'); // eslint-disable-line @typescript-eslint/no-require-imports
    for (const lesson of picked) {
      if (!lesson?.startsAt) continue;
      await app.open(`/teacher/lessons/${lesson.id}`);
      const kicker = byTestId(app, 'lesson-board-kicker');
      expect(kicker).toBeTruthy();
      const text = textOf(kicker!);
      // «18 нояб., 12:00» within the current year, the full «18.11.2024, 12:00» otherwise — Moscow time.
      const when = '(\\d{1,2} [а-яё]+\\.?|\\d{2}\\.\\d{2}\\.\\d{4}), \\d{2}:\\d{2}';
      expect(text).toMatch(new RegExp(lesson.groupName ? `^.+ · ${when}$` : `^${when}$`));
      if (lesson.groupName) expect(text.startsWith(`${lesson.groupName} · `)).toBe(true);
      expect(text.endsWith(`, ${formatClockTime(lesson.startsAt, 'ru')}`)).toBe(true);
      expect(visibleText(app)).toContain(text);
      expect(within(byTestId(app, 'lesson-board-app-bar')!, kicker!)).toBe(false);
    }
  });
});

describe('homework-draft board: the topic and the deadline are in the body too (#417, sibling)', () => {
  // One caption line above the students: the topic (unless the draft's title already names it) and the
  // deadline worded like a homework row's — the separate deadline line is merged into it.
  it('shows the kicker line with the topic and the deadline below the app bar', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/homework-plans/hp_ready' });
    const kicker = byTestId(app, 'draft-board-kicker');
    expect(kicker).toBeTruthy();
    const { qk } = require('@/api') as typeof import('@/api'); // eslint-disable-line @typescript-eslint/no-require-imports
    const plan = app.queryClient.getQueryData<{ title: string; topicTitle: string; deadlineAt: string | null }>(qk('planner', 'getHomeworkPlanBoard', 'hp_ready'));
    expect(plan).toBeTruthy();
    expect(plan!.title).not.toContain(plan!.topicTitle);
    expect(plan!.deadlineAt).not.toBeNull();
    const text = textOf(kicker!);
    expect(text.startsWith(`${plan!.topicTitle} · `)).toBe(true);
    // «до субботы» / «сегодня, 20:00» / «завтра, 20:00» / «до 24 ноября» / «просрочено 2 дня».
    expect(text.slice(plan!.topicTitle.length + 3)).toMatch(/^(до \S+( \S+)?|сегодня, \d{2}:\d{2}|завтра, \d{2}:\d{2}|просрочено .+)$/);
    expect(hasTestId(app, 'draft-board-deadline')).toBe(false);
    expect(visibleText(app)).toContain(text);
    expect(byTestId(app, 'draft-board-app-bar')).toBeTruthy();
    expect(within(byTestId(app, 'draft-board-app-bar')!, kicker!)).toBe(false);
  });
});
