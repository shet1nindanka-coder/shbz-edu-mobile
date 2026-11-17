import { useEffect, useState } from 'react';

/**
 * The device clock as state: re-renders its owner every `intervalMs`, so "overdue" badges, idle chips,
 * "N min ago" and the 15-minute "plan was lost" rule move on without a refetch (04 §5.2, 05 §5.3).
 */
export function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
