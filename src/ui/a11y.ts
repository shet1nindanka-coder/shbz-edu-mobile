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
 * Whether a message that is now on screen must be announced: only on iOS (Android speaks live regions by
 * itself; announcing as well would make TalkBack read it twice; the web has `role="alert"`), and only when
 * it appeared or changed — never again on a re-render that shows the same text.
 */
export function shouldAnnounce(platform: string, previous: string | null, next: string | null | undefined): boolean {
  if (platform !== 'ios') return false;
  const text = next?.trim() ?? '';
  return text !== '' && text !== previous;
}
