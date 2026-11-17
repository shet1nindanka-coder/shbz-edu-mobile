import { useI18n } from '@/i18n';
import { Text, useAnnounce } from '@/ui';

import type { FlashState } from '../shared/use-flash';

/** «Сохраняем…» → «Сохранено» / «Ошибка» next to an autosaving control; announced to screen readers. */
export function FlashText({ state, testID }: { state: FlashState; testID?: string }) {
  const { dict } = useI18n();
  const common = dict.planner.common;
  const text = state === 'idle' ? null : state === 'saving' ? common.saving : state === 'saved' ? common.saved : common.error;
  // The outcome of an autosave appears next to the field, without moving focus: VoiceOver says it too
  // (Android reads the live region). «Сохраняем…» is a moment, not news.
  useAnnounce(state === 'saved' || state === 'error' ? text : null);
  if (text === null) return null;
  return (
    <Text
      variant="captionStrong"
      color={state === 'saved' ? 'greenText' : state === 'error' ? 'redText' : 'textMuted'}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      {text}
    </Text>
  );
}
