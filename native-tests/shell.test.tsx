// Shell screens: launch, login (errors, lockout, each role), biometric lock, number search, file viewer for
// every file kind, notifications, demo data, the design galleries and the 404 shell.
import { describe, expect, it } from '@jest/globals';

import { byTestId, checkScreen, hasTestId, pressTestId, typeTestId, visibleText, visit } from './support/drive';
import { device, setAppState } from './support/fakes';
import { launch } from './support/launch';
import { recordFailure } from './support/problems';

const file = (id: string, originalName: string, mimeType: string) => ({ id, originalName, mimeType });
const viewer = (files: ReturnType<typeof file>[], index = 0) => `/file-viewer?files=${encodeURIComponent(JSON.stringify(files))}${index ? `&index=${index}` : ''}`;

describe('launch', () => {
  it('signed out: the root link opens the login screen', async () => {
    const app = await visit({ url: '/', expectPath: '/login' });
    expect(hasTestId(app, 'login-screen')).toBe(true);
  });

  it('signed out: a deep link into a role tree opens the login screen', async () => {
    await visit({ url: '/student/homeworks', expectPath: '/login' });
  });

  it('a stored session without a connection and without a cached user shows the failed start', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/',
      expectPath: null,
      device: (state) => {
        state.network = { type: 'NONE', isConnected: false, isInternetReachable: false };
      },
    });
    expect(hasTestId(app, 'launch-failed')).toBe(true);
    // The connection comes back and the app returns to the foreground: the start is retried by itself.
    await app.rntl.act(async () => {
      setAppState('background');
      setAppState('active');
    });
    await app.settle();
    checkScreen(app, 'launch: after returning to the foreground');
  });

  it.each([
    ['ilya@example.com', '/student'],
    ['teacher@example.com', '/teacher'],
    ['dev@example.com', '/developer/topics'],
  ] as const)('a restored session of %s opens %s from the root link', async (as, home) => {
    await visit({ as, url: '/', expectPath: home });
  });
});

describe('login', () => {
  it('shows the error of a wrong password', async () => {
    const app = await visit({ url: '/login' });
    await typeTestId(app, 'login-input', 'ilya@example.com');
    await typeTestId(app, 'password-input', 'wrong-password');
    await pressTestId(app, 'login-submit');
    checkScreen(app, 'login: wrong password');
    expect(hasTestId(app, 'login-error')).toBe(true);
  });

  it('shows the validation of an empty form', async () => {
    const app = await visit({ url: '/login' });
    await pressTestId(app, 'login-submit');
    checkScreen(app, 'login: empty form');
  });

  it('shows the lockout with its countdown for the rate-limited login', async () => {
    const app = await visit({ url: '/login' });
    await typeTestId(app, 'login-input', 'locked@example.com');
    await typeTestId(app, 'password-input', 'student123');
    await pressTestId(app, 'login-submit');
    checkScreen(app, 'login: lockout');
    expect(hasTestId(app, 'login-wait')).toBe(true);
    await app.advance(61_000);
    checkScreen(app, 'login: lockout a minute later');
  });

  it.each([
    ['ilya@example.com', 'student123', '/student'],
    ['teacher@example.com', 'teacher123', '/teacher'],
    ['dev@example.com', 'developer123', '/developer/topics'],
  ])('signs %s in and opens the role home', async (login, password, home) => {
    const app = await visit({ url: '/login' });
    await typeTestId(app, 'login-input', login);
    await typeTestId(app, 'password-input', password);
    await pressTestId(app, 'login-submit');
    checkScreen(app, `login: signed in as ${login}`);
    expect(app.path()).toBe(home);
  });

  it('lists the demo accounts and fills the form from one', async () => {
    const app = await visit({ url: '/login' });
    await pressTestId(app, 'login-demo-toggle');
    checkScreen(app, 'login: demo accounts');
    await pressTestId(app, 'login-demo-teacher@example.com');
    checkScreen(app, 'login: demo account chosen');
    await pressTestId(app, 'login-submit');
    expect(app.path()).toBe('/teacher');
  });

  it('opens the demo data screen from the demo accounts', async () => {
    const app = await visit({ url: '/login' });
    await pressTestId(app, 'login-demo-toggle');
    await pressTestId(app, 'login-demo-data');
    checkScreen(app, 'login: demo data screen');
    expect(app.path()).toBe('/demo');
  });

  it('switches the interface language on the login screen', async () => {
    const app = await visit({ url: '/login' });
    const radio = app.screen.getByLabelText('EN');
    await app.rntl.fireEvent.press(radio);
    await app.settle();
    checkScreen(app, 'login: English');
    expect(visibleText(app)).toContain('Sign in');
  });

  it('shows the notice of an expired session after a forced sign-out', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student' });
    app.mock.controls.set('forceNextError', { method: '*', error: 'sessionExpired', times: 1 });
    await pressTestId(app, 'dock-homeworks');
    await app.settle();
    checkScreen(app, 'login: after the session expired');
    expect(app.path()).toBe('/login');
    expect(hasTestId(app, 'login-session-notice')).toBe(true);
  });
});

