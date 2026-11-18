// Regressions of the planner, groups, calls and statistics areas (bug-hunt round 4), driven through the UI
// on the real mock server.
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, hasTestId, tap, visibleText, visit } from './support/drive';
import type { AppHandle } from './support/launch';
import { all, textOf as textOfNode, type HostNode } from './support/tree';

const ANNA = 'teacher@example.com';
const OLD_NOTE = 'Быстро считает, но пропускает проверку ОДЗ.';
const NEW_NOTE = 'НОВАЯ заметка учителя';
const REFUSED = 'Сервис временно недоступен. Попробуйте снова позже.';

function arm(app: AppHandle, method: string, error: 'rateLimited' | 'notFound' | 'serviceUnavailable', times = 1): void {
  app.mock.controls.set('forceNextError', { method, error, times });
}

async function call<T>(app: AppHandle, request: () => Promise<T>): Promise<T> {
  const pending = request();
  await app.advance(3000);
  return pending;
}

async function storedArtem(app: AppHandle) {
  return (await call(app, () => app.mock.groups.getGroup('grp_8a'))).group.members.find((row) => row.id === 'usr_artem');
}

const speedOf = (app: AppHandle) =>
  String((byTestId(app, 'member-speed-usr_artem')?.props.accessibilityValue as { text?: string } | undefined)?.text ?? '');
const noteOf = (app: AppHandle) => String(byTestId(app, 'member-note-usr_artem')?.props.value ?? '');
const occurrences = (text: string, part: string) => text.split(part).length - 1;

/** Opens grp_8a with Artem's editor open and a slow server. */
async function openEditor(): Promise<AppHandle> {
  const app = await visit({ as: ANNA, url: '/teacher/groups/grp_8a' });
  await tap(app, '#member-ai-toggle-usr_artem');
  expect(noteOf(app)).toBe(OLD_NOTE);
  app.mock.controls.set('latency', { minMs: 2500, maxMs: 2500 });
  return app;
}

/** Types a note and presses «Done» (the native commit), without waiting for the request. */
async function typeAndCommit(app: AppHandle, text: string): Promise<void> {
  const field = app.screen.getByTestId('member-note-usr_artem');
  await app.rntl.fireEvent(field, 'focus', { nativeEvent: {} });
  await app.rntl.fireEvent.changeText(field, text);
  await app.rntl.fireEvent(field, 'submitEditing', { nativeEvent: { text } });
  await app.advance(100);
}

async function toggle(app: AppHandle): Promise<void> {
  await app.rntl.fireEvent.press(app.screen.getByTestId('member-ai-toggle-usr_artem'));
  await app.advance(100);
}

async function pickSpeed(app: AppHandle, label: string): Promise<void> {
  await app.rntl.fireEvent.press(app.screen.getByTestId('member-speed-usr_artem'));
  await app.advance(300);
  await app.rntl.fireEvent.press(app.screen.getByRole('menuitem', { name: label }));
  await app.advance(100);
}

describe('group AI profile: a save still running when the editor folds (#326)', () => {
  it('a refused note is reported on the screen once, and the folded card shows what the server holds', async () => {
    const app = await openEditor();
    arm(app, 'groups.setStudentAiProfile', 'serviceUnavailable');
    await typeAndCommit(app, NEW_NOTE);
    await toggle(app);
    expect(hasTestId(app, 'member-note-usr_artem')).toBe(false);
    await app.settle(20_000);

    expect((await storedArtem(app))?.aiNote).toBe(OLD_NOTE);
    const text = visibleText(app);
    expect(occurrences(text, REFUSED)).toBe(1);
    expect(text).toContain(OLD_NOTE);
    expect(text).not.toContain(NEW_NOTE);
  });

  it('a refused speed pick is reported on the screen and the reopened select shows the stored speed', async () => {
    const app = await openEditor();
    expect(speedOf(app)).toBe('8 из 10');
    arm(app, 'groups.setStudentAiProfile', 'serviceUnavailable');
    await pickSpeed(app, '5 из 10');
    await toggle(app);
    await app.settle(20_000);

    expect((await storedArtem(app))?.speed).toBe(8);
    expect(occurrences(visibleText(app), REFUSED)).toBe(1);
    await toggle(app);
    expect(speedOf(app)).toBe('8 из 10');
  });

  it('a saved note folds into the card without a message', async () => {
    const app = await openEditor();
    await typeAndCommit(app, NEW_NOTE);
    await toggle(app);
    await app.settle(20_000);
    expect((await storedArtem(app))?.aiNote).toBe(NEW_NOTE);
    expect(visibleText(app)).toContain(NEW_NOTE);
    expect(visibleText(app)).not.toContain(REFUSED);
  });

  it('a refusal while the editor stays open is shown in the editor only', async () => {
    const app = await openEditor();
    arm(app, 'groups.setStudentAiProfile', 'serviceUnavailable');
    await typeAndCommit(app, NEW_NOTE);
    await app.settle(20_000);
    expect(hasTestId(app, 'member-ai-error-usr_artem')).toBe(true);
    expect(occurrences(visibleText(app), REFUSED)).toBe(1);
    // The typed note stays for another try.
    expect(noteOf(app)).toBe(NEW_NOTE);
  });
});

