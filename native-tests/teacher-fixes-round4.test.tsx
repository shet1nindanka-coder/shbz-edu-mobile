// Regressions of the teacher, content and developer areas, round 4: a one-time password that survives a
// reminder tap, a student report that outlives the card, the review's undo that keeps its colour and lock,
// the assign board that keeps its topic over a reordering refetch, and per-object accessible names.
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, hasTestId, press, pressTestId, tap, typeTestId, visibleText, visit } from './support/drive';
import type { AppHandle } from './support/launch';
import { all, textOf, type HostNode } from './support/tree';

const ANNA = 'teacher@example.com';
const DEV = 'dev@example.com';
const PASSWORD = 'Zx9!kq2Lmw';

const rootOf = (app: AppHandle) => app.screen.container as unknown as HostNode;

/** Visible modal windows by their text. */
const openModals = (app: AppHandle): string[] =>
  all(rootOf(app), (node) => node.type === 'Modal' && node.props.visible !== false).map((node) => textOf(node));

async function navigateFromOutside(app: AppHandle, target: Record<string, unknown>, role: 'TEACHER' | 'DEVELOPER') {
  const { navigateTo } = require('@/navigation') as typeof import('@/navigation'); // eslint-disable-line @typescript-eslint/no-require-imports
  await app.rntl.act(async () => {
    navigateTo(target as never, role);
  });
  await app.settle();
}

async function routerNavigate(app: AppHandle, url: string) {
  await app.rntl.act(async () => {
    app.router.navigate(url as never);
  });
  await app.settle();
}

describe('the new account password survives leaving the screen (#316)', () => {
  it('teacher: a reminder tap hides the credentials sheet; it is back on return and only «Готово» ends it', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students' });
    expect(await pressTestId(app, 'students-add')).toBe(true);
    await app.settle();
    await typeTestId(app, 'create-student-name', 'Пётр Новиков');
    await typeTestId(app, 'create-student-login', 'petr.round4');
    await typeTestId(app, 'create-student-password', PASSWORD);
    expect(await pressTestId(app, 'create-student-submit')).toBe(true);
    await app.settle();
    expect(visibleText(app)).toContain(PASSWORD);

    // What a tapped parent-call reminder does (ReminderOpener → navigateTo).
    await navigateFromOutside(app, { screen: 'calls.list', studentId: 'usr_ilya' }, 'TEACHER');
    expect(app.path()).toMatch(/^\/teacher\/calls/);
    expect(openModals(app).some((text) => text.includes(PASSWORD))).toBe(false);

    await routerNavigate(app, '/teacher/students');
    expect(app.path()).toBe('/teacher/students');
    expect(hasTestId(app, 'credentials-sheet')).toBe(true);
    expect(visibleText(app)).toContain(PASSWORD);
    expect(visibleText(app)).not.toContain('Новый ученик успешно добавлен');

    expect(await pressTestId(app, 'credentials-done')).toBe(true);
    await app.settle();
    expect(visibleText(app)).not.toContain(PASSWORD);
    expect(visibleText(app)).toContain('Новый ученик успешно добавлен');
  });

  it('developer: the same sheet on the accounts screen comes back after a pushed screen', async () => {
    const app = await visit({ as: DEV, url: '/developer/accounts' });
    expect(await pressTestId(app, 'accounts-add')).toBe(true);
    await app.settle();
    // A teacher account needs no owner.
    expect(await tap(app, 'radio:Учитель')).toBe(true);
    await app.settle();
    await typeTestId(app, 'create-account-name', 'Пётр Новиков');
    await typeTestId(app, 'create-account-login', 'petr.dev4');
    await typeTestId(app, 'create-account-password', PASSWORD);
    expect(await pressTestId(app, 'create-account-submit')).toBe(true);
    await app.settle();
    expect(visibleText(app)).toContain(PASSWORD);

    await app.rntl.act(async () => {
      app.router.push('/settings' as never);
    });
    await app.settle();
    expect(app.path()).toBe('/settings');
    expect(openModals(app).some((text) => text.includes(PASSWORD))).toBe(false);

    await app.rntl.act(async () => {
      app.router.back();
    });
    await app.settle();
    expect(app.path()).toBe('/developer/accounts');
    expect(visibleText(app)).toContain(PASSWORD);
  });
});

