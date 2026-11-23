import { createContext, use, type ReactNode } from 'react';

/**
 * How much room the floating dock takes at the bottom of a screen: its height, its distance from the
 * bottom edge (the home indicator included) and the gap above it. 0 where there is no dock (signed out).
 * `Screen` pads its content and its footer by this, so the last block can be scrolled clear of the dock.
 */
const DockInsetContext = createContext(0);

export type DockInsetProviderProps = { inset: number; children: ReactNode };

/** Set by the host of the dock (the root layout). */
export function DockInsetProvider({ inset, children }: DockInsetProviderProps) {
  return <DockInsetContext value={inset}>{children}</DockInsetContext>;
}

/** Bottom room taken by the dock, in points; 0 without a dock. */
export function useDockInset(): number {
  return use(DockInsetContext);
}
