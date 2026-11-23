/**
 * Steps of the student screens that several suites need.
 */
import { byTestId, tap } from './drive';
import type { AppHandle } from './launch';

/**
 * A homework shows ONE number card — of the number selected in the strip of tiles. Brings the card of
 * `number` on screen the way a student does: by its tile in the strip, or — a number that needs no more
 * work is not in the strip — through the «Все номера» sheet. A missing control is recorded as a failed step.
 */
export async function showHomeworkNumber(app: AppHandle, number: string): Promise<void> {
  if (byTestId(app, `number-card-${number}`)) return;
  if (byTestId(app, `homework-overview-tile-${number}`)) {
    await tap(app, `#homework-overview-tile-${number}`);
    return;
  }
  if (await tap(app, '#homework-overview-all')) await tap(app, `#homework-overview-sheet-${number}`);
}

/**
 * A live lesson shows ONE item card — of the number selected in the strip. Numbers that can be submitted
 * now and have a tile in the strip, in lesson order (read from the mock server; app time moves 1.5 s).
 */
export async function submittableLessonNumbers(app: AppHandle): Promise<string[]> {
  const pending = app.mock.studentWork.getLiveLesson();
  await app.advance(1500);
  const lesson = await pending;
  return [...(lesson.active?.items ?? [])]
    .sort((left, right) => left.order - right.order)
    .filter((item) => item.canSubmit && byTestId(app, `lesson-tile-${item.number}`) !== null)
    .map((item) => item.number);
}
