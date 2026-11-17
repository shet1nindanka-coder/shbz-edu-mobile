/**
 * Native-side fakes. jest-expo already registers every Expo native module with methods that resolve to
 * `undefined`; the JS half of each package runs for real on top of it. For the modules whose answers the
 * app's logic depends on, a small device simulation is installed here instead — at the native-module
 * boundary (`globalThis.expo.modules[...]`, `NativeModules[...]`), never above the package's own JS and
 * never in place of app code.
 *
 * State lives on `globalThis`, because the module registry is reset for every app launch.
 */

import { jest } from '@jest/globals';

type DeviceState = {
  secureStore: Map<string, string>;
  /** Biometry of the simulated device. */
  biometrics: { hardware: boolean; enrolled: boolean; types: number[]; nextResult: { success: boolean; error?: string } };
  network: { type: string; isConnected: boolean; isInternetReachable: boolean };
  notifications: {
    status: 'granted' | 'denied' | 'undetermined';
    scheduled: { identifier: string; content: Record<string, unknown>; trigger: unknown }[];
    channels: ({ id: string } & Record<string, unknown>)[];
    /** Delivered notifications still in the tray (request identifier + content). */
    presented: { identifier: string; content: Record<string, unknown> }[];
    /** Android "alarms & reminders" access; `undeclared` = the app has no SCHEDULE_EXACT_ALARM (request rejects). */
    exactAlarm: 'granted' | 'denied' | 'undeclared';
    /** What the system settings page answers when the user comes back. */
    exactAlarmAfterRequest: 'granted' | 'denied';
  };
  /** What the next camera / gallery / document picker call answers; null = the user cancelled. */
  picker: { nextAssets: PickedAsset[] | null; cameraPermission: boolean; libraryPermission: boolean };
  clipboard: string;
  appState: 'active' | 'background' | 'inactive';
  appStateListeners: Set<(state: string) => void>;
  /** Calls into the native side that have no result worth simulating, for assertions. */
  calls: { name: string; args: unknown[] }[];
};

export type PickedAsset = { uri: string; name: string; mimeType: string; size: number; width?: number; height?: number };

declare global {
  var __shbzDevice: DeviceState | undefined;
}

function freshState(): DeviceState {
  return {
    secureStore: new Map(),
    biometrics: { hardware: true, enrolled: true, types: [1], nextResult: { success: true } },
    network: { type: 'WIFI', isConnected: true, isInternetReachable: true },
    notifications: { status: 'undetermined', scheduled: [], channels: [], presented: [], exactAlarm: 'granted', exactAlarmAfterRequest: 'granted' },
    picker: { nextAssets: null, cameraPermission: true, libraryPermission: true },
    clipboard: '',
    appState: 'active',
    appStateListeners: new Set(),
    calls: [],
  };
}

export function device(): DeviceState {
  globalThis.__shbzDevice ??= freshState();
  return globalThis.__shbzDevice;
}

/** A new device: empty Keychain, default hardware, nothing scheduled. */
export function resetNativeFakes(): void {
  globalThis.__shbzDevice = freshState();
}

export const secureStoreFake = {
  set(key: string, value: string): void {
    device().secureStore.set(key, value);
  },
  get(key: string): string | null {
    return device().secureStore.get(key) ?? null;
  },
};

const record =
  (name: string, result?: (...args: unknown[]) => unknown) =>
  async (...args: unknown[]): Promise<unknown> => {
    device().calls.push({ name, args });
    return result ? result(...args) : undefined;
  };

function permission(granted: boolean, status?: string) {
  return { status: status ?? (granted ? 'granted' : 'denied'), granted, canAskAgain: true, expires: 'never' };
}

