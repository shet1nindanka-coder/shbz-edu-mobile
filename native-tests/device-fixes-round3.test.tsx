// Device services, round 3: settings re-read what the system settings may change (notification permission,
// biometric enrolment, exact-alarm access), the three notification-permission states, reminders re-armed
// when the exact-alarm access changes outside the app, and no system prompt on a cold start when nothing
// is enrolled any more.
import { describe, expect, it } from '@jest/globals';

import { byTestId, hasTestId, pressTestId, visit } from './support/drive';
import { device, setAppState } from './support/fakes';
import type { AppHandle } from './support/launch';
import { all } from './support/tree';

const isIos = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require('react-native') as typeof import('react-native');
  return Platform.OS === 'ios';
};

const remindersOn = { 'shbz-app-device': JSON.stringify({ reminders: { homeworkDeadlines: true, lessonStart: true, parentCalls: false } }) };
const lockOn = { 'shbz-app-device': JSON.stringify({ biometricLock: true }) };

function switchState(app: AppHandle, testID: string): unknown {
  const node = byTestId(app, testID);
  if (!node) throw new Error(`no ${testID}`);
  const control = all(node, (entry) => entry.props.accessibilityRole === 'switch')[0] ?? node;
  return control.props.accessibilityState;
}

/** A trip to the system settings: the app goes to the background, `change` happens there, the app comes back. */
async function viaSystemSettings(app: AppHandle, change: () => void): Promise<void> {
  await app.rntl.act(async () => {
    setAppState('inactive');
    setAppState('background');
  });
  change();
  await app.advance(5_000);
  await app.rntl.act(async () => {
    setAppState('active');
  });
  await app.settle();
}

const authCalls = () => device().calls.filter((call) => call.name === 'LocalAuthentication.authenticateAsync').length;
const requestCalls = () => device().calls.filter((call) => call.name === 'Notifications.requestPermissionsAsync').length;

describe('settings re-read the device state on return', () => {
  it('notifications allowed in the system settings: the notice goes, the switches show the stored wish', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/settings',
      storage: remindersOn,
      device: (state) => {
        state.notifications.status = 'denied';
        state.notifications.canAskAgain = false;
      },
    });
    expect(hasTestId(app, 'settings-reminders-denied')).toBe(true);
    expect(switchState(app, 'settings-reminder-homeworkDeadlines')).toMatchObject({ checked: false });
    await viaSystemSettings(app, () => {
      device().notifications.status = 'granted';
    });
    expect(hasTestId(app, 'settings-reminders-denied')).toBe(false);
    expect(switchState(app, 'settings-reminder-homeworkDeadlines')).toMatchObject({ checked: true });

    // And back: revoked while the screen stays open.
    await viaSystemSettings(app, () => {
      device().notifications.status = 'denied';
    });
    expect(hasTestId(app, 'settings-reminders-denied')).toBe(true);
    expect(switchState(app, 'settings-reminder-homeworkDeadlines')).toMatchObject({ checked: false });
  });

  it('biometrics enrolled in the system settings: the lock switch can be switched on', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/settings',
      device: (state) => {
        state.biometrics.enrolled = false;
      },
    });
    expect(switchState(app, 'settings-biometric-lock')).toMatchObject({ checked: false, disabled: true });
    await viaSystemSettings(app, () => {
      device().biometrics.enrolled = true;
    });
    expect(switchState(app, 'settings-biometric-lock')).toMatchObject({ checked: false, disabled: false });
  });

  it('the exact-alarm notice goes once the access is granted outside the in-app button (Android)', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/settings',
      storage: remindersOn,
      device: (state) => {
        state.notifications.status = 'granted';
        state.notifications.exactAlarm = 'denied';
      },
    });
    if (isIos()) return;
    expect(hasTestId(app, 'settings-reminders-inexact')).toBe(true);
    expect(device().notifications.scheduled.length).toBeGreaterThan(0);
    expect(device().notifications.scheduled.every((entry) => entry.alarm === 'inexact')).toBe(true);
    await viaSystemSettings(app, () => {
      device().notifications.exactAlarm = 'granted';
    });
    expect(hasTestId(app, 'settings-reminders-inexact')).toBe(false);
    // What was scheduled before is set again, now as exact alarms.
    expect(device().notifications.scheduled.every((entry) => entry.alarm === 'exact')).toBe(true);
  });

  it('re-reads when the screen is focused again', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/settings',
      device: (state) => {
        state.biometrics.enrolled = false;
      },
    });
    expect(switchState(app, 'settings-biometric-lock')).toMatchObject({ disabled: true });
    // A root-stack route pushed above the settings (the settings stay mounted under it).
    await app.open('/number-search');
    expect(app.path()).toBe('/number-search');
    device().biometrics.enrolled = true;
    await app.rntl.act(async () => {
      app.router.back();
    });
    await app.settle();
    expect(app.path()).toBe('/settings');
    expect(switchState(app, 'settings-biometric-lock')).toMatchObject({ disabled: false });
  });
});

