// Biometric lock and device services: what the lock hides from accessibility services (in the root window
// and inside every overlay window), the iOS privacy cover, biometrics that became unavailable, the settings
// switch, reminders of a signed-out account, exact-alarm timing on Android and the native colour scheme.
import { describe, expect, it } from '@jest/globals';

import { byTestId, hasTestId, pressTestId, root, typeTestId, visit } from './support/drive';
import { device, setAppState } from './support/fakes';
import type { AppHandle } from './support/launch';
import { all, describe as describeNode, textOf, type HostNode } from './support/tree';

type Storage = { getItem(key: string): Promise<string | null> };

const locked = { 'shbz-app-device': JSON.stringify({ biometricLock: true }) };
const refuse = (state: ReturnType<typeof device>) => {
  state.biometrics.nextResult = { success: false, error: 'user_cancel' };
};
const authCalls = () => device().calls.filter((call) => call.name === 'LocalAuthentication.authenticateAsync').length;
const isIos = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require('react-native') as typeof import('react-native');
  return Platform.OS === 'ios';
};

function insideCover(node: HostNode): boolean {
  for (let current: HostNode | null = node; current; current = current.parent) {
    const id = current.props.testID;
    if (id === 'lock-screen' || id === 'privacy-screen') return true;
  }
  return false;
}

/** A `Modal` is a native window of its own: what hides the root window's content does not reach into it. */
const isWindow = (node: HostNode) => node.type === 'RCTModalHostView' || node.type === 'Modal';

/** Hidden from TalkBack (Android) and VoiceOver (iOS) by an ancestor inside the same native window. */
function hiddenFromAccessibility(node: HostNode): boolean {
  for (let current: HostNode | null = node; current; current = current.parent) {
    if (current.props.importantForAccessibility === 'no-hide-descendants' && current.props.accessibilityElementsHidden === true) return true;
    if (isWindow(current)) return false;
  }
  return false;
}

/** What an accessibility service can reach: texts and controls (labelled or pressable) that are not hidden. */
function reachable(app: AppHandle): HostNode[] {
  return all(root(app), (node) => {
    const control = typeof node.props.onPress === 'function' || typeof node.props.onClick === 'function' || typeof node.props.accessibilityLabel === 'string';
    const text = node.type === 'Text' && textOf(node).trim() !== '';
    return (control || text) && !hiddenFromAccessibility(node);
  });
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

describe('lock: accessibility tree', () => {
  it('nothing under the cover is reachable while locked; everything is again after unlocking', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/calls', storage: locked, device: refuse });
    expect(hasTestId(app, 'lock-screen')).toBe(true);
    const leaks = reachable(app).filter((node) => !insideCover(node));
    expect(leaks.map(describeNode)).toEqual([]);
    // The cover itself stays operable.
    expect(reachable(app).some((node) => node.props.testID === 'lock-unlock')).toBe(true);

    device().biometrics.nextResult = { success: true };
    await pressTestId(app, 'lock-unlock');
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    expect(reachable(app).length).toBeGreaterThan(10);
  });

  it('an open sheet is hidden too, in its own window, and only its cover slot is reachable', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/calls', storage: locked });
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    expect(await pressTestId(app, 'call-record-usr_kirill')).toBe(true);
    await app.settle();
    const modals = all(root(app), isWindow);
    expect(modals.length).toBeGreaterThan(0);

    device().biometrics.nextResult = { success: false, error: 'user_cancel' };
    await background(app, 120_000);
    // One cover in the root window, one in the sheet's window.
    expect(all(root(app), (node) => node.props.testID === 'lock-screen').length).toBeGreaterThanOrEqual(2);
    const leaks = reachable(app).filter((node) => !insideCover(node));
    expect(leaks.map(describeNode)).toEqual([]);
  });
});

