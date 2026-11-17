/**
 * Cold start of the real app under jest: the real route tree of `src/app` (layouts, guards, redirects)
 * mounted by expo-router's own testing helper, the real composition root (`AppProviders`), and the real
 * in-process mock server created by `getAppRuntime()`. Nothing under `src/` is mocked.
 *
 * Every launch gets a fresh module registry (`jest.resetModules()`), i.e. a new JS runtime like a cold
 * start on a phone: a new mock dataset seeded at `T0`, an empty AsyncStorage / Keychain, no cached queries.
 * Time is jest's fake clock, started at the fixtures' test anchor, so the mock server's latency and deferred
 * jobs run when the test advances the clock.
 */
import { jest } from '@jest/globals';
import type { ComponentType } from 'react';

import { device, resetNativeFakes, secureStoreFake } from './fakes';

/** Monday 16 November 2026, 12:00 Moscow time — the anchor the fixtures and `tests/mock-*.test.ts` use. */
export const T0 = '2026-11-16T09:00:00.000Z';

export type PersonaLogin =
  | 'ilya@example.com'
  | 'polina@example.com'
  | 'artem@example.com'
  | 'kirill@example.com'
  | 'maria@example.com'
  | 'dasha@example.com'
  | 'timur@example.com'
  | 'egor@example.com'
  | 'teacher@example.com'
  | 'teacher2@example.com'
  | 'teacher3@example.com'
  | 'dev@example.com';

export type LaunchOptions = {
  /** Signed-in persona; omit to start signed out. */
  as?: PersonaLogin;
  /** Deep link the app is opened with (default `/`). */
  url?: string;
  locale?: 'ru' | 'en';
  theme?: 'light' | 'dark';
  hints?: boolean;
  /** Changes the simulated device before the app starts (no connection, no biometry, stored switches). */
  device?: (state: ReturnType<typeof device>) => void;
  /** Extra values in the device's AsyncStorage before the app starts (e.g. the app-only switches). */
  storage?: Record<string, string>;
  /** Runs after the runtime exists and before the tree mounts: arrange the mock backend. */
  arrange?: (app: Pick<AppHandle, 'mock' | 'runtime'>) => void | Promise<void>;
  /** Do not wait for the first screen to settle (the caller wants to see the loading state). */
  noSettle?: boolean;
};

type Storage = { clear(): Promise<void>; setItem(key: string, value: string): Promise<void>; getItem(key: string): Promise<string | null> };
type Rntl = typeof import('@testing-library/react-native');
type RouterTesting = typeof import('expo-router/testing-library');
type Providers = typeof import('@/providers');
type Mock = NonNullable<ReturnType<Providers['getDemoBackend']>>;

export type AppHandle = {
  rntl: Rntl;
  screen: Rntl['screen'];
  router: typeof import('expo-router').router;
  runtime: ReturnType<Providers['getAppRuntime']>;
  mock: Mock;
  queryClient: ReturnType<Providers['getQueryClient']>;
  /** Current URL of the router (path + query). */
  path(): string;
  /** Advances the fake clock by `ms` inside `act`, flushing promises on the way. */
  advance(ms: number): Promise<void>;
  /** Advances the clock until no query or mutation is running and the tree stopped changing. */
  settle(maxMs?: number): Promise<void>;
  /** Navigates by URL like a deep link, then settles. */
  open(url: string): Promise<void>;
  unmount(): Promise<void>;
};

export function passwordFor(login: string): string {
  if (login.startsWith('dev@')) return 'developer123';
  if (login.startsWith('teacher')) return 'teacher123';
  return 'student123';
}

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] };

/** Shape of the rendered tree: host types and texts. Enough to see that loading placeholders are gone. */
function signature(node: Node | string): string {
  if (typeof node === 'string') return JSON.stringify(node);
  return `${node.type}(${node.children.map(signature).join(',')})`;
}

/**
 * What a phone reports back after a render and jest never does:
 * - `onLayout` of every view that listens (components that render their content only once they know
 *   their width would otherwise stay empty): the window width minus the page gutters, a row's height;
 * - a `WebView` that finished loading, and — for the math shell (`src/components/math/math-shell.ts`) —
 *   its "ready" message and a measured content height.
 * The numbers are plausible, not computed: nothing here is a layout engine.
 */
