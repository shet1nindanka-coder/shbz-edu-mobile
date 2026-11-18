// Pure helpers for what screen readers hear. No React, no React Native: unit-tested in tests/.

/** One visible piece of a control's spoken name; empty pieces are skipped. */
export type AccessibilityPart = string | null | undefined | false;

/**
 * The spoken name of a control built from what the eye reads on it: «№ 118, Красный, Уже в ДЗ с дедлайном».
 *
 * WHY: a pressable element is ONE element for VoiceOver (and, with a label, for TalkBack): its children are
 * not read and cannot be focused. Everything a sighted user reads on a pressable card — status, badges,
 * meta — therefore has to be in its label (or hint), or it is lost.
 */
export function accessibilityLabelOf(parts: readonly AccessibilityPart[], separator = ', '): string {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part !== '')
    .join(separator);
}

/**
 * The hint of an input that shows an inline error: the error first, then the input's own hint. Focusing the
 * field after a refused submit then reads «Логин, Введите логин» instead of the label alone.
 */
export function withErrorHint(error: string | null | undefined, hint: string | undefined): string | undefined {
  const text = error?.trim() ?? '';
  if (text === '') return hint;
  return hint && hint.trim() !== '' ? `${text}. ${hint}` : text;
}

/**
 * Where an announcement is made. `'ios'`: the element that shows the message is an Android live region,
 * which TalkBack speaks by itself (announcing as well would read it twice). `'native'`: nothing on the
 * element speaks on Android (no live region), so TalkBack gets an explicit announcement too. The web never
 * announces: the element carries `role="alert"` / `aria-live`.
 */
export type AnnounceOn = 'ios' | 'native';

/**
 * Whether a message that is now on screen must be announced on `platform`: only on the platforms of `on`
 * (default `'ios'`), and only when it appeared or changed — never again on a re-render that shows the same
 * text.
 */
export function shouldAnnounce(platform: string, previous: string | null, next: string | null | undefined, on: AnnounceOn = 'ios'): boolean {
  if (platform !== 'ios' && !(on === 'native' && platform === 'android')) return false;
  const text = next?.trim() ?? '';
  return text !== '' && text !== previous;
}

/**
 * One step of an announcement hook: what to speak now (`speak`, or null) and the text to remember as
 * spoken (`last`).
 *
 * - The message is gone: forget it, so the same message appearing again later is news again.
 * - The screen is not the focused one (a tab in the background, a screen under a pushed one): speak
 *   nothing and keep `last` as it was — the message is held back, not dropped, and is spoken when the user
 *   comes back to the screen while it is still shown. A live region also speaks only what is on screen.
 * - Otherwise speak it when it is new for this platform (`shouldAnnounce`).
 */
export function announcementStep(
  previous: string | null,
  message: string | null | undefined,
  context: { platform: string; focused: boolean; on?: AnnounceOn },
): { last: string | null; speak: string | null } {
  const text = message?.trim() ?? '';
  if (text === '') return { last: null, speak: null };
  if (!context.focused) return { last: previous, speak: null };
  if (!shouldAnnounce(context.platform, previous, text, context.on)) return { last: previous, speak: null };
  return { last: text, speak: text };
}
