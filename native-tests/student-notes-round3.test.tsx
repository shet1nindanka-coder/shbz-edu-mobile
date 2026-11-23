// The notes pipeline on the native tree after the third bug hunt (states in src/services/query/pending-writes.ts):
// - two editors of one number (homework card and number screen): the text typed last, in either of them, is
//   the one that lands — a draft is never held back inside one editor while the other writes a newer one;
// - an editor whose number the other editor is simply saving says «Сохраняем…», not «Не сохранено, повторим»;
// - a flush asked for while another one runs makes it do one more pass (a note is never stuck online);
// - «use password» on the lock screen keeps the unsent drafts for the same student;
// - a stored draft of the wrong shape never breaks a screen.
import { describe, expect, it } from '@jest/globals';

import { byTestId, fill, hasTestId, pressTestId, typeTestId, visibleText, visit } from './support/drive';
import { passwordFor, type AppHandle } from './support/launch';
import { showHomeworkNumber } from './support/student';

const ILYA = 'ilya@example.com';
const HW = '/student/homeworks/hw_ilya_overdue';
const NUM = '/student/numbers/120';
/** The user cached by an earlier session: an offline start restores it (and the lock covers it). */
const CACHED_ILYA = JSON.stringify({ id: 'usr_ilya', name: 'Илья Смирнов', email: ILYA, role: 'STUDENT', createdAt: '2026-07-20T07:30:00.000Z' });
const STATUS = /Не сохранено, повторим|Сохраним при подключении|Сохраняем…|Сохранено/;

function network() {
  return require('@/services/network') as typeof import('@/services/network'); // eslint-disable-line @typescript-eslint/no-require-imports
}

const valueOf = (app: AppHandle, testID: string) => (byTestId(app, testID)?.props as { value?: string } | undefined)?.value;

async function serverNote(app: AppHandle, number: string): Promise<string> {
  app.mock.controls.set('latency', { minMs: 300, maxMs: 300 });
  const detail = app.mock.studentStudy.getNumberDetail(number);
  await app.advance(1500);
  return (await detail).number.note;
}

async function type(app: AppHandle, testID: string, text: string): Promise<void> {
  await app.rntl.act(async () => {
    app.rntl.fireEvent.changeText(byTestId(app, testID) as never, text);
  });
}

async function blur(app: AppHandle, testID: string): Promise<void> {
  await app.rntl.act(async () => {
    app.rntl.fireEvent(byTestId(app, testID) as never, 'blur', { nativeEvent: {} });
  });
}

function statusText(app: AppHandle, testID: string): string | null {
  const node = byTestId(app, testID);
  if (!node) return null;
  const texts: string[] = [];
  const walk = (current: unknown) => {
    if (typeof current === 'string') texts.push(current);
    else if (current && typeof current === 'object') for (const child of (current as { children?: unknown[] }).children ?? []) walk(child);
  };
  walk(node);
  return texts.join('').match(STATUS)?.[0] ?? null;
}

