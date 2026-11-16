# 90 — Addendum 4: one shared type catalogue — names, shapes and the stored / derived / wire rules

Addendum to the mobile-rewrite specs `01`–`09` (Expo / React Native, TypeScript) of "ШБЗ Школа". It closes one
cross-spec gap found by the completeness review — **the same entity is declared under different names or
shapes in different specs** (12 items) — and does **not** edit the existing files.

Result of this addendum:

- `09-data-i18n-math.md` §1 becomes the **single place where a shared type is declared**. Section 2 below is
  the block that completes it (it is to be read as `09` §1.8). Every other spec imports the names from there
  and keeps only its own screen view models.
- For each of the 12 items: what the site code does, the canonical name and shape, and the lines of the
  existing specs that are superseded.

Marking: **[CODE]** = fact read from the site code (file named). **[DECISION]** = choice made by this addendum
between conflicting spec proposals (a mobile API does not exist on the site, so every mobile name is a
proposal). **[PROPOSAL]** = recommendation for the mobile app that has no counterpart on the site.
**[FRAMEWORK/JS]** = behaviour of JavaScript / Next.js itself, not of repo code. Where an
existing spec states something the code contradicts, or a name / shape is superseded, the line starts with
**CORRECTION to `<file>`**.

Relation to the earlier addenda: `90-addendum-1` fixed the error envelope and code casing,
`90-addendum-2` fixed endpoint ownership and navigation. Items already decided there are **not re-decided**
here; they are referenced and completed (item 2 `NavItem`, item 5 attendance, item 9 notifications, part of
item 8 files, part of item 10 compose data).

Source files read (web repo `/home/user/web_shetya`, read-only): `prisma/schema.prisma` (enums, `Lesson`,
`LessonParticipant`, `StoredFile`, `Notification`), `lib/lesson-status.ts`, `lib/attendance.ts`,
`components/interface-settings-panel.tsx`, `components/locale-switch.tsx`, `actions/locale.ts`,
`lib/i18n/locale.ts`, `app/layout.tsx`, `app/globals.css` (`data-theme`, `data-hints` selectors),
`components/dashboard-nav.tsx`, `lib/platform-data.ts` (`getTeacherLessons`, `getTeacherStudentLessons`,
`getLessonDetail`, `getStudentLiveLesson`, `getGroupAttendance`, `getStudentGroupAttendance`,
`getStudentTheoryLibrary`, topic / homework file and photo selects), `lib/teacher-statistics.ts`,
`components/teacher-stats-section.tsx`, `lib/lesson-finalize.ts`, `actions/account.ts`,
`scripts/create-test-accounts.ts`, `app/api/teacher/lessons/route.ts`,
`app/api/teacher/lessons/[lessonId]/route.ts`, `…/finish/route.ts`, `…/status/route.ts`, `…/live/route.ts`,
`…/participants/[participantId]/regenerate/route.ts`, `app/api/teacher/homework-plans/route.ts`,
`app/api/teacher/homework-plans/[planId]/issue/route.ts`, `app/(dashboard)/teacher/lessons/[lessonId]/page.tsx`,
`app/(dashboard)/teacher/lessons/new/page.tsx`, `app/(dashboard)/teacher/lessons/page.tsx`,
`app/(dashboard)/teacher/homework-plans/[planId]/page.tsx`, `app/(dashboard)/teacher/groups/[groupId]/page.tsx`,
`app/(dashboard)/teacher/students/[studentId]/lessons/new/page.tsx`, `…/assign/page.tsx`,
`app/(dashboard)/student/homeworks/[assignmentId]/page.tsx`, `lib/lesson-plan.ts`, `lib/homework-plan.ts`,
`lib/lesson-plan-generate.ts`, `lib/homework-plan-generate.ts`, `lib/lesson-plan-queue.ts`, `lib/plan-error.ts`,
`components/teacher-lesson-compose-board.tsx`, `components/teacher-homework-assign-board.tsx`,
`components/use-topic-conditions.ts`, `components/teacher-lesson-board.tsx`,
`app/api/teacher/topics/conditions/route.ts`, `app/api/teacher/uploads/route.ts`,
`components/file-resource-card.tsx`, `lib/image-thumbnail.ts`, `lib/notifications.ts`,
`lib/notification-text.ts`, `app/api/notifications/route.ts`, `app/api/student/homework-checks/route.ts`,
`app/api/student/homework-submissions/route.ts`, `app/api/student/lesson-submissions/route.ts`,
`app/api/student/lesson/route.ts`, `lib/solution-check-student-view.ts`, `lib/solution-check-error-text.ts`,
`components/student-homework-check.tsx`, `components/student-lesson-view.tsx`,
`lib/i18n/dictionaries/planner.ts`, `lib/i18n/dictionaries/student.ts`, `lib/i18n/dictionaries/ru.ts`
(`interface`), `lib/utils.ts` (`toIsoDateTimeString`), `next.config.ts` (rewrites), every dynamic segment
folder under `app/**`, and the specs `01`–`09`, `90-addendum-1`, `90-addendum-2` in this folder.

---

## 0. Summary — the 12 items

| # | Subject | Canonical name(s) after this addendum | Declared in | Retired names / shapes |
|---|---|---|---|---|
| 1 | Interface preferences | `InterfacePreferences = { locale; themeMode; hints }`, `ResolvedTheme` | `09` §1.8 (block S1) | `01` field `theme`; second declaration in `08` §14 |
| 2 | Navigation item | `NavSection`, `ScreenId` (already decided by `90-addendum-2` B.5) | `01` §2 as replaced by `90-addendum-2` B.5 | `NavItemId`, `NavItem` of `01`; `NavItem` of `08` |
| 3 | Timestamp alias | `IsoDateTime`; plus `DateKey`, `DateTimeInputValue` | `09` §1.1 (block S0) | `ISODateTime` (`04`, `05`, `90-addendum-2`); bare `string // ISO` (`01`, `06`, `07`, `08`) |
| 4 | Lesson status | `LessonStatus` = **stored** column; `DerivedLessonStatus` = **computed**; `AttendanceLessonStatus` | `09` §1.1 (block S0) + rule L1–L6 | `LessonStatus` used for derived values in `03`, `06`, label row of `09` |
| 5 | Attendance | `AttendanceStatus` (already decided by `90-addendum-2` A.2.18) | `09` §1.1 | `AttendanceValue` (`06`) |
| 6 | Draft / lesson plan params | `LessonPlanParams`, `HomeworkPlanParams`, both with **optional** `outputLocale` | `09` §1.2 | `HomeworkPlanParamsJson` (`05`); required `outputLocale` (`05`) |
| 7 | Plan error | `PlanErrorRaw = string \| null`, `PlanErrorCode` | `09` §1.4 (block S4) | inline `string \| null` (`04`, `09` §1.2) |
| 8 | File reference | `FileRef`, `StoredFileRef`, `PhotoRef`, `AttachedPhoto` | `09` §1.8 (block S2) | inline 5-field object (`02`), `UploadedFile` (`07`, `90-addendum-2`), `HomeworkPhotoDto.url/thumbUrl` (`03`) |
| 9 | Notification | entity `Notification`; wire `NotificationItem`, `NotificationsResponse` (already decided by `90-addendum-2` A.2.17); `NotificationType` | `09` §1.2 / §1.8 (block S3) | `AppNotification`, `NotificationsPayload` (`01`), `NotificationDto` (`09` App. C); `StudentNotification` stays only as the name of the site type |
| 10 | Compose / assign grid topic | `ComposeBoardTopic`, `AssignBoardTopic` with **required** `conditionsLoaded` and `conditionLatex` | `05` §2 (planner owner) / `04` §2.4 | optional fields in `05` |
| 11 | Path parameters | `{camelCaseName}`, names = the site's dynamic segments | rule in §3.11 | `:groupId` etc. in `06` §6; `{id}`, `{pid}`, `{sid}`, `{nid}` abbreviations |
| 12 | Student check / lesson DTOs vs entities | entity shapes (`09` §1.2) = store rows; wire DTOs = projections under rules P1–P7 | rule in §3.12 | the sentence "must use the entity shapes of 1.2" in `09` App. C |

---

## 1. Ownership rule — where a shared type lives

**[DECISION]**

1. `09-data-i18n-math.md` §1 is the only place where a type used by more than one spec is **declared**:
   - §1.1 primitives and Prisma enums (verbatim values);
   - §1.2 stored entities (one interface per table / JSON blob);
   - §1.4 string-coded dictionaries (`ErrorKind`, `PlanErrorCode`, notification types);
   - §1.8 (new, section 2 of this addendum) shared **wire and client** types that are not table rows.
2. Specs `01`–`08` declare only **view models and request / response types of their own screens**. When one
   of them repeats a shared declaration (every spec currently re-declares `UserRole`, `Locale`,
   `HomeworkNumberStatus`, …), the repetition is a quotation: on any difference `09` §1 wins.
3. A view model that two specs need is declared by the **operation owner** of `90-addendum-2` A.1 and
   imported by the other (example: item 10, `ComposeBoardTopic` — owner `05`).
4. A site type name may differ from the mobile name. When it does, the mapping is listed once, in the item
   below, and the site name is used only inside **[CODE]** statements.
5. `Date` in a type that quotes the return value of a server function (`02` §2.3 `uploadedAt: Date`, `03` §2.2
   `startsAt: Date | null`, `06` §2) describes the **site server**; in the mobile domain layer and on the wire
   the same field is `IsoDateTime` (item 3).

