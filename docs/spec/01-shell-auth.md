# 01 — App shell, auth, navigation, account/settings, notifications, realtime

Subsystem spec for the native mobile rewrite (Expo / React Native, TypeScript) of "ШБЗ Школа".
Everything below is taken from the site code (paths in parentheses are relative to the web repo root).
Where the document proposes something that does not exist on the site it is marked **[PROPOSAL]**.

Source files read: `app/layout.tsx`, `app/page.tsx`, `app/not-found.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/error.tsx`,
`app/(auth)/loading.tsx`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/error.tsx|loading.tsx|not-found.tsx`,
`app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/student/layout.tsx|loading.tsx`, `app/(dashboard)/teacher/layout.tsx|loading.tsx`,
`app/(dashboard)/student/settings|account/page.tsx`, `app/(dashboard)/teacher/settings|account/page.tsx`, `middleware.ts`, `next.config.ts`,
`lib/auth.ts`, `lib/password.ts`, `lib/password-policy.ts`, `lib/rate-limit.ts`, `lib/persistent-rate-limit.ts`, `lib/api-rate-limit.ts`,
`actions/auth.ts`, `actions/profile.ts`, `actions/locale.ts`, `actions/account.ts`, `components/dashboard-nav.tsx`, `login-form.tsx`,
`account-settings-view.tsx`, `interface-settings-panel.tsx`, `locale-switch.tsx`, `logo.tsx`, `student-notifications-bell.tsx`,
`dashboard-realtime-listener.tsx`, `student-streak-provider.tsx`, `student-weekly-activity.tsx`, `use-streak-motion.ts`,
`app-state-shells.tsx`, `shbz-number-search.tsx`, `shbz-page-header.tsx`, `copy-value.tsx`, `app/api/notifications/route.ts`,
`app/api/student/notifications/route.ts`, `app/api/realtime/route.ts`, `app/api/student/streak/route.ts`,
`app/api/student/homeworks/find-number/route.ts`, `app/api/teacher/topics/find-number/route.ts`, `lib/dashboard-realtime.ts`,
`lib/notifications.ts`, `lib/notification-text.ts`, `lib/developer-alerts.ts`, `lib/parent-calls.ts`, `lib/parent-call-state.ts`,
`lib/student-streak.ts`, `lib/student-streak-colors.ts`, `lib/student-streak-realtime.ts`, `lib/student-notifications-realtime.ts`,
`lib/platform-data.ts` (`getProgressTimeline`), `lib/week-buckets.ts`, `lib/utils.ts`, `lib/i18n/*`, `lib/i18n/dictionaries/ru.ts|en.ts|records.ts|student.ts|api-common.ts|api-student.ts|api-content.ts`,
`prisma/schema.prisma` (User, Session, Notification, RateLimitBucket), `app/globals.css` (tokens).

---

## 0. Global facts the whole app depends on

| Fact | Value | Source |
|---|---|---|
| Brand name (never translated) | `ШБЗ Школа`; logo is text: `ШБЗ` (ink colour) + `Школа` (brand gradient), no space, Montserrat weight 900, letter-spacing -0.015em | `components/logo.tsx`, `app/globals.css` |
| Font | Montserrat (latin + cyrillic, variable, all weights) for everything | `app/layout.tsx` |
| Roles | `UserRole = "TEACHER" \| "STUDENT" \| "DEVELOPER"` | `prisma/schema.prisma` |
| Role labels | `dict.roles.STUDENT` = «Ученик» / "Student"; `dict.roles.TEACHER` = «Преподаватель» / "Teacher"; `dict.roles.DEVELOPER` = «Разработчик» / "Developer" | `dictionaries/ru.ts`, `en.ts` |
| Locales | `LOCALES = ["ru", "en"]`, default `ru`; Intl tags: `ru` → `ru-RU`, `en` → `en-GB` (en-GB spelling) | `lib/i18n/locale.ts` |
| Time zone | The server assumes `TZ="Europe/Moscow"`. "Today", streak days, parent-call day counts and notification clock times are all Moscow-based | `CLAUDE.md`, `lib/platform-data.ts`, `student-notifications-bell.tsx` |
| Role home | `roleHome(TEACHER)` = `/teacher`; `roleHome(DEVELOPER)` = `/developer/topics`; `roleHome(STUDENT)` = `/student` | `lib/utils.ts` |
| Role settings path | `/teacher/settings`, `/developer/settings`, `/student/settings` | `lib/utils.ts` `roleSettingsPath` |
| Developer URLs | `/developer/*` is a rewrite onto the same pages as `/teacher/*`. Middleware redirects a DEVELOPER on `/teacher/*` to `/developer/*` and a non-developer on `/developer/*` to `/teacher/*` (UX only, driven by the non-secret `tutor_role` cookie) | `next.config.ts`, `middleware.ts` |
| Limits | `MAX_LOGIN_LENGTH = 254`, `MAX_USER_NAME_LENGTH = 120`, `MAX_PASSWORD_LENGTH = 256`, min password length 8 | `lib/utils.ts`, `lib/password-policy.ts` |
| Seed accounts (use as mock users) | `teacher@example.com` / `teacher123`; `ilya@example.com` and `maria@example.com` / `student123`. No developer is seeded — the mock must invent one (e.g. `dev@example.com`) **[PROPOSAL]** | `CLAUDE.md` |

String helpers the mobile app must re-implement identically (`lib/i18n/format.ts`):

```ts
// "{name}" placeholders; unknown placeholders stay as-is.
function format(template: string, params: Record<string, string | number>): string;

// Russian: 3 forms (1 / 2-4 / 5+ with the 11-14 exception); English: 2 forms (1 / other).
// Each form contains "{n}" which is replaced by count.
function plural(locale: "ru" | "en", count: number, forms: readonly string[]): string;
```

Russian rule: `n = |trunc(count)|`; `mod10 === 1 && mod100 !== 11` → form 0; `mod10 in 2..4 && (mod100 < 12 || mod100 > 14)` → form 1; else form 2 (fallback form 1). English: `n === 1` → form 0 else form 1.

Text normalisation (`lib/utils.ts`):

```ts
// control chars (U+0000–U+001F, U+007F) → space, collapse whitespace runs to one space, trim
normalizeSingleLineText(value: string): string;
// = normalizeSingleLineText(value).toLowerCase()
normalizeLoginInput(value: string): string;
```

---

## 1. Screens

### 1.1 Launch / root redirect

- **Site routes:** `/` (`app/page.tsx`), `/dashboard` (`app/(dashboard)/dashboard/page.tsx`).
- **Roles:** any.
- **Behaviour:** `/` resolves the current user (`tryGetCurrentUser`, errors are swallowed → treated as logged out). Logged in → redirect to `roleHome(role)`; otherwise → `/login`. `/dashboard` does the same but through `requireUser()` (no session → `/login`).
- **Middleware presence check:** any path under `/dashboard`, `/student`, `/teacher`, `/developer` without a `tutor_session` cookie → redirect `/login`. Real role checks are in `requireUser(role)`: wrong role → redirect to that user's `roleHome`.
- **Phone:** a splash/bootstrap screen. On app start read the stored token, call "get current user" (§6 `GET /me`); success → mount the navigator for `user.role`; 401 or no token → Login. No visible UI besides the logo/spinner.

### 1.2 Login

- **Site route:** `/login` (`app/(auth)/login/page.tsx` + `components/login-form.tsx`). `dynamic = "force-dynamic"`.
- **Roles:** unauthenticated only. An authenticated visitor is redirected to `roleHome(role)`.
- **Purpose:** sign in with login + password. There is **no** self-registration, **no** "forgot password", **no** "remember me" on the site. Accounts are created by a teacher/developer; a forgotten password is reset by the teacher (own students) or the developer.

**Layout top-to-bottom (site, full-height centred column, page background `--shbz-page-bg` + soft green radial glow at top):**

1. Top-left: `Logo` size 26 (not a link).
2. Top-right: compact language switch — a two-segment control `RU` | `EN` (`LocaleSwitch variant="compact"`). Works before login (language is a device setting, see §1.5.1).
3. Centred block, max width 416 px:
   - Title row: `dict.login.title` («Вход» / "Sign in") followed by a small round accent dot (9×9 px, brand gradient). Font 26–30 px, weight 800.
   - Subtitle: `dict.login.subtitle` («Войдите в личный кабинет платформы» / "Sign in to your personal account"). This is a **hint** element: hidden when hints mode is `off` (default), see §1.5.1.
   - Card (`shbz-card`, radius 16, padding 30) with the form, vertical gap 18:
     - Label `dict.login.loginLabel` («Логин» / "Login") + text input: `name="login"`, `inputMode="email"`, placeholder literal `teacher@example.com`, `autoComplete="username"`, no auto-capitalise, no auto-correct, no spellcheck, `maxLength = 254`, required.
     - Label `dict.login.passwordLabel` («Пароль» / "Password") + password input: placeholder `dict.login.passwordPlaceholder` («Введите пароль» / "Enter your password"), `autoComplete="current-password"`, `maxLength = 256`, required. Inside the field on the right: a text toggle button `dict.login.showPassword` («Показать» / "Show") ⇄ `dict.login.hidePassword` («Скрыть» / "Hide") (aria: `showPasswordAria` «Показать пароль» / "Show password", `hidePasswordAria` «Скрыть пароль» / "Hide password") switching the input between masked and plain text.
     - Error notice (only when there is an error; red soft box, radius 12, `aria-live="polite"`): text per §3.1 error table.
     - Submit button, full width, height 54 px, brand gradient (`#5ac8ea → #36e0a4`), white label: `dict.login.submit` («Войти» / "Sign in"). While the request is pending the button is disabled and shows `dict.login.submitting` («Входим…» / "Signing in…") — double taps must not burn rate-limit attempts.
   - Help line below the card, only when the site setting `loginHelpContact` is non-empty: `dict.login.help` («Не получается войти? Напишите преподавателю:» / "Can't sign in? Contact your teacher:") followed by the contact in semi-bold. `loginHelpContact` is a free-text string (max 200 chars, env default `LOGIN_HELP_CONTACT`, editable in the dev panel).

**States:**

- Loading (route loading): `AuthLoadingState` — a skeleton card mimicking logo square, two labelled fields and a button.
- Route error (`app/(auth)/error.tsx`): error shell (§1.6) with title `dict.shells.loginErrorTitle` («Не удалось открыть вход» / "Could not open the sign-in page"), description `dict.shells.loginErrorDescription` («Страница входа временно недоступна. Попробуйте повторить загрузку или вернуться на главную.» / "The sign-in page is temporarily unavailable. Try reloading or go back to the home page."), buttons `dict.common.retry` («Попробовать снова» / "Try again") and `dict.common.home` («На главную» / "Home").
- Form errors: see §3.1. On the site the error arrives as `?error=<code>[&min=<minutes>]` after a redirect and the form is re-rendered empty (login and password are **not** preserved). **[PROPOSAL]** on mobile keep the login field filled, clear only the password.

**Phone translation:** a single full-screen form, keyboard-avoiding, language switch pinned top-right, logo top-left (or centred above the title). Use `textContentType="username"` / `"password"`, `autoCapitalize="none"`, `autoCorrect={false}`, `keyboardType="email-address"`. After success replace the auth stack with the role navigator (no back gesture to Login).

### 1.3 App shell (authenticated chrome)

- **Site:** `app/(dashboard)/layout.tsx` wraps every authenticated page: `StudentStreakProvider` (streak context, students only) → `DashboardRealtimeListener` (SSE) → `DashboardNav` (sticky top bar) → `<main>` (max width 1180). `student/layout.tsx` and `teacher/layout.tsx` add nothing.
- **Roles:** all three. The layout calls `requireUser()` (no session → `/login`). For STUDENT it also loads the streak snapshot (`getStudentStreakSnapshot(user.id)`) and seeds the streak context; for other roles the context value is `null`.

**Top bar content (`components/dashboard-nav.tsx`):**

1. `Logo` size 24 — a link to `roleHome(role)`.
2. Section tab bar (desktop ≥ 768 px): a pill container (background `--shbz-green-soft`, radius 12, padding 6, gap 4) with **text-only** tabs (14 px, weight 600, padding 9×18, radius 12). The active tab has a solid pill `--shbz-tab-active-bg` (black in light theme / near-white in dark) with `--shbz-tab-active-text`; the pill slides between tabs (animation). No tab is highlighted on pages outside the tab bar (settings, number pages for students).
3. Right cluster (desktop):
   - TEACHER / DEVELOPER only: avatar circle 42 px (brand diagonal gradient, white initials 14 px/800) + name (14 px bold) + role label (12 px, soft colour). Hidden at ≥ 1280 px to keep the tab bar centred. **STUDENT has no avatar/name in the desktop header** (owner decision).
   - Notifications bell (§1.4). STUDENT uses endpoint `/api/student/notifications`; TEACHER and DEVELOPER use `/api/notifications`.
   - Settings gear: circle button 40 px, 1.5 px outline, gear icon 18 px; `aria-label = dict.nav.settings` («Настройки» / "Settings"); highlighted (`data-active`) when the settings page is open. Links to the role's settings page.
   - Logout button (outline, 44 px high): `dict.nav.logout` («Выйти» / "Log out"). Submits `logoutAction` immediately — **no confirmation dialog**.
4. Phone layout (< 768 px): logo left; right: bell, gear, hamburger button (40 px circle, `aria-label = dict.nav.menu` «Меню» / "Menu"; icon switches to a cross when open). Tapping the hamburger opens a dropdown sheet under the bar with a dimmed blurred backdrop (tap backdrop / Escape / route change closes it):
   - vertical list of the same section tabs (same order, active one highlighted), `aria-label = dict.nav.sections` («Разделы» / "Sections");
   - divider, then a row: avatar initials + name + role label + Logout button. On phones this row is shown for **all** roles including STUDENT.

Initials rule (`initialsOf`): split the trimmed name on whitespace, take the first character of the first two words, upper-case, join; empty name → `"?"`.

**Navigation tree per role** (`buildNavItems`). Labels are lower-case on the site. The site has **no icons for sections**; the only icons in the shell are the gear, the bell and the hamburger/cross. Icon column below is a **[PROPOSAL]** for the mobile tab bar.

STUDENT — 7 items (the last one is rendered as the gear, not as a tab):

| # | Site route | Label key | RU | EN | Active when | Icon [PROPOSAL] |
|---|---|---|---|---|---|---|
| 1 | `/student` | `dict.nav.student.overview` | обзор | overview | path is exactly `/student` | home |
| 2 | `/student/lesson` | `dict.nav.student.lesson` | урок | lesson | path starts with `/student/lesson` | presentation / play-circle |
| 3 | `/student/homeworks` | `dict.nav.student.homeworks` | дз | homework | starts with `/student/homeworks` (list and `/student/homeworks/[assignmentId]`) | clipboard-list |
| 4 | `/student/deadlines` | `dict.nav.student.deadlines` | дедлайны | deadlines | starts with `/student/deadlines` | calendar |
| 5 | `/student/theory` | `dict.nav.student.theory` | теория | theory | starts with `/student/theory` | book-open |
| 6 | `/student/info` | `dict.nav.student.info` | общая инфа | info | starts with `/student/info` | info-circle |
| 7 | `/student/settings` | `dict.nav.student.settings` (gear `aria-label` uses `dict.nav.settings`) | настройки | settings | starts with `/student/settings` | gear |

Student routes outside the tab bar: `/student/numbers/[number]` (reached from number search; no tab highlighted), `/student/account` (legacy → redirects to `/student/settings` keeping the query string). All student pages are guarded with `requireUser(STUDENT)` (the `/student/info` page relies only on the layout's `requireUser()`).

TEACHER — 7 items (last one is the gear):

| # | Site route | Label key | RU | EN | Active when | Icon [PROPOSAL] |
|---|---|---|---|---|---|---|
| 1 | `/teacher` | `dict.nav.teacher.overview` | обзор | overview | path is exactly `/teacher` | home |
| 2 | `/teacher/topics` | `dict.nav.teacher.topics` | темы | topics | starts with `/teacher/topics` | layers / book |
| 3 | `/teacher/students` | `dict.nav.teacher.students` | ученики | students | starts with `/teacher/students` | users |
| 4 | `/teacher/groups` | `dict.nav.teacher.groups` | группы | groups | starts with `/teacher/groups` | users-group |
| 5 | `/teacher/lessons` | `dict.nav.teacher.lessons` | занятия | lessons | starts with `/teacher/lessons` **or** `/teacher/homework-plans` (`isPlannerPath`) | calendar-check |
| 6 | `/teacher/calls` | `dict.nav.teacher.calls` | звонки | calls | starts with `/teacher/calls` | phone |
| 7 | `/teacher/settings` | `dict.nav.teacher.settings` | настройки | settings | starts with `/teacher/settings` | gear |

DEVELOPER — 6 items (last one is the gear). Home is **topics**, there is no "overview":

| # | Site route | Label key | RU | EN | Active when | Icon [PROPOSAL] |
|---|---|---|---|---|---|---|
| 1 | `/developer/topics` | `dict.nav.developer.topics` | темы | topics | starts with `/developer/topics` | layers / book |
| 2 | `/developer/accounts` | `dict.nav.developer.accounts` | аккаунты | accounts | starts with `/developer/accounts` | id-card |
| 3 | `/developer/calls` | `dict.nav.developer.calls` | звонки | calls | starts with `/developer/calls` | phone |
| 4 | `/developer/statistics` | `dict.nav.developer.statistics` | статистика | statistics | starts with `/developer/statistics` | bar-chart |
| 5 | `/developer/panel` | `dict.nav.developer.panel` | дев-панель | dev panel | starts with `/developer/panel` (also `/developer/panel/journal`) | sliders / terminal |
| 6 | `/developer/settings` | `dict.nav.developer.settings` | настройки | settings | starts with `/developer/settings` | gear |

Page-level role guards that affect what each role can actually open (from `requireUser(...)` in every page):

| Page (site path under `/teacher`, developer sees it as `/developer/...`) | TEACHER | DEVELOPER |
|---|---|---|
| `/teacher` (overview) | yes | no → redirected to `/developer/topics` |
| `/teacher/topics`, `/teacher/topics/[topicId]`, `/teacher/topics/[topicId]/numbers/[number]` | yes (read-only) | yes (content management) |
| `/teacher/topics/[topicId]/edit` | no | yes |
| `/teacher/students`, `/teacher/students/[studentId]` (+ `/assign`, `/lessons`, `/lessons/new`) | yes | no → redirected to `/developer/topics` |
| `/teacher/groups`, `/teacher/groups/[groupId]` | yes | allowed by guard, but **not in the developer nav** |
| `/teacher/lessons`, `/lessons/new`, `/lessons/[lessonId]`, `/teacher/homework-plans`, `/homework-plans/new`, `/homework-plans/[planId]` | yes | allowed by guard, **not in the developer nav** |
| `/teacher/calls` | yes (own students, can write) | yes (all students, read-only) |
| `/teacher/accounts` | no | yes |
| `/teacher/statistics` | no | yes |
| `/teacher/panel`, `/teacher/panel/journal` | no | yes |
| `/teacher/settings` | yes | yes |

**Phone translation [PROPOSAL]:**

- Three separate navigators chosen by `user.role` after login; never mix role trees.
- Top app bar on every root screen mirrors the site's phone header: logo (left), bell with unread badge, gear (right). Logout + profile row (avatar initials, name, role label) move into the Settings screen (bottom) instead of a hamburger menu.
- Bottom tab bar replaces the hamburger list. Developer has exactly 5 sections → 5 tabs in site order. Student and teacher have 6 sections each; iOS/Android comfortably fit 5. Default proposal: Student — `обзор`, `урок`, `дз`, `дедлайны`, `теория` as tabs and `общая инфа` as a card/row reachable from Overview and from Settings; Teacher — `обзор`, `ученики`, `занятия`, `звонки`, `ещё` where "ещё/more" lists `темы`, `группы`, settings. This is an open question (§7.1) — the order within the bar must stay the site order.
- Tab labels: keep the dictionary strings; capitalise the first letter for native tab labels if design wants (site shows them lower-case).
- Settings is a pushed screen from the gear, not a tab (same as the site).

### 1.4 Notifications (bell + panel)

- **Site:** `components/student-notifications-bell.tsx` (used for all roles despite the name). No dedicated page; it is a dropdown panel anchored to the bell.
- **Roles:** all. STUDENT → `GET/POST /api/student/notifications`; TEACHER, DEVELOPER → `GET/POST /api/notifications`.

**Bell button:** 40 px circle, 1.5 px outline, bell icon 18 px. Badge (top-right, red `--shbz-danger-solid`, white 10.5 px/800 text) shows `unreadCount`, or `9+` when `unreadCount > 9`; hidden when 0. The badge "pops" (260 ms) when the count grows. `aria-label`: `dict.student.notifications.aria` («Уведомления» / "Notifications") or, when unread > 0, `dict.student.notifications.ariaUnread` («Уведомления: {count} непрочитанных» / "Notifications: {count} unread").

**Panel (site: fixed dropdown, width `min(340, viewport − 16)`, radius 16, max list height 380 px, scrollable):**

1. Header row: title `dict.student.notifications.title` («Уведомления» / "Notifications"); on the right, only when `unreadCount > 0`, a text button `dict.student.notifications.markAllRead` («Прочитать все» / "Mark all as read").
2. List (max 20 newest items, newest first). Each row is a button:
   - left dot 8 px: accent colour when unread (`readAt === null`), transparent when read;
   - title (13.5 px; weight 800 when unread, 600 when read);
   - body (12.5 px, muted) — only when `body` is non-null;
   - time (11.5 px, semi-bold, kicker colour) formatted by `formatNotificationTime` (§4.6).
3. Rows that arrived through the live channel while the panel/tab is visible get a temporary highlight (1400 ms). First load and manual refresh do not highlight.

**Interactions:**

- Tap bell → toggle the panel. Every time it opens the list is re-fetched.
- Tap a row → close the panel; if the row was unread: optimistic local update (`unreadCount − 1`, `readAt = now`) and `POST {notificationId}`; then, if `href` is non-null, navigate to it. Notifications with `href === null` (developer broadcasts) only get marked read.
- Tap "mark all as read" → optimistic local update (`unreadCount = 0`, all `readAt = now`), `POST {}`.
- Tap outside / Escape → close.
- Network failures are silent everywhere (previous data stays; mark-read failures are ignored).

**States:** before the first response — skeleton of 3 rows (dot + two text lines + short time line). Empty list — centred text `dict.student.notifications.empty` («Уведомлений нет» / "No notifications"). A non-OK HTTP response is ignored (list unchanged; if it was the first load the skeleton stays).

**Deep-link mapping (web `href` → mobile target).** These are all `href` values the code produces:

| Notification `type` | `href` on the site | Mobile target |
|---|---|---|
| `homework-assigned` | `/student/homeworks` | Student → Homework list |
| `homework-checked` | `/student/homeworks/{assignmentId}` | Student → Homework detail `{assignmentId}` |
| `parent_call_due` | `/teacher/calls?studentId={studentId}` | Teacher → Calls, focused/expanded on `{studentId}` |
| `dev_errors` | `/developer/panel/journal?outcome=failed&days=1` | Developer → Panel → Journal with filters outcome=failed, days=1 |
| `dev_ai_budget_warn`, `dev_ai_budget_out` | `/developer/panel` | Developer → Panel |
| `dev_stale_checks`, `dev_storage` | `/developer/panel?tab=actions` | Developer → Panel → tab "actions" |
| `broadcast` | `null` | none (mark read only) |

**Phone translation:** bell in the top app bar with the same badge rule; tapping opens a bottom sheet (or a pushed "Notifications" screen) with the same header, list, skeleton and empty state. Pull-to-refresh may be added **[PROPOSAL]**.

### 1.5 Settings (account + interface)

- **Site routes:** `/student/settings` (guard `STUDENT`), `/teacher/settings` (guard `TEACHER` or `DEVELOPER`; the developer sees it as `/developer/settings`). `/student/account` and `/teacher/account` are legacy redirects to the corresponding settings page, preserving string query params.
- **Component:** `components/account-settings-view.tsx` (same view for all roles) + `components/interface-settings-panel.tsx`.
- **Purpose:** device interface preferences, edit own name, change own password, read-only profile facts.

**Layout top-to-bottom:**

1. Page header (`ShbzPageHeader`): kicker `dict.settings.kicker` («Профиль и интерфейс» / "Profile and interface"), title `dict.settings.title` («Настройки» / "Settings") followed by the accent dot. Aside: the **number search** field (§1.5.4) — on phones it is full-width under the title.
2. Result notice (only after a save attempt; green success box or red error box, `aria-live="polite"`). Text = `dict.settings.notices[key]`, see table in §3.3 / §3.4.
3. Section **Interface** — title `dict.interface.title` («Интерфейс» / "Interface"); a card with three blocks (§1.5.1). Each block: upper-case kicker label, segmented control, hint line (a `ui-hint`, hidden when hints are off).
4. Section **Personal information** — title `dict.settings.personalInfo` («Личная информация» / "Personal information"); card with a form:
   - `dict.settings.name` («Имя» / "Name") — text input, prefilled with the current name, placeholder `dict.settings.namePlaceholder` («Ваше имя» / "Your name"), required, `maxLength = 120`, `autoComplete="name"`.
   - `dict.settings.loginLabel` («Логин для входа» / "Sign-in login") — **read-only** field showing `user.email`; the whole row is a copy-to-clipboard target with a copy icon. On tap: copies the value, a small pill `dict.topics.widgets.copy.copied` («Скопировано» / "Copied") appears; tooltip `dict.topics.widgets.copy.title` («Нажмите, чтобы скопировать» / "Click to copy"); screen-reader text `dict.topics.widgets.copy.copiedAria` with `{label} = dict.settings.loginCopyLabel` («Логин» / "Login") → «Логин скопирован» / "Login copied". The login cannot be changed by the user.
   - Button `dict.common.save` («Сохранить» / "Save") + hint `dict.settings.nameHint` («Имя в шапке обновится сразу.» / "The name in the header updates right away.") (`ui-hint`).
5. Section **Change password** — title `dict.settings.changePassword` («Сменить пароль» / "Change password"); card with a form of three password inputs (all required, `maxLength = 256`, no spellcheck, **no show/hide toggle on this form**):
   - `dict.settings.currentPassword` («Текущий пароль» / "Current password"), placeholder `currentPasswordPlaceholder` («Введите текущий пароль» / "Enter your current password"), `autoComplete="current-password"`.
   - `dict.settings.newPassword` («Новый пароль» / "New password"), placeholder `newPasswordPlaceholder` («От 8 символов, буквы и цифры» / "8+ characters, letters and digits"), `minLength = 8`, `autoComplete="new-password"`.
   - `dict.settings.repeatPassword` («Повторите новый пароль» / "Repeat the new password"), placeholder `repeatPasswordPlaceholder` (same text), `minLength = 8`, `autoComplete="new-password"`.
   - Button `dict.settings.updatePassword` («Обновить пароль» / "Update password") + hint `dict.settings.passwordHint` («Сессии на других устройствах завершатся, текущая будет безопасно обновлена.» / "Sessions on other devices will be signed out; this one will be safely refreshed.") (`ui-hint`).
6. Section **Profile status** — title `dict.settings.profileStatus` («Статус профиля» / "Profile status"); card with two read-only tiles:
   - `dict.settings.role` («Роль» / "Role") → `dict.roles[user.role]`.
   - `dict.settings.onPlatform` («На платформе» / "Member since") → `formatDate(user.createdAt, locale)` = `Intl.DateTimeFormat(intlLocale, { day: "2-digit", month: "long", year: "numeric" })` (e.g. ru «05 сентября 2026 г.», en "05 September 2026").

There is no account deletion, no email change, no avatar upload, no notification preferences on the site.

**States:** the page is server-rendered; while navigating the section skeleton is shown (§1.6). After a form post the page reloads with a notice; the forms are reset to server values (password fields always empty).

**Phone translation:** a scrollable settings screen pushed from the gear. Sections become grouped cards. **[PROPOSAL]** add at the very top a profile row (avatar initials, name, role label) and at the very bottom a destructive-looking `dict.nav.logout` button — on the site these live in the hamburger menu. Notices become inline banners or toasts; show field-level validation before sending (client pre-validation must match §3.3/§3.4). "Change password" may be a separate pushed screen/bottom sheet. Number search stays at the top of the screen or moves to a global search action — see §1.5.4.

#### 1.5.1 Interface block (device-level preferences)

All three are **per-device** preferences, not stored on the account and not sent to the server (except the language cookie which the server reads to render text).

| Setting | Label key (RU / EN) | Options (value → label RU / EN) | Default | Storage on site | Hint key (RU / EN) |
|---|---|---|---|---|---|
| Language | `dict.interface.language.label` («Язык» / "Language") | `ru` → `dict.interface.language.ru` «Русский» (same in both dictionaries); `en` → `dict.interface.language.en` "English" | `ru` | cookie `shbz-lang`, `path=/`, `sameSite=lax`, max-age 365 days (`setLocaleAction`) | `dict.interface.language.hint` («Язык интерфейса кабинета. Применяется сразу на всех страницах.» / "Interface language. Applies immediately on every page.") |
| Theme | `dict.interface.theme.label` («Тема» / "Theme") | `system` → `dict.interface.theme.system` «Системная» / "System" (short label for screens < 360 px: `systemShort` «Авто» / "System"); `light` → «Светлая» / "Light"; `dark` → «Тёмная» / "Dark" | `system` | `localStorage["shbz-theme"]` (legacy fallback key `tutorflow-theme`) | `dict.interface.theme.hint` («Светлое, тёмное или системное оформление интерфейса.» / "Light, dark or system appearance.") |
| Hints | `dict.interface.hints.label` («Подсказки» / "Hints") | `on` → `dict.interface.hints.on` «Включены» / "Shown"; `off` → `dict.interface.hints.off` «Скрыты» / "Hidden" | `off` | `localStorage["shbz-hints"]` (legacy fallback `tutorflow-hints`) | `dict.interface.hints.hint` («Пояснения к настройкам под каждым блоком.» / "Explanations under each settings block.") |

Rules:

- Theme resolution: `system` → follow the OS colour scheme and react live to OS changes; otherwise the fixed value. Any stored value other than `light`/`dark`/`system` is treated as `system`.
- Hints: only the exact string `on` enables hints; anything else is `off`. When off, every element marked as a hint (`.ui-hint`) is not rendered. Hint elements inside this subsystem: login subtitle; the three interface-block hint lines; `settings.nameHint`; `settings.passwordHint`; the streak "next goal" hint line (`weekly.goalHint`). Other subsystems have their own hint elements — the mobile app needs a global `hintsEnabled` flag and a `<Hint>` wrapper.
- Language switch: on change the segmented control highlights the new option immediately, is disabled while the request is in flight, and the whole UI re-renders in the new language. Invalid value → `{ ok: false }`, selection reverts. Changing language requires no account and is logged only as `settings.locale.changed`.
- Order of blocks on the site: Language, Theme, Hints.

**Phone:** store all three in device storage (AsyncStorage/MMKV). **[PROPOSAL]** initial language: site default is `ru` regardless of device language — keep `ru` unless product decides to follow device locale (§7).

#### 1.5.2 Theme tokens (for the mobile theme object)

Core tokens actually used by the shell screens (`app/globals.css`):

| Token | Light | Dark |
|---|---|---|
| `page-bg` | `#ffffff` | `#0b0c0e` |
| `text-strong` | `#0a0a0a` | `#f5f6f7` |
| `text-muted` | `#6a6e75` | `#9ba0a6` |
| `text-soft` | `#8b8f96` | `#85898f` |
| `label` | `#2c2e33` | `#c9ccd1` |
| `kicker` | `#63676d` | `#7c8087` |
| `card-bg` | `#ffffff` | `#131417` |
| `card-border` | `#ececee` | `#26282c` |
| `soft-bg` | `#f8f9fa` | `#1a1c1f` |
| `soft-border` | `#f0f0f1` | `#26282c` |
| `panel-bg` | `#fbfbfc` | `#17181b` |
| `row-border` | `#f4f4f5` | `#222428` |
| `header-border` | `#efefef` | `#222428` |
| `input-bg` | `#ffffff` | `#0f1012` |
| `input-border` | `#e4e5e7` | `#2c2e33` |
| `placeholder` | `#6d7076` | `#6a6e75` |
| `outline-border` | `#e4e5e7` | `#34373c` |
| `outline-hover` | `#0a0a0a` | `#f5f6f7` |
| `tab-text` | `#14161a` | `#d6d8db` |
| `tab-active-bg` | `#0a0a0a` | `#f5f6f7` |
| `tab-active-text` | `#ffffff` | `#0a0a0a` |
| `tab-hover` | `#f2f3f4` | `#24262a` |
| `accent-solid` | `#16b07e` | `#36e0a4` |
| `accent-grad` (primary button, logo "Школа") | `linear-gradient(90deg, #5ac8ea 0%, #36e0a4 100%)` | same |
| `accent-grad-diag` (avatar) | `linear-gradient(135deg, #5ac8ea, #36e0a4)` | same |
| `green-soft` / `green-text` | `#eaf7ef` / `#127a4c` | `rgba(27,158,99,0.16)` / `#59d49d` |
| `yellow-soft` / `yellow-text` | `#fef4e3` / `#8a5d05` | `rgba(201,138,30,0.16)` / `#e8b45c` |
| `red-soft` / `red-text` | `#fceded` / `#b3202c` | `rgba(214,69,80,0.16)` / `#ff8f94` |
| `danger-bg` / `danger-border` / `danger-text` (error notice) | `#fceded` / `#f3c7c9` / `#b3202c` | `rgba(229,72,77,0.12)` / `rgba(229,72,77,0.35)` / `#ff8f94` |
| `danger-solid` (badge) | `#e5484d` | `#ff6b70` |
| `seg-bg` / `seg-active-bg` / `seg-text` (segmented control) | `#ecedef` / `#ffffff` / `#6a6e75` | `#222428` / `#0f1012` / `#9ba0a6` |
| `week-cell` / `week-dot-off` (streak week strip) | `#f1f2f4` / `#d7d9dd` | `#222428` / `#3a3d42` |
| `streak-text` / `streak-flame` (starter tier) | `#b5701a` / `#f2922e` | `#e8a35c` / `#f2922e` |
| `streak-bg` (starter tier) | `linear-gradient(135deg, #fff3e4, #ffe9d2)` | `linear-gradient(135deg, rgba(242,146,46,0.18), rgba(242,146,46,0.08))` |
| `streak-border` (starter tier) | `#fbdfbe` | `rgba(242,146,46,0.35)` |
| `streak-pill-bg` | `rgba(255,255,255,0.7)` | `rgba(0,0,0,0.25)` |
| logo ink (`ШБЗ`) | `#0a0a0a` | `#ffffff` |
| brand flat / brand deep | `#16c79f` / `#0e9b80` | same |

Geometry: card radius 16; inputs height 52, radius 12, border 1.5, font 16; buttons height 44 (login submit 54), radius 12, font 14/600; icon circles 40; avatar 42. Focused input gets a gradient border (accent gradient) instead of a ring.

#### 1.5.3 Result notices (site mechanism)

Server actions redirect back to the settings page with a query flag; `resolveAccountNotice` maps it (first match wins in this order): `infoUpdated=1` → `infoUpdated`; `infoError=invalid` → `infoInvalid`; `infoError=save` → `infoSave`; `passwordUpdated=1` → `passwordUpdated`; `passwordError=invalid|mismatch|current|rateLimited|save` → `passwordInvalid|passwordMismatch|passwordCurrent|passwordRateLimited|passwordSave`. Tones: `infoUpdated`, `passwordUpdated` → success; all others → error. The mobile API should return these keys as error codes (§6).

#### 1.5.4 Number search (appears in the header of Settings and of most section pages)

`components/shbz-number-search.tsx`. A search field with a magnifier icon; digits only (non-digits are stripped while typing; `inputMode="numeric"`, `enterKeyHint="search"`); a coloured arrow submit button appears once something is typed.

- Placeholder `dict.numberSearch.placeholder` («Найти номер» / "Find a problem"); while searching the placeholder is `dict.numberSearch.searching` («Ищем номер…» / "Searching…") and the field is disabled. `aria-label` = `dict.numberSearch.aria` («Найти номер и открыть тему» / "Find a problem number and open its topic"); submit `aria-label` = `dict.numberSearch.submit` («Найти» / "Find").
- Client validation: value must match `^\d+$` and must not be all zeros, otherwise show `dict.numberSearch.invalid` («Введите корректный номер.» / "Enter a valid problem number.") in red under the field. The number is sent **as typed** (leading zeros are significant in display; the server matches by the normalised form, i.e. leading zeros stripped).
- Endpoint: STUDENT → `GET /api/student/homeworks/find-number?number=…`; TEACHER/DEVELOPER → `GET /api/teacher/topics/find-number?number=…` (§3.9).
- Success → navigate to `result.href`. Failure → show `result.error` from the server, or `dict.numberSearch.notFound` («Не удалось найти тему по этому номеру.» / "No topic found for this problem number.") when there is no error text / network failure.

**Phone:** a search bar under the screen title, numeric keyboard with a "search" return key; navigate to the number detail screen of the respective role.

### 1.6 State shells (loading / error / not found)

`components/app-state-shells.tsx`, `app/(dashboard)/error.tsx|loading.tsx|not-found.tsx`, `app/not-found.tsx`.

- **Section loading** (`DashboardSectionLoadingState`, used while any student/teacher page loads): a row of 4 skeleton tiles (height 160), then two skeleton blocks (220 and 340 high). Optional variant with a row of 4 pill skeletons (section tabs) above. **Dashboard loading** (`DashboardLoadingState`): skeleton header (logo square + two lines, profile card) + the section skeleton.
- **Auth loading** (`AuthLoadingState`): skeleton of the login card.
- **Route error** (`RouteErrorState`): centred card with a red "!" square, title, description, two buttons — primary `retryLabel` (re-runs the failed load) and secondary home link. Dashboard copy: `dict.shells.errorTitle` («Раздел временно недоступен» / "This section is temporarily unavailable"), `dict.shells.errorDescription` («Во время загрузки кабинета что-то пошло не так. Попробуйте повторить запрос или вернуться на главную страницу.» / "Something went wrong while loading your account. Try again or go back to the home page."), buttons `dict.common.retry` («Попробовать снова» / "Try again"), `dict.common.home` («На главную» / "Home"; goes to `/`, i.e. role home).
- **Not found:** big muted `404`, title `dict.shells.notFoundTitle` («Страница не найдена» / "Page not found"), description `dict.shells.notFoundDescription` («Возможно, эта страница была удалена или вы перешли по неверной ссылке.» / "This page may have been removed, or the link you followed is wrong."), button `dict.common.home`.

**Phone:** reusable `<ScreenSkeleton>`, `<ErrorState onRetry onHome>`, `<NotFoundState>` components with the same copy. "Home" = reset to the role's first tab.

### 1.7 Streak widget (data owned by the shell; rendered on the student overview)

`components/student-weekly-activity.tsx` — rendered on `/student` but fed by the shell-level `StudentStreakProvider`. STUDENT only.

Section title `dict.student.weekly.title` («Огонёк и ритм» / "Streak and rhythm"). Card with two columns (stack vertically on a phone):

Left column:

1. **Streak hero** tile (background/border/text colours depend on the colour tier, §4.5):
   - kicker `dict.student.weekly.flame` («Огонёк» / "Streak");
   - flame pill on the right: flame icon + `format(dict.student.weekly.daysShort, { n: currentStreak })` («{n} дн.» / "{n} d");
   - headline (26 px/800): when `currentStreak > 0` → `format(weekly.streakHeadline, { days: plural(locale, currentStreak, weekly.dayForms) })` («{days} подряд» / "{days} in a row", `dayForms` = [«{n} день», «{n} дня», «{n} дней»] / ["{n} day", "{n} days"]); when 0 → `weekly.igniteFirst` («Зажгите первый день» / "Light up your first day").
2. Two small tiles:
   - `weekly.todayDone` («Сегодня сделано» / "Done today") → `solvedToday > 0` ? `plural(locale, solvedToday, weekly.solvedForms)` ([«{n} номер», «{n} номера», «{n} номеров»] / ["{n} problem", "{n} problems"]) : `weekly.noSolvedToday` («Без закрытых номеров» / "No problems closed").
   - `weekly.nextGoal` («Следующая цель» / "Next goal") → when a next colour threshold exists: `format(weekly.daysToGo, { days: plural(locale, daysToNextThreshold, weekly.dayForms) })` («Ещё {days}» / "{days} to go"), plus hint line (`ui-hint`) `format(weekly.goalHint, { days: plural(locale, nextThreshold, weekly.dayForms) })` («до нового цвета огонька ({days})» / "until the next flame colour ({days})"); when there is no next threshold → `weekly.maxColor` («Максимальный цвет» / "Top colour reached") and no hint.

Right column — week strip:

- kicker `weekly.week` («За неделю» / "This week"); summary `format(weekly.weekSummary, { solved: plural(locale, solvedThisWeek, weekly.solvedForms) })` («{solved} закрыто за последние 7 дней.» / "{solved} closed in the last 7 days.").
- 7 cells, oldest → newest (the last one is today): each cell is a rounded box (height 64) with a mark at the bottom — an accent **bar** (20×8) when `count > 0`, a grey **dot** (8×8) when 0 — and the weekday label below. Today's cell has an accent inset outline and its label is accent-coloured and underlined.
- The weekday label is computed on the client from the date (`dict.student.weekdaysShort[getDayOfWeekIndex(date)]`, Monday-first: [«Пн»,«Вт»,«Ср»,«Чт»,«Пт»,«Сб»,«Вс»] / ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]) — **not** from `dayLabel` in the payload.
- Accessibility label per cell: active → `format(weekly.dayActiveAria, { day, count })` («{day}: закрыто номеров — {count}» / "{day}: problems closed — {count}"); empty → `format(weekly.dayEmptyAria, { day })` («{day}: нет закрытых номеров» / "{day}: no problems closed").

Animation (`use-streak-motion.ts`): when `currentStreak` changes — `0 → >0` = `"ignite"`, increased = `"grow"`, decreased = `"drop"`; the state is applied for 900 ms to the hero and the flame pill, then cleared.

---

## 2. View models

```ts
type UserRole = "TEACHER" | "STUDENT" | "DEVELOPER";
type Locale = "ru" | "en";
type ThemeMode = "system" | "light" | "dark";
type HintsMode = "on" | "off";

/** lib/auth.ts AuthenticatedUser (select: id, name, email, role, createdAt). */
type AuthenticatedUser = {
  id: string;          // cuid
  name: string;        // 1..120 chars, single line
  email: string;       // the LOGIN; lower-cased, unique, <= 254 chars; not necessarily a real e-mail
  role: UserRole;
  createdAt: string;   // ISO date-time (Date on the server)
};

