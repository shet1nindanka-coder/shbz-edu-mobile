// Regressions of the planner, groups, calls and statistics areas (bug-hunt round 2), driven through the UI
// on the real mock server.
import { describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

import { byTestId, fill, hasTestId, tap, visibleText, visit, wait } from './support/drive';
import type { AppHandle } from './support/launch';
import { flattenStyle, type HostNode } from './support/tree';

const ANNA = 'teacher@example.com';
const DEV = 'dev@example.com';

function isDisabled(node: HostNode | null): boolean {
  const state = node?.props.accessibilityState as { disabled?: boolean } | undefined;
  return Boolean(state?.disabled ?? node?.props.disabled);
}

/** Fails the next call(s) of one API method like the demo screen's "arm a failure". */
function arm(app: AppHandle, method: string, error: 'rateLimited' | 'notFound' | 'serviceUnavailable', times = 1): void {
  app.mock.controls.set('forceNextError', { method, error, times });
}

async function call<T>(app: AppHandle, request: () => Promise<T>): Promise<T> {
  const pending = request();
  await app.advance(1500);
  return pending;
}

const waitLines = (app: AppHandle) => (visibleText(app).match(/Повторить можно через/g) ?? []).length;

describe('group rename answered 404 (#104)', () => {
  it('leaves the deleted group for the list, which says the group is gone', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups' });
    await tap(app, '#group-open-grp_empty');
    expect(app.path()).toContain('/teacher/groups/grp_empty');
    await tap(app, '#group-menu');
    await tap(app, '#group-menu-rename');
    await app.settle();
    expect(await fill(app, '#group-rename-name', 'Новое имя')).toBe(true);
    const rename = jest.spyOn(app.runtime.api.groups, 'renameGroup');
    arm(app, 'groups.renameGroup', 'notFound');
    await tap(app, '#group-rename-submit');
    await app.settle();
    expect(rename).toHaveBeenCalledTimes(1);
    expect(app.path()).toBe('/teacher/groups');
    expect(hasTestId(app, 'group-rename-sheet')).toBe(false);
    expect(byTestId(app, 'groups-notice')).not.toBeNull();
    expect(visibleText(app)).toContain('Группа не найдена — возможно, её уже удалили.');
  });
});

