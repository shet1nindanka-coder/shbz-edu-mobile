// Regressions of the teacher area: what the screen shows, driven through the UI on the real mock server.
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, fill, hasTestId, locate, tap, visibleText, visit, wait } from './support/drive';
import { setAppState } from './support/fakes';
import type { AppHandle } from './support/launch';
import type { HostNode } from './support/tree';

const ANNA = 'teacher@example.com';

describe('teacher card', () => {
  it('shows a plan that is still pending as being built, however old the lesson is', async () => {
    // les_stale was created 20 minutes before T0 and its plan never resolves: on the site's lessons tab the
    // 15 minutes run from when the page first saw it pending, not from the lesson's creation.
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_dasha/lessons' });
    await tap(app, '#student-lesson-toggle-les_stale');
    expect(hasTestId(app, 'student-lesson-pending-les_stale')).toBe(true);
    expect(hasTestId(app, 'student-lesson-stale-les_stale')).toBe(false);
    await wait(app, 16 * 60_000, 'student lessons: 16 minutes later');
    expect(hasTestId(app, 'student-lesson-stale-les_stale')).toBe(true);
  });
});

describe('teacher forms submitted from the keyboard', () => {
  it('creates one student when the keyboard "send" is pressed twice', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students' });
    await tap(app, '#students-add');
    await fill(app, '#create-student-name', 'Двойное Нажатие');
    await fill(app, '#create-student-login', 'double.submit@example.com');
    const password = await fill(app, '#create-student-password', 'secret-pass-9');
    expect(password).toBe(true);
    const create = jest.spyOn(app.runtime.api.teacherStudents, 'createStudent');
    const field = app.screen.getByTestId('create-student-password');
    // Two "send" key presses handled back to back, before the pending state has rendered.
    await app.rntl.fireEvent(field, 'submitEditing');
    await app.rntl.fireEvent(field, 'submitEditing');
    await app.settle();
    expect(hasTestId(app, 'credentials-sheet')).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(visibleText(app)).not.toContain('Ученик с таким логином уже существует');
  });
});

// ───────────────────────────── round 2 ─────────────────────────────

const DEV = 'dev@example.com';

function isDisabled(node: HostNode | null): boolean {
  const state = node?.props.accessibilityState as { disabled?: boolean } | undefined;
  return Boolean(state?.disabled ?? node?.props.disabled);
}

/** Fails the next call of one API method with `429 rateLimited` (the demo screen's "arm a failure"). */
function armRateLimit(app: AppHandle, method: string): void {
  app.mock.controls.set('forceNextError', { method, error: 'rateLimited', times: 1 });
}

describe('a cool-down keeps its reason on screen for as long as the control is locked (#106)', () => {
  it('assign: closing the error notice keeps the wait line under the disabled «Выдать ДЗ»', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_timur/assign' });
    await tap(app, '#assign-topic');
    await tap(app, 'menuitem:Квадратные функции');
    await tap(app, '#assign-number-204');
    await tap(app, '#assign-deadline');
    await tap(app, 'button:Сегодня');
    await tap(app, 'button:Готово');
    armRateLimit(app, 'teacherStudents.issueHomework');
    await tap(app, '#assign-submit');
    expect(hasTestId(app, 'assign-notice')).toBe(true);
    expect(hasTestId(app, 'assign-wait')).toBe(true);
    await tap(app, 'button:Закрыть');
    expect(hasTestId(app, 'assign-notice')).toBe(false);
    expect(isDisabled(byTestId(app, 'assign-submit'))).toBe(true);
    expect(hasTestId(app, 'assign-wait')).toBe(true);
  });

  it('cancel homework: a 429 locks «Да, отменить» and counts down, also after the dialog is reopened', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    await tap(app, '#review-assignment-toggle-hw_ilya_uncertain');
    await tap(app, '#review-cancel-hw_ilya_uncertain');
    const cancel = jest.spyOn(app.runtime.api.teacherStudents, 'cancelHomework');
    // `locate` finds enabled controls only: null while the confirm button is shown but locked.
    const confirmEnabled = () => locate(app, 'button:Да, отменить') !== null;
    armRateLimit(app, 'teacherStudents.cancelHomework');
    await tap(app, 'button:Да, отменить');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(hasTestId(app, 'cancel-homework-wait')).toBe(true);
    expect(visibleText(app)).toContain('Да, отменить');
    expect(confirmEnabled()).toBe(false);
    await tap(app, 'button:Отмена');
    await tap(app, '#review-cancel-hw_ilya_uncertain');
    expect(hasTestId(app, 'cancel-homework-wait')).toBe(true);
    expect(visibleText(app)).toContain('Да, отменить');
    expect(confirmEnabled()).toBe(false);
    // Over the wait the button unlocks and the line goes.
    await wait(app, 61_000, 'cancel dialog: after the wait');
    expect(hasTestId(app, 'cancel-homework-wait')).toBe(false);
    expect(confirmEnabled()).toBe(true);
  });

  it('password reset: reopening the sheet after a 429 shows why «Сменить пароль» is disabled', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    await tap(app, '#student-card-menu');
    await tap(app, '#student-menu-reset');
    await fill(app, '#reset-password-input', 'new-secret-77');
    armRateLimit(app, 'teacherStudents.resetStudentPassword');
    await tap(app, '#reset-password-submit');
    expect(hasTestId(app, 'reset-password-wait')).toBe(true);
    await tap(app, '#reset-password-cancel');
    await tap(app, '#student-card-menu');
    await tap(app, '#student-menu-reset');
    await fill(app, '#reset-password-input', 'new-secret-77');
    expect(hasTestId(app, 'reset-password-error')).toBe(false);
    expect(isDisabled(byTestId(app, 'reset-password-submit'))).toBe(true);
    expect(hasTestId(app, 'reset-password-wait')).toBe(true);
  });
});

