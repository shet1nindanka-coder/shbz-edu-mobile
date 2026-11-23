/**
 * Driving the launched app: opening a screen and checking it, pressing every control of a screen, typing
 * into its fields. Problems are recorded (./problems), never thrown, so one test reports all of them.
 */
import { jest } from '@jest/globals';

import { launch, type AppHandle, type LaunchOptions } from './launch';
import { checkTree, recordFailure, step } from './problems';
import { all, describe as describeNode, isHidden, pressables, textOf, type HostNode } from './tree';

export const root = (app: AppHandle): HostNode => app.screen.container as unknown as HostNode;

export const byTestId = (app: AppHandle, testID: string): HostNode | null =>
  all(root(app), (node) => node.props.testID === testID && !isHidden(node))[0] ?? null;

export const hasTestId = (app: AppHandle, testID: string): boolean => byTestId(app, testID) !== null;

/** Visible text of the whole screen (inactive tabs and closed screens excluded). */
export function visibleText(app: AppHandle): string {
  const parts: string[] = [];
  const visit = (node: HostNode | string): void => {
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    if (isHidden(node)) return;
    node.children.forEach(visit);
  };
  visit(root(app));
  return parts.join(' ');
}

/** The checks every rendered state must pass: no error boundary, nothing native would refuse. */
export function checkScreen(app: AppHandle, label: string): void {
  step(label);
  if (hasTestId(app, 'route-error')) recordFailure(label, new Error('the route error boundary is shown (a screen threw while rendering)'));
  const loading = all(root(app), (node) => typeof node.props.testID === 'string' && /(^|-)loading$/.test(node.props.testID) && !isHidden(node));
  if (loading.length > 0) {
    recordFailure(label, new Error(`still loading after the data settled: ${loading.map((node) => `#${String(node.props.testID)}`).join(', ')}`));
  }
  checkTree(root(app), label);
}

export type VisitOptions = LaunchOptions & {
  /** Path the app must end on; default: the path of `url`. `null` skips the assertion. */
  expectPath?: string | null;
  /** The screen is expected to be the 404 shell. */
  expectNotFound?: boolean;
};

/** Cold start on `url` as the persona, wait for the data, run the checks. */
export async function visit(options: VisitOptions): Promise<AppHandle> {
  const label = `${options.as ?? 'signed out'} ${options.url ?? '/'}`;
  step(label);
  const app = await launch(options);
  const expected = options.expectPath === undefined ? (options.url ?? '/').split('?')[0] : options.expectPath;
  if (expected !== null && app.path().split('?')[0] !== expected) {
    recordFailure(label, new Error(`the deep link ended on ${app.path()} instead of ${expected}`));
  }
  const notFound = hasTestId(app, 'not-found');
  if (notFound && !options.expectNotFound) recordFailure(label, new Error('the screen shows the 404 shell'));
  if (!notFound && options.expectNotFound) recordFailure(label, new Error('the 404 shell was expected'));
  checkScreen(app, label);
  return app;
}

// ───────────────────────────── pressing ─────────────────────────────

/** Stable name of a control: its testID, else role + label, else its text. */
export function keyOf(node: HostNode): string {
  if (typeof node.props.testID === 'string') return `#${node.props.testID}`;
  const role = typeof node.props.accessibilityRole === 'string' ? node.props.accessibilityRole : node.type;
  const label = typeof node.props.accessibilityLabel === 'string' ? node.props.accessibilityLabel : textOf(node).trim();
  return `${role}:${label.slice(0, 60)}`;
}

/** Controls that differ only by a row id count as one kind: `homework-open-hw_ilya_far` → `homework-open-*`. */
function kindOf(key: string): string {
  return key
    .replace(/(hw|les|hp|usr|grp|top|num|file|ntf|call|acc|job)_[A-Za-z0-9_]+/g, '*')
    .replace(/\d+/g, '0')
    .replace(/[А-Яа-яЁё]+/g, 'а');
}

export type Control = { key: string; index: number };

/** Controls of the current screen, at most `perKind` of each kind and `limit` in total. */
export function controls(app: AppHandle, options: { perKind?: number; limit?: number; exclude?: Set<string> } = {}): Control[] {
  const perKind = options.perKind ?? 2;
  const kinds = new Map<string, number>();
  const seen = new Map<string, number>();
  const result: Control[] = [];
  for (const node of pressables(root(app))) {
    const key = keyOf(node);
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    if (options.exclude?.has(`${key}@${index}`)) continue;
    const kind = kindOf(key);
    const count = kinds.get(kind) ?? 0;
    if (count >= perKind) continue;
    kinds.set(kind, count + 1);
    result.push({ key, index });
  }
  return result.slice(0, options.limit ?? 40);
}

export function findControl(app: AppHandle, control: Control): HostNode | null {
  return pressables(root(app)).filter((node) => keyOf(node) === control.key)[control.index] ?? null;
}

/** Presses like a finger does (press in → out → press), on the app's fake clock, then waits for the result. */
export async function press(app: AppHandle, node: HostNode, label: string): Promise<void> {
  step(label);
  const user = app.rntl.userEvent.setup({ advanceTimers: (delay) => jest.advanceTimersByTimeAsync(delay).then(() => undefined) });
  try {
    await user.press(node as never);
  } catch (error) {
    recordFailure(`${label} (press)`, error);
  }
  try {
    await app.settle();
  } catch (error) {
    recordFailure(`${label} (settle)`, error);
  }
}

export async function pressTestId(app: AppHandle, testID: string): Promise<boolean> {
  const node = byTestId(app, testID);
  if (!node) {
    recordFailure(`press #${testID}`, new Error(`no visible element with testID "${testID}"`));
    return false;
  }
  await press(app, node, `press #${testID}`);
  return true;
}

export async function typeInto(app: AppHandle, node: HostNode, text: string, label: string): Promise<void> {
  step(label);
  try {
    await app.rntl.fireEvent(node as never, 'focus', { nativeEvent: {} });
    await app.rntl.fireEvent.changeText(node as never, text);
    await app.rntl.fireEvent(node as never, 'blur', { nativeEvent: {} });
  } catch (error) {
    recordFailure(`${label} (type)`, error);
  }
  try {
    await app.settle();
  } catch (error) {
    recordFailure(`${label} (settle)`, error);
  }
}

export async function typeTestId(app: AppHandle, testID: string, text: string): Promise<boolean> {
  const node = byTestId(app, testID);
  if (!node) {
    recordFailure(`type #${testID}`, new Error(`no visible element with testID "${testID}"`));
    return false;
  }
  await typeInto(app, node, text, `type #${testID}`);
  return true;
}

const inputs = (app: AppHandle): HostNode[] => all(root(app), (node) => node.type === 'TextInput' && node.props.editable !== false && !isHidden(node));

// ───────────────────────────── the crawler ─────────────────────────────

export type CrawlOptions = LaunchOptions & {
  /** Controls not to press at depth 1 (e.g. the tab bar, which other screens' crawls cover). */
  skip?: (key: string) => boolean;
  /** Cap of controls pressed on the screen itself (default 30) and inside each opened overlay (default 8). */
  limit?: number;
  overlayLimit?: number;
};

const CHROME = /^#(dock-|app-bar-|shell-app-bar|detail-app-bar-back)|^tab:|^button:(На главную|Home|Вернуться назад|Go back)$/;

/**
 * Presses every control of the screen at `url`, one cold start per press that changed anything, and, when a
 * press opened more UI on the same route (a sheet, a dialog, a menu, an expanded row), every control that
 * appeared. Then types into every text field of the screen. Each resulting state goes through the checks.
 */
export async function crawl(options: CrawlOptions): Promise<{ pressed: number; opened: number; typed: number }> {
  const label = `${options.as ?? 'signed out'} ${options.url ?? '/'}`;
  const skip = options.skip ?? ((key: string) => CHROME.test(key));
  let app = await launch(options);
  const startPath = app.path();
  checkScreen(app, label);
  const first = controls(app, { limit: options.limit ?? 30 }).filter((control) => !skip(control.key));
  const baseline = new Set(pressables(root(app)).map(keyOf));
  let dirty = false;
  let pressed = 0;
  let opened = 0;

  const fresh = async (): Promise<AppHandle> => {
    app = await launch({ ...options, warm: true });
    dirty = false;
    return app;
  };

  for (const control of first) {
    if (dirty) await fresh();
    const node = findControl(app, control);
    if (!node) continue;
    const before = shape(app);
    const name = `${label} › ${control.key}`;
    await press(app, node, name);
    pressed += 1;
    checkScreen(app, name);
    const moved = app.path() !== startPath;
    dirty = moved || shape(app) !== before;
    if (!dirty || moved) continue;

    // More UI on the same route: press what appeared.
    const appeared = controls(app, { limit: 200, perKind: 1 })
      .filter((candidate) => !baseline.has(candidate.key) && !skip(candidate.key))
      .slice(0, options.overlayLimit ?? 8);
    if (appeared.length > 0) opened += 1;
    for (const [position, child] of appeared.entries()) {
      if (position > 0) {
        await fresh();
        const parent = findControl(app, control);
        if (!parent) break;
        await press(app, parent, name);
      }
      const target = findControl(app, child);
      if (!target) continue;
      const childName = `${name} › ${child.key}`;
      await press(app, target, childName);
      pressed += 1;
      checkScreen(app, childName);
      for (const [index, input] of inputs(app).entries()) await typeInto(app, input, sampleText(input), `${childName} › input ${index}`);
      checkScreen(app, `${childName} › typed`);
    }
    dirty = true;
  }

  // Text fields of the screen itself.
  if (dirty) await fresh();
  let typed = 0;
  for (const [index, input] of inputs(app).entries()) {
    const current = inputs(app)[index];
    if (!current) break;
    await typeInto(app, current, sampleText(input), `${label} › input ${describeNode(input)}`);
    typed += 1;
  }
  if (typed > 0) checkScreen(app, `${label} › typed`);
  return { pressed, opened, typed };
}

function sampleText(input: HostNode): string {
  const keyboard = input.props.keyboardType ?? input.props.inputMode;
  if (keyboard === 'numeric' || keyboard === 'number-pad' || keyboard === 'decimal-pad' || keyboard === 'decimal') return '12';
  if (keyboard === 'email-address' || keyboard === 'email') return 'new.student@example.com';
  return 'Проверка 123 x^2';
}

/** Host types, testIDs and texts of the visible tree. */
function shape(app: AppHandle): string {
  const visit = (node: HostNode | string): string => {
    if (typeof node === 'string') return JSON.stringify(node);
    if (isHidden(node)) return '';
    return `${node.type}${typeof node.props.testID === 'string' ? `#${node.props.testID}` : ''}(${node.children.map(visit).join(',')})`;
  };
  return visit(root(app));
}

// ───────────────────────────── scripted flows ─────────────────────────────

/** `#testID`, or a part of a control's key (`radio:Желтый`, `button:Готово`). */
export function locate(app: AppHandle, selector: string): HostNode | null {
  if (selector.startsWith('#')) return byTestId(app, selector.slice(1));
  return pressables(root(app)).find((node) => keyOf(node).includes(selector)) ?? null;
}

/** Presses the control and checks the resulting state; a control that is not there is recorded as a failed step. */
export async function tap(app: AppHandle, selector: string): Promise<boolean> {
  const node = locate(app, selector);
  if (!node) {
    recordFailure(`tap ${selector}`, new Error(`no such control on ${app.path()}`));
    return false;
  }
  await press(app, node, `tap ${selector}`);
  checkScreen(app, `after ${selector} on ${app.path()}`);
  return true;
}

export async function fill(app: AppHandle, selector: string, text: string): Promise<boolean> {
  const node = locate(app, selector);
  if (!node) {
    recordFailure(`fill ${selector}`, new Error(`no such field on ${app.path()}`));
    return false;
  }
  await typeInto(app, node, text, `fill ${selector}`);
  checkScreen(app, `after typing into ${selector} on ${app.path()}`);
  return true;
}

/** Lets app time pass (latency, polling, deferred jobs of the mock server), then checks the screen. */
export async function wait(app: AppHandle, ms: number, label: string): Promise<void> {
  step(label);
  try {
    await app.advance(ms);
    await app.settle();
  } catch (error) {
    recordFailure(label, error);
  }
  checkScreen(app, label);
}
