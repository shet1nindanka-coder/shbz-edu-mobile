// The synchronous re-entrancy guard of Button / TextButton: two presses handled back to back (the JS thread
// was busy while the user tapped again) run the handler once.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPressGuard } from '../src/ui/internal/press-guard';

function manualScheduler() {
  const queued: (() => void)[] = [];
  return {
    schedule: (release: () => void) => {
      queued.push(release);
    },
    run: () => {
      for (const release of queued.splice(0)) release();
    },
  };
}

describe('press guard', () => {
  it('drops a second press handled before the next macrotask', () => {
    const tick = manualScheduler();
    const guard = createPressGuard(tick.schedule);
    let calls = 0;
    const handler = () => {
      calls += 1;
    };
    guard.press(handler, 'tap 1');
    guard.press(handler, 'tap 2');
    assert.equal(calls, 1);
    tick.run();
    guard.press(handler, 'tap 3');
    assert.equal(calls, 2);
  });

  it('with the real scheduler: back-to-back presses create one entity, a later press another', async () => {
    const guard = createPressGuard();
    let created = 0;
    const submit = () => {
      created += 1;
    };
    guard.press(submit, null);
    guard.press(submit, null);
    assert.equal(created, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    guard.press(submit, null);
    assert.equal(created, 2);
  });

  it('keeps the lock while a returned promise is pending', async () => {
    const tick = manualScheduler();
    const guard = createPressGuard(tick.schedule);
    let finish: () => void = () => undefined;
    let calls = 0;
    const handler = () => {
      calls += 1;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    };
    guard.press(handler, null);
    tick.run();
    guard.press(handler, null);
    assert.equal(calls, 1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    tick.run();
    guard.press(handler, null);
    assert.equal(calls, 2);
  });

  it('releases after a rejected promise and after a throwing handler', async () => {
    const tick = manualScheduler();
    const guard = createPressGuard(tick.schedule);
    let calls = 0;
    guard.press(() => {
      calls += 1;
      return Promise.reject(new Error('refused'));
    }, null);
    await Promise.resolve();
    await Promise.resolve();
    tick.run();
    assert.equal(guard.isLocked(), false);
    assert.throws(() =>
      guard.press(() => {
        calls += 1;
        throw new Error('boom');
      }, null),
    );
    assert.equal(guard.isLocked(), false);
    assert.equal(calls, 2);
  });

  it('ignores a missing handler without locking', () => {
    const guard = createPressGuard(() => undefined);
    guard.press(undefined, null);
    assert.equal(guard.isLocked(), false);
  });
});
