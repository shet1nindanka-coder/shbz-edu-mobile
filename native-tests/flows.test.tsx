// The main forms, submitted once each through the UI, on the real mock server: what the screen shows while
// the request runs, after it succeeded, and after the deferred jobs (AI check, plan generation) finished.
import { describe, expect, it } from '@jest/globals';

import { fill, hasTestId, tap, visibleText, visit, wait } from './support/drive';
import { device } from './support/fakes';

const ANNA = 'teacher@example.com';
const ILYA = 'ilya@example.com';
const DEV = 'dev@example.com';
const PHOTO = { uri: 'file:///data/user/0/cache/ImagePicker/solution.jpg', name: 'solution.jpg', mimeType: 'image/jpeg', size: 240_000 };

describe('teacher forms', () => {
  it('creates a student and shows the credentials', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students' });
    await tap(app, '#students-add');
    await tap(app, '#create-student-submit'); // empty form: validation
    await fill(app, '#create-student-name', 'Новый Ученик');
    await fill(app, '#create-student-login', 'new.student@example.com');
    await fill(app, '#create-student-password', 'secret-pass-9');
    await tap(app, '#create-student-submit');
    expect(hasTestId(app, 'credentials-sheet')).toBe(true);
    await tap(app, '#credentials-copy');
    await tap(app, '#credentials-share');
    await tap(app, '#credentials-done');
    expect(visibleText(app)).toContain('Новый Ученик');
  });

  it('refuses a login that is taken', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students' });
    await tap(app, '#students-add');
    await fill(app, '#create-student-name', 'Дубль');
    await fill(app, '#create-student-login', 'ilya@example.com');
    await fill(app, '#create-student-password', 'secret-pass-9');
    await tap(app, '#create-student-submit');
    expect(hasTestId(app, 'create-student-sheet')).toBe(true);
    expect(visibleText(app)).toContain('Ученик с таким логином уже существует');
  });

  it('opens the actions of a student: login, password reset, deletion', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students' });
    await tap(app, '#student-actions-usr_timur');
    await tap(app, '#student-actions-reset');
    const again = await visit({ as: ANNA, url: '/teacher/students' });
    await tap(again, '#student-actions-usr_timur');
    await tap(again, '#student-actions-delete');
    expect(hasTestId(again, 'delete-student-dialog')).toBe(true);
  });

  it('records a parent call (reached, then not reached) and opens the history', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/calls' });
    await tap(app, '#call-record-usr_kirill');
    await fill(app, '#call-record-comment', 'Обсудили пропуски и план на неделю.');
    await tap(app, '#call-record-save');
    await tap(app, '#call-record-usr_artem');
    await tap(app, 'radio:Не дозвонились');
    await tap(app, '#call-record-save');
    await tap(app, '#call-history-usr_kirill');
    expect(hasTestId(app, 'call-history-sheet')).toBe(true);
  });

  it('creates a group, renames it and adds a member', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups' });
    await tap(app, '#groups-create');
    await fill(app, '#group-create-name', '9Б геометрия');
    await fill(app, '#group-create-grade', '9');
    await tap(app, '#group-create-submit');
    expect(app.path()).toMatch(/^\/teacher\/groups\/grp_/);
    await tap(app, '#group-member-add');
    await fill(app, '#member-add-search', 'тим');
    await tap(app, '#member-add-usr_timur');
    await tap(app, '#group-menu');
    await tap(app, '#group-menu-rename');
    await fill(app, '#group-rename-name', '9Б геометрия (вечер)');
    await tap(app, '#group-rename-submit');
    for (const tab of ['tab:Статистика', 'tab:Посещаемость', 'tab:Занятия', 'tab:Участники']) await tap(app, tab);
  });

  it('marks attendance and edits the AI profile of a group member', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups/grp_8a' });
    await tap(app, '#member-ai-toggle-usr_artem');
    await fill(app, '#member-note-usr_artem', 'Любит задачи на графики, спешит в вычислениях.');
    await tap(app, 'tab:Посещаемость');
    await tap(app, '#attendance-cell-les_g4-usr_artem');
    await tap(app, '#attendance-cell-les_g4-usr_artem');
    await tap(app, 'radio:По занятиям');
    await tap(app, '#attendance-mark-usr_artem-LATE');
    await tap(app, '#attendance-lesson-select');
    await tap(app, '#group-attendance-pdf-30d');
    await tap(app, 'tab:Статистика');
    await tap(app, '#group-statistics-row-usr_artem');
  });

  it('assigns a homework: topic, numbers, deadline, title', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_timur/assign' });
    await tap(app, '#assign-submit'); // nothing chosen yet
    await tap(app, '#assign-topic');
    await tap(app, 'menuitem:Квадратные функции');
    await tap(app, '#assign-number-204');
    await tap(app, '#assign-number-207');
    await tap(app, '#assign-deadline');
    await tap(app, 'button:Сегодня');
    await tap(app, 'button:Готово');
    await tap(app, '#assign-title-open');
    await fill(app, '#assign-title-input', 'Проверочное ДЗ');
    await tap(app, '#assign-title-done');
    await tap(app, '#assign-submit');
    await tap(app, 'tab:Проверка');
    expect(visibleText(app)).toContain('Проверочное ДЗ');
  });

  it('asks the AI to pick the homework numbers', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya/assign' });
    await tap(app, '#assign-pick-ai');
    await wait(app, 60_000, 'assign: after the AI pick had time to finish');
  });

  it('reviews a homework: sets a number status, opens the history, cancels the homework', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_ilya' });
    await tap(app, '#review-assignment-toggle-hw_ilya_uncertain');
    await tap(app, 'radio:Красный');
    await tap(app, '#review-number-history-num_204');
    await tap(app, '#review-number-diagnostics-num_207');
    await tap(app, '#review-cancel-hw_ilya_uncertain');
    expect(hasTestId(app, 'cancel-homework-dialog')).toBe(true);
    await tap(app, '#review-completed-toggle');
    await tap(app, '#review-lesson-mode');
  });

  it('composes an individual lesson with an AI plan and marks the results', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/new?studentId=usr_ilya' });
    await fill(app, '#lesson-new-title', 'Разбор линейных уравнений');
    await tap(app, '#lesson-new-duration-plus');
    await tap(app, '#lesson-new-starts-at');
    await tap(app, 'button:Сегодня');
    await tap(app, 'button:Готово');
    await tap(app, '#lesson-topics-open');
    await tap(app, '#lesson-topic-option-top_linear');
    await tap(app, '#lesson-topics-done');
    await fill(app, '#lesson-new-note', 'Упор на задачи с дробями.');
    await tap(app, '#lesson-new-submit');
    expect(app.path()).toMatch(/^\/teacher\/lessons\/les_/);
    // The plan is generated by a deferred job of the mock server.
    await wait(app, 60_000, 'lesson board: after the plan was generated');
    await tap(app, 'radio:решил');
    await tap(app, 'radio:с ошибками');
    await tap(app, '#lesson-board-menu');
  });

  it('composes a group lesson with an AI plan', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/new?groupId=grp_8a' });
    await tap(app, '#lesson-new-student-usr_kirill');
    await tap(app, '#lesson-new-speed-usr_artem');
    await tap(app, '#lesson-topics-open');
    await tap(app, '#lesson-topic-option-top_quadratic');
    await tap(app, '#lesson-topic-option-top_log');
    await tap(app, '#lesson-topics-done');
    await tap(app, '#lesson-new-submit');
    await wait(app, 5_000, 'group lesson board: while the plans are generated');
    await wait(app, 120_000, 'group lesson board: after the plans were generated');
  });

  it('composes a lesson by hand (no plan)', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/new?studentId=usr_ilya' });
    await tap(app, 'radio:Выбрать вручную');
    await tap(app, '#lesson-compose-submit'); // nothing chosen yet
    await tap(app, '#lesson-compose-topic');
    await tap(app, 'menuitem:Линейные уравнения');
    await tap(app, '#lesson-compose-number-112');
    await tap(app, '#lesson-compose-number-118');
    await tap(app, '#lesson-compose-duration-plus');
    await tap(app, '#lesson-compose-submit');
    expect(app.path()).toMatch(/^\/teacher\/lessons\/les_/);
    await wait(app, 5_000, 'manual lesson board');
  });

  it('works on a lesson board: adds a number, removes one, schedules, finishes', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/lessons/les_live' });
    await tap(app, '#lesson-participant-toggle-lp_les_live_artem');
    await tap(app, '#lesson-participant-add-lp_les_live_artem');
    await tap(app, '#lesson-board-menu');
    const board = await visit({ as: ANNA, url: '/teacher/lessons/les_unscheduled' });
    await tap(board, '#lesson-schedule-value');
    await tap(board, 'button:Сегодня');
    await tap(board, 'button:Готово');
    await tap(board, '#lesson-schedule-submit');
  });

  it('creates a homework draft from a lesson, waits for the plan and issues it', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/homework-plans/new?lessonId=les_g4' });
    await tap(app, '#draft-new-deadline');
    await tap(app, 'button:Сегодня');
    await tap(app, 'button:Готово');
    await tap(app, '#draft-new-daily-minutes-plus');
    await fill(app, '#draft-new-note', 'Закрепить вершину параболы.');
    await tap(app, '#draft-new-submit');
    await wait(app, 5_000, 'homework draft: while the plan is generated');
    await wait(app, 120_000, 'homework draft: after the plan was generated');
    const ready = await visit({ as: ANNA, url: '/teacher/homework-plans/hp_ready' });
    await tap(ready, '#draft-participant-toggle-lp_hp_ready_ilya');
    await tap(ready, '#draft-issue-all');
    await wait(ready, 5_000, 'homework draft: after issuing');
    await tap(ready, '#draft-board-menu');
  });
});

