// Regressions of the shared UI layer, round 5: nothing is spoken under the biometric lock cover (#409), «На
// главную» from a dead screen inside a tab stack leaves it behind (#411), the progress-history sheet says
// so when a fetch is parked offline (#404) and the date-time field reads «today» when it is used (#407).
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, hasTestId, pressTestId, tap, visit } from './support/drive';
import { device, setAppState } from './support/fakes';
import type { AppHandle } from './support/launch';

// Each launch has its own module registry: the app's modules are required where they are used.
/* eslint-disable @typescript-eslint/no-require-imports */
const rn = () => require('react-native') as typeof import('react-native');

const locked = { 'shbz-app-device': JSON.stringify({ biometricLock: true }) };

function spyAnnouncements(): () => string[] {
  const RN = rn();
  const plain = jest.spyOn(RN.AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const queued = jest.spyOn(RN.AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
  plain.mockClear();
  queued.mockClear();
  return () => [...plain.mock.calls.map((c) => String(c[0])), ...queued.mock.calls.map((c) => String(c[0]))];
}

/** A direct call to the mock backend: its latency runs on the fake clock, so the clock is moved until it answers. */
async function serverCall<T>(app: AppHandle, call: () => Promise<T>): Promise<T> {
  let outcome: { value: T } | { error: unknown } | null = null;
  call().then(
    (value) => (outcome = { value }),
    (error: unknown) => (outcome = { error }),
  );
  for (let i = 0; i < 60 && outcome === null; i += 1) await app.advance(250);
  const done = outcome as { value: T } | { error: unknown } | null;
  if (done === null) throw new Error('the mock backend did not answer');
  if ('error' in done) throw done.error;
  return done.value;
}

/** Background for `ms`, then back with the biometric prompt cancelled: the lock screen stays. */
async function lockApp(app: AppHandle, ms = 120_000): Promise<void> {
  device().biometrics.nextResult = { success: false, error: 'user_cancel' };
  await app.rntl.act(async () => {
    setAppState('inactive');
    setAppState('background');
  });
  await app.advance(ms);
  await app.rntl.act(async () => {
    setAppState('active');
  });
  await app.settle();
}

describe('nothing is spoken under the lock cover (#409)', () => {
  it('the result of a homework check that finishes while locked is held and spoken after unlock', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student/homeworks/hw_ilya_open', storage: locked });
    await tap(app, '#homework-check-start');
    await app.advance(1500);
    await app.settle();
    const spoken = spyAnnouncements();
    await lockApp(app);
    expect(hasTestId(app, 'lock-screen')).toBe(true);
    for (let i = 0; i < 8; i += 1) await app.advance(5_000);
    await app.settle();
    expect(hasTestId(app, 'lock-screen')).toBe(true);
    expect(spoken()).toEqual([]);

    device().biometrics.nextResult = { success: true };
    await pressTestId(app, 'lock-unlock');
    await app.settle();
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    // The check finished under the cover: its result is said once the user can see it.
    expect(spoken().some((text) => text.startsWith('Проверка завершена'))).toBe(true);
  });

  it('the hooks hold a message while a cover is up, inside or outside a navigator', async () => {
    jest.useRealTimers();
    const rntl = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
    const { setOverlayCover } = require('@/ui/overlay-cover') as typeof import('@/ui/overlay-cover');
    const { useEventAnnouncement, useStatusAnnouncement, announceOnIOS } = require('@/ui/use-announce') as typeof import('@/ui/use-announce');
    const spoken = spyAnnouncements();
    let announce: (message: string) => void = () => undefined;
    function Probe({ status }: { status: string | null }) {
      announce = useEventAnnouncement();
      useStatusAnnouncement(status);
      return null;
    }
    try {
      setOverlayCover('lock');
      const view = await rntl.render(<Probe status={null} />);
      await rntl.act(async () => announce('Проверка завершена (тест)'));
      await view.rerender(<Probe status="Ошибка под замком (тест)" />);
      announceOnIOS('Скопировано (тест)');
      expect(spoken()).toEqual([]);

      await rntl.act(async () => setOverlayCover(null));
      expect(spoken().sort()).toEqual(['Ошибка под замком (тест)', 'Проверка завершена (тест)']);
      await view.unmount();
    } finally {
      setOverlayCover(null);
    }
  });
});

describe('date-time field: «today» is the day of the tap (#407)', () => {
  it('«Сегодня» after Moscow midnight on a screen rendered before it gives the new day', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-18T20:57:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const rntl = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
    const { ThemeProvider } = require('@/theme') as typeof import('@/theme');
    const { DateTimeField } = require('@/ui/date-time-field') as typeof import('@/ui/date-time-field');
    const { mskToday } = require('@/domain/moscow-time') as typeof import('@/domain/moscow-time');
    const labels = { clear: 'Очистить', today: 'Сегодня', done: 'Готово', close: 'Закрыть', date: 'Дата', time: 'Время' };
    const changes: string[] = [];
    // The screen renders once, at 23:57 MSK, and never again (no clock tick).
    const today = mskToday();
    expect(today).toBe('2026-11-18');
    const view = await rntl.render(
      <ThemeProvider mode="light">
        <DateTimeField value="" today={today} onChange={(next) => changes.push(next)} placeholder="Дедлайн" labels={labels} testID="deadline" />
      </ThemeProvider>,
    );
    jest.setSystemTime(new Date('2026-11-18T21:02:00.000Z'));
    await rntl.fireEvent.press(view.getByTestId('deadline'));
    await rntl.act(async () => {
      jest.advanceTimersByTime(500);
    });
    await rntl.fireEvent.press(view.getByText('Сегодня'));
    expect(changes).toEqual(['2026-11-19T23:59']);
    await view.unmount();
    jest.useRealTimers();
  });
});

