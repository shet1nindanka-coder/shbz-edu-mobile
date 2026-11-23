// Regressions of the teacher, content and developer areas, round 3: what VoiceOver hears on the student
// card and the journal, buttons that stay readable at a large OS text size, an iOS paste refusal, and the
// "plan lost" rule of the student card on a device clock that runs behind the server.
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, hasTestId, tap, visibleText, visit, wait } from './support/drive';
import type { AppHandle } from './support/launch';
import { all, flattenStyle, textOf, type HostNode } from './support/tree';

const ANNA = 'teacher@example.com';
const DEV = 'dev@example.com';

const isIos = () => (require('react-native') as typeof import('react-native')).Platform.OS === 'ios'; // eslint-disable-line @typescript-eslint/no-require-imports

function labelOf(app: AppHandle, testID: string): string {
  const node = byTestId(app, testID);
  expect(node).toBeTruthy();
  return String(node?.props.accessibilityLabel ?? '');
}

/** The OS text size the app starts with (390 pt phone); the next launch loads a fresh `Dimensions`. */
const withFontScale = (fontScale: number) => () => {
  const { Dimensions } = require('react-native') as typeof import('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
  const window = { width: 390, height: 844, scale: 3, fontScale };
  Dimensions.set({ window, screen: window });
};

describe('student card headers name what tells them apart (#235)', () => {
  // The folded card reads «title — ONE caption — N из M»: the overdue chip became the caption «просрочено
  // 2 дня», the dates became the deadline wording of the caption («до пятницы», «сегодня до 23:59»).
  it('a homework header carries its overdue caption, topic and deadline', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    const overdue = labelOf(app, 'review-assignment-toggle-hw_ilya_overdue');
    expect(overdue).toMatch(/просрочено \d+ (день|дня|дней)/);
    expect(overdue).toContain('Линейные уравнения');
    // Everything the eye reads on the folded head is in the name.
    const head = byTestId(app, 'review-assignment-toggle-hw_ilya_overdue')!;
    for (const text of all(head, (node) => node.type === 'Text' && node.children.every((child) => typeof child === 'string')).map((node) => textOf(node).trim())) {
      if (text !== '') expect(overdue).toContain(text);
    }
    const today = labelOf(app, 'review-assignment-toggle-hw_ilya_today');
    expect(today).not.toBe(overdue);
    expect(today).not.toContain('просрочено');
    expect(today).toMatch(/сегодня до \d\d:\d\d/);
    expect(byTestId(app, 'review-assignment-toggle-hw_ilya_overdue')?.props.accessibilityState).toMatchObject({ expanded: false });
  });

  it('a lesson header carries its date, duration and status', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya/lessons' });
    const planned = labelOf(app, 'student-lesson-toggle-les_budget');
    const finished = labelOf(app, 'student-lesson-toggle-les_d2');
    expect(planned).not.toBe(finished);
    expect(planned).toMatch(/\d\d\.\d\d\.\d{4}, \d\d:\d\d · 60 мин · Запланирован/);
    expect(finished).toContain('Завершён');
  });
});

describe('the journal row names everything it shows', () => {
  // A row is «action — who · when»; the category moved to the detail sheet the row opens.
  it('the action, who and the Moscow time are part of the row button; the category is in its detail', async () => {
    const app = await visit({ as: DEV, url: '/developer/panel/journal' });
    const open = all(app.screen.container as unknown as HostNode, (node) => typeof node.props.testID === 'string' && /^journal-entry-.+-open$/.test(node.props.testID)).at(0);
    expect(open).toBeTruthy();
    const label = String(open?.props.accessibilityLabel ?? '');
    expect(label).toMatch(/МСК/);
    const shown = all(open!, (node) => node.type === 'Text' && node.children.every((child) => typeof child === 'string')).map((node) => textOf(node).trim()).filter((text) => text !== '');
    expect(shown.length).toBeGreaterThanOrEqual(2);
    for (const text of shown) expect(label).toContain(text);

    expect(await tap(app, `#${String(open?.props.testID)}`)).toBe(true);
    expect(hasTestId(app, 'journal-detail-action')).toBe(true);
    expect(visibleText(app)).toContain('Категория');
  });
});

