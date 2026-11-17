import { useEffect, useRef } from 'react';

import { planProgressMoved, planSignature, type PlanParticipantLike } from './plan-state';

/**
 * Tells the other screens that show a board's plan progress when that progress has moved. The board polls
 * the plan status and re-reads itself; the lessons list («подбор идёт 0 / 4»), the drafts list («ошибок: N»),
 * the student card and the group pages are not polled and the plan jobs publish no realtime event (neither
 * does the site's queue). On the site those pages are server renders, fresh on every visit; here their
 * cached copies are marked stale the moment the board sees a plan arrive or fail.
 *
 * `notify` runs when the plan signature of the cached board differs from the one seen before; the first
 * value (the board just loaded) only initialises the comparison.
 */
export function usePlanProgressObservers(participants: readonly PlanParticipantLike[] | undefined, notify: () => void): void {
  const signature = participants ? planSignature(participants) : null;
  const last = useRef<string | null>(null);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);
  useEffect(() => {
    if (signature === null) return;
    const previous = last.current;
    last.current = signature;
    if (planProgressMoved(previous, signature)) notifyRef.current();
  }, [signature]);
}