describe('a cool-down keeps its reason on screen for as long as the control is locked (#105)', () => {
  it('lesson board: a refused result mark explains the locked result buttons of every student', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live' });
    const board = await call(app, () => app.mock.planner.getLessonBoard('les_live'));
    const [first, second] = board.participants.filter((participant) => participant.items.length > 0);
    expect(first && second).toBeTruthy();
    // One student's numbers are open at a time (a sheet); the result buttons are those of the picked tile.
    await tap(app, `#lesson-participant-toggle-${first.id}`);
    await tap(app, `#lesson-tile-${first.items[0].id}`);
    expect(hasTestId(app, `lesson-result-wait-${first.id}`)).toBe(false);

    arm(app, 'planner.setItemResult', 'rateLimited');
    const group = app.screen.getByTestId(`lesson-item-result-${first.items[0].id}`);
    const option = app.rntl.within(group).getAllByRole('radio')[0];
    await app.rntl.fireEvent.press(option);
    await app.settle();

    // The open student's buttons are locked and say until when — no notice is involved at all.
    expect(hasTestId(app, `lesson-result-wait-${first.id}`)).toBe(true);
    expect(isDisabled(app.rntl.within(group).getAllByRole('radio')[0])).toBe(true);
    expect(hasTestId(app, 'lesson-sheet-notice')).toBe(false);
    expect(waitLines(app)).toBe(1);

    // The lock is the board's: the next student's sheet has the same locked buttons and the same reason.
    await tap(app, 'button:Закрыть');
    await app.settle();
    await tap(app, `#lesson-participant-toggle-${second.id}`);
    await tap(app, `#lesson-tile-${second.items[0].id}`);
    expect(hasTestId(app, `lesson-result-wait-${second.id}`)).toBe(true);
    expect(isDisabled(app.rntl.within(app.screen.getByTestId(`lesson-item-result-${second.items[0].id}`)).getAllByRole('radio')[0])).toBe(true);
    expect(waitLines(app)).toBe(1);
    // The header line is for the plan, set and lesson buckets: the result wait is not repeated there.
    expect(hasTestId(app, 'lesson-wait')).toBe(false);
    expect(hasTestId(app, 'lesson-notice')).toBe(false);

    await wait(app, 61_000, 'lesson board: after the wait');
    expect(hasTestId(app, `lesson-result-wait-${second.id}`)).toBe(false);
  });

  it('lesson board: dismissing the error notice keeps the countdown of the locked lesson actions', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live' });
    arm(app, 'planner.deleteLesson', 'rateLimited');
    await tap(app, '#lesson-board-menu');
    await app.settle();
    await tap(app, '#lesson-board-actions-delete');
    await app.settle();
    await tap(app, 'button:Да, удалить');
    await app.settle();
    expect(hasTestId(app, 'lesson-notice')).toBe(true);
    expect(hasTestId(app, 'lesson-wait')).toBe(true);
    expect(waitLines(app)).toBe(1);
    const dismiss = app.rntl.within(app.screen.getByTestId('lesson-notice')).getAllByRole('button')[0];
    await app.rntl.fireEvent.press(dismiss);
    await app.settle();
    expect(hasTestId(app, 'lesson-notice')).toBe(false);
    expect(hasTestId(app, 'lesson-wait')).toBe(true);
  });

  it('record call: a sheet opened for another student explains why «Сохранить» is locked', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/calls' });
    const records = () => app.screen.queryAllByTestId(/^call-record-usr_/);
    expect(records().length).toBeGreaterThan(1);
    await app.rntl.fireEvent.press(records()[0]);
    await app.settle();
    arm(app, 'groups.recordParentCall', 'rateLimited');
    await tap(app, '#call-record-save');
    await app.settle();
    expect(hasTestId(app, 'call-record-error')).toBe(true);
    expect(hasTestId(app, 'call-record-wait')).toBe(true);
    expect(waitLines(app)).toBe(1);

    await tap(app, 'button:Закрыть');
    await app.settle();
    await app.rntl.fireEvent.press(records()[1]);
    await app.settle();
    expect(hasTestId(app, 'call-record-error')).toBe(false);
    expect(isDisabled(byTestId(app, 'call-record-save'))).toBe(true);
    expect(hasTestId(app, 'call-record-wait')).toBe(true);
  });
});

describe('statistics: a failed timeline filter change (#107, #108)', () => {
  it('keeps the page and the picker, goes back to the filter that loaded and says why', async () => {
    const app = await visit({ as: DEV, url: '/developer/statistics' });
    expect(hasTestId(app, 'stats-timeline-student')).toBe(true);
    // The query retries once on its own: both reads fail.
    arm(app, 'groups.getStatisticsProgress', 'serviceUnavailable', 3);
    await tap(app, '#stats-timeline-student');
    await app.settle();
    const options = app.screen.queryAllByTestId(/^stats-timeline-student-option-usr_/);
    expect(options.length).toBeGreaterThan(0);
    await app.rntl.fireEvent.press(options[0]);
    await app.settle(20_000);

    expect(hasTestId(app, 'stats-error')).toBe(false);
    expect(hasTestId(app, 'stats-timeline-student')).toBe(true);
    expect(hasTestId(app, 'stats-filter-error')).toBe(true);
    expect(visibleText(app)).toContain('Сервис временно недоступен');

    // The filter can be picked again and loads once the server answers.
    const progress = jest.spyOn(app.runtime.api.groups, 'getStatisticsProgress');
    await tap(app, '#stats-timeline-student');
    await app.settle();
    const again = app.screen.queryAllByTestId(/^stats-timeline-student-option-usr_/);
    await app.rntl.fireEvent.press(again[0]);
    await app.settle();
    expect(progress).toHaveBeenCalled();
    expect(hasTestId(app, 'stats-filter-error')).toBe(false);
  });
});

