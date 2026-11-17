// The note status after the review of the third round: «Сохраняем…» only while the queue really has a
// request in flight for the number; a draft that waits for its next try reads «Не сохранено, повторим» even
// when it never failed itself (loaded from a run killed mid-request, not reached by a pass that stopped on an
// earlier note).
import { describe, expect, it } from '@jest/globals';

import { byTestId, visit } from './support/drive';

const ILYA = 'ilya@example.com';
const STATUS = /Не сохранено, повторим|Сохраним при подключении|Сохраняем…|Сохранено/;

function statusText(testID: string, app: Awaited<ReturnType<typeof visit>>): string | null {
  const node = byTestId(app, testID);
  if (!node) return null;
  const texts: string[] = [];
  const walk = (current: unknown) => {
    if (typeof current === 'string') texts.push(current);
    else if (current && typeof current === 'object') for (const child of (current as { children?: unknown[] }).children ?? []) walk(child);
  };
  walk(node);
  return texts.join('').match(STATUS)?.[0] ?? null;
}

function stored(id: string, note: string, updatedAt: number) {
  return { kind: 'studentStudy.saveNumberNote', id, userId: 'usr_ilya', createdAt: updatedAt, updatedAt, attempts: 0, payload: { note } };
}

describe('a waiting note nobody is sending', () => {
  it('reads «Не сохранено, повторим», not «Сохраняем…», although it never failed itself', async () => {
    const app = await visit({
      as: ILYA,
      url: '/student/numbers/120',
      // Both drafts were in flight when the app was killed (attempts 0). The server keeps failing: the
      // sign-in flush stops at the older one, so 120 is never tried.
      storage: { 'shbz-pending-writes': JSON.stringify([stored('num_118', 'старый черновик', 1), stored('num_120', 'черновик 120', 2)]) },
      arrange: ({ mock }) => {
        mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'serviceUnavailable', times: 50 });
      },
    });
    await app.advance(500);
    expect((byTestId(app, 'number-note-input')?.props as { value?: string } | undefined)?.value).toBe('черновик 120');
    expect(statusText('number-note-status', app)).toBe('Не сохранено, повторим');
  });
});
