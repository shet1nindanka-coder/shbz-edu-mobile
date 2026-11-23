// Student homework and live-lesson behaviour on the native tree, driven through the UI against the in-process
// mock server: the note of a homework card after a refused save and with overlapping saves, the "I am in
// class" call after a failure, the photo preview of a lesson that must never lock the submit buttons, and
// photos picked beyond the free slots.
//
// A homework and a live lesson show ONE card — of the number selected in the strip of tiles — so a test
// first brings its number on screen (`showHomeworkNumber`, a `lesson-tile-<number>`).
import { describe, expect, it, jest } from '@jest/globals';

import { byTestId, fill, root, tap, visibleText, visit } from './support/drive';
import { device } from './support/fakes';
import type { AppHandle } from './support/launch';
import { showHomeworkNumber } from './support/student';
import { all, flattenStyle, isHidden, pressables, textOf, type HostNode } from './support/tree';

// jest-expo answers the image manipulator's native calls with `undefined`, so every picked photo would fail
// to re-encode. A pass-through stand-in: the "re-encoded" JPEG is the picked file itself.
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

const ILYA = 'ilya@example.com';
const photo = (index: number) => ({
  uri: `file:///data/user/0/cache/ImagePicker/solution-${index}.jpg`,
  name: `solution-${index}.jpg`,
  mimeType: 'image/jpeg',
  size: 240_000,
});

/** Runs a mock call while the fake clock moves (the mock sleeps its latency on that clock). */
async function call<T>(app: AppHandle, request: () => Promise<T>): Promise<T> {
  const pending = request();
  await app.advance(1500);
  return pending;
}

async function serverNote(app: AppHandle, assignmentId: string, number: string): Promise<string | undefined> {
  const detail = await call(app, () => app.mock.studentWork.getHomework(assignmentId));
  return detail.assignment.numbers.find((candidate) => candidate.number === number)?.note;
}

async function blur(app: AppHandle, testID: string): Promise<void> {
  const node = byTestId(app, testID);
  expect(node).not.toBeNull();
  await app.rntl.fireEvent(node as never, 'blur');
}

/** The dashed "add" tile of a homework's photo row. */
const ADD_PHOTO = '#homework-photos-grid-add';

function isDisabled(node: HostNode | null): boolean {
  const state = node?.props.accessibilityState as { disabled?: boolean } | undefined;
  return Boolean(state?.disabled ?? node?.props.disabled);
}

/** Numbers of the live lesson that can be submitted now and have a tile in the strip, in lesson order. */
async function submittableNumbers(app: AppHandle): Promise<string[]> {
  const lesson = await call(app, () => app.mock.studentWork.getLiveLesson());
  return [...(lesson.active?.items ?? [])]
    .sort((left, right) => left.order - right.order)
    .filter((item) => item.canSubmit && byTestId(app, `lesson-tile-${item.number}`) !== null)
    .map((item) => item.number);
}

/** A bare press (also of a control an open sheet would cover on a device), then the app settles. */
async function pressNode(app: AppHandle, testID: string): Promise<void> {
  const node = byTestId(app, testID);
  expect(node).not.toBeNull();
  await app.rntl.fireEvent.press(node as never);
  await app.settle();
}