function reportNativeEvents(root: Node, windowSize: { width: number; height: number }): void {
  const visit = (node: Node, depth: number): void => {
    const { onLayout, onLoadingFinish, onMessage } = node.props as Record<string, ((event: unknown) => void) | undefined>;
    if (typeof onLayout === 'function') {
      const scrolls = node.type === 'RCTScrollView';
      const layout = { x: 0, y: 0, width: depth < 12 ? windowSize.width : windowSize.width - 32, height: scrolls ? windowSize.height - 160 : 56 };
      onLayout({ nativeEvent: { layout }, currentTarget: null, target: null, persist() {} });
    }
    if (node.type === 'RNCWebView') {
      const base = { url: 'about:blank', title: '', loading: false, canGoBack: false, canGoForward: false, lockIdentifier: 0 };
      if (typeof onLoadingFinish === 'function') onLoadingFinish({ nativeEvent: base });
      if (typeof onMessage === 'function') {
        onMessage({ nativeEvent: { ...base, data: JSON.stringify({ ready: true }) } });
        for (const id of [1, 2, 3, 4]) onMessage({ nativeEvent: { ...base, data: JSON.stringify({ id, h: 44 }) } });
      }
    }
    for (const child of node.children) if (typeof child !== 'string') visit(child, depth + 1);
  };
  visit(root, 0);
}

let current: AppHandle | null = null;

export function currentApp(): AppHandle | null {
  return current;
}

type Loaded = {
  AsyncStorage: Storage;
  routerTesting: RouterTesting;
  rntl: Rntl;
  router: typeof import('expo-router').router;
  ExpoRoot: ComponentType<{ context: unknown; location: string }>;
  getRouteInfoFromState(state: unknown): { pathnameWithParams: string };
  navigationRef: { getRootState(): unknown };
  createElement: typeof import('react').createElement;
  providers: Providers;
  reactNative: typeof import('react-native');
};

let loaded: Loaded | null = null;

