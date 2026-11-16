import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTheme } from '@/theme';

/**
 * Copy to the clipboard with the site's feedback timing (`useCopy`): `copied` holds the id of what was
 * just copied for 1300 ms, then clears. `copy` resolves to false when the clipboard refused.
 */
export function useCopyFeedback(): { copied: string | null; copy: (id: string, text: string) => Promise<boolean> } {
  const theme = useTheme();
  const visibleFor = theme.motion.duration.copyPillVisible;
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (id: string, text: string) => {
      try {
        if (!(await Clipboard.setStringAsync(text))) return false;
      } catch {
        return false;
      }
      setCopied(id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), visibleFor);
      return true;
    },
    [visibleFor],
  );

  return { copied, copy };
}