describe('group AI profile: the editor reopened while a save runs (#327)', () => {
  it('starts from the note being sent, and a later speed pick keeps it', async () => {
    const app = await openEditor();
    await typeAndCommit(app, NEW_NOTE);
    await toggle(app);
    await toggle(app);
    expect(noteOf(app)).toBe(NEW_NOTE);
    await app.settle(20_000);
    expect(noteOf(app)).toBe(NEW_NOTE);
    expect((await storedArtem(app))?.aiNote).toBe(NEW_NOTE);

    app.mock.controls.set('latency', { minMs: 0, maxMs: 0 });
    await pickSpeed(app, '6 из 10');
    await app.settle();
    const stored = await storedArtem(app);
    expect(stored?.speed).toBe(6);
    expect(stored?.aiNote).toBe(NEW_NOTE);
  });

  it('when that save is refused: one message, and the reopened editor goes back to the stored note', async () => {
    const app = await openEditor();
    arm(app, 'groups.setStudentAiProfile', 'serviceUnavailable');
    await typeAndCommit(app, NEW_NOTE);
    await toggle(app);
    await toggle(app);
    expect(noteOf(app)).toBe(NEW_NOTE);
    await app.settle(20_000);

    expect((await storedArtem(app))?.aiNote).toBe(OLD_NOTE);
    expect(occurrences(visibleText(app), REFUSED)).toBe(1);
    expect(noteOf(app)).toBe(OLD_NOTE);

    app.mock.controls.set('latency', { minMs: 0, maxMs: 0 });
    await pickSpeed(app, '6 из 10');
    await app.settle();
    const stored = await storedArtem(app);
    expect(stored?.speed).toBe(6);
    expect(stored?.aiNote).toBe(OLD_NOTE);
  });

  it('a note typed in the reopened editor is not replaced when the earlier save lands', async () => {
    const app = await openEditor();
    await typeAndCommit(app, NEW_NOTE);
    await toggle(app);
    await toggle(app);
    const field = app.screen.getByTestId('member-note-usr_artem');
    await app.rntl.fireEvent(field, 'focus', { nativeEvent: {} });
    await app.rntl.fireEvent.changeText(field, 'Третья заметка');
    await app.advance(3000);
    expect(noteOf(app)).toBe('Третья заметка');
    await app.rntl.fireEvent(field, 'blur', { nativeEvent: {} });
    await app.settle(20_000);
    expect((await storedArtem(app))?.aiNote).toBe('Третья заметка');
    expect(noteOf(app)).toBe('Третья заметка');
  });
});

describe('group AI profile: a group read in flight when a save starts (#327, review)', () => {
  it('an editor reopened before the save lands starts from the note being sent, not from the older read', async () => {
    const app = await openEditor();
    arm(app, 'groups.setStudentAiProfile', 'serviceUnavailable');
    await typeAndCommit(app, NEW_NOTE);
    // The refusal re-reads the group: that read is in flight when the next save starts.
    await app.advance(2600);
    expect(hasTestId(app, 'member-ai-error-usr_artem')).toBe(true);
    expect(noteOf(app)).toBe(NEW_NOTE);
    await pickSpeed(app, '5 из 10');
    // The older read would have landed by now; the save has not.
    await app.advance(2000);
    await toggle(app);
    await toggle(app);
    expect(noteOf(app)).toBe(NEW_NOTE);
    expect(speedOf(app)).toBe('5 из 10');
    await pickSpeed(app, '6 из 10');
    await app.settle(20_000);
    const stored = await storedArtem(app);
    expect(stored?.speed).toBe(6);
    expect(stored?.aiNote).toBe(NEW_NOTE);
    expect(noteOf(app)).toBe(NEW_NOTE);
  });
});