/** Native modules of Expo packages: name → implementation merged over jest-expo's auto-mock. */
export function expoNativeModuleFakes(): Record<string, Record<string, unknown>> {
  return {
    ExpoSecureStore: {
      AFTER_FIRST_UNLOCK: 0,
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
      ALWAYS: 2,
      WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
      ALWAYS_THIS_DEVICE_ONLY: 4,
      WHEN_UNLOCKED: 5,
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
      getValueWithKeyAsync: async (key: string) => device().secureStore.get(key) ?? null,
      getValueWithKeySync: (key: string) => device().secureStore.get(key) ?? null,
      setValueWithKeyAsync: async (value: string, key: string) => {
        device().secureStore.set(key, value);
      },
      setValueWithKeySync: (value: string, key: string) => {
        device().secureStore.set(key, value);
      },
      deleteValueWithKeyAsync: async (key: string) => {
        device().secureStore.delete(key);
      },
      canUseBiometricAuthentication: () => device().biometrics.hardware && device().biometrics.enrolled,
    },
    ExpoLocalAuthentication: {
      hasHardwareAsync: async () => device().biometrics.hardware,
      isEnrolledAsync: async () => device().biometrics.enrolled,
      supportedAuthenticationTypesAsync: async () => device().biometrics.types,
      getEnrolledLevelAsync: async () => (device().biometrics.enrolled ? 2 : 0),
      authenticateAsync: record('LocalAuthentication.authenticateAsync', () => device().biometrics.nextResult),
      cancelAuthenticate: record('LocalAuthentication.cancelAuthenticate'),
    },
    ExpoNetwork: {
      getNetworkStateAsync: async () => ({ ...device().network }),
      getIpAddressAsync: async () => '10.0.0.2',
      isAirplaneModeEnabledAsync: async () => false,
    },
    ExpoNotificationPermissionsModule: {
      getPermissionsAsync: async () => permission(device().notifications.status === 'granted', device().notifications.status),
      requestPermissionsAsync: async () => {
        device().notifications.status = 'granted';
        return permission(true);
      },
      getExactAlarmPermissionsAsync: async () => {
        const { exactAlarm } = device().notifications;
        return { ...permission(exactAlarm === 'granted'), canAskAgain: exactAlarm !== 'undeclared' };
      },
      requestExactAlarmPermissionsAsync: async () => {
        const state = device().notifications;
        device().calls.push({ name: 'Notifications.requestExactAlarmPermissionsAsync', args: [] });
        if (state.exactAlarm === 'undeclared') throw new Error('SCHEDULE_EXACT_ALARM is not declared');
        state.exactAlarm = state.exactAlarmAfterRequest;
        return permission(state.exactAlarm === 'granted');
      },
    },
    ExpoNotificationPresenter: {
      getPresentedNotificationsAsync: async () =>
        device().notifications.presented.map((entry) => ({
          date: 0,
          request: { identifier: entry.identifier, content: { ...entry.content }, trigger: null },
        })),
      dismissNotificationAsync: async (identifier: string) => {
        const state = device().notifications;
        state.presented = state.presented.filter((entry) => entry.identifier !== identifier);
      },
      dismissAllNotificationsAsync: async () => {
        device().notifications.presented = [];
      },
    },
    ExpoNotificationScheduler: {
      getAllScheduledNotificationsAsync: async () => [...device().notifications.scheduled],
      scheduleNotificationAsync: async (identifier: string, content: Record<string, unknown>, trigger: unknown) => {
        const state = device().notifications;
        state.scheduled = [...state.scheduled.filter((entry) => entry.identifier !== identifier), { identifier, content: { ...content }, trigger }];
        return identifier;
      },
      cancelScheduledNotificationAsync: async (identifier: string) => {
        const state = device().notifications;
        state.scheduled = state.scheduled.filter((entry) => entry.identifier !== identifier);
      },
      cancelAllScheduledNotificationsAsync: async () => {
        device().notifications.scheduled = [];
      },
    },
    // Android-only modules: jest-expo's list is reflected from an iOS build and does not have them.
    ExpoNotificationChannelManager: {
      getNotificationChannelsAsync: async () => [...device().notifications.channels],
      getNotificationChannelAsync: async (id: string) => device().notifications.channels.find((channel) => channel.id === id) ?? null,
      setNotificationChannelAsync: async (id: string, channel: Record<string, unknown>) => {
        const state = device().notifications;
        state.channels = [...state.channels.filter((entry) => entry.id !== id), { ...channel, id }];
        return { ...channel, id };
      },
      deleteNotificationChannelAsync: async (id: string) => {
        const state = device().notifications;
        state.channels = state.channels.filter((entry) => entry.id !== id);
      },
    },
    ExpoNotificationChannelGroupManager: {
      getNotificationChannelGroupsAsync: async () => [],
      getNotificationChannelGroupAsync: async () => null,
      setNotificationChannelGroupAsync: async (id: string, group: Record<string, unknown>) => ({ ...group, id }),
      deleteNotificationChannelGroupAsync: async () => undefined,
    },
    ExpoTopicSubscriptionModule: {
      subscribeToTopicAsync: async () => undefined,
      unsubscribeFromTopicAsync: async () => undefined,
    },
    ExponentImagePicker: {
      getCameraPermissionsAsync: async () => permission(device().picker.cameraPermission),
      requestCameraPermissionsAsync: async () => permission(device().picker.cameraPermission),
      getMediaLibraryPermissionsAsync: async () => permission(device().picker.libraryPermission),
      requestMediaLibraryPermissionsAsync: async () => permission(device().picker.libraryPermission),
      launchCameraAsync: record('ImagePicker.launchCameraAsync', pickedImages),
      launchImageLibraryAsync: record('ImagePicker.launchImageLibraryAsync', pickedImages),
      getPendingResultAsync: async () => [],
    },
    ExpoDocumentPicker: {
      getDocumentAsync: record('DocumentPicker.getDocumentAsync', () => {
        const assets = device().picker.nextAssets;
        if (!assets) return { canceled: true, assets: null };
        return { canceled: false, assets: assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, lastModified: 0 })) };
      }),
    },
    ExpoSharing: {
      isAvailableAsync: async () => true,
      shareAsync: record('Sharing.shareAsync'),
    },
    ExpoKeepAwake: {
      activate: record('KeepAwake.activate'),
      deactivate: record('KeepAwake.deactivate'),
      isActivated: () => false,
    },
    ExpoHaptics: {
      impactAsync: record('Haptics.impactAsync'),
      notificationAsync: record('Haptics.notificationAsync'),
      selectionAsync: record('Haptics.selectionAsync'),
    },
  };
}