/** Device-level preferences (never sent to the account). */
type InterfacePreferences = {
  locale: Locale;      // default "ru"
  theme: ThemeMode;    // default "system"
  hints: HintsMode;    // default "off"
};

/** Login screen. */
type LoginScreenModel = {
  helpContact: string;                 // SiteSetting loginHelpContact, "" = hide the help line; <= 200 chars
  error: LoginErrorCode | null;
  rateLimitedMinutes: number | null;   // 1..60, only with error "rateLimited"
};
type LoginErrorCode = "empty" | "invalid" | "database" | "rateLimited";

/** Navigation. */
type NavItemId =
  | "student.overview" | "student.lesson" | "student.homeworks" | "student.deadlines"
  | "student.theory" | "student.info" | "student.settings"
  | "teacher.overview" | "teacher.topics" | "teacher.students" | "teacher.groups"
  | "teacher.lessons" | "teacher.calls" | "teacher.settings"
  | "developer.topics" | "developer.accounts" | "developer.calls"
  | "developer.statistics" | "developer.panel" | "developer.settings";

type NavItem = {
  id: NavItemId;
  labelKey: string;       // e.g. "nav.student.overview"
  webPath: string;        // e.g. "/student"
  placement: "tab" | "gear";   // *.settings => "gear"
};

