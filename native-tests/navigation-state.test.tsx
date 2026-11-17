// Navigation state of the real route tree: what is under a tab root (hardware back / the iOS edge swipe),
// where a deep entry goes back to, how links into the teacher's segmented «занятия» tab land, and what a
// number search opened as the first screen opens. The state is read from the navigation container, and
// "hardware back" does what the native back handler does: `canGoBack() ? goBack() : leave the app`.
import { describe, expect, it } from '@jest/globals';

import { byTestId, pressTestId, root, typeTestId, visit } from './support/drive';
import type { AppHandle } from './support/launch';
import { all, flattenStyle, isHidden, type HostNode } from './support/tree';

type State = { index?: number; routes: { name: string; key: string; state?: State }[] };
type Ref = { getRootState(): State; canGoBack(): boolean; goBack(): void };

const ref = (): Ref => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('expo-router/build/global-state/navigationRef') as { navigationRef: Ref }).navigationRef;
};

/** Route names of the root layout's stack (inside expo-router's `__root` wrapper). */
function rootStack(): string[] {
  const root = ref().getRootState();
  const stack = root.routes.length === 1 && root.routes[0].name === '__root' ? root.routes[0].state : root;
  return stack?.routes.map((route) => route.name) ?? [];
}

/** Route names of the stack of one tab of the focused role tree. */
function tabStack(tabName: string): string[] {
  let state: State | undefined = ref().getRootState();
  while (state && !state.routes.some((route) => route.name === tabName)) state = state.routes[state.index ?? 0]?.state;
  return state?.routes.find((route) => route.name === tabName)?.state?.routes.map((route) => route.name) ?? [];
}

/** What Android's back button does (expo-router's useBackButton): pop, or leave the app. */
async function hardwareBack(app: AppHandle): Promise<'went-back' | 'exit-app'> {
  if (!ref().canGoBack()) return 'exit-app';
  await app.rntl.act(async () => {
    ref().goBack();
  });
  await app.settle();
  return 'went-back';
}

async function signIn(login: string, password: string): Promise<AppHandle> {
  const app = await visit({ url: '/login' });
  await typeTestId(app, 'login-input', login);
  await typeTestId(app, 'password-input', password);
  await pressTestId(app, 'login-submit');
  return app;
}

describe('the bottom of the root stack', () => {
  it.each([
    ['ilya@example.com', 'student123', '(student)', '/student'],
    ['teacher@example.com', 'teacher123', '(teacher)', '/teacher'],
    ['dev@example.com', 'developer123', '(developer)', '/developer/topics'],
  ])('after %s signs in, the role tree is the only route and back on the first tab leaves the app', async (login, password, tree, home) => {
    const app = await signIn(login, password);
    expect(app.path()).toBe(home);
    expect(rootStack()).toEqual([tree]);
    expect(await hardwareBack(app)).toBe('exit-app');
  });

  it('back from a second tab returns to the first one without rebuilding the role tree', async () => {
    const app = await signIn('ilya@example.com', 'student123');
    const homeKey = ref().getRootState().routes[0].state?.routes[0].key;
    await pressTestId(app, 'tab-deadlines');
    expect(app.path()).toBe('/student/deadlines');
    expect(await hardwareBack(app)).toBe('went-back');
    expect(app.path()).toBe('/student');
    expect(ref().getRootState().routes[0].state?.routes[0].key).toBe(homeKey);
    expect(await hardwareBack(app)).toBe('exit-app');
  });

  it.each([
    ['ilya@example.com', '/student/deadlines', '(student)'],
    ['teacher@example.com', '/teacher/students', '(teacher)'],
    ['dev@example.com', '/developer/accounts', '(developer)'],
  ] as const)('a deep entry of %s into %s keeps only the role tree under it', async (as, url, tree) => {
    await visit({ as, url });
    expect(rootStack()).toEqual([tree]);
  });

  it('after a sign-out the login form is the only route', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/demo' });
    await pressTestId(app, 'demo-persona-teacher@example.com');
    expect(app.path()).toBe('/login');
    expect(rootStack()).toEqual(['login']);
    expect(await hardwareBack(app)).toBe('exit-app');
  });

  it('an overlay opened as the first screen has the role tree under it', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/settings' });
    expect(rootStack()).toEqual(['(teacher)', 'settings']);
    expect(await hardwareBack(app)).toBe('went-back');
    expect(app.path()).toBe('/teacher');
  });
});