describe('the student card report while the teacher is taken elsewhere (#324, #325)', () => {
  async function startReport(app: AppHandle, ms: number) {
    const download = jest.spyOn(app.runtime.api.teacherStudents, 'downloadStudentReport').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ uri: 'file:///cache/r.pdf', fileName: 'Неделя — Илья Смирнов.pdf' }), ms)),
    );
    await tap(app, '#student-card-menu');
    await app.advance(600);
    await app.rntl.fireEvent.press(app.screen.getByTestId('student-menu-report-7d'));
    await app.advance(800);
    expect(openModals(app)).toEqual(['Готовим отчёт…']);
    return download;
  }

  it('a screen pushed over the card: no progress window above it, and the finished report waits on the card', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    await startReport(app, 5000);
    await app.rntl.act(async () => {
      app.router.push('/settings' as never);
    });
    await app.advance(1500);
    expect(app.path()).toBe('/settings');
    expect(openModals(app)).toEqual([]);
    await app.advance(6000);
    await app.settle();
    // Not opened over Settings.
    expect(app.path()).toBe('/settings');
    await app.rntl.act(async () => {
      app.router.back();
    });
    await app.settle();
    expect(app.path()).toBe('/teacher/students/usr_ilya');
    expect(hasTestId(app, 'student-report-ready')).toBe(true);
    expect(openModals(app)).toEqual([]);
  });

  it('a reminder tap pops the card: the report is offered when the card is opened again, and opens from there', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    const download = await startReport(app, 8000);
    await navigateFromOutside(app, { screen: 'calls.list', studentId: 'usr_maria' }, 'TEACHER');
    expect(app.path()).toMatch(/^\/teacher\/calls/);
    await app.advance(9000);
    await app.settle();
    expect(download).toHaveBeenCalledTimes(1);
    expect(app.path()).toMatch(/^\/teacher\/calls/);

    // Another student's card does not offer it.
    await app.open('/teacher/students/usr_maria');
    expect(hasTestId(app, 'student-report-ready')).toBe(false);

    await app.open('/teacher/students/usr_ilya');
    expect(hasTestId(app, 'student-report-ready')).toBe(true);
    expect(visibleText(app)).toContain('Отчёт готов');
    expect(await pressTestId(app, 'student-report-ready-open')).toBe(true);
    await app.settle();
    expect(app.path()).not.toBe('/teacher/students/usr_ilya');

    // Opened once: it is not offered again.
    await app.open('/teacher/students/usr_ilya');
    expect(hasTestId(app, 'student-report-ready')).toBe(false);
  });
});

describe('review: «Отменить» keeps the restored colour and the lock until the undo is saved (#317)', () => {
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

  it('the accept batch settling first does not unlock the numbers or bring back its colours', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    if (!hasTestId(app, `review-accept-${HW}`)) {
      expect(await pressTestId(app, `review-assignment-toggle-${HW}`)).toBe(true);
      await app.settle();
    }
    // № 118 green, so that the AI verdict (wrong → red) is a change to accept.
    const group = byTestId(app, GROUP)!;
    const green = all(group, (node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Зеленый')[0];
    if (radios(app).checked !== 'Зеленый') {
      await press(app, green, 'green 118');
      await app.settle();
    }
    expect(radios(app).checked).toBe('Зеленый');

    // Every batch takes 2.5 s.
    const api = app.runtime.api.teacherStudents;
    const original = api.setNumberStatuses.bind(api);
    jest.spyOn(api, 'setNumberStatuses').mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return original(...args);
    });

    // Pressed without settling: the requests must stay in flight.
    await app.rntl.fireEvent.press(app.screen.getByTestId(`review-accept-${HW}`));
    await app.advance(300);
    expect(radios(app)).toEqual({ checked: 'Красный', disabled: true });
    await app.rntl.fireEvent.press(app.screen.getByTestId('review-undo-toast-undo'));
    await app.advance(50);
    expect(radios(app)).toEqual({ checked: 'Зеленый', disabled: true });

    // The accept settles (≈ 2.5 s); the undo is sent only now and takes another 2.5 s.
    await app.advance(2700);
    expect(radios(app)).toEqual({ checked: 'Зеленый', disabled: true });

    await app.advance(3000);
    await app.settle();
    expect(radios(app)).toEqual({ checked: 'Зеленый', disabled: false });
  });
});