describe('student card lessons: the plan poll (#116)', () => {
  it('stops while the app is in the background and resumes in the foreground', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_dasha/lessons' });
    const status = jest.spyOn(app.runtime.api.planner, 'getLessonStatus');
    await wait(app, 10_000, 'lessons: foreground');
    expect(status.mock.calls.length).toBeGreaterThan(0);
    await app.rntl.act(async () => setAppState('background'));
    status.mockClear();
    await wait(app, 60_000, 'lessons: background');
    expect(status).not.toHaveBeenCalled();
    await app.rntl.act(async () => setAppState('active'));
    await wait(app, 10_000, 'lessons: foreground again');
    expect(status.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('student card lessons: «add a problem» (#110)', () => {
  it('says the topic has no numbers for an empty topic, not that they are all in the set', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_dasha/lessons' });
    await tap(app, '#student-lesson-toggle-les_stale');
    await tap(app, '#student-lesson-add-les_stale');
    await wait(app, 2000, 'add sheet: bank loaded');
    await tap(app, '#student-lesson-add-topic');
    await tap(app, 'menuitem:Тригонометрия (в разработке)');
    // The two cases keep their own short lines under the number select: «Нет номеров» / «Все уже в наборе».
    const text = visibleText(app);
    expect(text).toContain('Нет номеров');
    expect(text).not.toContain('Все уже в наборе');
  });
});

describe('content: a write answered 404 re-reads what was deleted (#109)', () => {
  it('a number deleted elsewhere: saving its condition turns the screen into «not found»', async () => {
    const app = await visit({ as: DEV, url: '/developer/topics/top_word/numbers/501' });
    expect(hasTestId(app, 'content-number-screen')).toBe(true);
    await fill(app, '#latex-condition-input', 'x = 1');
    // Deleted straight in the store: no realtime event refreshes the screen first.
    const store = app.mock.backend.store;
    const gone = store.numbers.by('topicId', 'top_word').find((row) => row.number === '501');
    expect(gone).toBeDefined();
    store.numbers.delete(gone?.id ?? '');
    await tap(app, '#latex-condition-save');
    await app.settle();
    expect(hasTestId(app, 'not-found')).toBe(true);
  });

  it('a topic deleted elsewhere: checking an import turns the edit screen into «not found»', async () => {
    const app = await visit({ as: DEV, url: '/developer/topics/top_empty/edit' });
    await tap(app, 'tab:Импорт');
    await tap(app, '#import-toggle-text');
    await fill(app, '#import-text', '{"numbers": []}');
    app.mock.backend.store.topics.delete('top_empty');
    await tap(app, '#import-check');
    await app.settle();
    expect(hasTestId(app, 'not-found')).toBe(true);
  });
});

describe('«Далее» on a title moves to the next field (#130)', () => {
  /** `this` of every `focus()` call of the TextInput mock: the inputs that were focused, by testID. */
  function focusedInputs(): unknown[] {
    // The app's own registry (loaded by `visit`): the TextInput class the screens render.
    const { TextInput } = require('react-native') as { TextInput: { prototype: { focus: jest.Mock } } };
    return TextInput.prototype.focus.mock.contexts.map((context) => (context as { props?: { testID?: unknown } }).props?.testID);
  }

  async function submit(app: AppHandle, testID: string): Promise<void> {
    const node = byTestId(app, testID);
    expect(node?.props.submitBehavior).toBe('submit');
    await app.rntl.fireEvent(node as never, 'submitEditing');
    await app.settle();
  }

  it('topic editor: title → description', async () => {
    const app = await visit({ as: DEV, url: '/developer/topics/top_linear/edit' });
    await submit(app, 'edit-title');
    expect(focusedInputs()).toContain('edit-description');
  });

  it('new topic: title → description', async () => {
    const app = await visit({ as: DEV, url: '/developer/topics' });
    await tap(app, '#topics-create');
    await tap(app, 'tab:Вручную');
    await submit(app, 'create-title');
    expect(focusedInputs()).toContain('create-description');
  });

  it('developer broadcast: title → text', async () => {
    const app = await visit({ as: DEV, url: '/developer/panel?tab=broadcast' });
    await submit(app, 'broadcast-title');
    expect(focusedInputs()).toContain('broadcast-body');
  });
});
