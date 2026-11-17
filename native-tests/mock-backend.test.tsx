// Defects of the in-process mock server that the harness ran into (they are reachable from the app's
// "Demo data" screen on a phone).
import { describe, expect, it, jest } from '@jest/globals';

import { launch, passwordFor } from './support/launch';

describe('mock server', () => {
  it('lets a user sign in again after "Reset demo data" while an earlier session is still stored', async () => {
    const app = await launch({ as: 'ilya@example.com', url: '/student' });
    // The demo screen's reset keeps the live sessions (the tester stays signed in) …
    const reset = app.mock.controls.resetDemoData();
    await jest.advanceTimersByTimeAsync(1000);
    await reset;
    // … so a second sign-in (another account on the demo screen, or the same one after the token was
    // lost) must get a new session id.
    const login = app.mock.shell.login({ login: 'teacher@example.com', password: passwordFor('teacher@example.com') });
    const outcome = login.then(
      () => 'signed in',
      (error: unknown) => `${(error as Error).name}: ${(error as Error).message}`,
    );
    await jest.advanceTimersByTimeAsync(1000);
    expect(await outcome).toBe('signed in');
  });
});
