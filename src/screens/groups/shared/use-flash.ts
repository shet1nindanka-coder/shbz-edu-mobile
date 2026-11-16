import { useCallback, useEffect, useRef, useState } from 'react';

export type FlashState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * The transient status text next to an autosaving control: «Сохраняем…» while the request runs, then
 * «Сохранено» / «Ошибка» for `holdMs` (the site: 2000 ms in the members manager, 2200 ms in the member
 * editor — 06 §5 "Client timers").
 */
export function useFlash(holdMs: number): { state: FlashState; start: () => void; finish: (ok: boolean) => void } {
  const [state, setState] = useState<FlashState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const start = useCallback(() => {
    stop();
    setState('saving');
  }, []);
  const finish = useCallback(
    (ok: boolean) => {
      stop();
      setState(ok ? 'saved' : 'error');
      timer.current = setTimeout(() => setState('idle'), holdMs);
    },
    [holdMs],
  );
  return { state, start, finish };
}
