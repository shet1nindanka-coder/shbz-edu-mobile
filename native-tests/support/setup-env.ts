// Runs before the test framework: module mocks that must exist before any app module is loaded.
// Each library's own jest entry is used; hand-written fakes are in ./fakes and are kept thin.
// `jest.mock` factories and the native-module registry need `require`, and the environment flags must be
// set between the imports.
/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import { jest } from '@jest/globals';
import 'react-native-gesture-handler/jestSetup';
import '@shopify/flash-list/jestSetup';

// The app is re-required for every launch (see ./launch.ts), so RNTL must not register hooks on import.
process.env.RNTL_SKIP_AUTO_CLEANUP = 'true';
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { expoNativeModuleFakes, turboModuleFakes } from './fakes';

// The mocks the two packages ship (the same pair expo-router's testing library installs). Reanimated's
// mock renders `Animated.View` as a plain `View` and runs `useAnimatedStyle` callbacks synchronously, so
// the styles the app computes in worklets are visible in the rendered tree.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('./fakes').reanimatedMockFactory());
// expo-router's testing library would register its own copies of the mocks above when it is imported
// (the stock reanimated mock included, replacing ours). Its mock module is switched off and the one thing
// it adds on top — a scheme for expo-linking, which has no native constants under jest — is repeated here.
jest.mock('expo-router/build/testing-library/mocks', () => ({}));
jest.mock('expo-linking', () => ({
  ...jest.requireActual<typeof import('expo-linking')>('expo-linking'),
  createURL: (path: string) => `shbz://${path}`,
  resolveScheme: () => 'shbz',
  addEventListener: () => ({ remove() {} }),
}));
jest.mock('react-native/Libraries/AppState/AppState', () => require('./fakes').appStateFake());
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Native modules. jest-expo registers every Expo native module with methods that resolve to `undefined`
// — including `addListener`, which on a phone returns a subscription. Each module is re-registered as a
// JSI-style module (`globalThis.expo.modules`): the same stubs, the event emitter left to
// expo-modules-core's own implementation, and the simulated device's answers (./fakes) on top.
const nativeModules = require('react-native/Libraries/BatchedBridge/NativeModules').default as Record<string, unknown>;
type ExpoGlobal = { modules?: Record<string, Record<string, unknown>>; NativeModule: new () => Record<string, unknown> };
type UnimoduleProxy = { exportedMethods: Record<string, { name: string }[]>; modulesConstants: Record<string, Record<string, unknown>> };
const expoGlobal = (globalThis as unknown as { expo: ExpoGlobal }).expo;
const proxy = nativeModules.NativeUnimoduleProxy as UnimoduleProxy;
const deviceAnswers = expoNativeModuleFakes();
const expoModules = (expoGlobal.modules ??= {});
for (const name of new Set([...Object.keys(proxy.exportedMethods), ...Object.keys(deviceAnswers)])) {
  const module: Record<string, unknown> = { ...(proxy.modulesConstants[name] ?? {}) };
  for (const method of proxy.exportedMethods[name] ?? []) {
    if (method.name !== 'addListener' && method.name !== 'removeListeners') module[method.name] = async () => undefined;
  }
  delete module.addListener;
  delete module.removeListeners;
  // An instance of the polyfilled `NativeModule`, so `addListener` returns a real subscription.
  expoModules[name] = Object.assign(new expoGlobal.NativeModule(), module, deviceAnswers[name] ?? {});
}

for (const [name, implementation] of Object.entries(turboModuleFakes())) {
  Object.defineProperty(nativeModules, name, { configurable: true, enumerable: true, get: () => implementation });
}
