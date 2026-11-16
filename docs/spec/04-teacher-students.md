# 04 — Teacher: students list, student detail, homework review / assign, deadlines, accounts

Subsystem spec for the native mobile rewrite (Expo / React Native, TypeScript) of "ШБЗ Школа".
Everything below is taken from the site code (paths are relative to the web repo root).
Where the document proposes something that does not exist on the site it is marked **[PROPOSAL]**.
Conventions shared with the other spec files (`01-shell-auth.md`): API base path `/api/mobile/v1`, `Authorization: Bearer <sessionToken>`,
`Accept-Language: ru | en`, ISO-8601 UTC timestamps, error envelope `{ error: { code, message, retryAfterSeconds? } }`,
helpers `format()` / `plural()` / `normalizeSingleLineText()` / `normalizeLoginInput()` (defined in 01 §0).

Source files read: `app/(dashboard)/teacher/page.tsx`, `teacher/layout.tsx`, `teacher/loading.tsx`, `teacher/students/page.tsx`,
`teacher/students/[studentId]/layout.tsx|page.tsx|assign/page.tsx|lessons/page.tsx|lessons/new/page.tsx|export/pdf/route.ts`,
`teacher/accounts/page.tsx`, `teacher/account/page.tsx`, `middleware.ts`, `next.config.ts`, `lib/auth.ts`,
`components/account-create-form.tsx`, `account-credentials-dialog.tsx`, `account-directory.tsx`, `account-password-reset-button.tsx`,
`account-students-manager.tsx`, `account-teachers-manager.tsx`, `account-settings-view.tsx` (header only), `student-create-form.tsx`,
`student-password-reset-button.tsx`, `password-suggest-menu.tsx`, `teacher-student-tabs.tsx`, `teacher-homework-review-list.tsx`,
`teacher-homework-assign-board.tsx`, `teacher-student-lessons.tsx`, `teacher-lesson-compose-switch.tsx`, `teacher-lesson-compose-board.tsx`,
`teacher-lesson-create-form.tsx`, `lesson-compose-card.tsx`, `lesson-manual-add.tsx`, `lesson-result-toggle.tsx`,
`teacher-progress-timeline-filter.tsx`, `progress-status-history.tsx`, `number-select-card.tsx`, `shbz-datetime-picker.tsx`,
`use-topic-conditions.ts`, `delete-button.tsx`, `confirm-dialog.tsx`, `copy-value.tsx`, `homework-status-badge.tsx`, `page-header.tsx`,
`dashboard-nav.tsx`, `dashboard-realtime-listener.tsx`, `actions/student.ts`, `actions/account.ts`,
`app/api/teacher/homeworks/route.ts`, `student-deadlines/route.ts`, `number-status/route.ts`, `progress-history/route.ts`,
`topics/conditions/route.ts`, `lessons/route.ts`, `lessons/[lessonId]/status/route.ts`,
`lessons/[lessonId]/participants/[participantId]/items/route.ts`, `.../items/[itemId]/result/route.ts`, `.../regenerate/route.ts`,
`teacher/lessons/[lessonId]/pdf/route.ts` (header), `app/files/[fileId]/route.ts` (access part), `lib/homework-issue.ts`,
`lib/homework-deadline-mirror.ts`, `lib/homework-attention.ts`, `lib/homework-label.ts`, `lib/progress-policy.ts`, `lib/progress-write.ts`,
`lib/progress-history.ts`, `lib/solution-check-status.ts`, `lib/platform-data.ts` (`getTeacherTopicsOverview`, `getTeacherStudentDetail`,
`getTeacherStudentHomeworks`, `getTeacherStudentLessons`, `getProgressTimeline`), `lib/student-export-data.ts`, `lib/weekly-report-pdf.tsx`,
`lib/report-period.ts`, `lib/lesson-status.ts`, `lib/lesson-plan.ts` (limits, `normalizePlanParams`, `planLessonItemsUpdate`), `lib/plan-error.ts`,
`lib/password-policy.ts`, `lib/password-generate.ts`, `lib/rate-limit.ts`, `lib/persistent-rate-limit.ts`, `lib/api-rate-limit.ts`,
`lib/dashboard-realtime.ts`, `lib/file-access.ts`, `lib/utils.ts`, `lib/i18n/dictionaries/students.ts|ru.ts|en.ts|topics.ts|planner.ts|api-common.ts|api-planner.ts|api-content.ts|records.ts|student.ts`,
`prisma/schema.prisma` (User, StudentTopicNumberStatus, ProgressStatusEvent, HomeworkAssignment, enums).

---

## 0. Roles, ownership and what DEVELOPER vs TEACHER can do (read this first)

### 0.1 Ownership model

- Every student row has `User.teacherId: string | null` — the **owner teacher**. It is set to the creating teacher's id when a TEACHER creates
  the student (`actions/student.ts`), or to the teacher chosen in the form when a DEVELOPER creates the student (`actions/account.ts`).
- `teacherId` is `onDelete: SetNull`. A student with `teacherId = null` is an **orphan**: invisible to every teacher, visible only to DEVELOPER
  on the accounts screen (with a red warning line).
- All read functions in `lib/platform-data.ts` take a `viewer = { id, role }`: `TEACHER` → filter `{ teacherId: viewer.id }`; `DEVELOPER` → no filter.
  For a TEACHER, someone else's student is indistinguishable from a non-existent one (404 / "not found").
- Topics and problem numbers are global (shared by everyone). Progress (`StudentTopicNumberStatus`) is per `studentId + homeworkNumberId`.

### 0.2 Capability matrix (exact gates from the code)

| Capability | TEACHER | DEVELOPER | Gate in code |
|---|---|---|---|
| Teacher home `/teacher` | yes | **no** (redirected to `/developer/topics`) | `requireUser(UserRole.TEACHER)` |
| Students list `/teacher/students` | yes (own students) | **no** | `requireUser(UserRole.TEACHER)` |
| Student detail pages (`/teacher/students/[id]`, `/assign`, `/lessons`, `/lessons/new`) | yes (own students) | **no** (page-level redirect) | `requireUser(UserRole.TEACHER)` in layout + each page |
| Create student (self-owned) | yes | no (uses "create account" instead) | `createStudentAction`: `requireUser(TEACHER)` |
| Delete student | own only | any | `deleteStudentAction`: `requireUser([TEACHER, DEVELOPER])` |
| Reset student password | own only | any | `resetStudentPasswordAction` |
| Issue homework `POST /api/teacher/homeworks` | own students | any student (API only, no UI) | route + `issueHomework` |
| Cancel homework `DELETE /api/teacher/homeworks` | own students | any (API only) | route |
| Set a number status `POST /api/teacher/number-status` | own students | **401** | `user.role !== TEACHER` → 401 |
| Set per-number deadline `POST /api/teacher/student-deadlines` | own students | **401** | `user.role !== TEACHER` → 401 |
| Progress history `GET /api/teacher/progress-history` | own students | any | route + `getProgressHistory` |
| Student PDF report | own students | any (API only; no button in the developer UI) | export route |
| Lesson item result / items / regenerate / status / create lesson | own lessons + own students | any | lesson routes |
| Accounts screen `/developer/accounts` (create teacher/student accounts, change student owner, reset teacher password, delete teacher) | **no** (redirected to `/teacher`) | yes | `requireUser(UserRole.DEVELOPER)` |

Consequences for the mobile app:

- The whole "Students" area (screens S1–S7 below) is a **TEACHER-only** tab. DEVELOPER's bottom navigation has no "students" tab; it has
  "accounts" instead (`dict.nav.developer.accounts` = «аккаунты» / "accounts"). Nav item lists (from `components/dashboard-nav.tsx`):
  TEACHER: overview, topics, **students**, groups, lessons, calls, (settings as a gear). DEVELOPER: topics, **accounts**, calls, statistics, dev panel, (settings).
- Several client components compute `routePrefix = pathname.startsWith("/developer") ? "/developer" : "/teacher"`; because the student pages
  reject DEVELOPER, that branch is dead for this subsystem. Mobile should not build developer variants of S2–S7.
- Developer URLs are a rewrite: `/developer/accounts` renders `app/(dashboard)/teacher/accounts/page.tsx`.

---

## 1. Screens

Shared header control on every site page here: `ShbzNumberSearch` ("find a problem number", endpoint `/api/teacher/topics/find-number`) — specified in
`01-shell-auth.md` §3.9; on mobile it lives in the shell, not in these screens.

Generic states for every screen: loading = `DashboardSectionLoadingState` skeleton (`teacher/loading.tsx`); unexpected error = dashboard error shell
(`dict.shells.errorTitle` «Раздел временно недоступен» / "This section is temporarily unavailable", `dict.shells.errorDescription`, button `dict.common.retry`
«Попробовать снова» / "Try again"); unknown / foreign student id = not-found shell (`dict.shells.notFoundTitle` «Страница не найдена» / "Page not found").

### S1. Teacher home (overview)

- **Site route:** `/teacher` — **Roles:** TEACHER only.
- **Purpose:** landing page with three navigation cards and counters.
- **Data:** `getTeacherTopicsOverview(user).stats` + `getParentCallCounts(user)`.
- **Layout (top to bottom):**
  1. Page header: kicker `dict.teacherHome.kicker` («Обзор» / "Overview"), title `dict.teacherHome.title` («Кабинет преподавателя» / "Teacher's account").
  2. Grid of 3 nav cards (auto-fit, min 260 px → one column on a phone). Each card: kicker, title, two stat tiles (count-up animated numbers), footer button `dict.common.go` («Перейти» / "Open").

| Card | kicker / title | stat 1 | stat 2 | target |
|---|---|---|---|---|
| Topics | `teacherHome.topics.kicker` «Темы»/"Topics"; `.title` «Материалы и ответы»/"Materials and answers" | `.topics` «Темы»/"Topics" = `stats.totalTopics` | `.numbers` «Номера»/"Problems" = `stats.totalNumbers` | `/teacher/topics` |
| Students | `teacherHome.students.kicker` «Ученики»/"Students"; `.title` «Аккаунты и прогресс»/"Accounts and progress" | `.students` «Ученики»/"Students" = `stats.totalStudents` | `.files` «Файлы»/"Files" = `stats.totalFiles` | `/teacher/students` |
| Calls | `teacherHome.calls.kicker` «Звонки»/"Calls"; `.title` «Связь с родителями»/"Parent contact" | `.due` «Пора позвонить»/"Time to call" = `callCounts.due` | `.overdue` «Просрочено»/"Overdue" = `callCounts.overdue` | `/teacher/calls` |

- `totalTopics`, `totalNumbers`, `totalFiles` are **global** (shared bank; `totalFiles` = number of `StoredFile` rows referenced as a topic theory file, a topic
  homework file or a per-number answer file). `totalStudents` = the teacher's own students.
- **Mobile:** first tab ("overview") of the teacher tab bar; three tappable cards in a vertical list; whole card is the touch target (the site only makes the button clickable).

### S2. Students list

- **Site route:** `/teacher/students` — **Roles:** TEACHER only (own students).
- **Purpose:** add a student account, see all own students, jump to a student's card, reset a password, delete a student.
- **Data:** `getTeacherTopicsOverview(user).students` — ordered by `name` ascending.
- **Layout:**
  1. Header: kicker `dict.students.list.kicker` («Ученики» / "Students"), title `dict.students.list.title` («Аккаунты и прогресс» / "Accounts and progress").
  2. Optional notice banner (success = green, error = red; `aria-live="polite"`) — see the notice table below.
  3. Section `dict.students.list.addStudent` («Добавить ученика» / "Add a student") → card with the **student create form** (S2a).
  4. Section `dict.students.list.currentStudents` («Текущие ученики» / "Current students"):
     - Empty: card with `dict.students.list.empty` («Пока ни одного ученика не добавлено.» / "No students added yet.").
     - Otherwise a card listing rows (on ≥ lg a 3-column table with header `colStudent` «Ученик»/"Student", `colLogin` «Логин»/"Login", `colActions` «Действия»/"Actions"; below lg each row is a vertical stack). Row content:
       - student name (bold, truncated with full name in tooltip);
       - login (`student.email`) as a **copy-on-tap** value (`CopyValue`, label `dict.students.list.loginLabel` «Логин»/"Login"; feedback pill `dict.topics.widgets.copy.copied` «Скопировано»/"Copied");
       - buttons: `viewProgress` («Смотреть прогресс» / "View progress") → S3; `dict.students.passwordReset.button` («Сменить пароль» / "Reset password") → dialog D2; `delete` («Удалить» / "Delete") → confirm dialog D3.
- **Notices** (the site passes them as query params after a server-action redirect; mobile should show the same texts as a toast/banner after the mutation resolves). Priority order exactly as coded: `passwordReset` → `passwordResetError` → `studentCreated` → `studentDeleted` → `studentError`.

| Trigger (query) | Key `dict.students.list.notices.*` | Tone | RU | EN |
|---|---|---|---|---|
| `passwordReset=1` | `passwordReset` | success | Пароль ученика обновлён, все его сессии завершены. Передайте ученику новый пароль. | The student's password has been updated and all their sessions ended. Pass the new password to the student. |
| `passwordResetError=invalid` | `passwordInvalid` | error | Новый пароль не подходит: минимум 8 символов, обязательно буквы и цифры. | The new password is not valid: at least 8 characters with both letters and digits. |
| `passwordResetError=missing` | `passwordMissing` | error | Такого ученика уже нет в системе. | This student no longer exists. |
| `passwordResetError=save` | `passwordSave` | error | Не удалось сменить пароль. Повторите попытку ещё раз. | Could not change the password. Please try again. |
| `passwordResetError=rateLimited` | `passwordRateLimited` | error | Слишком много смен пароля за короткое время. Подождите несколько минут. | Too many password changes in a short time. Wait a few minutes. |
| `studentCreated=1` | `studentCreated` | success | Новый ученик успешно добавлен. Ему уже можно входить в систему. | New student added. They can sign in now. |
| `studentDeleted=1` | `studentDeleted` | success | Ученик удалён. Список и статистика уже обновлены. | Student deleted. The list and statistics are already up to date. |
| `studentError=invalid` | `studentInvalid` | error | Укажите имя, логин и пароль: минимум 8 символов, обязательно буквы и цифры. | Enter a name, a login and a password: at least 8 characters with both letters and digits. |
| `studentError=exists` | `studentExists` | error | Ученик с таким логином уже существует. | A student with this login already exists. |
| `studentError=save` | `studentSave` | error | Не удалось создать ученика. Проверьте подключение к PostgreSQL и повторите попытку. | Could not create the student. Check the PostgreSQL connection and try again. |
| `studentError=rateLimited` | `studentRateLimited` | error | Слишком много попыток создать учеников за короткое время. Подождите несколько минут. | Too many students created in a short time. Wait a few minutes. |
| `studentError=delete` | `studentDelete` | error | Не удалось удалить ученика. Повторите попытку ещё раз. | Could not delete the student. Please try again. |
| `studentError=deleteMissing` | `studentDeleteMissing` | error | Такого ученика уже нет в системе. | This student no longer exists. |

  (The current create form returns its result inline and never sets `studentCreated` / `studentError=invalid|exists|save|rateLimited`; those four rows are legacy but the texts are still valid for a mobile toast.)

- **Mobile:** "students" tab. FlatList of student rows (name + login); tap row → S3; long-press / trailing "⋯" → action sheet (copy login, reset password, delete). Create form → "+" button in the header opening a bottom sheet / modal screen (S2a). Pull-to-refresh.

#### S2a. Student create form (`components/student-create-form.tsx`)

- Fields (all single-line text inputs, password is **plain visible text** — the teacher dictates it aloud):

| Field | Label key | RU / EN | Placeholder | Constraints |
|---|---|---|---|---|
| name | `dict.students.createForm.name` | Имя ученика / Student's name | `namePlaceholder` «Мария Смирнова» / "Maria Smirnova" | required, `maxLength 120` (`MAX_USER_NAME_LENGTH`), `autoComplete="name"` |
| login | `createForm.login` | Логин ученика / Student's login | `loginPlaceholder` `maria@example.com` | required, `maxLength 254` (`MAX_LOGIN_LENGTH`), no auto-capitalise/auto-correct/spellcheck. Any string — it is not validated as an e-mail |
| password | `createForm.password` | Пароль / Password | `passwordPlaceholder` «Минимум 8 символов» / "At least 8 characters" | required, `maxLength 256`, live validation (below) |

- Submit button: `createForm.submit` («Добавить ученика» / "Add student"); while pending `createForm.creating` («Создаём…» / "Creating…").
  Disabled when pending, or name/login blank after trim, or password empty, or password has a problem.
- Live password feedback under the field: problem text from `dict.passwordPolicy.*` (§4.7) in red, otherwise (non-empty) `createForm.passwordOk` («Пароль подходит.» / "Password looks good.") in green.
- **Password suggestion menu** (`PasswordSuggestMenu`): opens when the password field gets focus while password is empty **and** name and login are both non-blank. It shows a generated password (`generatePasswordFromName(name)`, §4.8). Content: title `dict.students.passwordSuggest.title` («Предлагаем пароль» / "Suggested password"), the suggestion (tap = fill the field; hint `pickHint` «Нажмите, чтобы подставить» / "Click to use it"), link `another` («Другой вариант» / "Another one") = regenerate, link `custom` («Ввести свой» / "Type my own") = close. Typing in the password field closes it; changing the name discards the cached suggestion.
- On submit: `createStudentAction` (§3.1). Failure → red inline text under the form = `result.message`. Success → the form is cleared and the **credentials dialog** D1 opens with `{ name: name.trim(), login: login.trim().toLowerCase(), password }` and title `createForm.createdTitle` («Аккаунт ученика создан» / "Student account created").
- **Mobile:** modal screen with three fields; suggestion as an inline chip row under the password field ("Suggested: Smirnova-beku4725 · Another one"); success → D1 as a full-height bottom sheet.