describe('assign: a refetch that reorders the topics keeps the shown topic and the selection (#318)', () => {
  it('the first topic is pinned when the board arrives', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_maria/assign' });
    const { qk } = require('@/api') as typeof import('@/api'); // eslint-disable-line @typescript-eslint/no-require-imports
    type Board = { topics: { id: string; title: string; numbers: { id: string; number: string }[] }[] };
    const key = qk('teacherStudents', 'getAssignBoard', 'usr_maria');
    const board = app.queryClient.getQueryData<Board>(key);
    expect(board && board.topics.length > 1).toBe(true);
    const first = board!.topics[0];
    const picked = first.numbers[0];
    expect(await pressTestId(app, `assign-number-${picked.number}`)).toBe(true);
    await app.settle();
    const barBefore = textOf(byTestId(app, 'assign-bar')!);

    // The developer moved another topic to the top: the next answer has a different order.
    await app.rntl.act(async () => {
      app.queryClient.setQueryData<Board>(key, (current) => (current ? { ...current, topics: [...current.topics].reverse() } : current));
    });
    await app.settle();
    expect(hasTestId(app, `assign-number-${picked.number}`)).toBe(true);
    expect(visibleText(app)).toContain(first.title);
    expect(textOf(byTestId(app, 'assign-bar')!)).toBe(barBefore);
  });
});

describe('repeated buttons name their object (#338)', () => {
  it('topic view: every answer toggle names its number', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/topics/top_linear' });
    const toggles = all(rootOf(app), (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('topic-number-answer-toggle-') && node.props.accessibilityLabel !== undefined);
    expect(toggles.length).toBeGreaterThan(1);
    const labels = toggles.map((node) => String(node.props.accessibilityLabel));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[0]).toMatch(/^Показать ответ № /);
  });

  it('topic view and edit: the file cards\' «Открыть» / share buttons name their slot', async () => {
    const app = await visit({ as: DEV, url: '/developer/topics/top_linear' });
    const names = (prefix: string) =>
      [`${prefix}-open`, `${prefix}-share`].map((id) => byTestId(app, id)?.props.accessibilityLabel).filter((label) => label !== undefined).map(String);
    const theory = names('topic-theory-file');
    const homework = names('topic-homework-file');
    expect(theory.length).toBe(2);
    expect(homework.length).toBe(2);
    expect(theory[0]).toBe('Открыть: Теория');
    expect(new Set([...theory, ...homework]).size).toBe(4);
    for (const label of homework) expect(label).toMatch(/: Задания$/);

    await app.open('/developer/topics/top_linear/edit');
    const edit = [...names('edit-theory-file'), ...names('edit-homework-file')];
    expect(edit.length).toBeGreaterThan(1);
    expect(new Set(edit).size).toBe(edit.length);
  });

  it('student card: «Открыть занятие», «Условие и ответ» and «История статуса» name their lesson / number', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya/lessons' });
    const open = all(rootOf(app), (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('student-lesson-open-') && node.props.accessibilityLabel !== undefined);
    expect(open.length).toBeGreaterThan(1);
    const openLabels = open.map((node) => String(node.props.accessibilityLabel));
    expect(new Set(openLabels).size).toBe(openLabels.length);
    expect(openLabels[0]).toMatch(/^Открыть занятие: /);

    await app.open('/teacher/students/usr_ilya');
    if (!hasTestId(app, 'review-number-history-num_118')) {
      expect(await pressTestId(app, 'review-assignment-toggle-hw_ilya_overdue')).toBe(true);
      await app.settle();
    }
    expect(byTestId(app, 'review-number-history-num_118')?.props.accessibilityLabel).toBe('История статуса № 118');
    const condition = byTestId(app, 'review-number-condition-num_118');
    expect(String(condition?.props.accessibilityLabel)).toBe('Условие и ответ № 118');
  });
});