describe('lock: privacy cover and resume', () => {
  it('iOS covers the app while it is inactive or in the background, without a prompt inside the grace period', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student', storage: locked });
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    const prompts = authCalls();

    await app.rntl.act(async () => {
      setAppState('inactive');
    });
    expect(hasTestId(app, 'privacy-screen')).toBe(isIos());
    // Inactive only (Face ID prompt, Control Center): back without any lock or prompt.
    await app.rntl.act(async () => {
      setAppState('active');
    });
    await app.settle();
    expect(hasTestId(app, 'privacy-screen')).toBe(false);
    expect(hasTestId(app, 'lock-screen')).toBe(false);

    // A short trip to the camera / another app.
    await app.rntl.act(async () => {
      setAppState('inactive');
      setAppState('background');
    });
    expect(hasTestId(app, 'privacy-screen')).toBe(isIos());
    if (isIos()) expect(reachable(app).filter((node) => !insideCover(node)).map(describeNode)).toEqual([]);
    await app.advance(10_000);
    await app.rntl.act(async () => {
      setAppState('active');
    });
    await app.settle();
    expect(hasTestId(app, 'privacy-screen')).toBe(false);
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    expect(authCalls()).toBe(prompts);
  });

  it('a resume check that answers after the app has left again does not take the privacy cover down', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student', storage: locked });
    await app.rntl.act(async () => {
      setAppState('inactive');
      setAppState('background');
    });
    await app.advance(10_000);
    await app.rntl.act(async () => {
      setAppState('active');
      // A quick switch away before the availability check of that return has answered.
      setAppState('inactive');
      setAppState('background');
    });
    await app.settle();
    expect(hasTestId(app, 'privacy-screen')).toBe(isIos());
    if (isIos()) expect(reachable(app).filter((node) => !insideCover(node)).map(describeNode)).toEqual([]);
    expect(hasTestId(app, 'lock-screen')).toBe(false);

    await app.rntl.act(async () => {
      setAppState('active');
    });
    await app.settle();
    expect(hasTestId(app, 'privacy-screen')).toBe(false);
    expect(hasTestId(app, 'lock-screen')).toBe(false);
  });

  it('does not lock on resume when the device lost its passcode / enrolment in the background', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student', storage: locked });
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    device().biometrics.enrolled = false;
    device().biometrics.nextResult = { success: false, error: 'passcode_not_set' };
    await background(app, 120_000);
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    expect(hasTestId(app, 'privacy-screen')).toBe(false);
  });

  it('a prompt that reports "unavailable" opens the app only when the device really cannot authenticate', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student', storage: locked, device: refuse });
    expect(hasTestId(app, 'lock-screen')).toBe(true);

    // Transient: the sensor is still enrolled → stays locked with the failure.
    device().biometrics.nextResult = { success: false, error: 'not_available' };
    await pressTestId(app, 'lock-unlock');
    expect(hasTestId(app, 'lock-screen')).toBe(true);

    // Passcode removed: nothing to authenticate with → the lock is ignored, as on a cold start.
    device().biometrics.enrolled = false;
    device().biometrics.nextResult = { success: false, error: 'passcode_not_set' };
    await pressTestId(app, 'lock-unlock');
    expect(hasTestId(app, 'lock-screen')).toBe(false);
  });
});

describe('settings: biometric switch', () => {
  it('shows the stored value and can be switched off when biometrics are unavailable', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/settings',
      storage: locked,
      device: (state) => {
        state.biometrics.enrolled = false;
      },
    });
    const control = () => {
      const node = byTestId(app, 'settings-biometric-lock');
      if (!node) throw new Error('no biometric switch');
      return all(node, (entry) => entry.props.accessibilityRole === 'switch')[0] ?? node;
    };
    expect(control().props.accessibilityState).toMatchObject({ checked: true, disabled: false });
    await pressTestId(app, 'settings-biometric-lock');
    expect(control().props.accessibilityState).toMatchObject({ checked: false, disabled: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('@react-native-async-storage/async-storage') as Storage & { default?: Storage };
    const storage = module.default ?? module;
    expect(JSON.parse((await storage.getItem('shbz-app-device')) ?? '{}')).toMatchObject({ biometricLock: false });
  });
});

