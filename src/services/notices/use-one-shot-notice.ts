import { useEffect, useRef } from 'react';

import { subscribeOneShotNotice, takeOneShotNotice, type NoticeChannel } from './one-shot-store';

/**
 * Calls `onNotice` with a key left for `channel` — once on mount if one is waiting, and whenever one is
 * posted while the screen is mounted. The key is consumed by the call: keep it in the screen's own state.
 */
export function useOneShotNotice<K extends string>(channel: NoticeChannel<K>, onNotice: (key: K) => void): void {
  const handler = useRef(onNotice);
  useEffect(() => {
    handler.current = onNotice;
  });
  const { name } = channel;
  useEffect(() => {
    const target: NoticeChannel<K> = { name };
    const deliver = () => {
      const key = takeOneShotNotice(target);
      if (key !== null) handler.current(key);
    };
    deliver();
    return subscribeOneShotNotice(target, deliver);
  }, [name]);
}
