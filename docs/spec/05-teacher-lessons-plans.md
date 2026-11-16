# 05 — Teacher: lessons (AI planner, board, live, results) and homework plans

Subsystem spec for the native mobile app (Expo / React Native). Source of truth: the web repo
(`app/(dashboard)/teacher/lessons/**`, `app/(dashboard)/teacher/homework-plans/**`,
`components/teacher-lesson-*.tsx`, `components/lesson-*.tsx`, `components/teacher-homework-plan-*.tsx`,
`app/api/teacher/lessons/**`, `app/api/teacher/homework-plans/**`, `lib/lesson-plan.ts`,
`lib/lesson-plan-queue.ts`, `lib/plan-budget.ts`, `lib/homework-plan.ts`, `lib/homework-issue.ts`,
`lib/plan-error.ts`, `lib/lesson-status.ts`, `lib/lesson-live.ts`, `lib/lesson-finalize.ts`,
`lib/progress-policy.ts`, `lib/platform-data.ts`, dictionaries `planner.ts` / `api-planner.ts`).

AI prompts are intentionally not documented. Everything the mock needs to imitate about generation is
described as observable state transitions and output constraints.

---

## 0. Shared concepts and glossary

### 0.1 One table, two products

A `Lesson` row is either a **lesson plan** (`kind = "LESSON"`) or a **homework draft**
(`kind = "HOMEWORK"`). Both have `participants` (`LessonParticipant`, one per student) and each
participant has an ordered **set** of problems (`LessonAssignmentItem`). Several API routes under
`/api/teacher/lessons/[lessonId]/...` are shared by both products (set editing, regenerate, status,
answers PDF) — the homework-draft id is passed as `lessonId`.

### 0.2 Enums (exact values)

| Enum | Values | Notes |
|---|---|---|
| `LessonKind` | `LESSON`, `HOMEWORK` | |
| `LessonStatus` (stored) | `PLANNED`, `ACTIVE`, `FINISHED` | Stored `FINISHED` = "results have been finalized" marker. The displayed status is **derived** (§4.1). |
| `DerivedLessonStatus` | `PLANNED`, `ACTIVE`, `FINISHED` | What every screen shows. |
| `LessonItemResult` | `SOLVED`, `PARTIAL`, `NOT_SOLVED`, `SKIPPED`, or `null` | `null` = not marked. |
| `AssignmentReason` | `NEW`, `REVIEW`, `GAP`, `DIAGNOSTIC` | The model only emits `NEW` or `GAP`; manual adds are `NEW`. UI has labels for `GAP`, `REVIEW`, `NEW`; anything else falls back to the `NEW` label. |
| `HomeworkNumberStatus` | `GREEN`, `YELLOW`, `RED`, or `null` | Per-student traffic light of a problem. |
| `AttendanceStatus` | `UNKNOWN`, `PRESENT`, `LATE`, `ABSENT`, `EXCUSED` | On `LessonParticipant`. |
| `SolutionCheckStatus` | `PENDING`, `CHECKING`, `DONE`, `FAILED` | Status of a student's live-lesson submission. |
| `SolutionVerdict` | `CORRECT`, `INCORRECT`, `UNCERTAIN`, or `null` | |
| `PlanErrorCode` | `unavailable`, `studentMissing`, `noCandidates`, `homeworkNoCandidates`, `homeworkParams`, `emptyPlan`, `failed`, `budgetExhausted`, `queueFull` | Stored in `LessonParticipant.planError` as `"plan-error:<code>"` (§4.4). |

### 0.3 Numeric limits (exact)

| Constant | Value | Where |
|---|---|---|
| Lesson duration | min `15`, max `240` minutes, default `60` | `MIN_DURATION_MINUTES`, `MAX_DURATION_MINUTES`, `normalizePlanParams` |
| Student speed | integer `1..10` or `null` ("not set") | `MIN_SPEED`, `MAX_SPEED`, `normalizeSpeed` (clamps) |
| Max students per lesson / per homework draft | `30` | `MAX_GROUP_SIZE` |
| Max problems in one part of a set (main or extra) on manual save | `40` each | `MAX_PLAN_ITEMS` |
| AI plan items cap (site setting) | lesson main: `lessonPlanMaxItems` default `40` (range 5..60); lesson extra: `max(2, ceil(lessonPlanMaxItems / 2))`; homework: `homeworkPlanMaxItems` default `40` (range 3..60) | `lib/site-settings.ts`, generators |
| Title length | `200` chars (trimmed, sliced) | `MAX_TITLE_LENGTH` |
| Teacher note for AI | `500` chars | `MAX_TEACHER_NOTE_LENGTH` |
| AI summary (`planSummary`) | max `400` chars | `MAX_SUMMARY_LENGTH` |
| AI item comment | max `200` chars | `MAX_COMMENT_LENGTH` |
| AI item minutes | `1..240` or `null` | `MAX_MODEL_MINUTES` |
| Homework daily minutes | min `15`, max `240`, default `60` | `MIN_DAILY_MINUTES`, `MAX_DAILY_MINUTES`, `DEFAULT_DAILY_MINUTES` |
| Homework days-until-deadline (display + budget) | clamped `1..60` | `daysUntil`, `MIN_HOMEWORK_DAYS`, `MAX_HOMEWORK_DAYS` |
| "Stale generation" threshold (client) | `15 min` since participant `createdAt` | `STALE_PLAN_MS` |
| Generation status polling | every `2000 ms` | `POLL_INTERVAL_MS` |
| Live-activity fallback polling | every `15000 ms` | `LIVE_POLL_INTERVAL_MS` |
| "now" tick on the board | every `30000 ms` | board `setInterval` |
| Undo-remove toast | `5000 ms` | `UNDO_REMOVE_MS` |
| Idle chip thresholds (site settings) | warn `8` min (range 1..120), alert `15` min (range 1..240) | `lessonIdleWarnMinutes`, `lessonIdleAlertMinutes` |
| Lazy finalization window | `48 h` after lesson end | `LESSON_FINALIZE_WINDOW_MS` |
| AI plan global daily budget | `aiPlanDailyLimit` default `300` generations / 24 h (1 generation = 1 student) | `lib/plan-budget.ts` |
| AI plan queue cap | `150` queued+active generations | `MAX_PLAN_QUEUE` |
| AI plan concurrency | `lessonPlanConcurrency` default `3` (range 1..10) | queue |
| Topic suggestions in the create form | max `8` | `MAX_TOPIC_SUGGESTIONS` |
| Photos per live submission (student side, shown on the board) | max `3` | `LESSON_SUBMISSION_MAX_PHOTOS` |

### 0.4 Roles and ownership

- All screens/routes in this subsystem are for `TEACHER` and `DEVELOPER`. `STUDENT` → 401 JSON on API
  routes, redirect on pages.