describe('student forms', () => {
  it('saves a note to a number of a homework and of the theory', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_open' });
    await fill(app, '#number-note-302', 'Не понял, как искать промежутки. Спросить на уроке.');
    await wait(app, 5_000, 'homework: after the note was saved');
    const number = await visit({ as: ILYA, url: '/student/numbers/118' });
    const input = number.screen.queryAllByPlaceholderText(/./)[0];
    if (input) await number.rntl.fireEvent.changeText(input, 'Разобрать ещё раз.');
    await wait(number, 5_000, 'number: after the note was saved');
  });

  it('keeps a note typed without a connection and sends it later', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_open' });
    const { setSimulatedOffline } = require('@/services/network') as typeof import('@/services/network'); // eslint-disable-line @typescript-eslint/no-require-imports
    await app.rntl.act(async () => setSimulatedOffline(true));
    await fill(app, '#number-note-305', 'Заметка без сети.');
    await wait(app, 5_000, 'homework: note typed offline');
    await app.rntl.act(async () => setSimulatedOffline(false));
    await wait(app, 5_000, 'homework: back online');
  });

  it.each(['#photo-source-library', '#photo-source-camera'])('attaches a photo from %s and starts the AI check', async (source) => {
    const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_soon' });
    device().picker.nextAssets = [PHOTO];
    await tap(app, 'button:Добавить фото');
    await tap(app, source);
    await wait(app, 3_000, 'homework: after the upload');
    await tap(app, '#homework-check-start');
    await wait(app, 2_000, 'homework: check queued');
    await wait(app, 20_000, 'homework: check running');
    await wait(app, 120_000, 'homework: check finished');
  });

  it('cancels the photo picker, is refused the camera, deletes a photo', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_today' });
    await tap(app, 'button:Добавить фото');
    await tap(app, '#photo-source-library'); // the user cancels: nextAssets is null
    device().picker.cameraPermission = false;
    await tap(app, 'button:Добавить фото');
    await tap(app, '#photo-source-camera');
    const again = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_today' });
    await tap(again, 'button:Удалить фото');
    await wait(again, 8_000, 'homework: after the undo window of a deleted photo');
  });

  it('opens a photo of a homework in the viewer', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_open' });
    await tap(app, 'imagebutton:Открыть фото');
  });

  it.each(['polina@example.com', 'artem@example.com'] as const)('hands in a photo for a number of the live lesson as %s', async (as) => {
    const app = await visit({ as, url: '/student/lesson' });
    device().picker.nextAssets = [PHOTO];
    const submit = app.screen.queryAllByRole('button').find((node) => /lesson-item-submit|lesson-submit/.test(String(node.props.testID)));
    if (submit) {
      await app.rntl.fireEvent.press(submit);
      await app.settle();
      if (hasTestId(app, 'photo-source-library')) await tap(app, '#photo-source-library');
    }
    await wait(app, 3_000, 'live lesson: after handing in');
    await wait(app, 120_000, 'live lesson: after the check');
  });

  it('watches a lesson begin (the lesson of Dasha starts three minutes after the seed)', async () => {
    const app = await visit({ as: 'dasha@example.com', url: '/student/lesson' });
    await wait(app, 4 * 60_000, 'lesson: after it started');
    await wait(app, 60 * 60_000, 'lesson: an hour later');
  });
});