describe('two editors of one number: the text typed last lands', () => {
  it('number screen → homework card: the card text typed after a slow save is not overwritten by the number screen draft', async () => {
    const app = await visit({ as: ILYA, url: HW });
    // The homework shows one number card: № 120 is chosen in the strip and stays chosen under the pushed screen.
    await showHomeworkNumber(app, '120');
    await app.rntl.act(async () => {
      app.router.push(NUM);
    });
    await app.settle();
    app.mock.controls.set('latency', { minMs: 2500, maxMs: 2500 });
    await type(app, 'number-note-input', 'номер 1');
    await app.advance(700); // save #1 in flight
    await type(app, 'number-note-input', 'номер 1 и 2');
    await app.advance(300);
    // Back to the homework: blur and leaving submit the newer draft at once.
    await blur(app, 'number-note-input');
    await app.rntl.act(async () => {
      app.router.back();
    });
    await app.advance(300);
    // The card follows the newest draft and does not claim a failure while it is being saved.
    expect(valueOf(app, 'number-note-120')).toBe('номер 1 и 2');
    expect(statusText(app, 'number-note-status-120')).not.toBe('Не сохранено, повторим');

    await type(app, 'number-note-120', 'карточка новая');
    await app.advance(700);
    for (let second = 0; second < 10; second += 1) await app.advance(1000);
    await app.settle();
    expect(await serverNote(app, '120')).toBe('карточка новая');
    await app.advance(3000);
    await app.settle();
    expect(valueOf(app, 'number-note-120')).toBe('карточка новая');
    expect(await app.runtime.storage.getItem('shbz-pending-writes')).toBeNull();
  });

  it('homework card → number screen: the note typed on the number screen is not overwritten by the card draft', async () => {
    const app = await visit({ as: ILYA, url: HW });
    await showHomeworkNumber(app, '120');
    await app.open(NUM);
    await app.rntl.act(async () => {
      app.router.back();
    });
    await app.settle();

    app.mock.controls.set('latency', { minMs: 4000, maxMs: 4000 });
    await type(app, 'number-note-120', 'карточка 1');
    await app.advance(700); // save #1 in flight (4 s)
    await type(app, 'number-note-120', 'карточка 2');
    await app.advance(700); // submitted at once: the queue sends it after #1
    await blur(app, 'number-note-120');
    app.mock.controls.set('latency', { minMs: 300, maxMs: 300 });
    await app.rntl.act(async () => {
      app.router.push(NUM);
    });
    await app.advance(400);
    // The number screen opens with the newest draft, and «saving», not «not saved, retrying».
    expect(valueOf(app, 'number-note-input')).toBe('карточка 2');
    expect(statusText(app, 'number-note-status')).not.toBe('Не сохранено, повторим');

    await type(app, 'number-note-input', 'новая заметка');
    await app.advance(700);
    await blur(app, 'number-note-input');
    for (let second = 0; second < 10; second += 1) await app.advance(1000);
    await app.settle();
    expect(await serverNote(app, '120')).toBe('новая заметка');
    await app.advance(3000);
    await app.settle();
    expect(valueOf(app, 'number-note-input')).toBe('новая заметка');
  });
});

describe('a flush asked for while another one runs', () => {
  it('a note that failed with 503 during a slow reconnect flush is sent by itself, online, without any other event', async () => {
    const app = await visit({ as: ILYA, url: NUM });
    await app.open('/student/numbers/118');
    await app.rntl.act(async () => network().setSimulatedOffline(true));
    await fill(app, '#number-note-input', 'офлайн 118');
    await app.advance(700);
    await app.settle();
    await app.advance(6000); // its 5 s retry fires offline: left to the reconnect
    await app.settle();
    await app.open(NUM);
    // The reconnect flush carries 118's draft over a slow server.
    app.mock.controls.set('latency', { minMs: 20000, maxMs: 20000 });
    await app.rntl.act(async () => network().setSimulatedOffline(false));
    await app.advance(10);
    app.mock.controls.set('latency', { minMs: 300, maxMs: 300 });
    app.mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'serviceUnavailable', times: 1 });
    await fill(app, '#number-note-input', 'заметка 120');
    await app.advance(1200);
    await app.advance(25_000);
    await app.settle();
    for (let minute = 0; minute < 3; minute += 1) await app.advance(60_000);
    await app.settle();
    expect(await serverNote(app, '120')).toBe('заметка 120');
    expect(await serverNote(app, '118')).toBe('офлайн 118');
    expect(await app.runtime.storage.getItem('shbz-pending-writes')).toBeNull();
  });
});

