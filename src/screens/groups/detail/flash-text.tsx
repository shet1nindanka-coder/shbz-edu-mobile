import { useI18n } from '@/i18n';
import { Text } from '@/ui';

import type { FlashState } from '../shared/use-flash';

/** «Сохраняем…» → «Сохранено» / «Ошибка» next to an autosaving control; announced to screen readers. */
export function FlashText({ state, testID }: { state: FlashState; testID?: string }) {
  const { dict } = useI18n();
  const common = dict.planner.common;
  if (state === 'idle') return null;
  const text = state === 'saving' ? common.saving : state === 'saved' ? common.saved : common.error;
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
