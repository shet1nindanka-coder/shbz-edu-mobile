# 03 — Student: homeworks, solution photos, AI check, live lesson

Source of truth: the Next.js site in `/home/user/web_shetya` (read-only). Every value below was read from code;
file references are given so a reviewer can verify. UI copy is referenced by dictionary key path (`dict.…`),
with the Russian (default) and English text quoted for the important strings.

Scope of this document (role `STUDENT` only):

| Site route | Screen |
|---|---|
| `/student/homeworks` | H1 Homework list ("Мои ДЗ") |
| `/student/homeworks/[assignmentId]` | H2 Homework detail: H2.a photo batch, H2.b AI check, H2.c numbers |
| (new tab `/files/{fileId}`) | H3 Photo viewer |
| (modal) | H4 Delete-photo confirmation |
| `/student/lesson` (no active lesson) | L1 Lesson tab — waiting state |
| `/student/lesson` (lesson is ACTIVE) | L2 Lesson tab — live lesson |

Out of scope (other spec files): login/shell/notification bell (`01-shell-auth.md`), student home, theory,
number detail `/student/numbers/[number]`, deadlines, number-search control (`02-student-study.md`), all teacher
and developer views of the same data (review gallery, lesson board, attendance table, dev panel).

Files read: `app/(dashboard)/student/homeworks/page.tsx`, `…/homeworks/[assignmentId]/page.tsx`,
`…/student/lesson/page.tsx`, `components/student-homework-submissions.tsx`, `student-homework-photos.tsx`,
`student-homework-check.tsx`, `student-single-number-card.tsx`, `student-lesson-view.tsx`,
`lesson-start-watcher.tsx`, `deadline-list.tsx`, `homework-status-badge.tsx`, `delete-button.tsx`,
`dashboard-realtime-listener.tsx`, `latex-answer-preview.tsx`; API routes `app/api/student/homework-submissions`,
`homework-checks`, `lesson`, `lesson-submissions`, `topic-status`, `homeworks/find-number`, `app/files/[fileId]`,
`app/api/realtime`; libs `platform-data.ts` (`getStudentHomeworks`, `getStudentLiveLesson`), `solution-check.ts`,
`solution-check-queue.ts`, `solution-check-status.ts`, `solution-check-student-view.ts`,
`solution-check-error-text.ts`, `solution-check-parse.ts`, `solution-check-history.ts`, `check-queue-state.ts`,
`lesson-live.ts`, `lesson-status.ts`, `lesson-finalize.ts`, `lesson-item-check.ts`, `attendance.ts`,
`progress-policy.ts`, `homework-attention.ts`, `homework-label.ts`, `site-settings.ts`, `upload-validation.ts`,
`api-rate-limit.ts`, `persistent-rate-limit.ts`, `file-access.ts`, `image-thumbnail.ts`,
`dashboard-realtime.ts`, `notification-text.ts`, `utils.ts`, dictionaries `student.ts`, `api-student.ts`,
`api-common.ts`, `topics.ts` (upload texts), `ru.ts`/`en.ts`, and `prisma/schema.prisma`.

---

## 0. Shared context

### 0.1 Enums and primitives (prisma/schema.prisma)

```ts
type Locale = "ru" | "en";                                   // default "ru"; Intl tag: ru → "ru-RU", en → "en-GB"
type IsoDateTime = string;                                   // Date.toISOString() (UTC)

type HomeworkNumberStatus = "GREEN" | "YELLOW" | "RED";      // null = not marked
type SolutionCheckStatus  = "PENDING" | "CHECKING" | "DONE" | "FAILED";
type SolutionVerdict      = "CORRECT" | "INCORRECT" | "UNCERTAIN";
type LessonItemResult     = "SOLVED" | "PARTIAL" | "NOT_SOLVED" | "SKIPPED";   // null = no result yet
type LessonStatus         = "PLANNED" | "ACTIVE" | "FINISHED";                  // stored AND derived (see 4.6)
type LessonKind           = "LESSON" | "HOMEWORK";           // only LESSON is a live lesson
type AttendanceStatus     = "UNKNOWN" | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";  // never shown to the student
```

Problem numbers are **strings** with significant leading zeros (`"010203"`). Comparison/sorting uses the
normalised form (`normalizeHomeworkNumber`: strip leading zeros, keep at least one digit) and
`compareHomeworkNumbers` (shorter normalised string first, then lexicographic) — i.e. numeric order without
`Number()`.

### 0.2 Status colours and labels

| Status | `dict.status.X.label` ru / en | `dict.status.X.shortLabel` ru / en |
|---|---|---|
| `GREEN` | Решен с первого раза / Solved on the first try | Зеленый / Green |
| `YELLOW` | Исправлен после самопроверки / Fixed after self-check | Желтый / Yellow |
| `RED` | Нужна помощь преподавателя / Needs the teacher's help | Красный / Red |
| `null` | `dict.student.statusBadge.unmarked`: Не отмечено / Not marked | — |

The student **cannot change a status** anywhere. Statuses are written only by the AI homework check, the AI lesson
check, end-of-lesson finalisation and the teacher (`dict.student.numberCard.statusHint`: «Статус выставляется
автоматической проверкой решения или учителем.» / "The status is set by the AI check or by your teacher.").

### 0.3 Runtime limits (lib/site-settings.ts) that affect the student

Managed by the developer panel, 15 s in-memory cache. Defaults / allowed range:

| Setting | Default | Range | Used for |
|---|---|---|---|
| `maxPhotosPerAssignment` | 10 | 1…30 | photos attached to one homework at the same time (one batch) |
| `aiEnabled` | true only if `AI_CHECK_API_KEY` + `AI_CHECK_MODEL` are set | bool | master switch for both checks |
| `lessonCheckEnabled` | same default as `aiEnabled` | bool | lesson check switch (needs `aiEnabled` too) |
| `aiPerStudentHourlyLimit` | 10 | 1…1000 | homework-check starts per student per hour |
| `aiDailyLimit` | 300 (or env `AI_CHECK_DAILY_LIMIT`) | 1…100000 | homework-check starts, whole school, per 24 h |
| `lessonCheckPerStudentHourlyLimit` | 30 | 1…1000 | lesson submissions per student per hour |
| `lessonCheckDailyLimit` | 300 | 1…100000 | lesson submissions, whole school, per 24 h |
| `aiMinConfidence` | 0.6 | 0…1 | verdicts below it become `UNCERTAIN` |
| `aiCheckConcurrency` | 3 | 1…8 | parallel check workers |
| `completedChecksKept` | 50 | 1…500 | finished homework checks kept per student (older ones + their photos are deleted) |
| `photoRetentionDays` | 365 (env `HOMEWORK_PHOTO_RETENTION_DAYS`; 0 = off) | 0…3650 | age-based deletion of all solution photos |

Hard-coded constants:

| Constant | Value | File |
|---|---|---|
| `LESSON_SUBMISSION_MAX_PHOTOS` | 3 photos per lesson submission | lib/lesson-live.ts |
| `MAX_UPLOAD_SIZE_BYTES` | 15 MiB = 15 728 640 bytes (per file AND per request total) | lib/upload-validation.ts |
| `MAX_MULTIPART_OVERHEAD_BYTES` | 512 KiB (request body ≤ 15 MiB + 512 KiB) | both upload routes |
| `MAX_ORIGINAL_FILE_NAME_LENGTH` | 255 chars | lib/upload-validation.ts |
| `MAX_CHECK_QUEUE` | 60 waiting tasks (shared by homework + lesson checks) | lib/solution-check-queue.ts |
| stale `PENDING` threshold | 15 min | solution-check.ts / lesson-item-check.ts |
| stale `CHECKING` threshold | 45 min | same |
| model timeout | 180 s per attempt, up to 3 attempts | solution-check.ts |
| note length | 240 chars | topic-status route + textarea `maxLength` |
| `LESSON_FINALIZE_WINDOW_MS` | 48 h | lib/lesson-finalize.ts |
| lesson duration | 15…240 min (default 60) | lib/lesson-plan.ts |
| poll base delay / max failures | 4000 ms / 5 | both client components |
| `LESSON_START_CHECK_INTERVAL_MS` | 30 000 ms | lib/lesson-status.ts |
| realtime refresh debounce | 1500 ms | dashboard-realtime-listener.tsx |

### 0.4 Time and formatting

- The server runs with `TZ=Europe/Moscow`; "now", overdue and lesson windows are absolute instants, but all
  human-readable dates on these screens are rendered in Moscow time (server components use the server TZ; the
  lesson view formats clock time with an explicit `timeZone: "Europe/Moscow"`).
- `formatDate(value, locale)` → `Intl.DateTimeFormat(tag, { day: "2-digit", month: "long", year: "numeric" })`
  (ru: «20 ноября 2026 г.», en-GB: "20 November 2026"); empty → `dict.common.noDate` «Без даты» / "No date".
- `formatDateTime(value, locale)` → `{ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }`
  (ru: «20.11.2026, 23:59»).
- Lesson clock time: `toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })`.
- `format(template, params)` replaces `{name}` placeholders. `plural(locale, n, forms)`: ru picks form 0 for
  n%10==1 && n%100!=11, form 1 for n%10 in 2..4 && n%100 not in 12..14, else form 2; en picks form 0 for n==1 else form 1;
  the chosen form gets `{n}` substituted.

### 0.5 "Hints" (`ui-hint`)

Texts marked "(hint)" below carry the CSS class `ui-hint`: they are hidden when the user turns off interface hints
in settings (see spec 01). Texts not marked that way are always visible.

---

## 1. Screens

### H1 — Homework list

- **Route:** `/student/homeworks`. **Role:** STUDENT only (`requireUser(UserRole.STUDENT)`; other roles are
  redirected to their role home, anonymous → `/login`).
- **Purpose:** all homework assignments issued to this student, ordered by "needs attention", with per-number
  status chips and progress.
- **Data:** `getStudentHomeworks(user.id)` → `{ assignmentsEnabled, notesEnabled, assignments }` (cached 15 s, see 5.4).

Layout top to bottom:

1. **Page header** — kicker `dict.student.homeworks.kicker` («Домашние задания» / "Homework"), title
   `dict.student.homeworks.title` («Мои ДЗ» / "My homework"), aside: number-search control with endpoint
   `/api/student/homeworks/find-number` (control C1 of spec 02; route documented in 3.9).
2. **State A — feature unavailable** (`assignmentsEnabled === false`, DB table missing): warning notice
   `dict.student.homeworks.migrationNotice` («Раздел ДЗ появится после обновления базы данных до актуальной версии.» /
   "The homework section will appear once the database is updated to the latest version."). The mobile app can
   treat this as a generic "section unavailable" state.
3. **State B — empty** (`assignments.length === 0`): dashed panel, title `dict.student.homeworks.emptyTitle`
   («ДЗ пока не выдано» / "No homework yet"), hint `dict.student.homeworks.emptyHint` («Когда учитель выдаст ДЗ, оно
   появится здесь.» / "Homework your teacher assigns will show up here.").
4. **State C — list.** Assignments are split client-side into:
   - **active** = not completed; **archived** = completed, where
     `completed = totalNumbers > 0 && solvedCount === totalNumbers` (`solvedCount` = GREEN + YELLOW numbers).
   - Active cards are rendered first, in the server order (attention sort, 4.1).
   - If there are **no active** cards: inline pill `dict.student.submissions.allDone` («Все ДЗ выполнены — новых пока
     нет.» / "All homework is done — nothing new yet.").
   - If there are archived cards: a collapsed disclosure (`<details>`) with summary
     `dict.student.submissions.archived` («Выполненные ДЗ ({count})» / "Completed homework ({count})") and a chevron
     that rotates when open; inside — the archived cards (same card component).

**Homework card** (one per assignment):