#### D1. Credentials dialog (`account-credentials-dialog.tsx`) — shown once after an account is created

- Kicker `dict.students.credentials.kicker` («Аккаунт создан» / "Account created"); heading = title passed by the caller; intro `credentials.intro`
  («{name} уже может входить на платформу. Пароль показывается только сейчас — восстановить его позже нельзя, можно только задать новый.» /
  "{name} can sign in now. The password is shown only once — it cannot be recovered later, only replaced with a new one.").
- Block `credentials.messageTitle` («Сообщение для передачи» / "Message to pass on"): three monospace lines, each tappable to copy only its value:
  `{credentials.site}: {host}`, `{credentials.login}: {login}`, `{credentials.password}: {password}` (labels «Сайт»/"Site", «Логин»/"Login", «Пароль»/"Password"). On the site `host = window.location.host`.
- Buttons: `credentials.copy` («Скопировать» / "Copy") copies the whole 3-line message joined with `\n`; `credentials.done` («Готово» / "Done") closes.
  Feedback: `copiedMessage` («Скопировано — можно вставлять в мессенджер.» / "Copied — paste it into a messenger."), per line `copiedLine` («{label} скопирован — можно вставлять.» / "{label} copied — ready to paste."), pill `copied` «Скопировано»/"Copied".
- The password is never retrievable afterwards (only the hash is stored).
- **Mobile:** bottom sheet; add a native **Share** button next to Copy (share sheet with the 3-line message) **[PROPOSAL]**. `host` must come from app config (the site domain), see §7.

#### D2. Reset-password dialog (`account-password-reset-button.tsx`, target `student` or `teacher`)

- Kicker `dict.students.passwordReset.kicker` («Смена пароля» / "Password reset"); heading `passwordReset.heading` («Новый пароль для «{name}»» / "New password for “{name}”");
  consequences text `passwordReset.student.consequences` («Все активные сессии ученика будут завершены — войти можно будет только с новым паролем. Прогресс, ДЗ и история проверок не изменятся.» /
  "All of the student's active sessions will end — they will only be able to sign in with the new password. Progress, homework and check history stay unchanged.")
  or `passwordReset.teacher.consequences` for a teacher.
- One visible-text input: label `passwordReset.newPassword` («Новый пароль» / "New password"), placeholder `newPasswordPlaceholder` («От 8 символов, буквы и цифры» / "8+ characters, letters and digits"), `maxLength 256`, autofocus. Live feedback: problem text (red) or `passwordReset.passwordOk` («Пароль подходит. Запишите его — после сохранения он больше нигде не показывается.» / "Password looks good. Write it down — it will not be shown anywhere after saving.").
- Buttons: `passwordReset.cancel` («Отмена» / "Cancel"), `passwordReset.submit` («Сменить пароль» / "Reset password"; pending `saving` «Сохраняем…» / "Saving…"). Submit disabled when empty / invalid / pending. Cannot be dismissed while pending.
- Submits `resetStudentPasswordAction` (§3.3) or `resetTeacherPasswordAction` (§3.9). On the site the action redirects to the list page with a notice (even when started from the student detail header).
- **Mobile:** bottom sheet with one field; after success close the sheet and show the `passwordReset` toast **in place** (do not navigate away from the student card).

#### D3. Delete-student confirm dialog (`DeleteButton` + `ConfirmDialog`)

- Kicker `dict.topics.widgets.confirm.kicker` («Подтверждение» / "Confirmation") in red; title `dict.students.list.deleteTitle` («Удалить ученика?» / "Delete this student?");
  description = `deleteBefore` + **«{name}»** + `deleteAfter` («Аккаунт «{name}» будет удалён вместе со всеми его ДЗ, фото решений, историей проверок, статусами по номерам и дедлайнами. Это действие нельзя отменить.» /
  "The account «{name}» will be deleted along with all of their homework, solution photos, check history, problem statuses and deadlines. This cannot be undone.").
- Buttons: `dict.topics.widgets.confirm.cancel` («Отмена» / "Cancel"), `confirm.confirm` («Да, удалить» / "Yes, delete"; pending `confirm.pending` «Удаляем…» / "Deleting…").
- Calls `deleteStudentAction` (§3.2). **Mobile:** native destructive alert; after success pop back to S2 and show `studentDeleted` toast.

### S3. Student card — shell (header + tabs)

- **Site route:** layout for `/teacher/students/[studentId]/**` — **Roles:** TEACHER only; student must be owned, otherwise 404.
- **Data:** `getTeacherStudentDetail(user, studentId).student` (`id`, `name`, `email`) and `getTeacherStudentHomeworks(user, studentId)` (only for the tab counter).
- **Layout:**
  1. Back link `dict.students.detail.backToAll` («← Ко всем ученикам» / "← All students") → S2.
  2. Title = student name; description line = student login (`email`). No kicker, no progress metrics (the teacher has no per-topic progress view).
  3. Action buttons (wrap):
     - `detail.report7d` («Отчёт: 7 дней» / "Report: 7 days") → `GET /teacher/students/{id}/export/pdf`
     - `detail.report30d` («30 дней» / "30 days") → `…/export/pdf?period=30d`
     - `detail.reportYear` («Учебный год» / "School year") → `…/export/pdf?period=year`
     - `dict.students.passwordReset.button` → D2
     - `detail.deleteStudent` («Удалить ученика» / "Delete student") → D3
  4. Segmented tabs (`aria-label` `detail.tabsAria` «Разделы ученика» / "Student sections"):

| # | Route | Label | Short label (narrow phone) |
|---|---|---|---|
| 1 (default) | `/teacher/students/{id}` | `detail.tabReview` «Проверка ДЗ» / "Homework review", or with counter `detail.tabReviewWithCount` «Проверка ДЗ · {n}» / "Homework review · {n}" | `tabReviewShort` «Проверка» / "Review", `tabReviewShortWithCount` «Проверка · {n}» / "Review · {n}" |
| 2 | `/teacher/students/{id}/assign` | `detail.tabAssign` «Выдать ДЗ» / "Assign homework" | `tabAssignShort` «Выдать» / "Assign" |
| 3 | `/teacher/students/{id}/lessons` (also active for `/lessons/new`) | `detail.tabLessons` «Занятия» / "Lessons" | — |

  The counter `n = activeHomeworksCount` = number of assignments that are **not completed** (completed ⇔ `numbers.length > 0 && solvedCount === numbers.length`); 0 when `assignmentsEnabled === false`. When `n === 0` the label has no counter.
  The site switches to the short labels below 360 px (ru) / 430 px (en).
- **Mobile:** stack screen pushed from S2. Header title = student name, subtitle = login. Header "⋯" menu → action sheet: three report items (open/share PDF, S8), "Reset password", "Delete student". Below the header a 3-segment control or top tabs (material top tabs); use the short labels always on phones.

### S4. Tab "Homework review" (default)

- **Site route:** `/teacher/students/[studentId]` — TEACHER only.
- **Purpose:** see every homework issued to the student, the student's photos and AI check verdicts, set per-number traffic-light statuses by hand, accept AI verdicts in bulk, cancel a homework, inspect status history.
- **Data:** `getTeacherStudentHomeworks(user, studentId)` → `{ assignmentsEnabled, notesEnabled, assignments }` (view model §2.3). Cached 15 s on the server.
- **Section card title:** `dict.students.review.title` («Проверка домашних заданий» / "Homework review").
- **States:**
  - `assignmentsEnabled === false` → warning notice `review.dbOutdated` («Раздел ДЗ появится после обновления базы данных до актуальной версии.» / "The homework section will appear once the database is updated to the latest version."). (Mock: never happens; keep the branch for the real API.)
  - empty list → dashed panel: `review.emptyTitle` («ДЗ пока не выдано» / "No homework assigned yet") + `review.emptyHint` («Выдайте первое ДЗ во вкладке «Выдать ДЗ».» / "Assign the first homework in the “Assign homework” tab.").
- **List structure (top to bottom):**
  1. Error banner (red) when the last mutation failed (text = server `error` or the fallback from `review.errors.*`).
  2. If **any** check result of any assignment has `copySuspected || injectionSuspected`: right-aligned toggle button "lesson mode": `review.hideDiagnostics` («Скрыть диагностику на время урока» / "Hide diagnostics during the lesson") ↔ `review.showDiagnostics` («Показать служебную диагностику» / "Show internal diagnostics"). In lesson mode all diagnostics blocks and the injection banner are hidden (the device is turned towards the student). Local state only, default off.
  3. **Active assignments** (not completed), in server order (attention sort, §4.4).
  4. **Completed assignments** collapsed inside a disclosure labelled `review.completedHomeworks` («Выполненные ДЗ ({n})» / "Completed homework ({n})"); shown only when n > 0.
  5. Floating undo toast (bottom centre) after "accept AI verdicts": `review.verdictsAccepted` («Вердикты ИИ приняты: {n}» / "AI verdicts accepted: {n}") + link `review.undo` («Отменить» / "Undo"); auto-hides after **10 000 ms** (`ACCEPT_UNDO_MS`).
- **Assignment card** (DOM id `homework-{assignmentId}` — progress-history links deep-link to it). All cards start **collapsed**; tapping the header toggles.
  - Optional **injection banner** at the very top (only when not in lesson mode and the latest DONE check has results with `injectionSuspected`): shield icon + `review.injectionTitle` («На фото найдена надпись-инструкция для ИИ» / "The photo contains an instruction aimed at the AI"); for each such result with a note a monospace quote `"{review.number}: {injectionNote}"`; footer `review.injectionUnreliable` («Вердикты этой проверки могут быть недостоверны.» / "The verdicts of this check may be unreliable."). Neutral/strict palette — must **not** use the red "incorrect" colour.
  - **Header (always visible):** chevron; label = `homeworkAssignmentLabel` (custom `title`, else `dict.common.homeworkN` «ДЗ {n}» / "Homework {n}" with `n = orderInTopic`); badges `review.completed` («Выполнено» / "Completed", green) when completed and `review.overdue` («Просрочено» / "Overdue", red) when `!completed && deadlineAt && deadlineAt < now`; line 2 = `topicTitle`; line 3 = `review.issuedAt` («Выдано {date}» / "Assigned {date}") + " · " + `review.deadlineUntil` («дедлайн до {date}» / "due {date}") (each part only if its date exists; date = `formatDateTime` → `dd.MM.yyyy, HH:mm` in `ru-RU` / `en-GB`).
  - **Cancel button** on the right of the header: `review.cancelLabel` («Отменить ДЗ» / "Cancel homework") → confirm dialog: title `review.cancelTitle` («Отменить ДЗ?» / "Cancel this homework?"); body: `review.cancelLine1` («ДЗ будет удалено, дедлайны сняты с его номеров.» / "The homework will be deleted and the deadlines removed from its problems."); if the assignment has pending photos or checks: `cancelFilesBefore` + **`cancelFilesStrong`** + ":" + (`cancelFilesPhotos` with `n = photos.length`) + "," + (`cancelFilesChecks` with `n = checks.length`) + `cancelFilesAfter` → «Вместе с ним **безвозвратно удалятся присланные учеником файлы**: фото решений — {n}, результаты ИИ-проверок — {n}. Скачать их потом будет неоткуда.» / "Along with it, **the files sent by the student will be permanently deleted**: solution photos — {n}, AI check results — {n}. There will be no way to download them later."; `review.cancelLine3` («Выставленные статусы по номерам сохранятся. Это действие нельзя отменить.» / "Problem statuses already set will be kept. This cannot be undone."). Confirm `review.cancelConfirm` («Да, отменить» / "Yes, cancel"), pending `review.cancelPending` («Отменяем…» / "Cancelling…"). Calls `DELETE /api/teacher/homeworks` (§3.5); on success the list reloads; on failure the banner shows the server error or `review.errors.cancel` («Не удалось отменить ДЗ.» / "Could not cancel the homework.").
  - **Summary chips (always visible):** `review.solved` («Решено {solved}/{total}» / "Solved {solved}/{total}"), `review.red` («Красные» / "Red") + red count, `review.unmarked` («Не отмечено {n}» / "Unmarked {n}", `n = totalNumbers − markedCount`). Then a thin progress bar with `solvedPercent`.
  - **Expanded body:**
    1. **Pending photos** (photos attached but not yet consumed by a check): thumbnails 64×64 (`/files/{fileId}?thumb=1`), tap opens the original `/files/{fileId}`; caption `review.photosTitle` («Фото, ещё не отправленные на проверку ({n})» / "Photos not yet sent for a check ({n})") + optional `review.lastAutoCheck` (« · посл. автопроверка {date}» / " · last AI check {date}", date = `checkedAt` of the latest DONE check). If there are no pending photos: `review.noPhotos` («Ученик пока не прикрепил фото решения.» / "The student has not attached a solution photo yet.").
    2. **Accept AI verdicts** — shown only when the latest DONE check has at least one result whose verdict ≠ `UNCERTAIN`: button `review.acceptVerdicts` («Принять вердикты ИИ» / "Accept AI verdicts") + hint `review.acceptVerdictsHint` («Верно → Зелёный (после ошибок — Жёлтый), Ошибка → Красный; «на проверке» не трогаем.» / "Correct → green (yellow after mistakes), incorrect → red; “under review” is left as is."). Behaviour in §4.3.
    3. Kicker `review.numbers` («Номера» / "Problems"), then one **number card** per assignment number (sorted numerically, `compareHomeworkNumbers`):
       - left 3 px stripe coloured by the AI verdict of the latest DONE check for that number (CORRECT = accent green, INCORRECT = danger, UNCERTAIN = grey, none = soft border);
       - `review.number` («№ {n}» / "No. {n}");
       - AI chip `review.verdict.{CORRECT|INCORRECT|UNCERTAIN}.chip` («ИИ: Верно» / "AI: correct", «ИИ: Ошибка» / "AI: incorrect", «ИИ: на проверке» / "AI: under review");
       - current status badge: `dict.status.{GREEN|YELLOW|RED}.shortLabel` («Зеленый»/"Green", «Желтый»/"Yellow", «Красный»/"Red") or `dict.student.statusBadge.unmarked` («Не отмечено» / "Not marked");
       - if verdict ≠ UNCERTAIN and `recognizedAnswer` is non-empty: `review.recognized` («Распознано: {answer}» / "Recognised: {answer}") with the answer shortened by `shortenRecognizedAnswer` (§4.3); full text on long-press/tooltip;
       - AI `comment` (plain text) if present;
       - **diagnostics disclosure** (only when not in lesson mode and `copySuspected || injectionSuspected`): summary `review.diagnosticsSummary` («Служебная диагностика · видно только вам» / "Internal diagnostics · visible only to you"); lines `review.copySuspected` («Похоже на списанное» / "Copying suspected") + (": " + `copyReason` or "."), `review.injectionNote` («Надпись-инструкция на фото» / "Instruction found in the photo") + (": " + `injectionNote` or ".");
       - **status history** toggle (component D4, below);
       - student's own `note` (pre-wrapped text in a soft box) if non-empty;
       - **three status buttons** `GREEN`, `YELLOW`, `RED` labelled with `dict.status[option].shortLabel`. Tap on an inactive button sets that status; tap on the **active** button clears the status (`null`). Optimistic: highlight immediately, revert and show the error banner on failure (`review.errors.saveStatus` «Не удалось сохранить статус.» / "Could not save the status."). All three buttons of a number are disabled while that number's request is in flight. Calls `POST /api/teacher/number-status` (§3.6). (Desktop-only keyboard shortcuts 1/2/3 and arrows — not needed on mobile.)
    4. **Check history** disclosure (only when `checks.length > 0`): header `review.historyTitle` («История проверок» / "Check history") + "· " + `plural(review.runForms)` («{n} запуск/запуска/запусков» / "{n} run/runs"). Inside a vertical timeline, newest first (max 15 checks are loaded per assignment). Each row:
       - time = `checkedAt ?? createdAt` formatted `"{dd} {month long}, {HH:mm}"` (e.g. «19 октября, 12:30»), "—" if invalid;
       - badge `review.current` («Текущая» / "Current") on the latest DONE check; `review.failed` («Сбой» / "Failed") when `status === "FAILED"`; `review.running` («Выполняется» / "Running") when `PENDING` or `CHECKING`;
       - count chips (only non-zero): `review.countCorrect` («Верно {n}» / "Correct {n}"), `countIncorrect` («Ошибка {n}» / "Incorrect {n}"), `countUncertain` («На проверке {n}» / "Under review {n}");
       - if the check has results, the row expands (tooltip `review.showVerdicts` «Показать вердикты по номерам» / "Show verdicts by problem") to: kicker `review.attemptPhotos` («Фото этой попытки» / "Photos from this attempt") with 56×56 thumbnails of `check.photos` (tap = original), and one chip per result: `"{review.number} — {review.verdict[v].short}"` («верно»/"correct", «ошибка»/"incorrect", «на проверке»/"under review").
- The web review tab does **not** render `conditionLatex` / `answerLatex` although `getTeacherStudentHomeworks` returns them (teacher gets the reference answer). Mobile may show the condition under each number **[PROPOSAL]**.
- **Mobile:** vertical list of collapsible cards. Number rows: status as a 3-button segmented row under the text. Photos → full-screen image viewer with pinch-zoom (authenticated image fetch, see §7). "Accept AI verdicts" → button; undo as a snackbar with a 10 s timer. Check history → bottom sheet or inline accordion. Pull-to-refresh; also refetch on realtime events (§5).

#### D4. Status history panel (`components/progress-status-history.tsx`)

