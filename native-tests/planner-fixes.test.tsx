// Regressions of the planner, groups, calls and statistics areas, driven through the UI on the mock server.
import { describe, expect, it, jest } from '@jest/globals';

import { fill, hasTestId, tap, visit, wait } from './support/drive';

const ANNA = 'teacher@example.com';
const DEV = 'dev@example.com';

describe('statistics deep links (site ?view= / ?studentId=)', () => {
  it('?view=teachers opens the "by teacher" view', async () => {
    const app = await visit({ as: DEV, url: '/developer/statistics?view=teachers' });
    expect(hasTestId(app, 'stats-view-teacher')).toBe(false);
    expect(app.screen.queryAllByTestId(/^stats-teacher-usr_/).length).toBeGreaterThan(0);
  });

  it('?view=developer opens the platform metrics', async () => {
    const app = await visit({ as: DEV, url: '/developer/statistics?view=developer' });
    expect(hasTestId(app, 'stats-view-developer')).toBe(true);
  });

  it('?studentId= filters the progress timeline by that student; an unknown id falls back to all students', async () => {
    const getProgress = jest.fn<(id?: string) => void>();
    const app = await visit({
      as: DEV,
      url: '/developer/statistics?studentId=usr_ilya',
      arrange: ({ runtime }) => {
        const original = runtime.api.groups.getStatisticsProgress.bind(runtime.api.groups);
        runtime.api.groups.getStatisticsProgress = (id) => {
          getProgress(id);
          return original(id);
        };
      },
    });
    expect(hasTestId(app, 'stats-view-teacher')).toBe(true);
    expect(getProgress).toHaveBeenCalledWith('usr_ilya');
    expect(app.screen.getByTestId('stats-timeline-student')).toBeTruthy();
    expect(app.screen.getAllByText('Илья Смирнов').length).toBeGreaterThan(0);

    const unknown = await visit({ as: DEV, url: '/developer/statistics?studentId=usr_nobody&view=bogus' });
    expect(hasTestId(unknown, 'stats-view-teacher')).toBe(true);
  });
});

describe('creating a lesson after the form was left', () => {
  it('does not replace the screen the teacher went back to', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/students/usr_timur/lessons' });
    await app.open('/teacher/lessons/new?studentId=usr_timur');
    expect(app.path()).toContain('/teacher/lessons/new');
    const create = jest.spyOn(app.runtime.api.planner, 'createLesson');
    // Submit and leave before the (simulated) server has answered.
    const submit = app.screen.getByTestId('lesson-new-submit');
    await app.rntl.act(async () => {
      app.rntl.fireEvent.press(submit);
      app.router.back();
    });
    await wait(app, 5_000, 'lesson create resolved after the form was left');
    expect(create).toHaveBeenCalledTimes(1);
    expect(app.path()).toBe('/teacher/students/usr_timur/lessons');
  });
});

describe('group forms submitted from the keyboard', () => {
  it('creates one group when the keyboard "done" is pressed twice', async () => {
    const app = await visit({ as: ANNA, url: '/teacher/groups' });
    await tap(app, '#groups-create');
    expect(await fill(app, '#group-create-name', 'Двойная группа')).toBe(true);
    expect(await fill(app, '#group-create-grade', '9')).toBe(true);
    const create = jest.spyOn(app.runtime.api.groups, 'createGroup');
    const field = app.screen.getByTestId('group-create-grade');
    // Two "done" key presses handled back to back, before the pending state has rendered.
    await app.rntl.fireEvent(field, 'submitEditing');
    await app.rntl.fireEvent(field, 'submitEditing');
    await app.settle();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
