# 02 — Student: home, theory library, number detail, deadlines, exam info

Source of truth: the Next.js site in `/home/user/web_shetya` (read-only). Every value below was read from code;
file references are given so a reviewer can verify. UI copy is referenced by dictionary key path
(`dict.…`), with the Russian (default) and English text quoted for the important strings.

Scope of this document (student role only):

| Site route | Screen |
|---|---|
| `/student` | S1 Home ("Обзор") |
| `/student/theory` | S2 Theory library + S2a file viewer |
| `/student/numbers/[number]` | S3 Number detail |
| `/student/deadlines` | S4 Deadlines calendar + S4a day sheet |
| `/student/info` | S5 Exam info (ЕГЭ / ОГЭ) |
| header of all five | C1 Number search control |

Out of scope here (other spec files): login, settings, notifications bell, `/student/lesson`,
`/student/homeworks` list and `/student/homeworks/[assignmentId]` detail (S1 and S4 only *link* to the homework
detail screen).

---

## 0. Shared context needed by every screen

### 0.1 Enums and primitives

```ts
type UserRole = "TEACHER" | "STUDENT" | "DEVELOPER";            // prisma enum UserRole
type HomeworkNumberStatus = "GREEN" | "YELLOW" | "RED";         // prisma enum HomeworkNumberStatus; null = not marked
type Locale = "ru" | "en";                                      // lib/i18n/locale.ts, DEFAULT_LOCALE = "ru"
type IsoDateTime = string;                                      // Date.toISOString(), UTC, e.g. "2026-11-20T20:59:00.000Z"
type DateKey = string;                                          // "YYYY-MM-DD" (Moscow calendar date, see 4.9)
```

Status meaning (`dict.status.*`, `dict.progress.statuses.*`):

| Status | `dict.status.X.label` ru / en | `dict.status.X.shortLabel` ru / en | `dict.progress.statuses.X` ru / en |
|---|---|---|---|
| `GREEN` | Решен с первого раза / Solved on the first try | Зеленый / Green | Решил / Solved |
| `YELLOW` | Исправлен после самопроверки / Fixed after self-check | Желтый / Yellow | Решил с ошибками / Solved with mistakes |
| `RED` | Нужна помощь преподавателя / Needs the teacher's help | Красный / Red | Не решил / Not solved |
| `null` | — | `dict.student.statusBadge.unmarked`: Не отмечено / Not marked | Без отметки / No mark |

"Solved / closed" everywhere in this subsystem means **GREEN or YELLOW**. RED is "needs review" and never counts as solved.

### 0.2 Auth and role gating (site behaviour)

- Cookie session `tutor_session` (httpOnly, sameSite lax, TTL `SESSION_TTL_DAYS` env, default **30** days). `middleware.ts`
  only checks cookie presence on `/dashboard`, `/student`, `/teacher`, `/developer`; real checks are in `requireUser`.
- `app/(dashboard)/layout.tsx` calls `requireUser()` (any role) → no session → redirect `/login`.
- Pages S1–S4 call `requireUser(UserRole.STUDENT)`: a TEACHER is redirected to `/teacher`, a DEVELOPER to
  `/developer/topics` (`roleHome`).
