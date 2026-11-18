import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { announcementStep, type AnnounceOn } from './a11y';
import { useNavigationFocused } from './internal/close-on-blur';
import { isOverlayCovered, useOverlayCovered } from './overlay-cover';

/**
 * Whether what this component shows may be spoken now: its screen is the focused one AND no overlay cover
 * (the biometric lock, the privacy shield) is up. An announcement is not tied to a view — TalkBack gets an
 * event with no source and VoiceOver a global notification — so hiding the covered tree from accessibility
 * does not silence it; a message of a covered app is held like one of an unfocused screen and spoken after
 * the cover drops. `useOverlayCovered` is a global store, so this also holds inside sheets and modal windows.
 */
function useSpeakable(): boolean {
  const focused = useNavigationFocused();
  const covered = useOverlayCovered();
  return focused && !covered;
}

/** One announcement on iOS (queued behind what VoiceOver is saying) and Android; the web has live regions. */
function speakNative(text: string): void {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  else AccessibilityInfo.announceForAccessibility(text);
}

function useAnnouncement(message: string | null | undefined, enabled: boolean, on: AnnounceOn): void {
  const last = useRef<string | null>(null);
  const text = enabled ? (message?.trim() ?? '') : '';
  // Only the screen the user is on speaks: inactive tabs and screens under a pushed one stay mounted and
  // keep refetching, and their errors are neither visible nor reachable. Outside a navigator: always true.
  // Nothing is spoken under the lock cover either (`useSpeakable`).
  const focused = useSpeakable();
  useEffect(() => {
    const step = announcementStep(last.current, text, { platform: Platform.OS, focused, on });
    last.current = step.last;
    if (step.speak === null) return;
    speakNative(step.speak);
  }, [text, focused, on]);
}

/**
 * Speaks `message` on iOS when it appears or changes (VoiceOver). Nothing on Android and web, where the
 * element that shows the message is a live region / `role="alert"` and is spoken by the platform: calling
 * both would make TalkBack read it twice. For a text WITHOUT a live region use `useStatusAnnouncement`.
 *
 * WHY: `accessibilityLiveRegion` is Android-only and `accessibilityRole="alert"` adds no trait on iOS, so an
 * error, a toast or a banner that appears without moving the focus is silent for a VoiceOver user.
 *
 *   useAnnounce(error);                       // an inline error, a notice, a toast
 *   useAnnounce(text, tone === 'error');      // only while it matters
 *
 * The message is queued behind what VoiceOver is saying (the button just pressed), not cut into it. A
 * message of a screen that is not the focused one (a background tab, a screen under a pushed one) or of an
 * app under the lock cover is held back and spoken when the user returns to that screen, if it is still shown (`announcementStep`).
 */
export function useAnnounce(message: string | null | undefined, enabled = true): void {
  useAnnouncement(message, enabled, 'ios');
}

/**
 * Speaks a transient inline status or error text exactly once on BOTH platforms when it appears or changes:
 * VoiceOver (queued) and TalkBack (an explicit announcement event). The web reads the element's
 * `role="alert"` itself. Same focus rule as `useAnnounce`.
 *
 * WHY: on Android `accessibilityRole="alert"` is only a role description (nothing is spoken), and a live
 * region on a conditionally mounted `Text` may stay silent — TalkBack reports a content change of the
 * region's parent, not of the region that has just been attached. An explicit announcement does not depend
 * on how the element is mounted.
 *
 *   useStatusAnnouncement(error);
 *   {error ? <Text accessibilityRole="alert" …>{error}</Text> : null}   // NO accessibilityLiveRegion
 *
 * Do not use it for a `Notice` (its live region / `announcement` already speak), for a text that has an
 * `accessibilityLiveRegion` (TalkBack would read it twice), for a field error (`FieldShell` speaks it) or
 * next to a direct `AccessibilityInfo.announceForAccessibility` call. Never pass text that changes every
 * second (a countdown): every change is spoken — keep the countdown in a `RetryWaitLine` beside it.
 */
export function useStatusAnnouncement(message: string | null | undefined, enabled = true): void {
  useAnnouncement(message, enabled, 'native');
}

/**
 * The imperative form of `useStatusAnnouncement` for an EVENT of a screen (a check finished, a result came
 * in), spoken on iOS and Android by calling the returned function — with the same focus rule: while the
 * screen is not the focused one (`useNavigationFocused()`), an overlay cover (the biometric lock) is up, or
 * `active` is false (e.g. the app is in the background), the message is held back, and only the LATEST held message is spoken when the screen is in
 * front again. A screen that keeps polling from a background tab therefore never speaks over another tab.
 *
 *   const announce = useEventAnnouncement(live);   // call it BEFORE the effects that announce
 *   useEffect(() => { if (finished) announce(text); }, [finished, announce, text]);
 */
export function useEventAnnouncement(active = true): (message: string) => void {
  const focused = useSpeakable() && active;
  const focusedRef = useRef(focused);
  const held = useRef<string | null>(null);
  useEffect(() => {
    focusedRef.current = focused;
    if (!focused || held.current === null) return;
    const text = held.current;
    held.current = null;
    speakNative(text);
  }, [focused]);
  return useCallback((message: string) => {
    const text = message.trim();
    if (text === '') return;
    if (focusedRef.current) speakNative(text);
    else held.current = text;
  }, []);
}

/**
 * The imperative form, for a moment rather than a message on screen («Скопировано», «Фото добавлено»):
 * iOS only, for the same reason as `useAnnounce`. Use `AccessibilityInfo.announceForAccessibility` directly
 * only where nothing else speaks the event on Android either (no live region shows it).
 */
export function announceOnIOS(message: string): void {
  if (Platform.OS !== 'ios' || message.trim() === '') return;
  // A moment of a screen under the lock cover is not worth holding: it is simply not said.
  if (isOverlayCovered()) return;
  AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
}
