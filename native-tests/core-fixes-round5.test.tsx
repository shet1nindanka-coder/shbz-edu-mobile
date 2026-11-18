// Round 5, core layer: realtime refreshes that never cancel each other (#416), clocks that read the real
// time after the phone slept (#408).
import { describe, expect, it, jest } from '@jest/globals';

import { visibleText, visit } from './support/drive';
import { setAppState } from './support/fakes';

type Call = { name: string; done: boolean };

/** Records every call of the given ApiClient members, and whether it settled. */
function recordCalls(api: Record<string, unknown>, members: readonly string[], calls: Call[]): void {
  for (const member of members) {
    const target = api[member] as Record<string, unknown>;
    for (const name of Object.keys(target)) {
      const fn = target[name];
      if (typeof fn !== 'function') continue;
      target[name] = (...args: unknown[]) => {
        const call: Call = { name: `${member}.${name}`, done: false };
        calls.push(call);
        const result = (fn as (...values: unknown[]) => unknown)(...args);
        if (result instanceof Promise) {
          result.then(
            () => (call.done = true),
            () => (call.done = true),
          );
        }
        return result;
      };
    }
  }
}

describe('#416 realtime refreshes do not cancel each other', () => {
  it('a live board under a steady stream of events with slow reads shows each change, the last one included', async () => {
    const calls: Call[] = [];
    const app = await visit({
      as: 'teacher@example.com',
      url: '/teacher/lessons/les_live',
      arrange: ({ runtime }) => recordCalls(runtime.api as unknown as Record<string, unknown>, ['planner'], calls),
    });
    const store = app.mock.backend.store;
    const lesson = store.lessons.get('les_live')!;
    app.mock.controls.set('latency', { minMs: 3000, maxMs: 3000 });
    await app.advance(500);
    calls.length = 0;

    const emit = () =>
      app.rntl.act(async () => {
        app.mock.backend.emit({ kind: 'lesson-activity', lessonId: 'les_live', teacherId: lesson.teacherId, studentId: 'usr_polina' } as never);
      });

    store.lessons.update('les_live', { title: 'Первое новое название' });
    // Events every second, reads take 3 s: before the fix every flush cancelled the read before it.
    for (let second = 0; second < 15; second += 1) {
      await emit();
      await app.advance(1000);
    }
    // The change lands while the stream is still going.
    expect(visibleText(app)).toContain('Первое новое название');

    store.lessons.update('les_live', { title: 'Последнее название' });
    for (let second = 0; second < 15; second += 1) {
      await emit();
      await app.advance(1000);
    }
    // The change behind the last event of the burst is not lost: flush + the running read + one follow-up.
    await app.advance(1500 + 3000 + 3000 + 500);
    expect(visibleText(app)).toContain('Последнее название');

    const boardReads = calls.filter((call) => call.name === 'planner.getLessonBoard');
    // Nothing is thrown away: every read finished, and a 3 s read every ~3 s is all it took (no storm).
    expect(boardReads.every((call) => call.done)).toBe(true);
    expect(boardReads.length).toBeLessThanOrEqual(16);
    expect(app.queryClient.isFetching()).toBe(0);
  });

  it('one lesson event costs one board read: the live-signature refresh joins the read the event started', async () => {
    const calls: Call[] = [];
    const app = await visit({
      as: 'teacher@example.com',
      url: '/teacher/lessons/les_live',
      arrange: ({ runtime }) => recordCalls(runtime.api as unknown as Record<string, unknown>, ['planner'], calls),
    });
    await app.advance(20_000);
    const store = app.mock.backend.store;
    const lesson = store.lessons.get('les_live')!;
    const participant = store.participants.by('lessonId', 'les_live')[0]!;
    const boardKey = ['planner', 'getLessonBoard', 'les_live'];
    const updatesBefore = app.queryClient.getQueryState(boardKey)?.dataUpdateCount ?? 0;
    calls.length = 0;
    store.participants.update(participant.id, { joinedAt: new Date(Date.now()).toISOString() });
    await app.rntl.act(async () => {
      app.mock.backend.emit({ kind: 'lesson-activity', lessonId: 'les_live', teacherId: lesson.teacherId, studentId: participant.studentId } as never);
    });
    await app.advance(8000);
    const boardReads = calls.filter((call) => call.name === 'planner.getLessonBoard');
    // The event's read plus at most the follow-up of the live-signature refresh — and none was cancelled.
    expect(boardReads.length).toBeGreaterThanOrEqual(1);
    expect(boardReads.length).toBeLessThanOrEqual(2);
    // Every read that was sent reached the cache: before the fix the live-signature refetch cancelled the
    // read the event had started ~250 ms earlier and its answer was thrown away.
    const updatesAfter = app.queryClient.getQueryState(boardKey)?.dataUpdateCount ?? 0;
    expect(updatesAfter - updatesBefore).toBe(boardReads.length);
  });
});

describe('#408 clocks after the phone slept', () => {
  it('useNowTick / useServerNow show the wall-clock time on waking, before the frozen timer fires', async () => {
    // 23:50 MSK on 18.11. Android timers count monotonic time that stands still in deep sleep: the
    // emulation moves the wall clock without running any timer.
    jest.useFakeTimers({ now: new Date('2026-11-18T20:50:10.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const rntl = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
      const { useNowTick, useServerNow } = require('@/services/clock') as typeof import('@/services/clock');
      const renders: number[] = [];
      const hook = await rntl.renderHook(() => {
        const tick = useNowTick(60_000);
        const server = useServerNow(0, 30_000);
        renders.push(tick);
        return { tick, server };
      });
      expect(hook.result.current.tick).toBe(Date.parse('2026-11-18T20:50:00.000Z'));
      await rntl.act(async () => {
        setAppState('background');
      });
      // 08:00:20 MSK on 19.11.
      jest.setSystemTime(new Date('2026-11-19T05:00:20.000Z'));
      await rntl.act(async () => {
        setAppState('active');
      });
      expect(hook.result.current.tick).toBe(Date.parse('2026-11-19T05:00:00.000Z'));
      expect(hook.result.current.server).toBe(Date.parse('2026-11-19T05:00:00.000Z'));
      // The ticks keep following the wall clock afterwards (aligned to the minute, not counted).
      await rntl.act(async () => {
        jest.advanceTimersByTime(40_000);
      });
      expect(hook.result.current.tick).toBe(Date.parse('2026-11-19T05:01:00.000Z'));
      await hook.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('any re-render after waking (a refetch landing) already reads the current time', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-18T20:50:10.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const rntl = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
      const { useNowTick } = require('@/services/clock') as typeof import('@/services/clock');
      const hook = await rntl.renderHook(({ data }: { data: number }) => ({ data, now: useNowTick(60_000) }), { initialProps: { data: 1 } });
      jest.setSystemTime(new Date('2026-11-19T05:00:20.000Z'));
      await hook.rerender({ data: 2 });
      expect(hook.result.current.now).toBe(Date.parse('2026-11-19T05:00:00.000Z'));
      await hook.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