| Element | Content |
|---|---|
| Title line | `"{label} · {topicTitle}"`. `label` = custom `title` or `dict.common.homeworkN` («ДЗ {n}» / "Homework {n}") with `n = orderInTopic` |
| Badge "done" | shown if completed: `dict.student.deadlineList.doneBadge` («Выполнено» / "Done"), green soft |
| Badge "overdue" | shown if `isHomeworkOverdue(deadlineAt, completed)` = has deadline, not completed, `deadline < now`: `dict.student.deadlineList.overdueBadge` («Просрочено» / "Overdue"), red soft |
| Meta line | concatenation of: `deadlineAt ? format(dict.student.submissions.deadlineUntil, {date: formatDate(deadlineAt)}) : ""` («ДЗ до {date} · » / "Due {date} · ") + `format(dict.student.submissions.solvedOf, {solved, total})` («Выполнено {solved} из {total}» / "{solved} of {total} done") + `photosCount > 0 ? format(dict.student.submissions.photos, {count}) : ""` (« · Фото: {count}» / " · Photos: {count}") |
| Primary button | `dict.student.submissions.open` («Открыть ДЗ» / "Open homework") → H2 |
| Number chips | one chip per number, text `№ {number}`, sorted numerically; coloured by status (GREEN/YELLOW/RED surface), neutral when `null`. A11y label `dict.student.submissions.numberAria` («№ {number} — {status}») with `status` = `dict.status[status].label` or `dict.student.submissions.numberUnmarked` («номер ещё не отмечен» / "not marked yet"). Chips are **not** tappable |
| Progress bar | fill width = `solvedPercent` % (`Math.round(solved / total * 100)`, 0 when total is 0) |

`photosCount` = photos **currently attached** (the current, not yet checked batch), not the historical total.

- **Loading:** server-rendered page; the app shows the generic student skeleton (`app/(dashboard)/student/loading.tsx`).
- **Errors:** page-level failures go to the shell error boundary (spec 01). No inline errors on this screen.
- **Mobile translation:** a tab-root screen ("ДЗ" / "homework" tab — third item of the student nav:
  overview, lesson, homework, deadlines, theory, info, settings). FlatList/SectionList with two sections
  ("active", collapsible "Выполненные ДЗ (N)"). The whole card should be tappable (push H2) in addition to the
  button. Pull-to-refresh re-fetches. Number search → header search icon opening the shared search sheet.

### H2 — Homework detail

- **Route:** `/student/homeworks/[assignmentId]`. **Role:** STUDENT, **owner only**: the page looks the id up in
  the student's own list; if the feature is unavailable or the id is not in the list → 404 (`notFound()`).
- **Data:** `getStudentHomeworks(user.id)` (the same cached read as H1, the page picks one entry) +
  `getSiteSettings().maxPhotosPerAssignment`.

Layout top to bottom:

1. **Back link** `dict.student.homework.backToAll` («← Ко всем ДЗ» / "← All homework") → H1.
2. **Header** — kicker = `topicTitle`, title = `label` (same rule as H1), aside = number search.
3. **Meta line** — `deadlineAt ? format(dict.student.homework.deadlineUntil, {date: formatDateTime(deadlineAt)}) + " · " : ""`
   («Дедлайн до {date}» / "Due {date}") + `format(dict.student.homework.solvedOf, {solved, total})`
   («Выполнено {solved} из {total}» / "{solved} of {total} done"), then the same Done / Overdue badges as H1.
4. **One card with two blocks** separated by a divider:
   - **H2.a "Фото решений"** (photo batch),
   - **H2.b "Автоматическая проверка"** (AI check).
5. **Section "Номера"** (`dict.student.homework.numbers`: «Номера» / "Problems") — **H2.c**, one card per number,
   sorted numerically. Each card has the anchor id `number-{number}` (target of the "redo" button).

#### H2.a — Photo batch block (`StudentHomeworkPhotos`)

Props: `assignmentId`, `maxPhotos` (= `maxPhotosPerAssignment`), `photos: {id, fileId, originalName}[]`
(current batch, oldest first).

| Element | Behaviour |
|---|---|
| Title | `dict.student.photos.title` («Фото решений» / "Solution photos") |
| Subtitle (hint) | `dict.student.photos.subtitle` («Учитель увидит их при проверке» / "Your teacher will see them when reviewing") |
| Counter pill | `"{photos.length} / {maxPhotos}"` |
| Error notice | red notice above the drop zone with the server `error` text, or `dict.student.photos.uploadFailed` («Не удалось загрузить фото.» / "Could not upload the photos.") / `deleteFailed` («Не удалось удалить фото.» / "Could not delete the photo.") |
| Drop zone / picker | accepts `image/png,image/jpeg`, **multiple**. Disabled while uploading or when `photos.length >= maxPhotos`. Title: uploading → `dict.student.photos.uploading` («Загружаем…» / "Uploading…"); at limit → `format(dict.student.photos.limitReached, {max})` («Лимит партии — {max} фото. Отправьте их на проверку, после неё можно прикрепить следующие» / "Batch limit — {max} photos. Send them for a check; after it you can attach the next ones"); otherwise `dropHint` («Перетащите фото сюда или нажмите» / "Drop photos here or click"). Drag title `dragTitle` («Отпустите файлы»), success flash `successTitle` («Файлы добавлены» / "Files added"). Shows the real upload percentage (XHR `upload.onprogress`) |
| Zone subtitle (hint) | `format(dict.student.photos.upTo, {max})` («До {max} фото на одну проверку · PNG или JPG. После проверки фото уходят в историю, и можно прикрепить следующие» / "Up to {max} photos per check · PNG or JPG. After the check the photos move to history and you can attach the next ones") |
| Thumbnails | 96×96 px, `src=/files/{fileId}?thumb=1` (WebP ≤ 320 px wide), `alt`/`title` = `originalName`. Tap → opens `/files/{fileId}` (original) in a new tab (H3) |
| Delete (×) on each thumb | opens confirmation H4; on confirm `DELETE /api/student/homework-submissions {photoId}` then page refresh |
| Pending cards | right after picking, each chosen file is shown as a local preview with an "uploading" shimmer until the server answers; removed on success (replaced by real photos after refresh) or on error |

Upload flow: one `POST /api/student/homework-submissions` (multipart: `assignmentId`, `files` × N) for all picked
files → success plays the zone confirmation and refreshes the page data; failure shows the server message. The
client does **not** pre-check how many slots remain — the server answers 400 `photoLimit` if
`attached + picked > maxPhotos` and **nothing** from that request is saved (all-or-nothing).

Photos can be added/deleted while a check is running; the running check works on the snapshot taken at start
(see 4.2).

#### H2.b — AI check block (`StudentHomeworkCheck`)

Props: `assignmentId`, `hasPhotos` (`photos.length > 0`), `initialCheck` = student-facing snapshot of the **latest**
check of this assignment (or `null`).

| Element | Behaviour |
|---|---|
| Title | `dict.student.check.title` («Автоматическая проверка» / "AI check") |
| Subtitle (hint) | `dict.student.check.subtitle` («Сверит фото с эталонными ответами» / "Compares your photos with the answer key") |
| Start button | label: running → `dict.student.check.running` («Проверяется…» / "Checking…"); request in flight → `starting` («Запускаем…» / "Starting…"); else `start` («Проверить решение» / "Check solution"). **Disabled** when `!hasPhotos \|\| isStarting \|\| isRunning`. Tooltip when no photos: `needPhotos` («Сначала прикрепите фото решения» / "Attach solution photos first") |
| Start error | red notice with the server `error` or `dict.student.check.startFailed` («Не удалось запустить проверку.» / "Could not start the check.") |
| Running hint | while running: `dict.student.check.runningHint` («Решение проверяется — обычно это занимает до минуты. Страница обновится сама.» / "Checking your solution — this usually takes up to a minute. The page refreshes on its own.") |
| Poll broken | after 5 consecutive failed polls: `dict.student.check.pollBroken` («Не получается узнать статус проверки — соединение с сервером прерывается. Обновите страницу через минуту.» / "Can't get the check status — the connection to the server keeps dropping. Reload the page in a minute."). The block leaves the running state (button re-enabled) |
| FAILED | red text = `humanizeSolutionCheckError(check.error, dict.student.checkErrors)` (table 4.5) — the raw provider text is never shown |
| DONE, no results | `dict.student.check.statusDoneEmpty` («На этих фото не нашлось ни одного номера из задания. Фото ушли в историю проверок — прикрепите следующую партию.» / "None of the assigned problems were found in these photos. They went to the check history — attach the next batch.") |
| DONE with results | see below |
| Live region (a11y only) | running → `statusRunning` («Проверка решения выполняется.»); DONE → `format(statusDone, {correct, incorrect, uncertain})` («Проверка завершена. Верно: {correct}, перерешать: {incorrect}, на проверке учителя: {uncertain}.»); FAILED → `statusFailed` («Проверка не удалась.») |

`isRunning = !pollBroken && (check.status === "PENDING" || check.status === "CHECKING")`.

**DONE with results** (top to bottom):

1. `format(dict.student.check.checkedAt, {date: formatDateTime(checkedAt)})` («Проверено: {date}» / "Checked: {date}"), if `checkedAt`.
2. Counter chips (each only if count > 0): green `format(correctCount, {n})` («Верно {n}» / "Correct {n}"); red
   `"✗ " + format(incorrectCount, {n})` («Перерешать {n}» / "Redo {n}"); neutral `"⏳ " + format(uncertainCount, {n})`
   («На проверке учителя {n}» / "Under teacher review {n}").
3. Result rows, sorted by number, each with a 3 px left stripe in the verdict colour:
   - `№ {number}` + verdict pill `dict.student.check.verdicts[verdict]`:
     `CORRECT` «Верно» / "Correct" (green); `INCORRECT` «Перерешай» / "Redo" (red);
     `UNCERTAIN` «Не распознано — проверит учитель» / "Not recognised — teacher will check" (neutral).
   - recognised answer, only when `verdict !== "UNCERTAIN"` and `recognizedAnswer` is non-empty:
     `format(dict.student.check.answer, {answer: shortenRecognizedAnswer(recognizedAnswer)})` («Ответ: {answer}» / "Answer: {answer}").
     Shortening: split by `;`, trim, drop empties; if ≥ 5 parts **and** length > 80 → `"{p0}; {p1}; …; {pLast}"`;
     else if length > 140 → first 137 chars (right-trimmed) + `…`; else as is. Full text available on long-press/tooltip.
   - `comment` paragraph if present (for `UNCERTAIN` it is always the fixed neutral text, see 4.4).
   - for `INCORRECT`: outline button `format(dict.student.check.redo, {number})` («Перерешать № {number}» / "Redo No. {number}")
     which scrolls to the number card `number-{number}` in H2.c and focuses it; next to it (hint) `redoHint`
     («Затем замените фото с решением и запустите проверку ещё раз.» / "Then replace the solution photo and run the check again.").

Notes:
- Only the **latest** check is shown. There is no check history for the student. A previous `DONE` result stays
  visible (even days later) until a new check is started.
- After `DONE` the checked photos disappear from H2.a (they were detached, 4.2), the counter becomes `0 / max`
  and the Start button is disabled until new photos are attached.
- Numbers of the assignment that the model did not find on the photos have **no row** at all.

#### H2.c — Number cards (`StudentSingleNumberCard`)

Per number: `topicId`, `homeworkNumberId`, `number`, `conditionLatex`, `status`, `note`, `notesEnabled`.

| Element | Behaviour |
|---|---|
| Card title | `format(dict.student.numberCard.title, {number})` («Номер {number}» / "Problem {number}") |
| Heading row | `№ {number}` + status badge (0.2: short label «Зеленый/Желтый/Красный» or «Не отмечено»). Read-only |
| Status hint (hint) | `dict.student.numberCard.statusHint` |
| Condition | only if `conditionLatex`: kicker `dict.student.numberCard.condition` («Условие» / "Problem statement") + rendered LaTeX (4.10) |
| Note | only if `notesEnabled`: kicker `dict.student.numberCard.note` («Заметка» / "Note"), textarea `maxLength=240`, 2 rows, placeholder `notePlaceholder` («Заметка для себя: что не понял, что спросить у учителя…» / "A note to yourself: what's unclear, what to ask the teacher…"), a11y `noteAria` («Заметка к номеру {number}»). Autosave: debounce **650 ms** after the last keystroke and immediately on blur; only if trimmed text differs from the last saved one; a newer save aborts the in-flight one. Indicator: `saving` («Сохраняем…» / "Saving…") while in flight, then `saved` («Сохранено» / "Saved") for **1600 ms** |
| Save error | red notice at the top of the card: server `error` or `noteSaveFailed` («Заметка не сохранилась.» / "Could not save the note.") |

The reference answer (`answerLatex`) is **never** sent to the student (set to `null` for role STUDENT in
`getTeacherStudentHomeworksUncached`).

- **Loading / empty / error states of H2:** 404 when the homework does not exist or is not the student's (also
  after the teacher cancelled it). All mutations show inline errors as described.