- **S5 `/student/info` has no role check of its own** (only the layout's "any authenticated user"). Content is static, so
  nothing leaks; on mobile simply show it in the student tab set only.
- API routes used here require `role === "STUDENT"`; otherwise **401** `{ "error": dict.apiCommon.sessionExpired }`
  ("Сессия истекла. Войдите заново." / "Your session has expired. Please sign in again.").

### 0.3 Localisation

- Locale comes from cookie `shbz-lang` (`"ru"` | `"en"`, default `ru`). Server pages and API error texts follow it.
- Helpers (`lib/i18n/format.ts`):
  - `format(template, params)` replaces `{name}` placeholders.
  - `plural(locale, n, forms)`: **ru** uses 3 forms — `n%10==1 && n%100!=11` → forms[0]; `n%10 in 2..4 && n%100 not in 12..14`
    → forms[1]; else forms[2]. **en** uses 2 forms — `n==1` → forms[0], else forms[1]. Forms contain `{n}`.
- Intl locale: `ru` → `ru-RU`, `en` → `en-GB` (`intlLocaleOf`).
- Date formatting used here (`lib/utils.ts`):
  - `formatDate(value, locale)` → `Intl.DateTimeFormat(intl, { day: "2-digit", month: "long", year: "numeric" })`.
    ru example: `20 ноября 2026 г.`; en example: `20 November 2026`. Falsy value → "Без даты" / "No date".
  - Calendar month label → `{ month: "long", year: "numeric" }`, first letter upper-cased (`Ноябрь 2026 г.` / `November 2026`).
  - Calendar day-sheet date → `{ day: "numeric", month: "long", timeZone: "Europe/Moscow" }` (`20 ноября` / `20 November`).

### 0.4 Site navigation that surrounds these screens (`components/dashboard-nav.tsx`)

Student tab bar, in order (labels are lower-case on the site, `dict.nav.student.*`):

| href | ru | en | active when |
|---|---|---|---|
| `/student` | обзор | overview | `pathname === "/student"` |
| `/student/lesson` | урок | lesson | starts with `/student/lesson` |
| `/student/homeworks` | дз | homework | starts with `/student/homeworks` |
| `/student/deadlines` | дедлайны | deadlines | starts with `/student/deadlines` |
| `/student/theory` | теория | theory | starts with `/student/theory` |
| `/student/info` | общая инфа | info | starts with `/student/info` |
| `/student/settings` | настройки (rendered as a gear icon, not a tab) | settings | starts with `/student/settings` |

Note: `/student/numbers/[number]` matches **no** tab (no tab highlighted). Header also holds the notifications bell and
"Выйти"/"Log out". For the student the header shows no avatar/name.

Suggested phone mapping (final decision belongs to the navigation-shell spec): bottom tab bar with
`Обзор · Урок · ДЗ · Дедлайны · Ещё`, where "Ещё" lists `Теория`, `Общая инфа`, `Настройки`; or 5 tabs
`Обзор · Урок · ДЗ · Дедлайны · Теория` with `Общая инфа` reachable from Home/Settings. S3 Number detail is a pushed
stack screen on top of whichever tab launched the search.

### 0.5 Page header pattern (`components/shbz-page-header.tsx`)

Used by S1, S2, S4, S5: small upper-case **kicker** (12px, weight 700, letter-spacing 1.6px, colour `kicker`), then
**H1 title** (weight 800, 26–40px) followed by a small round gradient dot (decorative), then an `aside` slot that on
phones is always **full width under the title** — it holds the number search (C1) on every screen in this spec.
S3 uses the older `PageHeader` (back link, eyebrow, title, aside).

### 0.6 Design tokens used by these screens (`app/globals.css`), light / dark

| Token | Light | Dark | Used for |
|---|---|---|---|
| page-bg | `#ffffff` | `#0b0c0e` | screen background |
| text-strong | `#0a0a0a` | `#f5f6f7` | titles, values |
| text-muted | `#6a6e75` | `#9ba0a6` | meta lines, hints |
| kicker | `#63676d` | `#7c8087` | kickers, small labels |
| label | `#2c2e33` | `#c9ccd1` | week summary text |
| card-bg / card-border | `#ffffff` / `#ececee` | `#131417` / `#26282c` | cards (radius 16) |
| soft-bg / soft-border | `#f8f9fa` / `#f0f0f1` | `#1a1c1f` / `#26282c` | inner panels |
| panel-bg | `#fbfbfc` | `#17181b` | week panel |
| accent-solid | `#16b07e` | `#36e0a4` | active marks, today label, links |
| accent gradient | `linear-gradient(90deg, #5ac8ea 0%, #36e0a4 100%)` | same | primary buttons (white text, weight 700, radius 12, height 44), progress fill, badges, dot |
| progress-track | `#efeff1` | `#26282c` | progress track (height 8, compact 7, radius 999) |
| green-soft / green-text | `#eaf7ef` / `#127a4c` | `rgba(27,158,99,.16)` / `#59d49d` | GREEN badge, "Выполнено" badge, "Сохранено" |
| yellow-soft / yellow-text | `#fef4e3` / `#8a5d05` | `rgba(201,138,30,.16)` / `#e8b45c` | YELLOW badge |
| red-soft / red-text | `#fceded` / `#b3202c` | `rgba(214,69,80,.16)` / `#ff8f94` | RED badge, search error text |
| danger-bg / danger-text | `#fceded` / `#b3202c` | `rgba(229,72,77,.12)` / `#ff8f94` | "Просрочено" badge, error banner |
| tab-hover (neutral chip) | `#f2f3f4` | `#24262a` | "Не отмечено" badge bg (text = kicker), empty-list chip |
| cal-cell-bg / border | `#fbfbfc` / `#f0f0f1` | `#17181b` / `#26282c` | calendar day, current month |
| cal-out-bg / out-text | `#fdfdfe` / `#c7cad0` | `#131417` / `#4a4d52` | calendar day, other month |
| cal-ok-bg / border / mark | `#fff7ea` / `#f5dfb8` / `#f2a93b` | `rgba(242,169,59,.1)` / `rgba(242,169,59,.35)` / `#f2a93b` | day whose homeworks are all DONE |
| cal-late-bg / border / mark | `#fff5f5` / `#f5c6c9` / `#e5484d` | `rgba(229,72,77,.1)` / `rgba(229,72,77,.35)` / `#ff6b70` | day with at least one not-DONE homework |
| cal-ring | `rgba(10,10,10,.12)` | `rgba(255,255,255,.18)` | today inset ring (2px), open-day ring (3px) |
| week-cell / week-dot-off | `#f1f2f4` / `#d7d9dd` | `#222428` / `#3a3d42` | weekly activity cells |
| streak (starter tier) bg / border / text / flame / pill | `linear-gradient(135deg,#fff3e4,#ffe9d2)` / `#fbdfbe` / `#b5701a` / `#f2922e` / `rgba(255,255,255,.7)` | `linear-gradient(135deg, rgba(242,146,46,.18), rgba(242,146,46,.08))` / `rgba(242,146,46,.35)` / `#e8a35c` / `#f2922e` / `rgba(0,0,0,.25)` | streak hero |
| seg-bg / seg-active-bg / seg-text | `#ecedef` / `#ffffff` / `#6a6e75` | `#222428` / `#0f1012` / `#9ba0a6` | ЕГЭ/ОГЭ segmented control (active text = accent-solid) |

Font: Montserrat (body and display). Card radius 16, inner panel radius 12–16, badge radius 8.

Streak tier accent colours (`.shbz-streak-hero[data-streak-tier]`): starter = default orange palette above;
ember `#f2922e`, amber `#e0a80c`, lime `#7cb818`, emerald `#16a878`, cyan `#0aa8c4`, blue `#3b82f6`, violet `#8b5cf6`,
rose `#ef4667`, gold `#c9a227`. For non-starter tiers: background = 135° gradient of accent mixed 16% → 7% into card-bg,
border = accent 38% into card-bg, text = accent 45% into text-strong, flame = accent.

---

## 1. Screens

### C1. Number search control (`components/shbz-number-search.tsx`)

Present in the header of S1–S5 with `endpoint="/api/student/homeworks/find-number"`.

Layout: a pill-shaped field (height 46, radius 12, 1.5px outline; focus → accent border), magnifier icon on the left,
text input, and — **only when the input is non-empty** — a bare accent-coloured arrow "→" submit button on the right.
A single red feedback line (12px) appears under the field when there is an error.

Behaviour:

1. Input: `inputMode="numeric"`, `pattern="[0-9]*"`, `enterKeyHint="search"`, autocomplete off. On every change all
   non-digit characters are stripped (`value.replace(/[^\d]/g, "")`) and any feedback is cleared.
2. Submit (arrow or keyboard "search"): `trim()`; client validation — must match `/^\d+$/` **and must not** match `/^0+$/`.
   Failure → feedback `dict.numberSearch.invalid` ("Введите корректный номер." / "Enter a valid problem number."), no request.
3. Request: `GET {endpoint}?number={encodeURIComponent(value)}`, `cache: "no-store"`. The number is sent exactly as typed
   (leading zeros are significant in the recorded form; the server matches by normalised form).
4. While pending: input disabled, placeholder `dict.numberSearch.searching` ("Ищем номер…" / "Searching…"), arrow at 55% opacity.
5. Success (`response.ok` and `result.href`): navigate to `href` (= `/student/numbers/{recordedNumber}`).
6. Failure: feedback = `result.error` if the JSON has one (server text: 400/404/401/429/503 messages, see 3.1), otherwise
   `dict.numberSearch.notFound` ("Не удалось найти тему по этому номеру." / "No topic found for this problem number.").
   Network/JSON failure → the same fallback.

Copy (`dict.numberSearch`): placeholder "Найти номер" / "Find a problem"; aria "Найти номер и открыть тему" /
"Find a problem number and open its topic"; submit aria "Найти" / "Find".

Phone translation: a search field at the top of each tab screen (under the title) or a search icon in the navigation bar
that opens a small modal with a numeric keypad (`keyboardType="number-pad"`, `returnKeyType="search"`). On success push S3.
The input keeps its text after a failed search; on success the site navigates away (state is discarded).

---

### S1. Student Home — `/student` (`app/(dashboard)/student/page.tsx`)

- Role: STUDENT only.
- Purpose: "what's next" (nearest unfinished homework), streak/weekly rhythm, short list of the next homeworks.
- Data: `getStudentHomeworkDeadlines(user.id)` → `mapStudentHomeworksToDeadlineItems(homeworks, locale)`;
  `getStudentStreakSnapshot(user.id)`.

Layout top to bottom:

1. **Header**: kicker `dict.studentHome.kicker` ("Обзор" / "Overview"), title `dict.studentHome.title` ("Ваш кабинет" /
   "Your account"), aside = C1.
2. **"Что дальше" hero** (`UpcomingDeadlinesCard variant="hero" limit={4}`): section title `dict.student.upcoming.whatsNext`
   ("Что дальше" / "What's next") + **one compact homework card** (see "Homework deadline card" below) for the nearest
   unfinished homework. The whole card is tappable → homework detail `/student/homeworks/{id}`. **Rendered only if there is at
   least one unfinished homework with a deadline**; otherwise the whole block is absent.
3. **"Огонёк и ритм" block** (`StudentWeeklyActivity`), section title `dict.student.weekly.title`
   ("Огонёк и ритм" / "Streak and rhythm"). One card containing:
   - **Streak hero** (tinted by streak tier, see 4.4): top-left label `weekly.flame` ("Огонёк" / "Streak", upper-case 12px);
     top-right pill with a flame icon and `format(weekly.daysShort, { n: currentStreak })` ("{n} дн." / "{n} d");
     big headline (26px, weight 800): if `currentStreak > 0` → `format(weekly.streakHeadline, { days: plural(currentStreak, weekly.dayForms) })`
     ("3 дня подряд" / "3 days in a row"); else `weekly.igniteFirst` ("Зажгите первый день" / "Light up your first day").
   - **Two small panels** side by side (stacked on narrow screens):
     - `weekly.todayDone` ("Сегодня сделано" / "Done today") → value: `solvedToday > 0 ? plural(solvedToday, weekly.solvedForms)`
       ("2 номера" / "2 problems") `: weekly.noSolvedToday` ("Без закрытых номеров" / "No problems closed").
     - `weekly.nextGoal` ("Следующая цель" / "Next goal") → value: if there is a next colour threshold →
       `format(weekly.daysToGo, { days: plural(daysToNextThreshold, weekly.dayForms) })` ("Ещё 7 дней" / "7 days to go");
       else `weekly.maxColor` ("Максимальный цвет" / "Top colour reached"). Hint line under it (only when a next threshold exists):
       `format(weekly.goalHint, { days: plural(nextThreshold, weekly.dayForms) })` ("до нового цвета огонька (10 дней)" /
       "until the next flame colour (10 days)").
   - **Week panel**: label `weekly.week` ("За неделю" / "This week"); text
     `format(weekly.weekSummary, { solved: plural(solvedThisWeek, weekly.solvedForms) })`
     ("5 номеров закрыто за последние 7 дней." / "5 problems closed in the last 7 days."); then a row of **7 day cells**
     (`dailyActivity`, oldest → newest, the last one is today). Each cell: 64px-high rounded box (`week-cell`); inside, at the
     bottom, an **accent bar 20×8** if `count > 0` or a **grey dot 8×8** if `count === 0` (shape duplicates colour); under the
     cell the weekday short label derived from the date (`dict.student.weekdaysShort[getDayOfWeekIndex(date)]`, Mon=0…Sun=6:
     "Пн Вт Ср Чт Пт Сб Вс" / "Mon Tue Wed Thu Fri Sat Sun"). **Today**: cell gets an inset 1.5px accent ring and the label
     is accent-coloured and underlined. Accessibility label per cell: `weekly.dayActiveAria` ("{day}: закрыто номеров — {count}" /
     "{day}: problems closed — {count}") or `weekly.dayEmptyAria` ("{day}: нет закрытых номеров" / "{day}: no problems closed").
   - The cells are **not interactive**.
4. **"Ближайшие ДЗ" list** (`UpcomingDeadlinesCard variant="list" limit={4}`): section title `dict.student.upcoming.title`
   ("Ближайшие ДЗ" / "Upcoming homework") + up to **3** full (non-compact) homework cards = items 2…4 of the upcoming list.
   Each has a primary button `dict.student.deadlineList.open` ("Открыть ДЗ" / "Open homework") → homework detail.
   Visibility rules (exact, from `UpcomingDeadlinesCard`):
   - 0 upcoming → block 2 is absent; block 4 shows the title and an inline grey chip with `dict.student.upcoming.empty`
     ("Пока нет назначенных ДЗ." / "No homework assigned yet.").
   - exactly 1 upcoming → block 2 shows it; **block 4 is entirely absent** (no title).
   - 2–4+ upcoming → block 2 shows the first; block 4 shows the next up to 3.

"Upcoming" selection: items with `status !== "DONE"`, sorted by `deadlineAt` ascending, first `limit = 4`. Overdue unfinished
homeworks are **included** and therefore come first (with the "Просрочено" badge). Homeworks without a deadline never appear.

**Homework deadline card** (`components/deadline-list.tsx`, type `DeadlineListItem`):

- Derived values: `progressPercent = completionPercent(solvedNumbers, totalNumbers)` = `total ? Math.round(solved/total*100) : 0`.
- `metaLabel = format(deadlineList.meta, { date: formatDate(deadlineAt, locale), solved, total })`
  → "ДЗ до 20 ноября 2026 г. · Выполнено 3 из 8" / "Due 20 November 2026 · 3 of 8 done".
- `progressLabel`: 100 → `deadlineList.progressDone` ("ДЗ выполнено полностью" / "Homework fully done"); 0 →
  `deadlineList.progressNotStarted` ("ДЗ ещё не начато" / "Homework not started"); else
  `format(deadlineList.progress, { percent })` ("Прогресс ДЗ: 38%" / "Progress: 38%").
- Badges after the label: `status === "DONE"` → green "Выполнено" / "Done" (`deadlineList.doneBadge`);
  `isHomeworkOverdue(deadlineAt, status === "DONE")` → red "Просрочено" / "Overdue" (`deadlineList.overdueBadge`).
  Overdue = deadline parses and `deadline.getTime() < Date.now()` and not DONE.
- **Compact variant** (hero and calendar day sheet): whole card is a link. Rows: label (16px, weight 800, wraps) + badges
  [+ chevron "›" only in the calendar day sheet]; meta line (13px muted); 7px progress track with gradient fill at
  `progressPercent%`; bottom row: `progressLabel` on the left (12.5px, kicker colour), `{solved}/{total}` on the right
  (13px, weight 800).
- **Full variant** (home list): card with label (17px, weight 800) + badges, meta line, a primary button "Открыть ДЗ" on the
  right, and an 8px progress track below. No progress label / fraction row.
- Label text: `"{homeworkLabel} · {topicTitle}"` where `homeworkLabel = assignment.title || format(dict.common.homeworkN, { n: orderInTopic })`
  ("ДЗ 2" / "Homework 2").
- Empty list (`items.length === 0`): inline grey chip with `emptyMessage ?? deadlineList.emptyDefault`
  ("На эту дату дедлайнов нет." / "No deadlines on this date.").

States:

- Loading: `app/(dashboard)/student/loading.tsx` → generic skeleton (a 4-card grid of 160px blocks, then a 220px block, then a
  340px block). On mobile use skeleton placeholders for the hero card, streak card and list.
- Error: dashboard error boundary — title `dict.shells.errorTitle` ("Раздел временно недоступен" / "This section is temporarily
  unavailable"), description `dict.shells.errorDescription`, buttons `dict.common.retry` ("Попробовать снова" / "Try again") and
  `dict.common.home` ("На главную" / "Home").
- Live updates: streak block re-fetches on progress events (see section 5); the page refreshes on deadline/topic events.

Streak animation (`use-streak-motion.ts`): when `currentStreak` changes while the screen is mounted — `0 → >0` = `"ignite"`,
increase = `"grow"`, decrease = `"drop"`; state lasts **900 ms**. ignite/grow: flame icon pops (scale 1→1.45→0.92→1 with ±8°
rotation and an orange glow, 900 ms), the counter pops (700 ms), the hero card bumps (scale 1.015 + glow, 900 ms). drop: the
pill shakes horizontally (±3px, 500 ms). Disabled under reduced-motion.

Phone translation: single vertical scroll. Hero card full width; streak hero full width with the two small panels in a
2-column row (or stacked below 360pt); week row of 7 equal cells; list of full cards (the "Открыть ДЗ" button can be dropped
in favour of making the whole card tappable, as the compact variant already does). Pull-to-refresh re-queries both sources.

---

### S2. Theory library — `/student/theory` (`app/(dashboard)/student/theory/page.tsx`)

- Role: STUDENT only. `dynamic = "force-dynamic"`.
- Purpose: one card per topic that has a theory file; opening shows the file.
- Data: `getStudentTheoryLibrary()` — shared for all students (not per-student), topics **with** `theoryFile !== null`,
  ordered by `displayOrder asc, createdAt asc`.

Layout:

1. Header: kicker `dict.student.theory.kicker` ("Теория" / "Theory"), title `dict.student.theory.title`
   ("Теория по темам" / "Theory by topic"), aside = C1.
2. Empty state (no topics with a theory file): centred card — `theory.emptyTitle` ("Файлов теории пока нет." /
   "No theory files yet.") bold 18px + `theory.emptyHint` ("Как только учитель прикрепит теорию к темам, она появится здесь." /
   "As soon as your teacher attaches theory to a topic, it will appear here.").
3. Otherwise a responsive grid (`repeat(auto-fit, minmax(320px, 1fr))`, gap 20) of cards. Each card shows **only**:
   - topic title (17px, weight 700, wraps);
   - one primary button at the bottom, depending on the file's MIME type (`FileFullscreenPreview`):
     - `application/pdf` or `image/png` / `image/jpeg` → button `dict.student.fullscreen.open` ("Открыть" / "Open");
     - anything else (DOCX `application/vnd.openxmlformats-officedocument.wordprocessingml.document`) → button
       `dict.student.fullscreen.download` ("Скачать файл" / "Download file"), which is a direct download link
       `/files/{fileId}?download=1`.
   By owner's decision the card shows **no** kicker, description, file name, file size or upload date (the data is fetched but
   not rendered).

Nothing is fetched from `/files` until the button is pressed.

#### S2a. File viewer (site: `components/file-fullscreen-preview.tsx`)

Site behaviour on "Открыть":

- Image → full-screen modal dialog: dark overlay `rgba(15,23,42,0.78)`, a card (max width 1024) with a header row
  [file name = **topic title**, truncated] [button "Скачать файл" → `/files/{id}?download=1`] [button `fullscreen.close`
  "Закрыть" / "Close"], body = the image fitted (`object-contain`) on a soft background. Closes on overlay tap, Close button,
  Escape. Body scroll locked while open.
- PDF on desktop → the same modal with an `<iframe src="/files/{id}">` (browser's built-in PDF viewer).
- PDF on a touch device (`(pointer: coarse)`) or when `navigator.pdfViewerEnabled === false` → **no modal**; the link opens
  `/files/{id}` in a new browser tab (system viewer).
- Modifier-click (⌘/Ctrl/Shift/Alt) → normal link behaviour (new tab).
- Aria: dialog `format(fullscreen.dialogAria, { name })` ("Предпросмотр файла {name}" / "File preview: {name}").

Phone translation:

- Theory list = `FlatList` of cards, one column; tapping the card (or its button) pushes a full-screen **viewer screen**
  (modal presentation) titled with the topic title, with header actions "Скачать/Поделиться" (share sheet) and "Закрыть".
- PDF → native PDF renderer (e.g. `react-native-pdf`) or `WebView`/`expo-web-browser` against the authenticated file URL;
  image → zoomable image view (pinch/zoom); DOCX → download to cache then open with the OS "open in…" sheet
  (`expo-sharing` / `Linking`), no in-app preview.
- Files are immutable per `fileId` (`Cache-Control: private, max-age=31536000, immutable`, ETag) → cache on disk by `fileId`.
- Loading state while the file downloads (progress bar); error state with retry: use `dict.student.pdf.error`
  ("Не удалось показать предпросмотр. Откройте файл кнопкой выше." / "Could not show the preview. Open the file with the
  button above.") and `dict.student.pdf.loading` ("Загружаем предпросмотр…" / "Loading preview…").

States: loading = generic student skeleton (`student/loading.tsx`); error = dashboard error boundary. Realtime: a
`topic-content-changed` event refreshes the page (new/removed theory files, renamed topics).

---

### S3. Number detail — `/student/numbers/[number]` (`app/(dashboard)/student/numbers/[number]/page.tsx`)

- Role: STUDENT only.
- Entry point: **only** via the number search C1 (`find-number` returns the href). No other page links here.
- Purpose: show one problem (condition), the student's own traffic-light status (read-only) and a personal note (editable).
- Resolution: `targetNumber = decodeURIComponent(param).trim()`; if not `/^\d+$/` → 404. `findTopicIdByNumber(targetNumber)`
  (first topic, in topic order `displayOrder asc, createdAt asc`, containing a number whose **normalised** form equals the
  normalised target) → none → 404. `getStudentNumberDetail(user.id, topicId, targetNumber)` → throws → 404.
  `/numbers/010203` and `/numbers/10203` open the same card.

Layout top to bottom:

1. **Header** (`PageHeader`): back link `dict.student.number.backToHomeworks` ("← К моим ДЗ" / "← My homework") →
   `/student/homeworks` (always, regardless of where the user came from); eyebrow = `topic.title`; title
   `format(dict.student.number.title, { number })` ("Номер 051003" / "Problem 051003") — the **recorded** form of the number;
   aside = C1.
2. **Card** (`StudentSingleNumberCard`, wrapped in a section titled `format(dict.student.numberCard.title, { number })`
   — "Номер {number}" / "Problem {number}"):
   - Error banner (only when the last note save failed): red notice with the server error text or
     `numberCard.noteSaveFailed` ("Заметка не сохранилась." / "Could not save the note."). Cleared on next keystroke.
   - Row: big "№ {number}" + **status badge** (`HomeworkStatusBadge`): `null` → neutral chip "Не отмечено" / "Not marked";
     otherwise coloured chip with `dict.status[STATUS].shortLabel` ("Зеленый" / "Желтый" / "Красный"; "Green" / "Yellow" / "Red")
     using the green/yellow/red soft background + text tokens.
     On the right (below on narrow screens) a muted hint `numberCard.statusHint`: "Статус выставляется автоматической проверкой
     решения или учителем." / "The status is set by the AI check or by your teacher."
   - **Condition** (only if `conditionLatex` is non-empty): kicker `numberCard.condition` ("Условие" / "Problem statement") +
     rendered LaTeX block (rules in 4.8) on a soft rounded background.
   - **Note** (only if `notesEnabled`): kicker `numberCard.note` ("Заметка" / "Note"); to its right a transient status —
     `numberCard.saving` ("Сохраняем…" / "Saving…") while a save is in flight, or green `numberCard.saved`
     ("Сохранено" / "Saved") for **1600 ms** after a successful save. Multiline text field: 2 rows, **maxLength 240**,
     placeholder `numberCard.notePlaceholder` ("Заметка для себя: что не понял, что спросить у учителя…" / "A note to yourself:
     what's unclear, what to ask the teacher…"), dashed border while empty, solid when filled/focused. Accessibility label
     `format(numberCard.noteAria, { number })`.
   - There is **no** status picker, no answer, no deadline shown (the `deadlineAt` prop is passed but unused), and no
     prev/next navigation.

Note editing behaviour (client):

- Every change: clear error + "saved" flash, update local text, (re)start a **650 ms debounce**; when it fires → save.
- On blur: cancel the debounce and save immediately.
- Save: compare `draft.trim()` with `savedNote.trim()`; equal → nothing. Otherwise abort any in-flight save (AbortController),
  `POST /api/student/topic-status` with `{ topicId, homeworkNumberId, note }` (raw, untrimmed text). On success
  `savedNote = response.note` (server-trimmed/cut value; falls back to the trimmed draft) and show the "Сохранено" flash.
  The text field itself is **not** overwritten with the server value. Aborted requests are ignored silently.
- Clearing the note (empty / whitespace) is a valid save and removes the note on the server.

States:

- Not found (bad format / unknown number): dashboard 404 view — "404", `dict.shells.notFoundTitle` ("Страница не найдена" /
  "Page not found"), `dict.shells.notFoundDescription` ("Возможно, эта страница была удалена или вы перешли по неверной ссылке." /
  "This page may have been removed, or the link you followed is wrong."), button `dict.common.home` → `/student`.
  In practice the search already answers 404 before navigation, so on mobile show the search's inline error instead and keep a
  simple "not found" fallback screen for deep links.
- Loading: generic student skeleton. Error: dashboard error boundary.
- Realtime: `topic-content-changed` refreshes (condition edited); own `student-progress-changed` does **not** refresh the page
  for a student (only the streak), so a status set by a check/teacher while the card is open appears after re-entering.

Phone translation: pushed stack screen. Nav-bar title "Номер {number}", subtitle/eyebrow = topic title, native back button
(returns to the previous screen; the site's hard-coded "← К моим ДЗ" is a web artefact — see open question Q4). Body: status
row, condition (scrollable horizontally for wide display formulas), note field with keyboard-avoiding layout; save on debounce,
on blur and on screen blur/unmount.

---

### S4. Deadlines calendar — `/student/deadlines` (`app/(dashboard)/student/deadlines/page.tsx`)

- Role: STUDENT only.
- Purpose: month calendar of homework deadlines; tapping a marked day lists that day's homeworks.
- Data: same as S1 — `getStudentHomeworkDeadlines(user.id)` → `mapStudentHomeworksToDeadlineItems` (**all** homeworks with a
  deadline, including DONE ones; no limit).

Layout:

1. Header: kicker `dict.student.deadlines.kicker` ("Дедлайны" / "Deadlines"), title `dict.student.deadlines.title`
   ("Календарь домашних заданий" / "Homework calendar"), aside = C1.
2. One card (`DeadlinesCalendar`):
   - Top row: outline button `calendar.prev` ("← Назад" / "← Back"), month label (20px, weight 800, e.g. "Ноябрь 2026 г."),
     outline button `calendar.next` ("Вперёд →" / "Next →"). Navigation is unbounded in both directions; initial month = the
     current month of the device clock. Changing the month closes any open day sheet.
   - Weekday header: 7 labels, Monday first, upper-cased `weekdaysShort` ("ПН ВТ СР ЧТ ПТ СБ ВС" / "MON TUE … SUN").
   - Grid: always **42 cells** (6 rows × 7), starting from the Monday on/before the 1st (`firstDayOffset = (getDay()+6)%7`).
     Cell height 64, radius 12, 1px border. Per cell:
     - `isCurrentMonth` = cell month equals displayed month. Out-of-month cells: bg `cal-out-bg`, number in `cal-out-text`,
       **never** show marks, always disabled (even if they have deadlines).
     - `dayItems` = deadline items whose `deadlineAt` falls on that local calendar day
       (`toDayKey(new Date(deadlineAt))` using local Y-M-D).
     - `hasDeadlines = isCurrentMonth && dayItems.length > 0`; `hasIncomplete = hasDeadlines && dayItems.some(i => i.status !== "DONE")`.
     - Colours: hasIncomplete → `cal-late-*` (reddish) bg/border and a **red diamond mark**; has deadlines but all DONE →
       `cal-ok-*` (amber) bg/border and an **amber diamond mark**; otherwise plain `cal-cell-*`.
       The mark is a 9×9 square rotated 45° with 3px radius, under the day number (15px, weight 600).
     - Today (current month only): inset 2px ring `cal-ring`; `aria-current="date"`.
     - Tappable only when `hasDeadlines`; tap toggles the day sheet for that day (tapping the same day again closes it). The
       open day shows a 3px outer ring.
   - **Legend** under the grid: amber diamond + `calendar.legendDeadline` ("Дедлайн ДЗ" / "Homework deadline"); red diamond +
     `calendar.legendIncomplete` ("Есть невыполненные номера" / "Has unfinished problems"); small ringed square +
     `calendar.legendToday` ("Сегодня" / "Today").

#### S4a. Day sheet (site: popover anchored under the day cell)

- Header panel: kicker `calendar.popoverKicker` ("Дедлайн по ДЗ" / "Homework deadline") + the date
  (`day numeric, month long`, time zone Europe/Moscow: "20 ноября" / "20 November").
- Body: `DeadlineList items={dayItems} compact showChevron` — compact homework cards **with a chevron**, each a link to
  `/student/homeworks/{id}`; DONE items show the green "Выполнено" badge, overdue unfinished ones the red "Просрочено" badge.
  (Empty message `calendar.emptyDay` "На этот день дедлайн не назначен." / "No deadline on this day." exists but cannot occur:
  the sheet opens only for days with items.)
- Site closes it on: outside click, Escape, month change, tapping the same day. On phones < 640px the popover already spans the
  full grid width.

States:

- Loading: dedicated skeleton (`deadlines/loading.tsx`): header skeleton + a card with a small spinner, 3 pills for the
  month row, 7 weekday placeholders and 42 day placeholders (min height 430).
- Empty (no homeworks with deadlines): the calendar renders normally with no marks; there is **no** empty-state text.
- Error: dashboard error boundary.
- Realtime: own `student-deadlines-changed` and `topic-content-changed` refresh the page data.

Phone translation: full-width month grid (cells ~44–48pt high), header with chevron buttons and optional horizontal swipe
between months; tapping a marked day opens a **bottom sheet** with the day header and the compact cards; tapping a card closes
the sheet and pushes the homework detail screen. Legend stays under the grid. Pull-to-refresh re-queries.

---

### S5. Exam info — `/student/info` (`app/(dashboard)/student/info/page.tsx`, `components/student-exam-info.tsx`)

- Role: any authenticated user on the site (shown in the student tab bar only). Fully **static** — no network.
- Header: kicker `dict.student.info.kicker` ("Общая инфа" / "General info"), title `dict.student.info.title`
  ("Баллы и разбалловка" / "Scores and grading"), aside = C1.
- Segmented control (tablist, aria `examInfo.tablistAria` "Экзамен" / "Exam") with two options: `examInfo.ege` ("ЕГЭ" / "EGE")
  — **default** — and `examInfo.oge` ("ОГЭ" / "OGE"). The active pill slides (animated indicator); the panel re-plays an
  entrance animation on switch. Selection is local state, not persisted.

**ЕГЭ panel** (profile-level maths, max 32 primary points):

1. Section `examInfo.scaleTitle` ("Первичные → тестовые" / "Raw → scaled score"): a wrapping grid of small chips
   (min width 120), each `{primary} → {secondary}`; the chip for `primary === 5` (`EGE_PROFILE_MIN_PRIMARY`, pass threshold =
   27 scaled) has an **accent border**. Data (`EGE_PROFILE_SCALE`, `lib/exam-scores.ts`):

   | prim | scaled | prim | scaled | prim | scaled | prim | scaled |
   |---|---|---|---|---|---|---|---|
   | 1 | 6 | 9 | 52 | 17 | 80 | 25 | 95 |
   | 2 | 11 | 10 | 58 | 18 | 82 | 26 | 96 |
   | 3 | 17 | 11 | 64 | 19 | 84 | 27 | 97 |
   | 4 | 22 | 12 | 70 | 20 | 86 | 28 | 98 |
   | 5 | 27 | 13 | 72 | 21 | 88 | 29 | 99 |
   | 6 | 34 | 14 | 74 | 22 | 90 | 30 | 100 |
   | 7 | 40 | 15 | 76 | 23 | 92 | 31 | 100 |
   | 8 | 46 | 16 | 78 | 24 | 94 | 32 | 100 |

2. Section `examInfo.tasksTitle` ("Сколько даёт каждое задание" / "Points per task"): list of rows, each with a gradient badge
   and text. Badge = row index + 1 (= points per task). Texts `examInfo.egeTasks`:
   1. "№ 1–12 — по 1 первичному баллу" / "Tasks 1–12 — 1 raw point each" (badge `1`)
   2. "№ 13, 15, 16 — по 2 первичных балла" / "Tasks 13, 15, 16 — 2 raw points each" (badge `2`)
   3. "№ 14 и 17 — по 3 первичных балла" / "Tasks 14 and 17 — 3 raw points each" (badge `3`)
   4. "№ 18 и 19 — по 4 первичных балла" / "Tasks 18 and 19 — 4 raw points each" (badge `4`)

**ОГЭ panel** (25 tasks, max 31 primary points) — note the order differs (tasks first, grades second):

1. Section `examInfo.tasksTitle`: rows from `examInfo.ogeTasks`:
   1. "№ 1–19 (часть 1) — по 1 первичному баллу" / "Tasks 1–19 (part 1) — 1 raw point each" (badge `1`)
   2. "№ 20–25 (часть 2, развёрнутый ответ) — по 2 первичных балла" / "Tasks 20–25 (part 2, full solution) — 2 raw points each" (badge `2`)
2. Section `examInfo.gradesTitle` ("Оценка по первичным" / "Grade by raw score"): grid of cards (min width 220), in this order:

   | Card label `format(examInfo.grade, { grade })` | Range | Note |
   |---|---|---|
   | "Оценка 5" / "Grade 5" | `22–31` + `examInfo.points` ("баллов" / "points") | — |
   | "Оценка 4" / "Grade 4" | `15–21` | — |
   | "Оценка 3" / "Grade 3" | `8–14` | `examInfo.ogeGrade3Note`: "из них не меньше 2 баллов за геометрию (№ 15–19, 23–25)" / "with at least 2 points from geometry (tasks 15–19, 23–25)" |
   | "Оценка 2" / "Grade 2" | `0–7` | — |

Phone translation: native segmented control at the top; ЕГЭ scale as a 3-column grid of chips (or a 2-column table);
task rows and grade cards as full-width list items. Bundle the constants in the app (no API).

---

### Components listed in scope that are NOT rendered on any student screen today

They are documented so the mobile team knows they exist; they belong to the teacher/developer specs.

- `components/file-resource-card.tsx` + `components/pdf-preview.tsx` — inline file card with pdf.js canvas preview (lazy page
  rendering, `rootMargin 600px`, device pixel ratio capped at 2), buttons `dict.student.fileCard.openInBrowser`
  ("Открыть в браузере" / "Open in browser"; short form "Открыть файл" / "Open file") and `fileCard.download` ("Скачать файл"),
  states `fileCard.notUploaded` ("Файл пока не загружен." / "No file uploaded yet."), `fileCard.previewHidden`,
  `fileCard.docxHint`. Used only on teacher topic pages (`/teacher/topics/[topicId]` and `/edit`).
- `components/progress-bar.tsx` — generic 0–100 bar (`sm` 8px / `md` 10px / `lg` 12px); used in the teacher homework review.
- `components/progress-timeline-chart.tsx` — line chart over `getProgressTimeline` entries, periods `"7d" | "4w" | "8w"`;
  used only on `/teacher/statistics`. The **data source** (`getProgressTimeline`) is what the student streak is built from
  (section 4.3), which is why it is in this subsystem. Chart rules, for completeness: `7d` = last 7 daily points; `4w` / `8w` =
  last 28 / 56 days grouped into 4 / 8 buckets of `floor(len/buckets)` consecutive days; plotted value = `closedCount`;
  totals `closedTotal`, `redTotal`; trend compares `closedTotal` with the previous period of the same length
  (`previous === 0 && current === 0` → flat "без изменений {comparison}"; `previous === 0` → up "новая активность {comparison}";
  equal → flat "на уровне {comparison}"; else "{sign}{delta} закрыто ({sign}{percent}%) {comparison}" with
  `percent = round(|delta| / previous * 100)`).
- `getStudentDeadlines` (per-number deadlines from `StudentTopicNumberStatus.deadlineAt`) and
  `groupStudentDeadlinesAsAssignments` — **legacy**, no page calls them any more (only unit tests). Home and calendar use
  `getStudentHomeworkDeadlines` (per-homework). Types are listed in 2.6 for reference; the mobile app does not need them.

---

## 2. View models

### 2.1 Homework deadline summary (S1, S4)

Server shape — `StudentHomeworkDeadlineInput` (`lib/student-deadline-groups.ts`), returned by
`getStudentHomeworkDeadlines(studentId)`:

```ts
type StudentHomeworkDeadlineInput = {
  id: string;                 // HomeworkAssignment.id (cuid)
  title: string | null;       // assignment.title?.trim() || null
  orderInTopic: number;       // 1-based index among THIS student's assignments of the same topic, ordered by createdAt asc
  topicTitle: string;
  deadlineAt: Date | string | null;   // HomeworkAssignment.deadlineAt (nullable)
  totalNumbers: number;       // count of HomeworkAssignmentNumber rows
  solvedCount: number;        // numbers whose student status is GREEN or YELLOW
};
```

Query: all `HomeworkAssignment` where `studentId = me`, `orderBy createdAt asc`. If the homework tables do not exist yet
(old DB) → `[]`.

UI shape — `DeadlineListItem` (`components/deadline-list.tsx`), produced by `mapStudentHomeworksToDeadlineItems(list, locale)`:

```ts
type StudentDeadlineAssignmentStatus = "DONE" | "IN_PROGRESS" | "NOT_STARTED";

type DeadlineListItem = {
  id: string;                 // assignment id
  label: string;              // `${title || format(dict.common.homeworkN, { n: orderInTopic })} · ${topicTitle}`
  href: string;               // `/student/homeworks/${id}`  → mobile: route to homework detail with this id
  deadlineAt: IsoDateTime;    // never null here: assignments without/with invalid deadline are dropped
  totalNumbers: number;
  solvedNumbers: number;      // = solvedCount
  status: StudentDeadlineAssignmentStatus;
};
```

Mapping rules: skip when `deadlineAt` is null/invalid; `status = totalNumbers > 0 && solvedCount >= totalNumbers ? "DONE" :
solvedCount > 0 ? "IN_PROGRESS" : "NOT_STARTED"` (RED-only progress stays `NOT_STARTED`); result sorted by `deadlineAt` asc.

For mobile keep the label parts separate (so the client localises "ДЗ N"):

```ts
type HomeworkDeadlineSummary = {
  id: string;
  title: string | null;
  orderInTopic: number;
  topicTitle: string;
  deadlineAt: IsoDateTime | null;
  totalNumbers: number;
  solvedCount: number;
};
```

### 2.2 Streak (S1)

```ts
// lib/progress-timeline.ts
type TimelineEntry = {
  date: DateKey;        // Moscow calendar day
  closedCount: number;  // status rows currently GREEN or YELLOW whose last status change fell on this day
  redCount: number;     // status rows currently RED whose last status change fell on this day
};

// lib/student-streak.ts
type StudentStreak = {
  currentStreak: number;        // consecutive days with closedCount > 0 ending today (or yesterday if today is 0)
  bestStreak: number;           // longest run inside the 112-day window (computed, NOT shown on the home screen)
  solvedToday: number;          // closedCount of today
  solvedThisWeek: number;       // sum of closedCount over the last 7 days incl. today
  activeDaysThisWeek: number;   // days with closedCount > 0 among the last 7 (computed, NOT shown)
  dailyActivity: Array<{
    date: DateKey;              // 7 entries, oldest → newest, last = today
    dayLabel: string;           // localised short weekday; the client ignores it and derives the label from `date`
    count: number;              // closedCount
  }>;
};

// lib/student-streak-colors.ts
type StudentStreakColorTier =
  | "starter" | "ember" | "amber" | "lime" | "emerald" | "cyan" | "blue" | "violet" | "rose" | "gold";

type StudentStreakColorMeta = {
  tier: StudentStreakColorTier;
  currentThreshold: number | null;     // null for starter
  nextThreshold: number | null;        // null at >= 1000
  daysToNextThreshold: number | null;  // nextThreshold - streak
};
```

### 2.3 Theory library (S2)

Return type of `getStudentTheoryLibrary()`:

```ts
type StudentTheoryTopic = {
  id: string;                 // Topic.id
  title: string;
  description: string;        // fetched, NOT rendered
  theoryFile: {               // non-null after the server-side filter
    id: string;               // StoredFile.id → GET /files/{id}
    originalName: string;     // NOT rendered (viewer title is the topic title)
    mimeType: string;         // "application/pdf" | "image/png" | "image/jpeg" |
                              // "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    size: number;             // bytes, NOT rendered
    uploadedAt: Date;         // NOT rendered
  };
};
type StudentTheoryLibrary = StudentTheoryTopic[];   // order: Topic.displayOrder asc, createdAt asc
```

MIME helpers (`lib/utils.ts`): `isPdfMime` = `application/pdf`; `isImageMime` = `image/png` | `image/jpeg`;
`isOfficeMime` = the DOCX type. Allowed upload extensions platform-wide: `.pdf .docx .png .jpg .jpeg`; max upload 15 MB.

### 2.4 Number detail (S3)

Return type of `getStudentNumberDetail(studentId, topicId, targetNumber)`:

```ts
type StudentNumberDetail = {
  topic: { id: string; title: string; description: string };
  number: {
    id: string;                       // TopicHomeworkNumber.id  (homeworkNumberId for the note API)
    number: string;                   // recorded form, digits only, leading zeros significant ("051003")
    conditionLatex: string | null;    // LaTeX/markdown-ish source, see 4.8
    studentStatus: {
      id: string;                     // StudentTopicNumberStatus.id
      status: HomeworkNumberStatus | null;
      note: string;                   // "" when null
      deadlineAt: Date | null;        // mirrored homework deadline; passed to the card but unused
      updatedAt: Date;
    } | null;                         // null = the student has no row for this number
  };
  notesEnabled: boolean;              // false only on an un-migrated DB (hides the note field)
  deadlinesEnabled: boolean;
};
```

Props actually consumed by the card:

```ts
type StudentSingleNumberCardProps = {
  topicId: string;
  homeworkNumberId: string;
  number: string;
  conditionLatex: string | null;
  initialStatus: HomeworkNumberStatus | null;   // studentStatus?.status ?? null
  initialNote: string;                          // studentStatus?.note ?? ""
  deadlineAt: IsoDateTime | null;               // unused
  notesEnabled: boolean;
};
```

**The student never receives `answerLatex`, the answer file, or any teacher-only field** for a number.

### 2.5 Exam info (S5)

```ts
type ScoreRow = { primary: number; secondary: number };       // EGE_PROFILE_SCALE, 32 rows
type TaskScoringRow = { badge: string; text: string };        // badge = String(index + 1)
type GradeRow = { grade: number; range: string; note?: string };

const EGE_PROFILE_MAX_PRIMARY = 32;
const EGE_PROFILE_MIN_PRIMARY = 5;   // highlighted chip
const OGE_MAX_PRIMARY = 31;
const OGE_GRADE_RANGES = [
  { grade: 5, range: "22–31" }, { grade: 4, range: "15–21" },
  { grade: 3, range: "8–14" },  { grade: 2, range: "0–7" }
];
```

### 2.6 Legacy (not used by pages)

```ts
type StudentDeadline = {            // getStudentDeadlines(studentId), ordered by deadlineAt asc
  id: string; deadlineAt: Date; status: HomeworkNumberStatus | null;
  homeworkNumberId: string; homeworkNumber: string; topicId: string; topicTitle: string;
};
type StudentDeadlineAssignment = {  // groupStudentDeadlinesAsAssignments: grouped by `${topicId}::${isoDeadline}`
  id: string; deadlineAt: IsoDateTime; topicId: string; topicTitle: string;
  totalNumbers: number; solvedNumbers: number;   // GREEN | YELLOW
  status: "DONE" | "IN_PROGRESS" | "NOT_STARTED"; // here IN_PROGRESS = any non-null status (incl. RED)
};
```

---

## 3. Mutations and queries (site)

All JSON errors have the shape `{ "error": "<localised message>" }` (no machine code). Common responses for every
`/api/student/*` route below:

| Condition | Status | Body |
|---|---|---|
| no session / role is not STUDENT | 401 | `{ error: dict.apiCommon.sessionExpired }` — "Сессия истекла. Войдите заново." / "Your session has expired. Please sign in again." |
| rate limit exceeded | 429 + `Retry-After: <seconds>` | `{ error: dict.apiCommon.rateLimited }` — "Слишком много запросов. Подождите немного и попробуйте снова." / "Too many requests. Wait a moment and try again." |
| rate-limit store failure | 503 + `Retry-After: 5` | `{ error: dict.apiCommon.serviceUnavailable }` — "Сервис временно недоступен. Попробуйте снова позже." / "The service is temporarily unavailable. Try again later." |

Rate limiting (`lib/api-rate-limit.ts` + `lib/persistent-rate-limit.ts`): **fixed windows** stored in Postgres, keyed by
`scope + userId`; window start = `floor(now / windowMs) * windowMs`; a request is rejected when hits in the window exceed the
limit; `Retry-After = max(1, ceil((windowEnd - now) / 1000))`.

### 3.1 `GET /api/student/homeworks/find-number?number={digits}` — number search

- Rate limit: scope `api:student-find-number`, **120 / 60 s** per user.
- Validation: `requestedNumber = (number ?? "").trim()`; must match `/^\d{1,20}$/` and `normalizeHomeworkNumber(requestedNumber) !== "0"`.
  Otherwise **400** `{ error: dict.apiStudent.findNumber.invalidNumber }` ("Введите корректный номер." / "Enter a valid problem number.").
- Lookup: all `TopicHomeworkNumber` whose `number` ends with the normalised value, ordered by
  `topic.displayOrder asc, topic.createdAt asc`; first one whose normalised number **equals** the normalised request.
  The search is global across all topics — not limited to numbers assigned to the student.
- Not found → **404** `{ error: dict.apiStudent.findNumber.notFound }` ("Такой номер не найден." / "No such problem found.").
- Success **200**: `{ "href": "/student/numbers/<encodeURIComponent(recordedNumber)>" }` — the href carries the recorded form
  (as in the textbook), e.g. request `51003` → `/student/numbers/051003`.
- No side effects.

### 3.2 Number detail read (server component, no HTTP API on the site)

`findTopicIdByNumber(targetNumber)` + `getStudentNumberDetail(userId, topicId, targetNumber)` — see S3 and 2.4.
Not cached. Errors → 404 page. (The mobile API must expose this as an endpoint, see 6.)

### 3.3 `POST /api/student/topic-status` — save the personal note

- Rate limit: scope `api:student-status`, **90 / 60 s** per user.
- Request body (JSON):

  ```ts
  { topicId: string; homeworkNumberId: string; note: string | null }   // `status` must NOT be present
  ```

- Processing order and errors:
  1. If the body **has a `status` key** (any value, even `null`) → **403**
     `{ error: dict.apiStudent.topicStatus.statusReadOnly }` ("Статус выставляется автоматической проверкой или учителем." /
     "The status is set by the automatic check or by the teacher.").
  2. `topicId` / `homeworkNumberId` are `String(...).trim()`; if either is empty **or the `note` key is absent** → **400**
     `{ error: dict.apiStudent.topicStatus.invalidData }` ("Некорректные данные для сохранения номера." /
     "Invalid data for saving the problem.").
  3. `TopicHomeworkNumber` with `id = homeworkNumberId AND topicId = topicId` must exist, else **404**
     `{ error: dict.apiStudent.topicStatus.numberNotFound }` ("Номер задания для этой темы не найден." /
     "Problem not found for this topic.").
  4. Note normalisation: `String(note ?? "").trim().slice(0, 240)`; empty string → `null` (clear).
- Writes (only the `note` column is ever touched; status and deadline are never written by this route):
  - non-empty note → upsert `StudentTopicNumberStatus` by `(studentId, homeworkNumberId)`: update `{ note }`, or create
    `{ studentId, homeworkNumberId, status: null, note }`.
  - cleared note → `updateMany({ note: null })`, then delete the row **only if** it is completely empty:
    `status IS NULL AND note IS NULL AND statusChangedAt IS NULL AND deadlineAt IS NULL` (atomic DB conditions, so a status or
    deadline set concurrently protects the row; a row with `statusChangedAt` is kept even when its colour is empty).
- Success **200**:

  ```ts
  { ok: true; status: HomeworkNumberStatus | null; note: string; notesEnabled: boolean }
  // status = the existing status (unchanged), note = saved value ("" when cleared)
  ```

  Degraded DB (no `note` column): `{ ok: true, status, note: "", notesEnabled: false }` and nothing is written.
- Side effects: revalidates all platform data caches and paths `/dashboard`, `/student`, `/student/homeworks`, `/teacher`,
  `/teacher/topics/{topicId}`, `/teacher/topics/{topicId}/edit`; publishes realtime event
  `{ kind: "student-progress-changed", studentId: me, topicId }` (the teacher's pages refresh; the student's own other tabs
  re-fetch the streak). The teacher can read the student's note in the homework review.

### 3.4 `GET /api/student/streak` — streak snapshot

- Rate limit: scope `api:streak`, **120 / 60 s** per user.
- Success **200**: `{ "streak": StudentStreak }` (2.2), `dayLabel`s in the request locale. Computed from
  `getProgressTimeline(userId, 112)` (uncached wrapper around a 300 s data cache that is tag-invalidated on every progress write).
- Called by the client whenever a `student-progress-changed` event for this student arrives (section 5); also the initial
  value is rendered server-side on every page load (dashboard layout).

### 3.5 Home / calendar read (server component)

`getStudentHomeworkDeadlines(userId)` (2.1) — data cache 15 s + tag invalidation
(`platform-data:student-topics`, `…:teacher-topics`, `…:teacher-students`).

### 3.6 Theory read (server component)

`getStudentTheoryLibrary()` (2.3) — one shared cache entry for all students, 60 s TTL + tags
`platform-data:student-topics`, `platform-data:teacher-topics`.

### 3.7 `GET /files/{fileId}` — protected file download (`app/files/[fileId]/route.ts`, `lib/file-access.ts`)

- Auth: any signed-in user; no session → **401** plain text `Unauthorized`.
- Rate limit: scope `api:file-read`, **120 / 60 s** per user (429/503 JSON as above).
- Unknown id → **404** plain text `Not found`. Access denied → **also 404** `Not found` (never 403; logged as `file.read.denied`).
- Access rules (`canAccessStoredFile` + ownership query):

  | Role | May read a `StoredFile` when… |
  |---|---|
  | DEVELOPER | always |
  | TEACHER | they uploaded it, **or** it is a topic theory file, topic homework file, topic answers file, or a number answer file; **or** it is a solution photo (homework submission / homework check / lesson submission) of **their own** student or lesson |
  | STUDENT | it is a **topic theory file** or **topic homework file** (of any topic); **or** it is **their own** solution photo: a `HomeworkSubmissionPhoto` of their assignment, a `HomeworkCheckPhoto` of a check on their assignment, or a `LessonSubmissionPhoto` of their lesson participation |

  A student can **never** read topic answer files or per-number answer files, nor other students' photos.
- Query params:
  - `download=1` → `Content-Disposition: attachment` (otherwise `inline`).
  - `thumb=1` (ignored with `download=1`; only for `image/png`, `image/jpeg`, `image/jpg`, `image/webp`) → WebP thumbnail,
    width 320 (no upscaling, quality 72, EXIF-rotated). `Content-Type: image/webp`, ETag `"{fileId}-thumb-{bytes}"`. If the
    thumbnail cannot be built, the original is served.
- Success headers: `Content-Type: <stored mimeType>`, `Content-Length`, 
  `Content-Disposition: inline|attachment; filename*=UTF-8''<encodeURIComponent(originalName)>`,
  `Cache-Control: private, max-age=31536000, immutable`, `ETag: "{fileId}-{size}"`, `X-Content-Type-Options: nosniff`.
  `If-None-Match` equal to the ETag → **304**.
- When the storage backend is Vercel Blob in *public* mode the route answers **302** to the public blob URL instead of
  streaming (after the access check). Payload missing in storage → 404.
- Storage backends are abstracted (`lib/storage.ts`: Vercel Blob / S3-compatible / local disk); clients only ever see
  `/files/{fileId}`.

### 3.8 `GET /api/realtime` — SSE stream (section 5)

- Auth: any signed-in user; else **401** plain text (`sessionExpired`).
- Rate limit: scope `api:realtime-connect`, **30 / 60 s**. Max **2** concurrent connections per user
  (`DASHBOARD_REALTIME_MAX_CONNECTIONS_PER_USER`); the 3rd gets **429** + `Retry-After: 5` with
  `{ error: dict.apiStudent.realtime.tooManyConnections }` ("Слишком много одновременных realtime-соединений." /
  "Too many simultaneous realtime connections.").
- Response: `text/event-stream`; first message `data: {"kind":"connected","occurredAt":…}`; comment heartbeat `: ping` every
  **25 s**.

---

## 4. Business rules the mobile mock must imitate

### 4.1 Core invariant

Topics and their numbers are global/shared. Progress (`status`), `note` and mirrored `deadlineAt` are **per student**, keyed by
`(studentId, homeworkNumberId)` (`StudentTopicNumberStatus`, unique pair). The same number shows different status/notes for
different students. A row may not exist at all (= not marked, empty note).

### 4.2 Status is read-only for the student

- The student **cannot set or clear** the traffic-light status anywhere. It is written only by: teacher manual marks, the AI
  homework check (CORRECT → GREEN, INCORRECT → RED, UNCERTAIN → untouched), lesson results (SOLVED → GREEN, PARTIAL → YELLOW,
  NOT_SOLVED → RED; SKIPPED does not change progress), and lesson auto-finalisation.
- Sending `status` to the note endpoint is rejected with 403 (3.3).
- The mock must therefore treat status as server-owned data; only `note` is mutable from these screens.

### 4.3 Progress timeline and streak (`getProgressTimeline`, `buildStudentStreak`)

Timeline (per student, `days = 112`, clamped to 1…112):

1. `today` = start of the current day in the **server time zone (Europe/Moscow)**; window = today − 111 days … today;
   one entry per day, keys `YYYY-MM-DD` built from Moscow local date parts.
2. Consider the student's `StudentTopicNumberStatus` rows with `status ∈ {GREEN, YELLOW, RED}` and a change timestamp inside the
   window, where change timestamp = `statusChangedAt ?? updatedAt` (`statusChangedAt` is "when the colour really changed";
   `updatedAt` is only a fallback for old rows).
3. For each row: RED → `redCount += 1` on its day; GREEN/YELLOW → `closedCount += 1` on its day.

   Consequence: this is a **snapshot of current rows**, not an event log — one number contributes to exactly one day (the day
   of its latest status change). If a number solved yesterday is re-marked today, yesterday's count drops by one and today's
   rises by one; if it turns RED, it stops counting as closed at all.

Streak (`buildStudentStreak(entries)`), with entries sorted newest first (`sorted[0]` = today):

- `solvedToday = sorted[0].closedCount`.
- `currentStreak`: start at index 0; **if today's closedCount is 0, start from yesterday** (the streak is not lost until a full
  day is missed); count consecutive days with `closedCount > 0` until the first zero.
- `bestStreak`: longest run of days with `closedCount > 0` in the whole window.
- Last 7 days (`sorted.slice(0, 7).reverse()`, oldest first): `solvedThisWeek` = sum of `closedCount`;
  `activeDaysThisWeek` = days with `closedCount > 0`; `dailyActivity` = `{ date, dayLabel, count: closedCount }`.
  It is a **rolling 7-day window ending today**, not a Monday–Sunday week.
- Maximum representable streak is 112 (window size).

Worked example (from `tests/student-streak.test.ts`): closed counts for Apr 4…10 = `0,1,1,0,2,1,0` (today = Apr 10, a Friday)
→ `currentStreak = 2`, `solvedToday = 0`, `solvedThisWeek = 5`, `activeDaysThisWeek = 4`, last label "Пт".

### 4.4 Streak colour tiers (`getStudentStreakColorMeta`)

`normalized = max(0, floor(currentStreak))`.

| Streak (days) | Tier | nextThreshold |
|---|---|---|
| 0–9 | `starter` | 10 |
| 10–24 | `ember` | 25 |
| 25–49 | `amber` | 50 |
| 50–99 | `lime` | 100 |
| 100–149 | `emerald` | 150 |
| 150–199 | `cyan` | 200 |
| 200–299 | `blue` | 300 |
| 300–499 | `violet` | 500 |
| 500–999 | `rose` | 1000 |
| ≥ 1000 | `gold` | `null` ("Максимальный цвет") |

Milestones: `[10, 25, 50, 100, 150, 200, 300, 500, 1000]`. `daysToNextThreshold = nextThreshold - normalized`.
(Because the timeline window is 112 days, tiers above `emerald` are unreachable today — keep the table anyway.)

### 4.5 Homework deadline items (S1, S4)

- Source: every `HomeworkAssignment` of the student. `orderInTopic` counts the student's assignments per topic in
  `createdAt` order (1, 2, 3 … independently for each topic). Label = custom title, else "ДЗ {orderInTopic}" /
  "Homework {orderInTopic}", then " · {topicTitle}".
- `solvedCount` = numbers of the assignment whose **current** student status is GREEN or YELLOW (status is per number, shared
  across homeworks that contain the same number).
- Assignments with no deadline are excluded from both the home blocks and the calendar.
- Status: DONE (`total > 0 && solved >= total`), IN_PROGRESS (`solved > 0`), NOT_STARTED (otherwise, including "only RED").
- Overdue badge: not DONE and `deadlineAt < now`.
- Home "upcoming": not-DONE items by deadline ascending, first 4 → 1 hero + up to 3 list items (visibility matrix in S1).
- Calendar: all items; a day is "late/red" if any item that day is not DONE, "ok/amber" if all are DONE; only current-month
  cells are marked/tappable.
- A cancelled homework disappears (the assignment row is deleted); issuing/cancelling fires `student-deadlines-changed`.

### 4.6 Number identity (`lib/utils.ts`)

- `number` is a **string of digits**; leading zeros are significant in the *recorded* form ("051003") and must be displayed
  as recorded.
- `normalizeHomeworkNumber(v)` = `v.trim().replace(/^0+(?=.)/, "")` → "010203" → "10203", "000" → "0", "7" → "7".
  Comparison, lookup and de-duplication use the normalised form; "0" is never a valid number.
- `compareHomeworkNumbers(a, b)`: numeric order without `Number()` — compare normalised lengths, then lexicographically
  (`"2" < "10"`, `"051001" < "51002"`, `"01"` equals `"1"`).
- Lookup (search and number page): candidates with `number endsWith normalised`, in topic order
  (`displayOrder asc, createdAt asc`), first with equal normalised form. If the same number exists in several topics, the
  first topic in that order wins. Unique constraint is `(topicId, number)` on the recorded form.
- `parseNumbersInput(input)` (teacher/developer input parser — not used by student screens, documented because the mock's
  fixtures and other specs rely on it): unicode dashes → `-`; tokens separated by whitespace/`,`/`;` are either `N` or
  `A-B`; ranges are expanded inclusively (reversed ranges allowed), zero-padded to the **wider boundary's width**
  ("8-12" → 08,09,10,11,12; "051008-051010" → 051008,051009,051010); boundaries longer than 15 digits, non-positive
  boundaries and ranges spanning ≥ 2000 numbers are skipped; "0" is skipped; duplicates by normalised form collapse (first
  typed form wins: "01, 1" → ["01"]); hard cap **2000** numbers; result sorted with `compareHomeworkNumbers`.
  Examples: `"5, 2, 2, 4-6, 3"` → `["2","3","4","5","6"]`; `"10–8, 3—4"` → `["3","4","08","09","10"]`;
  `"0, -1, hello, 7, 2-2"` → `["2","7"]`.

### 4.7 Note rules

- Max 240 characters after trimming (client `maxLength=240`, server `slice(0, 240)`); plain text, multi-line allowed.
- Empty/whitespace note = delete the note (and the row if it holds nothing else).
- Saving a note for a number without a row creates a row with `status: null`.
- Debounce 650 ms, flush on blur, abort superseded requests, "Сохранено" flash 1600 ms, error banner on failure (text from
  the server or `numberCard.noteSaveFailed`).
- Notes are private to the student but visible to their teacher (homework review) — not to other students.

### 4.8 Condition rendering (`components/latex-answer-preview.tsx`, `lib/latex-line-items.ts`, `lib/math-line-breaks.ts`)

`conditionLatex` is plain text mixed with KaTeX math. Rendering algorithm:

1. `mergeSoftWrappedLines(value)`: display formulas (`$$…$$`, `\[…\]`) are shielded; every remaining line break is replaced
   by a space **unless** the previous line ends a sentence (`/[.!?…:;]["»')\]]*$/`), is empty, or the break is adjacent to a
   display formula. (Textbook PDFs wrap lines mid-sentence.)
2. Trim; split into **blocks** on blank lines (`/\n{2,}/`); drop empty blocks. No blocks → render nothing.
3. A block that is entirely `\[ … \]` → display formula.
4. Otherwise split the block into segments by `/(\$\$[\s\S]+?\$\$)/`: `$$…$$` segments → display formula; other segments →
   text lines (`split("\n")`, trimmed, empties dropped).
5. Text line: `splitLineIntoItems(line)` detects enumerated sub-items outside `$…$` — labels `а)`, `Б)`, `1)`, `10)` anywhere
   at a word start, and dot labels `а.` / `1.` only at the line start or when the line itself starts with a dot label. If
   labelled → items are laid out as a wrapping row (gap 28 horizontal / 12 vertical), each item kept unbroken as a unit;
   otherwise one paragraph. Inside a line/item, inline math is `$…$` (regex `/(\$[^$]+\$)/`), the rest is literal text.
6. Display formula: `splitMathIntoItems(math)` splits top-level labelled items (`А) … Б) …`, also `\text{А)}`), ignoring
   labels inside `{…}`, `\begin…\end` environments and parentheses; if labelled and > 1 item → each item rendered as inline
   math in `\displaystyle` in a wrapping row; else one block formula inside a **horizontally scrollable** container.
7. KaTeX errors: inline → small red chip with the error name; block → red box "`{name}: {message}`".
8. Math line-break rule (applied after layout to every formula): KaTeX may wrap between top-level `.base` segments; when a
   segment starts a new line and the previous segment ends with a binary/relation operator (`+ − = ⋅ ≥ …`), the operator is
   **repeated at the start of the new line** (followed by a thin space). Recomputed on width change.
9. Container: soft background, radius 16, padding 12, text 14px / line-height 28px, blocks spaced 16px.

### 4.9 Time zone

- The server runs with `TZ="Europe/Moscow"`; "today", timeline day keys, streaks and overdue logic on the server are Moscow
  time. Deadlines are stored as instants (UTC ISO strings on the wire).
- On the site the calendar groups deadlines by the **browser's local** calendar day, while the day-sheet header formats the
  date in `Europe/Moscow`; "today" highlight and overdue checks use the device clock. For mobile, use **Europe/Moscow
  consistently** for day bucketing, "today" and date labels (see Q2), so a deadline of "20 Nov 23:59 MSK" lands on 20 Nov for
  every user.
- Weekday index for a `DateKey`: `new Date(`${date}T12:00:00`).getDay()` mapped to Mon=0…Sun=6.

### 4.10 File access (see 3.7)

Mock rule set: a student may open `fileId` iff the file is the theory or homework file of some topic, or one of their own
solution photos; everything else behaves as "not found". Files are immutable; cache by id.

### 4.11 Mock data guidance

- Fixture topics: ordered list with `displayOrder`; some with `theoryFile` (mix of PDF, PNG/JPG, DOCX), some without (must
  not appear in S2).
- Fixture numbers: 6-digit strings with leading zeros (e.g. `051001…051009`) plus a few short ones (`7`, `12`) to exercise
  normalisation; several with `conditionLatex` covering inline `$…$`, `$$…$$`, `\[…\]`, labelled items "а) … б) …", and at
  least one invalid formula; some with `conditionLatex = null`.
- Fixture statuses for the mock student: rows with GREEN / YELLOW / RED / null-with-note, `statusChangedAt` spread over the
  last weeks so that the streak is non-trivial (include: today empty but yesterday active; a gap; a re-marked number).
- Fixture homeworks: titled and untitled (to exercise "ДЗ N"), with and without deadlines, overdue-unfinished, done-in-future,
  several on the same day, one in a neighbouring month's overflow cells.
- Mock latency 200–600 ms; ability to force 401 / 404 / 429 / 503 / network error per call.
- Seed accounts on the site (for later real-API testing): `ilya@example.com` / `maria@example.com`, password `student123`.

---

## 5. Realtime / polling behaviour

Mechanism on the site: one `EventSource("/api/realtime")` per signed-in tab (`components/dashboard-realtime-listener.tsx`),
fed by an **in-memory** pub/sub (`lib/dashboard-realtime.ts`, single-instance only).

Event union:

```ts
type DashboardRealtimeEvent =
  | { kind: "connected"; occurredAt: IsoDateTime }
  | { kind: "students-changed"; occurredAt: IsoDateTime }                                        // never delivered to students
  | { kind: "topic-content-changed"; occurredAt: IsoDateTime; topicId?: string }                 // delivered to every student
  | { kind: "student-progress-changed"; occurredAt: IsoDateTime; studentId: string; topicId?: string }   // only own
  | { kind: "student-deadlines-changed"; occurredAt: IsoDateTime; studentId: string; topicId?: string }  // only own
  | { kind: "lesson-activity"; occurredAt: IsoDateTime; lessonId: string; teacherId: string; studentId?: string }; // only own
```

Server-side filter for a STUDENT (`shouldReceiveDashboardRealtimeEvent`): `students-changed` → never;
`topic-content-changed` → always; everything else → only when `event.studentId === user.id`.

Client reactions for a STUDENT:

| Event | Reaction | Affects screens of this spec |
|---|---|---|
| `student-progress-changed` (own) | dispatch the streak event → `GET /api/student/streak` → update streak state (aborting any in-flight streak request). **No page refresh.** | S1 streak block (with ignite/grow/drop animation). Homework counters on S1/S4 and the status badge on S3 are *not* refreshed by this event. |
| `student-deadlines-changed` (own) | refresh the notifications bell **and** schedule a page data refresh | S1 hero/list, S4 calendar |
| `topic-content-changed` | schedule a page data refresh | S2 list, S3 condition/topic title, S1/S4 labels |
| `lesson-activity` (own) | schedule a page data refresh | (any current page; relevant to the lesson screen) |

"Schedule a page data refresh" = debounce: if no refresh is pending, wait **1500 ms**, then re-run the server data fetch
(`router.refresh()`); events arriving in that window are coalesced. If the tab is hidden, remember one pending refresh and run
it when the tab becomes visible again.

Who publishes: `student-progress-changed` — student note save, student photo upload/delete, AI homework check completion, lesson
item check, teacher manual status, teacher lesson result; `student-deadlines-changed` — homework issue/cancel, teacher deadline
edits; `topic-content-changed` — topic create/edit/reorder, number conditions/answers edits, topic import.

Other freshness mechanisms: no client polling on these screens. Server data caches: homework deadlines 15 s TTL, theory
library 60 s, progress timeline 300 s — all tag-invalidated immediately on writes.

Mobile recommendation: v1 (mock) — refetch on screen focus, on app foreground, and on pull-to-refresh; the mock API client can
expose `subscribe(listener)` emitting the same event union so the UI logic is written once. Real server later: SSE via a
bearer-authenticated stream (or WebSocket / push), keeping the same event kinds, the 1.5 s debounce and the "refresh when
foregrounded" rule. Respect the 2-connections-per-user limit (close the stream in background).

---

## 6. Proposed mobile API contract (REST/JSON) for this subsystem

Conventions: base path `/api/mobile/v1`; `Authorization: Bearer <token>`; `Accept-Language: ru | en` (replaces the
`shbz-lang` cookie; default `ru`); all timestamps ISO-8601 UTC; all calendar dates `YYYY-MM-DD` in Europe/Moscow.
Error envelope (adds a stable code to the site's localised message):

```ts
type ApiError = {
  error: {
    code:
      | "SESSION_EXPIRED"        // 401
      | "FORBIDDEN"              // 403
      | "STATUS_READ_ONLY"       // 403 (topic-status with `status`)
      | "INVALID_DATA"           // 400
      | "INVALID_NUMBER"         // 400
      | "NUMBER_NOT_FOUND"       // 404
      | "FILE_NOT_FOUND"         // 404 (missing or not permitted — indistinguishable by design)
      | "RATE_LIMITED"           // 429 (+ Retry-After header, retryAfterSeconds)
      | "SERVICE_UNAVAILABLE";   // 503
    message: string;             // localised, same texts as the site dictionaries
    retryAfterSeconds?: number;
  };
};
```

All endpoints below require role STUDENT (401 `SESSION_EXPIRED` otherwise).

### 6.1 `GET /student/home`

```ts
type StudentHomeResponse = {
  serverNow: IsoDateTime;                 // for overdue checks independent of device clock
  today: DateKey;                         // Moscow date
  deadlines: HomeworkDeadlineSummary[];   // ALL homeworks of the student (client filters/sorts as in 4.5)
  streak: StudentStreak;
};
```

Rate limit suggestion: 120 / 60 s.

### 6.2 `GET /student/homework-deadlines`

```ts
type HomeworkDeadlinesResponse = { serverNow: IsoDateTime; today: DateKey; items: HomeworkDeadlineSummary[] };
```

Used by the calendar (and reusable by home). Order: `createdAt asc` (as on the site); client sorts by deadline.

### 6.3 `GET /student/streak`

```ts
type StreakResponse = { streak: StudentStreak };   // identical to the site's /api/student/streak
```

Rate limit 120 / 60 s.

### 6.4 `GET /student/theory`

```ts
type TheoryLibraryResponse = {
  topics: Array<{
    id: string;
    title: string;
    description: string;
    theoryFile: { id: string; originalName: string; mimeType: string; size: number; uploadedAt: IsoDateTime };
  }>;
};
```

Only topics with a theory file, ordered by `displayOrder asc, createdAt asc`.

### 6.5 `GET /student/numbers/lookup?number={digits}`

```ts
type NumberLookupResponse = {
  number: string;            // recorded form
  homeworkNumberId: string;
  topicId: string;
  topicTitle: string;
};
```

Validation: `/^\d{1,20}$/`, normalised ≠ "0" → else 400 `INVALID_NUMBER`; no match → 404 `NUMBER_NOT_FOUND`.
Rate limit 120 / 60 s. (Site equivalent returns `{ href }`.)

### 6.6 `GET /student/numbers/{number}`

`{number}` = digits (recorded or normalised form; both resolve). Combines `findTopicIdByNumber` + `getStudentNumberDetail`.

```ts
type StudentNumberDetailResponse = {
  topic: { id: string; title: string; description: string };
  number: {
    id: string;
    number: string;
    conditionLatex: string | null;
    status: HomeworkNumberStatus | null;
    note: string;                         // "" when none
    deadlineAt: IsoDateTime | null;
    statusUpdatedAt: IsoDateTime | null;  // row.updatedAt, null when no row
  };
  notesEnabled: boolean;
};
```

Errors: 400 `INVALID_NUMBER` (not digits), 404 `NUMBER_NOT_FOUND`. Never includes answers.

### 6.7 `PUT /student/numbers/{homeworkNumberId}/note`

```ts
type SaveNoteRequest = { note: string };                 // trimmed + cut to 240 by the server; "" clears
type SaveNoteResponse = { ok: true; status: HomeworkNumberStatus | null; note: string; notesEnabled: boolean };
```

Errors: 400 `INVALID_DATA` (missing `note`), 403 `STATUS_READ_ONLY` if the body contains `status`, 404 `NUMBER_NOT_FOUND`,
429 (90 / 60 s). Side effects as in 3.3 (creates/updates/deletes the per-student row, emits `student-progress-changed`).
(Site equivalent: `POST /api/student/topic-status` with `{ topicId, homeworkNumberId, note }`; the mobile route drops the
redundant `topicId`.)

### 6.8 Files

- `GET /files/{fileId}` — binary, same semantics/headers as 3.7 (`?download=1`, `?thumb=1`, ETag/304, immutable cache),
  authenticated with the bearer token. 401 / 404 (`FILE_NOT_FOUND` for both "missing" and "not permitted") / 429.
- `POST /files/{fileId}/access-url` → `{ url: string; expiresAt: IsoDateTime }` — short-lived signed URL (suggested 5 min) for
  viewers that cannot attach headers (system browser, share sheet, some PDF/WebView components).

### 6.9 Realtime

- `GET /realtime` — SSE with the event union of section 5 (student-visible kinds only), heartbeat every 25 s, max 2
  connections per user, connect rate 30 / 60 s. Optional in v1; the mock implements an in-process emitter.

### 6.10 Exam info

No endpoint: bundle `EGE_PROFILE_SCALE`, thresholds, OGE ranges and the dictionary texts in the app (section S5).

### 6.11 Typed client interface (what the mock implements now)

```ts
interface StudentStudyApi {
  getHome(): Promise<StudentHomeResponse>;
  getHomeworkDeadlines(): Promise<HomeworkDeadlinesResponse>;
  getStreak(): Promise<StreakResponse>;
  getTheoryLibrary(): Promise<TheoryLibraryResponse>;
  lookupNumber(number: string): Promise<NumberLookupResponse>;
  getNumberDetail(number: string): Promise<StudentNumberDetailResponse>;
  saveNumberNote(homeworkNumberId: string, note: string, signal?: AbortSignal): Promise<SaveNoteResponse>;
  getFileUrl(fileId: string, opts?: { download?: boolean; thumb?: boolean }): Promise<{ url: string; headers?: Record<string, string> }>;
  subscribe(listener: (event: DashboardRealtimeEvent) => void): () => void;
}
```

Pure helpers to port verbatim into the app (no server needed): `normalizeHomeworkNumber`, `compareHomeworkNumbers`,
`completionPercent`, `isHomeworkOverdue`, `mapStudentHomeworksToDeadlineItems` (status + sort), upcoming selection (S1),
calendar grid builder (42 cells, Monday first), `getStudentStreakColorMeta`, `getDayOfWeekIndex`, `format`, `plural`,
`mergeSoftWrappedLines` / `splitLineIntoItems` / `splitMathIntoItems`. The mock additionally needs `buildStudentStreak` and the
timeline builder (4.3) to derive the streak from fixture statuses.

---

## 7. Open questions / things that cannot be done natively as-is

- **Q1. LaTeX rendering.** The site uses KaTeX (HTML/CSS) plus a DOM post-processing script for the "repeat the operator on
  the next line" rule. There is no equivalent native renderer. Suggested: render each condition in a small auto-height
  `WebView` with bundled KaTeX CSS/fonts and the same inline script (reuse `MATH_LINE_BREAKS_SCRIPT` and the block/segment
  splitting from 4.8); cache rendered heights. Alternative (lower fidelity): `react-native-math-view`/MathJax SVG without the
  line-break rule. Decide before building S3 (and the homework/lesson screens that show conditions).
- **Q2. Time zone for the calendar and "today".** The site mixes device-local day bucketing with a Moscow-formatted day
  label. Proposal: use Europe/Moscow everywhere on mobile (bucketing, today ring, overdue, labels) and have the API return
  `serverNow`/`today`. Confirm with the owner whether students outside MSK should instead see device-local dates.
- **Q3. Authenticated file viewing.** The site relies on the session cookie for `<iframe>`/`<img>`/new-tab access to
  `/files/{id}`; on a touch device it simply opens the PDF in a new browser tab. Native viewers need either header support or
  a signed short-lived URL (6.8). Also decide the DOCX strategy (download + OS "open with" vs. server-side conversion to PDF).
  In the mock, ship 2–3 bundled sample files (PDF, PNG, DOCX).
- **Q4. Back target of the number screen.** The site always links back to `/student/homeworks` ("← К моим ДЗ") although the
  screen is reached from the search on any page. Proposal: native back to the previous screen; no hard-coded target.
- **Q5. Placement of the number search and of `Теория` / `Общая инфа` in the tab bar.** The site repeats the search under
  every page title and has 6 student tabs + settings. A phone tab bar fits ~5. Needs a product decision (see 0.4).
- **Q6. Status freshness on the number card and homework counters.** On the site an own `student-progress-changed` event only
  updates the streak; S1/S4 counters and the S3 badge update on the next navigation/refresh. Proposal for mobile: on that
  event (or on focus) also refetch the visible screen's data — a strictly better behaviour; confirm it is acceptable to
  diverge.
- **Q7. Streak window.** The streak is computed over a 112-day window, so `currentStreak`/`bestStreak` can never exceed 112
  while the colour ladder goes up to 1000 days. Keep as is for parity, or ask the owner whether the future API should compute
  an unbounded streak.
- **Q8. Number lookup scope.** Search finds any number in any topic (not only assigned homework) and, for duplicates across
  topics, the first topic in display order. Confirm this is intended for mobile as well (the contract in 6.5/6.6 mirrors it).
- **Q9. Unused data on the theory card.** Description, file name, size and date are fetched but hidden by owner's decision.
  On a phone list a secondary line (e.g. file type "PDF") may help; default to parity (title + button only) unless approved.
- **Q10. Error payloads.** Site APIs return only a localised `error` string. The mobile contract proposes stable `code`s
  (section 6); the future server must add them. Until then the mock should produce both `code` and `message`.
- **Q11. Realtime transport.** The site's SSE hub is in-memory (single server instance) and cookie-authenticated. For mobile
  the real server needs bearer-authenticated SSE/WebSocket or push notifications; v1 mock uses focus-refetch plus an
  in-process emitter.
- **Q12. Offline behaviour for the note.** The site has none (a failed save shows a banner and the text stays in the field).
  Proposal: keep the draft locally and retry on reconnect/next focus; confirm.
- **Q13. `/student/info` role gate.** The site lets any signed-in role open it by URL. On mobile it is simply part of the
  student navigation; no action needed unless teachers should see it too.
