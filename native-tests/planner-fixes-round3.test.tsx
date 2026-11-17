// Regressions of the planner, groups, calls and statistics areas (bug-hunt round 3), driven through the UI
// on the real mock server.
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, fill, hasTestId, locate, tap, visibleText, visit } from './support/drive';
import type { AppHandle } from './support/launch';
import { all, flattenStyle, type HostNode } from './support/tree';

const ANNA = 'teacher@example.com';
const DEV = 'dev@example.com';

function arm(app: AppHandle, method: string, error: 'rateLimited' | 'notFound' | 'serviceUnavailable', times = 1): void {
  app.mock.controls.set('forceNextError', { method, error, times });
}

async function call<T>(app: AppHandle, request: () => Promise<T>): Promise<T> {
  const pending = request();
  await app.advance(3000);
  return pending;
}

function labelOf(app: AppHandle, testID: string): string {
  const node = byTestId(app, testID);
  expect(node).toBeTruthy();
  return String(node?.props.accessibilityLabel ?? '');
}

/** Whether `node` sits inside another element that a screen reader treats as one (a pressable with a role). */
function nestedInAccessible(app: AppHandle, testID: string): boolean {
  let nested = false;
  const visitNode = (node: HostNode, ancestors: HostNode[]) => {
    if (node.props.testID === testID) {
      nested = ancestors.some((ancestor) => ancestor.props.accessible === true || (ancestor.props.accessibilityRole === 'button' && ancestor.props.accessible !== false));
      return;
    }
    for (const child of node.children) if (typeof child !== 'string') visitNode(child, [...ancestors, node]);
  };
  visitNode(app.screen.container as unknown as HostNode, []);
  return nested;
}

const withFontScale = (fontScale: number) => () => {
  const { Dimensions } = require('react-native') as typeof import('react-native');
  const window = { width: 390, height: 844, scale: 3, fontScale };
  Dimensions.set({ window, screen: window });
};

describe('group delete answered 404 (#202)', () => {
  it('leaves the deleted group for the list, which says the group is gone', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups' });
    await tap(app, '#group-open-grp_empty');
    expect(app.path()).toContain('/teacher/groups/grp_empty');
    await tap(app, '#group-menu');
    await tap(app, '#group-menu-delete');
    await app.settle();
    arm(app, 'groups.deleteGroup', 'notFound');
    await tap(app, 'button:Да, удалить');
    await app.settle();
    expect(app.path()).toBe('/teacher/groups');
    expect(hasTestId(app, 'not-found')).toBe(false);
    expect(visibleText(app)).toContain('Группа не найдена — возможно, её уже удалили.');
  });
});

describe('new lesson: a picked target that answers 404 (#203)', () => {
  it('keeps the app bar whose back returns to the chooser', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/new' });
    expect(hasTestId(app, 'lesson-target-group-grp_8a')).toBe(true);
    arm(app, 'planner.getLessonNewForm', 'notFound', 3);
    await tap(app, '#lesson-target-group-grp_8a');
    await app.settle();
    expect(hasTestId(app, 'lesson-new-not-found')).toBe(true);
    const bar = app.screen.getByTestId('lesson-new-app-bar');
    const back = app.rntl.within(bar).getAllByRole('button')[0];
    await app.rntl.fireEvent.press(back);
    await app.settle();
    expect(hasTestId(app, 'lesson-new-not-found')).toBe(false);
    expect(hasTestId(app, 'lesson-target-group-grp_8a')).toBe(true);
  });

});

/** The PDF itself is built by the mock's file layer, which the harness does not run: the report arrives after `ms`. */
function fakeReport(app: AppHandle, ms: number) {
  return jest.spyOn(app.runtime.api.groups, 'downloadGroupAttendancePdf').mockImplementation(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ uri: 'file:///cache/report.pdf', fileName: 'Посещаемость — 8А — алгебра — Неделя — 2026-11-17.pdf' }), ms);
      }),
  );
}

