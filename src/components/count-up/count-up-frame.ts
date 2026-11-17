/**
 * One frame of the count-up (site: `useCountUp`, 600 ms, easeOutCubic): the number shown when `progress`
 * (0..1) of the animation has passed. The site counts from zero on every change of the target.
 */
export function countUpFrame(target: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  const eased = 1 - Math.pow(1 - p, 3);
  return Math.round(target * eased);
}
