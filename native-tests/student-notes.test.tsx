// The student's note and the pending-writes queue on the native tree, driven through the UI against the
// in-process mock server (states of the queue: src/services/query/pending-writes.ts):
// - a save that got no answer while the device is online is re-sent by itself and on blur;
// - a session expiry keeps the draft for the same student (queued offline or being typed), never for another;
// - two editors of the same number (homework card and number screen) agree on the queued draft;
// - a draft refused in the background is shown with its error the next time its editor mounts.
import { describe, expect, it } from '@jest/globals';

import { byTestId, fill, hasTestId, pressTestId, typeTestId, visibleText, visit } from './support/drive';
import { passwordFor, type AppHandle } from './support/launch';
import { textOf } from './support/tree';

const ILYA = 'ilya@example.com';

/** Runs a mock call while the fake clock moves (the mock sleeps its latency on that clock). */
async function call<T>(app: AppHandle, request: () => Promise<T>): Promise<T> {
  const pending = request();
  await app.advance(1500);
  return pending;
}

async function serverNote(app: AppHandle, number: string): Promise<string> {
  const detail = await call(app, () => app.mock.studentStudy.getNumberDetail(number));
  return detail.number.note;
}

function inputValue(app: AppHandle, testID: string): string | undefined {
  return (byTestId(app, testID)?.props as { value?: string } | undefined)?.value;
}

function network() {
  return require('@/services/network') as typeof import('@/services/network'); // eslint-disable-line @typescript-eslint/no-require-imports
}

function pendingStorage(app: AppHandle): Promise<string | null> {
  return app.runtime.storage.getItem('shbz-pending-writes');
}

async function signInAgain(app: AppHandle, login: string): Promise<void> {
  expect(app.path()).toBe('/login');
  await typeTestId(app, 'login-input', login);
  await typeTestId(app, 'password-input', passwordFor(login));
  await pressTestId(app, 'login-submit');
  await app.settle();
}

describe('a note save without an answer while online', () => {
  it('is re-sent by the queue itself, and the status does not claim the device is offline', async () => {
    const app = await visit({
      as: ILYA,
      url: '/student/numbers/118',
      arrange: ({ mock }) => mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'network', times: 1 }),
    });
    await fill(app, '#number-note-input', 'заметка после сбоя');
    await app.advance(700);
    await app.settle();
    expect(app.mock.controls.get().forceNextError).toBeNull();
    const text = visibleText(app);
    expect(text).toContain('Не сохранено, повторим');
    expect(text).not.toContain('Сохраним при подключении');

    // The backoff's first try (5 s) delivers it without any reconnect or foreground event.
    await app.advance(6000);
    await app.settle();
    expect(await serverNote(app, '118')).toBe('заметка после сбоя');
    expect(await pendingStorage(app)).toBeNull();
    expect(visibleText(app)).not.toContain('Не сохранено, повторим');
  });

  it('blur sends a draft that already waits in the queue right away', async () => {
    const app = await visit({
      as: ILYA,
      url: '/student/numbers/118',
      arrange: ({ mock }) => mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'network', times: 1 }),
    });
    await fill(app, '#number-note-input', 'заметка по blur');
    await app.advance(700);
    await app.settle();
    expect(await serverNote(app, '118')).not.toBe('заметка по blur');
    const node = byTestId(app, 'number-note-input');
    await app.rntl.fireEvent(node as never, 'blur');
    await app.advance(1500);
    expect(await serverNote(app, '118')).toBe('заметка по blur');
  });
});

describe('a note when the session expires', () => {
  it('a draft queued offline is delivered after the same student signs in again', async () => {
    const app = await visit({ as: ILYA, url: '/student/numbers/118' });
    await app.rntl.act(async () => network().setSimulatedOffline(true));
    await fill(app, '#number-note-input', 'офлайн заметка');
    await app.advance(700);
    await app.settle();
    expect(visibleText(app)).toContain('Сохраним при подключении');

    app.mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'sessionExpired', times: 1 });
    await app.rntl.act(async () => network().setSimulatedOffline(false));
    await app.settle();
    expect(app.path()).toBe('/login');
    expect(await pendingStorage(app)).toContain('офлайн заметка'); // kept on the device, not deleted

    await signInAgain(app, ILYA);
    await app.settle();
    expect(await serverNote(app, '118')).toBe('офлайн заметка');
    expect(await pendingStorage(app)).toBeNull();
  });

  it('the text being typed when its save meets the expiry is kept and delivered for the same student', async () => {
    const app = await visit({
      as: ILYA,
      url: '/student/numbers/118',
      arrange: ({ mock }) => mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'sessionExpired', times: 1 }),
    });
    await fill(app, '#number-note-input', 'текст в момент 401');
    await app.advance(700);
    await app.settle();
    expect(app.path()).toBe('/login');

    await signInAgain(app, ILYA);
    expect(await serverNote(app, '118')).toBe('текст в момент 401');
  });

  it('the text still in the typing pause when another request meets the expiry is kept too', async () => {
    const app = await visit({ as: ILYA, url: '/student/numbers/118' });
    // Typed, no blur, no time passing: the debounce still holds the text.
    const node = byTestId(app, 'number-note-input');
    await app.rntl.act(async () => {
      app.rntl.fireEvent.changeText(node as never, 'не успел сохранить');
    });
    // Another request of the tree answers 401 before the debounce has sent the note.
    app.mock.controls.set('forceNextError', { method: '*', error: 'sessionExpired', times: 1 });
    await app.rntl.act(async () => {
      void app.queryClient.refetchQueries();
    });
    await app.settle();
    expect(app.path()).toBe('/login');
    expect(await pendingStorage(app)).toContain('не успел сохранить');

    await signInAgain(app, ILYA);
    expect(await serverNote(app, '118')).toBe('не успел сохранить');
  });

  it('another student signing in never gets the draft: it is dropped from the device', async () => {
    const app = await visit({ as: ILYA, url: '/student/numbers/118' });
    const before = await serverNote(app, '118');
    await app.rntl.act(async () => network().setSimulatedOffline(true));
    await fill(app, '#number-note-input', 'личная заметка Ильи');
    await app.advance(700);
    await app.settle();
    app.mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'sessionExpired', times: 1 });
    await app.rntl.act(async () => network().setSimulatedOffline(false));
    await app.settle();
    expect(app.path()).toBe('/login');

    await signInAgain(app, 'maria@example.com');
    await app.settle();
    expect(await pendingStorage(app)).toBeNull();
    expect(visibleText(app)).not.toContain('личная заметка Ильи');
    // Ilya's note on the server is untouched (nothing was sent with Maria's session either).
    const { token } = await call(app, () => app.mock.shell.login({ login: ILYA, password: passwordFor(ILYA) }));
    app.runtime.setSessionToken(token);
    expect(await serverNote(app, '118')).toBe(before);
  });
});