describe('developer forms', () => {
  it('edits and deletes the LaTeX condition and answer of a number', async () => {
    const app = await visit({ as: DEV, url: '/developer/topics/top_linear/numbers/118' });
    await fill(app, '#latex-condition-input', 'Решите уравнение $\\frac{2x-1}{3} = x + 5$ и запишите корень.');
    const save = ['#latex-condition-save', 'button:Сохранить'].find((selector) => (selector.startsWith('#') ? hasTestId(app, selector.slice(1)) : true));
    if (save) await tap(app, save);
    await fill(app, '#latex-answer-input', '$x = -16$');
    await fill(app, '#latex-condition-input', 'Сломанная формула $\\frac{1}{$');
    await tap(app, '#latex-answer-delete');
    await tap(app, '#latex-condition-delete');
  });

  it('creates a teacher account and a student for an owner', async () => {
    const app = await visit({ as: DEV, url: '/developer/accounts' });
    await tap(app, '#accounts-add');
    await fill(app, '#create-account-name', 'Новый Преподаватель');
    await fill(app, '#create-account-login', 'teacher9@example.com');
    await fill(app, '#create-account-password', 'secret-pass-9');
    await tap(app, '#create-account-submit');
    const again = await visit({ as: DEV, url: '/developer/accounts' });
    await tap(again, '#account-teacher-usr_igor');
    await tap(again, '#teacher-actions-delete');
    await fill(again, '#accounts-search', 'илья');
  });

  it('saves a runtime setting and sends a broadcast', async () => {
    const app = await visit({ as: DEV, url: '/developer/panel?tab=settings' });
    const input = app.screen.queryAllByDisplayValue(/^\d+$/)[0];
    if (input) await app.rntl.fireEvent.changeText(input, '7');
    await wait(app, 1_000, 'dev panel: a setting was changed');
    const save = app.screen.queryAllByRole('button').find((node) => /save|submit/.test(String(node.props.testID)));
    if (save) {
      await app.rntl.fireEvent.press(save);
      await wait(app, 3_000, 'dev panel: after saving');
    }
    const broadcast = await visit({ as: DEV, url: '/developer/panel?tab=broadcast' });
    for (const [index, field] of broadcast.screen.queryAllByPlaceholderText(/./).entries()) {
      await broadcast.rntl.fireEvent.changeText(field, index === 0 ? 'Технические работы' : 'Сегодня в 22:00 сайт будет недоступен 10 минут.');
    }
    await wait(broadcast, 1_000, 'dev panel: broadcast typed');
    const send = broadcast.screen.queryAllByRole('button').find((node) => /send|submit/.test(String(node.props.testID)));
    if (send) {
      await broadcast.rntl.fireEvent.press(send);
      await wait(broadcast, 3_000, 'dev panel: after sending');
    }
  });
});

