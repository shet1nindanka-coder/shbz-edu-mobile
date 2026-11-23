// Student area, fifth round of fixes, on the native tree (iOS and Android projects).
//
// #405: the streak block of the home screen repeated the day of the cached response as "today" on a later
//       Moscow day (a cold start offline from the persisted cache, or a screen left open over midnight):
//       «Сегодня сделано» kept that day's count and the week marked that day as today.
//       The streak now lives in the «За неделю» card of «Обзор» (the bar of today, the line «Сегодня: …» and
//       the streak chip); the app bar has no streak pill any more.
// Sweep: a re-read the student screens start because the SERVER side changed (the return to a tab, a poll
//       that saw a finished check, a schedule edge) no longer cancels a read already on its way.
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, visibleText, visit } from './support/drive';
import type { HostNode } from './support/tree';

function textIn(node: HostNode | null): string {
  return node ? visibleText({ screen: { container: node } } as never).replace(/\s+/g, ' ').trim() : '';
}

function label(node: HostNode | null): string {
  return node ? String((node.props as { accessibilityLabel?: unknown }).accessibilityLabel ?? '') : '';
}

/** The bar of today in «За неделю»: the column that carries the spoken name of the day (its caption is the testID). */
const todayColumn = (app: Parameters<typeof byTestId>[0]): HostNode | null => byTestId(app, 'streak-week-today')?.parent ?? null;

describe('#405 streak block on a later Moscow day', () => {
  it('shows nothing solved today and marks the real day, while the cached streak is not re-read', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student' });
    const streakKey = ['shell', 'getStreak'];
    const cached = app.queryClient.getQueryData<{ streak: { dailyActivity: { date: string; count: number }[]; solvedToday: number } }>(streakKey)?.streak;
    expect(cached).toBeDefined();
    // The last cell is the server's today and carries the server's count.
    const lastDay = cached!.dailyActivity.at(-1)!;
    const todayBefore = label(todayColumn(app));
    expect(todayBefore).not.toBe('');
    // ilya closed a problem on the server's today: the panel shows it before the day changes.
    expect(cached!.solvedToday).toBeGreaterThan(0);
    expect(textIn(byTestId(app, 'streak-solved-today'))).toMatch(/^Сегодня: \d+ номер/);
    const updatedAt = app.queryClient.getQueryState(streakKey)?.dataUpdatedAt;

    // A day later on the wall clock (as after a night's sleep), with no read made: the streak is the
    // cached response of `lastDay`.
    jest.setSystemTime(Date.now() + 24 * 3600_000);
    await app.advance(60_000);

    expect(app.queryClient.getQueryState(streakKey)?.dataUpdatedAt).toBe(updatedAt);
    expect(app.queryClient.getQueryData<{ streak: { dailyActivity: { date: string }[] } }>(streakKey)?.streak.dailyActivity.at(-1)?.date).toBe(lastDay.date);
    expect(textIn(byTestId(app, 'streak-solved-today'))).toBe('Сегодня: без закрытых номеров');
    const todayAfter = label(todayColumn(app));
    expect(todayAfter).not.toBe(todayBefore);
    // The new day is the last cell, and nothing was closed on it.
    expect(todayAfter).toMatch(/нет закрытых номеров/);
  });
});

describe('#405 review: the streak chip of «За неделю» counts the cached streak on the current Moscow day', () => {
  it('two Moscow days later the chip is gone and today is empty, with no read made', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student' });
    const streakKey = ['shell', 'getStreak'];
    const cached = app.queryClient.getQueryData<{ streak: { currentStreak: number } }>(streakKey)?.streak;
    expect(cached!.currentStreak).toBeGreaterThan(0);
    // «5 дней» on the chip, «5 дней подряд» for a screen reader.
    expect(label(byTestId(app, 'streak-chip'))).toMatch(new RegExp(`^${cached!.currentStreak} д\\S+ подряд`));
    expect(textIn(byTestId(app, 'streak-chip'))).toMatch(new RegExp(`^${cached!.currentStreak} д`));
    await app.open('/student/homeworks');
    await app.settle();
    const updatedAt = app.queryClient.getQueryState(streakKey)?.dataUpdatedAt;

    // Offline from now on: every streak read hangs, so the card can only show the cached response.
    const shell = (app.runtime.api as unknown as Record<string, Record<string, unknown>>).shell;
    shell.getStreak = () => new Promise(() => undefined);
    // Two days later with no read made: the cached streak (whose last day was active) has lapsed.
    jest.setSystemTime(Date.now() + 48 * 3600_000);
    await app.advance(60_000);
    expect(app.queryClient.getQueryState(streakKey)?.dataUpdatedAt).toBe(updatedAt);

    // Back on the overview (its streak re-read hangs, so the screen never "settles").
    await app.rntl.act(async () => {
      app.router.navigate('/student' as never);
    });
    await app.advance(3000);
    expect(app.queryClient.getQueryState(streakKey)?.dataUpdatedAt).toBe(updatedAt);
    expect(byTestId(app, 'home-streak')).not.toBeNull();
    // A lapsed streak has no chip, and the new day has nothing closed on it.
    expect(byTestId(app, 'streak-chip')).toBeNull();
    expect(textIn(byTestId(app, 'streak-solved-today'))).toBe('Сегодня: без закрытых номеров');
    expect(label(todayColumn(app))).toMatch(/нет закрытых номеров/);
  });
});

describe('server-driven re-reads keep a read in flight', () => {
  it('returning to the homework list does not cancel a list read already on its way', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student/homeworks' });
    const member = (app.runtime.api as unknown as Record<string, Record<string, unknown>>).studentWork;
    const original = member.listHomeworks as (options?: { signal?: AbortSignal }) => Promise<unknown>;
    const signals: AbortSignal[] = [];
    member.listHomeworks = (options?: { signal?: AbortSignal }) => {
      if (options?.signal) signals.push(options.signal);
      // A slow network: the answer arrives 3 s after the mock produced it.
      return original(options).then((value) => new Promise((resolve) => setTimeout(() => resolve(value), 3000)));
    };

    await app.open('/student');
    // The list is stale by now; a realtime re-read of it starts while the student is on the home tab.
    await app.advance(20_000);
    void app.queryClient.refetchQueries({ queryKey: ['studentWork', 'listHomeworks'], exact: true });
    await app.advance(100);
    expect(signals).toHaveLength(1);

    // Back on the list while that read is still on its way.
    await app.open('/student/homeworks');
    await app.settle();

    expect(signals[0]!.aborted).toBe(false);
    expect(byTestId(app, 'student-homeworks-screen')).not.toBeNull();
  });
});