- Collapsed link `dict.topics.history.show` («История статуса» / "Status history"); expanded link `history.hide` («Скрыть историю статуса» / "Hide status history").
- On open (and again whenever the number's current status changes or any status write succeeds while open — `refreshKey = "{currentStatus}:{historyVersion}"`) it loads `GET /api/teacher/progress-history?studentId&homeworkNumberId` (§3.8); an in-flight request is aborted when re-requested or closed.
- Panel content:
  - bold line `"{studentName} · {dict.topics.widgets.numberLabel(number)} · {topicTitle}"` (`numberLabel` = «№ {number}» / "No. {number}");
  - `history.current` («Сейчас: {status}» / "Now: {status}") — status is the label from `dict.progress.statuses` (GREEN «Решил»/"Solved", YELLOW «Решил с ошибками»/"Solved with mistakes", RED «Не решил»/"Not solved", none «Без отметки»/"No mark");
  - entries newest first; each: muted line `"{date time} {history.timeZone} · {actor}"` (date via `Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Moscow" })`, `history.timeZone` = «МСК» / "MSK"); line `"{source}: {previousStatus} → {status}"`; muted line `reason`; optional link `reference.label` → `reference.href` (`dict.topics.lib.history.openLesson` «Открыть урок»/"Open lesson" → lesson board; `openHomework` «Открыть ДЗ»/"Open homework" → this student's review tab scrolled to `#homework-{assignmentId}`);
  - empty: `history.empty` («Записей пока нет. История появится после новой отметки или проверки.» / "No entries yet. History will appear after the next mark or check.");
  - footer note always: `history.notRecorded` («Изменения до включения истории не записывались.» / "Changes made before history was enabled were not recorded.");
  - loading `history.loading` («Загружаем историю…» / "Loading history…"); error `history.loadFailed` («Не удалось загрузить историю. Попробуйте ещё раз.» / "Could not load the history. Try again.") with button `history.retry` («Повторить» / "Retry"); when `nextCursor` exists a button `history.earlier` («Более ранние записи» / "Earlier entries") appends the next page (20 per page).
- **Mobile:** bottom sheet opened from a "Status history" row action; infinite scroll instead of the "Earlier entries" button is fine.

### S5. Tab "Assign homework"

- **Site route:** `/teacher/students/[studentId]/assign` — TEACHER only.
- **Purpose:** issue one homework (a set of numbers of **one topic** + a deadline + optional title) to this student by hand.
- **Data:** `getTeacherStudentDetail(user, studentId)` → topics with numbers and this student's status/deadline per number (§2.4). Statements (`conditionLatex`) are sent only for the **first** topic; for any other topic they are fetched on selection from `GET /api/teacher/topics/conditions?topicId=` and cached for the lifetime of the screen (if the fetch fails the grid still works without statements).
- **Section title:** `dict.students.assign.title` («Выдать домашнее задание» / "Assign homework").
- **States:** `deadlinesEnabled === false` → warning `assign.dbOutdated` («Выдача ДЗ появится здесь после обновления базы данных до актуальной версии.» / "Homework assignment will appear here once the database is updated to the latest version."); no topics → dashed panel `assign.noTopics` («Темы пока не добавлены» / "No topics added yet").
- **Layout:**
  1. Error banner (red) / success banner (green, `assign.assigned` «ДЗ выдано. Посмотреть его можно во вкладке «Проверка ДЗ».» / "Homework assigned. You can see it in the “Homework review” tab.").
  2. Topic select, label `assign.topic` («Тема» / "Topic"); option text `assign.topicOption` = `"{title} · {count}"` with `count = plural(assign.numberForms, totalNumbers)` («{n} номер/номера/номеров» / "{n} problem/problems"). Default = first topic. **Changing the topic clears the selection** and both banners.
  3. Action panel:
     - chip `assign.selected` («Выбрано: {n}» / "Selected: {n}") (accent colour when n > 0);
     - title input, placeholder `assign.titlePlaceholder` («Название (необязательно)» / "Title (optional)"), `maxLength 200`;
     - date-time picker D5, placeholder `assign.deadlinePlaceholder` («Дедлайн» / "Deadline");
     - primary button `assign.assign` («Выдать ДЗ» / "Assign homework"; pending `assign.assigning` «Выдаем…» / "Assigning…") — disabled when no number is selected, no deadline is set, or saving;
     - secondary link `assign.pickWithAi` («Подобрать ИИ» / "Pick with AI") → `/teacher/homework-plans/new?studentId={id}` (AI homework planner — another subsystem);
     - `assign.clearSelection` («Снять выбор» / "Clear selection") — only when n > 0;
     - hint `assign.steps` («1. Кликните по номерам ниже, чтобы выбрать их · 2. Задайте дедлайн · 3. Нажмите «Выдать ДЗ».» / "1. Click the problems below to select them · 2. Set a deadline · 3. Press “Assign homework”.").
  4. Grid (2 columns ≥ sm, 1 column on phones) of **number select cards** (`NumberSelectCard`) for the selected topic in bank order (`displayOrder`): check mark, status badge (same as S4), `dict.topics.widgets.numberLabel` («№ {number}» / "No. {number}"), the full statement rendered from LaTeX (always fully shown; KaTeX with the math line-break rule), footnote `assign.alreadyAssigned` («Уже в ДЗ с дедлайном» / "Already assigned with a deadline") when the number currently has a mirrored `deadlineAt`. Tapping the card toggles selection (the statement block itself is not a toggle target on the site so text can be selected / wide formulas scrolled). Accessibility name `dict.topics.widgets.numberSelectAria` («Выбрать № {number}» / "Select No. {number}") + " — " + footnote.
- **Submit:** client-side guard: if nothing selected or deadline unparsable → error `assign.selectNumbersAndDeadline` («Выберите номера и укажите дедлайн.» / "Select problems and set a deadline."). Then `POST /api/teacher/homeworks` (§3.4) with `{ studentId, topicId, homeworkNumberIds, deadlineAt (ISO), title? }`. Success: clear selection, deadline and title, show the success banner, refetch data. Failure: banner with the server `error` (e.g. the "already solved" conflict, §4.2) or `assign.assignFailed` («Не удалось выдать ДЗ.» / "Could not assign the homework.").
- Neither the client nor the server requires the deadline to be in the future.
- **Mobile:** topic → bottom-sheet picker; number grid → single-column list of selectable cards (checkbox on the left, statement rendered with a math renderer); sticky bottom bar with "Selected: n", deadline chip (opens native date-time picker) and the "Assign homework" button; title field inside a "details" sheet.

#### D5. Date-time picker (`components/shbz-datetime-picker.tsx`)

- Value format: local-time string `YYYY-MM-DDTHH:mm` (device time zone); the caller converts to ISO with `new Date(value).toISOString()`. Display: `Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })`.
- Popover: month header with ← / → (`dict.topics.widgets.datetime.prevMonth|nextMonth`), month names `datetime.months`, week starts on **Monday** (`datetime.weekDays` «ПН…ВС» / "MO…SU"), 6×7 day grid, today outlined, selected filled.
- Picking a day keeps the already chosen time; if nothing was chosen the time defaults to **23:59**. Time row: label `datetime.time` («Время»/"Time"), hour select 00–23, minute select 00–59 (every minute). Changing hour without a selection uses minute 59; changing minute without a selection uses hour 23 and today's date.
- Footer: `datetime.clear` («Очистить» / "Clear") clears and closes; `datetime.today` («Сегодня» / "Today") sets today 23:59; `datetime.done` («Готово» / "Done") closes. Placeholder default `datetime.placeholder` («Выбрать дату и время» / "Pick date and time").
- **Mobile:** replace with the platform date-time picker (`@react-native-community/datetimepicker` or a modal one); keep the default time 23:59 and a "Clear" action.

### S6. Tab "Lessons"

- **Site route:** `/teacher/students/[studentId]/lessons` — TEACHER only.
- **Purpose:** list this student's lessons (past and planned, individual and group) with their problem sets; mark per-problem lesson results; edit the set; re-run AI selection; jump to the lesson board, PDF handout, or "assign homework from results".
- **Data:** `getTeacherStudentLessons(user, studentId)` (lessons of kind `LESSON` taught by the viewer, newest `createdAt` first) + the whole number bank `[{ topicId, topicTitle, numbers: [{ id, number }] }]` (all topics, `displayOrder`) for manual adding.
- **Section title / description:** `dict.students.lessons.title` («Занятия и итоги» / "Lessons and results"); `lessons.description` («Проведённые и запланированные занятия ученика. Отмечайте итоги светофором, правьте наборы и пересобирайте подбор.» / "The student's past and upcoming lessons. Mark results with the traffic light, edit the problem sets and regenerate the selection.").
- **Layout:**
  1. Error banner (last failed mutation).
  2. **Compose card** — always first: dashed card with a "+" bubble, title `dict.planner.lessonComposeCard.title` («Составить занятие» / "Compose a lesson"), hint `lessons.composeHintEmpty` («Занятий пока не было — соберите первое: набор и итоги появятся здесь.» / "No lessons yet — build the first one: the problem set and results will appear here.") when the list is empty, else `lessons.composeHint` («Пустое занятие: ИИ-подбор или ручной выбор номеров.» / "Empty lesson: AI selection or manual problem choice."). Tap → S7.
  3. One collapsible card per lesson (all collapsed initially):
     - **Header:** chevron; `lesson.title`; meta line `"{date} · {groupName} · {lessons.minutes} · {status}"` where date = `formatDateTime(startsAt ?? createdAt)`, the group part only for group lessons, `lessons.minutes` = «{n} мин» / "{n} min", status label `lessons.status.{PLANNED|ACTIVE|FINISHED}` («Запланирован»/"Planned", «Идёт»/"In progress", «Завершён»/"Finished"); button `lessons.openLesson` («Открыть занятие» / "Open lesson") → lesson board `/teacher/lessons/{lessonId}` (other subsystem; must not toggle the card).
     - **Body when expanded:**
       - while the AI plan is pending: spinner + `lessons.aiPicking` («ИИ подбирает задания…» / "AI is picking problems…");
       - stale (pending observed on the client for more than **15 minutes**, `STALE_PLAN_MS`): red notice `lessons.stalePlan` («План не собрался: задача, похоже, потерялась при перезапуске сервера. Нажмите «Повторить» — соберём заново.» / "The plan was not built: the job seems to have been lost on a server restart. Press “Retry” to build it again.") + `lessons.retry` («Повторить» / "Retry") → regenerate;
       - `planError` (when not pending): red notice with `planErrorText(planError, dict.planner.planErrors)` (§4.10) + `lessons.retry`;
       - **Main part** (`isExtra === false`): header `lessons.mainPart` («Основная часть» / "Main part") + hint `lessons.howSolved` («Как решил на уроке?» / "How did it go in the lesson?"); rows;
       - **Extra part** (`isExtra === true`): header `lessons.extraPart` («Дополнительно — если успел» / "Extra — if there is time"); rows with a dashed border;
       - each **row**: `lessons.number` («№ {n}» / "No. {n}"); a 4-button result toggle (`dict.students.lessonResult`: `SOLVED` «решил»/"solved", `PARTIAL` «с ошибками»/"with mistakes", `NOT_SOLVED` «не решил»/"not solved", `SKIPPED` «не успел»/"not reached"; colours: green / yellow / red / neutral; on phones a 2×2 grid with ≥ 44 px touch height; tapping the active one clears to `null`) → `PATCH …/items/{itemId}/result` (§3.11) optimistic; a trash icon button (aria `lessons.removeAria` «Убрать № {n} из набора» / "Remove No. {n} from the set", title `lessons.removeTitle` «Убрать из набора» / "Remove from the set") → `PATCH …/items` with the set minus that number (§3.12). Controls disabled while that lesson has a set/regenerate request in flight;
       - empty set and not pending: `lessons.emptySet` («Набор задач пуст — добавьте номера вручную или запустите пересборку.» / "The problem set is empty — add problems manually or regenerate it.");
       - **Footer actions:** `lessons.assignFromResults` («Выдать ДЗ по итогам» / "Assign homework from results") → `/teacher/homework-plans/new?lessonId={lessonId}&studentId={studentId}`; `lessons.downloadPdf` («Скачать PDF» / "Download PDF") → `GET /teacher/lessons/{lessonId}/pdf` (printable handout of the lesson, other subsystem; may return an HTML fallback when the server has no Chromium); toggle `lessons.addNumber` («Добавить номер» / "Add a problem") ↔ `lessons.hideAdd` («Скрыть добавление» / "Hide adding");
       - **Manual add row** (`LessonManualAdd`, when toggled on): label `dict.planner.lessonManualAdd.label` («Добавить номер» / "Add problem"); topic select (default = first bank topic; changing it resets the number); number select (placeholder `dict.planner.common.pickNumber` «Выберите номер» / "Pick a problem"; options = the topic's numbers **not already in the set**, labelled `dict.planner.common.numberSign` «№ {n}» / "No. {n}"); buttons `lessonManualAdd.toMain` («В основную» / "To main") and `toExtra` («В доп.» / "To extra") — disabled until a number is chosen or while busy → `PATCH …/items` with the number appended to the main or extra list.
- Error fallbacks: `lessons.errors.saveResult` («Не удалось сохранить итог.» / "Could not save the result."), `saveItems` («Не удалось сохранить набор.» / "Could not save the problem set."), `regenerate` («Не удалось запустить пересборку.» / "Could not start regeneration.").
- **Polling:** see §5.2.
- **Mobile:** list of collapsible lesson cards; result toggle as a 2×2 button grid; trash as a swipe-to-delete action with the same request; manual add as a two-step bottom sheet (topic → number → "To main"/"To extra"). "Download PDF" → download + share/open (same mechanics as S8). "Open lesson" / "Assign homework from results" navigate to screens of the lessons/homework-plans subsystems.

### S7. Compose a lesson for this student

- **Site route:** `/teacher/students/[studentId]/lessons/new` (`force-dynamic`) — TEACHER only.
- **Purpose:** create an individual lesson for this student, either with AI selection (default) or by picking numbers manually.
- **Data:** `getTeacherStudentDetail` (topics + numbers + statuses), the set of number ids already used in any lesson of this student (`inLesson`), `StudentProfile.speed` (1–10 or null), `aiAvailable = settings.aiEnabled && settings.lessonPlanEnabled && AI config present`, statements of the first topic only (others via `/api/teacher/topics/conditions`).
- **Section title / description:** `dict.students.compose.title` («Составить занятие» / "Compose a lesson"); `compose.description` («По умолчанию задания подбирает ИИ; кнопкой можно переключиться на ручной выбор номеров.» / "By default the AI picks the problems; use the button to switch to manual selection."). No topics → `compose.noTopics` («Темы пока не добавлены» / "No topics added yet").
- **Mode switch** (2 segments, aria `dict.planner.lessonCompose.modeAria`): `modeAi` («ИИ-подбор» / "AI selection") — disabled with tooltip `aiUnavailable` («ИИ-подбор сейчас недоступен» / "AI selection is unavailable right now") when `aiAvailable === false`; `modeManual` («Выбрать вручную» / "Pick manually"). Initial mode = `ai` if available, else `manual`.
- **AI mode form** (`TeacherLessonCreateForm`, `members = [student]`), keys under `dict.planner.lessonCreateForm`:
  - `titleLabel` («Название урока» / "Lesson title"), placeholder `titlePlaceholder` («Пусто — «Занятие от <дата>»» / "Empty — “Lesson on <date>”"), `maxLength 200`;
  - `durationLabel` («Длительность, минут» / "Duration, minutes"): number, min 15, max 240, step 5, default `60`;
  - `dateTimeLabel` («Дата и время урока» / "Lesson date and time"): picker D5, optional (lesson status is derived from it);
  - `topicsLabel` («Темы занятия» / "Lesson topics"): type-ahead combobox (placeholder `topicsPlaceholder` «Начните вводить название темы…» / "Start typing a topic title…"); suggestions = topics whose title contains the query (case-insensitive, `ru-RU` lower-casing), excluding already selected, **max 8**; nothing found → `dict.planner.common.nothingFound` («Ничего не нашлось» / "Nothing found"); selected topics as removable chips (aria `removeTopic`); helper `topicsHint` («Можно не выбирать ничего — тогда ИИ сам определит, где ученик остановился.» / "You can leave this empty — AI will work out where the student stopped.") or `topicsSelected` («Выбрано тем: {n}» / "Topics selected: {n}");
  - `noteLabel` («Комментарий для ИИ» / "Note for AI") with counter `"{len} / 500"`, textarea `maxLength 500`, placeholder `notePlaceholder` («Например: разобрать логарифмы, без стереометрии» / "For example: go over logarithms, no solid geometry");
  - `studentsLabel` («Ученики и скорость (1–10)» / "Students and speed (1–10)"): one row for this student — name, speed select (`speedNotSet` «Не указана» / "Not set", 1…10; preset from the profile), checkbox (checked);
  - submit `submit` («Подобрать задания» / "Select problems"; pending `creating` «Создаём урок…» / "Creating lesson…"), disabled when no student is checked.
  - `POST /api/teacher/lessons` (§3.10). If the response contains `lessonId` (including the 503 "AI unavailable" case) → navigate to the lesson board `/teacher/lessons/{lessonId}?studentId={studentId}`. Otherwise show `error` or `createFailed` («Не удалось создать урок. Попробуйте ещё раз.» / "Could not create the lesson. Please try again."); network failure → `dict.planner.common.networkError` («Сеть недоступна. Попробуйте ещё раз.» / "Network unavailable. Please try again.").
- **Manual mode board** (`TeacherLessonComposeBoard`), keys under `dict.planner.lessonCompose`: same shape as S5 but: topic option text `topicOptionForms` («{title} · {n} номер/номера/номеров» / "{title} · {n} problem/problems"); chip `selected` («Выбрано: {n}» / "Selected: {n}"); duration number input (min 15, max 240, step 5, default 60; placeholder `durationPlaceholder` «Длительность, мин» / "Duration, min"); date-time picker (placeholder `dateTimePlaceholder` «Дата и время урока» / "Lesson date and time", optional); primary `compose` («Составить занятие» / "Compose lesson"; pending `composing` «Составляем…» / "Composing…") disabled when nothing is selected; link `aiPick` («Подобрать ИИ» / "AI selection") → `/teacher/lessons/new?studentId={id}`; `clearSelection`; hint `steps` («1. Кликните по номерам ниже · 2. Укажите длительность · 3. Нажмите «Составить занятие». Итоги по каждому номеру отметите на доске занятия.» / "1. Click the problems below · 2. Set the duration · 3. Press “Compose lesson”. You will mark results per problem on the lesson board."); cards carry the footnote `alreadyInLesson` («Уже был на занятии» / "Already used in a lesson") when `inLesson`.
  - Guard: nothing selected → `pickNumbers` («Выберите номера для занятия.» / "Pick problems for the lesson."). Submit `POST /api/teacher/lessons` with `{ studentIds: [studentId], durationMinutes: Number(duration) || 60, startsAt?: <local "YYYY-MM-DDTHH:mm" string>, topicIds: [], teacherNote: "", skipPlan: true, numberIds: [...selection in click order] }`; success → lesson board; failure → `error` or `composeFailed` («Не удалось составить занятие.» / "Could not compose the lesson.").
- **Mobile:** pushed screen from the compose card; top segmented control AI / manual; AI form as a scrollable form; manual board identical to the S5 mobile layout with a duration stepper instead of the title field.

### S8. Student PDF report (download)

- **Site route:** `GET /teacher/students/[studentId]/export/pdf?period=7d|30d|year` (default `7d`). Roles: TEACHER (own student) or DEVELOPER.
- The mobile app only downloads, opens and shares the file. Contents (always **Russian**, never translated; A4, generated with `@react-pdf/renderer`):
  1. Brand header with the report title: «ОТЧЁТ ЗА 7 ДНЕЙ» / «ОТЧЁТ ЗА 30 ДНЕЙ» / «ОТЧЁТ ЗА УЧЕБНЫЙ ГОД» and the generation timestamp.
  2. Student name, login, period «период: dd.MM.yyyy — dd.MM.yyyy» (`year` = from 1 September of the current academic year).
  3. KPI cards: «Закрыто» (GREEN+YELLOW changed in the period), «С первого раза» (GREEN), «Самопроверка» (YELLOW), «Нужен разбор» (RED), «Огонёк» (current streak, days).
  4. Progress bar «Прогресс по выданным ДЗ»: solved / total numbers over **all** homework of the period (issued in the period or with a deadline in the period) + percent (hidden when there is no homework).
  5. Activity bar chart: «Активность по дням» (7d, one bar per day), «Активность по неделям» (30d, 7-day buckets labelled «с dd.MM»), «Активность по месяцам» (year).
  6. Table «Занятия» (columns Когда, Занятие, Темы, Задач, Итоги; result summary like «3 решил · 1 с ошибками · 1 не решил · 1 не успел · 2 без отметки» or «набор пуст»; max 25 rows + footnote «Показаны последние 25 занятий периода.»; empty «Занятий за период не было.»).
  7. Table «Посещаемость групповых занятий» (only if the student had group lessons in the period): summary line + rows for LATE / ABSENT / EXCUSED lessons; empty «Пропусков и опозданий за период не было.».
  8. Table «Домашние задания» (columns Тема, ДЗ, Дедлайн, Выполнено «N из M», Проверка ИИ «N верно · M с ошибками» or «—», Итог chip: «Нужен разбор» when any RED, «Выполнено» when all solved, «В работе» when some marked, «Не начато»; label = custom title (≤ 60 chars) or «ДЗ от dd.MM.yyyy»; no deadline → «без дедлайна»; max 25 rows; empty «Домашних заданий за период нет.»).
  9. For `7d`: table «Разобранные номера» (Когда, Тема, №, Результат «Решён сразу» / «После самопроверки» / «Нужен разбор с преподавателем», Комментарий = student's note or «—»; empty «За период ученик не отметил ни одного номера.»). For `30d` / `year`: table «Темы за период» (Тема, Разобрано, Зелёные, Жёлтые, Красные, Прогресс темы «N из M»; empty «За этот период активности по темам не было.»).
  10. Footer «ШБЗ Школа» + «стр. N из M».
- Response: `200 application/pdf`, `Content-Disposition: attachment; filename="report-{period}-{asciiName-}{YYYY-MM-DD}.pdf"; filename*=UTF-8''{«Неделя»|«30 дней»|«Учебный год»} — {studentName} — {YYYY-MM-DD}.pdf`, `Cache-Control: no-store`.
- Errors (plain text bodies, not JSON): `401 "Unauthorized"`, `404 "Student not found"`, `500 "Export failed"`, `503` + `Retry-After: 30` with body `dict.apiCommon.reportsBusy` («Сервер занят формированием отчётов. Попробуйте через минуту.» / "The server is busy generating reports. Try again in a minute.") when 2 exports are already in flight process-wide; `429` JSON `{ error: dict.apiCommon.rateLimited }` when the user exceeded **5 exports per 5 minutes**.
- **Mobile:** action sheet item → download with the bearer token to the cache directory (`expo-file-system`), then `expo-sharing` / a PDF viewer. Show a blocking progress indicator (generation takes seconds). Mock: bundle one static sample PDF per period.

### S9. Accounts (DEVELOPER only)

- **Site route:** `/developer/accounts` (rewrite of `/teacher/accounts`, `force-dynamic`) — **Roles:** DEVELOPER only.
- **Purpose:** create teacher and student accounts; see all teachers and students; change a student's owner teacher (bulk); reset passwords; delete students; delete teachers with transfer of their students.
- **Data:** all teachers ordered by name `{ id, name, email, studentCount, lessonCount, testCount }`; all students ordered by name `{ id, name, email, teacherId }`.
- **Layout:**
  1. Header: kicker `dict.students.accounts.kicker` («Аккаунты» / "Accounts"), title `accounts.title` («Создание аккаунтов» / "Create accounts").
  2. Notice banner (table below).
  3. Section `accounts.newAccount` («Новый аккаунт» / "New account") → **account create form** (S9a).
  4. Section `accounts.directory` («Учителя и ученики» / "Teachers and students") → **directory** (S9b).

- **Notices** — first match wins, in this order:

| Trigger (query) | Key `dict.students.accounts.notices.*` | Tone | RU | EN |
|---|---|---|---|---|
| `teacherDeleted=1` | `teacherDeleted` | success | Учитель удалён. Его ученики переведены на выбранного учителя. | Teacher deleted. Their students were moved to the selected teacher. |
| `studentDeleted=1` | `studentDeleted` | success | Ученик удалён вместе со всеми его ДЗ, фото решений и историей проверок. | Student deleted along with all of their homework, solution photos and check history. |
| `studentError=deleteMissing` | `studentDeleteMissing` | error | Такого ученика уже нет в системе. Обновите страницу. | This student no longer exists. Refresh the page. |
| `studentError=delete` | `studentDelete` | error | Не удалось удалить ученика. Повторите попытку ещё раз. | Could not delete the student. Please try again. |
| `teacherPasswordReset=1` | `teacherPasswordReset` | success | Пароль учителя обновлён, все его сессии завершены. Передайте учителю новый пароль. | The teacher's password has been updated and all their sessions ended. Pass the new password to the teacher. |
| `teacherPasswordError=invalid\|missing\|save\|rateLimited` | `teacherPasswordInvalid` / `teacherPasswordMissing` / `teacherPasswordSave` / `teacherPasswordRateLimited` | error | Новый пароль не подходит: минимум 8 символов, обязательно буквы и цифры. / Такого учителя уже нет в системе. / Не удалось сменить пароль учителя. Повторите попытку ещё раз. / Слишком много смен пароля за короткое время. Подождите несколько минут. | The new password is not valid: at least 8 characters with both letters and digits. / This teacher no longer exists. / Could not change the teacher's password. Please try again. / Too many password changes in a short time. Wait a few minutes. |
| `accountCreated=teacher\|student` (legacy — no current code sets it) | `teacherCreated` / `studentCreated` | success | Аккаунт учителя создан. Ему уже можно входить в систему. / Аккаунт ученика создан. Ему уже можно входить в систему. | Teacher account created. They can sign in now. / Student account created. They can sign in now. |
| `ownerChanged=<count>` | `ownerChanged` | success | Привязка учеников к учителям сохранена. Ученики уже видны новым учителям. | Student-to-teacher assignments saved. The students are already visible to their new teachers. |
| `passwordReset=1` | `passwordReset` | success | Пароль ученика обновлён, все его сессии завершены. Передайте ученику новый пароль. | The student's password has been updated and all their sessions ended. Pass the new password to the student. |
| `passwordResetError=invalid\|missing\|save\|rateLimited` | `passwordInvalid` / `passwordMissing` / `passwordSave` / `passwordRateLimited` | error | (same texts as S2) | (same texts as S2) |
| `accountError=ownerInvalid` | `ownerInvalid` | error | Не удалось сменить учителя: часть учеников или учителей не найдена. Обновите страницу. | Could not change the teacher: some students or teachers were not found. Refresh the page. |
| `accountError=ownerSave` | `ownerSave` | error | Не удалось сменить учителя. Повторите попытку ещё раз. | Could not change the teacher. Please try again. |
| `accountError=teacherMissing` | `teacherMissing` | error | Такого учителя уже нет в системе. Обновите страницу. | This teacher no longer exists. Refresh the page. |
| `accountError=teacherTransfer` | `teacherTransfer` | error | Учитель не удалён: сначала выберите, кому передать его учеников. | Teacher not deleted: first choose who takes over their students. |
| `accountError=teacherDelete` | `teacherDelete` | error | Не удалось удалить учителя. Повторите попытку ещё раз. | Could not delete the teacher. Please try again. |
| `accountError=invalid\|exists\|save\|rateLimited` (legacy) | `invalid` / `exists` / `save` / `rateLimited` | error | Укажите роль, учителя (для ученика), имя, логин и пароль: минимум 8 символов, обязательно буквы и цифры. / Аккаунт с таким логином уже существует. / Не удалось создать аккаунт. Проверьте подключение к PostgreSQL и повторите попытку. / Слишком много попыток создать аккаунты за короткое время. Подождите несколько минут. | Enter a role, a teacher (for a student), a name, a login and a password: at least 8 characters with both letters and digits. / An account with this login already exists. / Could not create the account. Check the PostgreSQL connection and try again. / Too many accounts created in a short time. Wait a few minutes. |

#### S9a. Account create form (`components/account-create-form.tsx`)

- Role segmented control (aria `dict.students.accountForm.roleAria`): `roleStudent` («Ученик» / "Student", default) | `roleTeacher` («Учитель» / "Teacher").
- When role = STUDENT: select `accountForm.ownerTeacher` («Учитель ученика» / "Student's teacher"), options `"{teacher.name} ({teacher.email})"`, placeholder `selectTeacher` («Выберите учителя» / "Select a teacher"); when there are no teachers the select is disabled with placeholder `createTeacherFirst` («Сначала создайте учителя» / "Create a teacher first").
- Name: label `nameStudent` («Имя ученика» / "Student's name") or `nameTeacher` («Имя учителя» / "Teacher's name"); login: `loginStudent` («Логин ученика») / `loginTeacher` («Логин учителя» / "Teacher's login"); password: label/placeholder/ok text reuse `dict.students.createForm.*`; same limits (120 / 254 / 256), same live validation and the same password suggestion menu as S2a.
- Submit: `createStudent` («Создать ученика» / "Create student") or `createTeacher` («Создать учителя» / "Create teacher"); pending `creating` («Создаём…» / "Creating…"). Disabled like S2a plus "role = STUDENT and no teacher selected".
- `createAccountAction` (§3.7). Failure → inline red message. Success → form cleared (role and teacher selection kept) and credentials dialog D1 with `title = result.message` («Аккаунт учителя создан.» / "Teacher account created." or «Аккаунт ученика создан.» / "Student account created.").
- Note: the page data is not refetched by the action result itself on the site until a navigation/refresh; mobile should refetch the directory after success.

#### S9b. Directory (`account-directory.tsx`, `account-teachers-manager.tsx`, `account-students-manager.tsx`)

- Segmented tabs (aria `dict.students.directory.tabsAria`): `directory.teachers` («Учителя» / "Teachers") and `directory.students` («Ученики» / "Students"), each rendered as `directory.tabWithCount` = `"{label} · {n}"`. Default tab = **teachers**.
- Search field (one field shared by both tabs; placeholder `directory.searchTeachers` «Имя или логин учителя» / "Teacher's name or login" or `searchStudents` «Имя или логин ученика» / "Student's name or login"). Client-side filter `matchesAccountSearch(query, name, email)`: the query is normalised, lower-cased and split by spaces; **every** word must be a substring of `"{name} {email}"` lower-cased; empty query matches all. Both lists stay mounted so unsaved owner edits survive tab switches and filtering.
- **Teachers tab** — card with rows: name; login (copy-on-tap, label `teachersManager.loginLabel`); student count `plural(teachersManager.studentForms)` («{n} ученик/ученика/учеников» / "{n} student/students") or `noStudents` («Без учеников» / "No students"); buttons "Reset password" (D2 with `target = "teacher"`, dialog label `passwordReset.teacher.dialogLabel`) and `teachersManager.delete` («Удалить» / "Delete") → D6. Empty: `teachersManager.empty` («Пока ни одного учителя не создано.» / "No teachers created yet."). No matches: `notFound` («Никого не нашли.» / "No one found.") + `notFoundHint` («Проверьте запрос — поиск идёт по имени и логину учителя.» / "Check the query — the search covers the teacher's name and login.").
- **D6. Delete-teacher dialog:** kicker `teachersManager.kicker` («Удаление аккаунта» / "Account deletion"); heading `heading` («Удалить учителя «{name}»?» / "Delete teacher “{name}”?"); `description` («Аккаунт и все его сессии будут удалены безвозвратно. Загруженные им файлы и история проверок ДЗ сохранятся.» / "The account and all its sessions will be deleted permanently. Files they uploaded and the homework check history will be kept.").
  - `needsTransfer = studentCount > 0`.
  - If `needsTransfer && lessonCount > 0`: info line `lessonsTransfer` («Его {lessons} и группы перейдут новому учителю вместе с учениками — посещаемость и итоги сохранятся.» / "Their {lessons} and groups move to the new teacher together with the students — attendance and results are kept."), `{lessons}` = `plural(lessonForms, lessonCount)` («{n} занятие/занятия/занятий» / "{n} lesson/lessons").
  - Red cascade box when `deletedLessons > 0 || testCount > 0` (`deletedLessons = needsTransfer ? 0 : lessonCount`): `cascadeBefore` («Вместе с учителем удалятся его » / "Deleting the teacher also deletes their ") + lessons plural + `cascadeAnd` (« и » / " and ") + `plural(testForms, testCount)` («{n} тест/теста/тестов» / "{n} test/tests") + `cascadeAfter` («. Это действие нельзя отменить.» / ". This cannot be undone.").
  - If `needsTransfer`: label `transferLabel` («Кому передать учеников ({n})» / "Who takes over the students ({n})") + select of **all other teachers** (not filtered by the search), placeholder `selectTeacher`; if there is no other teacher: red text `onlyTeacher` («Это единственный учитель, а у него есть ученики. Сначала создайте другого учителя — иначе ученики останутся без владельца и пропадут из всех списков.» / "This is the only teacher and they have students. Create another teacher first — otherwise the students will be left without an owner and disappear from every list.") and the confirm button stays disabled.
  - Buttons: `cancel` («Отмена» / "Cancel"), `confirm` («Удалить учителя» / "Delete teacher"; pending `deleting` «Удаляем…» / "Deleting…"). Confirm disabled when pending, blocked, or transfer needed but not chosen. → `deleteTeacherAction` (§3.10a).
- **Students tab** — card with rows: name; login (copy-on-tap); when `teacherId === null` a red line `studentsManager.noOwner` («Без учителя — не виден ни одному учителю. Назначьте владельца.» / "No teacher — not visible to any teacher. Assign an owner."); owner select (options `"{name} ({email})"`, placeholder `selectTeacher` / `createTeacherFirst`, aria `teacherOfAria` «Учитель ученика {name}» / "Teacher of {name}") — changing it only edits a local draft and marks the row with `dirty` («Изменено — не забудьте сохранить.» / "Changed — remember to save."); buttons "Reset password" (D2, `target = "student"`) and `studentsManager.delete` («Удалить» / "Delete") → D3 (title `studentsManager.deleteTitle`, same body). Empty: `studentsManager.empty` («Пока ни одного ученика не создано.» / "No students created yet."). No matches: `notFound` + `notFoundHint` («Проверьте запрос — поиск идёт по имени и логину ученика.» / "Check the query — the search covers the student's name and login.").
  - **Save bar** under the list: text `changedFor` («Учитель изменён у {students} — изменения ещё не сохранены.» / "Teacher changed for {students} — the changes are not saved yet.") with `{students}` = `plural(changedStudentForms, changes.length)` («{n} ученика/учеников/учеников» / "{n} student/students"), or `pickHint` («Выберите учителя в нужных строках и сохраните изменения.» / "Pick a teacher in the rows you need and save the changes.") when nothing changed; buttons `reset` («Отменить» / "Discard") clears all drafts; `save` («Сохранить изменения» / "Save changes"; pending `saving` «Сохраняем…» / "Saving…") → `changeStudentOwnersAction` (§3.8a) with **all** pending changes, including rows hidden by the search. A change counts only if the draft is non-empty and differs from the stored `teacherId`.
- **Mobile:** "accounts" tab of the developer tab bar. Top: "New account" button → modal form (S9a). Below: segmented Teachers/Students + search bar + FlatList. Teacher row → action sheet (copy login / reset password / delete). Student row → detail sheet with an owner picker, reset password, delete; a sticky "Save changes (n)" bar appears while there are drafts.

### S10. Statistics student filter (context only)

`components/teacher-progress-timeline-filter.tsx` is used only on `/developer/statistics` (DEVELOPER-only, other subsystem): label `dict.students.timelineFilter.label` («Ученик» / "Student"), a select with `timelineFilter.all` («Все ученики» / "All students") + every student name; choosing writes `?studentId=` and the timeline chart (`dict.students.timelineChart.*`, `dict.students.timeline.*`) re-renders for that student. Nothing in the TEACHER students area uses it.

---

## 2. View models

```ts
type UserRole = "TEACHER" | "STUDENT" | "DEVELOPER";
type HomeworkNumberStatus = "GREEN" | "YELLOW" | "RED";
type SolutionCheckStatus = "PENDING" | "CHECKING" | "DONE" | "FAILED";
type SolutionVerdict = "CORRECT" | "INCORRECT" | "UNCERTAIN";
type LessonItemResult = "SOLVED" | "PARTIAL" | "NOT_SOLVED" | "SKIPPED";
type DerivedLessonStatus = "PLANNED" | "ACTIVE" | "FINISHED";
type ReportPeriod = "7d" | "30d" | "year";
type ISODateTime = string; // ISO-8601 UTC
```

### 2.1 Teacher home (S1)

```ts
// getTeacherTopicsOverview(viewer).stats + getParentCallCounts(viewer)
type TeacherHomeSummary = {
  stats: {
    totalTopics: number;    // global
    totalNumbers: number;   // global, sum of numbers of all topics
    totalStudents: number;  // viewer's students (all students for DEVELOPER)
    totalFiles: number;     // global count of referenced theory/homework/answer files
    totalMarked: number;    // GREEN+YELLOW+RED rows of the viewer's students (not shown on the home page)
  };
  calls: { due: number; overdue: number };
};
```

### 2.2 Students list (S2)

```ts
// getTeacherTopicsOverview(viewer).students — ordered by name ASC
type TeacherStudentListItem = {
  id: string;
  name: string;
  email: string;        // the login
  greenCount: number;   // returned by the data function, NOT rendered on the list page
  yellowCount: number;
  redCount: number;
  markedCount: number;  // green + yellow + red
  solvedCount: number;  // green + yellow
};

type StudentCreateInput = { name: string; login: string; password: string };
type CreateStudentResult = { ok: boolean; message: string }; // message already localized
type CreatedCredentials = { name: string; login: string; password: string }; // client-side only, for dialog D1
```

### 2.3 Student card shell + homework review (S3, S4)

```ts
// getTeacherStudentDetail(viewer, studentId).student
type TeacherStudentHeader = {
  id: string;
  name: string;
  email: string;
  createdAt: ISODateTime;
};

// getTeacherStudentHomeworks(viewer, studentId)
type TeacherStudentHomeworks = {
  assignmentsEnabled: boolean;   // false only when the HomeworkAssignment tables are missing (un-migrated DB)
  notesEnabled: boolean;
  assignments: TeacherHomeworkAssignment[]; // already sorted by attention (§4.4)
};

type TeacherHomeworkAssignment = {
  id: string;
  title: string | null;          // trimmed custom title or null
  orderInTopic: number;          // 1-based position among this student's assignments of the same topic, by createdAt ASC
  topicId: string;
  topicTitle: string;
  deadlineAt: ISODateTime | null;
  createdAt: ISODateTime;
  numbers: Array<{
    homeworkNumberId: string;
    number: string;               // digits as a string, leading zeros significant ("010203")
    conditionLatex: string | null; // returned, not rendered on the web review tab
    answerLatex: string | null;    // reference answer; teacher/developer only (null for a student viewer)
    status: HomeworkNumberStatus | null;
    note: string;                 // student's own note, "" when none
  }>;                             // sorted by compareHomeworkNumbers (numeric)
  photos: Array<{                 // photos attached now and NOT yet consumed by a finished check
    id: string;                   // HomeworkSubmissionPhoto id
    fileId: string;               // StoredFile id → /files/{fileId}[?thumb=1]
    originalName: string;
    mimeType: string;
    createdAt: ISODateTime;
  }>;                             // createdAt ASC
  checks: TeacherHomeworkCheck[]; // newest first, at most 15
  latestCheck: TeacherHomeworkCheck | null; // = checks[0]
  greenCount: number;
  yellowCount: number;
  redCount: number;
  markedCount: number;            // green + yellow + red
  totalNumbers: number;           // numbers.length
  progressPercent: number;        // round(marked / total * 100), 0 when total = 0
  solvedCount: number;            // green + yellow
  solvedPercent: number;          // round(solved / total * 100)
};

type TeacherHomeworkCheck = {
  id: string;
  status: SolutionCheckStatus;
  error: string | null;           // returned by the data function, not shown in the review UI
  createdAt: ISODateTime;
  checkedAt: ISODateTime | null;
  photos: Array<{ fileId: string; originalName: string }>; // photos of that attempt, in upload order
  results: Array<{
    number: string;               // number label; results for numbers no longer in the assignment are dropped
    verdict: SolutionVerdict;
    recognizedAnswer: string | null;
    comment: string | null;       // public, anonymised comment
    copySuspected: boolean;       // teacher-only diagnostics
    copyReason: string | null;
    injectionSuspected: boolean;  // teacher-only diagnostics
    injectionNote: string | null;
  }>;                             // sorted by number
};

// Derived on the client (S3/S4):
// label          = title ?? format(dict.common.homeworkN, { n: orderInTopic })
// isCompleted    = totalNumbers > 0 && solvedCount === totalNumbers
// isOverdue      = !isCompleted && deadlineAt !== null && Date.parse(deadlineAt) < Date.now()
// unmarkedCount  = totalNumbers - markedCount
// latestDone     = checks.find(c => c.status === "DONE") ?? null
// activeHomeworksCount = assignmentsEnabled ? assignments.filter(a => !isCompleted(a)).length : 0
```

### 2.4 Assign board (S5) and compose board (S7)

```ts
// getTeacherStudentDetail(viewer, studentId)
type TeacherStudentDetail = {
  student: TeacherStudentHeader;
  notesEnabled: boolean;
  deadlinesEnabled: boolean;      // false only when StudentTopicNumberStatus.deadlineAt is missing (un-migrated DB)
  topics: TeacherStudentTopic[];  // displayOrder ASC, then createdAt ASC
  stats: {                        // returned, not rendered anywhere in this subsystem
    totalTopics: number; totalNumbers: number; totalMarked: number; totalSolved: number;
    totalGreen: number; totalYellow: number; totalRed: number;
    markedPercent: number; solvedPercent: number;
  };
};

type TeacherStudentTopic = {
  id: string;
  title: string;
  description: string | null;
  displayOrder: number;
  totalNumbers: number;
  greenCount: number; yellowCount: number; redCount: number; markedCount: number;
  progressPercent: number; solvedCount: number; solvedPercent: number;
  numbers: Array<{
    id: string;                   // homeworkNumberId
    number: string;
    displayOrder: number;
    studentStatus: null | {
      id: string;
      status: HomeworkNumberStatus | null;
      note: string;               // "" when none
      deadlineAt: ISODateTime | null;
      updatedAt: ISODateTime;
    };
  }>;
};

// What the assign board actually consumes:
type AssignBoardTopic = {
  id: string; title: string; totalNumbers: number;
  conditionsLoaded: boolean;      // true only for topics[0]
  numbers: Array<{
    id: string; number: string;
    status: HomeworkNumberStatus | null;
    deadlineAt: ISODateTime | null;     // non-null → footnote "Already assigned with a deadline"
    conditionLatex: string | null;
  }>;
};

// GET /api/teacher/topics/conditions?topicId=
type TopicConditions = { conditions: Record<string /* homeworkNumberId */, string | null> };

// What the compose board (S7, manual mode) consumes:
type ComposeBoardTopic = {
  id: string; title: string; totalNumbers: number; conditionsLoaded: boolean;
  numbers: Array<{
    id: string; number: string;
    status: HomeworkNumberStatus | null;
    inLesson: boolean;            // the number is in ANY lesson set of this student → "Already used in a lesson"
    conditionLatex: string | null;
  }>;
};
type ComposeContext = {
  aiAvailable: boolean;
  student: { id: string; name: string; speed: number | null }; // speed 1..10
  formTopics: Array<{ id: string; title: string }>;
  boardTopics: ComposeBoardTopic[];
};
```

### 2.5 Lessons tab (S6)

```ts
// getTeacherStudentLessons(viewer, studentId) — lessons of kind LESSON, lesson.createdAt DESC
type TeacherStudentLesson = {
  id: string;                     // lessonId
  participantId: string;          // LessonParticipant id of THIS student in that lesson
  title: string;
  status: DerivedLessonStatus;    // derived, §4.9
  durationMinutes: number;
  createdAt: ISODateTime;
  startsAt: ISODateTime | null;   // header shows startsAt ?? createdAt
  groupName: string | null;       // null for an individual lesson
  planPending: boolean;           // !planGeneratedAt && !planError
  planError: string | null;       // "plan-error:<code>" or a legacy Russian sentence, §4.10
  items: Array<{
    id: string;                   // LessonAssignmentItem id
    homeworkNumberId: string;
    number: string;
    topicTitle: string;
    isExtra: boolean;
    result: LessonItemResult | null;
  }>;                             // order ASC
};

type LessonBankTopic = { topicId: string; topicTitle: string; numbers: Array<{ id: string; number: string }> };

// GET /api/teacher/lessons/{lessonId}/status
type LessonPlanStatus = {
  total: number; ready: number; failed: number; pending: number;
  participants: Array<{
    participantId: string; studentId: string; name: string;
    planGeneratedAt: ISODateTime | null; planError: string | null; itemsCount: number;
  }>;
};
```

### 2.6 Progress history (D4)

```ts
// GET /api/teacher/progress-history — the site returns LOCALIZED LABELS, not codes
type ProgressHistoryData = {
  studentName: string;
  number: string;
  topicTitle: string;
  currentStatus: string;          // dict.progress.statuses[GREEN|YELLOW|RED|none]
  entries: Array<{
    id: string;
    createdAt: ISODateTime;
    source: string;               // dict.progress.sources[...] or the raw code if unknown
    actor: string;                // actorName ?? (source === "lesson_end" ? «Система»/"System" : «ИИ»/"AI")
    previousStatus: string;       // label
    status: string;               // label (the status AFTER the decision; equals previous when nothing was written)
    reason: string;               // dict.progress.decisions[...] or the raw code
    reference: { label: string; href: string } | null;
  }>;                             // createdAt DESC, id DESC
  nextCursor: string | null;      // id of the last entry of the page when more exist
};

// Underlying codes (ProgressStatusEvent) — use these in the mobile contract:
type ProgressSource = "teacher" | "homework_check" | "lesson_teacher" | "lesson_check" | "lesson_end";
type ProgressDecisionReason =
  | "changed" | "reaffirmed" | "unchanged" | "uncertain"
  | "downgrade_blocked" | "newer_status" | "no_status" | "lesson_result_preserved";
```

### 2.7 Accounts (S9)

```ts
type ManagedTeacher = {
  id: string; name: string; email: string;
  studentCount: number;   // students owned
  lessonCount: number;    // lessons taught (incl. homework drafts — Lesson rows)
  testCount: number;      // tests created
};
type ManagedStudent = { id: string; name: string; email: string; teacherId: string | null };
type TeacherOption = { id: string; name: string; email: string };

type AccountsDirectory = { teachers: ManagedTeacher[]; students: ManagedStudent[] }; // both ordered by name ASC

type AccountCreateInput = { role: "STUDENT" | "TEACHER"; teacherId: string; name: string; login: string; password: string };
type CreateAccountResult = { ok: boolean; message: string };
type OwnerChange = { studentId: string; teacherId: string };
```

---

## 3. Mutations and queries

Rate limits come in two flavours:

- `assertRateLimit` — in-memory sliding window (per process), key `scope:identifier`.
- `consumePersistentRateLimit` / `enforceApiRateLimit` — fixed window in Postgres (`windowStart = floor(now / windowMs) * windowMs`), key `scope:userId`. On overflow API routes answer `429 { error: dict.apiCommon.rateLimited }` («Слишком много запросов. Подождите немного и попробуйте снова.» / "Too many requests. Wait a moment and try again.") with `Retry-After`; if the limiter itself fails: `503 { error: dict.apiCommon.serviceUnavailable }` («Сервис временно недоступен. Попробуйте снова позже.» / "The service is temporarily unavailable. Try again later.") with `Retry-After: 5`.

API routes authenticate with the session cookie; an absent/invalid session or a wrong role gives `401 { error: dict.apiCommon.unauthorized }` («Нет доступа.» / "Access denied.") unless stated otherwise. Server actions call `requireUser`, which redirects instead.

### 3.1 `createStudentAction(formData)` — server action (`actions/student.ts`)

- **Role:** TEACHER. **Input (FormData):** `name`, `login`, `password`.
- **Normalisation:** `name = normalizeSingleLineText(name)`; `login = normalizeLoginInput(login)` (lower-cased); password taken as is.
- **Validation → `{ ok: false, message: dict.students.actions.createStudent.invalid }`** («Укажите имя, логин и пароль: минимум 8 символов, обязательно буквы и цифры.» / "Enter a name, a login and a password: at least 8 characters with both letters and digits.") when: name empty or > 120 chars; login empty or > 254 chars; password > 256 chars; `validatePasswordStrength(password) !== null` (§4.7).
- **Rate limits:** in-memory `create-student`, identifier `"{teacherId}:{clientIp}"`, **20 per 10 min**; persistent `create-student`, identifier `teacherId`, **20 per 10 min**. Overflow → `{ ok: false, message: …rateLimited }` («Слишком много попыток создать учеников за короткое время. Подождите несколько минут.» / "Too many students created in a short time. Wait a few minutes."). Persistent limiter failure → `…save`.
- **Duplicate login** (any existing `User.email`, any role) → `{ ok: false, message: …exists }` («Ученик с таким логином уже существует.» / "A student with this login already exists.").
- **DB failure** → `{ ok: false, message: …save }` («Не удалось создать ученика. Проверьте подключение к PostgreSQL и повторите попытку.» / "Could not create the student. Check the PostgreSQL connection and try again.").
- **Success:** creates `User { name, email: login, passwordHash (scrypt), role: STUDENT, teacherId: teacher.id }` → `{ ok: true, message: …created }` («Ученик создан. Ему уже можно входить в систему.» / "Student created. They can sign in now.").
- **Side effects:** audit log `student.create` (text key `student.created`, params `{ name }`); cache revalidation (teacher students + topics); realtime event `students-changed`.

### 3.2 `deleteStudentAction(formData)` — server action

- **Roles:** TEACHER (own students) or DEVELOPER (any). **Input:** `studentId`.
- **Outcomes (redirect + query):** to `/teacher/students` for a teacher, `/developer/accounts` for a developer.
  - missing `studentId` → `studentError=delete`;
  - student not found / not owned → `studentError=deleteMissing`;
  - transaction failure → `studentError=delete`;
  - success → `studentDeleted=1`.
- **What is deleted (one transaction):** all `HomeworkAssignment` of the student (cascades numbers, pending photos, checks, check results, check photos); all `LessonParticipant` rows of the student (cascades items → submissions → submission photos); all `StoredFile` rows uploaded by the student; the `User` row (cascades sessions, `StudentTopicNumberStatus`, `ProgressStatusEvent`, notifications, profile, parent-call log…). File blobs are removed from storage afterwards (best effort).
- **Side effects:** audit `student.delete` (`student.deleted`, `{ name }`), revalidation, realtime `students-changed`.
- No rate limit.

### 3.3 `resetStudentPasswordAction(formData)` — server action

- **Roles:** TEACHER (own) or DEVELOPER (any). **Input:** `studentId`, `password`.
- **Outcomes (redirect to `/teacher/students` or `/developer/accounts`):**
  - empty `studentId` → `passwordResetError=missing`;
  - `password.length > 256` or `validatePasswordStrength(password) !== null` → `passwordResetError=invalid`;
  - in-memory limit `reset-student-password`, identifier `"{userId}:{clientIp}"`, **20 per 10 min** → `passwordResetError=rateLimited`;
  - student not found / not owned → `passwordResetError=missing`;
  - DB failure → `passwordResetError=save`;
  - success → `passwordReset=1`.
- **Effect:** new `passwordHash`; **all sessions of the student are deleted** (the caller's own session is untouched). Audit `student.password_reset`.

### 3.4 `POST /api/teacher/homeworks` — issue a homework

- **Roles:** TEACHER (own student) or DEVELOPER (any). **Rate limit:** `api:teacher-homeworks` **120 / 60 s** per user (shared with DELETE).
- **Request JSON:** `{ studentId: string; topicId: string; homeworkNumberIds: string[]; deadlineAt: string /* ISO */; title?: string }`.
- **Validation / errors** (logic in `lib/homework-issue.ts`):

| HTTP | When | Body `error` |
|---|---|---|
| 400 | `deadlineAt` missing/blank; or after trimming: no `studentId`, no `topicId`, empty id list (ids are trimmed, de-duplicated), or `deadlineAt` not a valid date | `dict.apiPlanner.homeworkIssue.invalidData` «Некорректные данные для ДЗ.» / "Invalid homework data." |
| 404 | student not found / not a STUDENT / not owned by the teacher; or **any** id is not a number of `topicId` | `dict.apiCommon.studentOrNumberNotFound` «Ученик или номер задания не найден.» / "Student or problem not found." |
| 409 | at least one requested number already has status GREEN or YELLOW for this student | one number: `homeworkIssue.solvedConflictOne` «Номер {numbers} ученик уже решил — повторно его не выдаём. Уберите его из набора или сбросьте статус на карточке ученика.» / "The student has already solved problem {numbers} — it won't be assigned again. Remove it from the set or reset its status on the student's card."; several: `solvedConflictMany` «Номера {numbers} ученик уже решил — повторно их не выдаём. Уберите их из набора или сбросьте статус на карточке ученика.» / "The student has already solved problems {numbers} — they won't be assigned again. Remove them from the set or reset their status on the student's card." (`{numbers}` = labels sorted numerically, joined with ", ") |
| 503 | un-migrated DB | `format(dict.apiCommon.migrationMissing, { what })` «{what} ещё не создана в PostgreSQL. Сначала примените миграцию.»; with `deadlinesEnabled: false` in the body when the missing thing is the deadline column |

- **Success `200`:** `{ ok: true, assignmentId: string, deadlineAt: string /* ISO */, homeworkNumberIds: string[] }`.
- **Effects (one transaction):** create `HomeworkAssignment { studentId, topicId, title: title.trim().slice(0, 200) || null, deadlineAt }` + its numbers; create missing `StudentTopicNumberStatus` rows (`status: null`, `deadlineAt`) for those numbers; recompute mirrored deadlines (§4.5). After commit: notification to the student `type: "homework-assigned"`, `params { variant: "assigned", topic, numbers: "<labels sorted, comma separated>", count, deadlineAt }`, `href: "/student/homeworks"` (title `dict.notifications.homeworkAssigned.titleAssigned` «Учитель выдал ДЗ по теме «{topic}»» / "Your teacher assigned homework on “{topic}”", body `bodyOne|bodyMany` «Номер(а) {numbers} · дедлайн {deadline}» / "Problem(s) {numbers} · due {deadline}"); cache revalidation; realtime `student-deadlines-changed { studentId, topicId }`.
- RED and unmarked numbers **can** be re-issued (the main "let them redo it" scenario); a number may be in several assignments at once.

### 3.5 `DELETE /api/teacher/homeworks` — cancel a homework

- **Roles:** TEACHER (assignment of own student) or DEVELOPER. **Rate limit:** shared `api:teacher-homeworks` 120 / 60 s.
- **Request JSON:** `{ assignmentId: string }` (body on a DELETE).
- **Errors:** `400 dict.apiPlanner.homeworks.invalidCancelData` («Некорректные данные для отмены ДЗ.» / "Invalid data for cancelling homework.") when the id is empty; `404 dict.apiCommon.homeworkNotFound` («ДЗ не найдено.» / "Homework not found.") when not found / not owned; `503` migration message.
- **Success:** `{ ok: true }`.
- **Effects:** delete the assignment (cascade: its numbers, pending photos, checks + results + check photos); recompute mirrored deadlines for its numbers from the **remaining** assignments (§4.5); delete `StudentTopicNumberStatus` rows of those numbers that are completely empty (`status`, `note`, `statusChangedAt`, `deadlineAt` all null); delete the `StoredFile` records of the assignment's photos and check photos if nothing else references them. **Statuses already set are kept.** Realtime `student-deadlines-changed`. No notification to the student.

### 3.6 `POST /api/teacher/number-status` — set / clear one number's status

- **Role:** **TEACHER only** (DEVELOPER gets 401). **Rate limit:** `api:teacher-number-status` **240 / 60 s**.
- **Request JSON:** `{ studentId: string; homeworkNumberId: string; status: "GREEN" | "YELLOW" | "RED" | null }` — the `status` key **must be present** (explicit `null` clears).
- **Errors:** `400 dict.apiPlanner.numberStatus.invalidData` («Некорректные данные для статуса.» / "Invalid status data.") — missing ids, missing `status` key, or a value outside the three statuses/null; `404 dict.apiCommon.studentOrNumberNotFound` — student not owned / not found, or number not found.
- **Success:** `{ ok: true, status }`.
- **Effects:** one Serializable transaction via `runProgressTransaction` + `writeProgress({ source: "teacher", status, actor })` (§4.1): upsert `StudentTopicNumberStatus { status, statusChangedAt: now }`, append a `ProgressStatusEvent` (decision `changed` or `reaffirmed`). After commit: audit `progress.status`; realtime `student-progress-changed { studentId, topicId }`; cache revalidation. The number does not have to belong to any homework.

### 3.7 `createAccountAction(formData)` — server action (`actions/account.ts`)

- **Role:** DEVELOPER. **Input:** `role` (`"STUDENT"` | `"TEACHER"`), `teacherId` (required for STUDENT), `name`, `login`, `password`.
- **Validation → `{ ok: false, message: dict.students.actions.createAccount.invalid }`** («Укажите роль, учителя (для ученика), имя, логин и пароль: минимум 8 символов, буквы и цифры.» / "Enter a role, a teacher (for a student), a name, a login and a password: at least 8 characters, letters and digits."): unknown role; STUDENT without `teacherId`; same name/login/password rules as §3.1.
- **Rate limits:** in-memory `create-account` `"{developerId}:{clientIp}"` 20 / 10 min; persistent `create-account` `developerId` 20 / 10 min → `…rateLimited` («Слишком много попыток создать аккаунты. Подождите несколько минут.» / "Too many accounts created. Wait a few minutes."); limiter failure → `…save`.
- **Other failures:** selected teacher not found → `…teacherMissing` («Выбранный учитель не найден — обновите страницу и попробуйте снова.» / "The selected teacher was not found — refresh the page and try again."); duplicate login → `…exists` («Аккаунт с таким логином уже существует.» / "An account with this login already exists."); DB failure → `…save`.
- **Success:** creates the user (`teacherId` = chosen teacher for a student, `null` for a teacher) → `{ ok: true, message: …teacherCreated | …studentCreated }` («Аккаунт учителя создан.» / "Teacher account created."; «Аккаунт ученика создан.» / "Student account created."). Audit `account.create`; realtime `students-changed`.

### 3.8 `GET /api/teacher/progress-history`

- **Roles:** TEACHER (own student) or DEVELOPER. **Rate limit:** `api:progress-history` **90 / 60 s**.
- **Query:** `studentId`, `homeworkNumberId` (required), `cursor` (optional, an entry id).
- **Errors:** `403 dict.apiContent.progressHistory.forbidden` («Нет доступа к истории прогресса.» / "You don't have access to the progress history."); `400 …paramsRequired` («Укажите ученика и номер.» / "Specify the student and the problem."); `404 …notFound` («История не найдена.» / "History not found.") — student not owned/not found, number not found, or unknown cursor.
- **Success:** `ProgressHistoryData` (§2.6), header `Cache-Control: private, no-store`. Page size **20**; `nextCursor` set when a 21st row exists. Reference rule: if the event context has a `lessonId` of a lesson that still exists, includes the student and (for a TEACHER) is taught by the viewer → `{ label: openLesson, href: "/teacher/lessons/{lessonId}" }` (`/developer/lessons/...` for a developer); else if it has an `assignmentId` that still exists for this student **and the viewer is a TEACHER** → `{ label: openHomework, href: "/teacher/students/{studentId}#homework-{assignmentId}" }`; else `null`.

### 3.8a `changeStudentOwnersAction(formData)` — server action

- **Role:** DEVELOPER. **Input:** `changes` = JSON string of `Array<{ studentId, teacherId }>` (entries with an empty id are dropped).
- **Outcomes (redirect to `/developer/accounts`):** unparsable / not an array / empty list / any referenced student (role STUDENT) or teacher (role TEACHER) missing → `accountError=ownerInvalid` (**nothing** is applied); transaction failure → `accountError=ownerSave`; success → `ownerChanged={count}`.
- **Effects per change (single transaction):** `User.teacherId = teacherId`; if the student is in a group led by a different teacher → removed from the group (`StudentProfile.groupId = null`); the student's participation is deleted from lessons/homework drafts of **other** teachers that are not started/issued (`issuedAssignmentId = null`, lesson not finished, and kind HOMEWORK or no `startsAt` or `startsAt` in the future). Past and running lessons stay as history but are no longer visible to the previous owner. Audit `student.owner_change`; realtime `students-changed`.

### 3.9 `resetTeacherPasswordAction(formData)` — server action

- **Role:** DEVELOPER. **Input:** `teacherId`, `password`.
- **Outcomes (redirect to `/developer/accounts`):** empty id → `teacherPasswordError=missing`; invalid password → `teacherPasswordError=invalid`; in-memory limit `reset-teacher-password` `"{developerId}:{clientIp}"` **20 / 10 min** → `teacherPasswordError=rateLimited`; teacher not found → `missing`; DB failure → `save`; success → `teacherPasswordReset=1`.
- **Effect:** new hash; all sessions of that teacher deleted. Audit `teacher.password_reset`.

### 3.10 `POST /api/teacher/lessons` — create a lesson (as used by S7; full spec in the lessons subsystem)

- **Roles:** TEACHER / DEVELOPER. **Rate limit:** `api:lesson-plan` **10 / 60 s** (shared with regenerate).
- **Request JSON:** `{ groupId?: string; studentIds?: string[]; title?: string; durationMinutes?: number; topicIds?: string[]; teacherNote?: string; startsAt?: string; skipPlan?: boolean; numberIds?: string[]; speeds?: Record<string /* studentId */, number | null> }`.
- **Normalisation:** `title` trimmed, ≤ 200 chars, default `format(dict.apiPlanner.lessons.defaultTitle, { date })` («Занятие от {date}» / "Lesson on {date}", stored in the creator's language); `durationMinutes` integer clamped to **15…240**, default **60**; `teacherNote` trimmed ≤ **500**; speed clamped to **1…10** or `null`; without a `groupId` only the teacher's own students among `studentIds` are kept.
- **Errors:** `400 dict.apiPlanner.lessons.selectAtLeastOneStudent` («Выберите хотя бы одного ученика.» / "Select at least one student."); `400 tooManyStudents` (max **30**); `400 invalidStartsAt` («Некорректные дата и время урока.» / "Invalid lesson date and time."); `404 dict.apiCommon.groupNotFound`; `500 createFailed`.
- **Success variants:** manual `{ ok: true, lessonId, skippedPlan: true }` (participants get `planGeneratedAt = now`; `numberIds` that exist are stored for every participant in the given order as main items with reason `NEW`); AI `{ ok: true, lessonId }` (plan generation queued); AI budget refused `{ ok: true, lessonId, planError: "budgetExhausted" | "queueFull" }`; AI disabled → **`503 { error: plannerUnavailable, lessonId }`** («ИИ-подбор недоступен: модель не настроена. Урок можно собрать вручную.» / "AI selection is unavailable: the model isn't configured. You can build the lesson manually.") — the lesson **was created**, the client navigates to it.
- **Side effects:** realtime `lesson-activity` to each participant when `startsAt` is set.

### 3.10a `deleteTeacherAction(formData)` — server action

- **Role:** DEVELOPER. **Input:** `teacherId`, `transferToTeacherId` (may be empty).
- **Outcomes (redirect to `/developer/accounts`):** empty id or teacher not found → `accountError=teacherMissing`; teacher has ≥ 1 student and `transferToTeacherId` is empty, equals `teacherId`, or is not an existing TEACHER → `accountError=teacherTransfer`; transaction failure → `accountError=teacherDelete`; success → `teacherDeleted=1`.
- **Effects (one transaction):** if a new owner is given: all students, **all lessons / homework drafts** and **all groups** of the teacher are re-assigned to the new owner; the teacher's uploaded `StoredFile` rows are re-assigned to the developer (`uploadedById`); then the `User` row is deleted (cascade: sessions; without a transfer also the teacher's lessons and tests). Lesson submission photos of cascaded lessons are cleaned up afterwards. Audit `teacher.delete`; realtime `students-changed`.

### 3.11 `PATCH /api/teacher/lessons/{lessonId}/participants/{participantId}/items/{itemId}/result`

- **Roles:** TEACHER (own lesson **and** own student) / DEVELOPER. **Rate limit:** `api:lesson-item-result` **240 / 60 s**. Only lessons of kind `LESSON`.
- **Request JSON:** `{ result: "SOLVED" | "PARTIAL" | "NOT_SOLVED" | "SKIPPED" | null }` — the key must be present.
- **Errors:** `400 dict.apiPlanner.lessonResult.invalidResult` («Некорректный итог.» / "Invalid result."); `404 …itemNotFound` («Задача урока не найдена.» / "Lesson problem not found."); `500 …saveFailed` («Не удалось сохранить итог.» / "Could not save the result.").
- **Success:** `{ ok: true, result }`.
- **Effects:** updates `LessonAssignmentItem.result` and, in the same progress transaction, writes progress with `source: "lesson_teacher"` (`previousResult` = the item's result before the update) — mapping in §4.1. Realtime `student-progress-changed` + `lesson-activity`.

### 3.12 `PATCH /api/teacher/lessons/{lessonId}/participants/{participantId}/items`

- **Roles:** TEACHER (own lesson and own student) / DEVELOPER. **Rate limit:** `api:lesson-items` **60 / 60 s**.
- **Request JSON:** `{ homeworkNumberIds: string[]; extraHomeworkNumberIds?: string[] }` — the **complete** desired set in order (main part, then extra part).
- **Rules:** ids trimmed and de-duplicated; each list capped at **40** (`MAX_PLAN_ITEMS`); an id present in both lists stays only in main; unknown ids are silently dropped. Differential update: existing rows keep their id (and reason/minutes/comment/result/submissions), only `order` / `isExtra` change; new numbers are created with reason `NEW`; rows missing from the new set are deleted **unless the student has already submitted a solution for them**.
- **Errors:** `404 dict.apiPlanner.lessonItems.participantNotFound` («Участник урока не найден.» / "Lesson participant not found."); `409 …homeworkAlreadyIssued` («ДЗ уже выдано. Сначала отмените его.» / "Homework has already been assigned. Cancel it first.") (only relevant to homework drafts); `400 …numbersRequired` («Передайте список номеров.» / "Provide a list of problems.") when `homeworkNumberIds` is not an array; `409 …blockedNumbers` («Нельзя убрать номер, по которому ученик уже сдавал решение: {numbers}.» / "A problem the student has already submitted a solution for can't be removed: {numbers}."); `500 …saveFailed` («Не удалось сохранить набор.» / "Could not save the set.").
- **Success:** `{ ok: true, items: <count of main items> }`. Removing an item does **not** touch the number's progress status.

### 3.13 `POST /api/teacher/lessons/{lessonId}/participants/{participantId}/regenerate`

- **Roles:** TEACHER / DEVELOPER. **Rate limit:** `api:lesson-plan` **10 / 60 s**. No body.
- **Errors:** `404 participantNotFound`; `409 homeworkAlreadyIssued`; `503 dict.apiPlanner.lessons.plannerUnavailable` when the planner is disabled / not configured; `429 dict.planner.planErrors.budgetExhausted` («Дневной лимит ИИ-подбора исчерпан. Соберите набор вручную или нажмите «Повторить» завтра.» / "The daily AI selection limit is used up. Build the set by hand or press “Retry” tomorrow.") or `503 …queueFull` («Очередь ИИ-подбора переполнена. Нажмите «Повторить» через несколько минут.» / "The AI selection queue is full. Press “Retry” in a few minutes.").
- **Success:** `{ ok: true }`; the participant's `planGeneratedAt` and `planError` are reset to `null` (→ `planPending = true`) and a generation job is queued; the previous set stays until the new plan replaces it.

### 3.14 `GET /api/teacher/lessons/{lessonId}/status`

- **Roles:** TEACHER (own lesson) / DEVELOPER. No rate limit. `404 dict.apiCommon.lessonNotFound` («Урок не найден.» / "Lesson not found."). Returns `LessonPlanStatus` (§2.5).

### 3.15 `GET /api/teacher/topics/conditions?topicId=`

- **Roles:** TEACHER / DEVELOPER (no ownership scope — the bank is shared). **Rate limit:** `api:topic-conditions` **120 / 60 s**. Empty `topicId` → `{ conditions: {} }`. Returns `{ conditions: { [homeworkNumberId]: conditionLatex | null } }`.

### 3.16 `POST /api/teacher/student-deadlines` — set / clear a deadline on individual numbers

- **Not called by any current UI component** (the review/assign tabs only use the homework endpoints); kept for completeness.
- **Role:** **TEACHER only**. **Rate limit:** `api:student-deadlines` **240 / 60 s**.
- **Request JSON:** `{ studentId: string; topicId: string; homeworkNumberId?: string; homeworkNumberIds?: string[]; deadlineAt: string /* ISO */ | null }` (`homeworkNumberIds` wins over the single id; ids trimmed and de-duplicated; `deadlineAt` must be a non-empty valid date string or explicit `null`).
- **Errors:** `400 dict.apiPlanner.studentDeadlines.invalidData` («Некорректные данные для дедлайна.» / "Invalid deadline data."); `404 dict.apiCommon.studentOrNumberNotFound` (student not owned, or any id not in `topicId`); `503` migration message with `deadlinesEnabled: false`.
- **Success:** `{ ok: true, deadlineAt: string | null, deadlinesEnabled: true, homeworkNumberIds: string[] }`.
- **Effects:** for each number: upsert the status row with the new `deadlineAt` (creating `{ status: null, note: null, deadlineAt }` if absent); when clearing a deadline on a row with no status and no note only `deadlineAt` is nulled (the row is kept). When a deadline is **set**: notification `homework-assigned` with `variant: "deadline"` for one number (title `titleDeadline` «Назначен дедлайн по теме «{topic}»» / "A deadline was set for “{topic}”") or `"assigned"` for several, `href: "/student/homeworks"`. Realtime `student-deadlines-changed`. This write is **not** reconciled with the homework mirror — the next issue/cancel touching the number recomputes it.

### 3.17 `GET /teacher/students/{studentId}/export/pdf?period=` — see S8

- Rate limit `api:pdf-export` **5 / 5 min** per user; process-wide concurrency cap **2**.

### 3.18 File access for photos (`GET /files/{fileId}`, `?thumb=1`, `?download=1`)

- A TEACHER may read a solution photo only if it belongs to a homework (pending photo or check photo) of **one of their own students**, or to a lesson submission in a lesson they teach; DEVELOPER may read everything; otherwise `404 "Not found"`. `?thumb=1` returns a small preview (immutable private cache); if the thumbnail cannot be built the original is returned.

---

## 4. Business rules the mobile mock must imitate

### 4.1 Progress writes (`lib/progress-policy.ts`, `lib/progress-write.ts`)

Every change of a number's colour goes through `decideProgressChange(current, intent)` and is recorded as a `ProgressStatusEvent` — **even when nothing is written**.

```ts
type ProgressIntent =
  | { source: "teacher"; status: HomeworkNumberStatus | null }
  | { source: "homework_check"; verdict: SolutionVerdict; checkStartedAt: Date }
  | { source: "lesson_teacher"; result: LessonItemResult | null; previousResult: LessonItemResult | null }
  | { source: "lesson_check"; result: LessonItemResult | null; verdict: SolutionVerdict }
  | { source: "lesson_end"; result: LessonItemResult };

type ProgressDecision = {
  write: boolean;
  requestedStatus: HomeworkNumberStatus | null;
  status: HomeworkNumberStatus | null;   // resulting status (previous one when write === false)
  reason: ProgressDecisionReason;
};
```

Rules, in order (`previous` = current status or null):

1. `homework_check`:
   - `requested = statusForAiVerdict(verdict, previous)`: `UNCERTAIN → null`; `INCORRECT → RED`; `CORRECT → YELLOW` if `previous` is RED or YELLOW, else `GREEN`.
   - `requested === null` → keep, reason `uncertain`.
   - `requested === previous` → keep, `unchanged`.
   - downgrade (rank GREEN 3 > YELLOW 2 > RED 1; `requested` rank < `previous` rank) → keep, `downgrade_blocked`.
   - `current.statusChangedAt > checkStartedAt` → keep, `newer_status`.
   - otherwise write.
2. `teacher` (S4 buttons, "accept AI verdicts", undo): `requested = intent.status` (may be `null` = clear). **Always written**, no downgrade protection.
3. Lesson sources:
   - `lesson_check` with `result === null` → keep, reason `uncertain` (verdict UNCERTAIN) or `lesson_result_preserved`.
   - `result === SKIPPED` or `result === null`: keep with reason `no_status`, **except** when the source is `lesson_teacher` and `previousResult` was non-null and not SKIPPED — then `requested = null` (the status is **cleared**) and it is written.
   - otherwise `requested` = `SOLVED → GREEN`, `PARTIAL → YELLOW`, `NOT_SOLVED → RED`, written (no downgrade protection).
4. Any write: reason = `reaffirmed` if `previous === requested`, else `changed`; the row gets `status = requested` and **`statusChangedAt = now`** (also for a re-affirmation and for a clear — a cleared row with `statusChangedAt` set must not be deleted, it protects against a late answer of an older check).

Event row: `{ id, createdAt, studentId, homeworkNumberId, source, previousStatus, requestedStatus, status, decision, actorId, actorName, actorRole, context: { lessonId?, itemId?, assignmentId?, checkId?, submissionId?, verdict?, lessonResult?, checkStartedAt? } }`. Actor display when `actorName` is null: «Система» / "System" for `lesson_end`, otherwise «ИИ» / "AI".

Label dictionaries (`dict.progress`): statuses — GREEN «Решил»/"Solved", YELLOW «Решил с ошибками»/"Solved with mistakes", RED «Не решил»/"Not solved", none «Без отметки»/"No mark". Sources — `teacher` «Отметка учителя»/"Teacher's mark", `homework_check` «Проверка ДЗ»/"Homework check", `lesson_teacher` «Итог урока от учителя»/"Lesson result by the teacher", `lesson_check` «Проверка на уроке»/"In-lesson check", `lesson_end` «Завершение урока»/"Lesson ended". Decisions — `changed` «Статус изменён»/"Status changed", `reaffirmed` «Отметка подтверждена повторно»/"Mark confirmed again", `unchanged` «Статус уже совпадает»/"Status already matches", `uncertain` «Проверка не дала определённого результата»/"The check was inconclusive", `downgrade_blocked` «Проверка ДЗ не понижает достигнутый статус»/"A homework check doesn't lower an achieved status", `newer_status` «Сохранена отметка, сделанная после запуска проверки»/"Kept the mark made after the check started", `no_status` «Этот итог не меняет общий прогресс»/"This result doesn't change overall progress", `lesson_result_preserved` «Сохранён ранее выставленный итог урока»/"Kept the lesson result set earlier".

The student never changes the colour (student API only saves the note).

### 4.2 Issuing a homework (`issueHomework`)

1. Trim ids, de-duplicate number ids; title = `trim().slice(0, 200)` or null.
2. Invalid input → `invalid`. Student must exist with role STUDENT and (for a TEACHER) be owned; **all** number ids must belong to `topicId` → else `not_found`.
3. If any requested number currently has status GREEN or YELLOW → `conflict` listing those numbers (sorted numerically). RED / unmarked numbers pass, even if they are already in another assignment.
4. Create the assignment; create missing status rows `{ status: null, deadlineAt }`; recompute mirrored deadlines (§4.5).
5. Notify the student, emit `student-deadlines-changed`.

One homework = one topic. There is no upper bound on the number count and no "deadline must be in the future" check in the manual flow.

### 4.3 Review-tab client rules

- **Accept AI verdicts** (for one assignment): take the latest check with `status === "DONE"`. For each of its results whose number is still in the assignment and whose verdict ≠ `UNCERTAIN`: `previous` = effective status (optimistic local value if any, else server value); `next = statusForAiVerdict(verdict, previous)` (same function as §4.1.1 — CORRECT after RED/YELLOW gives YELLOW, not GREEN). If `next !== null && next !== previous` it becomes a change. No changes → nothing happens. Otherwise: apply optimistically, show the undo toast for 10 s with the count of changes, and send **one `POST number-status` per change in parallel** (source `teacher`, so an INCORRECT verdict does turn a GREEN number RED). Failure → error banner `review.errors.applyVerdicts` («Не удалось применить вердикты.» / "Could not apply the verdicts.") and a full refetch.
- **Undo:** restores each changed number to its remembered previous status (including `null`) with parallel `POST number-status`; failure → `review.errors.undoVerdicts` («Не удалось отменить применение вердиктов.» / "Could not undo the verdicts.") + refetch. A new "accept" replaces the pending undo.
- **Manual status button:** tap active → `null`; tap inactive → that status; optimistic with rollback.
- **`shortenRecognizedAnswer(answer)`**: trim; split by `;` into non-empty trimmed parts; if `parts.length >= 5 && trimmed.length > 80` → `"{p0}; {p1}; …; {pLast}"`; else if `trimmed.length > 140` → first 137 chars (right-trimmed) + `…`; else unchanged.
- **Card collapsing, lesson mode, expanded check rows** are local UI state, reset on screen remount.

### 4.4 Attention sort of assignments (`lib/homework-attention.ts`)

`completed` ⇔ `numbers.length > 0` and every number is GREEN or YELLOW. Rank (lower first), evaluated in this order with `now`:

| Rank | Condition |
|---|---|
| 5 | completed |
| 0 | `deadlineAt < now` (overdue) |
| 1 | `latestCheck.status === "DONE"` and it has at least one `UNCERTAIN` result |
| 2 | at least one number with `status === null` |
| 3 | deadline within the next **72 h** |
| 4 | everything else |

Ties: both have deadlines and they differ → earlier deadline first; exactly one has a deadline → it goes first; otherwise newer `createdAt` first. (`latestCheck` = the newest check of any status.)

### 4.5 Deadline mirror (`lib/homework-deadline-mirror.ts`)

`StudentTopicNumberStatus.deadlineAt` for a (student, number) pair = the **earliest** `deadlineAt` among all existing assignments of that student that contain the number and have a deadline; `null` if there is none. It is recomputed for the affected numbers after every issue and every cancel. The recompute never creates rows (issue creates them first). The "Already assigned with a deadline" footnote on the assign board is exactly "mirror is non-null".

### 4.6 Ownership checks to reproduce in the mock

For a TEACHER every student-addressed call must verify `student.teacherId === viewer.id`, otherwise respond as "not found". DEVELOPER bypasses the ownership filter but is rejected (401) by `number-status` and `student-deadlines`. Lesson endpoints additionally require `lesson.teacherId === viewer.id` for a TEACHER.

### 4.7 Password policy (`lib/password-policy.ts`)

`validatePasswordStrength(password)` returns the first problem or null (`normalized = password.trim()`):

| Order | Condition | Code | RU | EN |
|---|---|---|---|---|
| 1 | `normalized.length < 8` | `tooShort` | Пароль должен быть не короче 8 символов. | The password must be at least 8 characters long. |
| 2 | `password.length > 256` | `tooLong` | Пароль не должен быть длиннее {max} символов. | The password must be at most {max} characters long. |
| 3 | no letter `/[a-zа-яё]/i` | `noLetter` | Пароль должен содержать хотя бы одну букву. | The password must contain at least one letter. |
| 4 | no digit `/\d/` | `noDigit` | Пароль должен содержать хотя бы одну цифру. | The password must contain at least one digit. |
| 5 | lower-cased value in the common list | `common` | Этот пароль слишком распространён, выберите другой. | This password is too common — choose another one. |

Common list: `12345678, 123456789, 1234567890, password, password1, password123, qwerty123, qwertyui, 11111111, 00000000, 1q2w3e4r, abc12345, 1234qwer, qwer1234, iloveyou, football`. `{max}` = 256.

### 4.8 Suggested password (`lib/password-generate.ts`)

- Alphabets: consonants `bdfghkmnprstvz`, vowels `aeou`, digits `23456789` (no look-alikes); a syllable = consonant + vowel; cryptographically random indices.
- `generatePasswordFromName(fullName)`: surname = last whitespace-separated word; transliterate (NFC, lower-case; latin letters kept; Cyrillic map: а a, б b, в v, г g, д d, е e, ё yo, ж zh, з z, и i, й y, к k, л l, м m, н n, о o, п p, р r, с s, т t, у u, ф f, х h, ц ts, ч ch, ш sh, щ shch, ъ "", ы y, ь "", э e, ю yu, я ya; everything else dropped), cut to 16 chars. If fewer than 3 latin letters → fallback. Result: `Capitalised(latin) + "-" + 2 random syllables + 4 random digits`, e.g. `Smirnova-beku4725`.
- Fallback `generateReadablePassword()`: `Capitalised(3 random syllables) + "-" + 4 random digits`, e.g. `Bekuma-4725`.

### 4.9 Lesson status derivation (`lib/lesson-status.ts`)

`deriveLessonStatus({ startsAt, durationMinutes, status, finishedAt }, now)`: if `finishedAt <= now` → `FINISHED`; if `startsAt` is missing/invalid → the stored `status` (or `PLANNED` if unknown); `now < startsAt` → `PLANNED`; `now < startsAt + durationMinutes` → `ACTIVE`; else `FINISHED`.

### 4.10 Plan error text (`lib/plan-error.ts`)

`planError` is stored as `"plan-error:<code>"`; text = `dict.planner.planErrors[code]`. Codes: `unavailable`, `studentMissing`, `noCandidates`, `homeworkNoCandidates`, `homeworkParams`, `emptyPlan`, `failed`, `budgetExhausted`, `queueFull` (RU/EN texts in `dictionaries/planner.ts`, e.g. `failed` «Подбор не удался: модель не ответила. Нажмите «Повторить» или добавьте номера вручную.» / "Selection failed: the model did not respond. Press “Retry” or add problems by hand."; `noCandidates` «Нет доступных номеров: всё уже решено, выдано на уроках или в активных ДЗ. Добавьте номера вручную.» / "No problems available: everything is already solved, used in lessons or in active homework. Add problems by hand."). A string without the prefix is matched exactly against seven frozen legacy Russian sentences (mapped to `unavailable`, `studentMissing`, `noCandidates`, `homeworkNoCandidates`, `homeworkParams`, `emptyPlan`, `failed`); anything else is shown verbatim.

### 4.11 Numbers

Number labels are strings; leading zeros are significant for display. Comparison/sort: strip leading zeros (`"000"` → `"0"`), compare by length then lexicographically (`compareHomeworkNumbers`). Bank order inside a topic is `displayOrder`.

### 4.12 Percentages and counters

`completionPercent(done, total) = total ? Math.round(done / total * 100) : 0`. "Solved" = GREEN + YELLOW; "marked" = GREEN + YELLOW + RED.

### 4.13 Accounts rules

- Login uniqueness is global across roles (`User.email` unique), compared after `normalizeLoginInput`.
- A student must always be created with an existing TEACHER as owner.
- A teacher with students cannot be deleted without a different existing teacher to transfer to; with a transfer, students + lessons + homework drafts + groups move to the new owner; without students the teacher's lessons and tests are deleted with the account.
- Changing an owner also removes the student from a foreign group and from not-yet-started lessons / un-issued homework drafts of other teachers.
- Resetting a password ends all sessions of the target account only.
- Deleting a student removes all their homework, photos, check history, statuses, deadlines, lesson participation and uploaded files.

### 4.14 Rate limits (complete list for this subsystem)

| Scope | Limit | Window | Key | Kind |
|---|---|---|---|---|
| `create-student` | 20 | 10 min | teacherId:ip (memory) + teacherId (persistent) | action |
| `reset-student-password` | 20 | 10 min | userId:ip (memory) | action |
| `create-account` | 20 | 10 min | developerId:ip (memory) + developerId (persistent) | action |
| `reset-teacher-password` | 20 | 10 min | developerId:ip (memory) | action |
| `api:teacher-homeworks` (POST + DELETE) | 120 | 60 s | userId | API |
| `api:teacher-number-status` | 240 | 60 s | userId | API |
| `api:student-deadlines` | 240 | 60 s | userId | API |
| `api:progress-history` | 90 | 60 s | userId | API |
| `api:topic-conditions` | 120 | 60 s | userId | API |
| `api:lesson-plan` (create lesson + regenerate) | 10 | 60 s | userId | API |
| `api:lesson-items` | 60 | 60 s | userId | API |
| `api:lesson-item-result` | 240 | 60 s | userId | API |
| `api:pdf-export` | 5 | 5 min | userId | API |
| PDF concurrency | 2 in flight | — | process | 503 + `Retry-After: 30` |

---

## 5. Realtime / polling behaviour

### 5.1 Server-sent events (shared channel, spec in `01-shell-auth.md` §5)

One `EventSource("/api/realtime")` per signed-in tab (max 2 connections per user). A TEACHER receives: `students-changed`, `topic-content-changed`, `lesson-activity` of lessons they teach, and `student-progress-changed` / `student-deadlines-changed` of their **own** students. A DEVELOPER receives everything. On every delivered event the site schedules **one `router.refresh()` 1500 ms later** (coalescing: events arriving while a refresh is scheduled are dropped); if the tab is hidden the refresh is deferred until it becomes visible.

Events emitted by this subsystem's mutations:

| Mutation | Event |
|---|---|
| create / delete student, create account, change owners, delete teacher | `students-changed` |
| issue homework, cancel homework, set per-number deadline | `student-deadlines-changed { studentId, topicId }` |
| set number status | `student-progress-changed { studentId, topicId }` |
| set lesson item result | `student-progress-changed` + `lesson-activity { lessonId, teacherId, studentId }` |
| create lesson with `startsAt` | `lesson-activity` per participant |

Events from **other** actors that should refresh these screens (all `student-progress-changed { studentId, topicId }`):

| Actor / action | Emitted when |
|---|---|
| Student uploads a solution photo (`POST /api/student/homework-submissions`) | always |
| Student deletes a pending photo (`DELETE /api/student/homework-submissions`) | always |
| Student saves a note (`/api/student/topic-status`) | always |
| AI homework check finishes (`lib/solution-check.ts`) | **only if** at least one status was applied (`appliedStatusCount > 0`) |
| AI in-lesson check (`lib/lesson-item-check.ts`) | when it writes a result |

A check that finishes with only `UNCERTAIN` / blocked verdicts, a check that starts (`PENDING` → `CHECKING`) or fails emits **nothing**; the background queue also cannot reliably invalidate cache tags, which is why `getTeacherStudentHomeworks` is cached for only **15 s**.

**Mobile mapping [PROPOSAL]:** subscribe to the shared realtime stream; on `student-progress-changed` / `student-deadlines-changed` for the open student invalidate the S4 / S5 queries (debounce 1.5 s, only while the screen is focused; otherwise mark stale and refetch on focus); on `students-changed` invalidate S1, S2, S9; on `lesson-activity` for a listed lesson invalidate S6. Additionally refetch S4 on screen focus and offer pull-to-refresh, because check start / failure / verdict-only completion emit no event.

### 5.2 Polling on the lessons tab

- While at least one listed lesson has `planPending`, the client polls `GET /api/teacher/lessons/{lessonId}/status` for each pending lesson every **2500 ms** (`POLL_INTERVAL_MS`). When this student's participant has `planGeneratedAt` or `planError`, the lesson leaves the pending set and the list is refetched. Network errors are ignored until the next tick.
- Staleness: the client remembers when it first saw a lesson pending; a 30 s ticker re-evaluates; after **15 min** (`STALE_PLAN_MS`) the spinner is replaced by the "plan was lost" notice with Retry (the server does not expose the queue time).
- After a successful `regenerate` the lesson is put (back) into the pending set locally.

### 5.3 Progress history

No polling. Reloaded when opened and whenever a status write for that number succeeds while the panel is open.

### 5.4 Server cache lifetimes (for expectation setting)

`getTeacherTopicsOverview` and `getTeacherStudentDetail`: tag-invalidated, 60 s TTL safety net. `getTeacherStudentHomeworks`: 15 s. `getProgressTimeline`: 300 s. `getTeacherStudentLessons`: not cached.

---

## 6. Proposed mobile API contract for this subsystem [PROPOSAL]

Base path `/api/mobile/v1`, bearer auth, `Accept-Language`, error envelope `{ error: { code, message, retryAfterSeconds? } }` (see `01-shell-auth.md` §6). Common codes: `401 sessionExpired`, `403 unauthorized`, `429 rateLimited`, `503 serviceUnavailable`, `400 invalidData`. "Not found or not owned" is always `404`. All types are those of §2 unless redefined here.

### 6.1 Teacher home and students

```
GET /api/mobile/v1/teacher/home                                  (TEACHER)
→ 200 TeacherHomeSummary

GET /api/mobile/v1/teacher/students                              (TEACHER)
→ 200 { students: TeacherStudentListItem[] }                    // name ASC

POST /api/mobile/v1/teacher/students                             (TEACHER)
body StudentCreateInput
→ 201 { student: { id: string; name: string; email: string } }
errors: 400 invalid · 409 exists · 429 rateLimited · 500 save
        (messages = dict.students.actions.createStudent.*)

DELETE /api/mobile/v1/teacher/students/{studentId}               (TEACHER own · DEVELOPER any)
→ 200 { ok: true }
errors: 404 deleteMissing · 500 delete            (messages = dict.students.list.notices.studentDeleteMissing|studentDelete)

POST /api/mobile/v1/teacher/students/{studentId}/password        (TEACHER own · DEVELOPER any)
body { password: string }
→ 200 { ok: true }
errors: 400 invalid · 404 missing · 429 rateLimited · 500 save  (messages = dict.students.list.notices.password*)
```

### 6.2 Student card

```
GET /api/mobile/v1/teacher/students/{studentId}                  (TEACHER own)
→ 200 { student: TeacherStudentHeader; activeHomeworksCount: number }
errors: 404 studentNotFound (dict.apiCommon.studentNotFound)

GET /api/mobile/v1/teacher/students/{studentId}/homeworks        (TEACHER own)
→ 200 TeacherStudentHomeworks        // assignments pre-sorted by attention; photos carry fileId for /files

GET /api/mobile/v1/teacher/students/{studentId}/assign-board     (TEACHER own)
→ 200 { deadlinesEnabled: boolean; topics: AssignBoardTopic[] }  // conditionLatex filled for topics[0] only

GET /api/mobile/v1/teacher/topics/{topicId}/conditions           (TEACHER · DEVELOPER)
→ 200 TopicConditions
```

### 6.3 Homework

```
POST /api/mobile/v1/teacher/homeworks                            (TEACHER own student · DEVELOPER)
body { studentId: string; topicId: string; homeworkNumberIds: string[]; deadlineAt: ISODateTime; title?: string }
→ 201 { assignmentId: string; deadlineAt: ISODateTime; homeworkNumberIds: string[] }
errors: 400 invalid
        404 studentOrNumberNotFound
        409 solvedConflict  — error.details: { conflictNumbers: string[] }   // message = solvedConflictOne|Many
        503 unavailable

DELETE /api/mobile/v1/teacher/homeworks/{assignmentId}           (TEACHER own student · DEVELOPER)
→ 200 { ok: true }
errors: 404 homeworkNotFound · 503 unavailable
```

### 6.4 Number status, deadlines, history

```
PUT /api/mobile/v1/teacher/students/{studentId}/numbers/{homeworkNumberId}/status      (TEACHER own)
body { status: HomeworkNumberStatus | null }
→ 200 { status: HomeworkNumberStatus | null; statusChangedAt: ISODateTime; decision: "changed" | "reaffirmed" }
errors: 400 invalid · 404 studentOrNumberNotFound

POST /api/mobile/v1/teacher/students/{studentId}/number-statuses                       (TEACHER own)
// [PROPOSAL] batch variant for "accept AI verdicts" / undo — one transaction, one history event per item
body { changes: Array<{ homeworkNumberId: string; status: HomeworkNumberStatus | null }> }   // 1..100 items
→ 200 { results: Array<{ homeworkNumberId: string; status: HomeworkNumberStatus | null }> }

PUT /api/mobile/v1/teacher/students/{studentId}/deadlines                              (TEACHER own)
body { topicId: string; homeworkNumberIds: string[]; deadlineAt: ISODateTime | null }
→ 200 { deadlineAt: ISODateTime | null; homeworkNumberIds: string[] }
errors: 400 invalid · 404 studentOrNumberNotFound · 503 unavailable

GET /api/mobile/v1/teacher/students/{studentId}/numbers/{homeworkNumberId}/history?cursor=   (TEACHER own · DEVELOPER)
→ 200 ProgressHistoryPage = {
    studentName: string; number: string; topicTitle: string;
    currentStatus: HomeworkNumberStatus | null;
    entries: Array<{
      id: string; createdAt: ISODateTime;
      source: ProgressSource;
      actorName: string | null;             // null → client shows «Система»/"System" for lesson_end, else «ИИ»/"AI"
      previousStatus: HomeworkNumberStatus | null;
      requestedStatus: HomeworkNumberStatus | null;
      status: HomeworkNumberStatus | null;
      decision: ProgressDecisionReason;
      reference: { kind: "lesson"; lessonId: string } | { kind: "homework"; assignmentId: string } | null;
    }>;
    nextCursor: string | null;              // page size 20
  }
errors: 400 paramsRequired · 403 forbidden · 404 notFound
// Codes instead of localized labels: the app renders them with dict.progress.* (texts in §4.1).
```

### 6.5 Lessons tab and compose

```
GET /api/mobile/v1/teacher/students/{studentId}/lessons          (TEACHER own)
→ 200 { lessons: TeacherStudentLesson[] }                        // lesson.createdAt DESC

GET /api/mobile/v1/teacher/number-bank                           (TEACHER · DEVELOPER)
→ 200 { topics: LessonBankTopic[] }                              // cache aggressively on the device

GET /api/mobile/v1/teacher/students/{studentId}/lesson-compose   (TEACHER own)
→ 200 ComposeContext

POST  /api/mobile/v1/teacher/lessons                             — body/response as §3.10
        (mobile: AI-unavailable case returns 201 { lessonId, planError: "unavailable" } instead of 503+lessonId)
GET   /api/mobile/v1/teacher/lessons/{lessonId}/status           → LessonPlanStatus
PATCH /api/mobile/v1/teacher/lessons/{lessonId}/participants/{participantId}/items
        body { homeworkNumberIds: string[]; extraHomeworkNumberIds?: string[] } → 200 { items: TeacherStudentLesson["items"] }
        errors: 400 numbersRequired · 404 participantNotFound · 409 homeworkAlreadyIssued · 409 blockedNumbers (details { numbers: string[] })
PATCH /api/mobile/v1/teacher/lessons/{lessonId}/participants/{participantId}/items/{itemId}/result
        body { result: LessonItemResult | null } → 200 { result: LessonItemResult | null }
        errors: 400 invalidResult · 404 itemNotFound
POST  /api/mobile/v1/teacher/lessons/{lessonId}/participants/{participantId}/regenerate
        → 202 { ok: true }
        errors: 404 participantNotFound · 409 homeworkAlreadyIssued · 429 budgetExhausted · 503 plannerUnavailable | queueFull
```
(These five lesson endpoints are owned by the lessons subsystem spec; listed here because S6/S7 call them.)

### 6.6 Reports and files

```
GET /api/mobile/v1/teacher/students/{studentId}/report.pdf?period=7d|30d|year          (TEACHER own · DEVELOPER)
→ 200 application/pdf (Content-Disposition as on the site)
errors (JSON envelope instead of the site's plain text): 404 studentNotFound · 429 rateLimited · 503 reportsBusy (retryAfterSeconds 30) · 500 exportFailed

GET /api/mobile/v1/files/{fileId}[?thumb=1]                     — bearer-authenticated binary, same access rules as §3.18
GET /api/mobile/v1/teacher/lessons/{lessonId}/handout.pdf       — lesson handout (lessons subsystem)
```

### 6.7 Developer accounts

```
GET /api/mobile/v1/developer/accounts                            (DEVELOPER)
→ 200 AccountsDirectory

POST /api/mobile/v1/developer/accounts                           (DEVELOPER)
body AccountCreateInput                                          // teacherId required when role = STUDENT
→ 201 { account: { id: string; name: string; email: string; role: "STUDENT" | "TEACHER"; teacherId: string | null } }
errors: 400 invalid · 404 teacherMissing · 409 exists · 429 rateLimited · 500 save   (messages = dict.students.actions.createAccount.*)

PUT /api/mobile/v1/developer/students/owners                     (DEVELOPER)
body { changes: OwnerChange[] }                                  // non-empty; all-or-nothing
→ 200 { changed: number }
errors: 400 ownerInvalid · 500 ownerSave

POST   /api/mobile/v1/developer/teachers/{teacherId}/password    body { password } → 200 { ok: true }
        errors: 400 invalid · 404 missing · 429 rateLimited · 500 save   (dict.students.accounts.notices.teacherPassword*)
DELETE /api/mobile/v1/developer/teachers/{teacherId}?transferToTeacherId=…
        → 200 { ok: true; transferredStudents: number }
        errors: 404 teacherMissing · 409 teacherTransfer · 500 teacherDelete
// Student password reset and student deletion reuse 6.1 (DEVELOPER may target any student).
```

### 6.8 Typed client interface for the mock

```ts
interface TeacherStudentsApi {
  getTeacherHome(): Promise<TeacherHomeSummary>;
  listStudents(): Promise<{ students: TeacherStudentListItem[] }>;
  createStudent(input: StudentCreateInput): Promise<{ student: { id: string; name: string; email: string } }>;
  deleteStudent(studentId: string): Promise<void>;
  resetStudentPassword(studentId: string, password: string): Promise<void>;

  getStudentCard(studentId: string): Promise<{ student: TeacherStudentHeader; activeHomeworksCount: number }>;
  getStudentHomeworks(studentId: string): Promise<TeacherStudentHomeworks>;
  getAssignBoard(studentId: string): Promise<{ deadlinesEnabled: boolean; topics: AssignBoardTopic[] }>;
  getTopicConditions(topicId: string): Promise<TopicConditions>;

  issueHomework(input: { studentId: string; topicId: string; homeworkNumberIds: string[]; deadlineAt: string; title?: string }):
    Promise<{ assignmentId: string; deadlineAt: string; homeworkNumberIds: string[] }>;
  cancelHomework(assignmentId: string): Promise<void>;

  setNumberStatus(studentId: string, homeworkNumberId: string, status: HomeworkNumberStatus | null):
    Promise<{ status: HomeworkNumberStatus | null }>;
  setNumberStatuses(studentId: string, changes: Array<{ homeworkNumberId: string; status: HomeworkNumberStatus | null }>): Promise<void>;
  setNumberDeadlines(studentId: string, input: { topicId: string; homeworkNumberIds: string[]; deadlineAt: string | null }): Promise<void>;
  getProgressHistory(studentId: string, homeworkNumberId: string, cursor?: string): Promise<ProgressHistoryPage>;

  listStudentLessons(studentId: string): Promise<{ lessons: TeacherStudentLesson[] }>;
  getNumberBank(): Promise<{ topics: LessonBankTopic[] }>;
  getLessonComposeContext(studentId: string): Promise<ComposeContext>;
  // create lesson / status / items / result / regenerate — from the lessons subsystem client

  downloadStudentReport(studentId: string, period: ReportPeriod): Promise<{ localUri: string; fileName: string }>;
}

interface DeveloperAccountsApi {
  getAccounts(): Promise<AccountsDirectory>;
  createAccount(input: AccountCreateInput): Promise<{ account: { id: string; name: string; email: string; role: "STUDENT" | "TEACHER"; teacherId: string | null } }>;
  changeStudentOwners(changes: OwnerChange[]): Promise<{ changed: number }>;
  resetTeacherPassword(teacherId: string, password: string): Promise<void>;
  deleteTeacher(teacherId: string, transferToTeacherId?: string): Promise<void>;
  deleteStudent(studentId: string): Promise<void>;
  resetStudentPassword(studentId: string, password: string): Promise<void>;
}
```

Mock requirements: an in-memory store with users (`teacherId` ownership; at least two teachers so that foreign-student 404s and teacher transfer can be exercised, plus one orphan student for the developer view), topics/numbers shared with the other mocks, `StudentTopicNumberStatus` rows with `statusChangedAt`, assignments with numbers / pending photos / checks (cover: a DONE check with CORRECT + INCORRECT + UNCERTAIN results, one FAILED, one PENDING, one result with `copySuspected`, one with `injectionSuspected`), an append-only `ProgressStatusEvent` log written through the exact §4.1 decision function, the §4.2 issue rules including the 409 conflict, the §4.5 mirror on issue/cancel, the §4.4 sort, the §4.7 password policy, duplicate-login detection, the §4.13 account rules, lessons with a pending plan that resolves after a few seconds (to exercise the 2.5 s polling) and one with a `planError`, and emission of the §5.1 events on the shared mock event bus.

---

## 7. Open questions / things that cannot be done natively as-is

1. **Scope of the DEVELOPER role in the app.** On the site a DEVELOPER cannot open any student card (page-level `requireUser(TEACHER)`), although several APIs accept the role. Should the mobile developer experience stay "accounts only" (recommended: mirror the site), or should developers also be able to browse a student's homework (would need new read endpoints and a decision about `number-status`, which rejects DEVELOPER today)?
2. **Per-number deadline endpoint has no UI.** `POST /api/teacher/student-deadlines` exists but nothing on the site calls it, and its writes are not reconciled with the homework mirror. Suggested approach: do not build a mobile screen for it; keep it out of the mock unless the owner wants "set a deadline on a single number" back.
3. **PDF report.** Generated server-side, Russian-only, rate-limited (5 per 5 min, 2 concurrent). The first mobile version runs on mock data: bundle a static sample PDF per period, or hide the three report actions until the real API exists? With the real API the app needs an authenticated download to a local file plus the OS share sheet (`expo-file-system` + `expo-sharing`); a WebView cannot be used because auth must not rely on cookies.
4. **Lesson handout PDF ("Download PDF" on the lessons tab).** The site route may return an **HTML page** instead of a PDF when the server has no Chromium (fallback "press Ctrl+P"). That fallback is meaningless on a phone — the mobile endpoint should return `503` with a clear message instead; confirm.
5. **Solution photos are cookie-protected** (`/files/{id}`); React Native `<Image>` cannot send the session cookie reliably. Suggested: bearer header on image requests (`expo-image` supports headers) against a mobile files endpoint, or short-lived signed URLs returned inside the homework payload. Which one will the future server implement?
6. **LaTeX statements** (`conditionLatex`) on the assign/compose boards are rendered with KaTeX plus a custom line-break rule (`lib/math-line-breaks.ts`). Native options: a WebView-based KaTeX view per card (heavy in long lists) or `react-native-mathjax-svg`-style rendering; a 40-number topic with full statements must stay scrollable. Decide the rendering approach once for all subsystems; until then the mock can show statements as plain text.
7. **"Site" line in the credentials dialog** uses `window.location.host`. The app needs a configured public site host (and should it mention the app instead, e.g. "Login in the ШБЗ Школа app"?). Also: add a native Share button next to Copy?
8. **Password visibility.** Create/reset forms show the password as plain text by design (the teacher dictates it). Keep that on mobile (no secure text entry), and disable autofill/keyboard suggestions for the field?
9. **Notices after server actions** are query-param banners on the list page; e.g. resetting a password from the student card navigates away to the list. Mobile will show toasts in place — confirm this behavioural difference is acceptable.
10. **Accept-AI-verdicts fan-out.** The site fires one request per number in parallel (up to the size of the homework) and has no atomic undo. The proposed batch endpoint (§6.4) makes it one transaction; if the real server keeps the single-number endpoint only, the app must throttle to stay under 240 requests / minute.
11. **Realtime on mobile.** The site relies on SSE + full page refresh. Is SSE acceptable in the app (foreground only), or should these screens rely on focus refetch + pull-to-refresh + push notifications? The 15-second server cache on the homework list means a refetch right after an event may still be stale.
12. **Offline / optimistic writes.** Status toggles and lesson results are optimistic with rollback on the site. Should the app queue them when offline (risk: conflicts with AI checks, which the `newer_status` rule resolves by time), or require connectivity (recommended for v1)?
13. **Deadline time zone.** The picker works in the device's local time while the server and all reports assume Europe/Moscow; the progress history is explicitly shown in MSK. Should the mobile deadline picker be pinned to Moscow time (label it "МСК") or stay device-local like the site?
14. **Deadline validation.** Neither client nor server rejects a deadline in the past for manual homework. Keep parity, or add a client-side warning?
15. **Review tab does not show statements or reference answers**, although the data function returns them. Showing the statement (and optionally the answer behind a tap) under each number would help reviewing on a phone — in scope for v1 or strict parity?
16. **Teacher deletion and owner changes are destructive, multi-entity operations** (transfer of lessons/groups, cascade deletes). Should the mobile app expose them at all in v1, or keep the developer accounts tab limited to creating accounts and resetting passwords?
17. **Number-search header control** appears on every site page of this area; the shell spec owns it. Confirm it is a global search action in the mobile shell rather than repeated per screen.
18. **AI-related entry points** ("Pick with AI" on the assign tab, "Assign homework from results" and AI mode on compose) lead into the homework-plans / lessons subsystems and depend on a server-side AI queue and daily budget. In the mock these should simulate a pending → ready plan; confirm they are in v1 scope or shown as disabled.