describe('deep entries go back to the role home', () => {
  it.each([
    ['/developer/topics/top_linear/edit', '/developer/topics'],
    ['/developer/topics/top_linear/numbers/112', '/developer/topics'],
  ])('developer: back from %s lands on %s', async (url, home) => {
    const app = await visit({ as: 'dev@example.com', url });
    expect(await hardwareBack(app)).toBe('went-back');
    // The list seeded under a deep entry keeps the entry's params in its URL; only the screen matters here.
    expect(app.path().split('?')[0]).toBe(home);
  });

  it('developer: /developer opens the topics tab', async () => {
    await visit({ as: 'dev@example.com', url: '/developer', expectPath: '/developer/topics' });
  });
});

describe('number search opened as the first screen', () => {
  it.each([
    ['ilya@example.com', '118', '/student/numbers/118'],
    ['teacher@example.com', '112', '/teacher/topics/top_linear/numbers/112'],
    ['dev@example.com', '112', '/developer/topics/top_linear/numbers/112'],
  ] as const)('%s: a hit for %s opens %s and back returns to the role tree', async (as, number, target) => {
    const app = await visit({ as, url: '/number-search' });
    await typeTestId(app, 'number-search-input', number);
    const input = byTestId(app, 'number-search-input');
    await app.rntl.act(async () => {
      app.rntl.fireEvent(input as never, 'submitEditing', { nativeEvent: { text: number } });
    });
    await app.settle();
    expect(app.path()).toBe(target);
    expect(rootStack()[0]).toMatch(/^\((student|teacher|developer)\)$/);
    expect(rootStack()).not.toContain('number-search');
  });
});

describe('links into the teacher «занятия» tab keep one list in its stack', () => {
  const open = async (app: AppHandle, link: { screen: 'planner.lessons' | 'planner.drafts' }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { navigateTo } = require('@/navigation') as typeof import('@/navigation');
    await app.rntl.act(async () => {
      navigateTo(link, 'TEACHER');
    });
    await app.settle();
  };

  it('the lessons link from another tab while the drafts segment is the root', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/homework-plans' });
    expect(tabStack('(planner)')).toEqual(['homework-plans']);
    await pressTestId(app, 'tab-(more)');
    await open(app, { screen: 'planner.lessons' });
    expect(app.path()).toBe('/teacher/lessons');
    expect(tabStack('(planner)')).toEqual(['lessons']);
  });

  it('the drafts link from a draft board while the drafts segment is the root', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/homework-plans' });
    await app.open('/teacher/homework-plans/hp_ready');
    expect(app.path()).toBe('/teacher/homework-plans/hp_ready');
    await open(app, { screen: 'planner.drafts' });
    expect(app.path()).toBe('/teacher/homework-plans');
    expect(tabStack('(planner)')).toEqual(['homework-plans']);
    // Back leaves the tab (to the first one) instead of showing a second copy of the same list.
    expect(await hardwareBack(app)).toBe('went-back');
    expect(app.path()).toBe('/teacher');
  });

  it('the drafts link while the lessons segment is the root replaces it', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/lessons' });
    await app.open('/teacher/lessons/les_g4');
    await open(app, { screen: 'planner.drafts' });
    expect(app.path()).toBe('/teacher/homework-plans');
    expect(tabStack('(planner)')).toEqual(['homework-plans']);
  });
});

describe('tab bar on a wide screen', () => {
  it('sizes the active pill by the centred row of items, not by the full-width bar', async () => {
    const app = await visit({ as: 'teacher@example.com', url: '/teacher/calls' });
    const bar = all(root(app), (node) => node.props.accessibilityRole === 'tablist' && !isHidden(node) && all(node, (child) => child.props.testID === 'tab-calls').length > 0)[0];
    expect(bar).toBeDefined();
    // A 768 pt tablet: the bar spans the screen, the items share the row capped at 560 pt.
    const layout = (node: HostNode, width: number) =>
      (node.props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 0, width, height: 56 } } });
    await app.rntl.act(async () => {
      for (const node of all(bar, (candidate) => typeof candidate.props.onLayout === 'function')) {
        layout(node, node === bar ? 768 : 560);
      }
    });
    await app.advance(50);
    const pill = all(bar, (node) => node.props.pointerEvents === 'none' && typeof flattenStyle(node.props.style).width === 'number')[0];
    expect(pill).toBeDefined();
    expect(flattenStyle(pill.props.style).width).toBe(112);
  });
});
