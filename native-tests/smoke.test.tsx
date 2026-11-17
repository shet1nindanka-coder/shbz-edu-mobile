import { describe, expect, it } from '@jest/globals';

import { launch } from './support/launch';
import { checkTree } from './support/problems';
import { outline, type HostNode } from './support/tree';

describe('smoke', () => {
  it('starts signed out on the login screen', async () => {
    const app = await launch();
    expect(app.path()).toBe('/login');
    console.log(outline(app.screen.container as unknown as HostNode));
    checkTree(app.screen.container as unknown as HostNode, 'login');
  });

  it('restores a student session', async () => {
    const app = await launch({ as: 'ilya@example.com' });
    expect(app.path()).toBe('/student');
    console.log(outline(app.screen.container as unknown as HostNode));
    checkTree(app.screen.container as unknown as HostNode, 'student home');
  });
});