describe('add-a-problem sheets on an empty topic (#110)', () => {
  it('the lesson board says the topic has no problems, not that they are all in the set', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_d2' });
    const add = app.screen.queryAllByTestId(/^lesson-participant-add-/)[0];
    expect(add).toBeDefined();
    await app.rntl.fireEvent.press(add);
    await app.settle();
    await tap(app, '#lesson-add-topic');
    await app.settle();
    await tap(app, 'menuitem:Тригонометрия (в разработке)');
    await app.settle();
    // Two different reasons for an empty number picker keep two different (short) lines.
    const text = visibleText(app);
    expect(text).toContain('В теме нет номеров');
    expect(text).not.toContain('Все номера уже в наборе');
  });
});

/** A tablet window: the lessons list shows the tapped lesson, with its actions, in the panel next to it. */
const asTablet = () => {
  const { Dimensions } = require('react-native') as typeof import('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
  const window = { width: 1024, height: 768, scale: 2, fontScale: 1 };
  Dimensions.set({ window, screen: window });
};

describe('deleting a lesson from the list (#117)', () => {
  // A phone list has no row actions any more (the delete lives on the board); a tablet keeps the delete
  // next to the list, in the panel of the selected lesson.
  it('refreshes the group attendance table and statistics, like the board delete', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons', arrange: asTablet });
    const invalidate = jest.spyOn(app.queryClient, 'invalidateQueries');
    const remove = jest.spyOn(app.runtime.api.planner, 'deleteLesson');
    const row = app.screen.queryAllByTestId(/^lesson-open-/)[0];
    expect(row).toBeDefined();
    await app.rntl.fireEvent.press(row);
    await app.settle();
    await tap(app, '#lesson-detail-delete');
    await app.settle();
    await tap(app, 'button:Да, удалить');
    await app.settle();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(app.path()).toBe('/teacher/lessons');
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify((filters as { queryKey?: unknown } | undefined)?.queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(['groups', 'getGroupAttendance']), JSON.stringify(['groups', 'getGroupStatistics'])]));
  });
});

describe('homework-draft "add a problem" (#121)', () => {
  it('offers the free numbers through a virtualised grid and adds the picked one', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/homework-plans' });
    const plans = await call(app, () => app.mock.planner.listHomeworkPlans());
    const plan = plans[0];
    expect(plan).toBeDefined();
    await app.open(`/teacher/homework-plans/${plan.id}`);
    const toggle = app.screen.queryAllByTestId(/^draft-participant-toggle-/)[0];
    if (toggle && app.screen.queryAllByTestId(/^draft-participant-add-/).length === 0) {
      await app.rntl.fireEvent.press(toggle);
      await app.settle();
    }
    const add = app.screen.queryAllByTestId(/^draft-participant-add-/)[0];
    expect(add).toBeDefined();
    await app.rntl.fireEvent.press(add);
    await app.settle();
    expect(hasTestId(app, 'draft-add-numbers')).toBe(true);
    const tiles = app.screen.queryAllByTestId(/^draft-add-number-/);
    if (tiles.length === 0) {
      expect(hasTestId(app, 'draft-add-none')).toBe(true);
      return;
    }
    await app.rntl.fireEvent.press(tiles[0]);
    expect(isDisabled(byTestId(app, 'draft-add-submit'))).toBe(false);
  });
});

/**
 * A list that owns its scrolling inside a `scroll={false}` sheet must give way in a short window: every box
 * between the sheet and the list may shrink, and the list's own box may shrink below its preferred height
 * (otherwise the last rows end up under the pinned footer and cannot be reached). The harness has no layout
 * engine, so the flex chain itself is checked.
 */
