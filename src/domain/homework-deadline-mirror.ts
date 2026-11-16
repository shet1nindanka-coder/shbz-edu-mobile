// Ported from the site (lib/homework-deadline-mirror.ts). [MOBILE] Only the pure part: the transaction
// wrapper `recomputeMirroredDeadlines` belongs to whoever owns the data (the mock store).
/**
 * Зеркало дедлайнов ДЗ в `StudentTopicNumberStatus.deadlineAt`.
 *
 * Дедлайн живёт в двух местах: на самом `HomeworkAssignment` и продублирован на
 * паре (ученик, номер) — оттуда его читают календарь дедлайнов ученика, метки
 * просрочки и PDF-отчёт. Пара может быть только одна, а один и тот же номер
 * может входить в несколько выданных ДЗ (например, нерешённый номер выдали
 * повторно). Поэтому «правильное» значение зеркала — не «дедлайн последнего
 * записавшего», а **ближайший дедлайн среди всех ДЗ, где этот номер есть**.
 *
 * До этого выдача просто перезаписывала поле, а отмена очищала его по совпадению
 * значения (`deadlineAt: assignment.deadlineAt`) — отсюда ARCH-011: отмена одного
 * ДЗ снимала дедлайн у другого, а перезапись теряла более ранний срок.
 */

export type AssignmentDeadlineFacts = {
  deadlineAt: Date | null;
  numbers: { homeworkNumberId: string }[];
};

/**
 * Каким должен стать `deadlineAt` у каждого из `numberIds`, если у ученика есть
 * ровно эти ДЗ. `null` — дедлайна быть не должно (номера нет ни в одном ДЗ или
 * все они без срока).
 */
export function computeMirroredDeadlines(
  numberIds: string[],
  assignments: AssignmentDeadlineFacts[]
): Map<string, Date | null> {
  const result = new Map<string, Date | null>();

  for (const numberId of numberIds) {
    result.set(numberId, null);
  }

  for (const assignment of assignments) {
    if (!assignment.deadlineAt) {
      continue;
    }

    for (const entry of assignment.numbers) {
      if (!result.has(entry.homeworkNumberId)) {
        continue;
      }

      const current = result.get(entry.homeworkNumberId) ?? null;

      if (current === null || assignment.deadlineAt.getTime() < current.getTime()) {
        result.set(entry.homeworkNumberId, assignment.deadlineAt);
      }
    }
  }

  return result;
}

/** Группирует номера по одинаковому дедлайну — чтобы обновить их пачками, а не по одному. */
export function groupNumbersByDeadline(mirrored: Map<string, Date | null>) {
  const groups = new Map<string, { deadlineAt: Date | null; numberIds: string[] }>();

  for (const [numberId, deadlineAt] of mirrored) {
    const key = deadlineAt ? deadlineAt.toISOString() : "null";
    const group = groups.get(key) ?? { deadlineAt, numberIds: [] };

    group.numberIds.push(numberId);
    groups.set(key, group);
  }

  return Array.from(groups.values());
}