describe('lesson board «add a problem»: a bank refetch that reorders the topics (#318, review)', () => {
  it('keeps the shown topic and the picked number', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_d2' });
    const add = app.screen.queryAllByTestId(/^lesson-participant-add-/)[0];
    expect(add).toBeDefined();
    await app.rntl.fireEvent.press(add);
    await app.settle();
    const { qk } = require('@/api') as typeof import('@/api'); // eslint-disable-line @typescript-eslint/no-require-imports
    type Bank = { topics: { topicId: string; topicTitle: string }[] };
    const key = qk('planner', 'getNumberBank');
    const bank = app.queryClient.getQueryData<Bank>(key);
    expect(bank && bank.topics.length > 1).toBe(true);
    const first = bank!.topics[0];
    const topicSelect = () => String((byTestId(app, 'lesson-add-topic')?.props.accessibilityValue as { text?: string } | undefined)?.text ?? '');
    const numberSelect = () => String((byTestId(app, 'lesson-add-number')?.props.accessibilityValue as { text?: string } | undefined)?.text ?? '');
    expect(topicSelect()).toBe(first.topicTitle);
    await tap(app, '#lesson-add-number');
    await app.settle();
    const option = app.screen.getAllByRole('menuitem')[0];
    const label = String(option.props.accessibilityLabel ?? textOfNode(option));
    await app.rntl.fireEvent.press(option);
    await app.settle();
    const pickedBefore = numberSelect();
    expect(pickedBefore).not.toBe('');
    expect(label).toContain(pickedBefore);

    // Another topic moved to the top: the next answer has a different order.
    await app.rntl.act(async () => {
      app.queryClient.setQueryData<Bank>(key, (current) => (current ? { ...current, topics: [...current.topics].reverse() } : current));
    });
    await app.settle();
    expect(topicSelect()).toBe(first.topicTitle);
    expect(numberSelect()).toBe(pickedBefore);
  });
});

describe('statistics «Срез по теме и ученику»: the pair is kept by id (#319)', () => {
  const DEV = 'dev@example.com';
  const shown = (app: AppHandle, testID: string) => {
    const node = byTestId(app, testID);
    expect(node).toBeTruthy();
    const value = (node?.props.accessibilityValue as { text?: string } | undefined)?.text;
    return String(value ?? node?.props.accessibilityLabel ?? '');
  };

  it('a refetch that moves another topic to the top does not change the slice', async () => {
    const app = await visit({ as: DEV, url: '/developer/statistics' });
    await app.settle();
    const topicBefore = shown(app, 'stats-drilldown-topic');
    const studentBefore = shown(app, 'stats-drilldown-student');
    const topics = await call(app, () => app.mock.content.listTopics());
    expect(topicBefore).toContain(topics[0].title);
    const order = topics.map((topic) => topic.id);
    await call(app, () => app.mock.content.reorderTopics([order[1], order[0], ...order.slice(2)]));
    void app.queryClient.invalidateQueries();
    await app.settle();
    expect(shown(app, 'stats-drilldown-topic')).toBe(topicBefore);
    expect(shown(app, 'stats-drilldown-student')).toBe(studentBefore);
  });
});

describe('calls tab: the same parent-call notification opened again (#343)', () => {
  const go = async (app: AppHandle, url: string) => {
    await app.rntl.act(async () => {
      app.router.navigate(url as never);
    });
    await app.advance(200);
  };

  it('flashes the row again after the teacher left the tab during the first flash', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/calls?studentId=usr_maria', expectPath: null });
    await app.advance(200);
    expect(hasTestId(app, 'call-row-highlight-usr_maria')).toBe(true);
    // Away before the flash ends.
    await go(app, '/teacher/students');
    await app.advance(3000);
    expect(hasTestId(app, 'call-row-highlight-usr_maria')).toBe(false);

    await go(app, '/teacher/calls?studentId=usr_maria');
    expect(hasTestId(app, 'call-row-highlight-usr_maria')).toBe(true);
    await app.advance(3000);
    expect(hasTestId(app, 'call-row-highlight-usr_maria')).toBe(false);
    // Once shown in front, the parameter is dropped, as on the site.
    expect(app.path()).toBe('/teacher/calls');

    await go(app, '/teacher/calls?studentId=usr_maria');
    expect(hasTestId(app, 'call-row-highlight-usr_maria')).toBe(true);
  });
});

