// Regressions of the planner area (bug-hunt round 5), driven through the UI on the real mock server: the
// lesson board's «add a problem» sheet pins its fallback topic (#414), and the live board shows the lesson's
// date and duration in its body, not only in the one-line app-bar subtitle (#417).
import { describe, expect, it } from '@jest/globals';

import { byTestId, tap, visibleText, visit } from './support/drive';
import { textOf } from './support/tree';

const ANNA = 'teacher@example.com';

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

describe('live lesson board: the date and the duration are in the body (#417)', () => {
  it('ru: the kicker line with «90 мин» is shown below the app bar', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live' });
    const kicker = byTestId(app, 'lesson-board-kicker');
    expect(kicker).toBeTruthy();
    expect(textOf(kicker!)).toMatch(/^8А — алгебра · \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} · 90 мин$/);
    expect(visibleText(app)).toContain(textOf(kicker!));
  });

  it('en: the same line in English', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live', locale: 'en' });
    const kicker = byTestId(app, 'lesson-board-kicker');
    expect(kicker).toBeTruthy();
    expect(textOf(kicker!)).toMatch(/ · 90 min$/);
  });
});

describe('homework-draft board: the topic and the group are in the body too (#417, sibling)', () => {
  it('shows the kicker line with the topic above the draft title', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/homework-plans/hp_ready' });
    const kicker = byTestId(app, 'draft-board-kicker');
    expect(kicker).toBeTruthy();
    const { qk } = require('@/api') as typeof import('@/api'); // eslint-disable-line @typescript-eslint/no-require-imports
    const plan = app.queryClient.getQueryData<{ topicTitle: string; group: { name: string } | null }>(qk('planner', 'getHomeworkPlanBoard', 'hp_ready'));
    expect(plan).toBeTruthy();
    const expected = plan!.group ? `${plan!.topicTitle} · ${plan!.group.name}` : plan!.topicTitle;
    expect(textOf(kicker!)).toBe(expected);
  });
});
