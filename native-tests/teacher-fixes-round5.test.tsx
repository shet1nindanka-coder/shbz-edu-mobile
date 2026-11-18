// Regressions of the teacher, content and developer areas, round 5: the review's undo sends nothing after a
// failed accept and only what was applied after a part-way one (#412), the assign board and the lesson
// «add a problem» sheet pin their fallback topic (#413), English accessible names that start with the
// visible label (#415), and the developer journal saying so when its next page is parked offline (#403).
import { describe, expect, it, jest } from '@jest/globals';

import { ApiError } from '@/api/errors';
import type { StatusChangeEntry } from '@/screens/teacher/card/review-logic';

import { byTestId, hasTestId, press, pressTestId, visibleText, visit } from './support/drive';
import type { AppHandle } from './support/launch';
import { all, textOf, type HostNode } from './support/tree';

const ANNA = 'teacher@example.com';
const DEV = 'dev@example.com';

const rootOf = (app: AppHandle) => app.screen.container as unknown as HostNode;

// ───────────────────────────── #412 ─────────────────────────────

describe('review: the undo of an accept writes only what the accept applied (#412)', () => {
  const HW = 'hw_ilya_overdue';
  const GROUP = 'review-number-status-num_118';

  function radios(app: AppHandle): { checked: string | null; disabled: boolean } {
    const group = byTestId(app, GROUP);
    expect(group).toBeTruthy();
    const options = all(group!, (node) => node.props.accessibilityRole === 'radio');
    const state = (node: HostNode) => (node.props.accessibilityState ?? {}) as { checked?: boolean; disabled?: boolean };
    const checked = options.find((node) => state(node).checked === true);
    return { checked: checked ? String(checked.props.accessibilityLabel) : null, disabled: options.some((node) => state(node).disabled === true) };
  }

  /** Opens Ilya's overdue homework with № 118 green, so that the AI verdict (wrong → red) is a change. */
  async function openReview(): Promise<AppHandle> {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    if (!hasTestId(app, `review-accept-${HW}`)) {
      expect(await pressTestId(app, `review-assignment-toggle-${HW}`)).toBe(true);
      await app.settle();
    }
    const group = byTestId(app, GROUP)!;
    const green = all(group, (node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Зеленый')[0];
    if (radios(app).checked !== 'Зеленый') {
      await press(app, green, 'green 118');
      await app.settle();
    }
    expect(radios(app).checked).toBe('Зеленый');
    return app;
  }

  /** Every batch takes 2.5 s; `fail(call)` decides which calls are refused. Returns the batches sent. */
  function slowBatches(app: AppHandle, fail: (call: number) => boolean): StatusChangeEntry[][] {
    const api = app.runtime.api.teacherStudents;
    const original = api.setNumberStatuses.bind(api);
    const sent: StatusChangeEntry[][] = [];
    jest.spyOn(api, 'setNumberStatuses').mockImplementation(async (studentId, changes) => {
      sent.push(changes.map((change) => ({ ...change })));
      const call = sent.length;
      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (fail(call)) throw new ApiError({ code: 'serviceUnavailable', status: 503, message: 'Сервис временно недоступен (тест)' });
      return original(studentId, changes);
    });
    return sent;
  }

  it('accept succeeds → the queued undo restores the previous colour', async () => {
    const app = await openReview();
    const sent = slowBatches(app, () => false);

    await app.rntl.fireEvent.press(app.screen.getByTestId(`review-accept-${HW}`));
    await app.advance(300);
    await app.rntl.fireEvent.press(app.screen.getByTestId('review-undo-toast-undo'));
    await app.advance(6000);
    await app.settle();

    expect(sent.length).toBe(2);
    expect(sent[1].find((entry) => entry.homeworkNumberId === 'num_118')?.status).toBe('GREEN');
    expect(radios(app)).toEqual({ checked: 'Зеленый', disabled: false });
  });

  it('accept fails → the undo pressed meanwhile sends nothing', async () => {
    const app = await openReview();
    const sent = slowBatches(app, (call) => call === 1);
    const eventsBefore = app.mock.backend.store.progressEvents.count();

    await app.rntl.fireEvent.press(app.screen.getByTestId(`review-accept-${HW}`));
    await app.advance(300);
    await app.rntl.fireEvent.press(app.screen.getByTestId('review-undo-toast-undo'));
    await app.advance(6000);
    await app.settle();

    // Only the refused accept went out: no "reaffirmed" teacher mark the teacher never made.
    expect(sent.length).toBe(1);
    expect(app.mock.backend.store.progressEvents.count()).toBe(eventsBefore);
    expect(radios(app)).toEqual({ checked: 'Зеленый', disabled: false });
    expect(visibleText(app)).toContain('Сервис временно недоступен (тест)');
    expect(hasTestId(app, 'review-undo-toast')).toBe(false);
  });
});

describe('review: an accept of more than 100 changes that fails on its second request (#412)', () => {
  const HW = 'hw_big';
  const TOTAL = 150;

  /** One homework of 150 unmarked numbers whose last check says every one is wrong (→ red). */
  function bigHomeworks() {
    const at = '2026-11-15T09:00:00.000Z';
    const numbers = Array.from({ length: TOTAL }, (_, index) => ({
      homeworkNumberId: `num_big_${index}`,
      number: String(1000 + index),
      conditionLatex: null,
      answerLatex: null,
      status: null,
      note: '',
    }));
    const check = {
      id: 'chk_big',
      status: 'DONE' as const,
      error: null,
      createdAt: at,
      checkedAt: at,
      photos: [],
      results: numbers.map((number) => ({
        number: number.number,
        verdict: 'INCORRECT' as const,
        recognizedAnswer: null,
        comment: null,
        copySuspected: false,
        copyReason: null,
        injectionSuspected: false,
        injectionNote: null,
      })),
    };
    return {
      assignmentsEnabled: true,
      notesEnabled: true,
      assignments: [
        {
          id: HW,
          title: 'Большое ДЗ',
          orderInTopic: 1,
          topicId: 'top_linear',
          topicTitle: 'Линейные уравнения',
          deadlineAt: null,
          createdAt: at,
          numbers,
          photos: [],
          checks: [check],
          latestCheck: check,
          greenCount: 0,
          yellowCount: 0,
          redCount: 0,
          markedCount: 0,
          totalNumbers: TOTAL,
          progressPercent: 0,
          solvedCount: 0,
          solvedPercent: 0,
        },
      ],
    };
  }

  /** The card with the big homework; every batch takes 2.5 s and the second one is refused. */
  async function openBig(): Promise<{ app: AppHandle; sent: StatusChangeEntry[][] }> {
    const sent: StatusChangeEntry[][] = [];
    const app = await visit({
      as: ANNA,
      url: '/teacher/students/usr_ilya',
      arrange: ({ runtime }) => {
        const api = runtime.api.teacherStudents;
        jest.spyOn(api, 'getStudentHomeworks').mockImplementation(async () => bigHomeworks());
        jest.spyOn(api, 'setNumberStatuses').mockImplementation(async (_studentId, changes) => {
          sent.push(changes.map((change) => ({ ...change })));
          const call = sent.length;
          await new Promise((resolve) => setTimeout(resolve, 2500));
          if (call === 2) throw new ApiError({ code: 'serviceUnavailable', status: 503, message: 'Сервис временно недоступен (тест)' });
          return { results: changes.map((change) => ({ ...change })) };
        });
      },
    });
    if (!hasTestId(app, `review-accept-${HW}`)) {
      expect(await pressTestId(app, `review-assignment-toggle-${HW}`)).toBe(true);
      await app.settle();
    }
    expect(hasTestId(app, `review-accept-${HW}`)).toBe(true);
    return { app, sent };
  }

  it('the undo pressed meanwhile restores exactly the first 100 numbers; the error says what went through', async () => {
    const { app, sent } = await openBig();
    await app.rntl.fireEvent.press(app.screen.getByTestId(`review-accept-${HW}`));
    await app.advance(300);
    await app.rntl.fireEvent.press(app.screen.getByTestId('review-undo-toast-undo'));
    // The accept has failed on its second batch; the undo of the applied part is on its way.
    await app.advance(5500);
    expect(sent.map((batch) => batch.length)).toEqual([100, 50, 100]);
    expect(visibleText(app)).toContain('Сервис временно недоступен (тест) Применено 100 из 150.');
    await app.advance(3500);
    await app.settle();

    expect(sent[2].map((entry) => entry.homeworkNumberId)).toEqual(sent[0].map((entry) => entry.homeworkNumberId));
    expect(sent[2].every((entry) => entry.status === null)).toBe(true);
    // Review #412: once the undo has taken those 100 back, the card no longer claims they are applied.
    expect(visibleText(app)).not.toContain('Применено 100 из 150');
  });

  it('without an undo yet: the toast stays for the applied part and undoes exactly it', async () => {
    const { app, sent } = await openBig();
    await app.rntl.fireEvent.press(app.screen.getByTestId(`review-accept-${HW}`));
    await app.advance(5500);
    await app.settle(3000);

    expect(sent.map((batch) => batch.length)).toEqual([100, 50]);
    expect(textOf(byTestId(app, 'review-undo-toast')!)).toContain('Вердикты ИИ приняты: 100');
    await app.rntl.fireEvent.press(app.screen.getByTestId('review-undo-toast-undo'));
    expect(visibleText(app)).toContain('Применено 100 из 150');
    await app.advance(3000);
    await app.settle();
    expect(sent.length).toBe(3);
    expect(sent[2].map((entry) => entry.homeworkNumberId)).toEqual(sent[0].map((entry) => entry.homeworkNumberId));
    expect(visibleText(app)).not.toContain('Применено 100 из 150');
  });
});

// ───────────────────────────── #413 ─────────────────────────────

describe('the fallback topic is pinned once the pinned one is deleted (#413)', () => {
  it('assign: deleting the shown topic, then reordering, keeps the fallback topic and its picks', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_maria/assign' });
    const { qk } = require('@/api') as typeof import('@/api'); // eslint-disable-line @typescript-eslint/no-require-imports
    type Board = { topics: { id: string; title: string; numbers: { id: string; number: string }[] }[] };
    const key = qk('teacherStudents', 'getAssignBoard', 'usr_maria');
    const board = app.queryClient.getQueryData<Board>(key);
    expect(board && board.topics.length > 2).toBe(true);
    const [first, second, third] = board!.topics;

    // The developer deleted the pinned (first) topic: the board falls back to the second one.
    await app.rntl.act(async () => {
      app.queryClient.setQueryData<Board>(key, (current) => (current ? { ...current, topics: current.topics.filter((topic) => topic.id !== first.id) } : current));
    });
    await app.settle();
    expect(visibleText(app)).toContain(second.title);
    const picked = second.numbers[0];
    expect(await pressTestId(app, `assign-number-${picked.number}`)).toBe(true);
    await app.settle();
    const barBefore = textOf(byTestId(app, 'assign-bar')!);
    expect(barBefore).toContain('1');

    // Then the developer moved the third topic to the top.
    await app.rntl.act(async () => {
      app.queryClient.setQueryData<Board>(key, (current) =>
        current ? { ...current, topics: [third, ...current.topics.filter((topic) => topic.id !== third.id)] } : current,
      );
    });
    await app.settle();
    expect(visibleText(app)).toContain(second.title);
    expect(hasTestId(app, `assign-number-${picked.number}`)).toBe(true);
    expect(textOf(byTestId(app, 'assign-bar')!)).toBe(barBefore);
  });

  it('lesson «add a problem»: the same for the topic and the picked number of the sheet', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_dasha/lessons' });
    expect(await pressTestId(app, 'student-lesson-toggle-les_stale')).toBe(true);
    await app.settle();
    expect(await pressTestId(app, 'student-lesson-add-les_stale')).toBe(true);
    await app.advance(2000);
    await app.settle();
    const { qk } = require('@/api') as typeof import('@/api'); // eslint-disable-line @typescript-eslint/no-require-imports
    type Bank = { topics: { topicId: string; topicTitle: string; numbers: { id: string; number: string }[] }[] };
    const key = qk('planner', 'getNumberBank');
    const bank = app.queryClient.getQueryData<Bank>(key);
    const withNumbers = bank?.topics.filter((topic) => topic.numbers.length > 0) ?? [];
    expect(withNumbers.length).toBeGreaterThan(2);
    const [first, second, third] = withNumbers;
    // Only topics with numbers, so that the fallback has something to pick.
    await app.rntl.act(async () => {
      app.queryClient.setQueryData<Bank>(key, { topics: [first, second, third] });
    });
    await app.settle();
    const topicText = () => textOf(byTestId(app, 'student-lesson-add-topic')!);
    expect(topicText()).toContain(first.topicTitle);

    await app.rntl.act(async () => {
      app.queryClient.setQueryData<Bank>(key, { topics: [second, third] });
    });
    await app.settle();
    expect(topicText()).toContain(second.topicTitle);

    expect(await pressTestId(app, 'student-lesson-add-number')).toBe(true);
    await app.settle();
    const option = all(rootOf(app), (node) => node.props.accessibilityRole === 'menuitem' && typeof node.props.accessibilityLabel === 'string')[0];
    expect(option).toBeTruthy();
    await press(app, option, 'first number');
    await app.settle();
    const addMain = () => (byTestId(app, 'student-lesson-add-main')!.props.accessibilityState ?? {}) as { disabled?: boolean };
    expect(addMain().disabled).not.toBe(true);

    await app.rntl.act(async () => {
      app.queryClient.setQueryData<Bank>(key, { topics: [third, second] });
    });
    await app.settle();
    expect(topicText()).toContain(second.topicTitle);
    expect(addMain().disabled).not.toBe(true);
  });
});

