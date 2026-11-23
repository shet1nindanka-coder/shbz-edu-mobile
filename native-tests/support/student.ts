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