describe('homework card note', () => {
  it('a refused save is not taken for saved: blur sends it again, «Повторить» is offered', async () => {
    const app = await visit({
      as: ILYA,
      url: '/student/homeworks/hw_ilya_today',
      // A refusal (403). A 503 is transient and waited out by the queue instead (see the test below).
      arrange: ({ mock }) => mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'unauthorized', times: 1 }),
    });
    await fill(app, '#number-note-218', 'важная заметка');
    await app.advance(700);
    await app.settle();
    expect(byTestId(app, 'number-note-error-218')).not.toBeNull();
    expect(byTestId(app, 'number-note-retry-218')).not.toBeNull();
    expect(await serverNote(app, 'hw_ilya_today', '218')).toBe('');

    // Leaving the field sends the unsaved draft again (the forced failure was for one call only).
    await blur(app, 'number-note-218');
    await app.settle();
    expect(await serverNote(app, 'hw_ilya_today', '218')).toBe('важная заметка');
    expect(byTestId(app, 'number-note-error-218')).toBeNull();
  });

  it('a draft typed offline and refused when the queue sends it is never shown as saved, and blur sends it again', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_open' });
    const { setSimulatedOffline } = require('@/services/network') as typeof import('@/services/network'); // eslint-disable-line @typescript-eslint/no-require-imports
    await showHomeworkNumber(app, '305');
    await app.rntl.act(async () => setSimulatedOffline(true));
    await fill(app, '#number-note-305', 'заметка без сети');
    await app.advance(700);
    await app.settle();
    expect(visibleText(app)).toContain('Сохраним при подключении');
    app.mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'unauthorized', times: 1 });
    await app.rntl.act(async () => setSimulatedOffline(false));
    await app.settle();
    expect(app.mock.controls.get().forceNextError).toBeNull(); // the queue's request was refused
    expect(await serverNote(app, 'hw_ilya_open', '305')).toBe('');
    expect(byTestId(app, 'number-note-status-305')).toBeNull(); // no «Сохранено» for a refused draft
    expect((byTestId(app, 'number-note-305')?.props as { value?: string }).value).toBe('заметка без сети');

    await blur(app, 'number-note-305');
    await app.settle();
    expect(await serverNote(app, 'hw_ilya_open', '305')).toBe('заметка без сети');
  });

  it('a 503 on save is not a refusal and not «Сохранено»: the card says it will retry, and the queue re-sends it by itself', async () => {
    const app = await visit({
      as: ILYA,
      url: '/student/homeworks/hw_ilya_today',
      arrange: ({ mock }) => mock.controls.set('forceNextError', { method: 'studentStudy.saveNumberNote', error: 'serviceUnavailable', times: 1 }),
    });
    await fill(app, '#number-note-218', 'после 503');
    await app.advance(700);
    await app.settle();
    expect(byTestId(app, 'number-note-error-218')).toBeNull();
    expect(textOf(byTestId(app, 'number-note-status-218') as HostNode)).toBe('Не сохранено, повторим');
    expect(await serverNote(app, 'hw_ilya_today', '218')).toBe('');

    await app.advance(6_000); // the first backoff step (5 s), no blur, no reconnect
    await app.settle();
    expect(await serverNote(app, 'hw_ilya_today', '218')).toBe('после 503');
    expect(visibleText(app)).not.toContain('Не сохранено, повторим');
  });

  it.each([0, 1, 2, 3])('overlapping saves end with the newest text on the server (%i saves made before)', async (warmup) => {
    const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_open' });
    // Moves the mock's call counter, so the two saves below get different simulated latencies.
    for (let index = 0; index < warmup; index += 1) await call(app, () => app.mock.studentStudy.getHomeworkDeadlines());
    // 301 is solved, so it is not in the strip: its card is reached through «Все номера».
    await showHomeworkNumber(app, '301');
    await fill(app, '#number-note-301', 'one');
    await app.advance(700); // the debounce sends «one»
    await fill(app, '#number-note-301', 'one two');
    await blur(app, 'number-note-301'); // sent while «one» is still on its way
    await app.settle();
    expect(await serverNote(app, 'hw_ilya_open', '301')).toBe('one two');
    expect((byTestId(app, 'number-note-301')?.props as { value?: string }).value).toBe('one two');
  });
});

describe('live lesson', () => {
  it('repeats "I am in class" on the next entry into the tab after a failed call', async () => {
    const app = await visit({
      as: 'kirill@example.com',
      url: '/student/lesson',
      arrange: ({ mock }) => mock.controls.set('forceNextError', { method: 'studentWork.joinLesson', error: 'network', times: 1 }),
    });
    expect(byTestId(app, 'lesson-live')).not.toBeNull();
    const before = await call(app, () => app.mock.studentWork.getLiveLesson());
    expect(before.active?.joinedAt).toBeNull();

    await app.open('/student/homeworks');
    await app.open('/student/lesson');
    const after = await call(app, () => app.mock.studentWork.getLiveLesson());
    expect(after.active?.joinedAt).not.toBeNull();
  });

  it('a preview that is still marked open does not lock the other submit buttons', async () => {
    const app = await visit({ as: 'polina@example.com', url: '/student/lesson' });
    const [first, other] = await submittableNumbers(app);
    expect(other).toBeDefined();
    device().picker.nextAssets = [photo(1)];
    await pressNode(app, `lesson-tile-${first}`);
    await pressNode(app, `lesson-submit-${first}`);
    await tap(app, '#photo-source-library');
    await app.settle();
    expect(byTestId(app, 'lesson-preview')).not.toBeNull();

    // If the sheet was refused by the OS, the strip and the card are what the student sees: they must
    // still work — another number can be chosen and its button is not locked …
    await pressNode(app, `lesson-tile-${other}`);
    expect(byTestId(app, `lesson-submit-${first}`)).toBeNull(); // one card at a time
    expect(isDisabled(byTestId(app, `lesson-submit-${other}`))).toBe(false);
    // … and pressing it starts over with a fresh source sheet, not the stuck preview.
    await pressNode(app, `lesson-submit-${other}`);
    expect(byTestId(app, 'photo-source-library')).not.toBeNull();
    expect(byTestId(app, 'lesson-preview')).toBeNull();
  });
});

