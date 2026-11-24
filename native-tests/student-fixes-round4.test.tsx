// Student area, fourth round of fixes, on the native tree (iOS and Android projects).
//
// #305: the first AI check of a homework was never announced (the hook took it for the opening state).
// #330: the verdict or failure of a live-lesson submission was never spoken.
// #341: a slow homework-check poll answer replaced the batch with what the server held before an upload,
//       and the poll stopped, so the uploaded photo stayed hidden.
// #342: a slow live-lesson /state answer took an item back to its previous submission, re-enabled
//       «Пересдать» and stopped the poll.
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, tap, visibleText, visit } from './support/drive';
import { device } from './support/fakes';
import type { AppHandle } from './support/launch';
import { submittableLessonNumbers } from './support/student';
import type { HostNode } from './support/tree';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: {
    manipulate: (uri: string) => ({
      resize: () => undefined,
      release: () => undefined,
      renderAsync: async () => ({ saveAsync: async () => ({ uri, width: 1200, height: 1600 }), release: () => undefined }),
    }),
  },
}));
jest.mock('../src/services/photos/file-size', () => ({ getLocalFileSize: async () => 240_000 }));

const photo = (index: number) => ({
  uri: `file:///data/user/0/cache/ImagePicker/solution-${index}.jpg`,
  name: `solution-${index}.jpg`,
  mimeType: 'image/jpeg',
  size: 240_000,
});

type Holder = { delayMs: number };

/**
 * Delays the answers of one API method by `holder.delayMs` AFTER the mock has produced them: the answer
 * carries what the server read when the request left, like a slow mobile network against a real server.
 */
function holdAnswers(app: Pick<AppHandle, 'runtime'>, method: string, holder: Holder): void {
  const member = (app.runtime.api as unknown as Record<string, Record<string, unknown>>).studentWork;
  const original = member[method] as (...args: unknown[]) => Promise<unknown>;
  member[method] = (...args: unknown[]) =>
    original(...args).then((value) => {
      const delay = holder.delayMs;
      return delay > 0 ? new Promise((resolve) => setTimeout(() => resolve(value), delay)) : value;
    });
}

