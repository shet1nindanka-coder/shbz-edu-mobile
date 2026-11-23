// Session isolation, round 4: a request still in flight when one student signs out never acts on the
// student who signs in next (#300 / #303); its 401 never signs that student out (#304); a sign-out that
// could not remove the stored token says so on the login screen (#345); and sign-out → sign-in cycles do
// not pile up orphaned queries with 24-hour timers (#309).
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, tap, visibleText, visit } from './support/drive';
import { device } from './support/fakes';
import { passwordFor, type AppHandle, type PersonaLogin } from './support/launch';
import { showHomeworkNumber } from './support/student';

async function press(app: AppHandle, id: string, waitMs = 800): Promise<void> {
  const node = byTestId(app, id);
  if (!node) throw new Error(`no #${id} at ${app.path()}`);
  await app.rntl.act(async () => {
    app.rntl.fireEvent.press(node as never);
  });
  await app.advance(waitMs);
}

async function type(app: AppHandle, id: string, text: string): Promise<void> {
  const node = byTestId(app, id);
  if (!node) throw new Error(`no #${id} at ${app.path()}`);
  await app.rntl.act(async () => {
    app.rntl.fireEvent.changeText(node as never, text);
  });
  await app.advance(50);
}

async function signIn(app: AppHandle, login: PersonaLogin): Promise<void> {
  await type(app, 'login-input', login);
  await type(app, 'password-input', passwordFor(login));
  await press(app, 'login-submit');
}

type StorageLike = { setItem: (key: string, value: string) => Promise<void> };

/** Reads through the raw mock client with the token installed now (outside the app's guard). */
async function now<T>(app: AppHandle, call: () => Promise<T>): Promise<T> {
  const pending = call();
  await app.advance(1500);
  return pending;
}

