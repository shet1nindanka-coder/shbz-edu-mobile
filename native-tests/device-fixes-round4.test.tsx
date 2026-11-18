// Device and start-up, round 4: the biometric lock takes the focus (and the keyboard) away from the field
// under it, the root layout's error boundary works without the providers it sits outside of, and the
// sign-in screen names its two disclosure buttons apart.
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, hasTestId, press, pressTestId, visit } from './support/drive';
import { device, setAppState } from './support/fakes';
import { launch, type AppHandle } from './support/launch';
import { all, textOf, type HostNode } from './support/tree';

// A render error in a root-level component (outside every route): the offline strip host throws while
// `__rootThrow` is positive. Three throws, so React's one synchronous retry cannot hide the error.
const ROOT_ERROR = 'render error in a root-level component (test)';
(globalThis as unknown as Record<string, number>).__rootThrow = 0;
jest.mock('@/services/network/offline-banner', () => {
  const actual = jest.requireActual('@/services/network/offline-banner') as typeof import('@/services/network/offline-banner');
  return {
    ...actual,
    OfflineBannerHost: (props: Parameters<typeof actual.OfflineBannerHost>[0]) => {
      const state = globalThis as unknown as Record<string, number>;
      if (state.__rootThrow > 0) {
        state.__rootThrow -= 1;
        throw new Error(ROOT_ERROR);
      }
      return actual.OfflineBannerHost(props);
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rn = () => require('react-native') as typeof import('react-native');
const isIos = () => rn().Platform.OS === 'ios';
const locked = { 'shbz-app-device': JSON.stringify({ biometricLock: true }) };
const authCalls = () => device().calls.filter((call) => call.name === 'LocalAuthentication.authenticateAsync').length;

/** Keyboard.dismiss calls, each with the number of biometric prompts asked for before it. */
function spyOnDismiss(): number[] {
  const promptsBefore: number[] = [];
  const RN = rn();
  const original = RN.Keyboard.dismiss.bind(RN.Keyboard);
  jest.spyOn(RN.Keyboard, 'dismiss').mockImplementation(() => {
    promptsBefore.push(authCalls());
    original();
  });
  return promptsBefore;
}

async function background(app: AppHandle, ms: number): Promise<void> {
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

describe('biometric lock and the focused field under it', () => {
  it('takes the focus away when the lock closes, before the prompt, on every lock', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student/numbers/118', storage: locked });
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    const input = byTestId(app, 'number-note-input');
    expect(input).not.toBeNull();
    await app.rntl.fireEvent(input as never, 'focus', { nativeEvent: {} });
    const dismissed = spyOnDismiss();

    device().biometrics.nextResult = { success: false, error: 'user_cancel' };
    const promptsBefore = authCalls();
    await background(app, 120_000);
    expect(hasTestId(app, 'lock-screen')).toBe(true);
    // Dismissed in the commit that drew the lock, before the prompt of this lock was asked for.
    expect(dismissed.length).toBeGreaterThan(0);
    expect(dismissed[0]).toBe(promptsBefore);
    expect(authCalls()).toBe(promptsBefore + 1);

    // A keyboard that comes up while locked (a field under the cover focused itself) is closed again.
    const count = dismissed.length;
    await app.rntl.act(async () => {
      rn().DeviceEventEmitter.emit('keyboardDidShow', { endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 } });
    });
    expect(dismissed.length).toBe(count + 1);

    // Unlocked: the keyboard is the user's again.
    device().biometrics.nextResult = { success: true };
    await pressTestId(app, 'lock-unlock');
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    const afterUnlock = dismissed.length;
    await app.rntl.act(async () => {
      rn().DeviceEventEmitter.emit('keyboardDidShow', { endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 } });
    });
    expect(dismissed.length).toBe(afterUnlock);

    // The next lock takes the focus away again.
    device().biometrics.nextResult = { success: false, error: 'user_cancel' };
    await background(app, 120_000);
    expect(hasTestId(app, 'lock-screen')).toBe(true);
    expect(dismissed.length).toBeGreaterThan(afterUnlock);
  });

  it('a short trip away (the iOS privacy cover, no lock) leaves the keyboard alone', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student/numbers/118', storage: locked });
    const dismissed = spyOnDismiss();
    // Control Center / a banner: inactive only.
    await app.rntl.act(async () => {
      setAppState('inactive');
    });
    if (isIos()) expect(hasTestId(app, 'privacy-screen')).toBe(true);
    await app.rntl.act(async () => {
      setAppState('active');
    });
    await app.settle();
    // A few seconds in the background: below the grace period, no lock.
    await background(app, 5_000);
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    expect(dismissed).toEqual([]);
  });
});

function silenceRootError(): void {
  // The harness fails a test on console.error; React reports the error that the boundary caught.
  const spy = console.error as unknown as jest.Mock<(...args: unknown[]) => void>;
  const prior = spy.getMockImplementation();
  spy.mockImplementation((...args: unknown[]) => {
    if (args.some((arg) => String(arg instanceof Error ? arg.message : arg).includes(ROOT_ERROR))) return;
    prior?.(...args);
  });
}

function buttonWithText(app: AppHandle, label: string): HostNode {
  const node = all(app.screen.container as unknown as HostNode, (entry) => entry.props.accessibilityRole === 'button' && textOf(entry).includes(label))[0];
  if (!node) throw new Error(`no button "${label}"`);
  return node;
}

describe('root error boundary', () => {
  it('a render error above the routes shows the error shell, and "Try again" brings the app back', async () => {
    silenceRootError();
    (globalThis as unknown as Record<string, number>).__rootThrow = 3;
    const app = await launch({ as: 'ilya@example.com', url: '/student/numbers/118' });
    expect(hasTestId(app, 'route-error')).toBe(true);
    expect(textOf(app.screen.container as unknown as HostNode)).toContain('Раздел временно недоступен');
    await press(app, buttonWithText(app, 'Попробовать снова'), 'retry');
    expect(hasTestId(app, 'route-error')).toBe(false);
    expect(app.path()).toBe('/student/numbers/118');
    expect(byTestId(app, 'number-note-input')).not.toBeNull();
  });

  it('"Home" brings the app back on the role\'s home', async () => {
    silenceRootError();
    (globalThis as unknown as Record<string, number>).__rootThrow = 3;
    const app = await launch({ as: 'ilya@example.com', url: '/student/numbers/118' });
    expect(hasTestId(app, 'route-error')).toBe(true);
    await press(app, buttonWithText(app, 'На главную'), 'home');
    expect(hasTestId(app, 'route-error')).toBe(false);
    expect(app.path()).toBe('/student');
  });

  // Round 5 (#410): the shell sits outside the providers but follows the user's stored language and theme.
  it('speaks the language and wears the theme the user chose (en, dark)', async () => {
    silenceRootError();
    (globalThis as unknown as Record<string, number>).__rootThrow = 3;
    const app = await launch({ as: 'ilya@example.com', url: '/student/numbers/118', locale: 'en', theme: 'dark' });
    expect(hasTestId(app, 'route-error')).toBe(true);
    const text = textOf(app.screen.container as unknown as HostNode);
    expect(text).toContain('This section is temporarily unavailable');
    expect(text).not.toContain('Раздел временно недоступен');
    expect(byTestId(app, 'route-error')?.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: darkPageBg() })]));
    await press(app, buttonWithText(app, 'Try again'), 'retry');
    expect(hasTestId(app, 'route-error')).toBe(false);
    expect(app.path()).toBe('/student/numbers/118');
  });

  it('a light-theme Russian user keeps the light, Russian shell', async () => {
    silenceRootError();
    (globalThis as unknown as Record<string, number>).__rootThrow = 3;
    const app = await launch({ as: 'ilya@example.com', url: '/student/numbers/118', locale: 'ru', theme: 'light' });
    expect(textOf(app.screen.container as unknown as HostNode)).toContain('Раздел временно недоступен');
    expect(byTestId(app, 'route-error')?.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: lightPageBg() })]));
  });
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const themes = () => require('@/theme') as typeof import('@/theme');
const darkPageBg = () => themes().darkTheme.colors.pageBg;
const lightPageBg = () => themes().lightTheme.colors.pageBg;