function spyAnnouncements(): () => string[] {
  const RN = require('react-native') as typeof import('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
  const plain = jest.spyOn(RN.AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const queued = jest.spyOn(RN.AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
  plain.mockClear();
  queued.mockClear();
  return () => [...plain.mock.calls.map((c) => String(c[0])), ...queued.mock.calls.map((c) => String(c[0]))];
}

const platform = () => (require('react-native') as typeof import('react-native')).Platform.OS; // eslint-disable-line @typescript-eslint/no-require-imports
const rootOf = (app: AppHandle) => app.screen.container as unknown as HostNode;

/** Whether a screen reader can reach `node`: no ancestor hides it from accessibility. */
function readable(node: HostNode): boolean {
  for (let current: HostNode | null = node; current; current = current.parent) {
    const props = current.props;
    if (props.accessibilityElementsHidden === true || props.importantForAccessibility === 'no-hide-descendants' || props['aria-hidden'] === true) return false;
  }
  return true;
}

describe('lesson board: what a screen reader hears (#328, #332)', () => {
  it('a refused result mark is spoken on both platforms', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live' });
    const board = await call(app, () => app.mock.planner.getLessonBoard('les_live'));
    const participant = board.participants.find((row) => row.items.length > 0 && row.items[0].result === null);
    expect(participant).toBeDefined();
    if (!participant) return;
    await tap(app, `#lesson-participant-toggle-${participant.id}`);
    const spoken = spyAnnouncements();
    arm(app, 'planner.setItemResult', 'serviceUnavailable');
    const item = participant.items[0];
    await app.rntl.fireEvent.press(app.rntl.within(app.screen.getByTestId(`lesson-item-result-${item.id}`)).getAllByRole('radio')[1]);
    await app.settle();
    expect(hasTestId(app, `lesson-item-error-${item.id}`)).toBe(true);
    expect(byTestId(app, `lesson-item-error-${item.id}`)?.props.accessibilityLiveRegion).toBeUndefined();
    expect(spoken().filter((text) => text === REFUSED)).toHaveLength(1);
  });

  it('result options, the history button and the photos name their number', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live' });
    const board = await call(app, () => app.mock.planner.getLessonBoard('les_live'));
    const participant = board.participants.find((row) => row.items.some((item) => (item.submission?.photoFileIds.length ?? 0) > 0));
    expect(participant).toBeDefined();
    if (!participant) return;
    await tap(app, `#lesson-participant-toggle-${participant.id}`);
    const item = participant.items.find((row) => (row.submission?.photoFileIds.length ?? 0) > 0);
    if (!item?.submission) return;
    const sign = `№ ${item.number}`;
    const group = app.screen.getByTestId(`lesson-item-result-${item.id}`);
    expect(group.props.accessibilityLabel).toBe(`Итог урока, ${sign}`);
    const options = app.rntl.within(group).getAllByRole('radio').map((radio) => String(radio.props.accessibilityLabel));
    expect(options[0]).toBe(`решил, ${sign}`);
    for (const option of options) expect(option).toContain(sign);
    expect(byTestId(app, `lesson-item-history-${item.id}`)?.props.accessibilityLabel).toBe(`История статуса, ${sign}`);
    const total = item.submission.photoFileIds.length;
    const submission = byTestId(app, `lesson-item-submission-${item.id}`);
    expect(submission).toBeTruthy();
    if (!submission) return;
    const thumbs = all(submission, (node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Открыть фото'));
    expect(thumbs.length).toBeGreaterThan(0);
    expect(String(thumbs[0].props.accessibilityLabel)).toBe(`Открыть фото 1 из ${total}, ${sign}`);
  });
});

describe('new lesson: «select at least one student» (#328)', () => {
  it('is spoken on both platforms', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/new?studentId=usr_ilya' });
    await app.settle();
    const spoken = spyAnnouncements();
    await tap(app, '#lesson-new-student-usr_ilya');
    await app.settle();
    expect(spoken()).toContain('Выберите хотя бы одного ученика.');
  });
});

describe('lesson duration stepper (#335)', () => {
  it('says the new value on iOS; Android reads the live region', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/new?studentId=usr_ilya' });
    await app.settle();
    const spoken = spyAnnouncements();
    const before = String(byTestId(app, 'lesson-new-duration-value')?.props.accessibilityLabel);
    await tap(app, '#lesson-new-duration-plus');
    const after = String(byTestId(app, 'lesson-new-duration-value')?.props.accessibilityLabel);
    expect(after).not.toBe(before);
    expect(byTestId(app, 'lesson-new-duration-value')?.props.accessibilityLiveRegion).toBe('polite');
    expect(spoken()).toEqual(platform() === 'ios' ? [after] : []);
  });
});

describe('sticky list headers are read once (#336)', () => {
  it('calls: only the in-list summary is reachable', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/calls' });
    await app.settle();
    const summaries = all(rootOf(app), (node) => node.props.testID === 'calls-summary');
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries.filter(readable)).toHaveLength(1);
  });

  it('lessons: each section header is reachable once', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons' });
    await app.settle();
    const headers = all(rootOf(app), (node) => node.props.accessibilityRole === 'header' && readable(node)).map((node) =>
      visibleText({ screen: { container: node } } as never),
    );
    expect(headers.length).toBeGreaterThan(0);
    expect(new Set(headers).size).toBe(headers.length);
  });
});