type ShellHeaderModel = {
  user: Pick<AuthenticatedUser, "name" | "email" | "role">;
  initials: string;       // initialsOf(name)
  roleLabel: string;      // dict.roles[role]
  homeTarget: NavItemId;  // student.overview | teacher.overview | developer.topics
  items: NavItem[];       // site order, see §1.3
  notificationsEndpoint: "/api/student/notifications" | "/api/notifications";
};

/** lib/notifications.ts StudentNotification — used for every role. */
type AppNotification = {
  id: string;
  type: NotificationType | string;   // unknown types must render title/body as-is
  title: string;                     // already rendered in the requested locale by the server
  body: string | null;
  href: string | null;               // site path, see mapping table §1.4
  readAt: string | null;             // ISO; null = unread
  createdAt: string;                 // ISO
};

type NotificationType =
  | "homework-assigned"
  | "homework-checked"
  | "parent_call_due"
  | "dev_errors"
  | "dev_ai_budget_warn"
  | "dev_ai_budget_out"
  | "dev_stale_checks"
  | "dev_storage"
  | "broadcast";            // developer free-text broadcast to students (no params)

type NotificationsPayload = {
  notifications: AppNotification[];  // newest first, max 20
  unreadCount: number;               // ALL unread of the user, not limited to the 20 returned
};

