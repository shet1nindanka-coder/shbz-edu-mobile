// System screens the app hands a file to (share sheet, Quick Look, another app) are presented above every
// window of the app, the lock cover included: a hand-off that finishes its download after the lock has closed
// must not present anything.
import { beforeEach, describe, expect, it } from '@jest/globals';

import { device, resetNativeFakes } from './support/fakes';

/* eslint-disable @typescript-eslint/no-require-imports */
const overlay = () => require('@/ui/overlay-cover') as typeof import('@/ui/overlay-cover');
const fileActions = () => require('@/services/files/file-actions') as typeof import('@/services/files/file-actions');
/* eslint-enable @typescript-eslint/no-require-imports */

const target = { uri: 'file:///cache/report.pdf', mimeType: 'application/pdf', name: 'report.pdf' };
const shareCalls = () => device().calls.filter((call) => call.name === 'Sharing.shareAsync').length;

describe('lock: file hand-offs', () => {
  beforeEach(() => {
    resetNativeFakes();
    overlay().setOverlayCover(null);
  });

  it('presents nothing while the lock covers the app, and shares again once it is gone', async () => {
    const { setOverlayCover } = overlay();
    const { shareFile, openInAnotherApp } = fileActions();

    setOverlayCover('lock');
    expect(await shareFile(target)).toEqual({ ok: false, reason: 'covered' });
    expect(await openInAnotherApp(target)).toEqual({ ok: false, reason: 'covered' });
    expect(shareCalls()).toBe(0);

    setOverlayCover(null);
    expect(await shareFile(target)).toEqual({ ok: true });
    expect(shareCalls()).toBe(1);
  });
});
