// Regressions of the teacher area: what the screen shows, driven through the UI on the real mock server.
import { describe, expect, it, jest } from '@jest/globals';

import { fill, hasTestId, tap, visibleText, visit, wait } from './support/drive';

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