describe('two editors of the same number', () => {
  it('the homework card shows the draft queued on the number screen and does not overwrite it', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_overdue' });
    const original = inputValue(app, 'number-note-120');
    expect(original).toBeDefined();
    await app.open('/student/numbers/120');
    await app.rntl.act(async () => network().setSimulatedOffline(true));
    await fill(app, '#number-note-input', 'с экрана номера');
    await app.advance(700);
    await app.settle();

    // The card (still mounted in the homework tab) follows the queued draft.
    await app.rntl.act(async () => {
      app.router.back();
    });
    await app.settle();
    expect(app.path()).toBe('/student/homeworks/hw_ilya_overdue');
    expect(inputValue(app, 'number-note-120')).toBe('с экрана номера');

    await app.rntl.act(async () => network().setSimulatedOffline(false));
    await app.settle();
    expect(await serverNote(app, '120')).toBe('с экрана номера');
  });
});

describe('a draft refused in the background', () => {
  it('is not lost: its editor shows it with the error next time, and «Повторить» saves it', async () => {
    const app = await visit({ as: ILYA, url: '/student/numbers/118' });
    await app.rntl.act(async () => network().setSimulatedOffline(true));
    await fill(app, '#number-note-input', 'отклонённая заметка');
    await app.advance(700);
    await app.settle();
    await app.open('/student');

    // A refusal (403), not a passing 503: the queue never sends it again by itself.
    app.mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'unauthorized', times: 1 });
    await app.rntl.act(async () => network().setSimulatedOffline(false));
    await app.settle();
    expect(app.mock.controls.get().forceNextError).toBeNull();
    expect(await serverNote(app, '118')).not.toBe('отклонённая заметка');

    await app.open('/student/numbers/118');
    expect(inputValue(app, 'number-note-input')).toBe('отклонённая заметка');
    expect(byTestId(app, 'number-note-error')).not.toBeNull();
    await pressTestId(app, 'number-note-retry');
    await app.settle();
    expect(await serverNote(app, '118')).toBe('отклонённая заметка');
    expect(byTestId(app, 'number-note-error')).toBeNull();
  });

  it('a passing 503 is not a refusal: the draft is sent again by itself, and settings never call it waiting forever', async () => {
    const app = await visit({ as: ILYA, url: '/student/numbers/118' });
    await app.rntl.act(async () => network().setSimulatedOffline(true));
    await fill(app, '#number-note-input', 'после 503');
    await app.advance(700);
    await app.settle();
    await app.open('/student');

    app.mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'serviceUnavailable', times: 1 });
    await app.rntl.act(async () => network().setSimulatedOffline(false));
    await app.settle();
    expect(app.mock.controls.get().forceNextError).toBeNull();
    // The queue's backoff re-sends it.
    await app.advance(60_000);
    await app.settle();
    expect(await serverNote(app, '118')).toBe('после 503');
    await app.open('/settings');
    expect(hasTestId(app, 'settings-pending-writes')).toBe(false);
    expect(hasTestId(app, 'settings-refused-writes')).toBe(false);
  });

  it('settings name a refused draft as not saved, not as waiting to be sent', async () => {
    const app = await visit({ as: ILYA, url: '/student/numbers/118' });
    await app.rntl.act(async () => network().setSimulatedOffline(true));
    await fill(app, '#number-note-input', 'не принята');
    await app.advance(700);
    await app.settle();
    await app.open('/student');
    app.mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'unauthorized', times: 1 });
    await app.rntl.act(async () => network().setSimulatedOffline(false));
    await app.settle();

    await app.open('/settings');
    expect(hasTestId(app, 'settings-pending-writes')).toBe(false);
    expect(textOf(byTestId(app, 'settings-refused-writes')!)).toContain('не сохранено');
  });
});
