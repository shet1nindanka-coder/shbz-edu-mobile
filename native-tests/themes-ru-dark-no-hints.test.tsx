// A sample of every area in another language / theme / hints setting: the texts come from other
// dictionaries and the colours from the other palette, on the same native tree. One file per setting
// (a file of ~100 cold starts outgrows a jest worker's memory).
import { describe, it } from '@jest/globals';

import { visit } from './support/drive';
import { SAMPLE } from './support/locale-sample';

describe('Russian, dark theme, hints off', () => {
  it.each(SAMPLE)('%s %s', async (as, url) => {
    await visit({ as, url, ...({ locale: 'ru', theme: 'dark', hints: false } as const) });
  });
});