function expectListGivesWay(app: AppHandle, sheetTestID: string, listTestID: string, boxRole: string): void {
  const list = byTestId(app, listTestID);
  expect(list).not.toBeNull();
  let box: HostNode | null = list;
  while (box && box.props.accessibilityRole !== boxRole) box = box.parent;
  expect(box).not.toBeNull();
  const boxStyle = flattenStyle(box?.props.style);
  expect(typeof boxStyle.height).toBe('number');
  expect(boxStyle.flexShrink).toBe(1);
  expect(Number(boxStyle.minHeight)).toBeLessThan(Number(boxStyle.height));
  const stiff: string[] = [];
  for (let node = box?.parent ?? null; node && node.props.testID !== sheetTestID; node = node.parent) {
    const style = flattenStyle(node.props.style);
    if (!(Number(style.flexShrink) >= 1 || Number(style.flex) >= 1)) stiff.push(`${node.type} ${JSON.stringify(style)}`);
  }
  expect(stiff).toEqual([]);
}

describe('homework-draft "add a problem" in a short window (#121 review)', () => {
  it('lets the number grid shrink so its last tiles stay above the footer', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/homework-plans/hp_stale' });
    const toggle = app.screen.queryAllByTestId(/^draft-participant-toggle-/)[0];
    if (toggle && app.screen.queryAllByTestId(/^draft-participant-add-/).length === 0) {
      await app.rntl.fireEvent.press(toggle);
      await app.settle();
    }
    const add = app.screen.queryAllByTestId(/^draft-participant-add-/)[0];
    expect(add).toBeDefined();
    await app.rntl.fireEvent.press(add);
    await app.settle();
    expect(app.screen.queryAllByTestId(/^draft-add-number-/).length).toBeGreaterThan(0);
    expectListGivesWay(app, 'draft-add-sheet', 'draft-add-numbers', 'radiogroup');
  });

  it('does the same for the broadcast recipients checklist', async () => {
    const app = await visit({ as: DEV, url: '/developer/panel' });
    await tap(app, 'Рассылка');
    await tap(app, 'Выбранным');
    await tap(app, '#broadcast-pick');
    await app.settle();
    expectListGivesWay(app, 'recipients-sheet', 'recipients-list', 'list');
  });
});

describe('create group: «Далее» on the name (#130)', () => {
  it('moves the focus to the grade field instead of closing the keyboard', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups' });
    await tap(app, '#groups-create');
    await app.settle();
    const name = app.screen.getByTestId('group-create-name');
    expect(name.props.submitBehavior).toBe('submit');
    expect(typeof name.props.onSubmitEditing).toBe('function');
  });
});

describe('new lesson: the back gesture on the form picked from the chooser (#135)', () => {
  it('turns the iOS swipe off while the form is open and back on at the chooser', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons' });
    await app.open('/teacher/lessons/new');
    // Screens of the root stack have the gesture off by design: count, and compare with the chooser.
    const gestureOffCount = () => {
      const nodes: HostNode[] = [];
      const walkTree = (node: HostNode) => {
        if (node.props && node.props.gestureEnabled === false) nodes.push(node);
        for (const child of node.children ?? []) if (typeof child !== 'string') walkTree(child);
      };
      walkTree(app.screen.container as unknown as HostNode);
      return nodes.length;
    };
    const atChooser = gestureOffCount();
    await tap(app, '#lesson-target-group-grp_8a');
    expect(hasTestId(app, 'lesson-new-ai-form')).toBe(true);
    // Android has no swipe-back: the native stack keeps the gesture off on every screen there.
    if (Platform.OS === 'ios') expect(gestureOffCount()).toBe(atChooser + 1);
    // The app bar arrow goes back to the chooser, inside the same route.
    await tap(app, '#lesson-new-app-bar-back');
    expect(app.path()).toBe('/teacher/lessons/new');
    expect(hasTestId(app, 'lesson-targets-list')).toBe(true);
    expect(gestureOffCount()).toBe(atChooser);
  });
});