describe('«use password» on the lock screen', () => {
  it('keeps the unsent drafts for the same student, who gets them delivered after signing in again', async () => {
    const draft = [{ kind: 'studentStudy.saveNumberNote', id: 'num_301', userId: 'usr_ilya', createdAt: 1, updatedAt: 1, attempts: 1, payload: { note: 'черновик офлайн' } }];
    const app = await visit({
      as: ILYA,
      url: '/student/homeworks/hw_ilya_open',
      expectPath: null,
      storage: {
        'shbz-app-device': JSON.stringify({ biometricLock: true }),
        'shbz-pending-writes': JSON.stringify(draft),
        'shbz-session-user': CACHED_ILYA,
      },
      arrange: () => network().setSimulatedOffline(true),
      device: (state) => {
        state.biometrics.nextResult = { success: false, error: 'user_cancel' };
      },
    });
    expect(hasTestId(app, 'lock-screen')).toBe(true);
    await pressTestId(app, 'lock-use-password');
    await app.settle();
    expect(app.path()).toBe('/login');
    expect(await app.runtime.storage.getItem('shbz-pending-writes')).toContain('черновик офлайн');

    await app.rntl.act(async () => network().setSimulatedOffline(false));
    await typeTestId(app, 'login-input', ILYA);
    await typeTestId(app, 'password-input', passwordFor(ILYA));
    await pressTestId(app, 'login-submit');
    await app.settle();
    expect(await serverNote(app, '301')).toBe('черновик офлайн');
    expect(await app.runtime.storage.getItem('shbz-pending-writes')).toBeNull();
  });

  it('another student signing in next never gets them', async () => {
    const draft = [{ kind: 'studentStudy.saveNumberNote', id: 'num_301', userId: 'usr_ilya', createdAt: 1, updatedAt: 1, attempts: 1, payload: { note: 'личный черновик' } }];
    const app = await visit({
      as: ILYA,
      url: '/student',
      storage: { 'shbz-app-device': JSON.stringify({ biometricLock: true }), 'shbz-pending-writes': JSON.stringify(draft), 'shbz-session-user': CACHED_ILYA },
      arrange: () => network().setSimulatedOffline(true),
      device: (state) => {
        state.biometrics.nextResult = { success: false, error: 'user_cancel' };
      },
    });
    await pressTestId(app, 'lock-use-password');
    await app.settle();
    await app.rntl.act(async () => network().setSimulatedOffline(false));
    await typeTestId(app, 'login-input', 'maria@example.com');
    await typeTestId(app, 'password-input', passwordFor('maria@example.com'));
    await pressTestId(app, 'login-submit');
    await app.settle();
    expect(await app.runtime.storage.getItem('shbz-pending-writes')).toBeNull();
    expect(visibleText(app)).not.toContain('личный черновик');
  });
});

describe('Settings sign-out', () => {
  it('still deletes the unsent drafts once the student confirmed it', async () => {
    const app = await visit({ as: ILYA, url: '/student/numbers/118' });
    await app.rntl.act(async () => network().setSimulatedOffline(true));
    await fill(app, '#number-note-input', 'удалить при выходе');
    await app.advance(700);
    await app.settle();
    await app.open('/settings');
    await pressTestId(app, 'settings-logout');
    await app.settle();
    expect(app.path()).toBe('/settings');
    expect(hasTestId(app, 'settings-logout-confirm')).toBe(true);
    // The dialog's confirm button (rendered after the settings row of the same label).
    const confirm = app.screen.getAllByRole('button', { name: 'Выйти' }).at(-1);
    await app.rntl.act(async () => {
      app.rntl.fireEvent.press(confirm as never);
    });
    await app.settle();
    expect(app.path()).toBe('/login');
    expect(await app.runtime.storage.getItem('shbz-pending-writes')).toBeNull();
  });
});

describe('a stored draft of the wrong shape', () => {
  for (const payload of [null, { note: 5 }]) {
    it(`(${JSON.stringify(payload)}) is dropped: the homework and number screens render`, async () => {
      const bad = [{ kind: 'studentStudy.saveNumberNote', id: 'num_301', userId: 'usr_ilya', createdAt: 1, updatedAt: 1, attempts: 0, payload }];
      const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_open', storage: { 'shbz-pending-writes': JSON.stringify(bad) } });
      // 301 is solved, so it is not in the strip: its card is reached through «Все номера».
      await showHomeworkNumber(app, '301');
      expect(hasTestId(app, 'number-card-301')).toBe(true);
      expect(visibleText(app)).not.toContain('Раздел временно недоступен');
      await app.open('/student/numbers/301');
      expect(hasTestId(app, 'number-note-input')).toBe(true);
      expect(await app.runtime.storage.getItem('shbz-pending-writes')).toBeNull();
    });
  }
});