describe('group reports (#215, #225, #244)', () => {
  it('a report that finishes while the teacher is elsewhere is kept, not opened over the other tab', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups/grp_8a' });
    await tap(app, 'tab:Посещаемость');
    await app.settle();
    fakeReport(app, 2500);
    await app.rntl.fireEvent.press(app.screen.getByTestId('group-attendance-pdf-7d'));
    await app.advance(200);
    await app.rntl.act(async () => {
      app.router.navigate('/teacher/calls' as never);
    });
    await app.settle();
    await app.advance(3000);
    expect(app.path()).toContain('/teacher/calls');

    await app.open('/teacher/groups/grp_8a');
    expect(app.path()).toContain('/teacher/groups/grp_8a');
    expect(hasTestId(app, 'group-attendance-report-error-ready')).toBe(true);
    expect(visibleText(app)).toContain('Отчёт готов: Посещаемость: 7 дней');
    await tap(app, '#group-attendance-report-error-ready-open');
    await app.settle();
    expect(app.path()).toContain('file-viewer');
    expect(visibleText(app)).toContain('Посещаемость: 7 дней');
  });

  it('opens at once while the teacher stays, titled in the interface language', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups/grp_8a', locale: 'en' });
    await tap(app, 'tab:Attendance');
    await app.settle();
    fakeReport(app, 500);
    await app.rntl.fireEvent.press(app.screen.getByTestId('group-attendance-pdf-30d'));
    await app.advance(600);
    await app.settle();
    expect(app.path()).toContain('file-viewer');
    expect(visibleText(app)).toContain('Attendance: 30 days');
  });
});

describe('plan completion refreshes the lessons list (#220)', () => {
  it('the board tells the list when the plans of a new lesson are ready', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/new?groupId=grp_8a' });
    await fill(app, '#lesson-new-title', 'STALETEST');
    const invalidate = jest.spyOn(app.queryClient, 'invalidateQueries');
    await app.rntl.fireEvent.press(app.screen.getByTestId('lesson-new-submit'));
    await app.advance(3000);
    expect(app.path()).toMatch(/\/teacher\/lessons\/les_/);
    invalidate.mockClear();
    for (let second = 0; second < 40; second += 1) await app.advance(1000);
    await app.settle();
    expect(hasTestId(app, 'lesson-ready-of')).toBe(false);
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify((filters as { queryKey?: unknown } | undefined)?.queryKey));
    expect(keys).toContain(JSON.stringify(['planner', 'listLessons']));
    expect(keys).toContain(JSON.stringify(['teacherStudents']));
  });
});

describe('statistics views (#221)', () => {
  it('switching back to a visited view re-reads its numbers, as the site renders each view anew', async () => {
    const app = await visit({ as: DEV, url: '/developer/statistics' });
    await tap(app, 'tab:По учителям');
    await app.settle();
    await tap(app, 'tab:Прогресс учеников');
    await app.settle();
    const teachers = jest.spyOn(app.runtime.api.groups, 'getStatisticsTeachers');
    await tap(app, 'tab:По учителям');
    await app.settle();
    expect(teachers).toHaveBeenCalledTimes(1);
  });
});

describe('lesson board: an optimistic result mark is not switched off by an older read (#222)', () => {
  it('the second mark stays lit while its request is in flight', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live' });
    const board = await call(app, () => app.mock.planner.getLessonBoard('les_live'));
    const participant = board.participants.find((row) => row.items.length > 1 && row.items[0].result === null && row.items[1].result === null);
    expect(participant).toBeDefined();
    if (!participant) return;
    await tap(app, `#lesson-participant-toggle-${participant.id}`);
    app.mock.controls.set('latency', { minMs: 400, maxMs: 400 });
    const radios = (itemId: string) => app.rntl.within(app.screen.getByTestId(`lesson-item-result-${itemId}`)).getAllByRole('radio');
    const selected = (itemId: string) => radios(itemId).some((radio) => (radio.props.accessibilityState as { checked?: boolean } | undefined)?.checked === true);
    const [first, second] = participant.items;
    await app.rntl.fireEvent.press(radios(first.id)[0]);
    await app.settle();
    // A board read that left before the second mark (the realtime refresh of the first one, the live poll)
    // answers with the server state before that write.
    await app.rntl.act(async () => {
      void app.queryClient.invalidateQueries({ queryKey: ['planner', 'getLessonBoard', 'les_live'] });
    });
    await app.advance(100);
    await app.rntl.fireEvent.press(radios(second.id)[0]);
    await app.advance(10);
    for (let step = 0; step < 60; step += 1) {
      expect(selected(second.id)).toBe(true);
      await app.advance(50);
    }
    await app.settle();
    expect(selected(second.id)).toBe(true);
  });
});

