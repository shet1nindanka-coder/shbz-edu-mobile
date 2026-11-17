/**
 * Collects what went wrong during one test — console errors, fatal warnings, unhandled rejections and
 * violations found by the tree walker — and fails the test once, at its end, with all of them. A test
 * therefore runs to completion and reports every problem of its screen, not only the first one.
 */
import { expect, jest } from '@jest/globals';
import { appendFileSync } from 'node:fs';

import { ALLOWED_ERRORS, FATAL_WARNINGS, IGNORED_WARNINGS } from './console-policy';
import { findViolations, formatViolations, type Violation } from './tree-checks';
import type { HostNode } from './tree';

type Problem = { kind: 'console.error' | 'console.warn' | 'unhandledRejection' | 'tree' | 'step'; text: string; where?: string };

type State = { problems: Problem[]; warnings: string[]; advisories: Violation[]; seenViolations: Set<string>; step: string };

/**
 * Rules of the walker that describe a design or accessibility rule of the app, not something a phone
 * refuses. Their violations are collected (`advisories()`), written to the run report, and asserted once,
 * in advisories.test.tsx — a logo with a tight line height must not fail every test that shows the app bar.
 */
export const ADVISORY_RULES: ReadonlySet<string> = new Set([
  'line-height-below-font-size',
  'touch-target',
  'style-text-on-view',
  'text-without-font',
  'control-without-role',
  'control-without-name',
]);

declare global {
  var __shbzProblems: State | undefined;
}

const state = (): State => (globalThis.__shbzProblems ??= { problems: [], warnings: [], advisories: [], seenViolations: new Set(), step: '' });

/** `console.log`-style formatting: `%s` / `%o` placeholders of the first argument, the rest appended. */
function format(args: unknown[]): string {
  const show = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack ?? value.message;
    try {
      return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
    } catch {
      return String(value);
    }
  };
  const rest = [...args];
  let text = show(rest.shift());
  text = text.replace(/%[sdifoO]/g, (placeholder) => (rest.length > 0 ? show(rest.shift()) : placeholder));
  return [text, ...rest.map(show)].join(' ');
}

function render(args: unknown[]): string {
  const text = format(args);
  return text.length > 1500 ? `${text.slice(0, 1500)}…` : text;
}

/** First frames of the stack that are in the app's own sources. */
function appFrames(): string {
  const stack = new Error().stack ?? '';
  return stack
    .split('\n')
    .filter((line) => /\/src\//.test(line) && !/node_modules/.test(line))
    .slice(0, 3)
    .map((line) => line.trim().replace(/^at /, '').replace(/.*shbz-edu-mobile\//, '').replace(/\)$/, ''))
    .join(' < ');
}

const onUnhandled = (reason: unknown) => {
  state().problems.push({ kind: 'unhandledRejection', text: render([reason]), where: state().step });
};

export function startProblems(): void {
  globalThis.__shbzProblems = { problems: [], warnings: [], advisories: [], seenViolations: new Set(), step: '' };
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const text = render(args);
    if (ALLOWED_ERRORS.some((entry) => entry.pattern.test(text))) return;
    state().problems.push({ kind: 'console.error', text, where: [state().step, appFrames()].filter(Boolean).join(' | ') });
  });
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const text = render(args);
    if (IGNORED_WARNINGS.some((entry) => entry.pattern.test(text))) return;
    if (FATAL_WARNINGS.some((entry) => entry.pattern.test(text))) {
      state().problems.push({ kind: 'console.warn', text, where: [state().step, appFrames()].filter(Boolean).join(' | ') });
      return;
    }
    state().warnings.push(text.split('\n')[0]);
  });
  process.on('unhandledRejection', onUnhandled);
}

/** Names the part of the test that is running; attached to the problems found from here on. */
export function step(name: string): void {
  state().step = name;
}

/** Records a failed step without aborting the test (the remaining steps still run). */
export function recordFailure(name: string, error: unknown): void {
  state().problems.push({ kind: 'step', text: `${name}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2500) });
}

/** Violations of the advisory rules seen so far in this test. */
export function advisories(): Violation[] {
  return state().advisories;
}

/** Walks the tree and records every violation not yet seen in this test. */
export function checkTree(root: HostNode, label: string): Violation[] {
  const violations = findViolations(root);
  const fresh = violations.filter((violation) => {
    const key = `${violation.rule}|${violation.message}|${violation.path}|${violation.node}`;
    if (state().seenViolations.has(key)) return false;
    state().seenViolations.add(key);
    return true;
  });
  const hard = fresh.filter((violation) => !ADVISORY_RULES.has(violation.rule));
  state().advisories.push(...fresh.filter((violation) => ADVISORY_RULES.has(violation.rule)));
  if (hard.length > 0) state().problems.push({ kind: 'tree', text: formatViolations(hard), where: label });
  return fresh;
}

export function finishProblems(closeError: unknown): void {
  process.off('unhandledRejection', onUnhandled);
  const { problems, warnings, advisories: soft } = state();
  jest.restoreAllMocks();
  if (closeError) problems.push({ kind: 'step', text: `closing the app: ${closeError instanceof Error ? closeError.message : String(closeError)}` });

  const report = process.env.NATIVE_TESTS_REPORT;
  if (report) {
    const { currentTestName, testPath } = expect.getState();
    const platform = (require('react-native') as { Platform: { OS: string } }).Platform.OS; // eslint-disable-line @typescript-eslint/no-require-imports
    appendFileSync(report, `${JSON.stringify({ platform, file: testPath?.replace(/.*native-tests\//, ''), test: currentTestName, problems, warnings: [...new Set(warnings)], advisories: [...new Set(soft.map((violation) => `[${violation.rule}] ${violation.message} @ ${violation.path || violation.node}`))] })}\n`);
  }

  if (problems.length === 0) return;
  const lines = problems.map((problem, index) => `${index + 1}. [${problem.kind}]${problem.where ? ` (${problem.where})` : ''}\n${problem.text}`);
  throw new Error(`${problems.length} problem(s) in this render:\n\n${lines.join('\n\n')}`);
}