// ───────────────────────────── #415 ─────────────────────────────

/** Buttons whose accessible name does not contain what they show (WCAG 2.5.3, voice control). */
function labelNotInName(app: AppHandle): string[] {
  const nodes = all(
    rootOf(app),
    (node) =>
      (node.props.accessibilityRole === 'button' || node.props.accessibilityRole === 'link') &&
      typeof node.props.accessibilityLabel === 'string' &&
      typeof node.props.testID === 'string',
  );
  // Letters and digits only: the tree's text joins its pieces without spaces, and the name may add «№».
  const normalise = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const bad: string[] = [];
  for (const node of nodes) {
    // A control that shows one caption (a button, a link); composite cards name their title, not all text.
    const captions = all(node, (child) => child.type === 'Text' && textOf(child).trim() !== '');
    const leaves = captions.filter((caption) => all(caption, (child) => child !== caption && child.type === 'Text').length === 0);
    if (leaves.length !== 1) continue;
    const shown = normalise(textOf(node));
    const name = normalise(String(node.props.accessibilityLabel));
    if (shown !== '' && !name.includes(shown)) bad.push(`${String(node.props.testID)}: «${shown}» ∉ «${name}»`);
  }
  return [...new Set(bad)];
}

describe('accessible names contain the visible label (#415)', () => {
  for (const locale of ['en', 'ru'] as const) {
    it(`${locale}: topic view answer toggles`, async () => {
      const app = await visit({ as: ANNA, url: '/teacher/topics/top_linear', locale });
      const toggles = all(rootOf(app), (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('topic-number-answer-toggle-') && node.props.accessibilityLabel !== undefined);
      expect(toggles.length).toBeGreaterThan(1);
      expect(String(toggles[0].props.accessibilityLabel)).toMatch(locale === 'en' ? /^Show answer, problem / : /^Показать ответ № /);
      expect(labelNotInName(app)).toEqual([]);
    });

    it(`${locale}: student card lessons and review`, async () => {
      const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya/lessons', locale });
      const open = all(rootOf(app), (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('student-lesson-open-') && node.props.accessibilityLabel !== undefined);
      expect(open.length).toBeGreaterThan(1);
      expect(String(open[0].props.accessibilityLabel)).toMatch(locale === 'en' ? /^Open lesson: / : /^Открыть занятие: /);
      expect(labelNotInName(app)).toEqual([]);

      await app.open('/teacher/students/usr_ilya');
      if (!hasTestId(app, 'review-number-history-num_118')) {
        expect(await pressTestId(app, 'review-assignment-toggle-hw_ilya_overdue')).toBe(true);
        await app.settle();
      }
      expect(labelNotInName(app)).toEqual([]);

      await app.open('/teacher/students/usr_maria/assign');
      expect(labelNotInName(app)).toEqual([]);
    });

    it(`${locale}: developer topics, topic, edit and accounts`, async () => {
      const app = await visit({ as: DEV, url: '/developer/topics', locale });
      expect(labelNotInName(app)).toEqual([]);
      await app.open('/developer/topics/top_linear');
      expect(labelNotInName(app)).toEqual([]);
      await app.open('/developer/topics/top_linear/edit');
      expect(labelNotInName(app)).toEqual([]);
      await app.open('/developer/accounts');
      expect(labelNotInName(app)).toEqual([]);
      await app.open('/developer/panel');
      expect(labelNotInName(app)).toEqual([]);
    });
  }
});

// ───────────────────────────── #403 ─────────────────────────────

describe('developer journal: the next page parked offline says so (#403)', () => {
  const network = () => require('@/services/network') as typeof import('@/services/network'); // eslint-disable-line @typescript-eslint/no-require-imports

  it('«Показать ещё» offline shows the network notice; the end-of-list load does not re-fire; the page comes online', async () => {
    const app = await visit({ as: DEV, url: '/developer/panel/journal?days=90' });
    expect(textOf(byTestId(app, 'journal-page-of')!)).toBe('Страница 1 из 2');
    expect(hasTestId(app, 'journal-more-error')).toBe(false);

    const api = app.runtime.api.developer;
    const reads = jest.spyOn(api, 'getJournal');
    await app.rntl.act(async () => network().setSimulatedOffline(true));
    expect(await pressTestId(app, 'journal-more')).toBe(true);
    for (let i = 0; i < 4; i += 1) await app.advance(1000);
    await app.settle();
    expect(textOf(byTestId(app, 'journal-page-of')!)).toBe('Страница 1 из 2');
    expect(textOf(byTestId(app, 'journal-more-error')!)).toContain('Нет связи с сервером');
    // One notice: the filter-switch one is not shown with it.
    expect(hasTestId(app, 'journal-offline-notice')).toBe(false);
    expect(hasTestId(app, 'journal-refresh-error')).toBe(false);

    // Scrolling to the end does not start another silent attempt while the read is parked.
    const list = byTestId(app, 'journal-list');
    const onEndReached = list?.props.onEndReached as (() => void) | undefined;
    const before = reads.mock.calls.length;
    if (onEndReached) await app.rntl.act(async () => onEndReached());
    await app.advance(1000);
    expect(reads.mock.calls.length).toBe(before);

    await app.rntl.act(async () => network().setSimulatedOffline(false));
    for (let i = 0; i < 4; i += 1) await app.advance(1000);
    await app.settle();
    expect(textOf(byTestId(app, 'journal-page-of')!)).toBe('Страница 2 из 2');
    expect(hasTestId(app, 'journal-more-error')).toBe(false);
  });
});