describe('«На главную» from a dead screen inside a tab stack (#411)', () => {
  type State = { index?: number; routes: { name: string; state?: State }[] };
  const navRef = () =>
    (require('expo-router/build/global-state/navigationRef') as { navigationRef: { getRootState(): State; canGoBack(): boolean } }).navigationRef;
  /** Route names of the stack of one tab of the focused role tree. */
  function tabStack(tabName: string): string[] {
    let state: State | undefined = navRef().getRootState();
    while (state && !state.routes.some((route) => route.name === tabName)) state = state.routes[state.index ?? 0]?.state;
    return state?.routes.find((route) => route.name === tabName)?.state?.routes.map((route) => route.name) ?? [];
  }

  // The teacher's «ещё» screen is gone: the groups are a tab of their own, with the group pushed in its stack.
  it('a group deleted elsewhere: 404 → «На главную» → the «группы» tab shows its root again', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher' });
    await app.rntl.act(async () => {
      app.router.navigate('/teacher/groups' as never);
    });
    await app.settle();
    await app.rntl.act(async () => {
      app.router.push('/teacher/groups/grp_empty' as never);
    });
    await app.settle();
    expect(app.path()).toBe('/teacher/groups/grp_empty');
    expect(tabStack('groups').length).toBeGreaterThan(1);

    // Deleted on another device; the open detail re-reads and answers 404.
    await serverCall(app, () => app.runtime.api.groups.deleteGroup('grp_empty'));
    await app.rntl.act(async () => {
      void app.queryClient.invalidateQueries();
    });
    await app.advance(3000);
    await app.settle();
    expect(hasTestId(app, 'not-found')).toBe(true);

    await tap(app, 'button:На главную');
    await app.settle();
    expect(app.path()).toBe('/teacher');
    // The dead screen is gone from the «группы» stack: the tab opens on its root.
    expect(tabStack('groups')).toHaveLength(1);
    // Android back (`canGoBack() ? goBack() : leave the app`) never leads into the dead screen either.
    if (navRef().canGoBack()) {
      await app.rntl.act(async () => {
        (navRef() as unknown as { goBack(): void }).goBack();
      });
      await app.settle();
    }
    expect(byTestId(app, 'not-found')).toBeNull();
    // The way a teacher gets there: the dock.
    await tap(app, '#dock-groups');
    await app.settle();
    expect(app.path()).toBe('/teacher/groups');
    expect(hasTestId(app, 'not-found')).toBe(false);
    expect(hasTestId(app, 'groups-list-screen')).toBe(true);
  });

  it('the home tab itself above its root still returns to its root', async () => {
    const app = await visit({ as: 'dev@example.com', url: '/developer/topics' });
    await app.rntl.act(async () => {
      app.router.push('/developer/topics/top_missing_test' as never);
    });
    await app.settle();
    expect(hasTestId(app, 'not-found')).toBe(true);
    await tap(app, 'button:На главную');
    await app.settle();
    expect(app.path()).toBe('/developer/topics');
    expect(hasTestId(app, 'not-found')).toBe(false);
    expect(tabStack('topics')).toHaveLength(1);
  });
});

describe('progress-history sheet offline (#404)', () => {
  const network = () => require('@/services/network') as typeof import('@/services/network');

  it('«Более ранние записи» parked offline says so; the earlier entries come with the connection', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/students/usr_ilya' });
    await tap(app, '#review-assignment-toggle-hw_ilya_overdue');
    await app.settle();
    // The history link is on the card of one number, which the «Все номера» sheet of the homework shows.
    const homeworks = await serverCall(app, () => app.runtime.api.teacherStudents.getStudentHomeworks('usr_ilya'));
    const numbers = homeworks.assignments.find((assignment) => assignment.id === 'hw_ilya_overdue')?.numbers ?? [];
    let target: { homeworkNumberId: string; number: string } | null = null;
    for (const number of numbers) {
      const page = await serverCall(app, () => app.runtime.api.teacherStudents.getProgressHistory('usr_ilya', number.homeworkNumberId));
      if (page.nextCursor) {
        target = number;
        break;
      }
    }
    expect(target).not.toBeNull();
    if (!target) return;
    await tap(app, '#review-all-numbers-hw_ilya_overdue');
    await tap(app, `#review-numbers-sheet-${target.number}`);
    await tap(app, `#review-number-history-${target.homeworkNumberId}`);
    await app.advance(1500);
    await app.settle();
    expect(hasTestId(app, 'progress-history-sheet')).toBe(true);
    const entries = () => app.screen.queryAllByTestId(/^progress-history-entry-/).length;
    expect(entries()).toBe(20);
    expect(hasTestId(app, 'progress-history-offline')).toBe(false);

    await app.rntl.act(async () => network().setSimulatedOffline(true));
    await tap(app, '#progress-history-earlier');
    for (let i = 0; i < 4; i += 1) await app.advance(1000);
    await app.settle();
    expect(entries()).toBe(20);
    expect(hasTestId(app, 'progress-history-offline')).toBe(true);

    await app.rntl.act(async () => network().setSimulatedOffline(false));
    for (let i = 0; i < 4; i += 1) await app.advance(1000);
    await app.settle();
    expect(hasTestId(app, 'progress-history-offline')).toBe(false);
    expect(entries()).toBeGreaterThan(20);
  });
});