- **Mobile translation:** pushed stack screen from H1 (and from deadlines/home links). ScrollView with: header
  (topic kicker, title, meta + badges) → "Фото решений" block (horizontal thumbnail strip or 3-column grid; the
  "add" tile opens an action sheet **Camera / Photo library**; upload progress bar) → "Автоматическая проверка"
  block with a full-width primary button and results list → "Номера" list. The "Перерешать № N" button scrolls
  the ScrollView to that number card. Delete → native confirmation (H4). Photo tap → full-screen viewer (H3).
  Keep polling alive only while the screen is focused and the app is foregrounded; on focus re-fetch the detail.

### H3 — Photo viewer

- **Site:** plain link to `/files/{fileId}` opened in a new browser tab (original image, `inline`).
- **Access:** session cookie required; a student may read a solution photo only if it is attached to **their**
  homework, to a check of **their** homework, or to **their** lesson submission; otherwise `404 Not found`
  (also 401 `Unauthorized` plain text when not signed in). Rate limit `api:file-read` 120 requests / 60 s per
  user — thumbnails count too.
- **Mobile:** full-screen modal image viewer with pinch-zoom and swipe between the photos of the current batch.

### H4 — Delete-photo confirmation

Modal `ConfirmDialog` (texts: `dict.student.photos.*` + `dict.topics.widgets.confirm.*`):

| Part | ru / en |
|---|---|
| kicker | Подтверждение / Confirmation |
| title `deleteTitle` | Удалить фото? / Delete photo? |
| description `deleteDescription` | Фото решения будет удалено. Это действие нельзя отменить. / The solution photo will be deleted. This can't be undone. |
| confirm | Да, удалить / Yes, delete (pending: Удаляем… / Deleting…) |
| cancel | Отмена / Cancel |
| trigger a11y `deleteAria` | Удалить фото / Delete photo |

On error the dialog closes and the error notice of H2.a shows the message. **Mobile:** `Alert.alert` /
destructive action sheet.

### L1 — Lesson tab, waiting state

- **Route:** `/student/lesson` (`force-dynamic`). **Role:** STUDENT.
- **Server work on every open:** (1) `finalizeRecentlyFinishedLessons({studentId})` — lazy closing of lessons of
  this student that ended within the last 48 h (4.8); (2) `serverNow = Date.now()` taken **before** the data read;
  (3) `getStudentLiveLesson(user.id)` → `{ active, upcoming }`.
- Shown when `active === null`.

Layout:

1. Header: kicker `dict.student.lesson.kicker` («Классная работа» / "Classwork"), title `dict.student.lesson.title` («Урок» / "Lesson").
2. Card:
   - title `dict.student.lesson.noLessonTitle` («Сейчас урока нет» / "No lesson right now");
   - if `upcoming`: `format(dict.student.lesson.upcoming, {title, date: formatDateTime(startsAt), group: groupName ? " · " + groupName : ""})`
     («Ближайшее занятие «{title}» — {date}{group}. Когда урок начнётся, здесь появится классная работа.» /
     "Next lesson: “{title}” — {date}{group}. Classwork will appear here once the lesson starts.");
   - else `dict.student.lesson.noUpcoming` («Когда учитель назначит занятие и оно начнётся, здесь появится классная
     работа.» / "Once your teacher schedules a lesson and it starts, classwork will appear here.");
   - always (not a hint): `dict.student.lesson.autoRefresh` («Перезагружать страницу не нужно — урок откроется сам.» /
     "No need to reload — the lesson will open on its own.").
3. Invisible `LessonStartWatcher` when `upcoming.startsAt` exists — re-fetches the screen at the start moment (5.3).

- **Mobile:** tab-root screen "урок" / "lesson" (second nav item). Centered empty-state card with an optional
  countdown/next-lesson row. Auto-switches to L2 at `startsAt` (timer + AppState resume + push/realtime, 5.3).

### L2 — Lesson tab, live lesson

Shown when `active !== null`, i.e. the student participates in a `LessonKind.LESSON` lesson whose derived status
is `ACTIVE` right now (4.6).

Layout top to bottom:

1. Header: kicker `"{dict.student.lesson.kicker}" + (groupName ? " · " + groupName : "")`, title = lesson `title`.
2. Summary line `format(dict.student.lessonView.summary, {closed: closedMainCount, total: mainItems.length})`
   («Закрыто {closed} из {total} в основной части. Сдавайте решение фото — проверка подскажет результат, спорные
   номера посмотрит учитель.» / "{closed} of {total} closed in the main part. Submit solutions as photos — the
   check shows the result, and your teacher reviews anything unclear.").
3. Poll-broken line (red) `dict.student.lessonView.pollBroken` (same text as the homework one) when polling gave up.
4. **Section `mainPart`** («Основная часть» / "Main part"): item cards for `isExtra === false`, in `order` asc,
   numbered `1.`, `2.`, … within the section. If there are none: `dict.student.lessonView.noItems` («Учитель ещё не
   собрал набор — подождите минуту и обновите страницу.» / "Your teacher hasn't put the set together yet — wait a
   minute and reload the page.").
5. **Section `extraPart`** («Дополнительная часть» / "Extra part") — rendered only if at least one `isExtra` item exists:
   - if `isExtraPartUnlocked` (every main item is closed, 4.7): the extra item cards, numbered from `1.` again;
   - else one locked card: title `extraLocked` («Откроется, когда будет закрыта основная часть» / "Unlocks once the
     main part is closed"), (hint) `format(extraLockedHint, {count: plural(locale, mainItems.length - closedMainCount, problemForms)})`
     («Ещё {count} — и дополнительные задачи станут доступны.» / "{count} more — and the extra problems unlock.";
     forms ru `["{n} номер","{n} номера","{n} номеров"]`, en `["{n} problem","{n} problems"]`). Extra problem
     statements are **not** shown while locked.

**Lesson item card** (state per item = `item.result` + latest submission of this item):

| Element | Rule |
|---|---|
| Index + `№ {number}` | always |
| Topic chip | `topicTitle` |
| Result chip | if `result` is one of the four values: `dict.student.lessonView.results[result]` — `SOLVED` «Принято» / "Accepted" (green), `PARTIAL` «С ошибками» / "With mistakes" (yellow), `NOT_SOLVED` «Перерешай» / "Redo" (red), `SKIPPED` «Не успел» / "Not reached" (neutral) |
| Verdict chip | only if there is **no** result chip and the latest submission is `DONE` with a verdict: `dict.student.lessonView.verdicts[verdict]` — `CORRECT` «Верно» / "Correct", `INCORRECT` «Перерешай» / "Redo", `UNCERTAIN` «Проверит учитель» / "Teacher will check" |
| Checking indicator | if latest submission is `PENDING`/`CHECKING`: spinner + `checking` («Проверяется…» / "Checking…") |
| Submitted time | else if any submission exists: `format(submittedAt, {time})` («сдано в {time}» / "submitted at {time}"), `HH:MM` Moscow |
| Problem statement | `conditionLatex` rendered (4.10), if present |
| Comment | if submission is `DONE` and `comment` is non-empty (student-facing text, 4.4) |
| Check error | if submission is `FAILED`: `humanizeSolutionCheckError(error, dict.student.checkErrors)` in red |
| Submit error | red notice with the server `error` of the last failed upload for this item, or `submitFailed` («Не удалось сдать решение.» / "Could not submit the solution.") |
| Submit control | visible only when `canSubmit = !locked && !checking && !isLessonItemClosed(item)`. Label: uploading this item → spinner + `uploading` («Загружаем…»); has a previous submission → `format(resubmit, {number})` («Пересдать № {number}» / "Resubmit No. {number}"); else `format(submit, {number})` («Сдать фото № {number}» / "Submit photo for No. {number}"). File input: `accept="image/png,image/jpeg"`, `capture="environment"` (rear camera on phones), `multiple`. **All** submit inputs are disabled while any upload is in flight. Hint next to it: `format(upTo, {max: 3})` («До {max} фото · PNG или JPG» / "Up to {max} photos · PNG or JPG") |

`recognizedAnswer` is delivered in the lesson snapshot but is **not displayed** on the lesson screen.

Typical visible sequences (derived from 4.7):
- first photo, model says CORRECT → chip «Принято», submit control disappears;
- model says INCORRECT → chip «Перерешай» (result `NOT_SOLVED`), comment, button «Пересдать № N»;
- then CORRECT → chip «С ошибками» (`PARTIAL`), closed;
- model UNCERTAIN → chip «Проверит учитель» + neutral comment, button «Пересдать № N» stays (item not closed);
- check FAILED → error text, button «Пересдать № N».

Behaviour on mount / over time:
- **Join call** — once per mount: `POST /api/student/lesson {lessonId}` ("I am in class", errors ignored).
- **End of lesson** — a timer fires at `startsAt + durationMinutes·60 000 + 1000 ms` and re-fetches the page → L1.
  There is no "lesson finished / results" screen for the student.
- **Polling** while any item is `PENDING`/`CHECKING` (5.2).
- **Submit** — `POST /api/student/lesson-submissions` (multipart `itemId`, `files` × 1…3); on success the item
  gets a local optimistic snapshot `{status: "PENDING", submittedAt: now}` and polling (re)starts.

- **Mobile translation:** the same tab as L1 (the tab swaps content by state). Header with lesson title, group,
  and a remaining-time indicator (derivable from `startsAt + durationMinutes`; the site shows none). Sticky
  summary "Закрыто X из Y". SectionList: "Основная часть", "Дополнительная часть" (locked placeholder row).
  Each card has a primary button «Сдать фото № N» opening the **camera first** (action sheet: Camera / Library),
  multi-select up to 3, then an optional preview-before-send sheet. Show a per-card upload progress. Keep the
  screen awake optional. Tab badge/dot while a lesson is active is a reasonable native addition (not on the site).

---

## 2. View models

### 2.1 Homeworks (derived from `getStudentHomeworks` → pages)

Server function return (student viewer), `lib/platform-data.ts`:

```ts
type StudentHomeworksData = {
  assignmentsEnabled: boolean;      // false only when the DB tables are missing
  notesEnabled: boolean;            // false only when the `note` column is missing
  assignments: StudentHomework[];   // attention-sorted (4.1)
};

type StudentHomework = {
  id: string;
  title: string | null;             // trimmed custom title or null
  orderInTopic: number;             // 1-based index among this student's assignments of the same topic, by createdAt asc
  topicId: string;
  topicTitle: string;
  deadlineAt: Date | null;
  createdAt: Date;
  numbers: Array<{
    homeworkNumberId: string;
    number: string;                 // as written, leading zeros kept
    conditionLatex: string | null;
    answerLatex: null;              // ALWAYS null for a student
    status: HomeworkNumberStatus | null;
    note: string;                   // "" when none / notes disabled
  }>;                               // sorted by compareHomeworkNumbers
  photos: Array<{ id: string; fileId: string; originalName: string; mimeType: string; createdAt: Date }>; // current batch, createdAt asc
  latestCheck: RawCheck | null;     // newest of `checks`
  checks: RawCheck[];               // up to 15, newest first — NOT used by student pages
  solvedCount: number;              // greenCount + yellowCount
  solvedPercent: number;            // Math.round(solvedCount / totalNumbers * 100), 0 if total 0
  greenCount: number; yellowCount: number; redCount: number;
  markedCount: number;              // green + yellow + red
  totalNumbers: number;
  progressPercent: number;          // Math.round(markedCount / totalNumbers * 100)
};
```

`RawCheck` contains teacher-only fields (`copySuspected`, `copyReason`, `injectionSuspected`, `injectionNote`,
check photos). The student pages pass only the projection below to the client; **the mobile API must return
only this projection**:

```ts
// What H1 receives per assignment (app/(dashboard)/student/homeworks/page.tsx)
type HomeworkListItemVM = {
  id: string;
  label: string;                    // title ?? format(dict.common.homeworkN, { n: orderInTopic })
  topicId: string;
  topicTitle: string;
  deadlineAt: IsoDateTime | null;
  totalNumbers: number;
  solvedCount: number;
  solvedPercent: number;            // 0..100
  photosCount: number;              // photos.length (current batch)
  numbers: Array<{ homeworkNumberId: string; number: string; status: HomeworkNumberStatus | null }>;
};

// What H2 receives
type HomeworkDetailVM = {
  id: string;
  label: string;
  topicId: string;
  topicTitle: string;
  deadlineAt: IsoDateTime | null;
  totalNumbers: number;
  solvedCount: number;
  maxPhotos: number;                // siteSettings.maxPhotosPerAssignment
  notesEnabled: boolean;
  photos: Array<{ id: string; fileId: string; originalName: string }>;
  latestCheck: StudentCheckSnapshot | null;
  numbers: Array<{
    homeworkNumberId: string;
    number: string;
    conditionLatex: string | null;
    status: HomeworkNumberStatus | null;
    note: string;
  }>;
};

// Student-facing check (same shape from the page and from GET /api/student/homework-checks)
type StudentCheckSnapshot = {
  id: string;
  status: SolutionCheckStatus;
  error: string | null;             // raw server text (Russian); UI must map it via 4.5, never display it
  checkedAt: IsoDateTime | null;    // set for DONE and FAILED
  results: StudentCheckResult[];    // sorted by number; [] unless DONE; may be [] even when DONE
};

type StudentCheckResult = {
  number: string;
  verdict: SolutionVerdict;
  recognizedAnswer: string | null;  // ≤ 500 chars; null when verdict is UNCERTAIN
  comment: string | null;           // ≤ 1000 chars; for UNCERTAIN always dict.student.uncertainComment
};
```

Derived UI flags: `completed = totalNumbers > 0 && solvedCount === totalNumbers`;
`overdue = deadlineAt !== null && !completed && Date.parse(deadlineAt) < Date.now()`.

### 2.2 Live lesson (derived from `getStudentLiveLesson` → page)

```ts
type StudentLiveLessonData = {
  active: {
    lessonId: string;
    participantId: string;
    title: string;
    startsAt: Date | null;          // never null in practice (query requires startsAt)
    durationMinutes: number;        // 15..240
    groupName: string | null;       // null = individual lesson
    joinedAt: Date | null;
    items: Array<{
      id: string;                   // LessonAssignmentItem id
      order: number;
      isExtra: boolean;
      result: LessonItemResult | null;
      homeworkNumberId: string;
      number: string;
      conditionLatex: string | null;
      topicId: string;
      topicTitle: string;
      submission: RawLessonSubmission | null;   // latest submission of this item
    }>;                             // order asc
  } | null;
  upcoming: {
    lessonId: string;
    title: string;
    startsAt: Date | null;
    durationMinutes: number;
    groupName: string | null;
  } | null;                         // earliest PLANNED lesson; computed even when `active` exists (page ignores it then)
};

// What the L2 client component receives
type LessonViewProps = {
  lessonId: string;
  startsAt: IsoDateTime | null;
  durationMinutes: number;
  items: LessonViewItem[];
};

type LessonViewItem = {
  id: string;
  number: string;
  isExtra: boolean;
  result: LessonItemResult | null;
  conditionLatex: string | null;
  topicTitle: string;
  submission: LessonSubmissionSnapshot | null;
};

// Same shape from the page and from GET /api/student/lesson-submissions
type LessonSubmissionSnapshot = {
  id: string;
  itemId: string;
  status: SolutionCheckStatus;
  verdict: SolutionVerdict | null;       // only when status === "DONE"
  recognizedAnswer: string | null;       // only DONE and verdict !== UNCERTAIN (not rendered on the lesson screen)
  comment: string | null;                // only DONE; neutral text for UNCERTAIN
  error: string | null;                  // only when status === "FAILED" (raw text → map via 4.5)
  submittedAt: IsoDateTime;
  checkedAt: IsoDateTime | null;
};
```

Selection rules of `getStudentLiveLesson`: participants of this student in lessons with `kind = LESSON`,
`startsAt != null` and `startsAt >= now − 24 h`, ordered by `startsAt` asc, max 20; `active` = first whose derived
status is `ACTIVE`; `upcoming` = first whose derived status is `PLANNED`.

Not selected for the student at all: item `reason`, `minutes`, teacher `comment`, `answerLatex`, participant
`speed`, `planSummary`, `attendance`, submission `errorKind`, `errorNote`, `confidence`, `injectionSuspected`,
`injectionNote`, `modelUsed`, photos of submissions.

---

## 3. Mutations and queries

Common to every route below:

- Auth: session cookie `tutor_session`; missing/expired session **or** role ≠ STUDENT → `401 {"error": dict.apiCommon.sessionExpired}`
  («Сессия истекла. Войдите заново.» / "Your session has expired. Please sign in again.").
- Error body is always `{ "error": "<localised message>" }` in the UI language (cookie `shbz-lang`).
- Rate limiting (`enforceApiRateLimit`, Postgres buckets, **fixed** windows aligned to `floor(now / windowMs)`):
  exceeded → `429 {"error": dict.apiCommon.rateLimited}` («Слишком много запросов. Подождите немного и попробуйте
  снова.» / "Too many requests. Wait a moment and try again.") with header `Retry-After: <seconds until the window
  resets, ≥ 1>`; limiter storage failure → `503 {"error": dict.apiCommon.serviceUnavailable}` («Сервис временно
  недоступен. Попробуйте снова позже.») with `Retry-After: 5`.

### 3.1 `POST /api/student/homework-submissions` — attach photos to a homework

- **Body:** `multipart/form-data`; fields `assignmentId` (string), `files` (1…N files, repeated field).
- **Rate limit:** scope `api:homework-submissions`, 60 / 60 s per user (shared with DELETE 3.2).
- **Validation, in order:**

| # | Check | Status | Message key (ru text) |
|---|---|---|---|
| 1 | `Content-Type` starts with `multipart/form-data;` | 415 | `apiStudent.upload.multipartExpected` («Ожидается multipart-загрузка фотографий.») |
| 2 | `Content-Length` header present | 411 | `apiStudent.upload.contentLengthRequired` («Для загрузки фотографий обязателен Content-Length.») |
| 3 | `Content-Length` is digits, safe integer, > 0 | 400 | `apiStudent.upload.contentLengthInvalid` («Некорректный Content-Length.») |
| 4 | `Content-Length` ≤ 15 MiB + 512 KiB | 413 | `apiStudent.upload.bodyTooLarge` («Суммарный размер загрузки не должен превышать 15 МБ.») |
| 5 | form parses; `assignmentId` non-empty; ≥ 1 file; every entry is a file with `size > 0` | 400 | `apiStudent.upload.invalidPhotoData` («Некорректные данные для загрузки фото.») |
| 6 | sum of file sizes ≤ 15 MiB | 413 | `apiStudent.upload.photosTooLarge` («Суммарный размер фотографий не должен превышать 15 МБ.») |
| 7 | per file metadata (`validateUploadMetadata`): name non-empty and ≤ 255 chars → `topics.lib.upload.nameTooLong` («Имя файла должно содержать не больше {max} символов.»); no control chars → `badChars` («Имя файла содержит недопустимые символы.»); extension in `.pdf .docx .png .jpg .jpeg` → `extension` («Поддерживаются только PDF, DOCX, PNG и JPG.»); size > 0 → `emptySize`; size ≤ 15 MiB → `tooBig` («Файл слишком большой. Максимальный размер — 15 МБ.»); declared MIME empty, `application/octet-stream` or equal to the extension's MIME → `mimeMismatch` («Тип файла не соответствует его расширению.») | 400 | as listed |
| 8 | extension is `.png`, `.jpg` or `.jpeg` | 400 | `apiStudent.upload.onlyPngOrJpg` («Можно загружать только фото в формате PNG или JPG.») |
| 9 | homework exists **and belongs to this student** | 404 | `apiCommon.homeworkNotFound` («ДЗ не найдено.») |
| 10 | `attachedCount + files.length ≤ maxPhotosPerAssignment` | 400 | `format(apiStudent.homeworkSubmissions.photoLimit, {count: plural(max, apiStudent.upload.photoCount)})` («К одному ДЗ можно прикрепить не больше {count}.» → e.g. «…не больше 10 фото.» / "You can attach at most 10 photos to one homework.") |
| 11 | file bytes (`validateUploadedBytes`): actual size equals declared → `sizeMismatch`; magic bytes match extension (PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`) → `signature` («Содержимое файла не соответствует заявленному формату.») | 400 | as listed |
| 12 | inside a Serializable transaction the homework still exists / limit re-checked | 404 / 400 | as #9 / #10 |
| 13 | serialization conflict (Prisma `P2034`) | 409 | `apiStudent.homeworkSubmissions.concurrentChange` («Другой запрос одновременно изменил фотографии. Повторите загрузку.») |
| — | DB tables missing | 503 | `format(apiCommon.migrationMissing, {what: apiStudent.upload.photoTable})` |

- **Atomicity:** all files of the request are stored or none (already written storage objects are removed on any failure).
- **Success:** `200 { "ok": true, "photos": [{ "id": string, "fileId": string }, …] }` (ids of the created `HomeworkSubmissionPhoto` rows).
- **Side effects:** creates `StoredFile` (`uploadedById` = student) + `HomeworkSubmissionPhoto`; invalidates
  platform caches and the student/teacher pages; publishes realtime `student-progress-changed {studentId, topicId}`
  (teacher's review page refreshes; the student's own listener only uses it for the streak widget);
  log `homework.submission.uploaded`. **No status changes.**

### 3.2 `DELETE /api/student/homework-submissions` — remove one attached photo

- **Body (JSON):** `{ "photoId": string }`.
- **Rate limit:** `api:homework-submissions`, 60 / 60 s (shared with 3.1).
- **Errors:** empty `photoId` → `400 apiStudent.homeworkSubmissions.invalidDeleteData` («Некорректные данные для
  удаления фото.»); photo not found or not attached to **this student's** homework → `404
  apiStudent.homeworkSubmissions.photoNotFound` («Фото не найдено.»); tables missing → 503 as above.
- **Success:** `200 { "ok": true }`.
- **Side effects:** deletes the `HomeworkSubmissionPhoto` row; deletes the stored file only if nobody else
  references it (a file already snapshotted by a running/finished check stays alive in the check history);
  cache invalidation; realtime `student-progress-changed`; log `homework.submission.deleted`.
- Only **currently attached** photos can be deleted. Photos of already finished checks are not reachable from
  the student UI.

### 3.3 `POST /api/student/homework-checks` — start an AI check of the current batch

- **Body (JSON):** `{ "assignmentId": string }`.
- **Processing order and errors:**

| # | Check | Status | Message key (ru text) |
|---|---|---|---|
| 1 | auth | 401 | `apiCommon.sessionExpired` |
| 2 | waiting queue length ≥ 60 | 503 + `Retry-After: 120` | `apiStudent.homeworkChecks.queueFull` («Очередь автопроверки переполнена. Попробуйте через несколько минут.») |
| 3 | per-student hourly limit: scope `api:homework-checks`, `aiPerStudentHourlyLimit` (default 10) / 3 600 000 ms. **Consumed here**, before any validation | 429 | `apiCommon.rateLimited` |
| 4 | `aiEnabled` and API key + model configured | 503 | `apiStudent.homeworkChecks.disabled` («Автоматическая проверка сейчас отключена. Попросите разработчика включить её.») |
| 5 | `assignmentId` non-empty | 400 | `apiStudent.homeworkChecks.invalidData` («Некорректные данные для проверки.») |
| 6 | (stale sweep of this assignment's checks, 4.3) | — | — |
| 7 | homework exists and belongs to the student | 404 | `apiCommon.homeworkNotFound` |
| 8 | at least one attached photo | 400 | `apiStudent.homeworkChecks.attachPhotosFirst` («Сначала прикрепите фото решения.») |
| 9 | homework has at least one number | 400 | `apiStudent.homeworkChecks.noNumbers` («В этом ДЗ нет номеров для проверки.») |
| 10 | another check of this homework is active (unique `(assignmentId, activeSlot=1)`, Prisma `P2002`) | 409 | `apiStudent.homeworkChecks.alreadyRunning` («Проверка уже идёт — дождитесь результата.») |
| 11 | a photo was deleted concurrently while the snapshot was created (`P2003`) | 409 | `apiStudent.homeworkChecks.photosChanged` («Набор фото изменился. Повторите запуск проверки.») |
| 12 | tables missing | 503 | `format(apiCommon.migrationMissing, {what: apiStudent.homeworkChecks.checkTable})` |
| 13 | school-wide daily budget: scope `api:homework-checks:global`, `aiDailyLimit` (default 300) / 86 400 000 ms; consumed **after** the row is created, the row is deleted again on refusal | 429 | `apiCommon.rateLimited` |

- **Success:** `200 { "ok": true, "checkId": string }`. A `HomeworkCheck` row (`status: PENDING`, `activeSlot: 1`)
  and a `HomeworkCheckPhoto` snapshot of all currently attached photos (ordered by `createdAt`, `id`) are created;
  the task `{kind: "HOMEWORK", id, locale}` is queued (locale = the student's UI language → language of the
  model's comments).
- **Side effects when the check finishes:** see 4.2–4.4 (statuses, photo detaching, notification, realtime).

### 3.4 `GET /api/student/homework-checks?assignmentId=…[&consume=1]` — latest check status

- **Rate limit:** scope `api:homework-check-status`, 120 / 60 s per user.
- **Errors:** missing `assignmentId` → `400 apiCommon.invalidData` («Некорректные данные.»).
- Runs the stale sweep for this assignment first (so a dead check turns `FAILED` instead of spinning forever).
- **Success:** `200 { "check": StudentCheckSnapshot | null }` — newest check (by `createdAt`) of this assignment
  **owned by the student**; `null` if none (also `null` when the id is foreign/unknown or the tables are missing).
- `consume=1`: if the returned check is `DONE` or `FAILED`, the server additionally invalidates its page caches
  (the queue worker runs outside a request and cannot do it reliably). It does **not** mark anything as "read"
  and is idempotent. A mobile server with its own caching can ignore it.

### 3.5 `POST /api/student/topic-status` — save the personal note of a number

- **Body (JSON):** `{ "topicId": string, "homeworkNumberId": string, "note": string }`.
- **Rate limit:** scope `api:student-status`, 90 / 60 s.
- **Rules:** if the body contains a `status` key at all → `403 apiStudent.topicStatus.statusReadOnly` («Статус
  выставляется автоматической проверкой или учителем.»). Missing `topicId` / `homeworkNumberId` / `note` key → `400
  apiStudent.topicStatus.invalidData` («Некорректные данные для сохранения номера.»). Number not in that topic →
  `404 apiStudent.topicStatus.numberNotFound` («Номер задания для этой темы не найден.»). Note is trimmed and cut
  to **240** chars; empty → note cleared (the row is removed only if it has no status, no deadline and no
  `statusChangedAt`).
- **Success:** `200 { "ok": true, "status": HomeworkNumberStatus | null, "note": string, "notesEnabled": boolean }`.
- **Side effects:** writes **only** the `note` field of `StudentTopicNumberStatus`; cache invalidation; realtime
  `student-progress-changed`. Note: the route does not verify that the number is part of one of the student's
  homeworks — a note can be stored for any existing number.

### 3.6 `POST /api/student/lesson` — "I am in class" (join)

- **Body (JSON):** `{ "lessonId": string }`.
- **Rate limit:** scope `api:lesson-join`, 30 / 60 s.
- **Errors:** empty id → `400 apiCommon.invalidData`; the student is not a participant of a `LESSON`-kind lesson
  with that id → `404 apiCommon.lessonNotFound` («Урок не найден.»); derived status ≠ `ACTIVE` → `409
  apiStudent.lesson.notActive` («Урок сейчас не идёт.» / "The lesson isn't in progress right now.").
- **Success:** `200 { "ok": true }` (idempotent).
- **Side effects (first call only, when `joinedAt` is null):** `joinedAt = now`; `attendance: UNKNOWN → PRESENT`
  (a manual teacher mark is never overwritten); realtime `lesson-activity {lessonId, teacherId, studentId}`;
  log `lesson_live.joined`.

### 3.7 `POST /api/student/lesson-submissions` — submit photos for one lesson item

- **Body:** `multipart/form-data`; `itemId` (string), `files` (1…3 files).
- **Processing order and errors:**

| # | Check | Status | Message key (ru text) |
|---|---|---|---|
| 1 | auth | 401 | `apiCommon.sessionExpired` |
| 2 | waiting queue length ≥ 60 | 503 + `Retry-After: 120` | `apiStudent.lessonSubmissions.queueFull` («Очередь проверки переполнена. Попробуйте через несколько минут.») |
| 3 | per-student hourly limit: scope `api:lesson-checks`, `lessonCheckPerStudentHourlyLimit` (default 30) / 3 600 000 ms | 429 | `apiCommon.rateLimited` |
| 4 | `aiEnabled && lessonCheckEnabled` and model configured | 503 | `apiStudent.lessonSubmissions.disabled` («Проверка классной работы сейчас отключена. Покажите решение учителю.») |
| 5 | multipart content type | 415 | `apiStudent.upload.multipartExpected` |
| 6 | `Content-Length` present, numeric, > 0 (missing header is **400** here, not 411) | 400 | `apiStudent.upload.contentLengthInvalid` |
| 7 | body ≤ 15 MiB + 512 KiB | 413 | `apiStudent.upload.bodyTooLarge` |
| 8 | form parses; `itemId` non-empty; ≥ 1 non-empty file | 400 | `apiStudent.upload.invalidPhotoData` |
| 9 | `files.length ≤ 3` | 400 | `format(apiStudent.lessonSubmissions.photoLimit, {count: plural(3, photoCount)})` («К одному номеру можно прикрепить не больше 3 фото.» / "You can attach at most 3 photos to one problem.") |
| 10 | sum of sizes ≤ 15 MiB | 413 | `apiStudent.upload.photosTooLarge` |
| 11 | per-file metadata + PNG/JPG only (same as 3.1 #7–8) | 400 | as in 3.1 |
| 12 | item belongs to **this student's** participation in a `LESSON`-kind lesson | 404 | `apiStudent.lessonSubmissions.itemNotFound` («Номер урока не найден.») |
| 13 | lesson derived status is `ACTIVE` | 409 | `apiStudent.lessonSubmissions.lessonNotActive` («Урок сейчас не идёт — сдать решение нельзя.») |
| 14 | (stale sweep of this student's submissions in the lesson, 4.3) | — | — |
| 15 | item is not closed (`canSubmitLessonItem`, 4.7) | 409 | `format(apiStudent.lessonSubmissions.alreadyAccepted, {number})` («№ {number} уже принят.» / "Problem {number} has already been accepted.") |
| 16 | extra item and the main part is not fully closed | 409 | `apiStudent.lessonSubmissions.extraPartLocked` («Дополнительная часть откроется, когда будет закрыта основная.») |
| 17 | file bytes validation (size, magic bytes) | 400 | as 3.1 #11 |
| 18 | another submission of this item is active (unique `(itemId, activeSlot=1)`, `P2002`) | 409 | `apiStudent.lessonSubmissions.alreadyRunning` («Проверка этого номера уже идёт — дождитесь результата.») |
| 19 | serialization conflict `P2034` | 409 | `apiStudent.lessonSubmissions.concurrentChange` («Другой запрос одновременно изменил сдачу. Повторите загрузку.») |
| — | tables missing | 503 | `format(apiCommon.migrationMissing, {what: apiStudent.lessonSubmissions.submissionTable})` |
| 20 | school-wide daily lesson budget: scope `api:lesson-checks:global`, `lessonCheckDailyLimit` (default 300) / 24 h; on refusal the submission row and the files are removed again | 429 | `apiCommon.rateLimited` |

- **Success:** `200 { "ok": true, "submissionId": string }`.
- **Side effects (in the same transaction as the submission):** `LessonItemSubmission {status: PENDING, activeSlot: 1}`
  + `LessonSubmissionPhoto` rows (`order` 0…2); `joinedAt = now` if it was null; `attendance: UNKNOWN → PRESENT`.
  Then: queue task `{kind: "LESSON_ITEM", id, locale}`; realtime `lesson-activity {lessonId, teacherId, studentId}`;
  log `lesson_check.enqueued`. When the check finishes: 4.7.
- Different items can be checked in parallel (one active submission **per item**).

### 3.8 `GET /api/student/lesson-submissions?lessonId=…[&consume=1]` — latest submissions

- **Rate limit:** scope `api:lesson-check-status`, 120 / 60 s.
- **Errors:** missing `lessonId` → `400 apiCommon.invalidData`.
- Runs the stale sweep for this student in this lesson first.
- **Success:** `200 { "submissions": LessonSubmissionSnapshot[] }` — the **latest** submission (by `submittedAt`)
  of every item of this student in that lesson that has at least one submission; items without submissions are
  absent; `[]` for a foreign/unknown lesson or missing tables. The payload does **not** include `item.result` —
  the site re-fetches the whole page when a submission turns terminal (5.2).
- `consume=1`: for submissions that became `DONE`/`FAILED` within the last 5 minutes the server invalidates page
  caches once per submission (in-memory de-dup for 10 minutes). Idempotent for the client.

### 3.9 `GET /api/student/homeworks/find-number?number=…` — number search (header control)

- **Rate limit:** scope `api:student-find-number`, 120 / 60 s.
- **Validation:** `number` must match `/^\d{1,20}$/` and must not normalise to `"0"` → else `400
  apiStudent.findNumber.invalidNumber` («Введите корректный номер.»). Lookup by normalised form across **all**
  topics (first by topic `displayOrder`, then `createdAt`); none → `404 apiStudent.findNumber.notFound` («Такой
  номер не найден.»).
- **Success:** `200 { "href": "/student/numbers/<number as stored, URL-encoded>" }` → number detail screen (spec 02).
- Client-side texts: `dict.numberSearch.placeholder` («Найти номер» / "Find a problem"), `invalid`, `notFound`
  («Не удалось найти тему по этому номеру.»), `searching` («Ищем номер…»).

### 3.10 `GET /files/{fileId}[?thumb=1][&download=1]` — photo bytes

- Auth by cookie; not signed in → `401` plain text `Unauthorized`; no access / unknown id → `404` plain text.
- Student access: theory/homework files of topics, and **own** solution photos (homework batch, homework check
  snapshots, lesson submissions).
- `thumb=1` (PNG/JPEG/WebP sources, ignored with `download=1`): WebP, width ≤ 320 px (no upscaling), EXIF
  rotation applied, quality 72; falls back to the original if thumbnail generation fails.
- Headers: `Cache-Control: private, max-age=31536000, immutable`, `ETag`, `If-None-Match` → 304;
  `Content-Disposition: inline` (or `attachment` with `download=1`).
- Rate limit: scope `api:file-read`, 120 / 60 s per user.

### 3.11 Server actions

None of these screens use server actions; all writes are the JSON/multipart routes above.

---

## 4. Business rules the mobile mock must imitate

### 4.1 Homework ordering — attention sort (`lib/homework-attention.ts`)

Rank (lower first), computed against `now`:

| Rank | Condition (first match wins) |
|---|---|
| 5 | completed: has numbers and every number is GREEN or YELLOW |
| 0 | has a deadline and `deadline < now` (overdue) |
| 1 | latest check is `DONE` and has at least one `UNCERTAIN` result |
| 2 | at least one number has status `null` |
| 3 | has a deadline within the next 72 h |
| 4 | everything else |

Ties: both have deadlines and they differ → earlier deadline first; exactly one has a deadline → it goes first;
otherwise newer `createdAt` first.

Note the two different notions: "completed" for the archive split on H1 is `solvedCount === totalNumbers` with
`solved = GREEN + YELLOW` — identical to rank 5.

### 4.2 Photo-batch lifecycle of a homework

```
            upload (≤ maxPhotos attached)            start check
 [no photos] ───────────────────────────▶ [batch attached] ───────────────▶ [check PENDING]
      ▲            ▲   delete photo │                                            │ worker picks it
      │            └────────────────┘                                            ▼
      │                                                                    [check CHECKING]
      │   DONE: snapshot photos are DETACHED from the homework                   │
      └──────────────────────────────────────────────────────────────────────────┤
                                                                                 │ FAILED: photos stay attached
                                                             [batch attached] ◀──┘ (student may retry or edit the batch)
```

1. The limit `maxPhotosPerAssignment` counts photos **attached right now**, not all photos ever uploaded.
2. Starting a check snapshots the attached photos (`HomeworkCheckPhoto`, order = upload order). The model
   receives at most `maxPhotosPerAssignment` photos plus the statement and reference answer of **every** number
   of the homework.
3. The model returns verdicts only for numbers whose solution is visible on these photos; other numbers get no
   result (not `UNCERTAIN`). An empty result list is a normal outcome (`DONE` with `results: []`).
4. On `DONE` (including the empty case), in one transaction: results are stored, statuses are updated (4.4), and
   the snapshot photos are **detached** from the homework (`HomeworkSubmissionPhoto` rows deleted; files survive in
   the check history, visible to the teacher only). Photos uploaded *after* the check started are not part of
   the snapshot and stay attached as the beginning of the next batch.
5. On `FAILED` nothing is detached and no status changes.
6. Only one check per homework can be active (`PENDING`/`CHECKING`). Starting another → 409 `alreadyRunning`.
7. Retention: after every finished/failed check the server keeps the newest `completedChecksKept` (default 50)
   finished checks **per student** (across all homeworks) and deletes older ones together with their photos.
   Additionally all solution photos older than `photoRetentionDays` are deleted by a background job.
8. On `DONE` the student gets an in-app notification of type `homework-checked` with
   `params {correct, incorrect, uncertain, applied}` and `href = /student/homeworks/{assignmentId}`
   (title «Результат автопроверки готов» / "Your AI check result is ready"; body «Автопроверка: верно — {correct},
   перерешать — {incorrect}{, нужна ручная проверка — {uncertain}}. {Обновлено статусов: {count}. | Статусы не
   изменены.}»). No notification for `FAILED` and none for lesson checks.

### 4.3 Check queue state machine (homework checks and lesson submissions)

```
PENDING ──worker claims──▶ CHECKING ──model answered & parsed──▶ DONE
   │                          │
   │                          └──any error (timeout, provider, unparsable twice, storage)──▶ FAILED
   ├──config missing / AI disabled / no photos──▶ FAILED
   └──stale sweep──▶ FAILED                         (CHECKING also → FAILED by stale sweep)
```

- One in-memory queue for both kinds; **lesson items are always taken before homework checks**, FIFO within a kind;
  `aiCheckConcurrency` (default 3) run in parallel; POST refuses new work when 60 tasks are waiting.
- `activeSlot = 1` while `PENDING`/`CHECKING`, `null` when finished — this is what enforces "one active check
  per homework" and "one active submission per lesson item".
- `checkedAt` is set on `DONE` and on `FAILED`.
- **Stale sweep** (runs inside POST and GET of the corresponding routes, scoped to this student's
  assignment/lesson): a `PENDING` row older than **15 min** or a `CHECKING` row older than **45 min** that the
  current server process is not tracking becomes `FAILED` with error «Проверка прервалась (перезапуск сервера).
  Запустите её заново.» (lesson: «…Сдайте номер заново.») → UI class `interrupted`.
- Model call: 180 s timeout, up to 3 attempts for retriable failures, plus one extra call if the JSON cannot be
  parsed. The UI promise is "usually up to a minute".
- Verdict normalisation: a `CORRECT`/`INCORRECT` verdict whose confidence is missing or `< aiMinConfidence`
  (default 0.6) is stored as `UNCERTAIN`.
- Budget bookkeeping (invisible to the student except through 429s): the daily slot is returned when a check
  fails before the model was called or was swept as stale `PENDING`.

A mock should simulate: `PENDING` (0.5–2 s) → `CHECKING` (2–6 s) → `DONE` with scripted verdicts, plus switchable
scenarios: `FAILED` with each error class of 4.5, `DONE` with empty results, 409 `alreadyRunning`, 429, 503 queue
full / disabled.

### 4.4 Verdict → status mapping and what the student sees

**Homework check** (`decideProgressChange`, source `homework_check`), per returned result:

| Verdict | Previous status | New status | Note |
|---|---|---|---|
| `CORRECT` | `null` | `GREEN` | |
| `CORRECT` | `GREEN` | unchanged | |
| `CORRECT` | `YELLOW` | unchanged (`YELLOW`) | |
| `CORRECT` | `RED` | `YELLOW` | solved after a failure |
| `INCORRECT` | `null` | `RED` | |
| `INCORRECT` | `RED` | unchanged | |
| `INCORRECT` | `GREEN` or `YELLOW` | unchanged — **downgrade blocked** | the check can only improve a status |
| `UNCERTAIN` | any | unchanged | flagged for the teacher |
| any | status changed (by anyone) **after** the check was started | unchanged | `newer_status` rule |

Numbers without a result row are untouched.

**Student-facing projection** (`toStudentFacingResult`), applied to homework results and lesson submissions:

- `CORRECT` / `INCORRECT`: `number`, `verdict`, `recognizedAnswer`, `comment` are passed through.
- `UNCERTAIN`: `recognizedAnswer` is forced to `null` and `comment` is replaced by the fixed
  `dict.student.uncertainComment` («Не удалось уверенно разобрать решение по фото. Покажи его учителю — он проверит
  вручную.» / "Could not confidently read the solution from the photo. Show it to your teacher — they'll check
  it by hand.") — the model's original comment was written for another verdict and must not leak.
- Results are sorted by number.

**Never exposed to a student, in any payload or screen:** `answerLatex` (reference answers), `errorKind`,
`errorNote`, `confidence`, `copySuspected`, `copyReason`, `injectionSuspected`, `injectionNote`, `modelUsed`, the
raw provider error text (only its class, 4.5), the original comment/recognised answer of an `UNCERTAIN` verdict,
check history with its photos, the teacher's lesson planning fields (`reason`, `minutes`, item `comment`,
`planSummary`, `speed`, `aiNote`), and attendance marks.

### 4.5 Error classes of a FAILED check (`humanizeSolutionCheckError`)

The raw `error` string (≤ 500 chars, Russian or provider English) is matched against these patterns **in order**;
first match wins; empty/unknown → `fallback`. Texts: `dict.student.checkErrors.*`.

| Class | Regex (case-insensitive) | ru | en |
|---|---|---|---|
| `interrupted` | `прервал\|перезапуск\|зависш\|interrupted\|restart\|stuck` | Проверка прервалась. Отправьте решение на проверку ещё раз. | The check was interrupted. Send your solution for checking again. |
| `disabled` | `отключен\|не настроен\|disabled\|not configured` | Автоматическая проверка сейчас выключена. Покажите решение преподавателю. | Automatic checking is turned off right now. Show your solution to your teacher. |
| `timeout` | `abort\|time.?out\|таймаут\|timed out` | Проверка шла слишком долго и была остановлена. Подождите пару минут и запустите её ещё раз. | The check took too long and was stopped. Wait a couple of minutes and run it again. |
| `quota` | `quota\|insufficient\|billing\|balance\|budget\|бюджет\|лимит провер` | Лимит автоматических проверок пока исчерпан. Попробуйте позже или напишите преподавателю — он проверит вручную. | The AI check limit has been reached for now. Try later or message your teacher — they'll check it by hand. |
| `unavailable` | `статус 5\d\d\|статус 429\|rate.?limit\|too many\|overload\|unavailable\|bad gateway\|connect\|fetch failed\|ECONN` | Сервис проверки сейчас недоступен или перегружен. Попробуйте ещё раз через несколько минут. | The check service is unavailable or overloaded right now. Try again in a few minutes. |
| `queue` | `очеред` | Сейчас слишком много проверок одновременно. Подождите пару минут и запустите проверку снова. | Too many checks are running at once. Wait a couple of minutes and start the check again. |
| `image` | `image\|photo\|фото\|изображен\|unsupported format` | Не получилось разобрать фото решения. Переснимите страницы при хорошем свете, без бликов, и загрузите заново. | Could not read the solution photos. Retake the pages in good light, without glare, and upload them again. |
| `fallback` | — | Проверка не удалась — что-то сломалось на нашей стороне. Попробуйте ещё раз, а если не получится — напишите преподавателю. | The check failed — something broke on our side. Try again, and if it still fails, message your teacher. |

Server-generated raw messages and their class: «Проверка прервалась (перезапуск сервера)…» → `interrupted`;
«Автопроверка отключена разработчиком.» / «Автопроверка не настроена: нет AI_CHECK_API_KEY или модели.» / «Проверка
классной работы отключена разработчиком.» / «Проверка не настроена…» → `disabled`; «Нет фото решения или номеров
для проверки.» / «Нет фото решения.» / «Не удалось прочитать фото решения из хранилища.» → `image`; «Модель не
вернула вердикт по номеру.» / «Модель вернула пустой ответ.» / «В ответе модели нет JSON-объекта.» / «Не удалось
проверить решение.» → `fallback`.

### 4.6 Lesson status — derived from the schedule (`deriveLessonStatus`)

Evaluated against `now` every time; nothing "switches" the lesson on or off:

1. `finishedAt` set and `finishedAt <= now` → `FINISHED` (teacher ended the lesson early; overrides the schedule).
2. `startsAt` missing/invalid → the stored `Lesson.status` (cannot happen for a lesson visible on the student tab).
3. `now < startsAt` → `PLANNED`.
4. `now < startsAt + max(0, durationMinutes)·60 000` → `ACTIVE`.
5. otherwise → `FINISHED`.

The stored `Lesson.status = FINISHED` only marks "results have been finalised" (4.8).

### 4.7 Live lesson rules (`lib/lesson-live.ts`, `lesson-item-check.ts`)

Per item, with `latestVerdict` = verdict of the latest **DONE** submission (null otherwise):

- **Closed** (`isLessonItemClosed`): `result ∈ {SOLVED, PARTIAL, SKIPPED}` **or** `latestVerdict === "CORRECT"`.
- **Can submit** (`canSubmitLessonItem`): not closed. So an item with `NOT_SOLVED`, with an `UNCERTAIN`/`INCORRECT`
  verdict, with a `FAILED` check or with no submission can be (re)submitted; additionally not while its own
  submission is `PENDING`/`CHECKING` and only while the lesson is `ACTIVE`.
- **Extra part unlocked** (`isExtraPartUnlocked`): every non-extra item is closed (true when there are no main items).
- Unlimited resubmissions otherwise (bounded only by the hourly/daily limits).

**Auto result when a submission check finishes `DONE`** (`decideAutoLessonResult`), with `currentResult` = item
result at that moment and `hadIncorrectBefore` = another submission of this item has verdict `INCORRECT`:

| Verdict | Current result | New item result |
|---|---|---|
| `UNCERTAIN` | any | unchanged (teacher decides) |
| any | `SOLVED` / `PARTIAL` / `SKIPPED` | unchanged (manual mark or earlier acceptance wins) |
| `INCORRECT` | `null` | `NOT_SOLVED` |
| `INCORRECT` | `NOT_SOLVED` | unchanged |
| `CORRECT` | `null`, no earlier `INCORRECT` | `SOLVED` |
| `CORRECT` | `NOT_SOLVED`, or an earlier `INCORRECT` exists | `PARTIAL` |

The verdict is applied even if the lesson has ended in the meantime (the worker does not re-check `ACTIVE`).

**Mirroring into the global per-number status** (`decideProgressChange`, sources `lesson_check` / `lesson_end` /
`lesson_teacher`): `SOLVED → GREEN`, `PARTIAL → YELLOW`, `NOT_SOLVED → RED`, written directly — unlike homework
checks there is **no downgrade protection** here. `SKIPPED` and "no new result" leave the status untouched (a
teacher replacing an existing result by `SKIPPED`/none clears the status). So a lesson can turn a previously green
number red; the homework screens will then show the new colour.

The teacher can set/override any item result manually during or after the lesson (teacher lesson board); the
student sees it as the result chip, delivered via realtime `lesson-activity` (5.1).

A failed lesson check (`FAILED`) changes neither the result nor the status; the student may resubmit.

### 4.8 End-of-lesson finalisation (`lib/lesson-finalize.ts`)

Lazy and idempotent: executed when the student opens the lesson tab (scope = his lessons), and when the teacher
opens the lesson board / lesson list — for `LESSON`-kind lessons whose stored status is not `FINISHED`, whose
derived status is `FINISHED`, and which ended at most **48 h** ago (`finishedAt`, else `startsAt + duration`).
Older unfinalised lessons are never touched.

Per participant (one short transaction each), for every item with `result === null`:

| Situation | Result written | Global status |
|---|---|---|
| a submission is still `PENDING`/`CHECKING` | none — the check will set it | — |
| the student never submitted this item | `SKIPPED` («Не успел») | unchanged |
| submitted at least once, never accepted | `NOT_SOLVED` | `RED` |

Items that already have a result are left alone. Afterwards `Lesson.status = FINISHED` is stored.

### 4.9 Attendance auto-marking (`AttendanceStatus`, never shown to the student)

| Event | Effect |
|---|---|
| first successful join call on an `ACTIVE` lesson (3.6) | `joinedAt = now`; `UNKNOWN → PRESENT` |
| lesson submission (3.7) | `joinedAt = now` if null; `UNKNOWN → PRESENT` |
| finalisation (4.8), participant still `UNKNOWN` | `PRESENT` if `joinedAt != null` or any submission exists, else `ABSENT` |
| teacher set `PRESENT` / `LATE` / `ABSENT` / `EXCUSED` manually | never overwritten by any automatic rule |

The routes apply these rules to every `LESSON`-kind lesson (group or individual); the attendance reports and the
teacher table exist only for group lessons. Opening the lesson tab **before** the lesson starts does not mark
anything (the join call is only sent from L2, and the route answers 409 unless `ACTIVE`).

### 4.10 Rendering problem statements (`LatexAnswerPreview`)

`conditionLatex` is mixed text + LaTeX, not pure LaTeX:

1. soft-wrapped lines are merged into paragraphs (`mergeSoftWrappedLines`), then split into blocks by blank lines;
2. a block that is entirely `\[ … \]` → display math;
3. otherwise the block is split by `$$ … $$` segments → display math; remaining text is split into lines;
4. inside a text line, `$ … $` → inline math, the rest is plain text;
5. lines/formulas with enumerated sub-items («А) … Б) …») are laid out as wrapping flex items;
6. display formulas scroll horizontally when wider than the card; line-broken formulas repeat the operator sign
   at the start of the next line (`lib/math-line-breaks.ts`);
7. KaTeX parse errors render the error name in a red inline code box instead of crashing.

### 4.11 Permissions summary

| Action | Rule |
|---|---|
| see a homework / its photos / its checks | only the student it was issued to (`studentId` match); foreign id → 404 |
| upload / delete homework photos | owner; only attached (unchecked) photos can be deleted |
| start a check | owner; needs ≥ 1 attached photo and ≥ 1 number; one active check per homework |
| change a number status | **never** (403 if a `status` key is sent) |
| edit a number note | the student, own note only, ≤ 240 chars |
| see reference answers | never |
| see a lesson | only a participant (`LessonParticipant.studentId`), only `LESSON` kind |
| submit a lesson item | participant, lesson `ACTIVE`, item not closed, extra part unlocked, ≤ 3 photos |
| read a photo file | own solution photos only (plus topic theory/homework files) |

---

## 5. Realtime / polling behaviour

### 5.1 SSE channel (`GET /api/realtime`, `EventSource`)

- One shared stream per signed-in user; max **2** concurrent connections per user (third → `429
  apiStudent.realtime.tooManyConnections`, `Retry-After: 5`); connect rate limit `api:realtime-connect` 30 / 60 s;
  server heartbeat comment `: ping` every 25 s. In-memory pub/sub → single server instance only.
- Events a **student** receives: `topic-content-changed` (all), and `student-progress-changed`,
  `student-deadlines-changed`, `lesson-activity` only when `event.studentId === user.id`.
- Client reaction (student):

| Event | Reaction on these screens |
|---|---|
| `lesson-activity` (own `studentId`) | debounced (1500 ms) re-fetch of the current page → L1/L2 refresh. Sent when: the teacher schedules/reschedules a lesson (one event per participant), the student joins or submits, a lesson check finishes or fails, the teacher sets an item result or an attendance mark for this student |
| `student-progress-changed` (own) | **no page refresh** — only updates the streak widget on the home screen. H1/H2 therefore do not live-update when the teacher changes a status |
| `student-deadlines-changed` (own) | re-fetch of the page + notification bell refresh (new homework issued / cancelled → H1 changes) |
| `topic-content-changed` | re-fetch of the page (statements may have changed) |

- Events that arrive while the tab is hidden are coalesced into one refresh when it becomes visible.
- **Not delivered to students:** the teacher's early finish (`…/finish`) and the finalisation event are published
  without `studentId`, so a student who has L2 open is not kicked out when the teacher ends the lesson early —
  the screen stays until the scheduled end timer or a manual reload; submissions meanwhile get 409
  `lessonNotActive`. (See open questions.)

### 5.2 Polling (the reliable path for check results)

Identical algorithm in `StudentHomeworkCheck` and `StudentLessonView`:

- Starts when something is running (`PENDING`/`CHECKING`): first request after **4000 ms**.
- Homework: `GET /api/student/homework-checks?assignmentId=…&consume=1` → replace the local snapshot with
  `check`; if `DONE`/`FAILED` → stop and re-fetch the whole page (new statuses, detached photos).
- Lesson: `GET /api/student/lesson-submissions?lessonId=…&consume=1` → merge by `itemId`; if any known submission
  (same `id`) changed from non-terminal to `DONE`/`FAILED` → re-fetch the whole page (to pick up `item.result`);
  polling continues while anything is still running.
- Next delay = `4000 · min(2^failures, 8)` ms, where `failures` = consecutive failed polls (non-2xx, unparsable
  body, network error) → 4 s on success; 8 s, 16 s, 32 s, 32 s after failures.
- After **5** consecutive failures polling stops and the "poll broken" message is shown; a new start/submit
  resets the counter.
- Timers are cleared on unmount. A page opened while a check is already running resumes polling automatically.

### 5.3 Lesson start / end timers

- **Start (L1 → L2):** `LessonStartWatcher(startsAt, serverNow)`:
  delay = `max(0, startsAt − now) + 1000 ms` grace, where `now = max(serverNow, deviceNow)` on the first render
  and `serverNow` on later refreshes (protects against a fast device clock looping refreshes); no timer if the
  delay exceeds `2^31−1` ms. Additionally every **30 s** and on visibility change it checks whether the wait has
  elapsed since mount (covers device sleep). One refresh per render; hidden tabs are not refreshed.
- **End (L2 → L1):** timer at `startsAt + durationMinutes·60 000 + 1000 ms`.
- Mobile equivalent: compute `clockOffset = serverNow − Date.now()` from the API response, schedule one timer
  for start/end, and re-evaluate on `AppState` → `active`.

### 5.4 Caching / staleness

- `getStudentHomeworks` is cached for **15 s** (plus tag invalidation by mutations). A status written by the
  background check worker can therefore lag up to 15 s on a plain page load; the poll with `consume=1` exists to
  force freshness right after completion.
- `getStudentLiveLesson` is uncached.

---

## 6. Proposed mobile API contract

REST-style JSON under `/api/mobile/v1`, bearer-token auth (see spec 01). All dates are ISO-8601 UTC strings.
The server resolves the language from `Accept-Language: ru|en`. Unlike the site, errors carry a **stable code**
so the app can localise itself; `message` is the localised server text (same strings as today).

```ts
type ApiError = {
  error: {
    code: string;                 // table 6.6
    message: string;              // localised, ready to show
    retryAfterSeconds?: number;   // for 429 / 503
    params?: Record<string, string | number>;   // e.g. { max: 10 } / { number: "0512" }
  };
};

type CheckErrorCode = "interrupted" | "disabled" | "timeout" | "quota" | "unavailable" | "queue" | "image" | "unknown";
```

### 6.1 Homeworks

```ts
// GET /student/homeworks
type GetHomeworksResponse = {
  serverNow: IsoDateTime;
  available: boolean;                       // site: assignmentsEnabled
  limits: { maxPhotosPerAssignment: number };
  assignments: HomeworkSummaryDto[];        // attention-sorted by the server (4.1)
};

type HomeworkSummaryDto = {
  id: string;
  title: string | null;                     // custom title
  orderInTopic: number;                     // for the fallback label "ДЗ {n}" / "Homework {n}"
  topicId: string;
  topicTitle: string;
  deadlineAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  totalNumbers: number;
  solvedCount: number;                      // GREEN + YELLOW
  solvedPercent: number;
  photosCount: number;                      // currently attached
  attentionRank: 0 | 1 | 2 | 3 | 4 | 5;     // optional convenience
  latestCheckStatus: SolutionCheckStatus | null;
  numbers: Array<{ homeworkNumberId: string; number: string; status: HomeworkNumberStatus | null }>;
};

// GET /student/homeworks/{assignmentId}      404 HOMEWORK_NOT_FOUND
type GetHomeworkResponse = {
  serverNow: IsoDateTime;
  limits: { maxPhotosPerAssignment: number; noteMaxLength: 240 };
  notesEnabled: boolean;
  aiCheckAvailable: boolean;                // aiEnabled && configured — lets the app disable the button up front
  assignment: HomeworkSummaryDto & {
    photos: HomeworkPhotoDto[];             // current batch, oldest first
    latestCheck: StudentCheckDto | null;
    numbers: Array<{
      homeworkNumberId: string;
      number: string;
      conditionLatex: string | null;
      status: HomeworkNumberStatus | null;
      note: string;
    }>;
  };
};

type HomeworkPhotoDto = {
  id: string;
  fileId: string;
  originalName: string;
  createdAt: IsoDateTime;
  url: string;                              // GET /files/{fileId}
  thumbUrl: string;                         // GET /files/{fileId}?thumb=1
};

type StudentCheckDto = {
  id: string;
  status: SolutionCheckStatus;
  errorCode: CheckErrorCode | null;         // only FAILED; raw text is NOT sent
  createdAt: IsoDateTime;
  checkedAt: IsoDateTime | null;
  results: Array<{
    number: string;
    homeworkNumberId: string;
    verdict: SolutionVerdict;
    recognizedAnswer: string | null;        // null for UNCERTAIN
    comment: string | null;                 // neutral text for UNCERTAIN
  }>;
};
```

| Method & path | Request | Response | Errors |
|---|---|---|---|
| `POST /student/homeworks/{assignmentId}/photos` | `multipart/form-data`, field `files` × 1…N (JPEG/PNG) | `{ photos: HomeworkPhotoDto[]; photosCount: number }` | 3.1 table → `UPLOAD_*`, `HOMEWORK_NOT_FOUND`, `PHOTO_LIMIT_EXCEEDED {max}`, `CONCURRENT_CHANGE`, `RATE_LIMITED` |
| `DELETE /student/homeworks/{assignmentId}/photos/{photoId}` | — | `{ ok: true; photosCount: number }` | `PHOTO_NOT_FOUND`, `RATE_LIMITED` |
| `POST /student/homeworks/{assignmentId}/checks` | — | `{ check: StudentCheckDto }` (status `PENDING`) | `CHECK_QUEUE_FULL`, `RATE_LIMITED`, `CHECK_DISABLED`, `HOMEWORK_NOT_FOUND`, `CHECK_NO_PHOTOS`, `CHECK_NO_NUMBERS`, `CHECK_ALREADY_RUNNING`, `CHECK_PHOTOS_CHANGED` |
| `GET /student/homeworks/{assignmentId}/checks/latest` | — | `{ check: StudentCheckDto \| null; photos: HomeworkPhotoDto[]; numbers: Array<{ homeworkNumberId: string; status: HomeworkNumberStatus \| null }>; solvedCount: number }` — the poll returns the refreshed batch and statuses so no second request is needed on completion | `RATE_LIMITED` |
| `PUT /student/numbers/{homeworkNumberId}/note` | `{ note: string }` (trimmed, ≤ 240; `""` clears) | `{ note: string }` | `NUMBER_NOT_FOUND`, `VALIDATION`, `RATE_LIMITED` |
| `GET /student/numbers/find?number=…` | — | `{ number: string }` (as stored) | `INVALID_NUMBER`, `NUMBER_NOT_FOUND` |

### 6.2 Live lesson

```ts
// GET /student/lesson            (server runs lazy finalisation first, like the site)
type GetLessonResponse = {
  serverNow: IsoDateTime;
  limits: { maxPhotosPerSubmission: 3 };
  lessonCheckAvailable: boolean;            // aiEnabled && lessonCheckEnabled && configured
  active: ActiveLessonDto | null;
  upcoming: UpcomingLessonDto | null;
};

type UpcomingLessonDto = {
  lessonId: string;
  title: string;
  startsAt: IsoDateTime;
  durationMinutes: number;
  groupName: string | null;
};

type ActiveLessonDto = {
  lessonId: string;
  title: string;
  groupName: string | null;
  startsAt: IsoDateTime;
  durationMinutes: number;
  endsAt: IsoDateTime;                      // finishedAt ?? startsAt + duration (server-computed)
  joinedAt: IsoDateTime | null;
  items: LessonItemDto[];                   // order asc
};

type LessonItemDto = {
  id: string;
  order: number;
  isExtra: boolean;
  number: string;
  homeworkNumberId: string;
  topicId: string;
  topicTitle: string;
  conditionLatex: string | null;            // server MAY omit statements of a locked extra part
  result: LessonItemResult | null;
  submission: LessonSubmissionDto | null;   // latest
  // optional server-computed convenience flags (same rules as 4.7)
  closed: boolean;
  canSubmit: boolean;
};

type LessonSubmissionDto = {
  id: string;
  itemId: string;
  status: SolutionCheckStatus;
  verdict: SolutionVerdict | null;          // DONE only
  comment: string | null;                   // DONE only, student-facing
  errorCode: CheckErrorCode | null;         // FAILED only
  submittedAt: IsoDateTime;
  checkedAt: IsoDateTime | null;
};
```

| Method & path | Request | Response | Errors |
|---|---|---|---|
| `POST /student/lessons/{lessonId}/join` | — | `{ ok: true; joinedAt: IsoDateTime }` | `LESSON_NOT_FOUND`, `LESSON_NOT_ACTIVE`, `RATE_LIMITED` |
| `POST /student/lessons/{lessonId}/items/{itemId}/submissions` | `multipart/form-data`, `files` × 1…3 | `{ submission: LessonSubmissionDto }` (status `PENDING`) | `CHECK_QUEUE_FULL`, `RATE_LIMITED`, `LESSON_CHECK_DISABLED`, `UPLOAD_*`, `SUBMISSION_PHOTO_LIMIT {max: 3}`, `LESSON_ITEM_NOT_FOUND`, `LESSON_NOT_ACTIVE`, `ITEM_ALREADY_ACCEPTED {number}`, `EXTRA_PART_LOCKED`, `SUBMISSION_ALREADY_RUNNING`, `CONCURRENT_CHANGE` |
| `GET /student/lessons/{lessonId}/state` (poll) | — | `{ serverNow: IsoDateTime; status: "PLANNED" \| "ACTIVE" \| "FINISHED"; items: Array<{ id: string; result: LessonItemResult \| null; submission: LessonSubmissionDto \| null }> }` — includes `result` and the derived lesson status so the app needs no second request and learns about an early finish | `LESSON_NOT_FOUND`, `RATE_LIMITED` |

### 6.3 Files

`GET /files/{fileId}` and `GET /files/{fileId}?thumb=1` — bytes with bearer auth (or short-lived signed URLs
returned in `url` / `thumbUrl`). Same access rule as 3.10; 404 for anything not owned. Immutable caching.

### 6.4 Realtime

`GET /realtime` (SSE or WebSocket) with the same event set as 5.1, or — minimum for v1 — polling only
(`/checks/latest`, `/state`) plus re-fetch on screen focus. Push notifications are the natural channel for
"homework-checked" and "lesson started".

### 6.5 Mock behaviour checklist

- In-memory store per mock user: homeworks (numbers with statuses/notes, attached photos, checks), one lesson
  with `startsAt` relative to app start (e.g. upcoming in 1 min → active for 30 min), submissions.
- Implement faithfully: 4.1 sorting, 4.2 batch detaching on `DONE`, 4.3 state machine with timers, 4.4 mapping
  + projection, 4.6 derived status, 4.7 closed/unlock/auto-result rules and status mirroring, 4.8 finalisation
  when the lesson ends, 4.9 `joinedAt`, photo limits (`maxPhotosPerAssignment` = 10, 3 per submission),
  15 MiB total, JPEG/PNG only, one active check per homework / per lesson item, note ≤ 240.
- Scriptable verdicts: e.g. deterministic by number (`…1` → CORRECT, `…2` → INCORRECT, `…3` → UNCERTAIN,
  others not found on the photos) and a debug switch for `FAILED` classes, 429, 503.

### 6.6 Error codes (mapping to today's messages)

| Code | HTTP | Today's dictionary key |
|---|---|---|
| `UNAUTHENTICATED` | 401 | `apiCommon.sessionExpired` |
| `RATE_LIMITED` | 429 | `apiCommon.rateLimited` |
| `SERVICE_UNAVAILABLE` | 503 | `apiCommon.serviceUnavailable` |
| `VALIDATION` | 400 | `apiCommon.invalidData`, `apiStudent.homeworkChecks.invalidData`, `apiStudent.homeworkSubmissions.invalidDeleteData`, `apiStudent.topicStatus.invalidData` |
| `HOMEWORK_NOT_FOUND` | 404 | `apiCommon.homeworkNotFound` |
| `PHOTO_NOT_FOUND` | 404 | `apiStudent.homeworkSubmissions.photoNotFound` |
| `PHOTO_LIMIT_EXCEEDED` | 400 | `apiStudent.homeworkSubmissions.photoLimit` |
| `CONCURRENT_CHANGE` | 409 | `apiStudent.homeworkSubmissions.concurrentChange`, `apiStudent.lessonSubmissions.concurrentChange` |
| `UPLOAD_INVALID` | 400 | `apiStudent.upload.invalidPhotoData`, `contentLengthInvalid` |
| `UPLOAD_NOT_MULTIPART` | 415 | `apiStudent.upload.multipartExpected` |
| `UPLOAD_LENGTH_REQUIRED` | 411 | `apiStudent.upload.contentLengthRequired` |
| `UPLOAD_TOO_LARGE` | 413 | `apiStudent.upload.bodyTooLarge`, `photosTooLarge`, `topics.lib.upload.tooBig` |
| `UPLOAD_UNSUPPORTED_TYPE` | 400 | `apiStudent.upload.onlyPngOrJpg`, `topics.lib.upload.extension`, `mimeMismatch`, `signature` |
| `UPLOAD_BAD_NAME` | 400 | `topics.lib.upload.nameTooLong`, `badChars` |
| `UPLOAD_REJECTED` | 400 | `apiStudent.upload.fileRejected`, `topics.lib.upload.emptySize`, `sizeMismatch` |
| `CHECK_QUEUE_FULL` | 503 | `apiStudent.homeworkChecks.queueFull`, `apiStudent.lessonSubmissions.queueFull` |
| `CHECK_DISABLED` | 503 | `apiStudent.homeworkChecks.disabled` |
| `LESSON_CHECK_DISABLED` | 503 | `apiStudent.lessonSubmissions.disabled` |
| `CHECK_NO_PHOTOS` | 400 | `apiStudent.homeworkChecks.attachPhotosFirst` |
| `CHECK_NO_NUMBERS` | 400 | `apiStudent.homeworkChecks.noNumbers` |
| `CHECK_ALREADY_RUNNING` | 409 | `apiStudent.homeworkChecks.alreadyRunning` |
| `CHECK_PHOTOS_CHANGED` | 409 | `apiStudent.homeworkChecks.photosChanged` |
| `STATUS_READ_ONLY` | 403 | `apiStudent.topicStatus.statusReadOnly` |
| `NUMBER_NOT_FOUND` | 404 | `apiStudent.topicStatus.numberNotFound`, `apiStudent.findNumber.notFound` |
| `INVALID_NUMBER` | 400 | `apiStudent.findNumber.invalidNumber` |
| `LESSON_NOT_FOUND` | 404 | `apiCommon.lessonNotFound` |
| `LESSON_NOT_ACTIVE` | 409 | `apiStudent.lesson.notActive`, `apiStudent.lessonSubmissions.lessonNotActive` |
| `LESSON_ITEM_NOT_FOUND` | 404 | `apiStudent.lessonSubmissions.itemNotFound` |
| `SUBMISSION_PHOTO_LIMIT` | 400 | `apiStudent.lessonSubmissions.photoLimit` |
| `ITEM_ALREADY_ACCEPTED` | 409 | `apiStudent.lessonSubmissions.alreadyAccepted` |
| `EXTRA_PART_LOCKED` | 409 | `apiStudent.lessonSubmissions.extraPartLocked` |
| `SUBMISSION_ALREADY_RUNNING` | 409 | `apiStudent.lessonSubmissions.alreadyRunning` |
| `FEATURE_UNAVAILABLE` | 503 | `apiCommon.migrationMissing` |

---

## 7. Open questions / things that cannot be done natively as-is

1. **HEIC and oversized camera photos.** The server accepts only real PNG/JPEG (extension, declared MIME and
   magic bytes are all checked) and at most 15 MiB per request in total. iPhone cameras produce HEIC and
   multi-megabyte images. *Suggested:* always re-encode on device to JPEG (`expo-image-manipulator`, long side
   ≈ 2000–2500 px, quality ≈ 0.8), give files a safe ASCII name ending in `.jpg`, send MIME `image/jpeg`, and
   pre-check the total size and the remaining slots before uploading. Confirm the target resolution with the
   owner (the model must still read handwriting).
2. **`Content-Length` requirement.** The homework upload route answers 411 without `Content-Length` and the lesson
   route 400; React Native `fetch` with `FormData` normally sends it, chunked uploads do not. A future mobile
   endpoint should not depend on it, or the client must avoid streaming uploads.
3. **Stable error codes.** Today the API returns only localised text; check failures are classified by regex
   over raw (partly Russian) provider messages on the client. The mobile contract (6) assumes the server will
   return `code` / `errorCode`. Until then the app would have to ship the regex table of 4.5.
4. **Auth and files.** The site uses the `tutor_session` cookie, including for `<img src="/files/…">`. Native
   `Image` needs either an `Authorization` header (supported by `expo-image`) or signed URLs. Decision needed
   together with spec 01. Note the 120 requests/min `api:file-read` limit also counts thumbnails.
5. **Realtime on mobile.** SSE (`EventSource`) is not built into React Native and the server allows only 2
   connections per user (a phone + two browser tabs would collide). *Suggested for v1:* polling (4 s while a check
   runs, with the same back-off) + re-fetch on focus/foreground; later push notifications for "check finished",
   "lesson starts in N minutes / started", "new homework".
6. **Background behaviour.** Timers and polling stop when the app is backgrounded; a check started before
   leaving the app must be resumed on return (the screen must re-fetch and continue polling if the status is
   still `PENDING`/`CHECKING`). Should a local/push notification announce the result? The site already creates an
   in-app notification `homework-checked` for homework checks but none for lesson checks.
7. **Early finish is not pushed to the student.** When the teacher ends a lesson early the student's live screen
   stays open until the scheduled end (the realtime event has no `studentId`); submissions fail with 409
   `lessonNotActive`. Should the mobile app handle this better (poll `status` in `/state`, treat `LESSON_NOT_ACTIVE`
   as "lesson is over" and switch to L1)? Recommended: yes.
8. **No post-lesson view for the student.** After the end the tab just says "no lesson"; results («Принято», «Не
   успел», …) are no longer visible to the student anywhere on the site. Is a "last lesson results" card
   desired in the app? (Would need a new read endpoint; teacher-side data exists.)
9. **No lesson timer / remaining time on the site.** The app can show a countdown from `startsAt + duration`
   — confirm it is wanted. Also confirm whether a tab badge for an active lesson is desired.
10. **Clock skew.** Lesson state is derived from wall-clock time. The site passes `serverNow` only for the start
    watcher. The mobile API should return `serverNow` everywhere it returns schedule data (proposed in 6) and the
    app should compute with the offset, never with raw device time.
11. **Time zone.** The site renders dates in Moscow time regardless of the device. Should the app show Moscow
    time (consistent with teachers) or device-local time? Recommended: Moscow, matching the site.
12. **Homework check history.** The student sees only the latest check; earlier batches' photos and verdicts are
    teacher-only. Keep it that way in the app, or add a read-only history? (Server keeps up to 15 checks per
    homework in the read model and prunes to 50 finished checks per student.)
13. **Photos of a running check.** The site lets the student add/delete photos while a check runs (they go to
    the next batch / are removed from the current one, while the snapshot is unaffected). For clarity the app
    could lock the batch UI during `PENDING`/`CHECKING` — product decision.
14. **Client-side slot check.** The site lets the user pick more files than free slots and then shows the server
    error; the app should cap the picker (`selectionLimit = max − attached`, and 3 for lesson items).
15. **Lesson preview before sending.** On the site picking files submits immediately (no confirmation). With a
    camera flow, a "retake / send" step is advisable — confirm. Each submit consumes hourly quota (30/h default).
16. **LaTeX rendering.** Statements are mixed text + `$…$` / `$$…$$` / `\[…\]` with custom layout rules (4.10) and
    KaTeX. React Native has no native KaTeX; options: a WebView-based KaTeX renderer (one per card is heavy in long
    lists — consider one WebView per screen or pre-measured auto-height views), or `react-native-math-view` /
    MathJax-SVG. Needs a shared decision across all student/teacher specs.
17. **Lesson results can lower homework colours.** Lesson outcomes write the global status without downgrade
    protection (a green number can become red), while homework checks never downgrade. This is existing behaviour;
    the mock must imitate it — flagging in case it is unintended.
18. **Notes are not scoped to assigned numbers** on the server (any existing number accepts a note). The mobile
    endpoint should keep or tighten this deliberately.
19. **`recognizedAnswer` on the lesson screen** is delivered but not shown; the proposed lesson DTO drops it.
    Confirm it should stay hidden during lessons.
20. **Hints toggle.** Several helper texts are hidden when the user disables hints in settings; the app needs
    the same preference (spec 01) or should decide to always show them.
21. **Single-instance assumptions.** Queue, realtime and the "tracked checks" set are in-memory on one server
    process; nothing for the app to do, but a real mobile backend must keep using the same process (or the queue
    must be externalised) for check status to stay correct.