describe('sign-in screen: the two «Показать» buttons', () => {
  const buttons = (app: AppHandle) =>
    all(app.screen.container as unknown as HostNode, (node) => node.props.accessibilityRole === 'button' && typeof node.props.accessibilityLabel === 'string');
  const named = (app: AppHandle, label: string) => buttons(app).filter((node) => node.props.accessibilityLabel === label);

  it('names what each one shows; the demo toggle reports whether the list is open', async () => {
    const app = await visit({ url: '/login' });
    expect(named(app, 'Показать')).toEqual([]);
    expect(named(app, 'Показать пароль')).toHaveLength(1);
    await press(app, named(app, 'Показать пароль')[0], 'reveal');
    expect(named(app, 'Скрыть пароль')).toHaveLength(1);

    const toggle = byTestId(app, 'login-demo-toggle');
    expect(toggle?.props.accessibilityLabel).toBe('Показать демо-аккаунты');
    expect(toggle?.props.accessibilityState).toMatchObject({ expanded: false });
    await pressTestId(app, 'login-demo-toggle');
    const open = byTestId(app, 'login-demo-toggle');
    expect(open?.props.accessibilityLabel).toBe('Скрыть демо-аккаунты');
    expect(open?.props.accessibilityState).toMatchObject({ expanded: true });
  });
});
