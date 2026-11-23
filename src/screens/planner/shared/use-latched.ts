import { useState } from 'react';

/**
 * Remembers the last non-null value. A sheet is told to close by setting its subject to `null`; its
 * content must stay as it was while the exit animation plays.
 */
export function useLatched<T>(value: T | null): T | null {
  const [latched, setLatched] = useState<T | null>(value);
  if (value !== null && value !== latched) setLatched(value);
  return value ?? latched;
}