describe('group AI profile: a refused speed save followed by a saved one (#223)', () => {
  it('shows and keeps the speed the server holds', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups/grp_8a' });
    await tap(app, '#member-ai-toggle-usr_artem');
    const speedOf = () => String((byTestId(app, 'member-speed-usr_artem')?.props.accessibilityValue as { text?: string } | undefined)?.text ?? '');
    expect(speedOf()).toBe('8 из 10');
    app.mock.controls.set('latency', { minMs: 2500, maxMs: 2500 });
    arm(app, 'groups.setStudentAiProfile', 'serviceUnavailable');
    await app.rntl.fireEvent.press(app.screen.getByTestId('member-speed-usr_artem'));
    await app.advance(300);
    const option = locate(app, 'menuitem:7 из 10');
    expect(option).toBeTruthy();
    await app.rntl.fireEvent.press(option as never);
    await app.advance(300);
    const note = app.screen.getByTestId('member-note-usr_artem');
    await app.rntl.fireEvent(note, 'focus', { nativeEvent: {} });
    await app.rntl.fireEvent.changeText(note, 'Новая заметка');
    await app.rntl.fireEvent(note, 'blur', { nativeEvent: {} });
    await app.settle(20_000);

    const stored = async () => (await call(app, () => app.mock.groups.getGroup('grp_8a'))).group.members.find((row) => row.id === 'usr_artem');
    expect((await stored())?.speed).toBe(7);
    expect(speedOf()).toBe('7 из 10');
    expect(hasTestId(app, 'member-ai-error-usr_artem')).toBe(false);

    app.mock.controls.set('latency', { minMs: 0, maxMs: 0 });
    await fill(app, '#member-note-usr_artem', 'Вторая заметка');
    await app.settle();
    expect((await stored())?.speed).toBe(7);
    expect((await stored())?.aiNote).toBe('Вторая заметка');
  });

  it('a refusal of the latest save goes back to the speed the server confirmed', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups/grp_8a' });
    await tap(app, '#member-ai-toggle-usr_artem');
    arm(app, 'groups.setStudentAiProfile', 'serviceUnavailable');
    await tap(app, '#member-speed-usr_artem');
    await tap(app, 'menuitem:5 из 10');
    await app.settle();
    const speed = String((byTestId(app, 'member-speed-usr_artem')?.props.accessibilityValue as { text?: string } | undefined)?.text ?? '');
    expect(speed).toBe('8 из 10');
    expect(hasTestId(app, 'member-ai-error-usr_artem')).toBe(true);
  });
});

describe('screen readers reach the planner cards and hear their signals (#236)', () => {
  it('lesson list: the «⋯» is its own control and the status chips are spoken', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons' });
    const mores = app.screen.queryAllByTestId(/^lesson-more-/);
    expect(mores.length).toBeGreaterThan(0);
    for (const more of mores) expect(nestedInAccessible(app, String(more.props.testID))).toBe(false);
    const label = labelOf(app, 'lesson-open-les_ai_off');
    expect(label).toContain('Запланирован');
    expect(label).toMatch(/ошибок: \d/);
  });

  it('live board: the participant header speaks submitted, idle and presence', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live' });
    const label = labelOf(app, 'lesson-participant-toggle-lp_les_live_kirill');
    expect(label).toContain('сдано');
    expect(label).toMatch(/ещё не открыл урок|в классе с/);
  });

  it('drafts: the card and a failed participant speak their chips', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/homework-plans' });
    const cards = all(app.screen.container as unknown as HostNode, (node) => typeof node.props.testID === 'string' && /^draft-card-/.test(node.props.testID));
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(String(card.props.accessibilityLabel)).toMatch(/выдано \d+ из \d+/);
  });
});

describe('parent-call rows at a large text size (#240)', () => {
  it('the reminder chip moves under a long name instead of cutting it', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/calls', arrange: withFontScale(1.3) });
    const heads = all(app.screen.container as unknown as HostNode, (node) => typeof node.props.testID === 'string' && /^call-row-head-/.test(node.props.testID));
    expect(heads.length).toBeGreaterThan(0);
    for (const head of heads) expect(flattenStyle(head.props.style).flexWrap).toBe('wrap');
  });

  it('keeps the one-line head at the default size', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/calls', arrange: withFontScale(1) });
    const head = all(app.screen.container as unknown as HostNode, (node) => typeof node.props.testID === 'string' && /^call-row-head-/.test(node.props.testID))[0];
    expect(head).toBeDefined();
    expect(flattenStyle(head?.props.style).flexWrap).toBeUndefined();
  });
});
