// Pure helpers of the reorder sheet (docs/spec/07-developer-content.md §1.1, §3.5): the app sends the
// full id list, exactly like the site's drag & drop does.

/** Moves `id` one position up or down; returns the same array when it cannot move. */
export function moveInOrder(order: readonly string[], id: string, direction: 'up' | 'down'): readonly string[] {
  const index = order.indexOf(id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  const moved = next[index];
  const swapped = next[target];
  if (moved === undefined || swapped === undefined) return order;
  next[index] = swapped;
  next[target] = moved;
  return next;
}

export function isSameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * Applies a saved id order to the cached list (optimistic update and rollback). Items missing from
 * `order` keep their relative position at the end, so a list that changed meanwhile never loses a topic.
 */
export function applyOrder<T extends { id: string }>(items: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = rank.get(a.item.id);
      const right = rank.get(b.item.id);
      if (left !== undefined && right !== undefined) return left - right;
      if (left !== undefined) return -1;
      if (right !== undefined) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/**
 * The reorder draft follows the server list: ids that disappeared are dropped, new ones are appended in
 * server order, the user's arrangement of the rest is kept.
 */
export function reconcileOrder(draft: readonly string[], server: readonly string[]): string[] {
  const known = new Set(server);
  const kept = draft.filter((id) => known.has(id));
  const seen = new Set(kept);
  return [...kept, ...server.filter((id) => !seen.has(id))];
}