In the mobile code base this is one module (for example `src/domain/types.ts`) generated from `09` §1; the
feature folders import from it and never re-declare.

---

## 2. Block S — declarations that complete `09` §1 (read as `09` §1.8)

Everything here is derived from the code facts of section 3. Names in comments such as "S0" are used by the
summary table above.

```ts
// ───────── S0. Primitives (additions to 09 §1.1) ─────────

/** Instant. Exactly Date#toISOString(): UTC, milliseconds, "Z" — "2026-11-16T15:00:00.000Z". */
export type IsoDateTime = string;                       // already in 09 §1.1 — the ONLY spelling

/** Moscow calendar day "YYYY-MM-DD" (streak / timeline buckets). Declared in 02 §0, promoted to shared. */
export type DateKey = string;

/** Value of the date-time picker: device-local "YYYY-MM-DDTHH:mm", "" = empty. UI state only, NEVER on the wire.
 *  Declared in 08 §10, promoted to shared. Converted with `new Date(value).toISOString()` before sending. */
export type DateTimeInputValue = string;

export type Locale = "ru" | "en";                       // lib/i18n/locale.ts LOCALES; DEFAULT_LOCALE = "ru"

/** STORED column Lesson.status (Prisma enum LessonStatus). */
export type LessonStatus = "PLANNED" | "ACTIVE" | "FINISHED";          // already in 09 §1.1

/** COMPUTED by deriveLessonStatus(lesson, now) — lib/lesson-status.ts exports exactly this name. */
export type DerivedLessonStatus = "PLANNED" | "ACTIVE" | "FINISHED";

/** Lessons listed in the attendance table: PLANNED ones are filtered out before the mapping. */
export type AttendanceLessonStatus = Exclude<DerivedLessonStatus, "PLANNED">;   // "ACTIVE" | "FINISHED"

/** Prisma enum AttendanceStatus. lib/attendance.ts calls the same union AttendanceValue — not used on mobile. */
export type AttendanceStatus = "UNKNOWN" | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";   // already in 09 §1.1

// ───────── S1. Device preferences ─────────

export type ThemeMode = "system" | "light" | "dark";    // the user's CHOICE (site: localStorage "shbz-theme", <html data-theme-mode>)
export type ResolvedTheme = "light" | "dark";           // what is painted      (site: <html data-theme>)
export type HintsMode = "on" | "off";                   // site: localStorage "shbz-hints", <html data-hints>

/** Per-device, never stored on the account, survives logout. */
export interface InterfacePreferences {
  locale: Locale;          // default "ru"
  themeMode: ThemeMode;    // default "system"
  hints: HintsMode;        // default "off"
}
export const DEFAULT_INTERFACE_PREFERENCES: InterfacePreferences = { locale: "ru", themeMode: "system", hints: "off" };

// ───────── S2. Files ─────────

/** The handle a viewer needs (09 §5.2). */
export type FileRef = Pick<StoredFile, "id" | "originalName" | "mimeType" | "size">;

/** The projection every site reader of a topic file and the upload route return. */
export type StoredFileRef = FileRef & { uploadedAt: IsoDateTime };

/** A solution photo referenced by its file id only (check snapshots). */
export interface PhotoRef { fileId: string; originalName: string }

/** A photo currently attached to a homework (HomeworkSubmissionPhoto row + file columns). */
export interface AttachedPhoto extends PhotoRef {
  id: string;              // HomeworkSubmissionPhoto.id — the id used to delete the photo
  mimeType: string;        // "image/png" | "image/jpeg"
  createdAt: IsoDateTime;
}

// ───────── S3. Notifications ─────────

/** lib/notification-text.ts NOTIFICATION_TYPES (8 values) + the developer broadcast. */
export type NotificationType =
  | "homework-assigned" | "homework-checked" | "parent_call_due"
  | "dev_errors" | "dev_ai_budget_warn" | "dev_ai_budget_out" | "dev_stale_checks" | "dev_storage"
  | "broadcast";
export type NotificationParams = Record<string, string | number | boolean | null>;   // already in 09 §1.2
// Stored row:  Notification        (09 §1.2)            — mock store only, never a response type
// Wire item:   NotificationItem, NotificationsResponse   (90-addendum-2 A.2.17) — the only wire shape

// ───────── S4. Planner strings (additions to 09 §1.4) ─────────

/** Raw LessonParticipant.planError: "plan-error:<PlanErrorCode>", a frozen legacy Russian sentence, or null. */
export type PlanErrorRaw = string | null;

/** Class of a FAILED AI check as sent to a student (03 §6). "unknown" ↔ dictionary key `fallback`. */
export type CheckErrorCode =
  | "interrupted" | "disabled" | "timeout" | "quota" | "unavailable" | "queue" | "image" | "unknown";
```

Changes to declarations that already exist in `09` §1.2 (shape unchanged unless stated):

```ts
export interface LessonParticipant { /* … */ planError: PlanErrorRaw; /* was: string | null — same type, one name */ }
export interface Notification      { /* … */ type: NotificationType | string; /* NotificationType is now declared (S3) */ }

/** Lesson.planParams of a kind=LESSON row — the JSON as stored. */
export interface LessonPlanParams {
  title: string; durationMinutes: number; topicIds: string[]; teacherNote: string;
  outputLocale?: Locale;        // OPTIONAL — see 3.6
}
/** Lesson.planParams of a kind=HOMEWORK row — the JSON as stored. */
export interface HomeworkPlanParams {
  title: string; topicId: string; deadlineAt: IsoDateTime; teacherNote: string;
  sourceLessonId: string | null; dailyMinutes: number;
  outputLocale?: Locale;        // OPTIONAL — see 3.6
}
```

---

## 3. The 12 items

### 3.1 `InterfacePreferences` — `{ locale, theme, hints }` (`01`) vs `{ themeMode, hints, locale }` (`08`)

**[CODE]** (`components/interface-settings-panel.tsx`, `app/layout.tsx`, `app/globals.css`,
`components/locale-switch.tsx`, `actions/locale.ts`, `lib/i18n/locale.ts`)

| Preference | Site storage | Values / default | How it is validated | How it is applied |
|---|---|---|---|---|
| theme mode | `localStorage["shbz-theme"]`, fallback key `tutorflow-theme` | `system` \| `light` \| `dark`; default `system` | settings panel: any other string → `system`. Bootstrap script in `app/layout.tsx`: **no validation** — a string other than `system` is copied to `data-theme` as is | `<html data-theme-mode>` = the mode; `<html data-theme>` = `dark` when mode is `system` and `prefers-color-scheme: dark` matches, `light` when it does not, otherwise the mode itself. Storage error → `system` / `light` |
| hints | `localStorage["shbz-hints"]`, fallback `tutorflow-hints` | `on` \| `off`; default `off` | only the exact string `on` enables | `<html data-hints>`; `html[data-hints="off"] .ui-hint { display: none !important }` |
| locale | cookie `shbz-lang`, `path=/`, `sameSite=lax`, `maxAge = 60·60·24·365` s | `ru` \| `en`; default `ru` | `isLocale(value)`; `setLocaleAction` returns `{ ok: false }` otherwise | server reads the cookie on every request; `{ ok: true, locale }` → `router.refresh()` |

- The site itself names the two theme concepts differently: the stored choice is `themeMode` (state variable,
  `dataset.themeMode`), the painted result is `theme` (`dataset.theme`, CSS selector `html[data-theme="dark"]`).
- The `prefers-color-scheme` change listener is registered **inside `InterfaceSettingsPanel`** (effect that
  depends on `themeMode`, `hintsMode`), i.e. only while the settings page is mounted and only in mode
  `system`. On every other page the theme is resolved once, at page load, by the inline script.
- The settings panel writes **both** keys (`shbz-theme`, `shbz-hints`) whenever either value changes; the
  legacy `tutorflow-*` keys are only read.
- `LocaleSwitch`: choosing the current locale, or choosing while a request is pending, does nothing; on
  `{ ok: false }` the highlighted segment goes back.
- Nothing is written to the database and no request carries theme or hints.

**Canonical [DECISION]** — block S1: `InterfacePreferences = { locale: Locale; themeMode: ThemeMode; hints: HintsMode }`.
The field is `themeMode`, because `theme` already means the resolved `light | dark` value in the site code.
Field order has no meaning.

- **CORRECTION to `01-shell-auth.md` §2**: `InterfacePreferences.theme: ThemeMode` → `themeMode: ThemeMode`.
  Everything else in `01` §1.5.1 / §4.9 (defaults `ru`, `system`, `off`; device-level; survives logout) is right.
- **CORRECTION to `08-design-system.md` §14**: the second declaration
  `type InterfacePreferences = { themeMode: …; hints: …; locale: … }` is removed (import the shared one). The
  first declaration (`08` §10) already has the canonical field names. `PreferencesStore.load()` returns
  `DEFAULT_INTERFACE_PREFERENCES` when nothing is stored.
