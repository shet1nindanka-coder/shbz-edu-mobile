/**
 * Shell view models and request / response types (owner spec 01).
 * Source: docs/spec/00-unified-contract.md §1.4.1.
 */
import type { Locale, ResolvedTheme } from "./primitives";
import type { AuthenticatedUser, InterfacePreferences, StudentStreak } from "./shared";

/** `PATCH /me`. `name`: 1..120 chars after normalisation. */
export type UpdateProfileRequest = { name: string };
export type UpdateProfileResponse = { user: AuthenticatedUser };

/** `POST /notifications/read`. `notificationId` omitted = mark all read. */
export type MarkNotificationsReadRequest = { notificationId?: string };
/** Wire body; the typed method resolves to it without `ok`. `unreadCount` = all unread after the change. */
export type MarkNotificationsReadResponse = { ok: true; unreadCount: number };

/** `GET /student/streak`. */
export type StreakResponse = { streak: StudentStreak };

/** Derived on the client from `MeResponse.user` — not a response type. */
export type ShellUser = Pick<AuthenticatedUser, "id" | "name" | "email" | "role">;

/** Model of the "Interface" block of settings; built on the client from `PreferencesStore` (no request). */
export type InterfaceBlockModel = {
  preferences: InterfacePreferences;
  resolvedTheme: ResolvedTheme;
  /** Locale being applied (switch in flight), else null. */
  localePending: Locale | null;
};
