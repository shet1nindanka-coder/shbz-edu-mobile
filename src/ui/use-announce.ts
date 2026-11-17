import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { shouldAnnounce } from './a11y';

/**
 * Speaks `message` on iOS when it appears or changes (VoiceOver). Nothing on Android and web, where the
 * element that shows the message is a live region / `role="alert"` and is spoken by the platform: calling
 * both would make TalkBack read it twice.
 *
 * WHY: `accessibilityLiveRegion` is Android-only and `accessibilityRole="alert"` adds no trait on iOS, so an
 * error, a toast or a banner that appears without moving the focus is silent for a VoiceOver user.
 *
 *   useAnnounce(error);                       // an inline error, a notice, a toast
 *   useAnnounce(text, tone === 'error');      // only while it matters
 *
 * The message is queued behind what VoiceOver is saying (the button just pressed), not cut into it.
 */
export function useAnnounce(message: string | null | undefined, enabled = true): void {
  const last = useRef<string | null>(null);
  const text = enabled ? (message?.trim() ?? '') : '';
  useEffect(() => {
    if (text === '') {
      // Gone: the same message appearing again later is news again.
      last.current = null;
      return;
    }
    if (!shouldAnnounce(Platform.OS, last.current, text)) return;
    last.current = text;
    announceOnIOS(text);
  }, [text]);
}

/**
 * The imperative form, for a moment rather than a message on screen («Скопировано», «Фото добавлено»):
 * iOS only, for the same reason as `useAnnounce`. Use `AccessibilityInfo.announceForAccessibility` directly
 * only where nothing else speaks the event on Android either (no live region shows it).
 */
export function announceOnIOS(message: string): void {
  if (Platform.OS !== 'ios' || message.trim() === '') return;
  AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
}