/** Stored params per type (Notification.params JSON; values are string | number | boolean | null). */
type NotificationParamsByType = {
  "homework-assigned": {
    variant: "assigned" | "deadline";
    topic: string | null;        // topic title; null -> fallback word "Тема"/"Topic"
    numbers: string;             // "12, 13, 051001" (comma + space separated, as recorded)
    count: number;               // number of problems
    deadlineAt: string;          // ISO
  };
  "homework-checked": { correct: number; incorrect: number; uncertain: number; applied: number };
  "parent_call_due": { state: "due" | "overdue"; name: string; days: number; hasReachedCall: boolean };
  "dev_errors": { count: number };
  "dev_ai_budget_warn": { used: number; limit: number };
  "dev_ai_budget_out": { used: number; limit: number };
  "dev_stale_checks": { count: number };
  "dev_storage": { gb: string };  // e.g. "1.3"
  "broadcast": null;              // title (<=120) / body (<=300, optional) are free text
};

/** lib/student-streak.ts StudentStreak. */
type StudentStreak = {
  currentStreak: number;        // 0..112 (see §4.4)
  bestStreak: number;           // longest run inside the 112-day window
  solvedToday: number;
  solvedThisWeek: number;       // sum over the last 7 calendar days incl. today
  activeDaysThisWeek: number;   // days with count > 0 among the last 7
  dailyActivity: Array<{
    date: string;               // "YYYY-MM-DD" (Moscow calendar day), oldest -> newest, length 7, last = today
    dayLabel: string;           // weekday short label in the request locale ("Пн" / "Mon"); UI recomputes it
    count: number;              // problems closed (GREEN or YELLOW) that day
  }>;
};

/** lib/progress-timeline.ts TimelineEntry — input of the streak. */
type TimelineEntry = { date: string; closedCount: number; redCount: number };

/** lib/student-streak-colors.ts */
type StudentStreakColorTier =
  | "starter" | "ember" | "amber" | "lime" | "emerald" | "cyan" | "blue" | "violet" | "rose" | "gold";

type StudentStreakColorMeta = {
  tier: StudentStreakColorTier;
  currentThreshold: number | null;     // null for "starter"
  nextThreshold: number | null;        // null when streak >= 1000
  daysToNextThreshold: number | null;  // nextThreshold - currentStreak
};

type StudentStreakMotionState = "ignite" | "grow" | "drop" | null;

/** lib/dashboard-realtime.ts — what arrives over SSE. */
type DashboardRealtimeEvent =
  | { kind: "connected"; occurredAt: string }                                           // first frame only
  | { kind: "students-changed"; occurredAt: string }
  | { kind: "topic-content-changed"; occurredAt: string; topicId?: string }
  | { kind: "student-progress-changed"; occurredAt: string; studentId: string; topicId?: string }
  | { kind: "student-deadlines-changed"; occurredAt: string; studentId: string; topicId?: string }
  | { kind: "lesson-activity"; occurredAt: string; lessonId: string; teacherId: string; studentId?: string };

/** Settings screen. */
type SettingsScreenModel = {
  user: Pick<AuthenticatedUser, "name" | "email" | "role" | "createdAt">;
  notice: AccountNotice | null;
  numberSearchEndpoint: "/api/student/homeworks/find-number" | "/api/teacher/topics/find-number";
};
type AccountNoticeKey =
  | "infoUpdated" | "infoInvalid" | "infoSave"
  | "passwordUpdated" | "passwordInvalid" | "passwordMismatch"
  | "passwordCurrent" | "passwordRateLimited" | "passwordSave";
type AccountNotice = { tone: "success" | "error"; key: AccountNoticeKey };

type PasswordProblem = "tooShort" | "tooLong" | "noLetter" | "noDigit" | "common";