function load(): Loaded {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const storageModule = require('@react-native-async-storage/async-storage') as { default?: Storage } & Storage;
  const routerTesting = require('expo-router/testing-library') as RouterTesting;
  const rntl = require('@testing-library/react-native') as Rntl;
  const { router } = require('expo-router') as typeof import('expo-router');
  const { ExpoRoot } = require('expo-router/build/ExpoRoot') as Pick<Loaded, 'ExpoRoot'>;
  const { getRouteInfoFromState } = require('expo-router/build/global-state/getRouteInfoFromState') as Pick<Loaded, 'getRouteInfoFromState'>;
  const { navigationRef } = require('expo-router/build/global-state/navigationRef') as Pick<Loaded, 'navigationRef'>;
  const { createElement } = require('react') as typeof import('react');
  const providers = require('@/providers') as Providers;
  const reactNative = require('react-native') as typeof import('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { reactNative, AsyncStorage: storageModule.default ?? storageModule, routerTesting, rntl, router, ExpoRoot, getRouteInfoFromState, navigationRef, createElement, providers };
}

/**
 * Cold start: a new JS runtime (module registry), a new mock dataset, an empty device.
 *
 * `warm: true` restarts the app inside the current runtime instead — the tree is unmounted, the device
 * storage and the mock dataset are reset, the clock goes back to `T0`, and the app mounts again. It is
 * what the crawler uses between presses: several times faster and without the memory a module registry
 * costs. Module-level state of the app survives a warm restart, as it would not on a phone; the
 * per-screen tests therefore always start cold.
 */
export async function launch(options: LaunchOptions & { warm?: boolean } = {}): Promise<AppHandle> {
  const warm = options.warm === true && current !== null && loaded !== null;
  if (current) await closeApp({ keepRuntime: warm });

  if (!warm || !loaded) {
    jest.resetModules();
    jest.useFakeTimers({ now: new Date(T0).getTime() });
    loaded = load();
  } else {
    jest.setSystemTime(new Date(T0).getTime());
  }
  resetNativeFakes();
  options.device?.(device());
  const { AsyncStorage, routerTesting, rntl, router, ExpoRoot, getRouteInfoFromState, navigationRef, createElement, providers } = loaded;

  await AsyncStorage.clear();
  // Device preferences are read once at start, exactly as on a phone with these values stored.
  await AsyncStorage.setItem('shbz-lang', options.locale ?? 'ru');
  await AsyncStorage.setItem('shbz-theme', options.theme ?? 'light');
  await AsyncStorage.setItem('shbz-hints', options.hints === false ? 'off' : 'on');
  for (const [key, value] of Object.entries(options.storage ?? {})) await AsyncStorage.setItem(key, value);

  const runtime = providers.getAppRuntime();
  const mock = providers.getDemoBackend();
  if (!mock) throw new Error('The app is expected to run on the mock backend.');

  const flush = async (ms: number) => {
    await rntl.act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  };
  const timed = async <T>(promise: Promise<T>): Promise<T> => {
    await jest.advanceTimersByTimeAsync(1000);
    return promise;
  };

  if (warm) {
    // What a cold start gets for free: nobody signed in, nothing cached, the dataset as seeded.
    runtime.setSessionToken(null);
    providers.getQueryClient().clear();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/services/network') as typeof import('@/services/network')).setSimulatedOffline(false);
    // The sessions are dropped before the reset: "Reset demo data" keeps them while restarting the id
    // counter, so the next sign-in would collide with a surviving `ses_m1` (reported as a finding; the
    // regression test is in mock-backend.test.tsx).
    mock.backend.store.sessions.deleteWhere(() => true);
    await timed(mock.controls.resetDemoData());
  }
  if (options.as) {
    // A stored session, as after an earlier sign-in on this device: the app restores it with `GET /me`.
    const { token } = await timed(mock.shell.login({ login: options.as, password: passwordFor(options.as) }));
    secureStoreFake.set('shbz.session.token', token);
  }
  if (options.arrange) await options.arrange({ mock, runtime });

  // The same three steps as expo-router's `renderRouter`, minus its `jest.useFakeTimers()`: installing a
  // second fake clock would detach the mock server (created above) from the test's clock.
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  await rntl.render(createElement(ExpoRoot, { context: routerTesting.getMockContext('./src/app'), location: options.url ?? '/' }));

  const queryClient = providers.getQueryClient();
  const handle: AppHandle = {
    rntl,
    screen: rntl.screen,
    router,
    runtime,
    mock,
    queryClient,
    path: () => getRouteInfoFromState(navigationRef.getRootState()).pathnameWithParams,
    advance: flush,
    async settle(maxMs = 20000) {
      // Data first, then what the native side would report (layout, loaded web views), then the data
      // that this made the screen ask for — until nothing changes any more.
      for (let round = 0; round < 4; round += 1) {
        await idle(maxMs);
        const before = signature(rntl.screen.container);
        await rntl.act(async () => {
          reportNativeEvents(rntl.screen.container as unknown as Node, windowSize);
        });
        await flush(50);
        if (signature(rntl.screen.container) === before && queryClient.isFetching() === 0) return;
      }
      await idle(maxMs);
    },
    async open(url) {
      await rntl.act(async () => {
        router.navigate(url as never);
      });
      await handle.settle();
    },
    async unmount() {
      await rntl.cleanup();
    },
  };
  const windowSize = (loaded.reactNative.Dimensions.get('window') as { width: number; height: number });
  const idle = async (maxMs: number): Promise<void> => {
    {
      let waited = 0;
      let idleRounds = 0;
      let previous = '';
      while (waited < maxMs) {
        await flush(250);
        waited += 250;
        const busy = queryClient.isFetching() > 0 || queryClient.isMutating() > 0;
        const snapshot = busy ? '' : signature(rntl.screen.container);
        if (!busy && snapshot === previous) {
          idleRounds += 1;
          if (idleRounds >= 2) return;
        } else {
          idleRounds = 0;
        }
        previous = snapshot;
      }
      throw new Error(`The screen did not settle within ${maxMs} ms of app time (queries still running or the tree keeps changing).`);
    }
  };
  current = handle;
  if (!options.noSettle) await handle.settle();
  return handle;
}

/** Unmounts the current app and drops pending timers; called after every test. */
export async function closeApp(options: { keepRuntime?: boolean } = {}): Promise<void> {
  const app = current;
  current = null;
  if (app) {
    try {
      await app.unmount();
    } finally {
      if (!options.keepRuntime) app.mock.dispose();
    }
  }
  jest.clearAllTimers();
  if (options.keepRuntime) return;
  loaded = null;
  // Recorded calls of the native-module mocks hold the callbacks they were given.
  jest.clearAllMocks();
  // Listeners registered on the process-wide native module objects would keep the whole module registry
  // of this launch alive.
  const modules = (globalThis as unknown as { expo?: { modules?: Record<string, { listeners?: Map<unknown, unknown> }> } }).expo?.modules ?? {};
  for (const module of Object.values(modules)) module.listeners?.clear();
  if (process.env.NATIVE_TESTS_MEMORY) process.stdout.write(`heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB\n`);
}
