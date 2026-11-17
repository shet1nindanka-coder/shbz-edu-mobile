import { useCallback } from 'react';

import { format, useI18n } from '@/i18n';

import { formatWait } from './use-countdown';

/**
 * Texts of a wait in the interface language:
 *
 *   const wait = useWaitText();
 *   wait.time(45)      «45 секунд» / «2 минуты»
 *   wait.retryIn(45)   «Повторить можно через 45 секунд.»
 *
 * Minutes use the site's own forms (`dict.login.minuteForms`), seconds the mobile overlay — the site never
 * counts seconds.
 */
export function useWaitText(): { time: (seconds: number) => string; retryIn: (seconds: number) => string } {
  const { locale, dict, m } = useI18n();
  const secondForms = m.common.errors.secondForms;
  const minuteForms = dict.login.minuteForms;
  const template = m.common.errors.retryIn;
  const time = useCallback((seconds: number) => formatWait(seconds, locale, { secondForms, minuteForms }), [locale, secondForms, minuteForms]);
  const retryIn = useCallback((seconds: number) => format(template, { time: time(seconds) }), [template, time]);
  return { time, retryIn };
}