/** Number search results. */
type StudentFindNumberResult = { href: string };                       // "/student/numbers/{number}"
type TeacherFindNumberResult = { topicId: string; topicTitle: string; number: string; href: string };
// href = "/teacher/topics/{topicId}/numbers/{number}"
```

Database rows behind these (for the mock store):

```ts
type SessionRow = { id: string; tokenHash: string; userId: string; expiresAt: Date; createdAt: Date };
type NotificationRow = {
  id: string; userId: string; type: string;
  title: string;            // Russian snapshot
  body: string | null;      // Russian snapshot
  href: string | null;
  params: Record<string, string | number | boolean | null> | null;
  readAt: Date | null; createdAt: Date;
};
```

---

## 3. Mutations and queries

General API conventions on the site: JSON route handlers return `{ error: string }` with a localized message (language from the `shbz-lang` cookie) on failure. Unauthenticated → `401 { error: dict.apiCommon.sessionExpired }` («Сессия истекла. Войдите заново.» / "Your session has expired. Please sign in again."). Generic API rate limit (`enforceApiRateLimit`, persistent/Postgres, fixed window per user): exceeded → `429 { error: dict.apiCommon.rateLimited }` («Слишком много запросов. Подождите немного и попробуйте снова.» / "Too many requests. Wait a moment and try again.") with header `Retry-After: <seconds>`; rate-limit store failure → `503 { error: dict.apiCommon.serviceUnavailable }` («Сервис временно недоступен. Попробуйте снова позже.» / "The service is temporarily unavailable. Try again later.") with `Retry-After: 5`.

### 3.1 `loginAction` (server action, `actions/auth.ts`)

- **Input (FormData):** `login` (fallback field name `email`), `password`.
- **Normalisation:** `login = normalizeLoginInput(login)` (single-line, trimmed, lower-case). Password is used verbatim (not trimmed).
- **Steps, in order:**
  1. Validation: `!login || !password || login.length > 254 || password.length > 256` → error `empty`. (No rate-limit slot is consumed.)
  2. In-memory sliding-window limits (per server process): scope `login:ip` — 25 attempts / 10 min per client IP; then scope `login:ip-login` — 8 attempts / 10 min per `IP:login`. A blocked attempt → error `rateLimited` with `min = max(1, ceil(retryAfterSeconds / 60))`, where `retryAfterSeconds = max(1, ceil(retryAfterMs / 1000))` and `retryAfterMs = windowMs − (now − oldestHitInWindow)`.
  3. Persistent fixed-window limit: scope `login:login` — 20 attempts / 15 min per login (window start = `floor(now / windowMs) * windowMs`; blocked when the incremented hit count is **greater than** 20; `retryAfterMs = windowEnd − now`). Blocked → `rateLimited` with minutes as above. If the limit store fails → error `database`.
  4. `signIn(login, password)`: look up user by `email = login`; unknown login still runs a dummy scrypt verification (constant time, no account enumeration); wrong password → `null`. DB failure → error `database`.
  5. `null` → error `invalid` (+ audit log `auth.login` outcome `failed`).
  6. Success: reset `login:ip-login` for this IP+login and the persistent `login:login` bucket (the `login:ip` bucket is **not** reset); create a `Session` row; set cookies; audit log `auth.login`; redirect to `roleHome(user.role)`.
- **Success payload:** none (redirect). `signIn` returns `AuthenticatedUser`.
- **Side effects of a successful sign-in:** all expired `Session` rows (any user) are deleted (best effort); a new session is created with `expiresAt = now + SESSION_TTL_DAYS` (default 30 days); cookies `tutor_session` (raw token) and `tutor_role` (role string) are set with `httpOnly`, `sameSite=lax`, `path=/`, `expires = expiresAt`, `secure` when the request came over https (`x-forwarded-proto`) or in production.
- **Error codes → text** (`dict.login.errors.*`, shown in the red notice):

| Code | RU | EN |
|---|---|---|
| `empty` | Введите логин и пароль. | Enter your login and password. |
| `invalid` | Неверный логин или пароль. | Wrong login or password. |
| `database` | Не удалось войти — что-то сломалось на нашей стороне. Попробуйте через минуту, а если не пройдёт — напишите преподавателю. | Could not sign you in — something broke on our side. Try again in a minute, and if it still fails, contact your teacher. |
| `rateLimited` (no minutes known) | Слишком много попыток входа. Подождите несколько минут и попробуйте снова. | Too many sign-in attempts. Wait a few minutes and try again. |
| `rateLimited` + minutes | `format(dict.login.rateLimitedFor, { minutes: plural(locale, m, dict.login.minuteForms) })` → «Слишком много попыток входа. Попробуйте снова через {minutes}.» with forms [«{n} минуту», «{n} минуты», «{n} минут»] | "Too many sign-in attempts. Try again in {minutes}." with forms ["{n} minute", "{n} minutes"] |

  The login page clamps the minutes value: must be finite and > 0, then `min(60, ceil(value))`. An unknown error code shows no text.

### 3.2 `logoutAction` (server action, `actions/auth.ts`)

- **Input:** none. No confirmation.
- **Effect:** deletes the `Session` row of the current token only (other devices stay signed in), clears `tutor_session` and `tutor_role` cookies, writes audit log `auth.logout`, redirects to `/login`.

### 3.3 `updateProfileInfoAction` (server action, `actions/profile.ts`)

- **Auth:** any signed-in role (`requireUser()`).
- **Input (FormData):** `name`.
- **Validation:** `name = normalizeSingleLineText(name)`; empty or longer than 120 → `infoError=invalid`.
- **Effect:** `User.name` updated. DB failure → `infoError=save`. Success → revalidates all platform caches and the role's pages → redirect `…/settings?infoUpdated=1`.
- **Side effects on other data:** the name is displayed in the header, on teacher/developer student lists, statistics, PDF reports etc.; parent-call notifications created earlier keep the old name snapshot in `params.name`.
- **Notices** (`dict.settings.notices.*`):

| Key | Tone | RU | EN |
|---|---|---|---|
| `infoUpdated` | success | Личная информация успешно обновлена. | Your personal information has been updated. |
| `infoInvalid` | error | Укажите имя для профиля. | Enter a name for your profile. |
| `infoSave` | error | Не удалось сохранить личную информацию. Повторите попытку. | Could not save your personal information. Please try again. |

### 3.4 `updatePasswordAction` (server action, `actions/profile.ts`)

- **Auth:** any signed-in role.
- **Input (FormData):** `currentPassword`, `newPassword`, `confirmPassword` (all used verbatim).
- **Validation and steps, in order:**
  1. `!currentPassword` OR any of the three longer than 256 OR `newPassword.trim().length < 8` OR `confirmPassword.trim().length < 8` → `passwordError=invalid`.
  2. `newPassword !== confirmPassword` → `passwordError=mismatch`.
  3. `validatePasswordStrength(newPassword) !== null` → `passwordError=invalid`. Strength rules (`lib/password-policy.ts`), evaluated on `normalized = password.trim()`: length < 8 → `tooShort`; `password.length > 256` → `tooLong`; no letter matching `/[a-zа-яё]/i` → `noLetter`; no digit `/\d/` → `noDigit`; `normalized.toLowerCase()` in the common list → `common`. Common list: `12345678`, `123456789`, `1234567890`, `password`, `password1`, `password123`, `qwerty123`, `qwertyui`, `11111111`, `00000000`, `1q2w3e4r`, `abc12345`, `1234qwer`, `qwer1234`, `iloveyou`, `football`.
  4. Persistent rate limit scope `profile:password-update`: 5 attempts / 15 min per user (fixed window; consumed only after steps 1–3 passed, so a wrong *current* password does burn a slot). Blocked → `passwordError=rateLimited`. Limit store failure → `passwordError=save`.
  5. Current password does not verify → `passwordError=current`.
  6. Hash and save; failure → `passwordError=save`.
  7. Success → `…/settings?passwordUpdated=1`.
- **Side effects on success (`updatePasswordAndRotateSession`, one transaction):** `User.passwordHash` updated; **all** sessions of the user deleted; one new session created (`expiresAt = now + 30 days`) and the `tutor_session` cookie replaced. Result: every other device is signed out; the current device stays signed in with a new token.
- **Notices** (`dict.settings.notices.*`):

| Key | Tone | RU | EN |
|---|---|---|---|
| `passwordUpdated` | success | Пароль успешно обновлен. | Your password has been updated. |
| `passwordInvalid` | error | Новый пароль: минимум 8 символов, обязательно буквы и цифры, без слишком простых комбинаций. | New password: at least 8 characters, must include letters and digits, and must not be too simple. |
| `passwordMismatch` | error | Новый пароль и подтверждение не совпадают. | The new password and its confirmation don't match. |
| `passwordCurrent` | error | Текущий пароль указан неверно. | The current password is incorrect. |
| `passwordRateLimited` | error | Слишком много попыток сменить пароль. Подождите 15 минут и попробуйте снова. | Too many password change attempts. Wait 15 minutes and try again. |
| `passwordSave` | error | Не удалось обновить пароль. Повторите попытку. | Could not update the password. Please try again. |

- Fine-grained problem texts exist for client-side pre-validation (`dict.passwordPolicy.*`, `{max}` = 256): `tooShort` «Пароль должен быть не короче 8 символов.» / "The password must be at least 8 characters long."; `tooLong` «Пароль не должен быть длиннее {max} символов.» / "The password must be at most {max} characters long."; `noLetter` «Пароль должен содержать хотя бы одну букву.» / "The password must contain at least one letter."; `noDigit` «Пароль должен содержать хотя бы одну цифру.» / "The password must contain at least one digit."; `common` «Этот пароль слишком распространён, выберите другой.» / "This password is too common — choose another one.". The settings page itself only shows the combined `passwordInvalid` notice; the mobile form may show the specific one **[PROPOSAL]**.

### 3.5 `setLocaleAction(value)` (server action, `actions/locale.ts`)

- **Auth:** none (works on the login page).
- **Input:** `value: string`. Not `"ru"`/`"en"` → `{ ok: false }`.
- **Effect:** sets cookie `shbz-lang` (1 year), revalidates the whole layout, logs `settings.locale.changed`. Returns `{ ok: true, locale }`. Nothing is written to the database.
- **Mobile:** purely local; the chosen locale must be sent with every API request so that server-rendered texts (API errors, notification title/body, streak `dayLabel`, AI-generated texts started by this user) come back in the right language.

### 3.6 Notifications — list

- **STUDENT:** `GET /api/student/notifications`. Auth: signed-in **and** role STUDENT, otherwise `401 sessionExpired`. Rate limit scope `api:notifications`: 60 requests / 60 s per user (shared between GET and POST).
- **TEACHER / DEVELOPER (any role):** `GET /api/notifications`. Auth: any signed-in user, otherwise `401 sessionExpired`. **No rate limit.** Side effects before listing:
  - role TEACHER → `ensureParentCallDueNotifications(user.id)` (lazy generation of parent-call reminders, §4.7; throttled in memory to one run per teacher per 60 s; failures are logged and ignored);
  - role DEVELOPER → `ensureDeveloperAlerts(user.id)` (lazy generation of service alerts, §4.8; throttled to one run per developer per 10 min; failures ignored).
- **Response 200:** `NotificationsPayload` = `{ notifications: AppNotification[], unreadCount: number }` — `listNotifications(userId, 20, locale)`: the 20 newest rows by `createdAt desc`; `unreadCount` counts all rows with `readAt = null`. `title`/`body` are rendered for the request locale from `type` + `params` (§4.6); rows without usable params are returned as stored (with the legacy-title translation rule). On any DB error the payload is `{ notifications: [], unreadCount: 0 }` (still 200). Responses ≥ 1024 bytes are brotli/gzip-compressed.

### 3.7 Notifications — mark read

- **STUDENT:** `POST /api/student/notifications`, body `{ notificationId?: string }` (only a string id is honoured). Same auth and rate limit as the GET. Response `{ ok: true }`.
- **Any role:** `POST /api/notifications`, body `{ notificationId?: string }`. Response `{ success: true }`.
- **Effect (`markNotificationsRead`):** sets `readAt = now` on the user's unread rows — only the given id when `notificationId` is present, otherwise **all** unread rows. Unknown id / already read → no-op, still success. Errors are swallowed (success response).
- There is no "delete notification" and no "mark unread".

### 3.8 Streak — `GET /api/student/streak`

- **Auth:** signed-in and role STUDENT, else `401 sessionExpired`.
- **Rate limit:** scope `api:streak`, 120 requests / 60 s per user.
- **Response 200:** `{ streak: StudentStreak }` computed by `computeStudentStreak(user.id, locale)` over the last 112 days (§4.4). `dayLabel` uses the request locale.
- The same snapshot is also embedded server-side into the shell on every full page render (`getStudentStreakSnapshot`).

### 3.9 Number search

- **STUDENT:** `GET /api/student/homeworks/find-number?number=<digits>`. Auth STUDENT else `401 sessionExpired`. Rate limit `api:student-find-number`: 120 / 60 s. Validation: `number` must match `^\d{1,20}$` and its normalised form (leading zeros stripped, `normalizeHomeworkNumber`) must not be `"0"` → else `400 { error: dict.apiStudent.findNumber.invalidNumber }` («Введите корректный номер.» / "Enter a valid problem number."). Lookup: all `TopicHomeworkNumber` whose `number` ends with the normalised value, ordered by topic `displayOrder asc`, then topic `createdAt asc`; first whose normalised number equals the normalised query. Not found → `404 { error: dict.apiStudent.findNumber.notFound }` («Такой номер не найден.» / "No such problem found."). Found → `200 { href: "/student/numbers/<recorded number, URL-encoded>" }` (the recorded spelling with leading zeros).
- **TEACHER / DEVELOPER:** `GET /api/teacher/topics/find-number?number=<digits>`. Other roles/unauthenticated → `401 { error: dict.apiCommon.unauthorized }` («Нет доступа.» / "Access denied."). Rate limit `api:find-number`: 30 / 60 s. Same validation → `400 { error: dict.apiContent.findNumber.invalidNumber }` («Укажите корректный номер.» / "Enter a valid problem number."). Not found → `404 { error: dict.apiCommon.numberNotFound }` («Номер не найден.» / "Problem not found."). Exception → `500 { error: dict.apiContent.findNumber.searchFailed }` («Не удалось найти тему по номеру.» / "Could not find a topic by this problem number."). Found → `200 { topicId, topicTitle, number, href: "/teacher/topics/<topicId>/numbers/<number>" }`.

### 3.10 Realtime stream — `GET /api/realtime` (SSE)

- **Auth:** any signed-in user; otherwise plain-text `401` body = `dict.apiCommon.sessionExpired`.
- **Rate limit:** scope `api:realtime-connect`, 30 connects / 60 s per user.
- **Concurrency limit:** at most `DASHBOARD_REALTIME_MAX_CONNECTIONS_PER_USER = 2` open streams per user (in-memory). A third → `429 { error: dict.apiStudent.realtime.tooManyConnections }` («Слишком много одновременных realtime-соединений.» / "Too many simultaneous realtime connections.") with `Retry-After: 5`.
- **Response:** `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`. Frames: `data: <JSON DashboardRealtimeEvent>\n\n`. First frame `{ kind: "connected", occurredAt }`. Heartbeat comment `: ping\n\n` every 25 s. No event ids, no replay of missed events.
- Server-side filtering and client reactions: §5.

### 3.11 Things in the listed files that are NOT self-service (context only)

`actions/account.ts` contains no profile/self-service code: `createAccountAction`, `changeStudentOwnersAction`, `deleteTeacherAction`, `resetTeacherPasswordAction` are DEVELOPER-only account management (belongs to the "accounts" subsystem). Relevant to this subsystem only because of session effects:

- `resetTeacherPasswordAction` (DEVELOPER) and `resetStudentPasswordAction` in `actions/student.ts` (TEACHER for own students, DEVELOPER for any) delete **all sessions** of the target user → that user is signed out everywhere and must log in with the new password.
- Deleting a user cascades to their sessions and notifications.

---

## 4. Business rules the mobile mock must imitate

### 4.1 Session lifetime and invalidation

- Token: 32 random bytes hex (64 chars). Only its sha256 is stored (`Session.tokenHash`). Passwords: scrypt, 16-byte random salt, 64-byte key, stored as `salt:hash` hex.
- TTL: `SESSION_TTL_DAYS`, default **30 days**, **absolute** from sign-in — there is no sliding renewal on activity. After 30 days the user must sign in again.
- Several simultaneous sessions per user are allowed (each sign-in creates a new row; no device list, no limit).
- On each authenticated request: unknown token → treated as signed out; expired session → the row is deleted, cookies cleared, treated as signed out.
- Sessions end early when: the user logs out (that session only); the user changes their password (all sessions replaced by one new one for the current device); a teacher/developer resets the user's password (all sessions deleted); the account is deleted.
- Mobile consequence: any API call may return 401 at any time → clear the stored token and go to Login. **[PROPOSAL]** show `dict.apiCommon.sessionExpired` as a toast on the login screen in that case.

### 4.2 Role routing and permissions

- After login go to the role home (STUDENT → overview, TEACHER → overview, DEVELOPER → topics).
- Opening a screen of another role → silently go to own role home (`requireUser` redirect), never show an "access denied" page.
- STUDENT-only endpoints in this subsystem: `/api/student/notifications`, `/api/student/streak`, `/api/student/homeworks/find-number`. TEACHER/DEVELOPER-only: `/api/teacher/topics/find-number`. Any role: `/api/notifications`, `/api/realtime`, profile/password/locale/logout.
- Streak exists only for STUDENT (context is `null` for others; no requests are made).

### 4.3 Rate limits (complete list for this subsystem)

| Scope | Limit | Window | Keyed by | Store / window type | Applied to |
|---|---|---|---|---|---|
| `login:ip` | 25 | 10 min | client IP | in-memory, sliding (blocked when hits in window ≥ limit) | login |
| `login:ip-login` | 8 | 10 min | IP + login | in-memory, sliding; reset on successful login | login |
| `login:login` | 20 | 15 min | login | Postgres, fixed window (blocked when hits > limit); reset on successful login | login |
| `profile:password-update` | 5 | 15 min | user id | Postgres, fixed window | password change |
| `api:notifications` | 60 | 60 s | user id | Postgres, fixed window | student notifications GET + POST |
| `api:streak` | 120 | 60 s | user id | Postgres, fixed window | streak GET |
| `api:realtime-connect` | 30 | 60 s | user id | Postgres, fixed window | SSE connect |
| realtime concurrency | 2 open streams | — | user id | in-memory counter | SSE |
| `api:student-find-number` | 120 | 60 s | user id | Postgres, fixed window | student number search |
| `api:find-number` | 30 | 60 s | user id | Postgres, fixed window | teacher/developer number search |

Client IP resolution order: `x-real-ip`, last entry of `x-forwarded-for`, `cf-connecting-ip`, else `"unknown"`.

The mock should at least imitate: login lockout after 8 failed attempts for the same login within 10 minutes (showing the "try again in N minutes" text) and password-change lockout after 5 attempts in 15 minutes.

### 4.4 Streak computation

Input: `getProgressTimeline(studentId, 112)` → 112 `TimelineEntry` items, one per Moscow calendar day from `today − 111` to `today`, ascending by date.

How a day's numbers are produced (`lib/platform-data.ts`):

- Source rows: the student's `StudentTopicNumberStatus` rows whose **current** `status` is `GREEN`, `YELLOW` or `RED` and whose `statusChangedAt` (fallback `updatedAt` when `statusChangedAt` is null) is inside the window.
- Each row is counted once, on the local calendar day of `statusChangedAt ?? updatedAt`: `RED` → `redCount += 1`; `GREEN` or `YELLOW` → `closedCount += 1`.
- Consequences the mock must reproduce: it is a snapshot of *current* states, not an event log. Re-marking a problem moves it to the new day; a problem that was green on Monday and becomes red on Wednesday no longer counts as closed on Monday (a past streak day can disappear); clearing a status removes it from the timeline. Deadline changes do not move the day (they do not touch `statusChangedAt`).
- The timeline is cached for 300 s and invalidated by the platform cache tags after every progress mutation.

`buildStudentStreak(entries, locale)`:

- Sort days descending (today first).
- `solvedToday` = today's `closedCount`.
- `currentStreak`: if today's `closedCount` is 0, start counting from yesterday (a streak is not broken until a full day is missed); then count consecutive days with `closedCount > 0` until the first day with 0. Because the window is 112 days, `currentStreak ≤ 112` (≤ 111 when today is still empty).
- `bestStreak`: the longest run of consecutive days with `closedCount > 0` inside the 112-day window.
- Last 7 days (today and the 6 previous): `solvedThisWeek` = sum of `closedCount`; `activeDaysThisWeek` = number of days with `closedCount > 0`; `dailyActivity` = those 7 days oldest → newest with `{ date, dayLabel, count: closedCount }`; `dayLabel = weekdaysShort[getDayOfWeekIndex(date)]` where index is Monday = 0 … Sunday = 6.
- `RED` marks never count towards the streak.

### 4.5 Streak colour tiers

`getStudentStreakColorMeta(currentStreak)` with `n = max(0, floor(currentStreak))`:

| Tier | Min streak | Accent colour (`--shbz-streak-accent`) |
|---|---|---|
| `starter` | 0 | default orange palette (text `#b5701a`/`#e8a35c`, flame `#f2922e`) |
| `ember` | 10 | `#f2922e` |
| `amber` | 25 | `#e0a80c` |
| `lime` | 50 | `#7cb818` |
| `emerald` | 100 | `#16a878` |
| `cyan` | 150 | `#0aa8c4` |
| `blue` | 200 | `#3b82f6` |
| `violet` | 300 | `#8b5cf6` |
| `rose` | 500 | `#ef4667` |
| `gold` | 1000 | `#c9a227` |

