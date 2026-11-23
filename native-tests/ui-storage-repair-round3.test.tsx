// Repairs after the review of round 3 (shared UI / storage):
// - a note editor whose error notice carries a live rate-limit countdown speaks the message once on iOS,
//   not at every tick (#233: `Notice` announces its title + text by default);
// - the Demo data screen says when the stored dataset could not be read (#251).
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, fill, visibleText, visit } from './support/drive';
import { showHomeworkNumber } from './support/student';

const ILYA = 'ilya@example.com';

const isIos = () => (require('react-native') as typeof import('react-native')).Platform.OS === 'ios'; // eslint-disable-line @typescript-eslint/no-require-imports

describe('note editors with a rate-limit countdown (#233)', () => {
  it.each([
    ['number screen', '/student/numbers/118', '#number-note-input', 'number-note-error'],
    ['homework card', '/student/homeworks/hw_ilya_overdue', '#number-note-120', 'number-note-error-120'],
  ])('%s: speaks the error once, never the ticking countdown', async (_name, url, input, errorId) => {
    const app = await visit({ as: ILYA, url });
    // The homework shows one number card: № 120 is chosen in the strip first.
    if (input === '#number-note-120') await showHomeworkNumber(app, '120');
    const { AccessibilityInfo } = require('react-native') as typeof import('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
    const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    const plain = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const spoken = () => [...queued.mock.calls.map((call) => call[0]), ...plain.mock.calls.map((call) => call[0])];
    try {
      app.mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'rateLimited', times: 1 });
      expect(await fill(app, input, 'заметка под лимитом')).toBe(true);
      await app.advance(1500);
      await app.settle();
      expect(byTestId(app, errorId)).not.toBeNull();
      expect(visibleText(app)).toMatch(/Повторить можно через/);
      await app.advance(3000);
      await app.settle();
      const said = spoken();
      expect(said.some((text) => /Повторить можно через/.test(text))).toBe(false);
      if (isIos()) expect(said.filter((text) => text === said[0]).length).toBe(1);
      else expect(said).toEqual([]);
    } finally {
      queued.mockRestore();
      plain.mockRestore();
    }
  });
});

describe('Demo data screen (#251)', () => {
  it('says when the stored dataset could not be read, and stays quiet otherwise', async () => {
    const plain = await visit({ url: '/demo' });
    expect(byTestId(plain, 'demo-dataset-age')).not.toBeNull();
    expect(byTestId(plain, 'demo-storage-read-failed')).toBeNull();

    const app = await visit({
      url: '/demo',
      arrange: ({ mock }) => {
        const real = mock.controls.datasetInfo.bind(mock.controls);
        jest.spyOn(mock.controls, 'datasetInfo').mockImplementation(() => ({ ...real(), storageReadFailed: true }));
      },
    });
    expect(byTestId(app, 'demo-storage-read-failed')).not.toBeNull();
    expect(visibleText(app)).toMatch(/could not be read/);
    jest.restoreAllMocks();
  });
});