describe('student card lessons: the result toggles name their number (#332, review)', () => {
  it('the group and every option carry «№ N»', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya/lessons' });
    const isGroup = (node: HostNode) => typeof node.props.testID === 'string' && /^lesson-item-result-[^-]+$/.test(node.props.testID) && node.props.accessibilityLabel !== undefined;
    // Unfold lessons until one shows its set.
    const toggles = [...new Set(all(rootOf(app), (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('student-lesson-toggle-')).map((node) => String(node.props.testID)))];
    for (const toggle of toggles) {
      if (all(rootOf(app), isGroup).length > 1) break;
      expect(await pressTestId(app, toggle)).toBe(true);
      await app.settle();
    }
    const groups = all(rootOf(app), isGroup);
    expect(groups.length).toBeGreaterThan(1);
    const labels = groups.map((node) => String(node.props.accessibilityLabel));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[0]).toMatch(/^Итог урока, № /);
    const sign = labels[0].slice('Итог урока, '.length);
    const options = all(groups[0], (node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel !== undefined).map((node) => String(node.props.accessibilityLabel));
    expect(options.length).toBe(4);
    expect(options[0]).toBe(`решил, ${sign}`);
    for (const option of options) expect(option.endsWith(`, ${sign}`)).toBe(true);
  });
});

describe('developer panel: the ± setting steppers say the new value (#335, review)', () => {
  it('spoken once on iOS and Android, with the field name', async () => {
    const app = await visit({ as: DEV, url: '/developer/panel?tab=settings' });
    const { AccessibilityInfo, Platform } = require('react-native') as typeof import('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
    const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    const plain = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    try {
      const field = byTestId(app, 'setting-aiMinConfidence');
      expect(field).toBeTruthy();
      const before = String(field?.props.value ?? '');
      expect(await pressTestId(app, 'setting-aiMinConfidence-minus')).toBe(true);
      await app.settle();
      const after = String(byTestId(app, 'setting-aiMinConfidence')?.props.value ?? '');
      expect(after).not.toBe(before);
      const spoken = (Platform.OS === 'ios' ? queued : plain).mock.calls.map((call) => String(call[0]));
      expect(spoken.filter((text) => text.endsWith(`: ${after}`))).toHaveLength(1);
      expect((Platform.OS === 'ios' ? plain : queued).mock.calls.filter((call) => String(call[0]).endsWith(`: ${after}`))).toHaveLength(0);
    } finally {
      queued.mockRestore();
      plain.mockRestore();
    }
  });
});

describe('review: a refused status save is spoken on Android too (#329)', () => {
  it('announced once, on both platforms', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    // Spied after the launch: the app runs in its own module registry.
    const { AccessibilityInfo } = require('react-native') as typeof import('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
    const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    const plain = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    try {
      if (!hasTestId(app, 'review-number-status-num_118')) {
        expect(await pressTestId(app, 'review-assignment-toggle-hw_ilya_overdue')).toBe(true);
        await app.settle();
      }
      app.mock.controls.set('forceNextError', { method: 'teacherStudents.setNumberStatus', error: 'serviceUnavailable', times: 1 });
      const group = byTestId(app, 'review-number-status-num_118')!;
      const yellow = all(group, (node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Желтый')[0];
      await press(app, yellow, 'yellow 118');
      await app.settle();
      const error = byTestId(app, 'review-number-error-num_118');
      expect(error).toBeTruthy();
      const spoken = [...queued.mock.calls.map((call) => call[0]), ...plain.mock.calls.map((call) => call[0])];
      expect(spoken.filter((text) => text === textOf(error!))).toHaveLength(1);
    } finally {
      queued.mockRestore();
      plain.mockRestore();
    }
  });
});