- **CORRECTION to `01-shell-auth.md` §1.5.1 and `08-design-system.md` §11.1** ("`system` → … react live to OS
  changes" / "the app listens to OS scheme changes and re-applies live"): on the site this is true only while
  the settings page is open (see above). **[PROPOSAL]** the mobile app subscribes for the whole app lifetime
  (React Native `Appearance` listener) — a deliberate improvement, not site parity.
- **CORRECTION to `01-shell-auth.md` §1.5.1 and `08-design-system.md` §11.1** ("any other stored value →
  `system`"): true for the settings panel only; the page bootstrap script does not validate. The mobile
  `PreferencesStore.load()` validates all three fields on every read (rules below).

View model of the block on the Settings screen (`shell.settings`, owner `01` §1.5.1) — unchanged, restated
with the canonical names:

```ts
type InterfaceBlockModel = {
  preferences: InterfacePreferences;
  resolvedTheme: ResolvedTheme;          // themeMode === "system" ? device scheme : themeMode
  localePending: Locale | null;          // highlighted while setLocale is in flight (site: pendingLocale)
};
```

Operations (client-only on mobile; the mock and the real app share them):

| Operation | Input | Output | Rules |
|---|---|---|---|
| `PreferencesStore.load()` | — | `InterfacePreferences` | per field: stored value valid → use it; missing / invalid / storage error → the default (`ru`, `system`, `off`). `hints` is `on` only for the exact string `on` |
| `setThemeMode(mode)` | `ThemeMode` | `void` | persist; `resolvedTheme` recomputed immediately; no server call |
| `setHints(hints)` | `HintsMode` | `void` | persist; when `off`, every hint element is not rendered (`01` §1.5.1) |
| `setLocale(locale)` | `Locale` | `{ ok: true; locale } \| { ok: false }` | not a `Locale` → `{ ok: false }`, selection reverts, nothing stored; same locale as current or a change already pending → no-op. On success the app re-renders and every later request carries `Accept-Language: <locale>` (`90-addendum-1` A.1) |

No limits, no rate limit, no error codes (`setLocaleAction` has no auth and no failure other than
`{ ok: false }`). The optional roaming endpoints `GET` / `PUT /me/preferences` of `08` §14 stay optional and
outside v1 (`90-addendum-1` table M: category (d)); if they are ever built their body is
`InterfacePreferences` and the only error is `400 invalidData`.

### 3.2 `NavItem` — `{ id, labelKey, webPath, placement }` (`01`) vs `{ key, route, labelKey, isSettings }` (`08`)

**[CODE]** (`components/dashboard-nav.tsx`) The site's own type is neither of the two:
`type NavItem = { href: string; label: string; match: (pathname, searchParams) => boolean }`, built by
`buildNavItems(role, dict.nav)`; the settings entry is the **last** item of each role's list and is rendered
as the gear (`SettingsGearLink`), not as a tab. Lists, in order:

| Role | `href` list |
|---|---|
| STUDENT | `/student`, `/student/lesson`, `/student/homeworks`, `/student/deadlines`, `/student/theory`, `/student/info`, `/student/settings` |
| TEACHER | `/teacher`, `/teacher/topics`, `/teacher/students`, `/teacher/groups`, `/teacher/lessons` (also active under `/teacher/homework-plans`, `isPlannerPath`), `/teacher/calls`, `/teacher/settings` |
| DEVELOPER | `/developer/topics`, `/developer/accounts`, `/developer/calls`, `/developer/statistics`, `/developer/panel`, `/developer/settings` |

**Canonical** — already decided by `90-addendum-2` B.5 (owner `01`): `ScreenId`, `NavSection`, `SECTIONS`,
`HOME`. This addendum only adds the field mapping so that neither old shape is implemented by accident:

| `NavSection` (canonical) | `01` §2 `NavItem` | `08` §10 `NavItem` | Site `NavItem` |
|---|---|---|---|
| `screen: ScreenId` | `id: NavItemId` (ids renamed per `90-addendum-2` B.5) | `key: string` | — |
| `labelKey: string` | `labelKey` | `labelKey` | `label` (already translated text) |
| `webPath: string` | `webPath` | `route` | `href` |
| `placement: "tab" \| "more" \| "gear"` | `placement: "tab" \| "gear"` | `isSettings: boolean` (`true` ⇔ `"gear"`) | position (last item = gear) |
| — (navigator state) | — | — | `match` |

- **CORRECTION to `01-shell-auth.md` §2**: `ShellHeaderModel.items: NavItem[]` → `NavSection[]`;
  `homeTarget: NavItemId` → `ScreenId` (`HOME[role]`).
- **CORRECTION to `08-design-system.md` §10**: `NavItem` is removed; components that take it take `NavSection`.

### 3.3 Timestamp alias — `ISODateTime` (`04`, `05`) vs `IsoDateTime` (`02`, `03`, `09`)

**[CODE]**

- Site JSON responses carry instants either through an explicit `.toISOString()` (e.g. `uploadedAt` in
  `app/api/teacher/uploads/route.ts`, `checkedAt` in `app/api/student/homework-checks/route.ts`,
  `readAt` / `createdAt` in `lib/notifications.ts`) or by passing a `Date` to `NextResponse.json`
  (e.g. `planGeneratedAt` in `app/api/teacher/lessons/[lessonId]/status/route.ts`). **[FRAMEWORK/JS]** both
  give the same string: `Date#toJSON` is `toISOString()` — UTC, milliseconds, `Z`.
- `lib/utils.ts` `toIsoDateTimeString(value)` → `null` for empty / invalid input, else `toISOString()`.
- Requests: the client converts the picker value with `new Date(value).toISOString()` (`inputToIso` in
  `components/teacher-homework-assign-board.tsx`); servers parse with `new Date(raw)` and reject
  `Number.isNaN(date.getTime())` (e.g. `PATCH /api/teacher/lessons/{lessonId}` → `400 invalidStartsAt`).
- Day keys `YYYY-MM-DD` come from `getTimelineDateKey` (`lib/platform-data.ts`) and depend on the process
  time zone (`TZ=Europe/Moscow`, `09` §6).

**Canonical [DECISION]** — `IsoDateTime` (spelling of `09` §1.1; three specs already use it). Block S0 also
promotes the two other date-shaped aliases that exist in one spec each, so that they are not confused with
it: `DateKey` (`02` §0) and `DateTimeInputValue` (`08` §10).

- **CORRECTION to `04-teacher-students.md` §2** and **`05-teacher-lessons-plans.md` §2**: `ISODateTime` →
  `IsoDateTime` (pure rename; 0 semantic change). The same rename applies to the `ISODateTime` occurrences
  inside `90-addendum-2` (A.2.4, A.2.19).
- **CORRECTION to `01-shell-auth.md` §2, `06-teacher-groups-calls-stats.md` §2 / §6,
  `07-developer-content.md` §2 / §6, `08-design-system.md` §10**: fields typed `string` with a comment
  `// ISO` (`createdAt`, `readAt`, `uploadedAt`, `startsAt`, `since`, `until`, `generatedAt`, `expiresAt`,
  `sessionExpiresAt`, …) are `IsoDateTime`.

Rules: (T1) every instant on the wire is `IsoDateTime`, `null` = not set, never an empty string;
(T2) a request field that is an instant is validated as "parses to a finite date", otherwise the endpoint's
own `invalid…` code (`90-addendum-1`); (T3) `DateTimeInputValue` and `DateKey` are never mixed with
`IsoDateTime` in one field; (T4) the mock store keeps `IsoDateTime` strings and compares them through
`Date.parse`, never lexicographically.

### 3.4 Lesson status — `LessonStatus` vs `DerivedLessonStatus`, and when each is sent

**[CODE]** There are two different things in the site code, each with its own name:

| | Stored | Derived |
|---|---|---|
| Name in the code | Prisma enum `LessonStatus` (`prisma/schema.prisma`), column `Lesson.status`, default `PLANNED`, indexed | `DerivedLessonStatus`, return type of `deriveLessonStatus(lesson, now = Date.now())` in `lib/lesson-status.ts` |
| Values | `PLANNED`, `ACTIVE`, `FINISHED` | the same three |
| Meaning | `FINISHED` = "end-of-lesson results have been finalized" (`lib/lesson-finalize.ts`); otherwise a fallback for lessons without `startsAt` | what the lesson is doing at `now` |
| Who writes / computes | `finalizeLessonResults` sets `FINISHED`; `PATCH /api/teacher/lessons/{lessonId}` sets `PLANNED` when a finalized lesson (stored `FINISHED`, no `finishedAt`, no submissions) gets a new `startsAt` under which it is no longer finished; `scripts/create-test-accounts.ts` seeds `FINISHED` / `PLANNED`. **No application code ever writes `ACTIVE`** | `finishedAt` set and `≤ now` → `FINISHED`; no valid `startsAt` → the stored value if it is one of the three, else `PLANNED`; `now < startsAt` → `PLANNED`; `now < startsAt + max(0, durationMinutes)·60 000` → `ACTIVE`; else `FINISHED` |

Where each one leaves the server:

| Site reader / route | Field | Which | Consumer |
|---|---|---|---|
| `getTeacherLessons` | `status` | derived | lessons list, group detail lessons block |
| `getTeacherStudentLessons` | `status` | derived | student card → Lessons tab |
| `getLessonDetail` (lesson board page, homework draft page; also imported by the handout data module `lib/lesson-print-data.ts`) | `status` | derived | `TeacherLessonBoard` (`isLive = status === "ACTIVE"`, "no time" banner when `!startsAt && status !== "FINISHED"`) |
| `getGroupAttendance` | `status` | derived, lessons with derived `PLANNED` removed first → only `ACTIVE` \| `FINISHED` | attendance table |
| `getStudentGroupAttendance` | — (filter only: derived `=== "FINISHED"`) | derived | student PDF report |
| `getStudentLiveLesson` | — (filter only: `active` = first derived `ACTIVE`, `upcoming` = first derived `PLANNED`) | derived | student Lesson tab |
| `POST /api/student/lesson`, `POST /api/student/lesson-submissions`, `POST /api/teacher/lessons/{lessonId}/finish` | guard `derived !== "ACTIVE"` → `409` | derived | — |
| `getTeacherStatistics` (`lib/teacher-statistics.ts`) | `recentLessons[].status`; counter `lessonsFinished` (`groupBy teacherId, status`) | **stored** | DEVELOPER statistics "by teacher" |
| `finalizeRecentlyFinishedLessons`, `finalizeLessonResults`, `changeStudentOwnersAction` (`actions/account.ts`) | where-clauses `status: { not: FINISHED }` | **stored** | server only |

Labels differ too: derived status → `dict.planner.lessonStatus.{PLANNED,ACTIVE,FINISHED}` («Запланирован» /
«Идёт» / «Завершён» — "Planned" / "In progress" / "Finished"); stored status in the statistics card →
`dict.planner.teacherStats.lessonStatus.{PLANNED,ACTIVE,FINISHED}` («запланировано» / «идёт сейчас» /
«проведено» — "planned" / "in progress" / "held") (`components/teacher-stats-section.tsx`).

Consequences of the stored value being shown in the statistics (`06` §4.8 already uses it deliberately):

- a lesson that is running right now is listed as «запланировано» (stored `PLANNED`) — there is no stored `ACTIVE`;
- a lesson whose time has passed is «запланировано» until something runs the finalisation for it — the
  teacher's "finish" route (`finalizeLessonResults`), or one of the four pages that call
  `finalizeRecentlyFinishedLessons`: lesson board, teacher's lessons list, group detail, student's Lesson
  tab (only lessons that ended within `LESSON_FINALIZE_WINDOW_MS` = 48 h are picked up) — then «проведено»;
- `lessonsFinished` counts finalized lessons, not lessons whose time has passed.

**Canonical [DECISION]** — keep **both names with the code's meaning** (block S0):

- **L1.** `LessonStatus` is used **only** for the stored column: the entity `Lesson.status` (`09` §1.2) and
  the two statistics fields of `06` (`TeacherLessonEntry.status`, and the count `lessonsFinished`).
- **L2.** Every other `status` of a lesson in a response is `DerivedLessonStatus`, computed by the server
  with its own clock at the moment the response is built. The mock computes it on every read from the
  stored row (`09` §2.2 principle "re-derive on read"), never stores it.
- **L3.** A lesson in an attendance payload is `AttendanceLessonStatus` (`"ACTIVE" | "FINISHED"`).
- **L4.** A homework draft (`kind = HOMEWORK`) has no schedule (`startsAt = null`, never finalized), so its
  derived status equals its stored one, `PLANNED`; draft view models do not expose a status (`05` §2
  `HomeworkPlanBoardModel`, `HomeworkPlanListItem` have none).
- **L5.** The client may advance a derived status between fetches **only along the schedule**
  (`PLANNED → ACTIVE → FINISHED`) and only for a DTO that carries `startsAt` (non-null) and
  `durationMinutes`; it applies the three schedule branches of `deriveLessonStatus` (`now < startsAt` →
  `PLANNED`; `now < startsAt + durationMinutes·60 000` → `ACTIVE`; otherwise `FINISHED`) to the
  server-corrected clock (`serverNow` of the response where present, `09` §6.2). A DTO with `startsAt === null` keeps the status it
  arrived with. An early finish (`finishedAt`) and a reschedule are learned only from a refetch (realtime
  event `lesson-activity` or polling). **[CODE]** the site's teacher board never re-derives on the client:
  it shows the status of the last server render and refreshes on activity (`router.refresh()`).
- **L6.** The two label sets are not interchangeable: derived → `dict.planner.lessonStatus`, stored
  (statistics) → `dict.planner.teacherStats.lessonStatus`.

Corrections:

- **CORRECTION to `03-student-homework-lesson.md` §0.1**: `type LessonStatus … // stored AND derived` → two
  types. The `status` field of `GET /student/lessons/{lessonId}/state` (`03` §6.2) is `DerivedLessonStatus`.
  `03` never sends the stored value.
- **CORRECTION to `06-teacher-groups-calls-stats.md` §2**: `TeacherLessonListItem.status: LessonStatus //
  derived` → `DerivedLessonStatus`; consequently `GroupDetailResponse.lessons.recent[].status` (`06` §6.1) is
  `DerivedLessonStatus`. `TeacherLessonEntry.status: LessonStatus // stored status` is right and stays;
  `"ACTIVE" | "FINISHED"` in `GroupAttendanceLessonRaw`, `AttendanceLesson` (§2) and
  `GroupAttendanceResponse` (§6.3) is `AttendanceLessonStatus`.
- **CORRECTION to `09-data-i18n-math.md` §1.1** (label table row "`LessonStatus` (derived) |
  `dict.planner.lessonStatus.*`"): the row describes `DerivedLessonStatus`. A second row is missing:
  `LessonStatus` (stored, statistics only) | `dict.planner.teacherStats.lessonStatus.*` | запланировано /
  идёт сейчас / проведено | planned / in progress / held.
- **CORRECTION to `05-teacher-lessons-plans.md` §0.2** (note of the `LessonStatus` row) and
  **`09-data-i18n-math.md` §1.1** (comment "The UI never trusts it when startsAt is set"): add "the stored
  value is never `ACTIVE` in data written by the application; it is displayed as is in exactly one place,
  the DEVELOPER statistics by teacher".
- `04-teacher-students.md` §2 and `05-teacher-lessons-plans.md` §2 already use `DerivedLessonStatus` for
  every lesson view model — no change.

### 3.5 Attendance — `AttendanceStatus` (`03`, `05`, `09`) vs `AttendanceValue` (`06`)

**[CODE]** Both names exist on the site for the same five values: the Prisma enum `AttendanceStatus`
(`LessonParticipant.attendance`, default `UNKNOWN`; used by the routes, e.g. `const allowed =
Object.values(AttendanceStatus)` in the attendance route) and the string union `AttendanceValue` exported by
`lib/attendance.ts` (used by the pure helpers `nextAttendance`, `summarizeAttendance`,
`decideEndOfLessonAttendance`, `ATTENDANCE_META`, the attendance table and both PDFs). The PDF routes cast
between them (`participant.attendance as AttendanceValue`).

**Canonical** — `AttendanceStatus`, decided by `90-addendum-2` A.2.18 (which already carries the
**CORRECTION to `06-teacher-groups-calls-stats.md` §6.3 / §6.6**). Completion:

- **CORRECTION to `06-teacher-groups-calls-stats.md` §2**: `export type AttendanceValue` → `AttendanceStatus`
  in `GroupAttendanceLessonRaw.participants[].attendance` and `AttendanceCell.attendance` as well (the §2
  occurrences are not listed in `90-addendum-2`).
- When `lib/attendance.ts` is ported 1:1 (`09` §1.6), its `AttendanceValue` is replaced by the shared
  `AttendanceStatus`; nothing else in the file changes.

### 3.6 Plan params — `HomeworkPlanParamsJson` / required `outputLocale` (`05`) vs `HomeworkPlanParams` / optional (`09`)

**[CODE]**

- `Lesson.planParams` is `Json?` (nullable).
- Written by `POST /api/teacher/lessons`: `{ title, durationMinutes, topicIds, teacherNote, outputLocale }`;
  by `POST /api/teacher/homework-plans`: `{ title, topicId, deadlineAt: <ISO string>, teacherNote,
  sourceLessonId, dailyMinutes, outputLocale }`. In both, `outputLocale` is the **request locale**
  (`getI18n()` → cookie `shbz-lang`); it is not read from the request body.
- Rows **without** `outputLocale` exist: `scripts/create-test-accounts.ts` writes
  `planParams: { title, durationMinutes: 60, topicIds, teacherNote: "" }`, and the readers are written for
  its absence — `outputLocale = locale ?? parseLocale(planParams.outputLocale)` in
  `lib/lesson-plan-generate.ts` and `lib/homework-plan-generate.ts` (`parseLocale(undefined)` → `"ru"`).
- Which locale a generation uses: creating a lesson / draft and "regenerate" pass the request locale with
  the queue job (`enqueueLessonPlan(…, locale)`); only the automatic resume after a server restart
  (`resumeStaleLessonPlans`, job without `locale`) falls back to `planParams.outputLocale`.
- Other fields are read defensively too: `normalizePlanParams` (title trimmed, ≤ 200; `durationMinutes`
  missing → `Lesson.durationMinutes`, then default 60, clamped 15..240; `topicIds` → trimmed non-empty
  strings; `teacherNote` ≤ 500); `normalizeHomeworkParams` (`topicId` missing → `Lesson.topicId`;
  `dailyMinutes` missing → 60, clamped 15..240; **`deadlineAt` is always taken from the column
  `Lesson.deadlineAt`**, not from the JSON; a missing or past deadline → `planError =
  "plan-error:homeworkParams"`).
- The site's own TypeScript types describe the **normalised in-memory** form, not the JSON:
  `PlanParams` (`lib/lesson-plan.ts`) and `HomeworkPlanParams` (`lib/homework-plan.ts`, with
  `deadlineAt: Date`) — neither has `outputLocale`.
- **No client ever receives `planParams`.** `getLessonDetail` returns it to server code only; the lesson
  page passes none of it to `TeacherLessonBoard`; the draft page reads `planParams.sourceLessonId` on the
  server to build the "after lesson …" link; the issue route reads `planParams.title` on the server.

**Canonical [DECISION]** — the two interfaces of section 2 (`LessonPlanParams`, `HomeworkPlanParams`):
names of `09` §1.2, `outputLocale?: Locale` **optional** in both, because the type describes the stored JSON
and stored rows without the key exist.

- **CORRECTION to `05-teacher-lessons-plans.md` §2**: `LessonPlanParams.outputLocale: "ru" | "en"` and
  `HomeworkPlanParamsJson.outputLocale: "ru" | "en"` are **optional** (`outputLocale?: Locale`); the type
  `HomeworkPlanParamsJson` is renamed `HomeworkPlanParams`; `LessonDetail.planParams` is
  `LessonPlanParams | HomeworkPlanParams | null`.
- **CORRECTION to `05-teacher-lessons-plans.md` §2** (`LessonDetail` — "full server shape … superset used by
  lesson board, homework board and PDFs"): `planParams`, `teacherId` and item `answerLatex` are server-side
  fields of that superset. `planParams` is **not part of any mobile response**; the two things derived from
  it are already separate fields — `HomeworkPlanBoardModel.sourceLesson` and the assignment title used by
  "issue".

Rules for the mock: (PP1) on create, store `outputLocale` = the locale of the creating request
(`Accept-Language`, `90-addendum-1`); (PP2) the lesson fixtures of `09` §2.8 are extended with one lesson whose
`planParams` has no `outputLocale` and one with `planParams: null` — both must open normally;
(PP3) a generation started by a user action uses the locale of **that** request, not the stored one;
(PP4) the draft's deadline is `Lesson.deadlineAt`; `planParams.deadlineAt` is a copy made at creation.

### 3.7 `planError` — `string | null` (`04`) vs `PlanErrorRaw` (`05`)

**[CODE]** (`lib/plan-error.ts`, `prisma/schema.prisma`, readers) `LessonParticipant.planError` is `String?`.
Values: `"plan-error:" + PlanErrorCode` (`planErrorValue`), or one of 7 frozen Russian sentences written
before codes existed (`LEGACY_PLAN_ERRORS`, matched by `raw.trim()`), or `null`. `PlanErrorCode` =
`keyof Dictionary["planner"]["planErrors"]`: `unavailable`, `studentMissing`, `noCandidates`,
`homeworkNoCandidates`, `homeworkParams`, `emptyPlan`, `failed`, `budgetExhausted`, `queueFull` (the legacy
map covers the first seven). Every reader and route returns the **raw** string unchanged
(`getTeacherLessons` only counts it; `getTeacherStudentLessons`, `getLessonDetail`,
`GET /api/teacher/lessons/{lessonId}/status`, `GET /api/teacher/homework-plans/{planId}/status`); the text
is produced on the client by `planErrorText(raw, dict.planner.planErrors)`, which returns the raw string
itself when it is neither a known code nor a legacy sentence.

**Canonical [DECISION]** — `PlanErrorRaw = string | null` (block S4; the definition of `05` §2). It is
structurally identical to `string | null`, so this is a naming alignment only.

- **CORRECTION to `04-teacher-students.md` §2.5**: `TeacherStudentLesson.planError: string | null` and
  `LessonPlanStatus.participants[].planError: string | null` → `PlanErrorRaw`. The duplicate declaration of
  `LessonPlanStatus` in `04` §2.5 is removed. **[DECISION]** the type and its endpoint
  `GET /teacher/lessons/{lessonId}/status` are owned by `05` (§2, §6), like the other lesson routes
  (`90-addendum-2` A.1 items 2–5); `04` §6.5 references them. The two site consumers poll the same route at
  different intervals — the lesson board every 2000 ms, the student card's Lessons tab every 2500 ms
  (`POLL_INTERVAL_MS` in `components/teacher-lesson-board.tsx` / `components/teacher-student-lessons.tsx`).
- **CORRECTION to `09-data-i18n-math.md` §1.2**: `LessonParticipant.planError: string | null` → `PlanErrorRaw`
  (and the comment's reference "(1.3)" should read "(1.4)", where `PlanErrorCode` is declared).

Rules: (PE1) the wire carries the raw value; the app never shows it directly, always through the ported
`planErrorText`; (PE2) `pending` = `planGeneratedAt === null && planError === null` (plus the staleness and
"issued" conditions of `05` §4.2); `failed` = `planError !== null`; (PE3) an unknown raw string is displayed
as is — the mock must contain one legacy sentence to exercise the map.

### 3.8 File reference — inline object (`02`), `StoredFileRef` + `UploadedFile` (`07`), `FileRef` (`09`)

**[CODE]** Five distinct projections exist on the site:

| Projection | Fields | Where |
|---|---|---|
| Topic file | `id`, `originalName`, `mimeType`, `size`, `uploadedAt` | `select` of `theoryFile` in `getStudentTheoryLibrary`; `theoryFile` / `homeworkFile` of `getTeacherTopicDetail`; props type `FileResource` of `components/file-resource-card.tsx` (`uploadedAt: Date`) |
| Upload result | the same five, `uploadedAt` as ISO string | both success branches of `POST /api/teacher/uploads` → `{ file: { … } }` |
| Attached homework photo | `id` (photo row), `fileId`, `originalName`, `mimeType`, `createdAt` | `photos` of `getTeacherStudentHomeworks` and of `getStudentHomeworks` (same return type), ordered by `createdAt` asc; the student page forwards only `id`, `fileId`, `originalName` to the client |
| Check snapshot photo | `fileId`, `originalName` | `checks[].photos` of the same reader (ordered by `order` asc) |
| Lesson submission photos | file ids only | teacher board prop `submission.photoFileIds: string[]` (from `latestSubmission.photos[].fileId`); **not selected at all** for the student (`getStudentLiveLesson`) |

`POST /api/student/homework-submissions` answers `{ ok: true, photos: Array<{ id, fileId }> }` — only the two
ids of the rows just created. `StoredFile` itself also has `storageKey` (server-only) and `uploadedById`.
Thumbnails exist for `image/png`, `image/jpeg`, `image/jpg`, `image/webp` (`isThumbnailable`), requested as
`/files/{fileId}?thumb=1`.

**Canonical [DECISION]** — block S2: `FileRef` (4 fields, what a viewer needs), `StoredFileRef = FileRef &
{ uploadedAt: IsoDateTime }` (what the site returns for a topic file and for an upload), `PhotoRef`,
`AttachedPhoto`.

- **CORRECTION to `02-student-study.md` §2.3 / §6.4**: the inline `theoryFile: { id; originalName; mimeType;
  size; uploadedAt }` is `StoredFileRef` (§2.3 writes `uploadedAt: Date` — server type, see rule 5 of
  section 1).
- **CORRECTION to `07-developer-content.md` §2 / §6.5** and **`90-addendum-2` A.2.11**: `UploadedFile` is the
  same shape as `StoredFileRef`; one name is kept — `StoredFileRef`. `POST /uploads → 201 { file:
  StoredFileRef }`; `ContentApi.uploadFile(…): Promise<StoredFileRef>`.
- **CORRECTION to `09-data-i18n-math.md` §5.2**: `FileRef` is declared in prose inside §5.2; it moves to the
  catalogue (block S2). `FileService.download(file: FileRef, …)` is unchanged.
- **CORRECTION to `03-student-homework-lesson.md` §6.1**: `HomeworkPhotoDto = { id; fileId; originalName;
  createdAt; url; thumbUrl }` → `AttachedPhoto` (`id`, `fileId`, `originalName`, `mimeType`, `createdAt`).
  `url` / `thumbUrl` are dropped: the v1 contract has no signed or pre-built URLs (`90-addendum-2` A.2.10);
  the app builds both from `fileId` through `FileService.source(fileId, "original" | "thumb")`.
- **CORRECTION to `04-teacher-students.md` §2.3**: the inline `photos: Array<{ id; fileId; originalName;
  mimeType; createdAt }>` of the teacher homework model is `AttachedPhoto[]`; `TeacherHomeworkCheck.photos:
  Array<{ fileId; originalName }>` is `PhotoRef[]`.

Rules: (F1) a response that references a file inlines `StoredFileRef` (topic files) or
`AttachedPhoto` / `PhotoRef` / a bare `fileId` (photos) — never a URL; (F2) `storageKey` and `uploadedById`
never leave the server; (F3) every file id is opened only through `GET /files/{fileId}` with the access
check of `09` §5.1, so a `fileId` in a payload grants nothing by itself; (F4) the student never receives
photo ids of lesson submissions.

### 3.9 Notification — `AppNotification` (`01`), `Notification` / `NotificationDto` (`09`), `StudentNotification` (`09` App. B)

**[CODE]** (`prisma/schema.prisma`, `lib/notifications.ts`, `lib/notification-text.ts`,
`app/api/notifications/route.ts`)

- Table `Notification`: `id`, `userId`, `type: String`, `title: String`, `body: String?`, `href: String?`,
  `params: Json?`, `readAt: DateTime?`, `createdAt`; `onDelete(user): Cascade`.
- The site's response item type is `StudentNotification = { id; type: string; title; body: string | null;
  href: string | null; readAt: string | null; createdAt: string }` — used for **every** role despite its
  name; `title` / `body` are already rendered for the request locale by `notificationTextFor`; `params` and
  `userId` are **not** returned. `listNotifications(userId, limit = 20, locale)` → `{ notifications,
  unreadCount }`; on any read failure it answers `{ notifications: [], unreadCount: 0 }` (logged as a warning,
  no HTTP error).
- Type strings: the 8 values of `NOTIFICATION_TYPES` plus `"broadcast"` (written by `actions/developer.ts`).

**Canonical** — three layers, three names:

| Layer | Name | Declared | Notes |
|---|---|---|---|
| Stored row (mock store) | `Notification` | `09` §1.2 | has `userId`, Russian snapshot `title` / `body`, `params` |
| Wire item | `NotificationItem` (+ `NotificationsResponse`) | `90-addendum-2` A.2.17, owner `01` §6.4 | rendered `title` / `body`, `params`, `href`, `target: NavTarget \| null`, `readAt`, `createdAt`; no `userId` |
| Type string | `NotificationType` | block S3 | fields stay typed `NotificationType \| string` in the row and `string` on the wire: an unknown type renders stored `title` / `body` as is |

- **CORRECTION to `01-shell-auth.md` §2**: `AppNotification` and `NotificationsPayload` are retired in favour
  of `NotificationItem` / `NotificationsResponse`; `NotificationType` and `NotificationParamsByType` move to
  the catalogue (`NotificationParamsByType` is the typed view of `NotificationParams` and equals the
  `params` column of the table in `09` §1.4).
- **CORRECTION to `09-data-i18n-math.md` §1.2**: `Notification.type: NotificationType | string` references a
  type that `09` never declares — it is now block S3.
- **CORRECTION to `09-data-i18n-math.md` Appendix C**: `NotificationDto` is retired (already stated by
  `90-addendum-2`); **Appendix B** keeps `StudentNotification[]` only as the name of the *site* type in the
  "Site source" description.

### 3.10 `ComposeBoardTopic` — `conditionsLoaded` / `conditionLatex` required (`04`) vs optional (`05`)

**[CODE]** (`components/teacher-lesson-compose-board.tsx`, `components/teacher-homework-assign-board.tsx`,
`components/use-topic-conditions.ts`, the three pages, `app/api/teacher/topics/conditions/route.ts`)

- The component prop types declare both fields optional: `conditionsLoaded?: boolean` on the topic,
  `conditionLatex?: string | null` on each number (`ComposeBoardTopic`; `AssignBoardTopic` is the same with
  `deadlineAt: string | null` instead of `inLesson: boolean`).
- What the pages actually send:

| Page | `conditionsLoaded` | `conditionLatex` |
|---|---|---|
| `/teacher/students/{studentId}/lessons/new` | `topic.id === topics[0]?.id` (boolean on **every** topic) | every number has the key; statements are queried for the first topic only, so it is the statement (or `null`) in the first topic and `null` in all others |
| `/teacher/students/{studentId}/assign` | same | same |
| `/teacher/lessons/new?studentId=` | **absent** (`undefined`) | every number has the key, filled from a query over the **whole bank** |

- The hook decides by the flag only: `needsFetch = topicId && !topic.conditionsLoaded && !cache[topicId]`;
  the statement of a number is `topic.conditionsLoaded ? (number.conditionLatex ?? null) :
  (cache[topicId]?.[number.id] ?? null)`. Therefore on `/teacher/lessons/new?studentId=` the statements that
  the page ships are **never read** — every topic, including the first, is fetched from
  `GET /api/teacher/topics/conditions?topicId=` when it is selected.
- Fetch failure is silent (`.catch(() => {})`): the grid stays usable without statements. The route:
  TEACHER / DEVELOPER, rate limit `api:topic-conditions` 120 / 60 s, empty `topicId` → `200 { conditions: {} }`,
  response `{ conditions: Record<homeworkNumberId, string | null> }`, no owner scoping (the bank is shared).
- When the statements query of the page fails (`.catch(() => [])`, e.g. column missing), the first topic
  still has `conditionsLoaded: true` and every `conditionLatex` is `null` — the hook then does not fetch.

**Canonical [DECISION]** — wire types have **both fields required** (the shape of `04` §2.4, the behaviour of
`90-addendum-2` A.2.7):

```ts
type ComposeBoardTopic = {
  id: string; title: string; totalNumbers: number;
  conditionsLoaded: boolean;             // true ⇒ conditionLatex below is authoritative (may be null); false ⇒ fetch
  numbers: Array<{
    id: string;                          // homeworkNumberId
    number: string;                      // digits, leading zeros significant
    status: HomeworkNumberStatus | null; // this student's status
    inLesson: boolean;                   // the number is in ANY lesson set of this student
    conditionLatex: string | null;       // always null when conditionsLoaded is false
  }>;
};
type AssignBoardTopic = Omit<ComposeBoardTopic, "numbers"> & {
  numbers: Array<Omit<ComposeBoardTopic["numbers"][number], "inLesson"> & { deadlineAt: IsoDateTime | null }>;
};
```

- **CORRECTION to `05-teacher-lessons-plans.md` §2**: `ComposeBoardTopic.conditionsLoaded?: boolean` and
  `numbers[].conditionLatex?: string | null` are **required** on the wire (`boolean`, `string | null`). The
  optional markers describe the site's React prop type, not a response. `ComposeBoardTopic` is declared once,
  in `05` §2 (owner of `GET /teacher/lessons/new-form`); `04` §2.4 imports it and keeps `AssignBoardTopic`.
- **CORRECTION to `90-addendum-2` A.2.7** ("the `/lessons/new` page ships the statements of the whole
  bank"): it ships them, but the client ignores them because that page does not set `conditionsLoaded`;
  the effective behaviour of both site pages is "statements of a topic are fetched on selection", and on the
  student-card page the first topic is pre-loaded. The canonical rule of A.2.7 (first topic pre-loaded) is
  unchanged.

Rules: (C1) the server sets `conditionsLoaded = true` on exactly the first topic of `composeTopics` /
assign topics and `false` on the rest; (C2) the client reads `conditionLatex` only when the flag is `true`,
otherwise calls `GET /topics/{topicId}/conditions` once per topic per screen visit and caches the record
until the screen is left; (C3) a failed statements request is not an error state — numbers stay selectable;
(C4) `conditionsLoaded: true` with `conditionLatex: null` means "no statement", not "not loaded".

### 3.11 Path-parameter notation — `:id` (`06`) vs `{id}` (all others)

**[CODE]** The site's dynamic segments (folders under `app/**`) are `[assignmentId]`, `[fileId]`,
`[groupId]`, `[itemId]`, `[lessonId]`, `[number]`, `[participantId]`, `[planId]`, `[studentId]`, `[topicId]`.
The colon syntax appears in the code only as Next.js path patterns — the rewrite and header rules of
`next.config.ts` (`/developer/:path*` → `/teacher/:path*`, `/:path*`) and the `matcher` of `middleware.ts`
(`/dashboard/:path*`, `/student/:path*`, `/teacher/:path*`, `/developer/:path*`) — which `06` §0 and `07` §0
quote correctly.

**Canonical [DECISION]**

- **N1.** Endpoint paths are written with braces: `{camelCaseName}`.
- **N2.** The name is the site's segment name whenever the entity has one (list above). Mobile-only
  parameters follow the same pattern with the entity's id field name: `{homeworkNumberId}`, `{photoId}`,
  `{teacherId}`, `{notificationId}`.
- **N3.** `{id}` and abbreviations (`{pid}`, `{sid}`, `{nid}`) are not used in endpoint lists
  (`{id}` is acceptable only in prose such as "`/files/{id}`" where the entity is obvious). A homework draft
  is `{planId}`, never `{lessonId}`, although both are `Lesson` rows.
- **N4.** `:name` is reserved for quotations of Next.js rewrite / route patterns.

**CORRECTION to `06-teacher-groups-calls-stats.md` §6.1–§6.4** — the eleven lines written with colons read:

```
GET    /teacher/groups/{groupId}
PATCH  /teacher/groups/{groupId}
DELETE /teacher/groups/{groupId}
POST   /teacher/groups/{groupId}/members
DELETE /teacher/groups/{groupId}/members/{studentId}
PATCH  /teacher/students/{studentId}/ai-profile
GET    /teacher/groups/{groupId}/statistics
GET    /teacher/groups/{groupId}/attendance?period=year|30d|7d
PATCH  /teacher/lessons/{lessonId}/participants/{participantId}/attendance
GET    /teacher/groups/{groupId}/attendance.pdf?period=7d|30d|year
GET    /teacher/parent-calls/students/{studentId}/history?limit=100&before=<callId>
```

Methods, bodies and responses of those lines are unchanged (error codes: `90-addendum-1` A.10; attendance:
`90-addendum-2` A.2.18). The remaining abbreviations to expand when the specs are next edited:
`05` §6 `{pid}` → `{participantId}`; `90-addendum-2` A.1 row 8 `{sid}` / `{nid}` → `{studentId}` /
`{homeworkNumberId}` (that row is a superseded path anyway).

### 3.12 Student check / lesson DTOs (`03`) vs the entity shapes that `09` says endpoints "must use"

**[CODE]** No site route returns a stored row to a student. Every student route returns a projection;
what each one sends and what it leaves out:

| Site response (STUDENT) | Fields sent | Table columns **not** selected / not sent |
|---|---|---|
| `GET /api/student/homework-checks?assignmentId=` → `{ check }` (`null` when none, or when the table is missing) | `id`, `status`, `error` (raw text, any status), `checkedAt` (ISO \| `null`), `results[]` = `{ number, verdict, recognizedAnswer, comment }` through `toStudentFacingResults(…, locale)`: sorted by `compareHomeworkNumbers`; for `UNCERTAIN` → `recognizedAnswer = null`, `comment = dict.student.uncertainComment` | `assignmentId`, `activeSlot`, `modelUsed`, `createdAt`; per result `homeworkNumberId`, `confidence`, `copySuspected`, `copyReason`, `errorKind`, `errorNote`, `injectionSuspected`, `injectionNote` |
| `POST /api/student/homework-checks` | `{ ok: true, checkId }` | — |
| `GET /api/student/lesson-submissions?lessonId=` → `{ submissions }` (latest per item) | `id`, `itemId`, `status`, `verdict` / `recognizedAnswer` / `comment` **only when `status === DONE` and a verdict exists** (same `UNCERTAIN` rule), `error` **only when `status === FAILED`**, `submittedAt`, `checkedAt` | `activeSlot`, `confidence`, `errorKind`, `errorNote`, `injectionSuspected`, `injectionNote`, `modelUsed`, photos |
| `getStudentLiveLesson` (page data) | lesson: `lessonId`, `participantId`, `title`, `startsAt`, `durationMinutes`, `groupName`, `joinedAt`; item: `id`, `order`, `isExtra`, `result`, `homeworkNumberId`, `number`, `conditionLatex`, `topicId`, `topicTitle`, `submission` | item `reason`, `minutes`, `comment`, `forReview`; participant `attendance`, `speed`, `planSummary`, `planError`; `answerLatex`; submission diagnostics and photos |
| `POST /api/student/homework-submissions` | `{ ok: true, photos: [{ id, fileId }] }` | — |

The raw `error` text does reach the student's browser on the site; it is never **displayed**: both student
components show `humanizeSolutionCheckError(error, dict.student.checkErrors)` and only when
`status === "FAILED"` (`components/student-homework-check.tsx`, `components/student-lesson-view.tsx`).
The classifier has 7 ordered classes (`interrupted`, `disabled`, `timeout`, `quota`, `unavailable`, `queue`,
`image`; first matching regex wins) and the dictionary key `fallback` for an empty or unmatched text.

**Canonical [DECISION]**

- **CORRECTION to `09-data-i18n-math.md` Appendix C** (last paragraph: "Domain DTOs returned by the other
  endpoints (specs 02–07) must use the entity shapes of 1.2 …"): the entity interfaces of `09` §1.2 are the
  shapes of the **rows of the mock store** (and of the future database). Endpoint DTOs are **projections**
  declared by the owner spec and built under the rules P1–P7 below; they are not required to be entity
  shapes, and for a student they never are.

Projection rules (apply to every spec, not only `03`):

- **P1 — same name, same type.** A DTO field that carries a column keeps the column's name and type from
  `09` §1.1 / §1.2 (`status: SolutionCheckStatus`, `verdict: SolutionVerdict | null`,
  `result: LessonItemResult | null`, `checkedAt: IsoDateTime | null`).
- **P2 — dates.** `Date` columns are `IsoDateTime` (item 3).
- **P3 — role visibility.** A field marked "never" for the caller's role in `09` §1.5 is **absent from the
  DTO type** (not present-and-null). On the site the homework reader is shared by both roles
  (`getStudentHomeworks` returns the type of the teacher reader, called with a STUDENT viewer), which is why
  `03` §2.1 lists `answerLatex: null` and the teacher-only check fields in the *site* shape; the mobile DTOs
  of `02` §6 and `03` §6 do not have those fields at all.
- **P4 — joins.** A joined column may be inlined under the joined column's name: `number`, `topicId`,
  `topicTitle`, `originalName`, `studentName`, `groupName`.
- **P5 — computed fields.** Allowed when the owner spec gives the formula from the code: `endsAt`, `closed`,
  `canSubmit` (`03` §4.7), `orderInTopic`, `attentionRank` (`03` §4.1), `solvedCount`, `solvedPercent`.
- **P6 — replaced fields.** The only replacement in the student contract: raw `error` → `errorCode:
  CheckErrorCode | null` (`03` §6, kept by `90-addendum-1` A.5). `errorCode` is non-null **iff**
  `status === "FAILED"`. The server (and the mock) computes it with the ordered classes of
  `humanizeSolutionCheckError`; an empty or unmatched text → `"unknown"`. The app maps the code to
  `dict.student.checkErrors[code]`, with `"unknown"` → `dict.student.checkErrors.fallback`.
- **P7 — additions.** A DTO may add a column the site route does not send when the mobile UI needs it and
  the visibility matrix allows it. In `03` these are `StudentCheckDto.createdAt` and
  `results[].homeworkNumberId` (the site check response has neither) — both stay.

Field-by-field status of the two DTO families of `03` §6 under these rules:

| `03` DTO field | Entity field (`09` §1.2) | Rule | Verdict |
|---|---|---|---|
| `StudentCheckDto.id`, `.status`, `.checkedAt` | `HomeworkCheck.id`, `.status`, `.checkedAt` | P1, P2 | conforms |
| `StudentCheckDto.createdAt` | `HomeworkCheck.createdAt` | P7 | conforms (mobile addition) |
| `StudentCheckDto.errorCode` | `HomeworkCheck.error` | P6 | conforms; value `"unknown"` ↔ key `fallback` |
| `StudentCheckDto.results[].number` | `TopicHomeworkNumber.number` | P4 | conforms |
| `…results[].homeworkNumberId`, `.verdict`, `.recognizedAnswer`, `.comment` | `HomeworkCheckResult.*` | P1, P7 + the `UNCERTAIN` rule of `09` §1.5 | conforms |
| — | `HomeworkCheck.assignmentId`, `.activeSlot`, `.modelUsed`; result `.confidence`, `.copy*`, `.errorKind`, `.errorNote`, `.injection*` | P3 | correctly absent |
| `LessonItemDto.id`, `.order`, `.isExtra`, `.result`, `.homeworkNumberId` | `LessonAssignmentItem.*` | P1 | conforms |
| `LessonItemDto.number`, `.topicId`, `.topicTitle`, `.conditionLatex` | joined `TopicHomeworkNumber` / `Topic` | P4 | conforms |
| `LessonItemDto.closed`, `.canSubmit` | — | P5 | conforms |
| `LessonItemDto.submission` → `LessonSubmissionDto.id`, `.itemId`, `.status`, `.verdict`, `.comment`, `.submittedAt`, `.checkedAt` | `LessonItemSubmission.*` | P1, P2 | conforms; `verdict` / `comment` non-null only for `DONE` |
| `LessonSubmissionDto.errorCode` | `LessonItemSubmission.error` | P6 | conforms |
| — | `LessonItemSubmission.recognizedAnswer` | — | site sends it for `DONE`, the lesson screen never renders it; `03` drops it — allowed |
| — | item `reason`, `minutes`, `comment`, `forReview`; submission diagnostics, `modelUsed`, photos | P3 | correctly absent |
| `HomeworkPhotoDto` | `HomeworkSubmissionPhoto` + `StoredFile` | P4 | replaced by `AttachedPhoto` (item 8) |
| `ActiveLessonDto` / `UpcomingLessonDto` | `Lesson` + `LessonParticipant.joinedAt` | P1, P4, P5 | conform; they deliberately carry **no** `status` (`active` ⇔ derived `ACTIVE`, `upcoming` ⇔ derived `PLANNED`, item 4) |

- **CORRECTION to `03-student-homework-lesson.md` §2.1 / §2.2**: `StudentCheckSnapshot.error` and
  `LessonSubmissionSnapshot.error` ("raw server text") describe the **site** payloads; the mobile DTOs of
  `03` §6 (`errorCode`) are the contract, and the raw text is not sent to a student on mobile.
- Naming: the suffix `Dto` (`03`) and the suffixes `Response` / `Model` / `Item` (other specs) are all
  acceptable for projections; entity names of `09` §1.2 (`HomeworkCheck`, `LessonItemSubmission`,
  `Notification`, `StoredFile`, …) are **reserved for stored rows** and must not be reused for a projection.

---

## 4. Screens affected

No new screens. The shared types above are consumed on (ScreenIds of `90-addendum-2` B.4):

| Type | Screens |
|---|---|
| `InterfacePreferences`, `ResolvedTheme` | `shell.settings` (Interface block); `auth.login` (compact RU / EN switch); every screen through the theme and the `<Hint>` wrapper |
| `NavSection`, `ScreenId` | the three root navigators |
| `DerivedLessonStatus` | `planner.lessons`, `planner.lessonBoard`, `teacher.student.lessons`, `groups.detail` (lessons block); `student.lesson` (poll result) |
| `AttendanceLessonStatus`, `AttendanceStatus` | `groups.detail` (attendance table) |
| `LessonStatus` (stored) | `stats.main` → "by teacher" → recent lessons |
| `PlanErrorRaw` | `planner.lessonBoard`, `planner.draftBoard`, `teacher.student.lessons`, list counters of `planner.lessons` / `planner.drafts` |
| `ComposeBoardTopic` / `AssignBoardTopic` | `planner.lessonNew` (student mode, manual composition) / `teacher.student.assign` |
| `StoredFileRef`, `FileRef` | `student.theory`, `content.topic`, `content.topicEdit`, `shared.fileViewer` |
| `AttachedPhoto`, `PhotoRef` | `student.homework`, `teacher.student.review` |
| `NotificationItem` | `shell.notifications` |
| `CheckErrorCode` | `student.homework` (check block), `student.lesson` (item card) |

---

## 5. Operations affected (types only — methods, limits and error codes are unchanged)

| Operation (owner) | Change made by this addendum | Limits / errors (unchanged, for reference) |
|---|---|---|
| `PreferencesStore.*` (`08` §14, `01` §4.9) | field `themeMode`; validation on load; no server call | none |
| `GET /notifications`, `POST /notifications/read` (`01` §6.4) | item type name `NotificationItem` | `90-addendum-2` A.2.17 |
| `GET /teacher/lessons`, `GET /teacher/lessons/{lessonId}`, `GET /teacher/students/{studentId}/lessons`, `GET /teacher/groups/{groupId}` | `status: DerivedLessonStatus` | owner specs `05` §6, `04` §6.5, `06` §6.1 |
| `GET /teacher/groups/{groupId}/attendance` (`06` §6.3) | lesson `status: AttendanceLessonStatus`, cell `attendance: AttendanceStatus` | `06` §6.3 |
| `GET /developer/statistics/teachers` (`06` §6.5) | `recentLessons[].status: LessonStatus` (stored) — the only response with the stored value | DEVELOPER only |
| `GET /student/lessons/{lessonId}/state` (`03` §6.2) | `status: DerivedLessonStatus` | `03` §6.6 as regenerated by `90-addendum-1` A.7 |
| `POST /teacher/lessons`, `POST /teacher/homework-plans` (`05` §6) | the body has **no** `outputLocale`; the server stores the request locale in `planParams` | title ≤ 200, note ≤ 500, duration 15..240, daily minutes 15..240 (`05` §0.3) |
| `GET /teacher/lessons/{lessonId}/status`, `GET /teacher/homework-plans/{planId}/status` (`05` §6) | `planError: PlanErrorRaw`; `LessonPlanStatus` declared once | poll 2000 ms on the boards (`05` §5), 2500 ms on the student card's Lessons tab (`04` §5); `404 lessonNotFound` |
| `GET /teacher/lessons/new-form?studentId=` (`05` §6), assign data of `04` | `ComposeBoardTopic` / `AssignBoardTopic` with required fields | `404 studentNotFound` |
| `GET /topics/{topicId}/conditions` (`07` §6.1) | unchanged; its use is rule C2 | 120 / 60 s; empty `topicId` → `{ conditions: {} }` |
| `POST /uploads` (`07` §6.5) | `201 { file: StoredFileRef }` | DEVELOPER; 60 / 10 min; `fileRequired`, `upload*`, `uploadFailed` |
| `GET /student/theory` (`02` §6.4) | `theoryFile: StoredFileRef` | `02` §6 |
| `GET /student/homeworks/{assignmentId}`, `POST …/photos`, `GET …/checks/latest` (`03` §6.1) | `photos: AttachedPhoto[]`; check `errorCode: CheckErrorCode \| null` | photo limit `maxPhotosPerAssignment` (default 10), 15 MiB, PNG / JPG |

---

## 6. Business rules for the mock (consolidated)

1. **One types module.** The mock, the screens and the future `HttpApiClient` import shared types from the
   catalogue; a feature folder that needs a different shape declares a projection with a different name.
2. **Store vs wire.** The in-memory store holds entity rows (`09` §1.2). Every mock endpoint builds its DTO
   from rows with the same projection function the real server would use (P1–P7); a row is never returned
   as is.
3. **Lesson status.** Stored `Lesson.status` changes only through: finalisation → `FINISHED`; rescheduling a
   finalized lesson without submissions to a time at which it is no longer finished → `PLANNED`. Derived status is computed on every
   read (L2). The statistics endpoint is the only one that returns the stored value (L1). Fixtures to keep:
   a lesson running now with stored `PLANNED`; a past lesson not yet finalized (stored `PLANNED`, derived
   `FINISHED`); a finalized one (stored `FINISHED`); an unscheduled one (`startsAt: null`, stored `PLANNED`).
4. **Plan params.** PP1–PP4 (3.6).
5. **Plan errors.** PE1–PE3 (3.7).
6. **Compose grid.** C1–C4 (3.10).
7. **Files.** F1–F4 (3.8).
8. **Preferences.** Stored per device, validated on load, defaults `ru` / `system` / `off`; logout does not
   clear them (3.1).
9. **Check errors.** `errorCode` computed from the stored raw `error` with the ordered classifier; raw text
   stays in the store for the teacher / developer projections (`04` §2.3 `TeacherHomeworkCheck.error`).

---

## 7. Proposed mobile API endpoints — deltas **[PROPOSAL]**

No endpoint is added or removed by this addendum. Type-level deltas only (paths relative to
`/api/mobile/v1`):

```ts
// 02 §6.4
// GET /student/theory                          → { topics: Array<{ id; title; description; theoryFile: StoredFileRef }> }

// 03 §6.1 / §6.2
// GET /student/homeworks/{assignmentId}        → assignment.photos: AttachedPhoto[]; latestCheck.errorCode: CheckErrorCode | null
// POST /student/homeworks/{assignmentId}/photos → { photos: AttachedPhoto[]; photosCount: number }
// GET /student/homeworks/{assignmentId}/checks/latest → { check; photos: AttachedPhoto[]; numbers; solvedCount }
// GET /student/lessons/{lessonId}/state        → { serverNow: IsoDateTime; status: DerivedLessonStatus; items: […] }

// 04 §6.5 / 05 §6
// GET /teacher/students/{studentId}/lessons    → { lessons: TeacherStudentLesson[] }   // status: DerivedLessonStatus; planError: PlanErrorRaw
// GET /teacher/lessons                         → { lessons: LessonListItem[]; serverNow: IsoDateTime }   // status: DerivedLessonStatus
// GET /teacher/lessons/{lessonId}              → LessonBoardModel & { serverNow: IsoDateTime }   // status: DerivedLessonStatus; participants[].planError: PlanErrorRaw
// GET /teacher/lessons/{lessonId}/status       → LessonPlanStatus              // declared in 05 only
// GET /teacher/homework-plans/{planId}/status  → HomeworkPlanStatus
// GET /teacher/lessons/new-form?studentId=     → LessonNewFormModel            // composeTopics: ComposeBoardTopic[] (required fields)

// 06 §6.1 / §6.3 / §6.5  (paths with braces, 3.11)
// GET /teacher/groups/{groupId}                → lessons.recent[].status: DerivedLessonStatus
// GET /teacher/groups/{groupId}/attendance     → lessons[].status: AttendanceLessonStatus; participants[].attendance: AttendanceStatus
// PATCH /teacher/lessons/{lessonId}/participants/{participantId}/attendance
//                                              body { attendance: AttendanceStatus } → { ok: true; attendance: AttendanceStatus }
// GET /developer/statistics/teachers            → teachers[].recentLessons[].status: LessonStatus   // STORED

// 07 §6.5
// POST /uploads                                → 201 { file: StoredFileRef }

// 01 §6.4 (unchanged wire, one name)
// GET /notifications                           → NotificationsResponse = { notifications: NotificationItem[]; unreadCount: number }
```

Typed client interfaces after this addendum (deltas to `90-addendum-2` A.3):

```ts
uploadFile(file, opts?): Promise<StoredFileRef>;                                  // ContentApi (was UploadedFile)
getLessonStatus(lessonId: string): Promise<LessonPlanStatus>;                     // TeacherPlannerApi only (04 §6.8 already delegates it to the lessons client)
setAttendance(lessonId, participantId, attendance: AttendanceStatus): Promise<{ attendance: AttendanceStatus }>;  // unchanged
interface PreferencesStore {
  load(): Promise<InterfacePreferences>;                                          // validated, defaults applied
  setThemeMode(mode: ThemeMode): Promise<void>;
  setHints(hints: HintsMode): Promise<void>;
  setLocale(locale: Locale): Promise<{ ok: true; locale: Locale } | { ok: false }>;
}
```

---

## 8. Open questions

1. **Stored status in the statistics (3.4).** The DEVELOPER card "by teacher" shows the stored
   `Lesson.status`, so a running lesson reads «запланировано» and a past lesson stays «запланировано» until
   it is finalized lazily. Keep site parity (this addendum's default, rule L1), or show the derived status
   there on mobile? Switching needs `finishedAt` and `durationMinutes` in `TeacherLessonEntry`, which the
   site query does not select.
2. **Live OS theme following (3.1).** The site follows an OS scheme change only on the settings page; the
   proposal is to follow it everywhere on mobile. Confirm.
3. **`errorCode` value `"unknown"` (3.12, P6).** `03` and `90-addendum-1` use `"unknown"`; the dictionary key
   and the site classifier's default are `fallback`. Keep the one-entry mapping, or rename the wire value to
   `"fallback"` so that `dict.student.checkErrors[errorCode]` is a direct lookup?
4. **`createdAt` of a student check (3.12, P7).** The site's student response does not include
   `HomeworkCheck.createdAt`; `03` adds it. Confirm that showing the check start time to a student is wanted
   (the site shows `checkedAt` only).