describe('buttons stay readable at a large OS text size (#241, #242)', () => {
  it('assign: the default «Название» button is not capped at 45 % of the footer', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya/assign', arrange: withFontScale(1.3) });
    const button = byTestId(app, 'assign-title-open');
    expect(button).toBeTruthy();
    expect(flattenStyle(button!.props.style).maxWidth).toBeUndefined();
  });

  // The two actions moved into the header's aside row. They are sized by their labels (no fixed basis, no
  // `flex: 1`, no cap) in a row that wraps: at a large text size the second one goes under the first
  // instead of both being cut («Новая те…»).
  it.each([1, 1.3] as const)('developer topics: at font scale %s the header actions keep their label width in a row that wraps', async (fontScale) => {
    const app = await visit({ as: DEV, url: '/developer/topics', arrange: withFontScale(fontScale) });
    for (const id of ['topics-create', 'topics-reorder']) {
      const button = byTestId(app, id);
      expect(button).toBeTruthy();
      const style = flattenStyle(button!.props.style);
      expect(style.flexGrow).toBe(1);
      expect([undefined, 'auto']).toContain(style.flexBasis);
      expect(style.flex).toBeUndefined();
      expect(style.flexShrink).toBeUndefined();
      expect(style.maxWidth).toBeUndefined();
      expect(style.width).toBeUndefined();
      let row = button!.parent;
      while (row && flattenStyle(row.props.style).flexDirection !== 'row') row = row.parent;
      expect(flattenStyle(row?.props.style).flexWrap).toBe('wrap');
    }
  });
});

describe('import panel: an iOS paste refusal is not "the clipboard is empty" (#252)', () => {
  it('says the paste was not allowed when the clipboard holds text but the read came back empty', async () => {
    const calls = { read: 0, has: 0 };
    // Inside the app's module registry (each launch has its own): the clipboard holds text, the read is "".
    const arrange = () => {
      const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard'); // eslint-disable-line @typescript-eslint/no-require-imports
      jest.spyOn(Clipboard, 'getStringAsync').mockImplementation(async () => {
        calls.read += 1;
        return '';
      });
      jest.spyOn(Clipboard, 'hasStringAsync').mockImplementation(async () => {
        calls.has += 1;
        return true;
      });
    };
    const app = await visit({ as: DEV, url: '/developer/topics/top_linear/edit', arrange });
    expect(await tap(app, 'tab:Импорт')).toBe(true);
    expect(await tap(app, '#import-paste')).toBe(true);
    await app.settle();
    expect(calls.read).toBe(1);
    const text = visibleText(app);
    if (isIos()) {
      expect(text).toContain('Если система спрашивает разрешение — разрешите вставку');
      expect(text).not.toContain('В буфере обмена нет текста');
    } else {
      // Android has no paste prompt: an empty read is an empty clipboard.
      expect(text).toContain('В буфере обмена нет текста');
      expect(calls.has).toBe(0);
    }
  });
});

describe('student card: "plan lost" on a device clock behind the server (#212)', () => {
  it('turns stale 15 minutes after an accepted Retry, as the lesson board does', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_dasha/lessons' });
    // The server clock runs 30 minutes ahead of the device: its `planRequestedAt` is 30 minutes "later".
    // Accepted without building anything: the plan stays pending on the server, as a lost job would.
    const regenerate = jest
      .spyOn(app.runtime.api.planner, 'regenerateParticipant')
      .mockImplementation(async () => ({ ok: true, planRequestedAt: new Date(Date.now() + 30 * 60_000).toISOString() }));
    await tap(app, '#student-lesson-toggle-les_stale');
    await wait(app, 16 * 60_000, 'student lessons: the plan is lost');
    expect(hasTestId(app, 'student-lesson-stale-les_stale')).toBe(true);
    expect(await tap(app, '#student-lesson-retry-les_stale')).toBe(true);
    await app.settle();
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(hasTestId(app, 'student-lesson-pending-les_stale')).toBe(true);
    await wait(app, 10 * 60_000, 'student lessons: 10 minutes after the retry');
    expect(hasTestId(app, 'student-lesson-pending-les_stale')).toBe(true);
    await wait(app, 6 * 60_000, 'student lessons: 16 minutes after the retry');
    expect(hasTestId(app, 'student-lesson-stale-les_stale')).toBe(true);
  });
});