- `tier` = the highest tier whose min ≤ n. `currentThreshold` = that min, or `null` for starter.
- Milestones `STREAK_COLOR_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 500, 1000]`; `nextThreshold` = first milestone > n, else `null`; `daysToNextThreshold = nextThreshold − n` or `null`.
- For non-starter tiers the hero colours derive from the accent: background = gradient of accent mixed 16 % → 7 % into the card background; border = accent 38 % into card background; text = accent 45 % into strong text colour; flame = accent.
- Note: since `currentStreak ≤ 112` (§4.4), tiers from `cyan` (150) upward are unreachable with the current server logic — see §7.

### 4.6 Notification texts and time formatting

Rendering (`lib/notification-text.ts`): for a row with params and a known type the title/body are rebuilt in the request locale from the templates below (`dict.notifications.*`, server-only dictionary section). For rows without params (old rows, `broadcast`) the stored title/body are returned as-is; when the locale is not `ru`, a stored title that exactly equals a Russian template *without placeholders* is replaced by the same template in the target language.

| Type | Title | Body |
|---|---|---|
| `homework-assigned` | `variant === "deadline"` → `homeworkAssigned.titleDeadline` «Назначен дедлайн по теме «{topic}»» / "A deadline was set for “{topic}”"; otherwise `homeworkAssigned.titleAssigned` «Учитель выдал ДЗ по теме «{topic}»» / "Your teacher assigned homework on “{topic}”". `{topic}` = `params.topic` or fallback `homeworkAssigned.fallbackTopic` «Тема» / "Topic" | `count > 1` → `bodyMany` «Номера {numbers} · дедлайн {deadline}» / "Problems {numbers} · due {deadline}"; else `bodyOne` «Номер {numbers} · дедлайн {deadline}» / "Problem {numbers} · due {deadline}". `{deadline}` = `Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })` of `deadlineAt` in Moscow time (if unparsable, the raw string) |
| `homework-checked` | `homeworkChecked.title` «Результат автопроверки готов» / "Your AI check result is ready" | `homeworkChecked.body` «Автопроверка: верно — {correct}, перерешать — {incorrect}{uncertain}. {statuses}» / "AI check: correct — {correct}, to redo — {incorrect}{uncertain}. {statuses}", where `{uncertain}` = `uncertain > 0` ? `uncertainSuffix` «, нужна ручная проверка — {uncertain}» / ", needs manual review — {uncertain}" : `""`; `{statuses}` = `applied > 0` ? `statusesUpdated` «Обновлено статусов: {count}.» / "Statuses updated: {count}." (count = applied) : `statusesUnchanged` «Статусы не изменены.» / "Statuses unchanged." |
| `parent_call_due` | `state === "overdue"` → `parentCall.titleOverdue` «Звонок родителям просрочен» / "Parent call is overdue"; else `parentCall.titleDue` «Пора позвонить родителям» / "Time to call the parents" | `hasReachedCall` → `parentCall.bodyReached` «{name}: последний звонок был {days} дн. назад.» / "{name}: the last call was {days} days ago."; else `parentCall.bodyNoCalls` «{name}: успешных звонков ещё не было.» / "{name}: no successful calls yet." |
| `dev_errors` | `devErrors.title` «Ошибки на платформе: {count} за сутки» / "Platform errors: {count} in the last day" | `devErrors.body` «Загляните в журнал действий — там видно, какие вызовы упали и почему.» / "Check the activity log — it shows which calls failed and why." |
| `dev_ai_budget_out` | `devBudgetOut.title` «Дневной бюджет ИИ исчерпан» / "Daily AI budget exhausted" | `devBudgetOut.body` «Проверки и подбор остановлены до сброса окна: {used} из {limit} за 24 часа.» / "Checks and selection are paused until the window resets: {used} of {limit} in 24 hours." |
| `dev_ai_budget_warn` | `devBudgetWarn.title` «Бюджет ИИ на исходе» / "AI budget running low" | `devBudgetWarn.body` «Использовано {used} из {limit} запусков за 24 часа — осталось меньше 20%.» / "{used} of {limit} runs used in 24 hours — less than 20% left." |
| `dev_stale_checks` | `devStaleChecks.title` «Зависшие проверки: {count}» / "Stuck checks: {count}" | `devStaleChecks.body` «Проверки в очереди дольше 30 минут — ученики ждут. Кнопка «Разморозить» — в действиях панели.» / "Checks have been queued for over 30 minutes — students are waiting. Use “Unfreeze” in the panel actions." |
| `dev_storage` | `devStorage.title` «Хранилище файлов разрослось: {gb} ГБ» / "File storage has grown: {gb} GB" | `devStorage.body` «Проверьте срок хранения фото решений и запустите очистку в действиях панели.» / "Review the solution photo retention period and run the cleanup in the panel actions." |
| `broadcast` | free text typed by the developer (trimmed, ≤ 120 chars), shown as-is in any locale | free text (trimmed, ≤ 300 chars) or `null` |

