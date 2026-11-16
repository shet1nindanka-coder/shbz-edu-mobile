import { useEffect, useState } from 'react';

/**
 * A clock that re-renders its screen every `intervalMs` (the boards tick every 30 s so a lost generation
 * turns "stale", idle chips grow and "N min ago" moves without a refetch — 05 §5.3).
 */
export function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