describe('homework photos', () => {
  it('photos picked beyond the free slots are reported, not dropped silently', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_open' });
    const before = await call(app, () => app.mock.studentWork.getHomework('hw_ilya_open'));
    const free = before.limits.maxPhotosPerAssignment - before.assignment.photos.length;
    expect(free).toBeGreaterThan(0);
    // The fake picker, like the web file input, ignores `selectionLimit`.
    device().picker.nextAssets = Array.from({ length: free + 2 }, (_, index) => photo(index));
    // The tile is a plus without a text: its name is what a screen reader says.
    expect(byTestId(app, ADD_PHOTO.slice(1))?.props.accessibilityLabel).toBe('Добавить фото');
    await tap(app, ADD_PHOTO);
    await tap(app, '#photo-source-library');
    await app.settle();
    expect(byTestId(app, 'homework-photos-pick-problem')).not.toBeNull();
    expect(visibleText(app)).toContain(`Выбрано ${free + 2} фото, добавить удалось только ${free}`);
    const after = await call(app, () => app.mock.studentWork.getHomework('hw_ilya_open'));
    expect(after.assignment.photos.length).toBe(before.limits.maxPhotosPerAssignment);
  });
});

// 90-addendum-1 A.3 rule 3: a control locked for `retryAfterSeconds` says when it unlocks for as long as it is
// locked — the line must not live inside the dismissible error notice (finding #102).
describe('cool-down stays explained after the error notice is dismissed', () => {
  const WAIT_LINE = /Повторить можно через/;
  const waitLines = (app: AppHandle) => (visibleText(app).match(/Повторить можно через/g) ?? []).length;

  it('photo upload: the add tile stays explained', async () => {
    const app = await visit({
      as: ILYA,
      url: '/student/homeworks/hw_ilya_open',
      arrange: ({ mock }) =>
        mock.controls.set('forceNextError', { method: 'studentWork.uploadHomeworkPhotos', error: 'rateLimited', times: 1 }),
    });
    device().picker.nextAssets = [photo(1)];
    await tap(app, ADD_PHOTO);
    await tap(app, '#photo-source-library');
    await app.settle();
    expect(byTestId(app, 'homework-photos-error')).not.toBeNull();
    expect(byTestId(app, 'homework-photos-wait')).not.toBeNull();
    expect(waitLines(app)).toBe(1);

    await tap(app, 'button:Закрыть');
    await app.settle();
    expect(byTestId(app, 'homework-photos-error')).toBeNull();
    expect(visibleText(app)).toMatch(WAIT_LINE);
    expect(byTestId(app, 'homework-photos-wait')).not.toBeNull();
  });

  it('homework check: the start button stays explained (daily budget)', async () => {
    const app = await visit({ as: ILYA, url: '/student/homeworks/hw_ilya_soon' });
    device().picker.nextAssets = [photo(1)];
    await tap(app, ADD_PHOTO);
    await tap(app, '#photo-source-library');
    await app.advance(3000);
    await app.settle();
    await app.rntl.act(async () => app.mock.controls.exhaust('api:homework-checks:global', 'global'));
    await tap(app, '#homework-check-start');
    await app.advance(1500);
    await app.settle();
    expect(byTestId(app, 'homework-check-start-error')).not.toBeNull();
    expect(byTestId(app, 'homework-check-wait')).not.toBeNull();
    expect(waitLines(app)).toBe(1);

    const dismiss = app.screen.queryAllByRole('button').find((node) => node.props.accessibilityLabel === 'Закрыть');
    expect(dismiss).toBeDefined();
    await app.rntl.fireEvent.press(dismiss as never);
    await app.settle();
    expect(byTestId(app, 'homework-check-start-error')).toBeNull();
    expect(isDisabled(byTestId(app, 'homework-check-start'))).toBe(true);
    expect(byTestId(app, 'homework-check-wait')).not.toBeNull();
  });

  it('live lesson: one line in the header explains every locked card, also after the dismiss', async () => {
    const app = await visit({ as: 'polina@example.com', url: '/student/lesson' });
    const numbers = await submittableNumbers(app);
    expect(numbers.length).toBeGreaterThan(1);
    await app.rntl.act(async () => app.mock.controls.exhaust('api:lesson-checks:global', 'global'));
    const submits = () =>
      app.screen.queryAllByRole('button').filter((node) => /^lesson-submit-(?!error|wait)/.test(String(node.props.testID)));
    // The lesson shows one card at a time: every number that can be submitted is looked at in turn.
    const everyCardLocked = async (): Promise<boolean> => {
      let locked = true;
      for (const number of [...numbers].reverse()) {
        await pressNode(app, `lesson-tile-${number}`);
        locked = locked && isDisabled(byTestId(app, `lesson-submit-${number}`)) && byTestId(app, 'lesson-submit-wait') !== null;
      }
      return locked;
    };
    expect(byTestId(app, 'lesson-submit-wait')).toBeNull();
    device().picker.nextAssets = [photo(1)];
    await pressNode(app, `lesson-tile-${numbers[0]}`);
    await app.rntl.fireEvent.press(submits()[0]);
    await app.settle();
    await tap(app, '#photo-source-library');
    await app.settle();
    await tap(app, '#lesson-preview-send');
    await app.advance(3000);
    await app.settle();

    expect(app.screen.queryAllByTestId(/^lesson-submit-error-/).length).toBe(1);
    expect(byTestId(app, 'lesson-submit-wait')).not.toBeNull();
    expect(waitLines(app)).toBe(1);
    expect(submits().every((node) => isDisabled(node))).toBe(true);

    const errorNotice = app.screen.queryAllByTestId(/^lesson-submit-error-/)[0];
    const dismiss = app.rntl.within(errorNotice).queryAllByRole('button')[0];
    await app.rntl.fireEvent.press(dismiss);
    await app.settle();
    expect(app.screen.queryAllByTestId(/^lesson-submit-error-/).length).toBe(0);
    expect(submits().every((node) => isDisabled(node))).toBe(true);
    expect(byTestId(app, 'lesson-submit-wait')).not.toBeNull();
    // The numbers never tried are locked and explained by the same single line.
    expect(await everyCardLocked()).toBe(true);
    expect(waitLines(app)).toBe(1);
  });
});