describe('session isolation, round 4', () => {
  it("a note dasha sent before signing out does not land in ilya's account (#303)", async () => {
    const app = await visit({ as: 'dasha@example.com', url: '/student/homeworks/hw_dasha_first' });
    // The homework shows one number card: № 113 is chosen in the strip first.
    await showHomeworkNumber(app, '113');
    app.mock.controls.set('latency', { minMs: 8000, maxMs: 8000 });
    await type(app, 'number-note-113', 'Даша: личная заметка');
    await app.advance(1200); // the debounce sends it
    app.mock.controls.set('latency', { minMs: 200, maxMs: 600 });
    await app.rntl.act(async () => {
      app.router.push('/settings');
    });
    await app.advance(800);
    await press(app, 'settings-logout');
    if (byTestId(app, 'settings-logout-confirm')) {
      const buttons = app.screen.getAllByText('Выйти');
      await app.rntl.act(async () => {
        app.rntl.fireEvent.press(buttons[buttons.length - 1]!);
      });
      await app.advance(1500);
    }
    expect(app.path()).toMatch(/^\/login/);
    await signIn(app, 'ilya@example.com');
    expect(app.path()).toMatch(/^\/student/);
    await app.advance(12000);
    await app.settle();
    const detail = await now(app, () => app.mock.studentStudy.getNumberDetail('113'));
    expect((detail as unknown as { number: { note: string } }).number.note).not.toContain('Даша');
    // The answer to dasha's request (401) did not sign ilya out either.
    expect(app.path()).toMatch(/^\/student/);
    await app.unmount();
  });

  it("mark-all-read of the previous student neither marks ilya's notifications nor signs him out (#303, #304)", async () => {
    const app = await visit({ as: 'dasha@example.com', url: '/student' });
    const ilyaId = app.mock.backend.store.users.findUnique('email', 'ilya@example.com')!.id;
    const ilyaUnread = () => app.mock.backend.store.notifications.by('userId', ilyaId).filter((row) => row.readAt === null).length;
    const before = ilyaUnread();
    expect(before).toBeGreaterThan(0);
    await tap(app, '#app-bar-bell');
    await app.settle();
    app.mock.controls.set('latency', { minMs: 8000, maxMs: 8000 });
    await press(app, 'notifications-mark-all', 1000);
    app.mock.controls.set('latency', { minMs: 200, maxMs: 600 });
    await app.rntl.act(async () => {
      app.router.back();
    });
    await app.advance(800);
    await press(app, 'app-bar-settings');
    await press(app, 'settings-logout');
    await app.advance(800);
    expect(app.path()).toMatch(/^\/login/);
    await signIn(app, 'ilya@example.com');
    expect(app.path()).toMatch(/^\/student/);
    await app.advance(12000);
    await app.settle();
    expect(ilyaUnread()).toBe(before);
    expect(app.path()).toMatch(/^\/student/);
    expect(app.screen.queryByText('Сессия истекла. Войдите заново.')).toBeNull();
    await app.unmount();
  });

  it('a stale 401 answered to the previous session does not sign out the user who signed in after it (#304)', async () => {
    const app = await visit({ as: 'dasha@example.com', url: '/student' });
    await tap(app, '#app-bar-bell');
    await app.settle();
    app.mock.controls.set('latency', { minMs: 8000, maxMs: 8000 });
    // What a real server answers to the old token once logout deleted its session.
    app.mock.controls.set('forceNextError', { method: 'shell.markNotificationsRead', error: 'sessionExpired', times: 1 });
    await press(app, 'notifications-mark-all', 1000);
    app.mock.controls.set('latency', { minMs: 200, maxMs: 600 });
    await app.rntl.act(async () => {
      app.router.back();
    });
    await app.advance(800);
    await press(app, 'app-bar-settings');
    await press(app, 'settings-logout');
    await app.advance(800);
    await signIn(app, 'ilya@example.com');
    expect(app.path()).toMatch(/^\/student/);
    await app.advance(12000);
    await app.settle();
    expect(app.path()).toMatch(/^\/student/);
    expect(visibleText(app)).not.toContain('Сессия истекла');
    await app.unmount();
  });

  it('tells the user when the saved session could not be removed from the device; the sign-out completes (#345)', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student' });
    // Every fallback fails: delete and overwrite in the Keychain, and the signed-out marker in AsyncStorage.
    const keychain = device().secureStore;
    const originalSet = keychain.set.bind(keychain);
    const originalDelete = keychain.delete.bind(keychain);
    keychain.set = (key: string, value: string) => {
      if (key === 'shbz.session.token') throw new Error('keychain busy');
      return originalSet(key, value);
    };
    keychain.delete = (key: string) => {
      if (key === 'shbz.session.token') throw new Error('keychain busy');
      return originalDelete(key);
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storageModule = require('@react-native-async-storage/async-storage') as { default?: StorageLike } & StorageLike;
    const storage = storageModule.default ?? storageModule;
    const spy = jest.spyOn(storage, 'setItem').mockImplementation(async (key: string) => {
      if (key === 'shbz-signed-out-token') throw new Error('storage busy');
    });
    try {
      await press(app, 'app-bar-settings');
      await press(app, 'settings-logout');
      await app.settle();
      expect(app.path()).toMatch(/^\/login/);
      expect(byTestId(app, 'login-token-notice')).not.toBeNull();
      expect(visibleText(app)).toContain('сохранённый вход не удалось стереть');
    } finally {
      spy.mockRestore();
      keychain.set = originalSet;
      keychain.delete = originalDelete;
    }
    await app.unmount();
  });

  it('the session-expired notice and the token warning are dismissed separately (#345)', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student' });
    const keychain = device().secureStore;
    const originalSet = keychain.set.bind(keychain);
    const originalDelete = keychain.delete.bind(keychain);
    keychain.set = (key: string, value: string) => {
      if (key === 'shbz.session.token') throw new Error('keychain busy');
      return originalSet(key, value);
    };
    keychain.delete = (key: string) => {
      if (key === 'shbz.session.token') throw new Error('keychain busy');
      return originalDelete(key);
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storageModule = require('@react-native-async-storage/async-storage') as { default?: StorageLike } & StorageLike;
    const storage = storageModule.default ?? storageModule;
    const spy = jest.spyOn(storage, 'setItem').mockImplementation(async (key: string) => {
      if (key === 'shbz-signed-out-token') throw new Error('storage busy');
    });
    const dismissIn = async (id: string): Promise<void> => {
      const notice = byTestId(app, id);
      if (!notice) throw new Error(`no #${id}`);
      const button = app.rntl.within(notice as never).getByLabelText('Скрыть сообщение');
      await app.rntl.act(async () => {
        app.rntl.fireEvent.press(button);
      });
      await app.advance(100);
    };
    try {
      // A forced expiry whose token removal fails: both messages are on the login screen.
      app.mock.controls.set('forceNextError', { method: '*', error: 'sessionExpired', times: 1 });
      await press(app, 'dock-homeworks');
      await app.settle();
      expect(app.path()).toMatch(/^\/login/);
      expect(byTestId(app, 'login-session-notice')).not.toBeNull();
      expect(byTestId(app, 'login-token-notice')).not.toBeNull();
      // Closing the routine «session expired» line keeps the security warning…
      await dismissIn('login-session-notice');
      expect(byTestId(app, 'login-session-notice')).toBeNull();
      expect(byTestId(app, 'login-token-notice')).not.toBeNull();
      // …which is closed by its own button.
      await dismissIn('login-token-notice');
      expect(byTestId(app, 'login-token-notice')).toBeNull();
    } finally {
      spy.mockRestore();
      keychain.set = originalSet;
      keychain.delete = originalDelete;
    }
    await app.unmount();
  });

  it('no notice when the token was removed normally (#345)', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student' });
    await press(app, 'app-bar-settings');
    await press(app, 'settings-logout');
    await app.settle();
    expect(app.path()).toMatch(/^\/login/);
    expect(byTestId(app, 'login-token-notice')).toBeNull();
    await app.unmount();
  });

  it('sign-out → sign-in cycles do not leave queries with 24-hour timers behind (#309)', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher' });
    const visits: Record<string, string[]> = {
      'teacher@example.com': ['/teacher/students', '/teacher/calls', '/teacher/students/usr_ilya', '/teacher'],
      'ilya@example.com': ['/student/homeworks', '/student/deadlines', '/student/numbers/118', '/student'],
    };
    const order: PersonaLogin[] = ['teacher@example.com', 'ilya@example.com', 'teacher@example.com', 'ilya@example.com', 'teacher@example.com'];
    const timersAfterSignOut: number[] = [];
    for (let index = 0; index < order.length; index += 1) {
      const who = order[index]!;
      if (index > 0) await signIn(app, who);
      for (const url of visits[who]!) await app.open(url);
      await app.advance(20000);
      await app.open('/settings');
      await press(app, 'settings-logout');
      await app.advance(5000);
      expect(app.path()).toMatch(/^\/login/);
      timersAfterSignOut.push(jest.getTimerCount());
    }
    // Before the fix every sign-out added 9–13 timers of 24 h (one per orphaned query): 14 → 23 → 36 → …
    const first = timersAfterSignOut[0]!;
    expect(Math.max(...timersAfterSignOut) - first).toBeLessThanOrEqual(2);
    await app.unmount();
  });
});