describe('reminders of a signed-out account', () => {
  it('sign-out removes delivered reminders from the tray, and a tap while signed out is not replayed for the next user', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/student',
      storage: locked,
      device: (state) => {
        refuse(state);
        state.notifications.presented = [
          { identifier: 'shbz-reminder:lessonStart:les_1:start:1:abc', content: { title: 'Урок начался' } },
          { identifier: 'foreign-app-notification', content: { title: 'other' } },
        ];
      },
    });
    // "Sign in with password" is a sign-out.
    await pressTestId(app, 'lock-use-password');
    await app.settle();
    expect(app.path()).toBe('/login');
    expect(device().notifications.presented.map((entry) => entry.identifier)).toEqual(['foreign-app-notification']);

    // A tap on a (stale) reminder while signed out.
    const emitter = (globalThis as unknown as { expo: { modules: Record<string, { emit(event: string, payload: unknown): void }> } }).expo.modules.ExpoNotificationsEmitter;
    await app.rntl.act(async () => {
      emitter.emit('onDidReceiveNotificationResponse', {
        actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
        notification: { date: 0, request: { identifier: 'shbz-reminder:lessonStart:x', trigger: null, content: { title: 't', body: 'b', data: { link: { screen: 'student.lesson' } } } } },
      });
    });
    await app.settle();
    expect(app.path()).toBe('/login');

    await typeTestId(app, 'login-input', 'maria@example.com');
    await typeTestId(app, 'password-input', 'student123');
    await pressTestId(app, 'login-submit');
    await app.settle();
    expect(app.path()).toBe('/student');
  });
});

describe('reminders: exact timing (Android)', () => {
  it('settings say the timing is approximate without the exact-alarm access and can ask for it', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/settings',
      storage: { 'shbz-app-device': JSON.stringify({ reminders: { homeworkDeadlines: true, lessonStart: true, parentCalls: false } }) },
      device: (state) => {
        state.notifications.status = 'granted';
        state.notifications.exactAlarm = 'denied';
      },
    });
    if (isIos()) {
      expect(hasTestId(app, 'settings-reminders-inexact')).toBe(false);
      return;
    }
    expect(hasTestId(app, 'settings-reminders-inexact')).toBe(true);
    const before = device().notifications.scheduled.length;
    expect(await pressTestId(app, 'settings-reminders-exact-allow')).toBe(true);
    await app.settle();
    expect(device().calls.some((call) => call.name === 'Notifications.requestExactAlarmPermissionsAsync')).toBe(true);
    expect(hasTestId(app, 'settings-reminders-inexact')).toBe(false);
    expect(device().notifications.scheduled.length).toBe(before);
  });

  it('without the declared permission (a host app like Expo Go) the note stays, with nothing to press', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/settings',
      storage: { 'shbz-app-device': JSON.stringify({ reminders: { homeworkDeadlines: true, lessonStart: true, parentCalls: false } }) },
      device: (state) => {
        state.notifications.status = 'granted';
        state.notifications.exactAlarm = 'undeclared';
      },
    });
    if (isIos()) return;
    expect(hasTestId(app, 'settings-reminders-inexact')).toBe(true);
    expect(hasTestId(app, 'settings-reminders-exact-allow')).toBe(false);
  });
});

describe('native colour scheme', () => {
  it('passes an explicit in-app theme to native UI, and leaves the default untouched', async () => {
    const spyOn = async (theme: 'light' | 'dark' | 'system') => {
      const calls: unknown[] = [];
      const app = await visit({
        as: 'ilya@example.com',
        url: '/student',
        storage: { 'shbz-theme': theme },
        arrange: () => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { Appearance } = require('react-native') as typeof import('react-native');
          Appearance.setColorScheme = (scheme) => {
            calls.push(scheme);
          };
        },
      });
      return { app, calls };
    };
    expect((await spyOn('dark')).calls).toEqual(['dark']);
    expect((await spyOn('light')).calls).toEqual(['light']);
    expect((await spyOn('system')).calls).toEqual([]);
  });
});

describe('lock: system date / time dialogs (Android)', () => {
  it('the lock closes the system dialogs, which no cover can be drawn over', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/lessons/new?studentId=usr_ilya', expectPath: null, storage: locked });
    expect(hasTestId(app, 'lock-screen')).toBe(false);
    expect(await pressTestId(app, 'lesson-new-starts-at')).toBe(true);
    await app.settle();
    const dismissed = () => device().calls.filter((call) => call.name === 'RNCDatePicker.dismiss' || call.name === 'RNCTimePicker.dismiss').length;
    expect(dismissed()).toBe(0);
    device().biometrics.nextResult = { success: false, error: 'user_cancel' };
    await background(app, 120_000);
    expect(hasTestId(app, 'lock-screen')).toBe(true);
    expect(dismissed()).toBe(isIos() ? 0 : 2);
  });
});
