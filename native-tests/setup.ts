// Shared setup of the native render tests: every test fails on `console.error`, on an unhandled promise
// rejection and on the warnings listed in ./support/console-policy.ts; the app is closed after each test.
import { afterEach, beforeEach } from '@jest/globals';

import { finishProblems, startProblems } from './support/problems';
import { closeApp } from './support/launch';

beforeEach(() => {
  startProblems();
});

afterEach(async () => {
  let closeError: unknown = null;
  try {
    await closeApp();
  } catch (error) {
    closeError = error;
  }
  finishProblems(closeError);
});
