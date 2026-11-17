// When the app last had a "Retry" accepted for a participant. The board payload has no such field
// (the server never moves `createdAt` on a retry — 05 §7 item 5), so the `planRequestedAt` of the
// regenerate response is remembered here for as long as the app runs: it anchors the 15-minute "stale"
// timer and survives leaving and re-opening the board.
const requestedAt = new Map<string, string>();

export function notePlanRequested(participantId: string, planRequestedAt: string): void {
  requestedAt.set(participantId, planRequestedAt);
}

export function planRequestedAtOf(participantId: string): string | null {
  return requestedAt.get(participantId) ?? null;
}