function pickedImages(): unknown {
  const assets = device().picker.nextAssets;
  if (!assets) return { canceled: true, assets: null };
  return {
    canceled: false,
    assets: assets.map((asset) => ({
      uri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType,
      fileSize: asset.size,
      width: asset.width ?? 1200,
      height: asset.height ?? 1600,
      type: 'image',
      assetId: null,
      exif: null,
      base64: null,
      duration: null,
    })),
  };
}

/** React Native TurboModules of community packages that have no jest support of their own. */
export function turboModuleFakes(): Record<string, Record<string, unknown>> {
  const dismissed = { action: 'dismissedAction' };
  return {
    // @react-native-community/datetimepicker (Android dialogs): the dialog opens and the user dismisses it.
    RNCDatePicker: { open: record('RNCDatePicker.open', () => dismissed), dismiss: record('RNCDatePicker.dismiss', () => true) },
    RNCTimePicker: { open: record('RNCTimePicker.open', () => dismissed), dismiss: record('RNCTimePicker.dismiss', () => true) },
    RNCMaterialDatePicker: { open: record('RNCMaterialDatePicker.open', () => dismissed), dismiss: async () => true },
    // react-native-webview: the JS component is real and renders the `RNCWebView` host view.
    RNCWebViewModule: {
      isFileUploadSupported: async () => true,
      shouldStartLoadWithLockIdentifier: () => undefined,
    },
    RNCMaterialTimePicker: { open: record('RNCMaterialTimePicker.open', () => dismissed), dismiss: async () => true },
    // React Native's own `Share` on Android (a core module every phone has; RN's jest setup leaves it out).
    ShareModule: { getConstants: () => ({}), share: record('Share.share', () => ({ action: 'sharedAction' })) },
  };
}

/**
 * `react-native-reanimated/mock` with its pure math helpers restored. The shipped mock stubs them with
 * no-ops (`interpolate()` returns undefined, which would put `undefined` into every interpolated style);
 * the real functions are plain JS and run as they are.
 */
export function reanimatedMockFactory(): Record<string, unknown> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const mock = require('react-native-reanimated/mock') as Record<string, unknown>;
  const actual = jest.requireActual('react-native-reanimated') as Record<string, unknown>;
  /* eslint-enable @typescript-eslint/no-require-imports */
  // gesture-handler's hooks subscribe to the shared values they are given; the mock's value has no
  // listener API at all.
  const useSharedValue = mock.useSharedValue as <T>(initial: T) => object;
  const withListeners = <T>(initial: T) => {
    const value = useSharedValue(initial);
    return new Proxy(value, {
      get(target, property, receiver) {
        if (property === 'addListener' || property === 'removeListener') return () => undefined;
        if (property === 'modify') {
          return (modifier?: (current: T) => T) => {
            if (modifier) (target as { value: T }).value = modifier((target as { value: T }).value);
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
  };
  return { ...mock, useSharedValue: withListeners, interpolate: actual.interpolate, interpolateColor: actual.interpolateColor, clamp: actual.clamp, Easing: actual.Easing };
}

/**
 * `AppState` of a foreground app. React Native's own jest mock has `currentState: jest.fn()` and drops the
 * listeners, i.e. an app that is never active — every "only while the screen is live" branch would be dead.
 */
export function appStateFake(): { __esModule: true; default: Record<string, unknown> } {
  return {
    __esModule: true,
    default: {
      get currentState() {
        return device().appState;
      },
      isAvailable: true,
      addEventListener(type: string, handler: (state: string) => void) {
        if (type !== 'change') return { remove() {} };
        const listeners = device().appStateListeners;
        listeners.add(handler);
        return { remove: () => listeners.delete(handler) };
      },
    },
  };
}

/** Moves the simulated app to the background / foreground; call inside `act`. */
export function setAppState(next: 'active' | 'background' | 'inactive'): void {
  device().appState = next;
  for (const listener of [...device().appStateListeners]) listener(next);
}