describe('biometric lock', () => {
  const locked = { 'shbz-app-device': JSON.stringify({ biometricLock: true }) };

  it('opens a restored session after the fingerprint', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student', storage: locked });
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    expect(device().calls.some((call) => call.name === 'LocalAuthentication.authenticateAsync')).toBe(true);
  });

  it('covers a restored session until the fingerprint is accepted', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/student',
      storage: locked,
      device: (state) => {
        state.biometrics.nextResult = { success: false, error: 'user_cancel' };
      },
    });
    expect(hasTestId(app, 'lock-screen')).toBe(true);
    device().biometrics.nextResult = { success: true };
    await pressTestId(app, 'lock-unlock');
    checkScreen(app, 'lock: after unlocking');
    expect(hasTestId(app, 'lock-screen')).toBe(false);
  });

  it('stays locked when the fingerprint is refused, and offers the password', async () => {
    const app = await visit({
      as: 'teacher@example.com',
      url: '/teacher',
      storage: locked,
      device: (state) => {
        state.biometrics.nextResult = { success: false, error: 'user_cancel' };
      },
    });
    expect(hasTestId(app, 'lock-screen')).toBe(true);
    await pressTestId(app, 'lock-use-password');
    checkScreen(app, 'lock: use the password instead');
  });

  it('locks again when the app returns from the background after more than a minute', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student', storage: locked });
    device().biometrics.nextResult = { success: false, error: 'user_cancel' };
    await app.rntl.act(async () => {
      setAppState('background');
    });
    await app.advance(120_000);
    await app.rntl.act(async () => {
      setAppState('active');
    });
    await app.settle();
    checkScreen(app, 'lock: back from the background');
    expect(hasTestId(app, 'lock-screen')).toBe(true);
  });
});

describe('number search', () => {
  it.each([
    ['ilya@example.com', '118', '/student/numbers/118'],
    ['teacher@example.com', '118', '/teacher/topics/top_linear/numbers/118'],
    ['dev@example.com', '010207', '/developer/topics/top_log/numbers/010207'],
  ] as const)('%s finds number %s and opens it', async (as, number, target) => {
    const app = await visit({ as, url: '/number-search' });
    await typeTestId(app, 'number-search-input', number);
    const input = byTestId(app, 'number-search-input');
    if (input) await app.rntl.fireEvent(input as never, 'submitEditing', { nativeEvent: { text: number } });
    await app.settle();
    checkScreen(app, `number search: ${number}`);
    if (app.path() !== target) recordFailure('number search', new Error(`a hit for ${number} ended on ${app.path()} instead of ${target}`));
  });

  it.each([
    ['a number that does not exist', '999999'],
    ['an invalid query', 'abc'],
    ['an empty query', ''],
  ])('%s keeps the search open with its message', async (_name, query) => {
    const app = await visit({ as: 'ilya@example.com', url: '/number-search' });
    await typeTestId(app, 'number-search-input', query);
    const input = byTestId(app, 'number-search-input');
    if (input) await app.rntl.fireEvent(input as never, 'submitEditing', { nativeEvent: { text: query } });
    await app.settle();
    checkScreen(app, `number search: "${query}"`);
    expect(app.path()).toBe('/number-search');
  });

  it('closes', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/number-search' });
    await pressTestId(app, 'number-search-close');
    checkScreen(app, 'number search: closed');
  });
});

describe('file viewer', () => {
  const PDF_SHORT = file('file_linear_theory', 'linear-equations-theory.pdf', 'application/pdf');
  const PDF_LONG = file('file_quadratic_theory', 'quadratic-functions-theory.pdf', 'application/pdf');
  const DOCX = file('file_quadratic_homework', 'quadratic-functions-homework.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const PNG = file('file_derivative_theory', 'derivative-cheatsheet.png', 'image/png');
  const JPG = file('file_word_theory', 'word-problems-photo.jpg', 'image/jpeg');

  it.each([
    ['a one-page PDF', [PDF_SHORT]],
    ['a twelve-page PDF', [PDF_LONG]],
    ['a DOCX document', [DOCX]],
    ['a PNG picture', [PNG]],
    ['a JPG photo', [JPG]],
    ['several files, opened on the third', [PNG, JPG, PDF_SHORT, DOCX]],
  ] as const)('shows %s', async (_name, files) => {
    const app = await visit({ as: 'ilya@example.com', url: viewer([...files], files.length > 1 ? 2 : 0), expectPath: '/file-viewer' });
    expect(hasTestId(app, 'file-viewer-screen')).toBe(true);
  });

  it.each(['teacher@example.com', 'dev@example.com'] as const)('shows a PDF and a picture to %s', async (as) => {
    await visit({ as, url: viewer([PDF_SHORT, PNG]), expectPath: '/file-viewer' });
  });

  it('shows the failure of a file the user may not read', async () => {
    await visit({ as: 'timur@example.com', url: viewer([file('file_sub_les_early_artem_112_1_1', 'IMG_2041.jpg', 'image/jpeg')]), expectPath: '/file-viewer' });
  });

  it('survives a broken link', async () => {
    await visit({ as: 'ilya@example.com', url: '/file-viewer?files=not-json', expectPath: null, expectNotFound: true });
    await visit({ as: 'ilya@example.com', url: '/file-viewer', expectPath: null, expectNotFound: true });
  });
});

describe('other root screens', () => {
  it.each(['ilya@example.com', 'maria@example.com', 'timur@example.com', 'teacher@example.com', 'teacher3@example.com', 'dev@example.com'] as const)('notifications sheet of %s', async (as) => {
    await visit({ as, url: '/notifications' });
  });

  it.each(['ilya@example.com', 'egor@example.com', 'teacher@example.com', 'dev@example.com'] as const)('settings of %s', async (as) => {
    await visit({ as, url: '/settings' });
  });

  it('demo data, signed out and signed in', async () => {
    await visit({ url: '/demo' });
    await visit({ as: 'teacher@example.com', url: '/demo' });
  });

  it.each(['/dev-ui', '/dev-math'])('the gallery %s renders every primitive', async (url) => {
    await visit({ as: 'dev@example.com', url });
  });

  it('an unknown route is the 404 shell, signed in and signed out', async () => {
    await visit({ as: 'ilya@example.com', url: '/no-such-screen', expectNotFound: true });
    await visit({ url: '/no-such-screen', expectPath: null, expectNotFound: true });
  });
});