- `TEACHER` sees and mutates only lessons/drafts where `Lesson.teacherId === user.id`, and inside them only
  participants whose student still has `teacherId === user.id` (a student transferred to another teacher
  disappears from the previous owner's board; mutations on that participant return 404).
- `DEVELOPER` sees and mutates **all** lessons/drafts of all teachers (no owner filter). A lesson created by a
  developer gets `teacherId = developer.id`.
- Somebody else's lesson is indistinguishable from a missing one (404).
- On the site the developer uses the same pages under the URL prefix `/developer/...` (rewritten to
  `/teacher/...`); links inside the pages use `prefix = "/developer" | "/teacher"`. API paths are always
  `/api/teacher/...`.

### 0.5 "AI available" flag

`aiAvailable = settings.aiEnabled && settings.lessonPlanEnabled && modelConfigured` for lessons, and
`settings.aiEnabled && settings.homeworkPlanEnabled && modelConfigured` for homework drafts. It is computed
on the server per page render and passed to the screens. The mobile API must expose it (§6, `GET .../meta`).

---

## 1. Screens

Site navigation: teacher top nav item `dict.nav.teacher.lessons` ("занятия" / "lessons") → `/teacher/lessons`.
The nav item is highlighted for both `/teacher/lessons*` and `/teacher/homework-plans*` (single section
"занятия"). Every page header also carries the global problem-number search (`ShbzNumberSearch`, endpoint
`/api/teacher/topics/find-number`) — belongs to another subsystem; on mobile it is a header search icon.

### 1.1 Lessons list — `/teacher/lessons` (`/developer/lessons`)

**Roles:** TEACHER, DEVELOPER. **Purpose:** all lesson plans (`kind = LESSON`) of the teacher, entry to
creating a lesson.

**On load (server side-effect):** `finalizeRecentlyFinishedLessons({ teacherId })` (for DEVELOPER: no scope →
all lessons). See §4.6. The mock must run the same lazy finalization before returning the list.

**Layout, top to bottom**

1. Header: kicker `dict.planner.lessonsList.kicker` ("Уроки" / "Lessons"), title
   `dict.planner.lessonsList.title` ("Уроки с ИИ-подбором" / "Lessons with AI selection").
2. Section `dict.planner.lessonsList.composeTitle` ("Составить занятие" / "Compose a lesson") with one dashed
   "empty lesson" card (`LessonComposeCard`): a round "+" badge, title
   `dict.planner.lessonComposeCard.title` ("Составить занятие" / "Compose a lesson"), hint:
   - no lessons at all: `lessonsList.hintEmpty` ("Уроков пока нет — выберите группу или ученика, и ИИ соберёт
     набор задач каждому." / "No lessons yet — pick a group or a student and AI will build a problem set for
     each.")
   - otherwise: `lessonsList.hint` ("Пустое занятие: выберите группу или ученика — ИИ-подбор или ручной выбор
     номеров." / "Empty lesson: pick a group or a student — AI selection or manual choice of problems.")
   Tap → screen 1.2 (target chooser). This card is the **only** create entry on this screen (owner rule: no
   extra buttons).
3. If there is at least one lesson: up to three sections, each rendered only when non-empty, heading
   `"{title} · {count}"`:
   - `lessonsList.today` ("Сегодня" / "Today") — lessons whose **lesson date** is the same calendar day as
     now; sorted by lesson date ascending.
   - `lessonsList.upcoming` ("Ближайшие" / "Upcoming") — not in "today" and derived status ≠ `FINISHED`;
     ascending.
   - `lessonsList.past` ("Прошедшие" / "Past") — not in "today" and derived status = `FINISHED`; descending.
   - **Lesson date** = `startsAt ?? createdAt`. (Consequence: an unscheduled, never-finished lesson created
     last week sits in "Upcoming".)
4. Lesson card (one row):
   - Title (`lesson.title`, truncated to one line).
   - Meta line: `formatDateTime(startsAt ?? createdAt)` + ` · {groupName}` **or** ` · {soloStudentName}` (solo
     = no group and exactly one participant) + ` · ` `common.minutesShort` ("{n} мин" / "{n} min") + ` · `
     `common.studentForms` plural ("{n} ученик/ученика/учеников" / "{n} student/students").
   - Chips (right side, in this order):
     - if `failedCount > 0`: danger chip `common.errorsCount` ("ошибок: {n}" / "errors: {n}").
     - if `readyCount < participantsCount`: yellow chip `lessonsList.selectionInProgress`
       ("подбор идёт {ready} / {total}" / "selecting {ready} / {total}"). Note: participants with a
       `planError` are not "ready", so this chip also stays visible for failed plans.
     - neutral status chip: `dict.planner.lessonStatus[status]` — PLANNED "Запланирован"/"Planned", ACTIVE
       "Идёт"/"In progress", FINISHED "Завершён"/"Finished".
   - Buttons: `common.open` ("Открыть" / "Open") → 1.3; `common.pdf` ("PDF") → downloads
     `/teacher/lessons/{id}/pdf` (§3.12); delete button `lessonDelete.label` ("Удалить" / "Delete") →
     confirm dialog: title `lessonDelete.title` ("Удалить урок?" / "Delete lesson?"), description
     `lessonDelete.description` ("Занятие и все подобранные наборы задач будут удалены. Проставленные итоги
     по номерам у учеников сохранятся. Это действие нельзя отменить." / "The lesson and all selected problem
     sets will be deleted. Results already marked on students' problems will be kept. This cannot be
     undone."), buttons `dict.topics.widgets.confirm.confirm` ("Да, удалить" / "Yes, delete"; pending
     "Удаляем…" / "Deleting…") and `...confirm.cancel` ("Отмена" / "Cancel"). On confirm →
     `DELETE /api/teacher/lessons/{id}`; success → list refresh; failure → small red text under the button
     with server `error` or `lessonDelete.failed` ("Не удалось удалить урок." / "Could not delete the
     lesson.").
   - The list item does **not** show `resultsMarked / resultsTotal` (those fields exist in the view model but
     the chip was removed by an owner decision).

**States:** no explicit loading skeleton on the site (server-rendered); empty state = only the compose card
with `hintEmpty`. If the lesson tables are missing the data function returns `[]`.

**Phone translation:** root screen of the teacher tab "Занятия". Segmented control at the top
`Уроки | Черновики ДЗ` (the site has no visible link to the homework-plans list, see §7.1). `SectionList`
with sticky section headers; the compose card as the list header (or a FAB "+" that opens 1.2). Card tap =
open; PDF and Delete go into a swipe action / overflow ("⋯") menu; delete confirmation = native alert /
bottom sheet. Pull-to-refresh re-fetches (and triggers lazy finalization server-side).

### 1.2 New lesson — `/teacher/lessons/new[?groupId=|?studentId=]`

**Roles:** TEACHER, DEVELOPER. Three modes depending on query params.

#### 1.2.a Target chooser (no params)

Header: kicker `lessonNew.kicker` ("Занятия" / "Lessons"), title `lessonNew.title` ("Новый урок" / "New
lesson").

- Section `lessonNew.forGroup` ("Для группы" / "For a group"): one outline button per group of the teacher
  (DEVELOPER: all groups), sorted by name, label `"{group.name} · {membersCount}"` → mode b. Empty:
  `lessonNew.noGroups` ("Групп пока нет — создайте её в разделе «группы»." / "No groups yet — create one in
  the "groups" section.").
- Section `lessonNew.forStudent` ("Для одного ученика" / "For one student"): one button per student of the
  teacher (DEVELOPER: all students), sorted by name → mode c. Empty: `lessonNew.noStudents` ("Учеников пока
  нет — создайте аккаунт в разделе «ученики»." / "No students yet — create an account in the "students"
  section.").

**Phone:** a screen (or bottom sheet) with two grouped lists "Groups" / "Students" with a search field.

#### 1.2.b Group lesson (`?groupId=`)

Group not found / not owned → 404. Header kicker = group name, title `lessonNew.title`.

- If `!aiAvailable`: yellow banner `lessonNew.aiUnavailable` ("ИИ-подбор сейчас недоступен (модель выключена
  или не настроена). Урок создастся пустым — задания можно добавить вручную." / "AI selection is unavailable
  right now (the model is off or not configured). The lesson will be created empty — you can add problems
  manually.").
- Card with the **AI create form** (`TeacherLessonCreateForm`, described in 1.2.d) with
  `groupId`, `members = group.members (id, name, speed)` sorted by name.
- The group mode has no manual-compose grid.

#### 1.2.c Individual lesson (`?studentId=`)

Student not found / not own → 404. Header kicker = student name. Same AI-unavailable banner. Card with a
**mode switch** (`TeacherLessonComposeSwitch`), a two-button segmented control (aria
`lessonCompose.modeAria`):

- `lessonCompose.modeAi` ("ИИ-подбор" / "AI selection") — disabled when `!aiAvailable` (tooltip
  `lessonCompose.aiUnavailable` "ИИ-подбор сейчас недоступен" / "AI selection is unavailable right now").
- `lessonCompose.modeManual` ("Выбрать вручную" / "Pick manually").
- Initial mode: `ai` if `aiAvailable`, else `manual`.
- AI mode → the AI create form (1.2.d) with `members = [student]` and no `groupId`.
- Manual mode → the manual compose grid (1.2.e).

(If the student detail fails to load, the page falls back to the plain AI form without the switch.)

The same switch is also embedded in the student page tab "Занятия" → "Составить занятие"
(`/teacher/students/{id}/lessons/new`, documented in the teacher-students subsystem); it posts to the same
endpoint.

#### 1.2.d AI create form (`TeacherLessonCreateForm`)

Fields, top to bottom:

| Field | Label (ru / en) | Control | Default | Client constraints |
|---|---|---|---|---|
| `title` | `lessonCreateForm.titleLabel` "Название урока" / "Lesson title" | text input, placeholder `titlePlaceholder` "Пусто — «Занятие от <дата>»" / "Empty — "Lesson on <date>"" | `""` | `maxLength 200`; optional |
| `durationMinutes` | `durationLabel` "Длительность, минут" / "Duration, minutes" | number input | `"60"` | `min 15`, `max 240`, `step 5`; client sends `Number(value) || 60` |
| `startsAt` | `dateTimeLabel` "Дата и время урока" / "Lesson date and time" | date-time picker, placeholder `dateTimePlaceholder` "Выбрать дату и время" / "Pick date and time" | empty | optional; clearable |
| `topicIds` | `topicsLabel` "Темы занятия" / "Lesson topics" | type-ahead combobox (see below) + selected chips | `[]` | optional, multi |
| `teacherNote` | `noteLabel` "Комментарий для ИИ" / "Note for AI" + live counter `"{len} / 500"` | textarea 2 rows, placeholder `notePlaceholder` "Например: разобрать логарифмы, без стереометрии" / "For example: go over logarithms, no solid geometry" | `""` | `maxLength 500` |
| `studentIds` + `speeds` | `studentsLabel` "Ученики и скорость (1–10)" / "Students and speed (1–10)" | one row per member: name, speed select, checkbox | all members checked; speed = member's profile speed or "" | at least one checked |

- Topic combobox: typing filters all topics (case-insensitive substring, `ru-RU` lowercase) excluding already
  selected ones, shows at most **8** suggestions; empty query shows no list at all. No match → panel with
  `common.nothingFound` ("Ничего не нашлось" / "Nothing found"). Selecting adds a green chip with "×"
  (aria `removeTopic` "Убрать тему «{title}»"). Helper text under the field: `topicsSelected` ("Выбрано тем:
  {n}" / "Topics selected: {n}") when any selected, else `topicsHint` ("Можно не выбирать ничего — тогда ИИ
  сам определит, где ученик остановился." / "You can leave this empty — AI will work out where the student
  stopped."). Enter inside this field never submits the form.
- Speed select options: `""` → `speedNotSet` ("Не указана" / "Not set"), then `"1"`…`"10"`. Sent as
  `null` or a number. Only speeds of **checked** students are sent.
- Submit button: `lessonCreateForm.submit` ("Подобрать задания" / "Select problems"); while pending: spinner +
  `creating` ("Создаём урок…" / "Creating lesson…"). Disabled when pending or no student is checked.
- Error banner above the form (red): server `error`, or `createFailed` ("Не удалось создать урок. Попробуйте
  ещё раз." / "Could not create the lesson. Please try again."), or on network exception
  `common.networkError` ("Сеть недоступна. Попробуйте ещё раз." / "Network unavailable. Please try again.").
- Submit → `POST /api/teacher/lessons` (§3.1). **If the response JSON contains `lessonId` (any HTTP status,
  including 503 "AI unavailable")** → navigate to the lesson board (1.3). For an individual lesson the site
  appends `?studentId={id}` to the URL (purely cosmetic: keeps the "ученики" nav tab highlighted).

**Phone:** full-screen form in the "Занятия" stack. Duration = stepper (15…240, step 5). Date-time = native
picker. Topics = modal multi-select with search. Student rows = checkbox + compact speed picker (wheel /
action sheet with "Не указана", 1…10). Sticky bottom primary button.

#### 1.2.e Manual compose grid (`TeacherLessonComposeBoard`, individual lesson only)

- Topic select (label `common.topic` "Тема" / "Topic"); option label plural
  `lessonCompose.topicOptionForms` ("{title} · {n} номер/номера/номеров" / "{title} · {n} problem/problems").
  Default: first topic. **Changing the topic clears the selection** (a manually composed lesson starts with
  numbers of one topic only; more can be added later on the board).
- Toolbar panel:
  - chip `lessonCompose.selected` ("Выбрано: {n}" / "Selected: {n}") — green when n > 0;
  - duration number input (`min 15`, `max 240`, `step 5`, default `"60"`, placeholder
    `durationPlaceholder` "Длительность, мин" / "Duration, min");
  - date-time picker (placeholder `dateTimePlaceholder` "Дата и время урока" / "Lesson date and time"),
    optional;
  - primary button `lessonCompose.compose` ("Составить занятие" / "Compose lesson"); while saving
    `composing` ("Составляем…" / "Composing…"); disabled when nothing selected or saving;
  - secondary link `lessonCompose.aiPick` ("Подобрать ИИ" / "AI selection") → `/teacher/lessons/new?studentId=`
    (i.e. back to AI mode);
  - when selection > 0: secondary button `lessonCompose.clearSelection` ("Снять выбор" / "Clear selection");
  - hint `lessonCompose.steps` ("1. Кликните по номерам ниже · 2. Укажите длительность · 3. Нажмите
    «Составить занятие». Итоги по каждому номеру отметите на доске занятия.").
- Grid (2 columns on desktop) of `NumberSelectCard` for every number of the selected topic: check mark,
  student's traffic-light badge (`status` GREEN/YELLOW/RED/none), title
  `dict.topics.widgets.numberLabel` ("№ {number}" / "No. {number}"), the problem statement rendered from
  LaTeX (`conditionLatex`, full, never collapsed), footnote `lessonCompose.alreadyInLesson` ("Уже был на
  занятии" / "Already used in a lesson") when the number has ever been in any lesson set of this student
  (`inLesson`). Tapping the card toggles selection; the selection order is the order in the lesson.
- Statements of topics are lazy-loaded per topic from `GET /api/teacher/topics/conditions?topicId=`
  (→ `{ conditions: Record<numberId, string | null> }`, rate limit 120/min); the grid works without them.
- Validation: empty selection → `lessonCompose.pickNumbers` ("Выберите номера для занятия." / "Pick problems
  for the lesson."). Failure → server `error` or `composeFailed` ("Не удалось составить занятие." / "Could not
  compose the lesson.").
- Submit → `POST /api/teacher/lessons` with
  `{ studentIds: [studentId], durationMinutes, startsAt?, topicIds: [], teacherNote: "", skipPlan: true, numberIds: [...] }`
  → navigate to board `…/lessons/{lessonId}?studentId={studentId}`.

**Phone:** topic picker at the top, 1-column list of selectable cards (LaTeX via KaTeX in a WebView or
`react-native-katex`-style renderer), sticky bottom bar with "Выбрано: n", duration stepper, date-time and
the primary button.

### 1.3 Lesson board — `/teacher/lessons/[lessonId]`

**Roles:** TEACHER (owner), DEVELOPER. 404 when not found/not owned.

**On load (server side-effect):** `finalizeRecentlyFinishedLessons({ lessonId, teacherId? })` (§4.6).

**Header:** kicker `"{group.name ?? dict.planner.lessonDetail.fallbackKicker} · {formatDateTime(startsAt ?? createdAt)} · {n} мин"`
(`fallbackKicker` = "Урок" / "Lesson"), title = lesson title.

**Toolbar row** (left group wraps; delete is pinned right):

1. Status pill `dict.planner.lessonStatus[status]`; accent-filled when `ACTIVE`, neutral otherwise.
2. Only when `status === "ACTIVE"`: button `lessonBoard.finish` ("Завершить урок" / "Finish lesson"); while
   pending `finishing` ("Завершаем…" / "Finishing…") → `POST …/finish` (§3.5). No confirmation dialog on the
   site. Failure → red notice with server `error` or `finishFailed` ("Не удалось завершить урок.").
3. `lessonBoard.downloadPdf` ("Скачать PDF" / "Download PDF") → `GET /teacher/lessons/{id}/pdf`.
4. `lessonBoard.print` ("Для печати" / "Print version") → `GET /teacher/lessons/{id}/print` (HTML, new tab).
5. `lessonBoard.answersPdf` ("Ответы (PDF)" / "Answers (PDF)") → `GET /teacher/lessons/{id}/pdf?answers=1`.
6. `lessonBoard.issueHomework` ("Выдать ДЗ по итогам" / "Assign homework from results") →
   `/teacher/homework-plans/new?lessonId={id}` (screen 1.5).
7. Hint `lessonBoard.hotkeysHint` ("Отметки: клавиши 1/2/3, переход — ↓") — desktop only, omit on mobile.
8. While any participant is pending (see below): spinner + `common.readyOf` ("Готово {ready} из {total}…" /
   "Ready {ready} of {total}…") where `ready` = participants with `planGeneratedAt`.
9. Right: danger button `lessonBoard.delete` ("Удалить урок" / "Delete lesson") → confirm dialog: title
   `deleteTitle` ("Удалить урок?" / "Delete lesson?"), description `deleteDescription` ("Занятие и все
   подобранные наборы задач будут удалены. Это действие нельзя отменить." / "The lesson and all selected
   problem sets will be deleted. This cannot be undone.") → `DELETE /api/teacher/lessons/{id}` → navigate to
   the lessons list. Failure → red notice (`deleteFailed` "Не удалось удалить урок.").

**Banners under the toolbar (in order):**

- **No time banner** — when `lesson.startsAt === null && status !== "FINISHED"`: text `lessonBoard.noTime`
  ("У урока нет времени — он не начнётся и не появится у учеников во вкладке «Урок»." / "The lesson has no
  time — it will not start and will not appear in students' "Lesson" tab."), a date-time picker (placeholder
  `dateTimeAria` "Дата и время урока") and a button `lessonBoard.schedule` ("Назначить время" / "Set time";
  pending `scheduling` "Сохраняем…"), disabled until a value is picked → `PATCH /api/teacher/lessons/{id}`
  `{ startsAt: ISO }` (§3.3). Failure → red notice (`scheduleFailed` "Не удалось назначить время урока.").
  (The site shows no control to re-schedule a lesson that already has a time, although the API allows it.)
- **AI unavailable banner** — when `!aiAvailable`: `lessonBoard.aiUnavailable` ("ИИ-подбор недоступен,
  соберите урок вручную: добавляйте номера в карточках учеников." / "AI selection is unavailable — build the
  lesson manually: add problems in student cards.").
- **Notice** — one transient success/error message (`aria-live`), replaced by the next action.

**Participant cards** (one per participant, sorted by student name). For each participant derive:

- `pending` = `!planGeneratedAt && !planError` **and not stale**;
- `stale` = `!planGeneratedAt && !planError && now - createdAt > 15 min`;
- `mainItems` = items with `isExtra === false`, `extraItems` = `isExtra === true` (both in `order`);
- `submittedItems` = items that have a latest submission;
- `lastActivityAt` = max(`joinedAt`, every latest submission's `submittedAt`) or `null`;
- `idle` (only when lesson `ACTIVE` and `startsAt` set) = `computeIdleLevel(...)` (§4.8);
- `spentMinutes` per submitted item (only when `startsAt` set) = `computeSpentMinutes(...)` (§4.8).

Card content, top to bottom:

1. Sticky card header: student name. Only while `ACTIVE`:
   - chip `lessonBoard.submitted` ("сдано {done} / {total}" / "submitted {done} / {total}") — `done` =
     number of items with a submission, `total` = all items (main + extra);
   - `lessonBoard.inClassSince` ("в классе с {time}" / "in class since {time}", `HH:mm`, time zone
     `Europe/Moscow`) when `joinedAt` is set, else `lessonBoard.notOpened` ("ещё не открыл урок" / "has not
     opened the lesson yet");
   - idle chip when `idle.level !== "ok"`: `lessonBoard.noSubmissions` ("нет сдач {n} мин" / "no submissions
     for {n} min"); `warn` = amber, `alert` = danger colours, and at `alert` the whole card gets a danger
     border.
   (There is intentionally no per-participant "Regenerate" button on the lesson board — only "Retry" on
   error/stale.)
2. `pending`: spinner + `lessonBoard.aiSelecting` ("ИИ подбирает задания…" / "AI is selecting problems…").
3. `stale`: red notice `common.planLost` ("План не собрался: задача потерялась при перезапуске сервера.
   Нажмите «Повторить» — соберём заново." / "The plan was not built: the job was lost on a server restart.
   Press "Retry" to build it again.") + link-button `common.retry` ("Повторить" / "Retry") → regenerate
   (§3.7).
4. `planError`: red notice with `planErrorText(planError, dict.planner.planErrors)` (§4.4) + `common.retry`
   (only when `aiAvailable`).
5. `planSummary` (when not null): soft grey paragraph with the AI explanation of the set.
6. **Main part** — heading `lessonBoard.mainPart` ("Осн. задания" / "Main part"), ordered list of item rows.
   If there are no main items and not pending: `common.noTasksYet` ("Задач пока нет — добавьте вручную или
   запустите подбор." / "No problems yet — add them manually or run AI selection.").
7. **Extra part** (only if any) — heading `lessonBoard.extraPart` ("Доп. задания" / "Extra part"); numbering
   continues after the main part (`mainItems.length + index + 1`).
8. **Manual add row** (`LessonManualAdd`): label `lessonManualAdd.label` ("Добавить номер" / "Add problem"),
   topic select (all topics of the bank, default first), number select (numbers of that topic **not already
   in this participant's set**, placeholder `common.pickNumber` "Выберите номер" / "Pick a problem", option
   label `common.numberSign` "№ {n}" / "No. {n}"), buttons `lessonManualAdd.toMain` ("В основную" / "To main")
   and `lessonManualAdd.toExtra` ("В доп." / "To extra"); both disabled until a number is picked or while the
   participant is busy. Action → `PATCH …/items` with the current id lists plus the new id appended to the
   chosen part (§3.6).

**Item row** (same for main and extra unless noted):

- Line 1: ordinal `"{n}."`, `common.numberSign` ("№ {number}"), reason chip
  `dict.planner.reasons[reason]` (GAP "Пробел"/"Gap", REVIEW "Повторение"/"Review", NEW "Новое"/"New";
  neutral colour on this board). **Main items only:** when the item has no `result` and the student has a
  status for this number → status chip `dict.planner.itemStatus[studentStatus]` (GREEN "решено"/"solved",
  YELLOW "с ошибками"/"with mistakes", RED "не решено"/"not solved") in traffic-light colours.
- Result toggle (`ResultToggle`, 4 buttons, labels `dict.students.lessonResult`): `SOLVED` "решил"/"solved"
  (green), `PARTIAL` "с ошибками"/"with mistakes" (yellow), `NOT_SOLVED` "не решил"/"not solved" (red),
  `SKIPPED` "не успел"/"not reached" (neutral). The active button is highlighted; **tapping the active button
  clears the result (`null`)**. On phones the site already renders it as a 2×2 grid, min touch height 44 px.
  Disabled while the participant is busy. Action → `PATCH …/items/{itemId}/result` (§3.8) with optimistic
  update; on failure the error text appears inside the row (server `error` or `lessonBoard.saveResultFailed`
  "Не удалось сохранить итог." / "Could not save the result.") and the board re-fetches.
- Remove button "×" (aria `common.removeNumber` "Убрать № {n}") → immediately `PATCH …/items` without that
  number and shows a bottom toast `lessonBoard.removedFromSet` ("№ {n} убран из набора" / "No. {n} removed
  from the set") with `common.undo` ("Отменить" / "Undo") for 5 s; Undo re-sends the previous id lists
  (the re-created row is a new item: reason `NEW`, no result). Removing a number that already has a student
  submission fails with 409 (§3.6) — shown in the notice.
- Statement: `conditionLatex` rendered with KaTeX (when not null).
- Submission info line (only when the item has a latest submission):
  - `status` `PENDING` or `CHECKING` → spinner + `lessonBoard.checking` ("проверяется" / "checking");
  - otherwise `lessonBoard.submittedAgo` ("сдал {ago}" / "submitted {ago}") where `ago` =
    `lessonBoard.justNow` ("только что" / "just now") for 0 minutes or `lessonBoard.minutesAgo` ("{n} мин
    назад" / "{n} min ago"); plus ` · ` `lessonBoard.minutesOnNumber` ("{n} мин на номер" / "{n} min on the
    problem") when spent minutes are known; absolute time in a tooltip;
  - `status === "FAILED"` → red `lessonBoard.checkFailed` ("проверка не удалась" / "check failed");
  - `status === "DONE" && verdict === "UNCERTAIN"` → neutral chip `lessonBoard.uncertain` ("не распознано —
    отметьте вручную" / "not recognised — mark manually");
  - `status === "DONE" && injectionSuspected` → chip `lessonBoard.injectionSuspected` ("надпись-инструкция на
    фото" / "instruction text on the photo") + `": {injectionNote}"` when present + ` — `
    `lessonBoard.injectionCheckYourself` ("проверьте сами" / "check it yourself"). Teacher-only information.
  - one link per photo: `lessonBoard.photo` ("фото {n}" / "photo {n}") → `/files/{fileId}` (protected file
    route; images PNG/JPG).
- "Status history" disclosure (`ProgressStatusHistory`, `dict.topics.history.show` "История статуса" /
  "Status history") — lazy `GET /api/teacher/progress-history?studentId=&homeworkNumberId=[&cursor=]`, 20
  entries per page; documented in the progress subsystem. Re-fetches after each result change.
- `item.minutes` and `item.comment` are delivered to the board but **not rendered** on the lesson board.

**Loading / empty / error states:** board data arrives fully rendered; generation progress is the only
"loading" state (spinners per participant and the "Готово X из Y…" counter). A lesson with zero visible
participants renders just the toolbar.

**Phone translation:**

- Screen in the "Занятия" stack. Header: title + subtitle (kicker). Status pill + primary contextual action
  (Finish while ACTIVE) below the header. Secondary actions (Download PDF, Print version, Answers PDF, Assign
  homework from results, Delete lesson) in a header "⋯" action sheet.
- Participants: for one participant show the card directly; for groups use a vertical list of collapsible
  cards (or a horizontal student pager) with the live chips in the collapsed header so idle alerts are
  visible at a glance; sort stays by name.
- Item row = card with number + chips, 2×2 result grid, statement, submission line, photo thumbnails (open
  in a native image viewer with auth header), "История статуса" as an expandable section / bottom sheet.
- Remove = swipe-to-delete or "×" with a snackbar "Undo" (5 s).
- Manual add = bottom sheet: topic picker → number picker → two buttons "В основную" / "В доп.".
- Schedule banner = inline card with native date-time picker.
- Keyboard hotkeys (1/2/3/4, arrows) are dropped.

### 1.4 Lesson handout: PDF / print — `/teacher/lessons/[lessonId]/pdf`, `/teacher/lessons/[lessonId]/print`

Not screens but downloadable documents (GET route handlers, see §3.12). Query params: `studentId` (only this
participant), `answers=1` (answer sheet instead of the handout). For `kind = HOMEWORK` only `answers=1` is
allowed. On mobile: download with the auth token and hand over to the share sheet / system PDF viewer
(`expo-file-system` + `expo-sharing`), or `expo-print` for the HTML version.

### 1.5 Homework drafts list — `/teacher/homework-plans`

**Roles:** TEACHER, DEVELOPER. **Purpose:** all AI homework drafts (`kind = HOMEWORK`), newest first
(`createdAt desc`).

Header: kicker `homeworkPlans.list.kicker` ("Домашние задания" / "Homework"), title
`homeworkPlans.list.title` ("ИИ-выдача ДЗ" / "AI homework assignment").

- Empty state card: `homeworkPlans.list.emptyTitle` ("Черновиков ДЗ пока нет." / "No homework drafts yet.")
  + `emptyHint` ("Создайте черновик со страницы урока («Выдать ДЗ по итогам занятия»), группы или ученика."
  / "Create a draft from a lesson page ("Assign homework from results"), a group or a student."). There is
  **no create button** on this screen.
- Draft card: title; meta line `formatDateTime(createdAt)` + ` · {topicTitle}` + ` · {groupName}` + ` · `
  `homeworkPlans.list.deadline` ("дедлайн {date}" / "deadline {date}") — each part only when present.
  Chips: danger `common.errorsCount` when `failedCount > 0`; `homeworkPlans.list.issuedOf` ("выдано {issued}
  из {total}" / "assigned {issued} of {total}") — green when `issuedCount === participantsCount &&
  participantsCount > 0`, yellow otherwise. Button `common.open` → 1.7.

**Phone:** second segment of the "Занятия" tab; `FlatList` of cards; pull-to-refresh.

### 1.6 New homework draft — `/teacher/homework-plans/new?lessonId=|groupId=|studentId=`

**Roles:** TEACHER, DEVELOPER. Without any of the three params → 404. Entry points on the site:

- lesson board button "Выдать ДЗ по итогам" → `?lessonId={id}`;
- student page tab "Занятия", per lesson → `?lessonId={id}&studentId={id}` (homework only for that student);
- group page button → `?groupId={id}`;
- student "assign homework" board link ("pick with AI") → `?studentId={id}`.

Resolution rules:

| Param | kicker | members | default topic | default title | groupId | sourceLessonId |
|---|---|---|---|---|---|---|
| `lessonId` (must be own `kind = LESSON`, else 404) | `homeworkPlans.new.afterLesson` ("По итогам занятия «{title}»" / "From lesson "{title}"") | lesson participants sorted by name; if `studentId` is also given → only that participant (404 if not a participant) | **dominant topic** of all items of all participants of the lesson (`pickDominantTopicId`: most items; tie → first encountered) | `homeworkPlans.new.defaultTitle` ("ДЗ по итогам «{title}»" / "Homework from "{title}"") | lesson's `groupId` | lesson id |
| `groupId` | group name | group members (id, name) | — (first topic) | "" | group id | null |
| `studentId` | student name | that student | — (first topic) | "" | null | null |

Header title: `homeworkPlans.new.title` ("Новое ДЗ" / "New homework"); default kicker
`homeworkPlans.new.kicker` ("Домашнее задание" / "Homework").

If `members` is empty → card with `homeworkPlans.new.nobody` ("Некому выдавать: в группе нет учеников." / "No
one to assign to: the group has no students.") and no form.

**Form (`TeacherHomeworkPlanCreateForm`)**

| Field | Label | Control | Default | Rules |
|---|---|---|---|---|
| `topicId` | `createForm.topicLabel` "Тема ДЗ" / "Homework topic" + hint `topicHint` "всегда одна" / "always one" | single select over all topics (ordered by `displayOrder`, `createdAt`) | `defaultTopicId ?? topics[0].id` | required; client error `pickTopic` "Выберите тему." / "Pick a topic." |
| `deadlineAt` | `nextLessonLabel` "Дата следующего занятия" / "Next lesson date" + hint `nextLessonHint` "станет дедлайном" / "becomes the deadline" | date-time picker (placeholder `dateTimePlaceholder` "Дата и время" / "Date and time") | empty | required; client error `pickDeadline` "Укажите дату следующего занятия — она станет дедлайном." / "Set the date of the next lesson — it becomes the deadline."; server requires it to be in the future |
| `dailyMinutes` | `dailyMinutesLabel` "Минут в день" / "Minutes per day" + hint `dailyMinutesHint` "бюджет = минуты × дни до дедлайна" / "budget = minutes × days until the deadline" | number input | `"60"` | `min 15`, `max 240`, `step 5`; client sends `Number(value) || undefined` |
| `teacherNote` | `noteLabel` "Комментарий для ИИ" / "Note for AI" + counter `"{len} / 500"` | textarea, placeholder `notePlaceholder` "Например: закрепить дискриминант, без задач с параметром" / "For example: reinforce the discriminant, no problems with a parameter" | `""` | `maxLength 500` |
| `studentIds` | `studentsLabel` "Ученики" / "Students" | checkbox per member | all checked | at least one |

- There is **no title field**: the client sends `title = defaultTitle` (lesson-derived) or nothing; the
  server then generates `apiPlanner.homeworkPlans.defaultTitle` ("ДЗ по теме «{topic}» до {date}" /
  "Homework on "{topic}" due {date}"), `{date}` = `formatDate(deadlineAt, locale)`.
- No speed selects here.
- Submit: `createForm.submit` ("Подобрать ДЗ" / "Select homework"); pending `creating` ("Создаём черновик…" /
  "Creating draft…"); disabled when pending or no student is checked.
- Submit → `POST /api/teacher/homework-plans` (§3.13). **If the response JSON contains `planId` (any status,
  including 503)** → navigate to 1.7 (site appends `?studentId=` when exactly one student is selected —
  cosmetic). Else error banner: server `error` / `createForm.createFailed` ("Не удалось создать черновик.
  Попробуйте ещё раз.") / `common.networkError`.

**Phone:** full-screen form pushed from the lesson board / group / student screens.

### 1.7 Homework draft board — `/teacher/homework-plans/[planId]`

**Roles:** TEACHER (owner), DEVELOPER. 404 when the id is not a `HOMEWORK` draft, has no `topicId`, the topic
no longer exists, or it is not owned.

**Header:** kicker `"{topic.title} · {deadlineLabel}{ · group.name}"` where `deadlineLabel` =
`plural(locale, daysUntil(deadlineAt, now), homeworkPlans.detail.deadlineForms)` formatted with `{date}`
("дедлайн {date} · до следующего занятия — {n} день/дня/дней" / "deadline {date} · {n} day(s) until the next
lesson"; `n` clamped to 1..60) or `homeworkPlans.detail.noDeadline` ("без дедлайна" / "no deadline"); title =
draft title.

If the draft was created from a lesson (`planParams.sourceLessonId`) and that lesson still exists and is
owned: outline button `homeworkPlans.detail.afterLesson` ("По итогам занятия «{title}»") → lesson board 1.3.

**Toolbar:**

1. Primary `homeworkPlans.board.issueAll` ("Выдать всем ({n})" / "Assign to all ({n})"), `n` =
   `issuableCount` = participants **not issued and with ≥ 1 item**. Disabled when `n === 0` or anything is
   busy → `POST …/issue` with `participantIds: []` (= all) (§3.15).
2. `homeworkPlans.board.answersPdf` ("Ответы (PDF)") → `GET /teacher/lessons/{planId}/pdf?answers=1`.
3. Green chip `board.issuedOf` ("выдано {issued} из {total}") when `issuedCount > 0`.
4. While pending: spinner + `common.readyOf`.
5. Right: danger `board.delete` ("Удалить черновик" / "Delete draft") → confirm: `deleteTitle` ("Удалить
   черновик ДЗ?" / "Delete homework draft?"), `deleteDescription` ("Черновик и подобранные наборы будут
   удалены. Уже выданные ДЗ останутся у учеников. Это действие нельзя отменить." / "The draft and selected
   sets will be deleted. Homework already assigned stays with the students. This cannot be undone.") →
   `DELETE /api/teacher/homework-plans/{planId}` → navigate to the drafts list. Failure notice
   `deleteFailed` ("Не удалось удалить черновик.").

**Banners:** AI-unavailable (`board.aiUnavailable` "ИИ-подбор недоступен, соберите ДЗ вручную: добавляйте
номера в карточках учеников."); notice (success/error); **issue failures list** — red box
`board.issueFailures` ("Не удалось выдать:" / "Could not assign:") + one line per failed student
`"{name}: {message}"`.

**Participant card** (sorted by student name). Derived flags:
`pending = !planGeneratedAt && !planError && !issuedAssignmentId` and not stale; `stale` = same condition and
`now - createdAt > 15 min`; `issued = Boolean(issuedAssignmentId)`.

- Header: student name; sub-line `board.tasksCount` ("задач: {n}" / "problems: {n}"). Only **main** items are
  shown (extra items are filtered out; homework has none anyway).
- If `issued`: green chip `board.issued` ("Выдано" / "Assigned") + outline link `board.studentHomework` ("ДЗ
  ученика" / "Student's homework") → `/teacher/students/{studentId}` (homework review tab). No editing
  controls.
- If not issued: outline `board.regenerate` ("Пересобрать" / "Regenerate") — disabled when busy, pending or
  `!aiAvailable` → regenerate (§3.7, same route as lessons with `lessonId = planId`); primary `board.issue`
  ("Выдать" / "Assign") — disabled when busy, pending or the set is empty → `POST …/issue` with
  `participantIds: [participant.id]`.
- `pending`: spinner + `board.aiSelecting` ("ИИ подбирает задание…" / "AI is selecting problems…").
- `stale`: `common.planLost` + `common.retry`.
- `planError && !issued`: `planErrorText(...)` + `common.retry` (when `aiAvailable`).
- `planSummary` paragraph.
- Item list (ordered): ordinal, `№ {number}`, reason chip (on this board coloured: GAP = yellow, REVIEW =
  neutral, NEW = green), status chip `dict.planner.itemStatus[studentStatus]` when the student has a status,
  `comment` (one line, truncated) when present, "×" remove (only when not issued; **no undo toast** here) →
  `PATCH /api/teacher/lessons/{planId}/participants/{pid}/items` with the remaining ids and
  `extraHomeworkNumberIds: []`; then the statement (`conditionLatex`).
  No result toggles — homework has no lesson results.
  Empty and not pending → `common.noTasksYet`.
- Manual add (only when not issued): label `board.addNumber` ("Добавить номер · {topic}" / "Add problem ·
  {topic}"), number select limited to **numbers of the draft's topic** not yet in the set, button
  `common.add` ("Добавить" / "Add") → `PATCH …/items` with the id appended.

**After issuing** (response handling): if `issued.length > 0` → success notice `board.issuedTo` ("ДЗ выдано:
{n}." / "Homework assigned to {n}.") with `{n}` = plural `board.issuedToForms` ("{n} ученику/ученикам" / "{n}
student(s)"); else if `failed.length === 0` → success notice `board.alreadyIssued` ("Все выбранные ученики
уже получили это ДЗ." / "All selected students already have this homework."); failures are listed in the red
box; then the board re-fetches. Request failure → error notice (server `error` / `board.issueFailed` "Не
удалось выдать ДЗ.").

**Phone:** same structure as the lesson board without result toggles: sticky bottom primary "Выдать всем
(n)"; per-participant cards with "Пересобрать" / "Выдать"; destructive and PDF actions in the header "⋯"
menu; failures as an inline error card.

### 1.8 Related surfaces owned by other subsystems (for cross-reference)

- Student page tab "Занятия" (`/teacher/students/{id}/lessons`, component `teacher-student-lessons.tsx`):
  shows the student's lessons collapsed, with the same result toggle, manual add, regenerate and "homework
  from results" link; it calls the same endpoints (§3.2, §3.6, §3.7, §3.8), polls `…/status` every
  **2500 ms**.
- Group page (`/teacher/groups/{id}`): buttons "compose lesson" (`/lessons/new?groupId=`), "assign homework"
  (`/homework-plans/new?groupId=`), group lessons list, and the attendance table that calls
  `PATCH …/participants/{pid}/attendance` (§3.9).
- Student "Lesson" tab (`/student/lesson`): the live side; it sets `joinedAt`, creates submissions and
  triggers automatic results that the teacher board displays.

---

## 2. View models (TypeScript)

Dates are `Date` in the server functions; over JSON they are ISO-8601 strings (as written below).

```ts
type ISODateTime = string;

type DerivedLessonStatus = "PLANNED" | "ACTIVE" | "FINISHED";
type LessonKind = "LESSON" | "HOMEWORK";
type LessonItemResult = "SOLVED" | "PARTIAL" | "NOT_SOLVED" | "SKIPPED";
type AssignmentReason = "NEW" | "REVIEW" | "GAP" | "DIAGNOSTIC";
type HomeworkNumberStatus = "GREEN" | "YELLOW" | "RED";
type AttendanceStatus = "UNKNOWN" | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
type SolutionCheckStatus = "PENDING" | "CHECKING" | "DONE" | "FAILED";
type SolutionVerdict = "CORRECT" | "INCORRECT" | "UNCERTAIN";
type PlanErrorCode =
  | "unavailable" | "studentMissing" | "noCandidates" | "homeworkNoCandidates"
  | "homeworkParams" | "emptyPlan" | "failed" | "budgetExhausted" | "queueFull";
/** Raw LessonParticipant.planError: "plan-error:<PlanErrorCode>", a frozen legacy Russian string, or null. */
type PlanErrorRaw = string | null;

// ---- 1.1 Lessons list (getTeacherLessons) ----
type LessonListItem = {
  id: string;
  title: string;
  status: DerivedLessonStatus;          // derived, see §4.1
  durationMinutes: number;
  createdAt: ISODateTime;
  startsAt: ISODateTime | null;
  groupId: string | null;
  groupName: string | null;
  soloStudentName: string | null;        // only when no group and exactly 1 participant
  resultsTotal: number;                  // all items of all participants (not rendered)
  resultsMarked: number;                 // items with result != null (not rendered)
  participantsCount: number;
  readyCount: number;                    // participants with planGeneratedAt
  failedCount: number;                   // participants with planError (any)
};

// ---- 1.2 New lesson ----
type LessonTargetChooser = {
  groups: Array<{ id: string; name: string; membersCount: number }>;   // sorted by name
  students: Array<{ id: string; name: string }>;                       // sorted by name
};
type LessonFormMember = { id: string; name: string; speed: number | null };  // speed 1..10
type TopicOption = { id: string; title: string };                    // ordered by displayOrder, createdAt

type LessonNewFormModel = {
  mode: "group" | "student";
  kicker: string;                         // group or student name
  groupId: string | null;
  members: LessonFormMember[];
  topics: TopicOption[];
  aiAvailable: boolean;
  /** Only for mode "student": grid for manual composition. */
  composeTopics: ComposeBoardTopic[] | null;
};
type ComposeBoardTopic = {
  id: string;
  title: string;
  totalNumbers: number;
  conditionsLoaded?: boolean;             // statements already inlined for this topic
  numbers: Array<{
    id: string;
    number: string;                       // string, leading zeros significant
    status: HomeworkNumberStatus | null;  // this student's status
    inLesson: boolean;                    // was ever in any lesson set of this student
    conditionLatex?: string | null;
  }>;
};

// ---- 1.3 Lesson board (getLessonDetail + page mapping) ----
type LessonBoardSubmission = {
  status: SolutionCheckStatus;
  verdict: SolutionVerdict | null;
  submittedAt: ISODateTime;
  checkedAt: ISODateTime | null;
  injectionSuspected: boolean;            // teacher-only
  injectionNote: string | null;           // teacher-only
  photoFileIds: string[];                 // 0..3, served via /files/{fileId}
};
type LessonBoardItem = {
  id: string;
  homeworkNumberId: string;
  number: string;
  conditionLatex: string | null;
  reason: AssignmentReason;
  minutes: number | null;                 // AI estimate, informational, not rendered on the lesson board
  comment: string | null;                 // AI comment (lesson: may be set; homework: always null)
  isExtra: boolean;
  result: LessonItemResult | null;
  topicTitle: string;
  studentStatus: HomeworkNumberStatus | null;   // participant's current status for this number
  submission: LessonBoardSubmission | null;      // latest submission for this item
};
type LessonBoardParticipant = {
  id: string;                             // participantId
  studentId: string;
  studentName: string;
  speed: number | null;                   // per-lesson override
  planSummary: string | null;             // <= 400 chars
  planGeneratedAt: ISODateTime | null;
  planError: PlanErrorRaw;
  createdAt: ISODateTime;                 // used for the 15-min stale rule
  joinedAt: ISODateTime | null;           // first time the student opened the live lesson / submitted
  items: LessonBoardItem[];               // ordered by `order`; main first, then extra
};
type LessonBoardModel = {
  id: string;
  title: string;
  kind: "LESSON";
  status: DerivedLessonStatus;
  startsAt: ISODateTime | null;
  createdAt: ISODateTime;
  finishedAt: ISODateTime | null;
  durationMinutes: number;
  group: { id: string; name: string } | null;
  participants: LessonBoardParticipant[]; // sorted by student name
  aiAvailable: boolean;
  idleWarnMinutes: number;                // default 8
  idleAlertMinutes: number;               // default 15
  /** Bank for manual add: all topics with all numbers, ordered by displayOrder. */
  bank: Array<{ topicId: string; topicTitle: string; numbers: Array<{ id: string; number: string }> }>;
};

// Full server shape of getLessonDetail (superset used by lesson board, homework board and PDFs)
type LessonDetail = {
  id: string; title: string; status: DerivedLessonStatus; kind: LessonKind;
  topicId: string | null; teacherId: string; deadlineAt: ISODateTime | null;
  durationMinutes: number;
  planParams: LessonPlanParams | HomeworkPlanParamsJson | null;
  createdAt: ISODateTime; startsAt: ISODateTime | null; finishedAt: ISODateTime | null;
  group: { id: string; name: string } | null;
  participants: Array<{
    id: string; studentId: string; studentName: string; speed: number | null;
    planSummary: string | null; planGeneratedAt: ISODateTime | null; planError: PlanErrorRaw;
    issuedAssignmentId: string | null;    // null when the issued HomeworkAssignment no longer exists
    issuedAt: ISODateTime | null;         // same rule
    createdAt: ISODateTime; joinedAt: ISODateTime | null;
    items: Array<{
      id: string; order: number; reason: AssignmentReason; minutes: number | null; comment: string | null;
      isExtra: boolean; result: LessonItemResult | null;
      homeworkNumberId: string; number: string;
      conditionLatex: string | null; answerLatex: string | null;   // answer only for teacher answer sheets
      topicId: string; topicTitle: string;
      studentStatus: HomeworkNumberStatus | null;
      latestSubmission: null | {
        status: SolutionCheckStatus; verdict: SolutionVerdict | null;
        submittedAt: ISODateTime; checkedAt: ISODateTime | null;
        injectionSuspected: boolean; injectionNote: string | null;
        photos: Array<{ fileId: string }>;
      };
    }>;
  }>;
};
type LessonPlanParams = {
  title: string; durationMinutes: number; topicIds: string[]; teacherNote: string;
  outputLocale: "ru" | "en";
};
type HomeworkPlanParamsJson = {
  title: string; topicId: string; deadlineAt: ISODateTime; teacherNote: string;
  sourceLessonId: string | null; dailyMinutes: number; outputLocale: "ru" | "en";
};

// ---- 1.5 Homework drafts list (getHomeworkPlans) ----
type HomeworkPlanListItem = {
  id: string;
  title: string;
  deadlineAt: ISODateTime | null;
  createdAt: ISODateTime;
  topicTitle: string | null;
  groupName: string | null;
  participantsCount: number;
  readyCount: number;
  failedCount: number;
  issuedCount: number;                    // participants with issuedAssignmentId (raw, see §7.4)
};

// ---- 1.6 New homework draft ----
type HomeworkPlanNewModel = {
  kicker: string;
  topics: TopicOption[];
  members: Array<{ id: string; name: string }>;
  defaultTopicId: string | null;
  defaultTitle: string;                   // "" unless created from a lesson
  groupId: string | null;
  sourceLessonId: string | null;
};

// ---- 1.7 Homework draft board ----
type HomeworkPlanItem = {
  id: string; homeworkNumberId: string; number: string; conditionLatex: string | null;
  reason: AssignmentReason; minutes: number | null; comment: string | null;
  studentStatus: HomeworkNumberStatus | null;
};
type HomeworkPlanParticipant = {
  id: string; studentId: string; studentName: string;
  planSummary: string | null; planGeneratedAt: ISODateTime | null; planError: PlanErrorRaw;
  issuedAssignmentId: string | null; issuedAt: ISODateTime | null;
  createdAt: ISODateTime;
  items: HomeworkPlanItem[];              // isExtra items filtered out
};
type HomeworkPlanBoardModel = {
  id: string;
  title: string;
  topicId: string;
  topicTitle: string;
  deadlineAt: ISODateTime | null;
  daysUntilDeadline: number | null;       // daysUntil(deadlineAt, now) clamped 1..60
  group: { id: string; name: string } | null;
  sourceLesson: { id: string; title: string } | null;
  aiAvailable: boolean;                   // aiEnabled && homeworkPlanEnabled && model configured
  participants: HomeworkPlanParticipant[];
  topicNumbers: Array<{ id: string; number: string }>;   // all numbers of the topic, by displayOrder
};

// ---- Status polling payloads ----
type LessonPlanStatus = {
  total: number; ready: number; failed: number; pending: number;
  participants: Array<{
    participantId: string; studentId: string; name: string;
    planGeneratedAt: ISODateTime | null; planError: PlanErrorRaw; itemsCount: number;
  }>;
};
type HomeworkPlanStatus = {
  total: number; ready: number; failed: number; issued: number; pending: number;
  participants: Array<{
    participantId: string; studentId: string; name: string;
    planGeneratedAt: ISODateTime | null; planError: PlanErrorRaw;
    issuedAssignmentId: string | null; issuedAt: ISODateTime | null; itemsCount: number;
  }>;
};
type LessonLiveSnapshot = { signature: string };
```

---

## 3. Mutations and queries

Common to every route below:

- Auth: session cookie; not logged in or role not TEACHER/DEVELOPER → **401**
  `{ error: dict.apiCommon.unauthorized }` ("Нет доступа." / "Access denied.").
- Rate limit (persistent, per user, per scope): exceeded → **429**
  `{ error: dict.apiCommon.rateLimited }` ("Слишком много запросов. Подождите немного и попробуйте снова." /
  "Too many requests. Wait a moment and try again.") with `Retry-After` header; limiter storage failure →
  **503** `{ error: dict.apiCommon.serviceUnavailable }` ("Сервис временно недоступен. Попробуйте снова
  позже."), `Retry-After: 5`.
- All error bodies are `{ error: string }` already localized to the caller's UI language (cookie
  `shbz-lang`). Clients display `error` verbatim and fall back to a local default text.
- Malformed JSON body is treated as `null` (then field validation fails).

### 3.1 `POST /api/teacher/lessons` — create a lesson (+ start AI selection)

Rate limit: scope `api:lesson-plan`, **10 / 60 s** (shared with regenerate, §3.7).

Request body:

```ts
{
  groupId?: string;                    // group lesson; omit for individual
  studentIds?: string[];               // with groupId: subset of members (empty → all members);
                                       // without groupId: the students (must be own students)
  title?: string;                      // trimmed, sliced to 200; empty → default title
  durationMinutes?: number;            // rounded; clamped 15..240; missing/invalid → 60
  topicIds?: string[];                 // filter for AI; [] = AI decides
  teacherNote?: string;                // trimmed, sliced to 500
  startsAt?: string;                   // any Date-parsable string; optional
  speeds?: Record<studentId, number | null>;   // per-lesson speed override, clamped 1..10
  skipPlan?: boolean;                  // true → manual lesson, no AI
  numberIds?: string[];                // only with skipPlan: problems in chosen order
}
```

Processing order and errors:

1. `groupId` given: group must exist and be owned (DEVELOPER: any) → else **404**
   `dict.apiCommon.groupNotFound` ("Группа не найдена." / "Group not found."). Students = requested ids ∩
   members, or all members when none requested.
2. No `groupId`: students = requested ids that are STUDENT users owned by the teacher (DEVELOPER: any);
   unknown/foreign ids are silently dropped.
3. No students left → **400** `apiPlanner.lessons.selectAtLeastOneStudent` ("Выберите хотя бы одного
   ученика." / "Select at least one student.").
4. More than 30 → **400** `apiPlanner.lessons.tooManyStudents` ("Не больше {max} учеников за один урок." /
   "No more than {max} students per lesson.", max = 30).
5. `startsAt` present but unparsable → **400** `apiPlanner.lessons.invalidStartsAt` ("Некорректные дата и
   время урока." / "Invalid lesson date and time.").
6. Title = given title or `apiPlanner.lessons.defaultTitle` ("Занятие от {date}" / "Lesson on {date}", date =
   today formatted in the creator's locale; stored as plain data).
7. Creates `Lesson { kind: LESSON, title, teacherId: user.id, groupId | null, subject (group's),
   durationMinutes, startsAt | null, planParams: { title, durationMinutes, topicIds, teacherNote,
   outputLocale } }` with one participant per student (`speed` = override or `null`; when
   `skipPlan === true` also `planGeneratedAt = now`).
8. `skipPlan === true` and `numberIds` non-empty: ids that exist in the bank are added **to every
   participant** in the given order with `reason = "NEW"`, `isExtra = false`.
9. If `startsAt` was set: realtime `lesson-activity` is published to each participant student.
10. Outcomes:
    - `skipPlan === true` → **200** `{ ok: true, lessonId, skippedPlan: true }`.
    - AI disabled / not configured → all participants get `planError = "plan-error:unavailable"` →
      **503** `{ error: apiPlanner.lessons.plannerUnavailable, lessonId }` ("ИИ-подбор недоступен: модель не
      настроена. Урок можно собрать вручную."). **The lesson exists** — the client must navigate to it.
    - Daily budget or queue refusal (`reservePlanGenerations(participants, aiPlanDailyLimit)`) → all
      participants get `planError = "plan-error:budgetExhausted" | "plan-error:queueFull"` → **200**
      `{ ok: true, lessonId, planError: "budgetExhausted" | "queueFull" }`.
    - Otherwise every participant is enqueued for generation → **200** `{ ok: true, lessonId }`.
    - DB failure → **500** `apiPlanner.lessons.createFailed` ("Не удалось создать урок. Применена ли миграция
      уроков и групп?").

Side effects: cache revalidation of teacher/students data, `/teacher/groups`, `/teacher/lessons`,
`/teacher/lessons/{id}`; log event `lesson_plan.lesson_created`.

### 3.2 `GET /api/teacher/lessons/[lessonId]/status` — generation progress

No rate limit. Works for both kinds (no `kind` filter). 404 `dict.apiCommon.lessonNotFound` ("Урок не
найден." / "Lesson not found."). Response `LessonPlanStatus`:
`ready` = participants with `planGeneratedAt`; `failed` = `!planGeneratedAt && planError`;
`pending = total - ready - failed`; participants sorted by student name.

### 3.3 `PATCH /api/teacher/lessons/[lessonId]` — set / move the lesson time

Rate limit `api:lesson-schedule`, **30 / 60 s**. Body `{ startsAt: string }` (required, Date-parsable; the
site sends an ISO string).

- Missing/invalid → **400** `apiPlanner.lessons.invalidStartsAt`.
- Not found / not own / `kind !== LESSON` → **404** `lessonNotFound`.
- `lesson.finishedAt` set (teacher finished it early) → **409** `apiPlanner.lesson.alreadyFinished` ("Урок
  уже завершён — время не переносится." / "The lesson has already finished — its time can't be
  rescheduled.").
- **Reopening**: stored `status === FINISHED` (results already finalized) and the new time makes the derived
  status not `FINISHED`:
  - if the lesson has any student submission → **409** `apiPlanner.lesson.alreadyClosed` ("Урок уже закрылся
    по расписанию, и в нём есть сдачи — перенести нельзя. Создайте новый урок.");
  - otherwise, in one transaction: all items with `result = SKIPPED` → `null`; participants with
    `joinedAt = null && attendance = ABSENT` → `UNKNOWN`; lesson `startsAt = new`, stored `status = PLANNED`.
- Normal case: just `startsAt = new`.
- DB failure → **500** `apiPlanner.lesson.scheduleFailed` ("Не удалось назначить время урока.").
- Success → **200** `{ ok: true }`. Side effects: realtime `lesson-activity` to the teacher and to every
  participant student; audit log `lesson.schedule`; revalidation of the board, list and `/student/lesson`.

### 3.4 `DELETE /api/teacher/lessons/[lessonId]` — delete a lesson

Rate limit `api:lesson-delete`, **30 / 60 s**. No `kind` filter (it would also delete a homework draft id).
404 `lessonNotFound`; 500 `apiPlanner.lesson.deleteFailed` ("Не удалось удалить урок."); success
`{ ok: true }`. Cascade removes participants, items, submissions; submission photo files are deleted from
storage when unreferenced. **Results already mirrored to `StudentTopicNumberStatus` stay** (progress is not
rolled back). No realtime event is published.

### 3.5 `POST /api/teacher/lessons/[lessonId]/finish` — finish early

Rate limit `api:lesson-finish`, **30 / 60 s**. No body.

- 404 `lessonNotFound` (not found / not own / not `LESSON`).
- Derived status ≠ `ACTIVE` → **409** `apiPlanner.lessonFinish.notActive` ("Урок сейчас не идёт — завершать
  нечего." / "The lesson isn't in progress — there's nothing to finish.").
- Sets `finishedAt = now` (stored `status` is not touched here). Failure → **500**
  `apiPlanner.lessonFinish.finishFailed` ("Не удалось завершить урок.").
- Then runs `finalizeLessonResults(lessonId)` (§4.6); a finalization failure is logged, not returned.
- Success `{ ok: true }`. Side effects: realtime `lesson-activity` (teacher scope); audit `lesson.finish`;
  revalidation of the board, list, `/student/lesson`.

There is no "start lesson" endpoint — a lesson starts automatically at `startsAt`.

### 3.6 `PATCH /api/teacher/lessons/[lessonId]/participants/[participantId]/items` — replace a set

Rate limit `api:lesson-items`, **60 / 60 s**. Used by the lesson board, the student "Занятия" tab and the
homework draft board (with `lessonId = planId`).

Body `{ homeworkNumberIds: string[]; extraHomeworkNumberIds?: string[] }` — the **complete desired set**:
main part in order, then extra part in order.

- Participant not found / lesson not own / student no longer own → **404**
  `apiPlanner.lessonItems.participantNotFound` ("Участник урока не найден." / "Lesson participant not
  found.").
- Participant has `issuedAssignmentId` (homework already issued from this draft; raw DB value) → **409**
  `apiPlanner.lessonItems.homeworkAlreadyIssued` ("ДЗ уже выдано. Сначала отмените его." / "Homework has
  already been assigned. Cancel it first.").
- `homeworkNumberIds` not an array → **400** `apiPlanner.lessonItems.numbersRequired` ("Передайте список
  номеров.").
- Normalization: trim, drop empties, de-duplicate, cut each list to **40**; an id present in both lists stays
  in **main** only; ids that do not exist in the bank are silently dropped.
- Differential update (`planLessonItemsUpdate`): existing rows whose number stays keep their id (and thus
  `reason`, `minutes`, `comment`, `result`, submissions) and only get a new `order`/`isExtra`
  (main: `order = index`; extra: `order = mainCount + index`); new numbers are created with
  `reason = "NEW"`, `minutes = null`, `comment = null`, `result = null`; rows no longer listed are deleted —
  **unless they have at least one student submission**: then nothing is changed and the route returns
  **409** `apiPlanner.lessonItems.blockedNumbers` ("Нельзя убрать номер, по которому ученик уже сдавал
  решение: {numbers}." / "A problem the student has already submitted a solution for can't be removed:
  {numbers}.", numbers comma-separated).
- DB failure → **500** `apiPlanner.lessonItems.saveFailed` ("Не удалось сохранить набор.").
- Success → **200** `{ ok: true, items: <main count> }`.
- Does **not** touch `planGeneratedAt` / `planError` / `planSummary`, and does **not** touch student
  progress (removing an item with a result leaves the mirrored status as is). No realtime event.

### 3.7 `POST /api/teacher/lessons/[lessonId]/participants/[participantId]/regenerate` — (re)run AI for one participant

Rate limit `api:lesson-plan`, **10 / 60 s** (same bucket as lesson creation). No body. Works for both kinds.

- **404** `apiPlanner.lessonItems.participantNotFound`.
- Participant already issued → **409** `apiPlanner.lessonItems.homeworkAlreadyIssued`.
- Feature disabled (`lessonPlanEnabled` for lessons / `homeworkPlanEnabled` for drafts) or AI not configured
  → **503** `apiPlanner.lessons.plannerUnavailable`.
- Budget/queue refusal (1 generation) → `{ error: dict.planner.planErrors[code] }` with **429** for
  `budgetExhausted` ("Дневной лимит ИИ-подбора исчерпан. Соберите набор вручную или нажмите «Повторить»
  завтра.") or **503** for `queueFull` ("Очередь ИИ-подбора переполнена. Нажмите «Повторить» через несколько
  минут."). The previous set and error stay untouched.
- Otherwise: `planGeneratedAt = null`, `planError = null` (items and summary stay until the new plan
  arrives), the participant is enqueued → **200** `{ ok: true }`.
- Client: on success locally set `planGeneratedAt = null`, `planError = null`, `createdAt = now` (to restart
  the 15-minute stale timer) and start polling; on failure show the notice (server `error` /
  `lessonBoard.regenerateFailed` "Не удалось запустить пересборку." / "Could not start regeneration.").

### 3.8 `PATCH /api/teacher/lessons/[lessonId]/participants/[participantId]/items/[itemId]/result` — mark a result

Rate limit `api:lesson-item-result`, **240 / 60 s**. Lessons only (`kind = LESSON`). Allowed in **any**
lesson status (planned, active, finished).

Body `{ result: "SOLVED" | "PARTIAL" | "NOT_SOLVED" | "SKIPPED" | null }` — the key `result` must be
present.

- Missing key or unknown value → **400** `apiPlanner.lessonResult.invalidResult` ("Некорректный итог." /
  "Invalid result.").
- Item not found in this participant/lesson, lesson not own, student no longer own → **404**
  `apiPlanner.lessonResult.itemNotFound` ("Задача урока не найдена." / "Lesson problem not found.").
- One Serializable transaction (with retry): update `item.result`, then write student progress with source
  `lesson_teacher` (mirroring rules §4.7) and a `ProgressStatusEvent` history row.
- Failure → **500** `apiPlanner.lessonResult.saveFailed` ("Не удалось сохранить итог.").
- Success → **200** `{ ok: true, result }`.
- Side effects: revalidation of all platform data, the board, `/teacher/students/{studentId}`, `/student`,
  `/student/lesson`; realtime `student-progress-changed { studentId, topicId }` and
  `lesson-activity { lessonId, teacherId, studentId }` (so the student's Lesson tab refreshes); audit log
  `progress.status`.

### 3.9 `PATCH /api/teacher/lessons/[lessonId]/participants/[participantId]/attendance` — manual attendance

Rate limit `api:lesson-attendance`, **240 / 60 s**. Lessons only. Body
`{ attendance: "UNKNOWN" | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" }`.

- Invalid → **400** `apiPlanner.attendance.invalidMark` ("Некорректная отметка.").
- **404** `apiPlanner.attendance.participantNotFound` ("Участник занятия не найден.").
- **500** `apiPlanner.attendance.saveFailed` ("Не удалось сохранить отметку.").
- Success `{ ok: true, attendance }`; realtime `lesson-activity { lessonId, teacherId, studentId }`;
  revalidates the lesson board and the group page.
- UI for it lives on the group page (attendance table), not on the lesson board.

### 3.10 `GET /api/teacher/lessons/[lessonId]/live` — live activity signature

Rate limit `api:lesson-live`, **120 / 60 s**. Lessons only; 404 `lessonNotFound`.
Response `{ signature: string }` where

```
signature = [
  finishedAt?.getTime() ?? 0,
  participants.map(p => `${p.id}:${p.joinedAt?.getTime() ?? 0}`).join("|"),
  submissions(ordered by submittedAt, id).map(s =>
    `${s.itemId}:${s.status}:${s.submittedAt.getTime()}:${s.checkedAt?.getTime() ?? 0}`).join("|")
].join("#")
```

The client compares it with the previous one and re-fetches the board when it changes (the very first value
only initializes the comparison).

### 3.11 `GET /api/teacher/topics/conditions?topicId=` — statements of one topic (manual grid)

Rate limit `api:topic-conditions`, **120 / 60 s**. Response
`{ conditions: Record<homeworkNumberId, string | null> }` (`{}` without `topicId`). No ownership scope (the
bank is shared).

### 3.12 `GET /teacher/lessons/[lessonId]/pdf` and `GET /teacher/lessons/[lessonId]/print`

Rate limit scope `lesson-pdf`, **30 / 60 s** (shared by both). Query: `studentId` (optional — only that
participant), `answers=1` (answer sheet).

- 401 JSON `unauthorized`; lesson not found / not own / no participants after the filter → **404**
  `lessonNotFound`.
- `kind !== LESSON` and not `answers=1` → **404** `apiPlanner.lessons.noHomeworkHandout` ("У домашнего
  задания нет печатной раздатки — только лист ответов." / "Homework has no printable handout — only the
  answer sheet.").
- `/print` → `200 text/html` (KaTeX CSS and fonts inlined).
- `/pdf` → `200 application/pdf`, `Content-Disposition: attachment; filename="urok-YYYY-MM-DD.pdf"` (answers:
  `otvety-YYYY-MM-DD.pdf`; UTF-8 names `урок-{group|urok}-{date}.pdf` / `ответы-…`; date = lesson `createdAt`).
  If headless Chromium is unavailable the route returns the **HTML** version with a banner
  `apiPlanner.lessons.pdfRendererFallback` ("PDF-рендерер недоступен на сервере. Нажмите Ctrl+P (⌘P) и
  выберите «Сохранить как PDF».") — the client must check `Content-Type`.
- Handout content per participant: student name, items (number, topic title, statement, `isExtra`); answer
  sheet adds `answerLatex`.

### 3.13 `POST /api/teacher/homework-plans` — create a homework draft (+ start AI selection)

Rate limit `api:homework-plan`, **10 / 60 s**.

Request body:

```ts
{
  topicId: string;                 // required, exactly one topic
  deadlineAt: string;              // required, must be in the future
  title?: string;                  // trimmed, <= 200; empty → default title
  teacherNote?: string;            // trimmed, <= 500
  sourceLessonId?: string;         // lesson the homework reinforces
  dailyMinutes?: number;           // clamped 15..240, default 60
  groupId?: string;
  studentIds?: string[];
}
```

- `topicId` empty, `deadlineAt` missing/invalid/not in the future → **400**
  `apiPlanner.homeworkPlans.topicAndDeadlineRequired` ("Укажите тему и дедлайн в будущем (дату следующего
  занятия)." / "Specify a topic and a deadline in the future (the date of the next lesson).").
- Topic does not exist → **404** `dict.apiCommon.topicNotFound` ("Тема не найдена." / "Topic not found.").
- `groupId` given but not found/own → **404** `groupNotFound`. Student resolution identical to §3.1.
- No students → **400** `apiPlanner.lessons.selectAtLeastOneStudent`; more than 30 → **400**
  `apiPlanner.homeworkPlans.tooManyStudents` ("Не больше {max} учеников за раз." / "No more than {max}
  students at a time.").
- `sourceLessonId` is kept only if it is the caller's own `LESSON`; otherwise silently `null`.
- Creates `Lesson { kind: HOMEWORK, title, subject: topic.subject, teacherId, groupId | null, topicId,
  deadlineAt, planParams: { title, topicId, deadlineAt, teacherNote, sourceLessonId, dailyMinutes,
  outputLocale } }` with one participant per student (no speed overrides).
- Outcomes mirror §3.1: AI unavailable → participants `planError = "plan-error:unavailable"`, **503**
  `{ error: plannerUnavailable, planId }`; budget/queue refusal → **200**
  `{ ok: true, planId, planError: "budgetExhausted" | "queueFull" }`; normal → **200**
  `{ ok: true, planId }`; DB failure → **500** `apiPlanner.homeworkPlans.createFailed` ("Не удалось создать
  черновик ДЗ. Применена ли миграция homework plans?").

### 3.14 `GET /api/teacher/homework-plans/[planId]/status`

No rate limit. `kind = HOMEWORK` only; **404** `dict.apiCommon.draftNotFound` ("Черновик не найден." /
"Draft not found."). Response `HomeworkPlanStatus` (`issued` = participants with `issuedAssignmentId`).

### 3.15 `POST /api/teacher/homework-plans/[planId]/issue` — issue homework from the draft

Rate limit `api:homework-plan`, **30 / 60 s** (same scope as create/delete, different limit).
Body `{ participantIds?: string[] }` — empty/missing = all participants.

- **404** `draftNotFound`.
- Draft without topic or deadline → **400** `apiPlanner.homeworkPlanIssue.missingTopicOrDeadline` ("У
  черновика нет темы или дедлайна.").
- `deadlineAt <= now` → **400** `apiPlanner.homeworkPlanIssue.deadlinePassed` ("Дедлайн уже прошёл —
  создайте новый черновик с актуальной датой." / "The deadline has already passed — create a new draft with
  a current date.").
- For each target participant (sorted by name), independently (partial success is normal):
  - already issued → skipped silently (idempotent);
  - empty set → `failed` with `message = apiPlanner.homeworkPlanIssue.emptySet` ("Набор пуст — добавьте
    номера." / "The set is empty — add problems.");
  - otherwise `issueHomework({ studentId, topicId: plan.topicId, homeworkNumberIds: items in order,
    deadlineAt: plan.deadlineAt, title: planParams.title ?? plan.title, planParticipantId })`:
    - any number of the set already `GREEN` or `YELLOW` for the student → `failed` with
      `apiPlanner.homeworkIssue.solvedConflictOne` / `solvedConflictMany` ("Номер(а) {numbers} ученик уже
      решил — повторно его/их не выдаём. Уберите … из набора или сбросьте статус на карточке ученика.");
    - student not own / a number not in the topic → `failed` with `dict.apiCommon.studentOrNumberNotFound`
      ("Ученик или номер задания не найден.");
    - invalid input → `apiPlanner.homeworkIssue.invalidData` ("Некорректные данные для ДЗ.");
    - concurrent double issue → skipped silently;
    - unexpected crash → `failed` with `apiPlanner.homeworkPlanIssue.internalError` ("Внутренняя ошибка —
      подробности в логах сервера.");
    - success: in one transaction a `HomeworkAssignment` (title, deadline, numbers) is created,
      `StudentTopicNumberStatus` rows are ensured for every number with the mirrored `deadlineAt`,
      and the participant is stamped `issuedAssignmentId = assignment.id`, `issuedAt = now`. The student gets
      a notification `homework-assigned` (href `/student/homeworks`); realtime
      `student-deadlines-changed { studentId, topicId }`; student and teacher caches are revalidated.
- Response **200**:

```ts
{
  ok: true;
  issued: Array<{ participantId: string; studentId: string; name: string; assignmentId: string }>;
  failed: Array<{ participantId: string; studentId: string; name: string; message: string }>;
}
```

### 3.16 `DELETE /api/teacher/homework-plans/[planId]` — delete a draft

Rate limit `api:homework-plan`, **30 / 60 s**. 404 `draftNotFound`; 500
`apiPlanner.homeworkPlans.deleteFailed` ("Не удалось удалить черновик."); success `{ ok: true }`. Already
issued `HomeworkAssignment`s are **not** touched.

### 3.17 Queries that are server-rendered on the site (no JSON route today)

| Data | Site function | Notes |
|---|---|---|
| Lessons list | `getTeacherLessons(viewer)` | `kind = LESSON`, `createdAt desc`; runs lazy finalization first |
| Lesson board | `getLessonDetail(viewer, id)` + topics bank + site settings | runs lazy finalization for this lesson first |
| New-lesson bootstrap | groups/students lists, `getGroupDetail`, `getTeacherStudentDetail`, topics, settings | |
| Drafts list | `getHomeworkPlans(viewer)` | `kind = HOMEWORK`, `createdAt desc` |
| Draft board | `getLessonDetail(viewer, id)` + topic numbers + source lesson + settings | |
| New-draft bootstrap | lesson / group / student lookups + `pickDominantTopicId` | |

The mobile API needs JSON endpoints for all of these (§6).

---

## 4. Business rules the mock must imitate

### 4.1 Lesson status is derived from the schedule

```
deriveLessonStatus({ startsAt, durationMinutes, status, finishedAt }, now):
  if finishedAt and finishedAt <= now            → "FINISHED"
  if startsAt is null / invalid                   → stored status (if one of PLANNED/ACTIVE/FINISHED) else "PLANNED"
  if now < startsAt                               → "PLANNED"
  if now < startsAt + max(0, durationMinutes)min  → "ACTIVE"
  else                                            → "FINISHED"
```

- There is no manual start. An unscheduled lesson stays `PLANNED` forever (unless its stored status says
  otherwise) and never appears in the student's Lesson tab → the board shows the "no time" banner.
- The teacher can only end an `ACTIVE` lesson early (`finishedAt`).
- Stored `Lesson.status = FINISHED` only means "end-of-lesson results were finalized".

### 4.2 Participant plan state machine (both kinds)

```
            create (AI path)                generation ok
   ┌────────────────────────► PENDING ───────────────────────► READY
   │                            │  ▲                              │
   │        generation error /  │  │ regenerate (200)             │ regenerate (200)
   │        refusal at create   ▼  │                              ▼
create ───────────────────────► FAILED ◄───────────────────── PENDING …
   │
   └─ skipPlan (manual) ──────► READY (planGeneratedAt = now, no summary)

PENDING for > 15 min since participant.createdAt  → shown as STALE (client-side only) with "Retry"
```

- `PENDING` = `planGeneratedAt == null && planError == null` (homework board additionally requires
  `issuedAssignmentId == null`).
- `READY` = `planGeneratedAt != null` (and `planError == null` after a successful generation).
- `FAILED` = `planError != null`. A failed participant keeps whatever items it had; manual editing always
  works.
- The plan error is **not** cleared by manual set edits; it disappears only after a successful regenerate.
- Server-side auto-resume: once per server start, participants pending between 2 min and 24 h (by
  `updatedAt`) and not issued are re-enqueued. The mock does not need this, but must tolerate a participant
  staying pending "forever" (→ stale UI).

### 4.3 What a finished generation writes (mock generator contract)

Lesson (`kind = LESSON`), per participant:

- Candidate pool (facts, no ranking): all bank numbers, optionally filtered to `planParams.topicIds`,
  **excluding**:
  (a) numbers that are in any existing set of this student — every `LessonAssignmentItem` of the student
  counts, in lessons **and** homework drafts, including the set currently being regenerated — when that
  item's result is `null`, `SOLVED` or `PARTIAL`. An item with result `NOT_SOLVED` does not exclude and
  flags the number as a "gap" candidate (`attemptedInLesson`); `SKIPPED` does not exclude (normal
  candidate). If the same number occurs in several sets, exclusion wins over the gap flag;
  (b) numbers in an **active** homework assignment (no deadline or deadline ≥ now);
  (c) numbers whose student status is `GREEN` or `YELLOW`.
  `RED` and unmarked numbers stay. Ordered by topic `displayOrder`, number `displayOrder`, numeric number
  order.
- No candidates → `planError = noCandidates`. Student deleted → `studentMissing`. AI off →
  `unavailable`. Model returned no main items → `emptyPlan`. Any exception → `failed`.
- Success writes, atomically: delete this participant's items **that have no submissions**; insert the new
  plan (`skipDuplicates` on `participantId + homeworkNumberId`): main items `order = 0..n-1`,
  `isExtra = false`; extra items `order = n..`, `isExtra = true`; each with `reason ∈ {NEW, GAP}`,
  `minutes ∈ 1..240 | null`, `comment` (≤ 200 chars or `null`); participant `planSummary` (≤ 400 chars or
  `null`), `planGeneratedAt = now`, `planError = null`.
- Caps: main ≤ `lessonPlanMaxItems` (default 40), extra ≤ `max(2, ceil(lessonPlanMaxItems / 2))`. A number is
  never in both parts.
- Speed used = participant override, else the student's profile speed, else none.
- Texts (`planSummary`, `comment`) are written in the creating teacher's UI language.

Homework draft (`kind = HOMEWORK`), per participant:

- Skipped entirely if the participant is already issued.
- `homeworkParams` error when the deadline is already in the past or the topic is missing;
  `homeworkNoCandidates` when the single topic has no candidates; other errors as above.
- Candidates: same exclusion rules, restricted to the draft's single topic.
- Success: main items only (`isExtra = false`), `comment = null` always, `reason ∈ {NEW, GAP}`, `minutes`,
  `planSummary`; cap `homeworkPlanMaxItems` (default 40). Volume context = `dailyMinutes × days until
  deadline` (days clamped 1..60).

Real generation takes tens of seconds per participant, 3 participants in parallel by default. The mock
should resolve each participant after a short random delay (e.g. 2–6 s) so the polling UI is exercised, and
support forcing each error code.

### 4.4 Plan error codes and texts

`planError` is stored as `"plan-error:<code>"`. Display rule (`planErrorText`): if the raw value starts with
`plan-error:` use the code; else if it exactly equals one of the 7 frozen legacy Russian strings map it to its
code; if the code is known show `dict.planner.planErrors[code]`, otherwise show the raw string as is.

| Code | ru | en | Typical origin |
|---|---|---|---|
| `unavailable` | ИИ-подбор недоступен: модель не настроена. Урок можно собрать вручную. | AI selection is unavailable: no model is configured. You can build the lesson by hand. | AI disabled at create/generation |
| `studentMissing` | Ученик не найден или удалён. | The student was not found or has been deleted. | generation |
| `noCandidates` | Нет доступных номеров: всё уже решено, выдано на уроках или в активных ДЗ. Добавьте номера вручную. | No problems available: everything is already solved, used in lessons or in active homework. Add problems by hand. | lesson generation |
| `homeworkNoCandidates` | В этой теме нет доступных номеров: всё уже решено, выдано или разобрано. Добавьте номера вручную. | No problems available in this topic: everything is already solved, assigned or covered. Add problems by hand. | homework generation |
| `homeworkParams` | Дедлайн уже в прошлом или тема не задана — создайте новый черновик. | The deadline has passed or no topic is set — create a new draft. | homework generation |
| `emptyPlan` | Модель не вернула план. Нажмите «Повторить» или добавьте номера вручную. | The model returned no plan. Press "Retry" or add problems by hand. | generation |
| `failed` | Подбор не удался: модель не ответила. Нажмите «Повторить» или добавьте номера вручную. | Selection failed: the model did not respond. Press "Retry" or add problems by hand. | generation exception |
| `budgetExhausted` | Дневной лимит ИИ-подбора исчерпан. Соберите набор вручную или нажмите «Повторить» завтра. | The daily AI selection limit is used up. Build the set by hand or press "Retry" tomorrow. | create / regenerate |
| `queueFull` | Очередь ИИ-подбора переполнена. Нажмите «Повторить» через несколько минут. | The AI selection queue is full. Press "Retry" in a few minutes. | create / regenerate, also when the budget counter is unavailable |

Legacy strings (exact match after trim) → code: the seven Russian texts of `unavailable`, `studentMissing`,
`noCandidates`, `homeworkNoCandidates`, `homeworkParams`, `emptyPlan`, `failed` listed above.

### 4.5 AI budget and queue

- Budget unit = one generation (one participant). Global (all teachers) limit `aiPlanDailyLimit`
  (default 300) per rolling 24 h window. A request that does not fit is refused **entirely** (nothing is
  consumed) → `budgetExhausted`.
- Queue: if `queued + active + requested > 150` → `queueFull`. Budget-store failure also → `queueFull`.
- At creation the lesson/draft is still created; the refusal lands on every participant as `planError`.
- At regenerate the refusal is returned as an HTTP error (429 / 503) and nothing changes.

### 4.6 End-of-lesson finalization (automatic results and attendance)

`finalizeLessonResults(lessonId)` runs when (a) the teacher finishes early, or (b) lazily: whenever the
lessons list, a lesson board or the student's Lesson tab is opened, for `LESSON`s whose stored status is not
`FINISHED`, whose derived status is `FINISHED`, and which ended within the last **48 hours**
(`endedAt = finishedAt ?? startsAt + duration`; at most 50 candidates per call). Lessons that ended earlier
are never auto-finalized. Idempotent.

For each participant:

- For each item with `result == null`:
  - a submission is still `PENDING`/`CHECKING` → leave it (the check will set the result);
  - the item has at least one submission (any status) → `NOT_SOLVED`;
  - no submission at all → `SKIPPED`.
  Only items still unmarked at write time are changed (a concurrent manual mark wins). Each change writes
  progress with source `lesson_end` (§4.7: `NOT_SOLVED` → RED; `SKIPPED` → no progress change).
- Attendance: if `attendance == UNKNOWN` → `PRESENT` when the participant had any activity (`joinedAt` set or
  any submission), else `ABSENT`. Manual marks are never overwritten.
- Finally stored `Lesson.status = FINISHED`; realtime `lesson-activity` if anything changed; audit log
  `lesson.auto_results { notSolved, skipped, attendance }`.

Unscheduled lessons (no `startsAt`, no `finishedAt`) are never finalized.

### 4.7 Result → student progress mirroring

`LessonItemResult` → `StudentTopicNumberStatus.status`:

| Source | New result | Effect on the student's status for that number |
|---|---|---|
| teacher mark (`lesson_teacher`) | `SOLVED` | set `GREEN` |
| | `PARTIAL` | set `YELLOW` |
| | `NOT_SOLVED` | set `RED` |
| | `SKIPPED` or `null` (cleared) — previous item result was `SOLVED` / `PARTIAL` / `NOT_SOLVED` | status **cleared to `null`** |
| | `SKIPPED` or `null` — previous item result was `null` or `SKIPPED` | no change |
| lesson end (`lesson_end`) | `NOT_SOLVED` | set `RED` |
| | `SKIPPED` | no change |
| AI check of a live submission (`lesson_check`, student side) | auto result (below) | `SOLVED` → GREEN, `PARTIAL` → YELLOW, `NOT_SOLVED` → RED; no auto result → no change |

- A lesson result overrides the current status unconditionally (no "no downgrade" protection — that rule
  exists only for homework checks). Re-marking the same value is still written ("reaffirmed") and refreshes
  `statusChangedAt`.
- Every write appends a `ProgressStatusEvent` (visible in "История статуса").
- `NOT_SOLVED` returns the number to the AI candidate pool as a gap (`attemptedInLesson`); `SKIPPED` leaves
  it a normal candidate; `SOLVED`/`PARTIAL` exclude it from future selection (also via GREEN/YELLOW).

Automatic result from a live submission verdict (`decideAutoLessonResult`) — shown on the teacher board:

| Verdict | Current item result | Had an earlier INCORRECT attempt | New result |
|---|---|---|---|
| `UNCERTAIN` | any | any | unchanged (teacher marks manually; board shows the "not recognised" chip) |
| any | `SOLVED` / `PARTIAL` / `SKIPPED` | any | unchanged |
| `INCORRECT` | `null` | — | `NOT_SOLVED` |
| `INCORRECT` | `NOT_SOLVED` | — | unchanged |
| `CORRECT` | `null` | no | `SOLVED` |
| `CORRECT` | `null` | yes | `PARTIAL` |
| `CORRECT` | `NOT_SOLVED` | any | `PARTIAL` |

The teacher can re-mark anything manually at any time.

Student-side gating that explains what the board sees (`lib/lesson-live.ts`): an item is "closed" when
`result ∈ {SOLVED, PARTIAL, SKIPPED}` or its latest verdict is `CORRECT`; a closed item cannot be
re-submitted; `NOT_SOLVED` can be retried during the lesson; the extra part unlocks for the student only when
every main item is closed (or there are no main items).

### 4.8 Live monitoring computations (client-side on the board)

```ts
// Idle: only when lesson is ACTIVE and startsAt != null
computeIdleLevel({ lastActivityAt, lessonStartedAt, warnMinutes, alertMinutes }, now):
  anchor      = max(lastActivityAt ?? 0, lessonStartedAt)
  idleMinutes = max(0, floor((now - anchor) / 60000))
  level       = idleMinutes >= alertMinutes ? "alert" : idleMinutes >= warnMinutes ? "warn" : "ok"
// lastActivityAt = max(joinedAt, submittedAt of every item's latest submission)

// Minutes spent on a problem: submissions in chronological order
computeSpentMinutes(submittedAtMs[], { lessonStartedAt, joinedAt }):
  previous = max(lessonStartedAt, joinedAt ?? 0)
  for each t: push max(0, round((t - previous) / 60000)); previous = max(previous, t)
```

`now` on the board ticks every 30 s, so idle chips and "N min ago" update without a refetch.

### 4.9 Set editing rules

- A set is always sent whole (main ids + extra ids). Order in the arrays = order in the lesson.
- Max 40 per part; main wins over extra on duplicates; unknown ids are dropped silently.
- A number with a student submission cannot be removed (409); it can be reordered or moved between parts.
- Manually added numbers get `reason = NEW`.
- Editing is forbidden (409) once homework was issued from that participant (drafts).
- Manual add offers any number of any topic (lesson board) or any number of the draft's topic (homework
  board), minus numbers already in the participant's set. There is no check against the student's solved
  status when adding manually — for homework the conflict surfaces at issue time (§3.15).

### 4.10 Homework draft rules

- Exactly one topic per draft; a deadline in the future is mandatory at creation and at issue time.
- `daysUntil(deadline, now) = clamp(ceil((deadline - now) / 86400000), 1, 60)`.
- Issue is per participant, idempotent, partially successful; an issued participant is frozen (no regenerate,
  no set edits, no error banner).
- Issuing creates a normal `HomeworkAssignment` (same as manual assignment): title = draft title, deadline =
  draft deadline, numbers = the participant's set; numbers already GREEN/YELLOW block the whole participant.
- Deleting a draft never deletes issued homework. Cancelling an issued homework (elsewhere) does not unfreeze
  the draft participant on the server (see §7.4).

### 4.11 Permission summary

| Action | TEACHER | DEVELOPER | STUDENT |
|---|---|---|---|
| List / open lessons and drafts | own only | all | no |
| Create lesson / draft | own groups and own students | any group / any student | no |
| Edit sets, mark results, regenerate, schedule, finish, delete, issue | own lesson **and** own student | all | no |
| PDF / print | own | all | no |

---

## 5. Realtime and polling

### 5.1 SSE channel (existing site mechanism)

`GET /api/realtime` (Server-Sent Events, max **2** concurrent connections per user, connect rate limit
30/min). Events relevant here:

```ts
{ kind: "lesson-activity"; occurredAt: ISODateTime; lessonId: string; teacherId: string; studentId?: string }
{ kind: "student-progress-changed"; occurredAt: ISODateTime; studentId: string; topicId?: string }
{ kind: "student-deadlines-changed"; occurredAt: ISODateTime; studentId: string; topicId?: string }
```

- A TEACHER receives `lesson-activity` only for lessons with `teacherId === user.id`, and student events only
  for own students. A DEVELOPER receives everything.
- `lesson-activity` is published on: lesson created with a time (to students), schedule change, early
  finish, manual result mark, manual attendance mark, student opening the lesson / submitting photos, AI
  check completion, automatic finalization.
- Site behaviour on any received event: debounce **1500 ms**, then re-fetch the current page; if the tab is
  hidden, re-fetch once when it becomes visible again. Mobile: debounce 1.5 s → invalidate the lesson board
  / lessons list queries; when the app is backgrounded, refetch on foreground.
- The pub/sub is in-memory (single server instance).

### 5.2 Polling

| What | Endpoint | Interval | Active while | Reaction |
|---|---|---|---|---|
| Lesson generation progress | `GET /api/teacher/lessons/{id}/status` | 2000 ms | at least one participant is pending and not stale | compute signature `participantId:planGeneratedAt:planError` joined by `|`; when it differs from the last one → refetch the board |
| Draft generation progress | `GET /api/teacher/homework-plans/{id}/status` | 2000 ms | same | signature also includes `issuedAssignmentId` |
| Live activity fallback | `GET /api/teacher/lessons/{id}/live` | 15000 ms | lesson status is `ACTIVE` | when `signature` changes (after the first value) → refetch the board |
| Student "Занятия" tab (other subsystem) | `…/status` | 2500 ms | pending lessons exist | same |

Network errors during polling are ignored (next tick retries). Polling stops when the screen unmounts.

### 5.3 Client timers

- `now` tick every 30 s (stale detection, idle chips, "N min ago").
- Stale threshold 15 min from `participant.createdAt` (after a successful regenerate the client overrides
  `createdAt` locally with "now").
- Undo toast 5 s.
- The derived lesson status on the teacher board changes only on refetch (the board does not flip
  PLANNED → ACTIVE by itself; the SSE/polling/refetch brings it). Mobile recommendation: schedule a local
  timer at `startsAt` and at `startsAt + duration` to refetch, mirroring the student-side
  `LessonStartWatcher` (which refreshes at `startsAt + 1 s`, re-checks wall-clock every 30 s, and skips
  refreshes while hidden).

---

## 6. Proposed mobile API contract

Base: `/api/mobile/v1`. Auth: bearer session token (see shell/auth spec). All responses JSON; dates ISO-8601
UTC; errors `{ error: { code: string; message: string } }` with the HTTP statuses listed in §3 (codes below
are stable identifiers, `message` is localized by `Accept-Language` / user locale). The mock implements the
same interface in memory.

Error codes used by this subsystem: `unauthorized` (401), `rate_limited` (429), `service_unavailable` (503),
`lesson_not_found`, `draft_not_found`, `group_not_found`, `topic_not_found`, `participant_not_found`,
`item_not_found` (404), `select_student`, `too_many_students`, `invalid_starts_at`, `numbers_required`,
`invalid_result`, `invalid_attendance`, `topic_and_deadline_required`, `draft_missing_topic_or_deadline`,
`deadline_passed` (400), `already_finished`, `already_closed`, `not_active`, `homework_already_issued`,
`blocked_numbers` (409, with `details.numbers: string[]`), `planner_unavailable` (503), `budget_exhausted`
(429), `queue_full` (503), `internal` (500).

```ts
// ---------- Meta ----------
GET /teacher/planner/meta
→ { lessonAiAvailable: boolean; homeworkAiAvailable: boolean;
    idleWarnMinutes: number; idleAlertMinutes: number;
    limits: { minDuration: 15; maxDuration: 240; maxStudents: 30; maxItemsPerPart: 40;
              maxTitle: 200; maxTeacherNote: 500; minDailyMinutes: 15; maxDailyMinutes: 240 } }

// ---------- Lessons ----------
GET /teacher/lessons
→ { lessons: LessonListItem[]; serverNow: ISODateTime }      // runs lazy finalization first

GET /teacher/lessons/new-options                              // target chooser
→ LessonTargetChooser

GET /teacher/lessons/new-form?groupId=… | ?studentId=…
→ LessonNewFormModel                                          // composeTopics without statements

GET /teacher/topics/{topicId}/conditions
→ { conditions: Record<string, string | null> }

POST /teacher/lessons
body: { groupId?: string; studentIds: string[]; title?: string; durationMinutes?: number;
        startsAt?: ISODateTime; topicIds?: string[]; teacherNote?: string;
        speeds?: Record<string, number | null>; skipPlan?: boolean; numberIds?: string[] }
→ 201 { lessonId: string; plan: "queued" | "skipped" | "unavailable" | "budgetExhausted" | "queueFull" }
// NOTE: unlike the site, "unavailable" is a 201 with plan = "unavailable" (lesson exists). Errors: 400/404/429/500.

GET /teacher/lessons/{lessonId}
→ LessonBoardModel & { serverNow: ISODateTime }               // runs lazy finalization for this lesson
// 404 lesson_not_found also when the id is a HOMEWORK draft

GET /teacher/lessons/{lessonId}/bank                           // optional split of the heavy `bank` field
→ { topics: Array<{ topicId: string; topicTitle: string; numbers: Array<{ id: string; number: string }> }> }

GET /teacher/lessons/{lessonId}/status      → LessonPlanStatus
GET /teacher/lessons/{lessonId}/live        → LessonLiveSnapshot

PATCH /teacher/lessons/{lessonId}
body: { startsAt: ISODateTime }             → { ok: true; status: DerivedLessonStatus; reopened: boolean }

POST /teacher/lessons/{lessonId}/finish     → { ok: true; finalized: { notSolved: number; skipped: number } }

DELETE /teacher/lessons/{lessonId}          → { ok: true }

PUT /teacher/lessons/{lessonId}/participants/{participantId}/items
body: { homeworkNumberIds: string[]; extraHomeworkNumberIds?: string[] }
→ { ok: true; items: LessonBoardItem[] }    // return the fresh set to avoid a full refetch

POST /teacher/lessons/{lessonId}/participants/{participantId}/regenerate
→ { ok: true; planRequestedAt: ISODateTime }

PATCH /teacher/lessons/{lessonId}/participants/{participantId}/items/{itemId}/result
body: { result: LessonItemResult | null }
→ { ok: true; result: LessonItemResult | null; studentStatus: HomeworkNumberStatus | null }

PATCH /teacher/lessons/{lessonId}/participants/{participantId}/attendance
body: { attendance: AttendanceStatus }      → { ok: true; attendance: AttendanceStatus }

GET /teacher/lessons/{lessonId}/handout?format=pdf|html&studentId=&answers=0|1
→ application/pdf | text/html   (404 no_homework_handout for drafts without answers=1;
                                 header X-Handout-Fallback: html when the PDF renderer is unavailable)

// ---------- Homework drafts ----------
GET /teacher/homework-plans                 → { plans: HomeworkPlanListItem[] }

GET /teacher/homework-plans/new-form?lessonId=…[&studentId=…] | ?groupId=… | ?studentId=…
→ HomeworkPlanNewModel

POST /teacher/homework-plans
body: { topicId: string; deadlineAt: ISODateTime; title?: string; teacherNote?: string;
        dailyMinutes?: number; sourceLessonId?: string; groupId?: string; studentIds: string[] }
→ 201 { planId: string; plan: "queued" | "unavailable" | "budgetExhausted" | "queueFull" }

GET /teacher/homework-plans/{planId}        → HomeworkPlanBoardModel & { serverNow: ISODateTime }
GET /teacher/homework-plans/{planId}/status → HomeworkPlanStatus

PUT  /teacher/homework-plans/{planId}/participants/{participantId}/items
body: { homeworkNumberIds: string[] }       → { ok: true; items: HomeworkPlanItem[] }
POST /teacher/homework-plans/{planId}/participants/{participantId}/regenerate
→ { ok: true; planRequestedAt: ISODateTime }

POST /teacher/homework-plans/{planId}/issue
body: { participantIds?: string[] }         // empty = all
→ { ok: true;
    issued: Array<{ participantId: string; studentId: string; name: string; assignmentId: string }>;
    failed: Array<{ participantId: string; studentId: string; name: string;
                    code: "empty_set" | "solved_conflict" | "not_found" | "invalid" | "internal";
                    message: string; conflictNumbers?: string[] }> }

DELETE /teacher/homework-plans/{planId}     → { ok: true }

// ---------- Realtime ----------
GET /realtime  (SSE)  — events as in §5.1; or, if SSE is impractical in RN, long-poll
GET /teacher/lessons/{lessonId}/live every 15 s (already sufficient as a fallback).
```

Suggested TypeScript client interface for the mock layer:

```ts
interface TeacherPlannerApi {
  getPlannerMeta(): Promise<PlannerMeta>;
  listLessons(): Promise<{ lessons: LessonListItem[]; serverNow: string }>;
  getLessonTargets(): Promise<LessonTargetChooser>;
  getLessonNewForm(target: { groupId: string } | { studentId: string }): Promise<LessonNewFormModel>;
  getTopicConditions(topicId: string): Promise<Record<string, string | null>>;
  createLesson(input: CreateLessonInput): Promise<{ lessonId: string; plan: CreatePlanOutcome }>;
  getLessonBoard(lessonId: string): Promise<LessonBoardModel & { serverNow: string }>;
  getLessonStatus(lessonId: string): Promise<LessonPlanStatus>;
  getLessonLive(lessonId: string): Promise<LessonLiveSnapshot>;
  scheduleLesson(lessonId: string, startsAt: string): Promise<void>;
  finishLesson(lessonId: string): Promise<void>;
  deleteLesson(lessonId: string): Promise<void>;
  saveLessonItems(lessonId: string, participantId: string, main: string[], extra: string[]): Promise<LessonBoardItem[]>;
  regenerateParticipant(lessonOrPlanId: string, participantId: string): Promise<void>;
  setItemResult(lessonId: string, participantId: string, itemId: string, result: LessonItemResult | null): Promise<void>;
  setAttendance(lessonId: string, participantId: string, attendance: AttendanceStatus): Promise<void>;
  getHandoutUrl(lessonId: string, opts: { format: "pdf" | "html"; studentId?: string; answers?: boolean }): string;
  listHomeworkPlans(): Promise<HomeworkPlanListItem[]>;
  getHomeworkPlanNewForm(src: { lessonId: string; studentId?: string } | { groupId: string } | { studentId: string }): Promise<HomeworkPlanNewModel>;
  createHomeworkPlan(input: CreateHomeworkPlanInput): Promise<{ planId: string; plan: CreatePlanOutcome }>;
  getHomeworkPlanBoard(planId: string): Promise<HomeworkPlanBoardModel & { serverNow: string }>;
  getHomeworkPlanStatus(planId: string): Promise<HomeworkPlanStatus>;
  saveHomeworkPlanItems(planId: string, participantId: string, ids: string[]): Promise<HomeworkPlanItem[]>;
  issueHomeworkPlan(planId: string, participantIds?: string[]): Promise<IssueResult>;
  deleteHomeworkPlan(planId: string): Promise<void>;
}
type CreatePlanOutcome = "queued" | "skipped" | "unavailable" | "budgetExhausted" | "queueFull";
```

Mock data requirements: at least one group lesson in each derived status (planned with time, planned without
time, active with live submissions in every `SolutionCheckStatus` and an `UNCERTAIN` + injection-flagged
one, finished with auto-results), one individual manual lesson, one lesson with a failed participant for
each `PlanErrorCode`, one pending-then-ready generation, one stale participant (`createdAt` > 15 min ago, no
plan/error), and homework drafts: fully issued, partially issued with an issue failure (solved conflict), a
draft with a past deadline, a draft created from a lesson.

---

## 7. Open questions / things that cannot be done natively as-is

1. **Entry to the homework drafts list.** On the site `/teacher/homework-plans` has no visible link (the nav
   item only highlights; the list is reached after deleting a draft or by URL). Proposal: a segmented control
   "Уроки / Черновики ДЗ" inside the "Занятия" tab. Needs owner confirmation; also whether mobile should get
   a "create draft" entry directly on that list (the site deliberately has none).
2. **PDF / print handout.** Generated server-side (headless Chromium, KaTeX HTML); can fall back to HTML when
   the renderer is down. Native approach: authenticated download → `expo-sharing` / system viewer; for HTML
   use `expo-print` (print or "save as PDF"). In the mock-only first version there is no server to render —
   either hide these actions behind a "coming with the server" stub or bundle a sample PDF. Decision needed.
3. **LaTeX statements.** `conditionLatex` is rendered with KaTeX plus a custom line-breaking rule
   (`lib/math-line-breaks.ts`). React Native has no native KaTeX: use a WebView-based renderer (auto-height,
   one WebView per row is heavy on a 30×40 board) or pre-render server-side to SVG/HTML. Suggested: a single
   shared math renderer component with caching and collapsed-by-default statements on the group board.
4. **Stale `issuedAssignmentId` after homework cancellation.** The read model hides a cancelled assignment
   (participant looks "not issued"), but the DB value stays, so on the site set edits/regenerate return 409
   "ДЗ уже выдано. Сначала отмените его." and "Выдать" silently skips the participant ("Все выбранные ученики
   уже получили это ДЗ"); the list's `issuedCount` and the status route also still count it. Should the
   mobile server clear the stamp on cancellation (so re-issuing works), or keep parity with the site? The
   mock should pick one behaviour explicitly — recommended: clear on cancel.
5. **Stale detection after "Retry" on old lessons.** Stale is computed from `participant.createdAt`, which the
   server never updates on regenerate (the client patches it locally, but the next board refetch restores
   the old value → a regenerated participant of a lesson older than 15 min immediately looks "stale" while
   the generation is actually running). Proposal for the mobile API: expose `planRequestedAt` (set at create
   and at every regenerate) and compute stale from it.
6. **Time zones.** The site assumes `Europe/Moscow` server time. The create-lesson form sends `startsAt` as a
   local wall-clock string without offset (`YYYY-MM-DDTHH:mm`, interpreted in the server zone), while the
   board's "Назначить время" and the homework deadline send UTC ISO strings (interpreted from the browser
   zone). "In class since" is always shown in Moscow time; "today" grouping uses the server zone. Mobile
   proposal: always send ISO with offset; decide whether displays use device time or fixed Moscow time
   (recommend fixed Moscow time for parity with students/teachers in other zones — needs owner decision).
7. **Realtime transport.** SSE over `EventSource` is not built into React Native (needs a polyfill such as
   `react-native-sse`) and does not survive backgrounding. The site already has polling fallbacks (2 s
   generation, 15 s live) that are sufficient for v1; push notifications for "student idle 15 min" / "plan
   ready" could be a later addition. Decide: SSE polyfill vs polling-only for v1.
8. **Heavy payloads.** The lesson board ships the entire bank (all topics × all numbers) for the manual-add
   picker, and re-fetches the whole board on every change. For mobile: lazy bank endpoint (topics, then
   numbers per topic), mutation responses returning the changed fragment, and item-level optimistic updates.
9. **Finish lesson has no confirmation on the site** and is irreversible (auto-marks NOT_SOLVED / SKIPPED and
   attendance). On a touch screen an accidental tap is likelier — suggest a confirmation alert (copy needs to
   be written; no dictionary key exists).
10. **Rescheduling.** The API allows moving a scheduled lesson (including the "reopen" rules), but the site
    only shows the picker for lessons without a time. Should mobile expose "change time" for planned lessons?
11. **Keyboard hotkeys** (1/2/3/4 for results, arrows for row navigation) and the hint text
    `lessonBoard.hotkeysHint` have no mobile equivalent — drop.
12. **Result toggle on a finished/planned lesson.** The API accepts result marks in any lesson status and
    always overwrites the student's traffic light (including clearing it when switching to "не успел"/none).
    Confirm that mobile should keep this unrestricted behaviour.
13. **Lesson board opened with a homework-draft id.** The site's lesson page does not check `kind` (a draft id
    renders as a lesson board; the DELETE lesson route also deletes drafts). The mobile API should return 404
    for the wrong kind — confirm no flow relies on the loose behaviour.
14. **`minutes` and lesson `comment` are stored but not displayed** on the lesson board (comment is displayed
    on the homework board, where it is always null). Should mobile show the AI time estimate / comment per
    problem, or keep parity (hidden)?
15. **Photo viewing.** Submission photos are served by the cookie-protected `/files/{fileId}` route. Mobile
    needs token-authenticated image requests (headers on `Image` source / download to cache) and a native
    zoomable viewer; mock needs bundled sample images.
16. **Developer role on mobile.** Developer sees every teacher's lessons in one flat list with no teacher name
    on the card (the view model has no `teacherName`). If the developer role ships on mobile, consider adding
    `teacherName` to list items.
17. **Global AI limits in the mock.** `budgetExhausted` / `queueFull` / `unavailable` depend on global server
    state and dev-panel settings. The mock needs a debug switch to force each outcome so the corresponding UI
    states can be built and tested.