// Finding #119: on web a Text keeps `min-width: auto` (its longest word), so a flex-item title needs
// `minWidth: 0` to shrink and wrap a long unbroken word inside the card instead of leaving it.
describe('deadline card title wraps inside the card', () => {
  // «Обзор» no longer has the hero deadline card; the card itself lives on in the day sheet of the calendar.
  it('the title Text of a deadline card (the day sheet of the calendar) can shrink below its longest word', async () => {
    const app = await visit({ as: ILYA, url: '/student/deadlines' });
    const day = pressables(root(app)).find((node) => /^calendar-day-/.test(String(node.props.testID)));
    expect(day).toBeDefined();
    await tap(app, `#${String(day?.props.testID)}`);
    const card = all(root(app), (node) => /^day-sheet-card-/.test(String(node.props.testID)) && !isHidden(node))[0];
    expect(card).toBeDefined();
    // The first text of the card is its title (head → titleWrap → label).
    const title = all(card, (node) => node.type === 'Text')[0];
    expect(textOf(title).length).toBeGreaterThan(0);
    const style = flattenStyle(title.props.style);
    expect(style.flexShrink).toBe(1);
    expect(style.minWidth).toBe(0);
  });

  // What «Обзор» shows instead of the hero card: the lesson card and the homework rows. Their titles are
  // one line that is cut, so it is the column of texts that must be able to shrink inside the card.
  it.each(['home-lesson-card', 'home-upcoming-card-hw_ilya_overdue'])('the texts of #%s on «Обзор» can shrink inside the card', async (testID) => {
    const app = await visit({ as: ILYA, url: '/student' });
    const card = byTestId(app, testID);
    expect(card).not.toBeNull();
    const title = all(card as HostNode, (node) => node.type === 'Text')[0];
    expect(textOf(title).length).toBeGreaterThan(0);
    expect(title.props.numberOfLines).toBe(1);
    const column = flattenStyle(title.parent?.props.style);
    expect(column.flex).toBe(1);
    expect(column.minWidth).toBe(0);
  });
});