describe('notification permission: three states', () => {
  it('Android 13+ fresh install (denied + can ask): no "turned off" notice, one tap shows the OS prompt', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/settings',
      device: (state) => {
        state.notifications.status = 'denied';
        state.notifications.canAskAgain = true;
      },
    });
    expect(hasTestId(app, 'settings-reminders-denied')).toBe(false);
    expect(switchState(app, 'settings-reminder-homeworkDeadlines')).toMatchObject({ checked: false, disabled: false });
    await pressTestId(app, 'settings-reminder-homeworkDeadlines');
    await app.settle();
    expect(requestCalls()).toBe(1);
    expect(switchState(app, 'settings-reminder-homeworkDeadlines')).toMatchObject({ checked: true });
    expect(hasTestId(app, 'settings-reminders-denied')).toBe(false);
  });

  it('refused for good: the notice with the device settings, a tap changes nothing', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/settings',
      device: (state) => {
        state.notifications.status = 'denied';
        state.notifications.canAskAgain = false;
      },
    });
    expect(hasTestId(app, 'settings-reminders-denied')).toBe(true);
    await pressTestId(app, 'settings-reminder-homeworkDeadlines');
    await app.settle();
    expect(switchState(app, 'settings-reminder-homeworkDeadlines')).toMatchObject({ checked: false });
    expect(hasTestId(app, 'settings-reminders-denied')).toBe(true);
  });
});

describe('reminders: exact-alarm access changed outside the app (Android)', () => {
  it('granted in the system settings while another screen is open: the scheduled reminders become exact', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/student',
      storage: remindersOn,
      device: (state) => {
        state.notifications.status = 'granted';
        state.notifications.exactAlarm = 'denied';
      },
    });
    await app.settle();
    const scheduled = device().notifications.scheduled;
    expect(scheduled.length).toBeGreaterThan(0);
    if (isIos()) return;
    expect(scheduled.every((entry) => entry.alarm === 'inexact')).toBe(true);
    await viaSystemSettings(app, () => {
      device().notifications.exactAlarm = 'granted';
    });
    expect(device().notifications.scheduled.length).toBe(scheduled.length);
    expect(device().notifications.scheduled.every((entry) => entry.alarm === 'exact')).toBe(true);
  });

  it('revoked (the OS cancels the exact alarms and stops the app): the next start sets them again', async () => {
    const first = await visit({
      as: 'ilya@example.com',
      url: '/student',
      storage: remindersOn,
      device: (state) => {
        state.notifications.status = 'granted';
      },
    });
    await first.settle();
    const before = device().notifications.scheduled.map((entry) => ({ ...entry }));
    expect(before.length).toBeGreaterThan(0);
    if (isIos()) return;
    expect(before.every((entry) => entry.alarm === 'exact')).toBe(true);

    const app = await visit({
      as: 'ilya@example.com',
      url: '/student',
      storage: remindersOn,
      device: (state) => {
        state.notifications.status = 'granted';
        state.notifications.exactAlarm = 'denied';
        // expo's store still lists every request; the alarms behind them are gone.
        state.notifications.scheduled = before.map((entry) => ({ ...entry, alarm: 'cancelled' as const }));
      },
    });
    await app.settle();
    const after = device().notifications.scheduled;
    expect(after.map((entry) => entry.identifier).sort()).toEqual(before.map((entry) => entry.identifier).sort());
    expect(after.every((entry) => entry.alarm === 'inexact')).toBe(true);
  });
});

describe('lock: cold start with nothing enrolled any more', () => {
  /** A native AsyncFunction answers after a thread hop, not in the same microtask. */
  const slowAvailability = () => {
    const modules = (globalThis as unknown as { expo: { modules: Record<string, Record<string, unknown>> } }).expo.modules;
    const mod = modules.ExpoLocalAuthentication!;
    for (const name of ['hasHardwareAsync', 'isEnrolledAsync', 'supportedAuthenticationTypesAsync']) {
      const real = mod[name] as () => Promise<unknown>;
      mod[name] = () => new Promise((resolve) => setTimeout(() => resolve(real()), 4));
    }
  };

  it('shows no system prompt and opens the app', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/student',
      storage: lockOn,
      arrange: slowAvailability,
      device: (state) => {
        state.biometrics.enrolled = false;
        state.biometrics.nextResult = { success: false, error: 'user_cancel' };
      },
    });
    await app.settle();
    expect(authCalls()).toBe(0);
    expect(hasTestId(app, 'lock-screen')).toBe(false);
  });

  it('with biometrics enrolled the prompt still comes by itself, once', async () => {
    const app = await visit({
      as: 'ilya@example.com',
      url: '/student',
      storage: lockOn,
      arrange: slowAvailability,
      device: (state) => {
        state.biometrics.nextResult = { success: false, error: 'user_cancel' };
      },
    });
    await app.settle();
    expect(authCalls()).toBe(1);
    expect(hasTestId(app, 'lock-screen')).toBe(true);
  });
});
