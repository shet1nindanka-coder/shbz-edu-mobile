/**
 * Simulated latency (docs/spec/90-addendum-6.md §5): deterministic, no randomness —
 * `minMs + (callCounter × 137) % (maxMs − minMs + 1)`, i.e. 200 … 600 ms with the default range.
 * `{ minMs: 0, maxMs: 0 }` (tests) means "no delay", but a method still never resolves synchronously.
 */
export function latencyFor(callCounter: number, range: { minMs: number; maxMs: number }): number {
  const min = Math.max(0, Math.floor(range.minMs));
  const max = Math.max(min, Math.floor(range.maxMs));
  if (max === 0) return 0;
  return min + ((Math.max(0, callCounter) * 137) % (max - min + 1));
}
