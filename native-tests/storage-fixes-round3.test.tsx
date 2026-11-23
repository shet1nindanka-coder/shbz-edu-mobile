// Storage layer, round 3: a file opened after the session ended answers 401 `sessionExpired` and signs the
// user out (the site's /files/[fileId] answers 401 without a user) instead of claiming the teacher's file was
// deleted; a foreign / missing file stays a 404 for a signed-in user.
import { describe, expect, it } from '@jest/globals';

import { pressTestId, visit } from './support/drive';

describe('storage fixes, round 3', () => {
  it('signs out when a file is opened after the session ended', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student/theory' });
    // The session ends on the server side (TTL passed, revoked) while the screen is open.
    app.mock.backend.store.sessions.deleteWhere(() => true);
    // The row of a topic opens its theory file (a PDF) in the viewer.
    expect(await pressTestId(app, 'theory-card-top_linear')).toBe(true);
    await app.settle();
    expect(app.path()).toMatch(/^\/login/);
    expect(app.screen.queryByText('Файл не найден или был удалён.')).toBeNull();
    await app.unmount();
  });

  it('rejects with sessionExpired from every FileService method, and keeps 404 for a foreign file', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student/theory' });
    const { files } = app.runtime;
    // A signed-in student and a missing id: 404, no sign-out.
    await expect(files.describe('file_does_not_exist')).rejects.toMatchObject({ code: 'fileNotFound', status: 404 });
    expect(app.path()).toMatch(/^\/student/);

    app.mock.backend.store.sessions.deleteWhere(() => true);
    // The rejection also reaches the session provider (a state update): inside `act`.
    let failure: unknown = null;
    await app.rntl.act(async () => {
      failure = await files.describe('file_linear_theory').catch((error: unknown) => error);
    });
    expect(failure).toMatchObject({ code: 'sessionExpired', status: 401 });
    await app.settle();
    expect(app.path()).toMatch(/^\/login/);
    await expect(
      files.download({ id: 'file_linear_theory', originalName: 'linear-equations-theory.pdf', mimeType: 'application/pdf' }),
    ).rejects.toMatchObject({ code: 'sessionExpired', status: 401 });
    expect(files.source('file_linear_theory').uri).toBe('');
    await app.unmount();
  });
});