Who receives what and when it is created:

| Type | Recipient | Created when | `href` |
|---|---|---|---|
| `homework-assigned` (`variant: "assigned"`) | STUDENT | a homework assignment is issued (`lib/homework-issue.ts`: manual teacher route and AI homework plans) | `/student/homeworks` |
| `homework-assigned` (`variant: "assigned"` if more than one problem, else `"deadline"`) | STUDENT | the teacher sets a deadline through `/api/teacher/student-deadlines` (only when a deadline is set, not when cleared) | `/student/homeworks` |
| `homework-checked` | STUDENT | an AI homework check finishes successfully (`lib/solution-check.ts`) | `/student/homeworks/{assignmentId}` |
| `broadcast` | STUDENT(s) chosen by the developer (all or selected) | developer panel "broadcast" action | `null` |
| `parent_call_due` | TEACHER | lazily on the teacher's `GET /api/notifications` (§4.7) | `/teacher/calls?studentId={id}` |
| `dev_*` | DEVELOPER | lazily on the developer's `GET /api/notifications` (§4.8) | see §1.4 |

`createNotification` rules: with `params`, the Russian snapshot title/body are generated automatically; a notification that ends up without a title is skipped. Failures are logged and never break the calling flow.

Relative time shown in the list (`formatNotificationTime(createdAt)`), keys under `dict.student.notifications`:

- `diffMinutes = floor((now − createdAt) / 60000)`;
- `< 1` → `justNow` («только что» / "just now");
- `< 60` → `format(minutesAgo, { n })` («{n} мин назад» / "{n} min ago");
- same calendar day → `format(today, { time })` («сегодня, {time}» / "today, {time}");
- otherwise → `format(dateTime, { date, time })` («{date}, {time}»), `date` = `{ day: "numeric", month: "long" }`.
- `time` = `{ hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }`; `date` also uses `timeZone: "Europe/Moscow"`; both with `intlLocaleOf(locale)`. (On the site the "same calendar day" test uses the browser's local date while the printed time is Moscow time; on mobile compute both in `Europe/Moscow` — see §7.)

### 4.7 Parent-call reminders (TEACHER bell) — generation rules

`lib/parent-calls.ts`, `lib/parent-call-state.ts`. Constants: `PARENT_CALL_DUE_DAYS = 30`, `PARENT_CALL_OVERDUE_DAYS = 45`; throttle 60 s per teacher (in memory).

For every student owned by the teacher (`User.teacherId = teacher.id`):

- anchor = `calledAt` of the latest `ParentCallLog` with outcome `REACHED`, or the student's `createdAt` if there is none (`NO_ANSWER` attempts do not move the anchor);
- `daysSinceAnchor` = calendar-day difference (Moscow) between anchor and now, min 0;
- state: `≥ 45` → `"overdue"`, `≥ 30` → `"due"`, else `"ok"`;
- a notification is created when state ≠ `"ok"` **and** one of: there is no previous `parent_call_due` notification for this student (matched by `href`); the last one was created at or before the anchor (previous period); state is `"overdue"` and the last one was created before `anchor + 45 days` (escalation). So at most two notifications per debt period: "due" then "overdue".
- params: `{ state, name: student.name, days: daysSinceAnchor, hasReachedCall }`.
- When the teacher logs a call with outcome `REACHED` for a student, all unread `parent_call_due` notifications with that student's `href` are marked read automatically.
- Call comments are personal data and never appear in notifications.

### 4.8 Developer alerts (DEVELOPER bell) — generation rules

`lib/developer-alerts.ts`. Throttle: one evaluation per developer per 10 minutes (in memory). Facts gathered: failed audit-log entries in the last 24 h (`failedCount`) and since the last `dev_errors` alert (`failedSinceLastAlert`; equals `failedCount` when there was none); homework checks created in the last 24 h (`checksLastDay`); `aiDailyLimit` site setting; checks in status `PENDING`/`CHECKING` older than 30 min (`staleCheckCount`); total stored file size.

| Alert | Condition | Cooldown since last alert of the same type |
|---|---|---|
| `dev_errors` `{ count: failedCount }` | `failedCount > 0` and `failedSinceLastAlert > 0` | 6 h |
| `dev_ai_budget_out` `{ used, limit }` | `checksLastDay ≥ limit` (`limit = max(1, aiDailyLimit)`) | 24 h |
| `dev_ai_budget_warn` `{ used, limit }` | `checksLastDay ≥ 0.8 × limit` and `< limit` (only when the "out" alert was not produced) | 24 h |
| `dev_stale_checks` `{ count }` | `staleCheckCount > 0` | 6 h |
| `dev_storage` `{ gb }` | total file size > 512 MB; `gb = (bytes / 1024³).toFixed(1)` | 7 days |

### 4.9 Interface preference rules

See §1.5.1. Additional: language is independent of the account and survives logout; theme and hints likewise. Defaults on a fresh install: `ru`, `system`, hints `off`.

### 4.10 Profile rules

- A user can change only their own display name and password. Login (`email`) and role are immutable from the settings screen.
- Name: single line (control characters → space, whitespace collapsed, trimmed), 1–120 chars.
- After a successful password change every other device is signed out (§3.4).

---

## 5. Realtime / polling behaviour

### 5.1 Transport

One SSE connection per mounted dashboard shell (`components/dashboard-realtime-listener.tsx` → `new EventSource("/api/realtime")`), opened for every role as soon as the shell mounts and closed on unmount. The browser's `EventSource` reconnects automatically. Server: in-memory pub/sub (single instance only), heartbeat every 25 s, max 2 connections per user, no replay.

### 5.2 Which events the server delivers to whom (`shouldReceiveDashboardRealtimeEvent`)

| Event | STUDENT | TEACHER | DEVELOPER |
|---|---|---|---|
| `students-changed` | never | always | always |
| `topic-content-changed` | always | always | always |
| `student-progress-changed` | only when `studentId` = self | only own students (`studentId` in the teacher's student set; until the set is loaded — all) | always |
| `student-deadlines-changed` | only when `studentId` = self | only own students (same rule) | always |
| `lesson-activity` | only when `studentId` = self (events without `studentId` are not delivered) | only when `teacherId` = self | always |

The teacher's student-id set is loaded on connect and reloaded after every `students-changed` event.

### 5.3 What emits each event (for the mock event bus)

- `students-changed`: student created / deleted (`actions/student.ts`), account created, students re-assigned to another teacher, teacher deleted (`actions/account.ts`).
- `topic-content-changed` (optional `topicId`): topic create/update/delete and file changes (`actions/topic.ts`), topic creation through `POST /api/teacher/topics`, topic JSON import, LaTeX condition save/delete, LaTeX answer save/delete, topic reorder (no `topicId`).
- `student-progress-changed` (`studentId`, optional `topicId`): teacher sets a number status (`/api/teacher/number-status`); teacher sets a lesson item result; AI homework check finished with at least one status applied; lesson item check applied a status; student uploads/deletes homework solution photos (`/api/student/homework-submissions`); student saves a note (`/api/student/topic-status`).
- `student-deadlines-changed` (`studentId`, optional `topicId`): teacher sets/clears deadlines (`/api/teacher/student-deadlines`); homework issued (`lib/homework-issue.ts`); homework cancelled (`/api/teacher/homeworks` DELETE).
- `lesson-activity` (`lessonId`, `teacherId`, optional `studentId`): lesson created/scheduled (one event per participant with their `studentId`), lesson updated via PATCH (one teacher-wide event plus one per participant), finished early, attendance changed, lesson item result set, student opened the active lesson tab for the first time (`joinedAt` set, attendance UNKNOWN → PRESENT), student submitted a lesson photo, lesson item check finished, lesson auto-finalised (no `studentId`).

### 5.4 Client reactions on the site

`connected` → ignored.

STUDENT:

- `student-deadlines-changed` for self → (a) re-fetch the notifications list (bell) with "fresh" highlighting, **and** (b) schedule a page refresh.
- `student-progress-changed` for self → re-fetch the streak (`GET /api/student/streak`, aborting any in-flight request) and **nothing else** (no page refresh).
- `topic-content-changed` → schedule a page refresh.
- `lesson-activity` for self → schedule a page refresh.
- `students-changed` → ignored.

TEACHER / DEVELOPER: every delivered event → schedule a page refresh. The teacher/developer bell is **not** refreshed by realtime.

"Schedule a page refresh" = debounced: if no refresh is pending, wait 1500 ms and then re-fetch the current page's server data once (events arriving during the wait are coalesced). If the tab is hidden, remember that a refresh is pending and run it once when the tab becomes visible again.

### 5.5 Notifications polling

There is no interval polling. The list is fetched: once when the shell mounts; every time the panel is opened; for students additionally on each own `student-deadlines-changed` event. Consequence on the site: a `homework-checked` notification appears in the student's badge only on the next mount/open (its accompanying realtime event is `student-progress-changed`, which only refreshes the streak), and teacher/developer badges only update on mount/open.

### 5.6 Streak refresh

Initial value comes with the shell. Refreshed on every own `student-progress-changed` event. The provider keeps the client value unless the server snapshot genuinely differs in `currentStreak`, `solvedToday` or `solvedThisWeek`.

### 5.7 Mobile mapping [PROPOSAL]

- Keep one realtime subscription while the app is in the foreground and the user is signed in; close it on background/logout; on return to foreground reconnect **and** invalidate everything once (equivalent of the "pending while hidden" refresh).
- Map events to query invalidation (e.g. TanStack Query keys) instead of page refresh, debounced by 1500 ms:
  - `student-deadlines-changed` (student) → `notifications`, student homeworks, deadlines, overview;
  - `student-progress-changed` (student) → `streak` (plus, optionally, progress-dependent student queries — the site deliberately does not refresh the page here);
  - `topic-content-changed` → theory/topics/number detail queries;
  - `lesson-activity` → live lesson queries;
  - teacher/developer: any event → invalidate the queries of the currently focused screen.
- Add what the site lacks: refresh `notifications` on app foreground and on every realtime event addressed to the user.
- The mock implements an in-process event emitter with the same event union and the same per-role delivery filter.

---

## 6. Proposed mobile API contract for this subsystem [PROPOSAL]

Base path `/api/mobile/v1`. JSON everywhere. Auth: `Authorization: Bearer <sessionToken>` (the same opaque session token the site stores in the `tutor_session` cookie; a native app should not depend on cookies). Locale: header `Accept-Language: ru | en` (server falls back to `ru`). All timestamps ISO-8601 UTC strings.

Error envelope (all non-2xx):

```ts
type ApiError = {
  error: {
    code: string;              // machine code, see each endpoint
    message: string;           // localized text, same strings as the site dictionary
    retryAfterSeconds?: number; // with 429 / 503 (also sent as Retry-After header)
  };
};
```

Common codes: `401 sessionExpired` (`dict.apiCommon.sessionExpired`), `403 unauthorized` (`dict.apiCommon.unauthorized`), `429 rateLimited` (`dict.apiCommon.rateLimited`), `503 serviceUnavailable` (`dict.apiCommon.serviceUnavailable`), `400 invalidData` (`dict.apiCommon.invalidData`).

### 6.1 Public

```
GET /api/mobile/v1/public/config
200 → { loginHelpContact: string }          // "" hides the help line
```

### 6.2 Auth

```
POST /api/mobile/v1/auth/login
body  → { login: string; password: string; deviceName?: string }
200   → { token: string; expiresAt: string; user: AuthenticatedUser }
400   → code "empty"        (dict.login.errors.empty)        — empty or too long (login > 254, password > 256)
401   → code "invalid"      (dict.login.errors.invalid)
429   → code "rateLimited"  (dict.login.rateLimitedFor / errors.rateLimited), retryAfterSeconds;
        UI minutes = min(60, max(1, ceil(retryAfterSeconds / 60)))
503   → code "database"     (dict.login.errors.database)
```

Server rules identical to §3.1 (normalisation, three rate limits, resets on success, session TTL 30 days, audit log).

```
POST /api/mobile/v1/auth/logout            (Bearer)
204   — deletes the current session only

GET /api/mobile/v1/me                       (Bearer)
200   → { user: AuthenticatedUser; sessionExpiresAt: string }
401   → sessionExpired
```

### 6.3 Profile

```
PATCH /api/mobile/v1/me                     (Bearer)
body  → { name: string }
200   → { user: AuthenticatedUser }                       // notice key "infoUpdated"
400   → code "infoInvalid"  (dict.settings.notices.infoInvalid)   — empty after normalisation or > 120 chars
500   → code "infoSave"     (dict.settings.notices.infoSave)

POST /api/mobile/v1/me/password             (Bearer)
body  → { currentPassword: string; newPassword: string; confirmPassword: string }
200   → { token: string; expiresAt: string }              // rotated session; notice key "passwordUpdated"
400   → code "passwordInvalid"   (optionally with detail: PasswordProblem)
400   → code "passwordMismatch"
403   → code "passwordCurrent"
429   → code "passwordRateLimited", retryAfterSeconds
500   → code "passwordSave"
```

Order of checks and side effects exactly as §3.4 (all other sessions are deleted; the response token replaces the stored one).

### 6.4 Notifications (one endpoint for all roles)

```
GET /api/mobile/v1/notifications?limit=20   (Bearer)
200 → {
  notifications: Array<AppNotification & {
    params: Record<string, string | number | boolean | null> | null;   // raw params, lets the app re-render offline
    target: NotificationTarget | null;                                  // structured deep link instead of a web href
  }>;
  unreadCount: number;
}

type NotificationTarget =
  | { screen: "student.homeworks" }
  | { screen: "student.homework"; assignmentId: string }
  | { screen: "teacher.calls"; studentId: string }
  | { screen: "developer.journal"; outcome: "failed"; days: number }
  | { screen: "developer.panel"; tab?: "actions" };

POST /api/mobile/v1/notifications/read      (Bearer)
body → { notificationId?: string }           // omitted = mark all as read
200  → { ok: true; unreadCount: number }
```

Server behaviour: `limit` default 20, max 20 (site constant); teacher GET lazily generates parent-call reminders (§4.7), developer GET lazily generates alerts (§4.8); title/body rendered for `Accept-Language` per §4.6; rate limit 60 req/60 s per user (the site applies it only to students — proposed for all roles).

### 6.5 Streak

```
GET /api/mobile/v1/student/streak            (Bearer, STUDENT)
200 → { streak: StudentStreak }
401 → sessionExpired (also for non-students, as on the site) ; 429 → rateLimited (120 / 60 s)
```

Tier/milestone maths (§4.5) is done on the client from `currentStreak`.

### 6.6 Number search

```
GET /api/mobile/v1/numbers/find?number=<digits>   (Bearer)
200 (STUDENT)            → { role: "STUDENT"; number: string }                       // recorded spelling
200 (TEACHER/DEVELOPER)  → { role: "TEACHER" | "DEVELOPER"; number: string; topicId: string; topicTitle: string }
400 → code "invalidNumber"   (student: dict.apiStudent.findNumber.invalidNumber; staff: dict.apiContent.findNumber.invalidNumber)
404 → code "numberNotFound"  (student: dict.apiStudent.findNumber.notFound; staff: dict.apiCommon.numberNotFound)
500 → code "searchFailed"    (dict.apiContent.findNumber.searchFailed)
429 → rateLimited (student 120 / 60 s; staff 30 / 60 s)
```

Validation: `^\d{1,20}$`, normalised value ≠ `"0"`.

### 6.7 Realtime

```
GET /api/mobile/v1/realtime                  (Bearer)   — Server-Sent Events
frames: data: <DashboardRealtimeEvent JSON>\n\n ; first frame { kind: "connected" } ; comment ": ping" every 25 s
401 → sessionExpired ; 429 → code "tooManyConnections" (Retry-After 5) or "rateLimited"
```

Same filtering as §5.2. Recommended additions for native clients: accept the token via header (React Native SSE libraries support custom headers), raise or separately count the per-user connection cap for mobile (the web cap of 2 would be shared with open browser tabs), and offer a polling fallback:

```
GET /api/mobile/v1/sync/changes?since=<ISO>  (Bearer)
200 → { serverTime: string; changed: Array<DashboardRealtimeEvent["kind"]> }
```

### 6.8 Push (does not exist on the site)

```
POST   /api/mobile/v1/devices                (Bearer)  body { pushToken: string; platform: "ios" | "android"; locale: Locale }
DELETE /api/mobile/v1/devices/{pushToken}    (Bearer)
```

Every `createNotification` call would additionally fan out a push with the rendered title/body and the `target`.

### 6.9 Typed client interface for the mock

```ts
interface ShellApi {
  getPublicConfig(): Promise<{ loginHelpContact: string }>;
  login(input: { login: string; password: string }): Promise<{ token: string; expiresAt: string; user: AuthenticatedUser }>;
  logout(): Promise<void>;
  getMe(): Promise<{ user: AuthenticatedUser; sessionExpiresAt: string }>;
  updateProfile(input: { name: string }): Promise<{ user: AuthenticatedUser }>;
  changePassword(input: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<{ token: string; expiresAt: string }>;
  listNotifications(): Promise<NotificationsPayload>;
  markNotificationsRead(input: { notificationId?: string }): Promise<{ unreadCount: number }>;
  getStreak(): Promise<{ streak: StudentStreak }>;          // STUDENT only
  findNumber(number: string): Promise<StudentFindNumberResult | TeacherFindNumberResult>;
  subscribeRealtime(listener: (event: DashboardRealtimeEvent) => void): () => void;   // returns unsubscribe
}

class ApiError extends Error { status: number; code: string; retryAfterSeconds?: number }
```

Mock requirements: in-memory users (seed accounts from §0 + one developer), sessions with a 30-day `expiresAt`, password change that invalidates other sessions, the login/password rate limits of §4.3, a notification store seeded with at least one row of every type relevant to the role (rendered through the §4.6 templates in both languages), lazy parent-call reminder generation for the teacher, a streak computed from mock progress rows with the exact §4.4 algorithm, and an event emitter with the §5.2 filter.

---

## 7. Open questions / things that cannot be done natively as-is

1. **Bottom-tab capacity.** Student and teacher have 6 sections + settings; the developer has 5 + settings. Decide which section goes behind "more" (proposal in §1.3) or whether a scrollable top tab bar / drawer is preferred. Section order must stay as on the site.
2. **No section icons exist on the site.** The mobile tab bar needs an icon set (proposal column in §1.3) — requires design approval.
3. **Auth transport.** The site uses an httpOnly cookie + server actions with redirects; there is no JSON login endpoint. A native app needs the token-based endpoints of §6.2 and secure token storage (Keychain / Keystore via `expo-secure-store`). The `tutor_role` cookie and the `/developer` ↔ `/teacher` redirects have no native equivalent (role comes from `GET /me`).
4. **Session is absolute 30 days, no refresh.** A phone user will be forced to re-login every 30 days. Should mobile sessions be longer or sliding? Should there be a device list / "sign out everywhere"? Biometric unlock is an optional local add-on.
5. **Login rate limits are IP-based** (`login:ip`, 25 per 10 min). Mobile carriers put many users behind one NAT address — a classroom on the same Wi-Fi or carrier could lock each other out. May need a device-id-based key for mobile.
6. **No password recovery / registration.** Confirm the app only shows the help contact line (`loginHelpContact`) — which also needs a public endpoint (§6.1) because the login screen is unauthenticated.
7. **Push notifications do not exist on the site** (only the in-app bell). Should the app send push for `homework-assigned`, `homework-checked`, `broadcast`, `parent_call_due`? Requires device-token storage and a push provider (§6.8). Teacher reminders and developer alerts are generated *lazily on bell fetch*, so pushing them needs a server-side scheduler.
8. **Notification links are web paths** (`href`). The app needs the mapping table of §1.4 or a structured `target` from the server; unknown/future hrefs need a fallback (ignore, or open in an in-app browser).
9. **Realtime over SSE.** React Native has no built-in `EventSource`; use a library (e.g. `react-native-sse`) or the polling fallback. The server keeps at most 2 streams per user and is in-memory/single-instance; mobile + two browser tabs would exceed the cap. iOS/Android close sockets in the background — reconnect and invalidate on foreground.
10. **Bell freshness gaps on the site** (§5.5): `homework-checked` does not refresh the student's bell live; teacher/developer bells never refresh live. Proposal: refresh on foreground and on any realtime event — confirm this deviation is wanted.
11. **Streak cap.** The streak is computed over a 112-day window, so `currentStreak` and `bestStreak` can never exceed 112, yet colour tiers go up to 1000 (`cyan` 150 and above are unreachable). Keep the behaviour 1:1 in the mock, or fix on the future server (store streaks / widen the window)?
12. **Streak is a snapshot, not a history** (§4.4): changing a status later can retroactively remove a past active day. Mock should imitate this; confirm it is acceptable on mobile.
13. **Time zone.** All "today" logic is Moscow time. The app must compute days/labels in `Europe/Moscow` regardless of the device zone (needs `Intl` with time-zone support in Hermes, or a date library). The site mixes browser-local "same day" with Moscow clock time in the notification list — use Moscow for both.
14. **Language default.** Site default is `ru` with no device-language detection, and the language is a device cookie. Should the app follow the device language on first launch? Should the choice be stored on the account so AI-generated texts and pushes use it? (Pushes need a server-known locale.)
15. **Hints toggle.** It is a global CSS switch on the site (`.ui-hint`). On mobile every hint text must be wrapped explicitly; confirm the feature is kept (default: hidden).
16. **Theme.** Site themes are CSS variables with gradients, `color-mix` (streak tiers) and backdrop blur. Native needs precomputed colours for the 9 streak tiers × 2 themes and `expo-linear-gradient` for gradients; `system` mode maps to `useColorScheme()`.
17. **Developer role on mobile.** The dev panel, journal, statistics and accounts are desktop-oriented admin tools; confirm they are in scope for v1 or whether the developer app is reduced (e.g. topics + accounts + calls + notifications).
18. **Logout placement and confirmation.** The site logs out immediately from the header/hamburger. Proposal: put Logout in Settings with a confirmation dialog — confirm.
19. **Copy-to-clipboard for the login** needs `expo-clipboard`; haptic + toast replace the "Copied" pill.
20. **Number search placement.** On the site it sits in almost every page header. On mobile: keep it as a field on root screens, or a single global search action in the app bar?
21. **Error codes vs localized strings.** The site APIs return only localized `error` strings; the mobile contract (§6) asks the future server for stable machine codes. Until then the mock owns the code → text mapping from the dictionaries quoted here.
22. **Mock developer account.** No developer exists in the seed; the mock needs an invented one (credentials to be agreed).