describe('weekly lessons chart (#337)', () => {
  it('the counts above the bars are not read as bare numbers', async () => {
    const app = await visit({ as: 'dev@example.com', url: '/developer/statistics?view=teachers' });
    await app.settle();
    const charts = all(rootOf(app), (node) => typeof node.props.testID === 'string' && /^stats-teacher-weeks-[^-]+$/.test(node.props.testID));
    expect(charts.length).toBeGreaterThan(0);
    const counts = charts.flatMap((chart) => all(chart, (node) => node.children.length === 1 && typeof node.children[0] === 'string' && /^\d+$/.test(node.children[0] as string)));
    // The counts are drawn…
    expect(counts.length).toBeGreaterThan(0);
    // …but not reachable: the chart's own summary names every week and count.
    const bare = counts.filter(readable);
    expect(bare.map((node) => node.children[0])).toEqual([]);
  });
});

describe('calls: the history button (#339)', () => {
  it('its accessible name starts with the visible label and its count', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/calls' });
    await app.settle();
    const overview = await call(app, () => app.mock.groups.getParentCallsOverview());
    const student = overview.students.find((row) => row.totalCalls > 0);
    expect(student).toBeDefined();
    if (!student) return;
    expect(byTestId(app, `call-history-${student.studentId}`)?.props.accessibilityLabel).toBe(
      `История (${student.totalCalls}) — звонки родителям: ${student.studentName}`,
    );
  });
});

describe('sheets with a request in flight when the screen loses focus', () => {
  const go = async (app: AppHandle, url: string) => {
    await app.rntl.act(async () => {
      app.router.navigate(url as never);
    });
    await app.advance(200);
  };

  it('record call: a refusal and the typed comment are still there on return', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/calls' });
    await app.settle();
    const overview = await call(app, () => app.mock.groups.getParentCallsOverview());
    const student = overview.students[0];
    await tap(app, `#call-record-${student.studentId}`);
    await app.settle();
    const comment = app.screen.getByTestId('call-record-comment');
    await app.rntl.fireEvent.changeText(comment, 'Мама просила перезвонить вечером');
    app.mock.controls.set('latency', { minMs: 2500, maxMs: 2500 });
    arm(app, 'groups.recordParentCall', 'serviceUnavailable');
    await app.rntl.fireEvent.press(app.screen.getByTestId('call-record-save'));
    await app.advance(100);
    await go(app, '/teacher/students');
    await app.settle(20_000);
    await go(app, '/teacher/calls');
    await app.settle();
    expect(hasTestId(app, 'call-record-error')).toBe(true);
    expect(byTestId(app, 'call-record-comment')?.props.value).toBe('Мама просила перезвонить вечером');
  });
});
