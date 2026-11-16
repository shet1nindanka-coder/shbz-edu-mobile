import { useEffect, useState } from 'react';

/**
 * A clock that re-renders its owner every `intervalMs`: "overdue" badges and the 15-minute "plan was
 * lost" rule move on without a refetch (docs/spec/04-teacher-students.md §5.2).
 */
export function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