describe('settings', () => {
  it.each([ILYA, ANNA, DEV] as const)('%s changes the name, the theme, the hints and the language', async (as) => {
    const app = await visit({ as, url: '/settings' });
    await fill(app, '#settings-name', 'Имя Изменено');
    await tap(app, '#settings-save-name');
    await tap(app, 'radio:Светлая');
    for (const node of app.screen.queryAllByRole('radio')) {
      if (!/^(Русский|English)$/.test(String(node.props.accessibilityLabel))) {
        await app.rntl.fireEvent.press(node);
        await app.settle();
      }
    }
    await wait(app, 500, 'settings: every theme and hints option pressed');
    await tap(app, 'radio:English');
    await wait(app, 2_000, 'settings: in English');
    expect(visibleText(app)).toMatch(/Settings|Sign out|Interface/);
  });

  it('changes the password, and shows the limiter of the pinned account', async () => {
    const app = await visit({ as: ILYA, url: '/settings' });
    await tap(app, '#settings-update-password'); // empty: validation
    await fill(app, '#settings-current-password', 'student123');
    await fill(app, '#settings-new-password', 'new-secret-123');
    await fill(app, '#settings-repeat-password', 'new-secret-123');
    await tap(app, '#settings-update-password');
    const egor = await visit({ as: 'egor@example.com', url: '/settings' });
    await fill(egor, '#settings-current-password', 'student123');
    await fill(egor, '#settings-new-password', 'new-secret-123');
    await fill(egor, '#settings-repeat-password', 'new-secret-123');
    await tap(egor, '#settings-update-password');
  });

  it('switches the biometric lock and the reminders on (the OS permission is granted)', async () => {
    const app = await visit({ as: ILYA, url: '/settings' });
    await tap(app, '#settings-biometric-lock');
    await tap(app, '#settings-reminder-homeworkDeadlines');
    await tap(app, '#settings-reminder-lessonStart');
    await wait(app, 3_000, 'settings: reminders scheduled');
    expect(device().notifications.scheduled.length).toBeGreaterThan(0);
    await tap(app, '#settings-clear-cache');
  });

  it('is refused the notification permission and biometry that is not enrolled', async () => {
    const app = await visit({
      as: ANNA,
      url: '/settings',
      device: (state) => {
        state.notifications.status = 'denied';
        state.biometrics.enrolled = false;
      },
    });
    for (const node of app.screen.queryAllByRole('switch')) {
      await app.rntl.fireEvent.press(node);
      await app.settle();
    }
    await wait(app, 1_000, 'settings: every switch pressed without permissions');
  });

  it('signs out', async () => {
    const app = await visit({ as: ILYA, url: '/settings' });
    await tap(app, '#settings-logout');
    if (app.path() !== '/login') await tap(app, 'button:Выйти');
    await wait(app, 2_000, 'after signing out');
    expect(app.path()).toBe('/login');
  });
});
