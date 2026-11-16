// Ported from the site (lib/check-queue-state.ts). [MOBILE] Only the pure queue-order rule; the site's
// process-wide set of tracked check ids is server state and is not ported.

export type CheckTaskKind = "HOMEWORK" | "LESSON_ITEM";

/**
 * Индекс следующей задачи: сдачи классной работы раньше ДЗ — ученик на уроке
 * ждёт вердикт сейчас, ДЗ подождёт. Внутри вида — порядок постановки.
 */
export function pickNextCheckIndex(queue: readonly { kind: CheckTaskKind }[]): number {
  if (queue.length === 0) {
    return -1;
  }

  const lessonIndex = queue.findIndex((task) => task.kind === "LESSON_ITEM");

  return lessonIndex === -1 ? 0 : lessonIndex;
}