function spyAnnouncements(): () => string[] {
  const RN = require('react-native') as typeof import('react-native'); // eslint-disable-line @typescript-eslint/no-require-imports
  const plain = jest.spyOn(RN.AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const queued = jest.spyOn(RN.AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
  plain.mockClear();
  queued.mockClear();
  return () => [...plain.mock.calls.map((c) => String(c[0])), ...queued.mock.calls.map((c) => String(c[0]))];
}

function textIn(node: HostNode | null): string {
  return node ? visibleText({ screen: { container: node } } as never).replace(/\s+/g, ' ') : '';
}

/** The live lesson shows one item card: the card of `number` is brought on screen by its tile in the strip. */
async function showLessonNumber(app: AppHandle, number: string): Promise<void> {
  const tile = byTestId(app, `lesson-tile-${number}`);
  expect(tile).not.toBeNull();
  await app.rntl.act(async () => {
    app.rntl.fireEvent.press(tile as never);
  });
  await app.settle();
  expect(byTestId(app, `lesson-item-${number}`)).not.toBeNull();
}

/**
 * «Выбрать из галереи» for a lesson item, until the shot is on the preview sheet: on iOS the app waits about
 * a second of app time for the source sheet and the system picker to leave, longer than `settle` watches.
 */
async function pickForLesson(app: AppHandle): Promise<void> {
  await tap(app, '#photo-source-library');
  for (let step = 0; step < 8 && byTestId(app, 'lesson-preview-send') === null; step += 1) await app.advance(250);
  await app.settle();
}

/**
 * The running check has no line of its own any more: the start button says it — «Проверяется…» with a
 * spinner, busy and switched off for a screen reader.
 */
function checkIsRunning(app: AppHandle): boolean {
  const start = byTestId(app, 'homework-check-start');
  expect(start).not.toBeNull();
  const state = (start as HostNode).props.accessibilityState as { busy?: boolean; disabled?: boolean } | undefined;
  const running = String((start as HostNode).props.accessibilityLabel ?? '') === 'Проверяется…';
  // The three signals go together.
  expect(state?.busy === true).toBe(running);
  if (running) expect(state?.disabled).toBe(true);
  return running;
}

async function server<T>(app: AppHandle, request: () => Promise<T>): Promise<T> {
  const pending = request();
  await app.advance(1500);
  return pending;
}

describe('homework check (#305, #341)', () => {
  it('the start of the first check of a homework is announced', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student/homeworks/hw_ilya_open' });
    const spoken = spyAnnouncements();
    await tap(app, '#homework-check-start');
    await app.advance(1500);
    await app.settle();
    expect(checkIsRunning(app)).toBe(true);
    expect(textIn(byTestId(app, 'homework-check-start'))).toContain('Проверяется…');
    // The sentence under the button was removed from view; a screen reader is still told, once.
    expect(spoken()).toEqual(['Проверка решения выполняется.']);
  });

  it('a poll answer read before an upload does not hide the uploaded photo; the detail is re-read', async () => {
    const holder: Holder = { delayMs: 0 };
    const app = await visit({
      as: 'ilya@example.com',
      url: '/student/homeworks/hw_ilya_open',
      arrange: (handle) => holdAnswers(handle, 'getLatestHomeworkCheck', holder),
    });
    await tap(app, '#homework-check-start');
    await app.advance(5000);
    // From now on a poll answer arrives 6 s after the server read it (check DONE, batch detached: 0 photos).
    holder.delayMs = 6000;
    await app.advance(3000);

    device().picker.nextAssets = [photo(7)];
    const add = app.screen
      .queryAllByRole('button')
      .find((node) => /Добавить фото/.test(String(node.props.accessibilityLabel ?? '')));
    expect(add).toBeDefined();
    await app.rntl.act(async () => {
      app.rntl.fireEvent.press(add as never);
    });
    await app.advance(400);
    await tap(app, '#photo-source-library');
    for (let step = 0; step < 12; step += 1) await app.advance(1000);
    holder.delayMs = 0;
    await app.advance(10000);
    await app.settle();

    const onServer = await server(app, () => app.mock.studentWork.getHomework('hw_ilya_open'));
    expect(onServer.assignment.photos.length).toBe(1);
    expect(onServer.assignment.latestCheck?.status).toBe('DONE');
    // The counter of the batch: «1/10» for the eye, in words for a screen reader.
    expect(textIn(byTestId(app, 'homework-photos'))).toContain('1/10');
    expect(app.rntl.within(byTestId(app, 'homework-photos') as never).queryByLabelText('Прикреплено фото: 1 из 10')).not.toBeNull();
    expect(checkIsRunning(app)).toBe(false);
  });
});

describe('live lesson (#330, #342)', () => {
  it('the verdict of a submission the student is waiting for is spoken once', async () => {
    const app = await visit({ as: 'polina@example.com', url: '/student/lesson' });
    await showLessonNumber(app, '010208');
    const spoken = spyAnnouncements();
    expect(textIn(byTestId(app, 'lesson-item-010208'))).toContain('Проверяется');
    for (let step = 0; step < 60 && /Проверяется/.test(textIn(byTestId(app, 'lesson-item-010208'))); step += 1) {
      await app.advance(4000);
      await app.settle();
    }
    expect(textIn(byTestId(app, 'lesson-item-010208'))).not.toContain('Проверяется');
    const said = spoken().filter((text) => text.startsWith('№ 010208: '));
    expect(said).toHaveLength(1);
    // Nothing for the items that were already finished when the screen opened.
    expect(spoken().every((text) => text.startsWith('№ 010208: '))).toBe(true);
    await app.advance(20000);
    expect(spoken().filter((text) => text.startsWith('№ 010208: '))).toHaveLength(1);
  });

  it('a /state answer read before a new submission does not bring the old one back', async () => {
    const holder: Holder = { delayMs: 0 };
    const app = await visit({
      as: 'polina@example.com',
      url: '/student/lesson',
      arrange: (handle) => holdAnswers(handle, 'getLiveLessonState', holder),
    });
    const [first, second] = await submittableLessonNumbers(app);
    expect(second).toBeDefined();

    device().picker.nextAssets = [photo(1)];
    await showLessonNumber(app, first);
    await tap(app, `#lesson-submit-${first}`);
    await pickForLesson(app);
    await tap(app, '#lesson-preview-send');
    await app.advance(1500);

    device().picker.nextAssets = [photo(2)];
    await showLessonNumber(app, second);
    const remarkBefore = textIn(byTestId(app, `lesson-comment-${second}`));
    await tap(app, `#lesson-submit-${second}`);
    await pickForLesson(app);
    expect(byTestId(app, 'lesson-preview-send')).not.toBeNull();
    // A poll leaves and is held 6 s; meanwhile the student sends the second item.
    holder.delayMs = 6000;
    await app.advance(3000);
    await app.rntl.act(async () => {
      app.rntl.fireEvent.press(byTestId(app, 'lesson-preview-send') as never);
    });
    for (let step = 0; step < 8; step += 1) {
      await app.advance(1000);
      // Never the previous submission with an enabled resubmit button.
      expect(byTestId(app, `lesson-submit-${second}`)).toBeNull();
    }
    holder.delayMs = 0;
    // The poll goes on until the server state catches up with the new submission.
    for (let step = 0; step < 60 && /Проверяется/.test(textIn(byTestId(app, `lesson-item-${second}`))); step += 1) {
      await app.advance(4000);
      await app.settle();
    }
    const latest = await server(app, () => app.mock.studentWork.getLiveLesson());
    const item = latest.active?.items.find((entry) => entry.number === second);
    expect(item?.submission?.status === 'DONE' || item?.submission?.status === 'FAILED').toBe(true);
    const { formatClockTime } = require('../src/domain/dates') as typeof import('../src/domain/dates'); // eslint-disable-line @typescript-eslint/no-require-imports
    const card = textIn(byTestId(app, `lesson-item-${second}`));
    expect(card).not.toContain('Проверяется');
    // The card shows the NEW submission. Its one caption is the outcome when there is one — then the
    // check's remark is under the statement — and the time the solution was sent otherwise.
    const submission = item?.submission;
    const outcome = Boolean(item?.result) || (submission?.status === 'DONE' && Boolean(submission.verdict));
    if (!outcome) expect(card).toContain(formatClockTime(submission?.submittedAt ?? '', 'ru'));
    if (submission?.status === 'DONE' && submission.comment) {
      expect(card).toContain(submission.comment);
      expect(submission.comment).not.toBe(remarkBefore);
    }
  });
});

describe('homework photos: the delete dialog names the photo (#333)', () => {
  it('«Удалить фото 2 из 3» opens a dialog that says which photo goes', async () => {
    const app = await visit({ as: 'ilya@example.com', url: '/student/homeworks/hw_ilya_open' });
    const removes = app.screen
      .queryAllByRole('button')
      .filter((node) => /^Удалить фото/.test(String(node.props.accessibilityLabel ?? '')));
    expect(removes.length).toBe(3);
    await app.rntl.act(async () => {
      app.rntl.fireEvent.press(removes[1] as never);
    });
    await app.settle();
    const dialog = textIn(byTestId(app, 'homework-photo-delete'));
    expect(dialog).toContain('Фото решения будет удалено');
    expect(dialog).toContain('Фото 2 из 3');
  });
});
