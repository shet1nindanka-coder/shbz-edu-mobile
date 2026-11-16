import { useMemo } from 'react';

import { useI18n } from '@/i18n';
import type { DateTimeFieldLabels } from '@/ui';

/** Texts of the date-time picker sheet (the site's keys where the site has them). */
export function useDateTimeLabels(): DateTimeFieldLabels {
  const { dict, m } = useI18n();
  return useMemo(() => {
    const t = dict.topics.widgets.datetime;
    return { clear: t.clear, today: t.today, done: t.done, close: m.common.actions.close, date: m.common.dateTime.pickDate, time: t.time };
  }, [dict, m]);
}
