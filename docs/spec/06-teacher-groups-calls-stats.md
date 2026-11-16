# 06 — Teacher: groups, attendance, parent calls, statistics

Subsystem spec for the native mobile rewrite (Expo / React Native, TypeScript, mock data behind a typed API client).
Everything below is derived from the site code; file references are relative to the web repo root.

Sources read:

- Pages: `app/(dashboard)/teacher/groups/page.tsx`, `.../groups/[groupId]/page.tsx`, `.../groups/[groupId]/export/pdf/route.ts`, `.../teacher/calls/page.tsx`, `.../teacher/statistics/page.tsx`, `.../teacher/page.tsx` (calls widget)
- Components: `group-create-form.tsx`, `group-members-manager.tsx`, `group-member-editor.tsx`, `group-statistics-section.tsx`, `group-attendance-section.tsx`, `teacher-parent-calls-list.tsx`, `teacher-stats-section.tsx`, `teacher-statistics-drilldown.tsx`, `count-up-value.tsx`, `progress-timeline-chart.tsx`, `teacher-progress-timeline-filter.tsx`, `delete-button.tsx`, `dashboard-nav.tsx`, `dashboard-realtime-listener.tsx`
- Server: `actions/group.ts`, `app/api/teacher/parent-calls/route.ts`, `app/api/teacher/statistics/drilldown/route.ts`, `app/api/teacher/lessons/[lessonId]/participants/[participantId]/attendance/route.ts`, `app/api/notifications/route.ts`, `lib/api-rate-limit.ts`
- Logic: `lib/attendance.ts`, `lib/report-period.ts`, `lib/parent-call-state.ts`, `lib/parent-calls.ts`, `lib/group-statistics.ts`, `lib/group-statistics-data.ts`, `lib/teacher-statistics.ts`, `lib/week-buckets.ts`, `lib/progress-timeline.ts`, `lib/student-streak.ts`, `lib/lesson-status.ts`, `lib/lesson-finalize.ts`, `lib/group-attendance-pdf.tsx`, `lib/platform-data.ts` (`getTeacherGroups`, `getGroupDetail`, `getGroupAttendance`, `getTeacherLessons`, `getTeacherTopicsOverview`, `getTeacherStatisticsDrilldown`, `getProgressTimeline`, `getDeveloperStatistics`), `lib/notification-text.ts`
- Dictionaries: `lib/i18n/dictionaries/planner.ts` (`common`, `groups`, `attendance`, `groupStatistics`, `calls`, `statistics`, `teacherStats`, `drilldown`), `students.ts` (`timelineFilter`, `timelineChart`, `timeline`), `api-common.ts`, `api-planner.ts`, `api-content.ts`, `records.ts`, `ru.ts`/`en.ts` (`nav`, `teacherHome`), `topics.ts` (`widgets.confirm`)
- Schema: `prisma/schema.prisma` (`StudentGroup`, `StudentProfile`, `ParentCallLog`, `LessonParticipant`, enums)

---

## 0. Roles, routes and how developer routes map

Roles: `STUDENT | TEACHER | DEVELOPER` (`UserRole`). This subsystem is used by TEACHER and DEVELOPER only.

**Developer URL alias.** There are no separate developer pages. `next.config.ts` rewrites `/developer` → `/teacher` and `/developer/:path*` → `/teacher/:path*`. `middleware.ts` redirects a DEVELOPER (cookie `tutor_role`) who opens `/teacher/...` to `/developer/...`, and a non-developer who opens `/developer/...` back to `/teacher/...`. Real permission checks are in `requireUser([...roles])` inside each page. Pages compute `prefix = role === DEVELOPER ? "/developer" : "/teacher"` and build all links with it.

| Site route | TEACHER | DEVELOPER | In nav |
|---|---|---|---|
| `/teacher/groups` (`/developer/groups`) | yes (own groups) | yes (all groups, cannot create) | TEACHER tab "группы / groups". **Not in the DEVELOPER nav** (reachable by URL only) |
| `/teacher/groups/[groupId]` | yes (own) | yes (any) | — |
| `/teacher/groups/[groupId]/export/pdf?period=` | yes (own) | yes (any) | — (download link) |
| `/teacher/calls` (`/developer/calls`) | yes: own students, can record calls | yes: all students, **read-only** | TEACHER tab "звонки / calls"; DEVELOPER tab "звонки / calls" |
| `/teacher/statistics` (`/developer/statistics`) | **no** — `requireUser(UserRole.DEVELOPER)` redirects a teacher to their role home | yes | DEVELOPER tab "статистика / statistics" only |
| `/teacher` (overview, has a calls widget) | yes | no (`requireUser(UserRole.TEACHER)`) | TEACHER tab "обзор / overview" |

Nav order (from `components/dashboard-nav.tsx`, labels `dict.nav.*`):

- TEACHER: overview · topics · students · **groups** · lessons · **calls** · settings
- DEVELOPER: topics · accounts · **calls** · **statistics** · panel · settings

Important: despite living under `/teacher/statistics`, the statistics page is **developer-only**. A teacher has no statistics screen; the only "statistics" a teacher sees in this subsystem is the "Group statistics" block on the group page.

Ownership scoping (SEC-002/003), used everywhere below:

- `ownStudentsWhere(viewer)`: TEACHER → `{ teacherId: viewer.id }` on `User`; DEVELOPER → no filter.
- `ownResourceWhere(viewer)`: TEACHER → `{ teacherId: viewer.id }` on groups/lessons; DEVELOPER → no filter.
- A foreign resource is indistinguishable from a missing one (always 404 / `notFound()`, never 403).

All date maths on the server runs in the process time zone `TZ=Europe/Moscow`. The mock must compute calendar days, week buckets, "today" and the academic year in **Europe/Moscow**, not in the device time zone.

---

## 1. Screens

Every page has the same header (`ShbzPageHeader`): small kicker, big title, and on the right a "find problem number" search (`ShbzNumberSearch`, endpoint `/api/teacher/topics/find-number` — belongs to the topics subsystem; on mobile it is a header search icon, out of scope here).

### 1.1 Groups list — `/teacher/groups`

- Roles: TEACHER (own groups), DEVELOPER (all groups; no create form).
- Purpose: list student groups, create a group, jump to a group or to "compose a lesson" for it.
- Data: `getTeacherGroups(user)` (cached 60 s, tag `teacherStudents`).

Layout top to bottom:

1. Header: kicker `dict.planner.groups.list.kicker` ("Группы" / "Groups"), title `...list.title` ("Группы учеников" / "Student groups").
2. Notice banner (one at most, `aria-live=polite`), driven by redirect query params:
   - `?groupDeleted=1` → success: `list.notices.deleted` "Группа удалена. Ученики остались на платформе." / "Group deleted. The students stay on the platform."
   - `?groupError=invalid` → error: `list.notices.invalid` "Проверьте название группы (до 120 символов) и класс (1–11)." / "Check the group name (up to 120 characters) and grade (1–11)."
   - `?groupError=missing` → error: `list.notices.missing` "Группа не найдена — возможно, её уже удалили." / "Group not found — it may already be deleted."
   - `?groupError=save` → error: `list.notices.save` "Не удалось сохранить изменения. Применена ли миграция уроков и групп?" / "Could not save changes. Has the lessons and groups migration been applied?"
3. Section "Создать группу" / "Create group" (`list.create`) — **hidden for DEVELOPER**. Form `GroupCreateForm`:
   - Text input "Название" / "Name" (`createForm.nameLabel`), required, `maxLength=120`, placeholder `createForm.namePlaceholder` ("9 класс, ОГЭ по субботам" / "Grade 9, Saturday exam prep").
   - Number input "Класс" / "Grade" (`createForm.gradeLabel`), `min=1 max=11 step=1`, placeholder "—", optional.
   - Submit button "Создать группу" / "Create group" (`createForm.submit`), **disabled while `name.trim()` is empty**.
   - No subject field in the UI (server defaults `subject = MATH`).
   - Submits `createGroupAction`; on success the site navigates to the new group page with `?groupCreated=1`.
4. Section "Текущие группы" / "Current groups" (`list.current`):
   - Empty state card: `list.emptyTitle` "Пока ни одной группы." / "No groups yet." + `list.emptyHint` "Создайте группу и добавьте в неё учеников — после этого можно составлять уроки с ИИ-подбором." / "Create a group and add students — then you can compose lessons with AI selection."
   - Otherwise a responsive grid of cards (`minmax(300px, 1fr)`), ordered by `createdAt` ascending. Each card:
     - Group name (bold, truncated to one line).
     - Sub-line: `"{n} класс · "` (`list.grade`, only when `grade` is set) + `"создана {date}"` (`list.createdAt`, `formatShortDate(createdAt, locale)` = "5 сентября 2026" / "5 September 2026", the trailing " г." is stripped).
     - Green chip with member count: `plural(locale, membersCount, common.studentForms)` → "1 ученик / 2 ученика / 5 учеников", en "1 student / 2 students".
     - Members line: first 3 member names joined with ", " plus `" и ещё {n}"` / `" and {n} more"` (`list.andMore`) when more than 3; if no members → `list.noStudents` "Учеников пока нет." / "No students yet."
     - Buttons: outline "Открыть" / "Open" (`common.open`) → `{prefix}/groups/{id}`; primary "Составить урок" / "Compose lesson" (`list.composeLesson`) → `{prefix}/lessons/new?groupId={id}` (lesson planner subsystem).

States: no skeleton of its own (route-level `loading.tsx`); errors from actions come back as the notices above. If the groups tables are missing, `getTeacherGroups` degrades to an empty list.

Mobile translation:

- Tab "Groups" in the teacher tab bar (or an item in a "More" stack if the bar is full). For DEVELOPER there is no nav entry on the site — see open question Q2.
- `FlatList` of group cards; pull-to-refresh.
- "Create group" → FAB / header "+" that opens a bottom sheet with Name + Grade (numeric keypad, 1–11) and a disabled-until-valid submit button. Hidden for DEVELOPER.
- Notices → toast/snackbar after the mutation resolves (no query-string round trip natively).
- Card tap → group detail; "Compose lesson" is a secondary button on the card.

### 1.2 Group detail — `/teacher/groups/[groupId]`

- Roles: TEACHER (own group), DEVELOPER (any). Foreign/missing group → 404 page.
- Purpose: manage members and their AI profile, see group statistics, mark attendance, see recent lessons, rename/delete the group.
- Data, in this order:
  1. `getGroupDetail(user, groupId)` → `null` → `notFound()`.
  2. `finalizeRecentlyFinishedLessons({ teacherId })` for TEACHER (no scope for DEVELOPER) — lazily closes lessons that ended by schedule, which also sets attendance (see 4.3).
  3. In parallel: `getTeacherLessons(user, { groupId })`, `getGroupStatistics(user, members, now, locale)`, `getGroupAttendance(user, groupId, academicYearStart(now), now)`.

Layout top to bottom:

1. Header: kicker `groups.detail.kicker` ("Группа" / "Group"), title = group name.
2. Action row:
   - Primary "Составить урок" / "Compose lesson" (`detail.composeLesson`) → `{prefix}/lessons/new?groupId={id}`.
   - Outline "Выдать ДЗ группе" / "Assign homework to group" (`detail.issueHomework`) → `{prefix}/homework-plans/new?groupId={id}`.
3. Notice banner from query params:
   - `?groupCreated=1` → success `detail.notices.created` "Группа создана. Добавьте в неё учеников." / "Group created. Add students to it."
   - `?groupSaved=1` → success `detail.notices.saved` "Группа сохранена." / "Group saved."
   - `?groupError=invalid` → error `detail.notices.invalid` "Проверьте заполнение формы." / "Check the form."
   - `?groupError=save` → error `detail.notices.save` "Не удалось сохранить изменения." / "Could not save changes."
4. **Section "Участники" / "Participants"** (`detail.participants`) — `GroupMembersManager`:
   - Header line: `"Участники · {n}"` / `"Participants · {n}"` (`membersManager.participants`) on the left; on the right a transient status text: `common.saving` "Сохраняем…" / "Saving…" while a mutation runs, then `common.saved` "Сохранено" / "Saved" (green) or `common.error` "Ошибка" / "Error" (red) for **2000 ms**.
   - Empty: `membersManager.empty` "В группе пока никого нет — найдите ученика в поле ниже." / "The group is empty — find a student in the field below."
   - Member cards (ordered by student name ascending). Each card:
     - Name (bold), email (muted).
     - Three count chips: green count, yellow count, red count = number of the student's `StudentTopicNumberStatus` rows with that status across the whole bank (`progress.greenCount/yellowCount/redCount`). Chips are numbers only, coloured by status.
     - Remove button "×" (icon, aria `membersManager.removeAria` "Убрать {name} из группы" / "Remove {name} from the group"), disabled while a mutation is pending. Opens a confirm dialog: kicker `topics.widgets.confirm.kicker` "Подтверждение" / "Confirmation"; title `membersManager.removeTitle` "Убрать из группы?" / "Remove from the group?"; description `«{name}»` + `membersManager.removeAfter` " перестанет состоять в группе. Аккаунт и весь прогресс ученика сохранятся." / " will leave the group. The account and all progress are kept."; confirm button `membersManager.removeConfirm` "Да, убрать" / "Yes, remove"; pending label `widgets.confirm.pending` "Удаляем…" / "Deleting…"; cancel `widgets.confirm.cancel` "Отмена" / "Cancel". Confirm → `removeGroupMemberAction`, then page refresh.
     - Inline AI-profile editor (`GroupMemberEditor`), autosave, no submit button:
       - "Скорость" / "Speed" (`memberEditor.speed`) — select with 11 options: `""` → `memberEditor.speedNotSet` "Не указана" / "Not set", then `1..10` → `memberEditor.speedOf` "{n} из 10" / "{n} of 10". Changing the select saves **immediately** (sends the new speed together with the current note text).
       - "Заметка для ИИ" / "Note for AI" (`memberEditor.aiNote`) — single-line text input, `maxLength=300`, placeholder `memberEditor.aiNotePlaceholder` "Например: теряется в длинных выкладках" / "For example: gets lost in long derivations". Saves **on blur**, only if the text differs from the last saved value (sends current speed + note).
       - Status text next to the fields: "Сохраняем…" while pending, then "Сохранено" / "Ошибка" for **2200 ms**.
   - Add-member search box (max width ~ 36 rem): text input, placeholder `membersManager.addPlaceholder` "+ Добавить ученика — начните вводить имя…" / "+ Add student — start typing a name…".
     - Suggestions dropdown opens on focus/typing and only when the trimmed query is non-empty; closes on outside tap.
     - Suggestions = `allStudents` (the viewer's students) **not already in this group**, whose `name.toLowerCase()` contains the lower-cased query, first **8** (`MAX_SUGGESTIONS = 8`). Search is by name only (not email).
     - Each suggestion row: student name; if the student is in a different group (`groupId` set and `!== this group`), a yellow suffix `membersManager.inOtherGroup` "в другой группе — будет переведён сюда" / "in another group — will be moved here".
     - No matches: `common.nobodyFound` "Никого не нашлось" / "No one found".
     - Tapping a suggestion clears the query, closes the dropdown and calls `addGroupMemberAction` **without confirmation** (even when it moves the student from another group); on `ok` the page refreshes. Suggestions are disabled while a mutation is pending.
5. **Section "Статистика группы" / "Group statistics"** (`detail.statistics`) — `GroupStatisticsSection` (see rules in 4.2):
   - No members: `groups.statistics.empty` "Статистика появится, когда в группе будут ученики." / "Statistics will appear once the group has students."
   - Four summary tiles (label / big value / hint):
     1. `statistics.mostActive` "Самый активный" / "Most active": value = `mostActive.name` or "—"; hint = `statistics.activityHint` "{d7} за 7 дней · {d30} за 30" / "{d7} in 7 days · {d30} in 30" or, when there is no most-active member, `statistics.noActivity` "пока нет активности" / "no activity yet".
     2. `statistics.leastActive` "Меньше всех активности" / "Least active": value = `leastActive.name` or "—"; hint = same `activityHint` (no hint when null).
     3. `statistics.closedByGroup` "Закрыто группой" / "Closed by the group": value `statistics.closedFor7` "{n} за 7 дней" / "{n} in 7 days" (`totals.closed7`); hint `statistics.closedHint` "{d30} за 30 дней · красных {red}" / "{d30} in 30 days · red {red}" (`totals.closed30`, `totals.red30`).
     4. `statistics.needsAttention` "Нужно внимание" / "Needs attention": value = `statistics.nobody` "никому" / "no one" when `totals.attentionCount === 0`, else `statistics.ofMembers` "{n} из {total}" / "{n} of {total}"; hint = `statistics.overdueHomework` "просроченных ДЗ: {n}" / "overdue homework: {n}" when `totals.overdueHomeworks > 0`, else `statistics.noOverdueHomework` "просроченных ДЗ нет" / "no overdue homework".
   - Per-member table (rows already sorted by activity, see 4.2). Column headers (desktop only): `colStudent` "Ученик"/"Student", `col7` "7 дн."/"7 d", `col30` "30 дн."/"30 d", `colRed` "Красн."/"Red", `colStreak` "Стрик"/"Streak", `colActivity` "Активность"/"Activity", `colReport` "Отчёт"/"Report". Below `lg` each row is a stacked block and every number is followed by an inline label (`for7` "за 7 дн."/"in 7 d", `for30` "за 30 дн."/"in 30 d", `red` "красных"/"red", `streak` "стрик"/"streak") — this stacked form is the phone layout.
     - Rank badge (circle with `rank`); rank 1 uses the accent gradient **only when `stats.mostActive` is non-null**.
     - Name → link to `{prefix}/students/{id}` (teacher-students subsystem).
     - Attention chips (yellow), zero or more strings from `row.attention` (already localized on the server, see 4.2).
     - Four numbers with a count-up animation: `closed7`, `closed30`, `red30` (red text when `red30 >= 5`), `streak`.
     - Activity text: `statistics.notStarted` "ещё не начинал" / "not started yet" when `lastActivityAt` is null; `statistics.today` "сегодня"/"today" when `idleDays === 0`; `statistics.yesterday` "вчера"/"yesterday" when `idleDays === 1`; otherwise `formatShortDate(lastActivityAt, locale)`. Appended `" · " + statistics.activeHomework` "ДЗ в работе: {n}" / "homework in progress: {n}" when `activeHomeworks > 0`.
     - Report buttons (download links to the student weekly PDF — teacher-students subsystem): `common.forSevenDays` "7 дней"/"7 days" → `{prefix}/students/{id}/export/pdf`; `common.forThirtyDays` "30 дней"/"30 days" → `{prefix}/students/{id}/export/pdf?period=30d`.
6. **Section "Посещаемость" / "Attendance"** (`detail.attendance`) — `GroupAttendanceSection`:
   - Scope: lessons of this group for the **current academic year** (from `academicYearStart(now)` to now), see 4.3 for the exact filter.
   - Empty states: no members → `groups.attendance.emptyMembers` "Посещаемость появится, когда в группе будут ученики." / "Attendance will appear once the group has students."; members but no lessons → `groups.attendance.emptyLessons` "Прошедших занятий с назначенным временем у группы пока нет — таблица появится после первого урока." / "The group has no past lessons with a set time — the table appears after the first lesson." PDF links are shown under the empty text only when `lessons.length > 0` (i.e. the "no members but lessons exist" case).
   - Top row: hint `groups.attendance.hint` "Отметки ставятся сами по активности на уроке; клик по ячейке переключает: был → опоздал → не был → по уважительной." / "Marks are set automatically from lesson activity; clicking a cell cycles: present → late → absent → excused." and PDF links: label `groups.attendance.pdf` "PDF:" + three outline buttons `common.forSevenDays` "7 дней"/"7 days", `common.forThirtyDays` "30 дней"/"30 days", `common.academicYear` "учебный год"/"academic year" → `{prefix}/groups/{groupId}/export/pdf?period=7d|30d|year`.
   - Error banner (red) with the server message or `groups.attendance.saveFailed` "Не удалось сохранить отметку." / "Could not save the mark."
   - Matrix table, horizontally scrollable inside its own container, first column sticky:
     - Rows = current group members (name asc). Columns = lessons ordered by `startsAt` ascending, plus a last "Итого" / "Total" (`groups.attendance.total`) column. First column header `groups.attendance.student` "Ученик"/"Student".
     - Lesson column header: `dd.MM` date (`Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" })`), tooltip = `"{lesson.title} · {formatDateTime(startsAt)}"`; it is a link to `{prefix}/lessons/{lessonId}`; header text uses the accent colour when the lesson is `ACTIVE`, muted when `FINISHED`.
     - Cell when the member was **not a participant** of that lesson: a muted "·" with tooltip `groups.attendance.notParticipated` "не участвовал в занятии" / "did not take part in the lesson" (not tappable).
     - Cell when the member is a participant: a pill button showing `dict.planner.attendance.labels[value].short`; tooltip / a11y label uses `.label`:

       | value | ru label / short | en label / short | style |
       |---|---|---|---|
       | `UNKNOWN` | не отмечено / — | not marked / — | transparent, dashed border, soft text |
       | `PRESENT` | был / был | present / yes | green soft bg, green text |
       | `LATE` | опоздал / опозд. | late / late | yellow soft bg, yellow text |
       | `ABSENT` | не был / нет | absent / no | danger bg, danger text |
       | `EXCUSED` | по уважительной / уваж. | excused / exc. | neutral bg, kicker text |

     - Tap on a pill cycles the value with `nextAttendance` (4.3), applies it optimistically, sends `PATCH /api/teacher/lessons/{lessonId}/participants/{participantId}/attendance`, and on failure reverts and shows the error banner. Only the pill being saved is disabled (`busyId`); there is a single `busyId`, so effectively one save at a time.
     - "Итого" cell per member: `"{attended} / {counted}"` + `" · {percent}%"` when `percent !== null`; "—" when `counted === 0`. Computed client-side with `summarizeAttendance` over the member's cells including optimistic overrides (4.3).
   - Rows are only **current** members: participants of old lessons who have left the group are not shown; a current member who joined later shows "·" for earlier lessons.
7. **Section "Занятия группы · {N}" / "Group lessons · {N}"** (`detail.lessons` + total count):
   - Empty: `detail.noLessons` "Занятий у группы пока нет — соберите первое кнопкой «Составить урок»." / "The group has no lessons yet — build the first one with "Compose lesson"."
   - Otherwise the **first 3** lessons (list is ordered by lesson `createdAt` descending): title; sub-line `formatDateTime(startsAt ?? createdAt, locale)` (`dd.MM.yyyy, HH:mm`) + " · " + `common.minutesShort` "{n} мин"/"{n} min"; outline button "Открыть"/"Open" → `{prefix}/lessons/{id}`.
   - Link `detail.allLessons` "Все занятия →" / "All lessons →" → `{prefix}/lessons` (shown when there is at least one lesson).
8. **Section "Настройки группы" / "Group settings"** (`detail.settings`):
   - Rename form: input "Название группы" / "Group name" (`detail.nameLabel`), required, `maxLength=120`, prefilled; button "Переименовать" / "Rename" (`detail.rename`) → `renameGroupAction`.
   - Danger button "Удалить группу" / "Delete group" (`detail.delete`) → confirm dialog: title `detail.deleteTitle` "Удалить группу?" / "Delete group?"; description `detail.deleteBefore` "Группа " / "Group " + **«{name}»** + `detail.deleteAfter` " будет удалена. Ученики и их прогресс не удаляются — они просто перестанут состоять в группе." / " will be deleted. Students and their progress are kept — they just leave the group."; confirm `widgets.confirm.confirm` "Да, удалить" / "Yes, delete"; pending "Удаляем…" / "Deleting…"; cancel "Отмена" / "Cancel" → `deleteGroupAction` → back to the list with `?groupDeleted=1`.
   - Grade and subject cannot be edited after creation (no UI, no action).

Mobile translation:

- Stack screen pushed from the groups list; title = group name; header overflow menu ("⋯") with Rename and Delete (rename → small bottom sheet with one field; delete → native confirm alert with the same copy).
- Primary actions "Compose lesson" / "Assign homework" as two buttons under the title (or a FAB with two actions).
- Body as a segmented control / top tabs: **Members · Statistics · Attendance · Lessons** (the four long sections do not fit one scroll comfortably on a phone).
  - Members: list of member cards; tapping a card expands the AI-profile editor (speed picker as a bottom-sheet wheel or 1–10 chip row with "Not set"; note as a text field saved on blur/"Done"); swipe-to-remove or a trailing "×" with a confirm alert. "Add student" → full-screen/bottom-sheet search with the 8-item suggestion rule and the "will be moved here" warning.
  - Statistics: 2×2 tile grid + ranked member list (stacked row layout from the site's `< lg` breakpoint). PDF buttons open the report through the OS share/preview sheet (see Q5).
  - Attendance: see Q4 — recommended: horizontally scrollable matrix with a sticky name column **plus** a per-lesson list mode (pick a lesson → list of participants with a 4-option segmented picker). Tap cycles as on the site; long-press opens an action sheet with all five values explicitly.
  - Lessons: the 3 most recent + "All lessons" link to the lessons tab.

### 1.3 Group attendance PDF — `/teacher/groups/[groupId]/export/pdf?period=7d|30d|year`

Not a screen: a GET that returns `application/pdf` as an attachment (see 3.8). Landscape A4, **Russian only** (PDFs are never translated). Content: brand header with "ПОСЕЩАЕМОСТЬ · 7 ДНЕЙ | 30 ДНЕЙ | УЧЕБНЫЙ ГОД", group name, period `dd.MM.yyyy — dd.MM.yyyy`, four KPI cards ("Занятий за период", "Средняя посещаемость", "Пропусков", "По уважительной"), table "Сводка по ученикам" (Ученик / Был "5 из 6" / Опоздал / Не был / Уважит. / Посещаемость "83%"), then matrix tables "По занятиям" in chunks of 14 lessons, footer legend "был / опозд. / нет / уваж. · «·» — не участвовал" and page numbers.

Mobile: three buttons (7 days / 30 days / academic year) that download the file with the session credentials and hand it to the share sheet / in-app PDF viewer. In the mock: a bundled sample PDF or a "not available in demo" toast.

### 1.4 Parent calls — `/teacher/calls` (`/developer/calls`)

- Roles: TEACHER — own students, can record calls. DEVELOPER — all students, read-only, sees the teacher name per student and per history entry.
- Purpose: reminder list "who needs a parent call", record a call, read the call history.
- Data: for TEACHER the page first runs `ensureParentCallDueNotifications(user.id)` (lazy reminder notifications, failures are swallowed), then `getParentCallOverview(user)`. Optional query `?studentId=…` (deep link from a notification) highlights that row.

Layout top to bottom:

1. Header: kicker `dict.planner.calls.kicker` "Звонки"/"Calls", title `calls.title` "Звонки родителям"/"Parent calls".
2. Empty state (no students at all): card with `calls.emptyTitle` "Пока ни одного ученика" / "No students yet" and a sentence `calls.emptyBefore` "Добавьте учеников в разделе " + link `calls.emptyLink` "«ученики»" + `calls.emptyAfter` " — здесь появятся напоминания о звонках родителям." (en: "Add students in the " + ""students"" + " section — parent call reminders will appear here."). Link target: `/teacher/students` for TEACHER, `/developer/accounts` for DEVELOPER.
3. Summary line: `calls.summary` "Просрочено: {overdue} · Пора позвонить: {due} · Всего учеников: {total}" / "Overdue: {overdue} · Time to call: {due} · Total students: {total}" (counts computed client-side from the list).
4. One card with a row per student. Server order: `overdue` first, then `due`, then `ok`; inside a state — larger `daysSinceAnchor` first. Desktop column headers: `colStudent` "Ученик"/"Student", `colStatus` "Статус"/"Status", `colActions` "Действия"/"Actions".
   Each row:
   - Student name (bold, one line).
   - Meta line (parts joined with " · "):
     - If `lastReachedAt` is set: `calls.lastCall` "Последний звонок: {date} ({ago})" / "Last call: {date} ({ago})", `date` = `day numeric + month long` in `Europe/Moscow` ("5 ноября" / "5 November"), `ago` = `calls.today` "сегодня"/"today" when `reminder.daysSinceAnchor === 0`, else `calls.daysAgo` "{n} дн. назад" / "{n} d ago".
     - Else: `calls.noCalls` "Звонков ещё не было · ученик добавлен {date}" / "No calls yet · student added {date}" (`studentCreatedAt`).
     - If `attemptAfterLastReached && attemptDaysAgo !== null`: `calls.attempted` "Пытались дозвониться {ago}" / "Tried to call {ago}" (same today / "{n} d ago" rule on `attemptDaysAgo`).
   - DEVELOPER only: `calls.teacher` "Учитель: {name}" / "Teacher: {name}" (`teacherName ?? "—"`).
   - Status chip by `reminder.state`: `overdue` → red chip `calls.overdue` "Просрочено"/"Overdue"; `due` → yellow chip `calls.due` "Пора позвонить"/"Time to call"; `ok` → muted badge `calls.ok` "Созвонились недавно"/"Called recently". (Note: `ok` is shown even for a brand-new student with no calls, as long as fewer than 30 days passed since the student was created.)
   - Actions:
     - TEACHER only: primary button `calls.record` "Записать звонок" / "Log a call" — toggles the inline call form for this row. Disabled while the list is refreshing after a save.
     - Outline button `calls.history` "История ({n})" / "History ({n})" with `n = totalCalls`, or "—" when `totalCalls === 0` (then the button is disabled). Toggles the inline history panel.
   - Only **one panel is open in the whole list** at a time (`openPanel` is a single `{studentId, panel}`); toggling the same button closes it, opening another replaces it.
   - **Call form** (inline panel, TEACHER only):
     - Segmented control (aria `calls.outcomeAria` "Исход звонка"/"Call outcome") with two options: `calls.reached` "Дозвонились"/"Reached" (`REACHED`, **default**) and `calls.noAnswer` "Не дозвонились"/"No answer" (`NO_ANSWER`).
     - Textarea "Комментарий"/"Comment" (`calls.comment`), 3 rows, placeholder `calls.commentPlaceholder` "О чём договорились, что обсудили…" / "What was agreed, what was discussed…". Optional. No client-side length limit; server truncates to 4000 chars.
     - Hint `calls.attemptHint` "Неудачная попытка сохранится в истории, но не сбросит отсчёт напоминания." / "A failed attempt is kept in the history but does not reset the reminder countdown."
     - Error box: server `error` text, else `calls.saveFailed` "Не удалось сохранить звонок. Проверьте соединение и попробуйте ещё раз." / "Could not save the call. Check your connection and try again."
     - Buttons: primary `calls.save` "Сохранить звонок"/"Save call" (label `calls.saving` "Сохраняем…"/"Saving…" while in flight, all controls disabled) and outline `common.cancel` "Отмена"/"Cancel" (closes the panel).
     - On success: panel closes, list is re-fetched (`router.refresh()`); the row moves to its new place because the state/sort changed.
   - **History panel** (inline): the latest **up to 20** entries (`PARENT_CALL_HISTORY_LIMIT = 20`), newest first, although the button shows the total count. Each entry: date-time (`day numeric, month long, HH:mm`, `Europe/Moscow`), "·", outcome label (`calls.reached` in strong text / `calls.noAnswer` in muted text); DEVELOPER additionally sees "— {teacherName}" when present; then the comment (pre-wrapped multi-line text) if any.
5. Highlight from a notification: when the page is opened with `?studentId=X`, that row gets a soft accent background, is scrolled to the centre, and after **1500 ms** the highlight fades and the query param is removed from the URL.

Mobile translation:

- Tab "Calls" for TEACHER and DEVELOPER.
- `SectionList`/`FlatList` of student rows; summary line as a sticky header (three counters).
- "Log a call" → bottom sheet with the outcome segmented control, multi-line comment, hint, Save/Cancel. Keep the single-open rule trivially (one sheet).
- "History (n)" → bottom sheet or pushed screen with the entry list. The mobile API should offer paging beyond 20 (the site has `GET /api/teacher/parent-calls?studentId=` returning up to 100, currently unused by the UI).
- Deep link from a notification (`href = /teacher/calls?studentId={id}`) → open the Calls tab, scroll to the row, flash it for 1.5 s.
- DEVELOPER: no "Log a call" button; teacher name lines visible.
- No phone numbers exist in the data model (the `User` model has only `name`, `email`), so there is no "dial" action — see Q8.

### 1.5 Calls widget on the teacher overview — `/teacher`

One of three nav cards on the teacher home: kicker `dict.teacherHome.calls.kicker` "Звонки"/"Calls", title `teacherHome.calls.title` "Связь с родителями"/"Parent contact", two count-up stats `teacherHome.calls.due` "Пора позвонить"/"Time to call" and `teacherHome.calls.overdue` "Просрочено"/"Overdue" from `getParentCallCounts(user)` (`{ due, overdue }`, counts only — no comments, no history), button `dict.common.go` → `/teacher/calls`. The overview screen itself belongs to the shell spec; this subsystem supplies the counts query.

### 1.6 Statistics — `/teacher/statistics` → `/developer/statistics` (DEVELOPER only)

- Role: DEVELOPER only.
- Header: kicker `dict.planner.statistics.kicker` "Статистика"/"Statistics", title `statistics.title` "Статистика занятий"/"Lesson statistics".
- Segmented view switch (aria `statistics.viewsAria`), implemented as links with a `view` query param:
  - `teacher` (default, no param) — `statistics.views.teacher` "Прогресс учеников" / "Student progress"
  - `?view=teachers` — `statistics.views.teachers` "По учителям" / "By teacher"
  - `?view=developer` — `statistics.views.developer` "Метрики платформы" / "Platform metrics"
- Data loading: `view=teachers` loads only `getTeacherStatistics()`. The other two views both load `getTeacherTopicsOverview(user)`, `getProgressTimeline(selectedStudentId, 112, user)` and `getDeveloperStatistics(user)`.

Helper used everywhere: `completionPercent(done, total) = total ? Math.round(done / total * 100) : 0`.

#### 1.6.a View "Student progress" (`view=teacher`)

1. Four metric cards (label / big value / coloured note), `hw = developerStats.homework`, `issuedTotal = hw.issuedNumbersTotal`:
   - `statistics.solvedOfIssued` "Решено из выданного"/"Solved of assigned": value `"{hw.issuedNumbersSolved} / {issuedTotal}"`; note `statistics.percentIssuedNumbers` "{n}% выданных номеров"/"{n}% of assigned problems" with `n = completionPercent(issuedNumbersSolved, issuedTotal)` (green).
   - `statistics.homeworkDone` "ДЗ выполнено"/"Homework done": value `hw.completedCount`; note `statistics.ofIssuedHomework` "из {n} выданных ДЗ"/"of {n} assigned homework" with `n = hw.total` (green).
   - `statistics.homeworkOverdue` "ДЗ просрочено"/"Homework overdue": value `hw.overdueCount`; note `statistics.percentIssuedHomework` "{n}% выданных ДЗ"/"{n}% of assigned homework" with `completionPercent(overdueCount, total)` (red).
   - `statistics.needHelp` "Нужна помощь"/"Need help": value `hw.issuedNumbersRed`; note `percentIssuedNumbers` with `completionPercent(issuedNumbersRed, issuedTotal)` (red).
2. Card `statistics.progressDynamics` "Динамика прогресса"/"Progress over time":
   - Student filter (top right): label `dict.students.timelineFilter.label` "Ученик"/"Student"; select options: `""` → `timelineFilter.all` "Все ученики"/"All students", then every student (name). Changing it replaces the URL query `studentId` (keeps `view`), which re-renders the page with the timeline for that student (`getProgressTimeline(studentId, 112, user)`); select disabled while navigating.
   - `ProgressTimelineChart` (client): period segmented control `7d` / `4w` / `8w` (`dict.students.timelineChart.period7d` "7 дней"/"7 days", `period4w` "4 недели"/"4 weeks", `period8w` "8 недель"/"8 weeks"; default `7d`); two totals pills `timelineChart.closed` "Закрыто:"/"Closed:" `{closedTotal}` and `timelineChart.red` "Красных:"/"Red:" `{redTotal}`; a trend line with arrow ↑ / ↓ / → and label (see 4.5); hint text `timelineChart.onlyStudent` "Показываем динамику только для ученика {name}." / "Showing progress for {name} only." or `timelineChart.allStudents` "Показываем общий темп по всем ученикам за выбранный период." / "Showing the overall pace across all students for the selected period."; chart title = `dict.students.timeline.periods[period].title` ("За последнюю неделю" / "За последние 4 недели" / "По неделям за 8 недель"; en "Last week" / "Last 4 weeks" / "By week over 8 weeks"); a line+area chart of `closedCount` per point with dots (tooltip `timelineChart.pointTitle` "{label}: закрыто {n}" / "{label}: closed {n}") and date labels (`day numeric, month short`); empty: `timelineChart.empty` "Пока нет данных за выбранный период." / "No data for the selected period yet." (only when there are zero points).
3. Card `statistics.howIssuedSolved` "Как решаются выданные ДЗ"/"How assigned homework is solved":
   - Donut chart over four segments with centre text `"{issuedSolvedPercent}%"` and `statistics.solved` "решено"/"solved". Segments (value, colour): green `hw.issuedNumbersGreen` `#36C77E`; yellow `hw.issuedNumbersYellow` `#F2A93B`; red `hw.issuedNumbersRed` `#E5484D`; empty `hw.issuedNumbersUnmarked` `#C7CAD0`. Angle = `value / issuedTotal * 360`; if `issuedTotal` is 0 or all values are 0 → a single neutral ring.
   - Legend list, one row per segment: colour dot, label + note (`statistics.segments.green` "Зеленые / Уверенно решены" — "Green / Solved confidently"; `yellow` "Желтые / Исправлены после самопроверки" — "Yellow / Fixed after self-check"; `red` "Красные / Требуют помощи преподавателя" — "Red / Needs the teacher's help"; `empty` "Без статуса / Номер еще не отмечен" — "No status / Problem not marked yet"), value and `completionPercent(value, issuedTotal)%`.
   - "Key takeaway" box (`statistics.keyInsight` "Ключевой вывод"/"Key takeaway"): if `issuedNumbersUnmarked > issuedNumbersSolved` → `statistics.insightUnmarked`; else if `issuedNumbersRed > 0` → `statistics.insightRed`; else `statistics.insightGood`.
4. Card `statistics.byStudents` "Что происходит по ученикам"/"What is happening by student" — two ranking cards (each: title, up to 5 items with `#rank` badge, title, subtitle, right-aligned value label, progress bar clamped 0–100):
   - `statistics.mostEngaged` "Самые вовлеченные"/"Most engaged": students with `markedCount > 0`, sorted by `solvedCount` desc then `markedCount` desc, top 5; subtitle `statistics.engagedSubtitle` "{solved} решено · {marked} отмечено"; value/progress = `solvedPercent = completionPercent(solvedCount, stats.totalNumbers)`; tone brand. Empty: `statistics.mostEngagedEmpty` "Пока у учеников нет отмеченных номеров." / "Students have no marked problems yet."
   - `statistics.needReview` "Нужен разбор"/"Need review": students with `redCount > 0`, sorted by `redCount` desc then `redPercent` desc, top 5; subtitle `statistics.reviewSubtitle` "{red} красных · {solved} решено"; value/progress = `redPercent = completionPercent(redCount, stats.totalNumbers)`; tone rose. Empty: `statistics.needReviewEmpty`.
5. Card `statistics.byTopics` "Что происходит по темам"/"What is happening by topic" — two ranking cards:
   - `statistics.bestMastery` "Лучшее усвоение"/"Best mastery": all topics sorted by `solvedPercent` desc then `solvedCount` desc, top 5 (`solvedCount = greenCount + yellowCount`, `solvedPercent = completionPercent(solvedCount, totalSlots)`); subtitle `statistics.masterySubtitle` "решено: {solved} · учеников в работе: {students}" (`studentsWithActivity`); tone emerald (`#36C77E`). Empty: `statistics.bestMasteryEmpty`.
   - `statistics.helpOften` "Где чаще нужна помощь"/"Where help is needed most": topics with `redCount > 0`, sorted by `redCount` desc then `redPercent` desc, top 5 (`redPercent = completionPercent(redCount, totalSlots)`); subtitle `statistics.helpSubtitle` "красных: {red} · отмеченных статусов: {marked}"; tone rose. Empty: `statistics.helpOftenEmpty`.
6. Card `statistics.drilldownTitle` "Срез по теме и ученику"/"Topic and student breakdown" — `TeacherStatisticsDrilldown` (client):
   - If there are no topics or no students: `drilldown.notEnoughData` "Пока недостаточно данных для персонального среза" / "Not enough data for a personal breakdown yet".
   - Left column: three selects — `drilldown.topic` "Тема"/"Topic" (all topics by title; default first), `drilldown.student` "Ученик"/"Student" (all students by name; default first), `drilldown.homework` "ДЗ"/"Homework" (first option `"__all__"` → `drilldown.wholeTopic` "Вся тема"/"Whole topic", then derived options, see 4.6). Two progress rows: `drilldown.solvedInTopic` "Решено в теме"/"Solved in the topic" `"{solvedCount} / {totalNumbers}"` with a bar at `solvedPercent`; `drilldown.markedAtAll` "Отмечено вообще"/"Marked at all" `"{markedCount} / {totalNumbers}"` with a bar at `markedPercent`.
   - Right column: three big status cards (`drilldown.green` "Зелёные"/"Green", `drilldown.yellow` "Жёлтые"/"Yellow", `drilldown.red` "Красные"/"Red") with the counts; a thick progress bar at `solvedPercent`; a "Сейчас"/"Now" (`drilldown.now`) insight box with a generated sentence (4.6).
   - Loading: whenever topic or student changes, `GET /api/teacher/statistics/drilldown?topicId=&studentId=` is fetched (previous request aborted); while loading the insight reads `drilldown.loading` "Загружаем срез…" / "Loading breakdown…"; on error the insight shows the server error or `drilldown.loadFailed` "Не удалось загрузить срез." / "Could not load the breakdown." and counts fall to 0.

#### 1.6.b View "By teacher" (`view=teachers`) — `TeacherStatsSection`

- Empty (no TEACHER users): card `teacherStats.emptyTitle` "Учителей пока нет"/"No teachers yet" + `teacherStats.emptyHint`.
- One card per teacher (teachers ordered by name asc):
  - Header: teacher name, email.
  - Four stat tiles (label / value / optional note): `teacherStats.students` "Ученики"/"Students" = `studentsCount`; `teacherStats.issuedHomework` "Выдано ДЗ"/"Homework assigned" = `homeworkTotal`, note `teacherStats.for30Days` "за 30 дней: {n}"/"last 30 days: {n}" = `homework30d`; `teacherStats.parentCalls` "Созвоны с родителями"/"Parent calls" = `callsReached`, note `teacherStats.noAnswers` "недозвонов: {n}"/"no answer: {n}" only when `callsNoAnswer > 0`; `teacherStats.lessons` "Занятия"/"Lessons" = `lessonsTotal`, note `teacherStats.finished` "проведено: {n}"/"held: {n}" = `lessonsFinished`.
  - "Занятия по неделям"/"Lessons by week" (`teacherStats.lessonsByWeek`): if `lessonsTotal > 0`, a 12-column bar chart (`lessonsByWeek`, oldest → newest; single accent hue; bar height proportional to the max, min 6 px for non-zero, value label above non-zero bars, x-axis label = week start `day numeric, month short` (Europe/Moscow) for every 4th column and the last one; per-bar tooltip `teacherStats.weekFrom` "Неделя с {date}: {count}" with `count` = `plural(common.lessonForms)`). Otherwise `teacherStats.noLessons` "Занятий пока не было."/"No lessons yet."
  - "Темы занятий"/"Lesson topics" (`teacherStats.lessonTopics`), only when `topTopics` is non-empty: up to 5 horizontal bars (title, bar width = `count / max`, count).
  - "Последние занятия"/"Recent lessons" (`teacherStats.recentLessons`), only when non-empty: up to 8 rows: date-time `day numeric, month long, HH:mm` (Europe/Moscow) of `startsAt ?? createdAt`, with suffix `teacherStats.created` " (создано)"/" (created)" when `startsAt` is null; " · " + `topicTitle ?? title`; " · " + (`teacherStats.group` "группа «{name}»"/"group "{name}"" when `groupName` is set, else `plural(participantsCount, common.studentForms)`); right-aligned status `teacherStats.lessonStatus[status]`: `PLANNED` "запланировано"/"planned", `ACTIVE` "идёт сейчас"/"in progress", `FINISHED` "проведено"/"held". **Note:** this uses the stored `Lesson.status`, not the schedule-derived status.
- Footer line when any unattributed counter is > 0: `teacherStats.unattributed` "Вне карточек учителей: "/"Outside teacher cards: " + comma-joined parts (`unattributedStudents` "учеников без учителя — {n}", `unattributedHomework` "ДЗ — {n}", `unattributedCalls` "созвонов — {n}", `unattributedLessons` "занятий — {n}") + ".".
- No call comments anywhere in this view (personal data).

#### 1.6.c View "Platform metrics" (`view=developer`)

1. Four metric cards:
   - `statistics.topics` "Темы"/"Topics": value `stats.totalTopics`; note `statistics.topicsNote` "{n} с активностью ({percent}%)" with `n = activeTopics.length` (topics with `studentsWithActivity > 0`), `percent = completionPercent(activeTopics, totalTopics)`.
   - `statistics.bankNumbers` "Номера в банке"/"Problems in the bank": value `stats.totalNumbers`; note `statistics.bankNote` "{n}% банка решено" with `n = completionPercent(totalSolved, totalStatusSlots)`, `totalStatusSlots = totalStudents × totalNumbers`, `totalSolved = Σ green + Σ yellow`.
   - `statistics.issuedHomework` "Выдано ДЗ"/"Homework assigned": value `hw.total`; note `statistics.issuedNote` "фото решений: {n}" = `hw.photosTotal`.
   - `statistics.students` "Ученики"/"Students": value `"{activeStudents} / {totalStudents}"` (active = `markedCount > 0`); note `statistics.studentsNote` "{n}% активны".
2. Card `statistics.bankUsage` "Использование банка номеров"/"Problem bank usage": four progress rows — `solvedOfBank` "{totalSolved} / {totalStatusSlots}", `redInBank` "{totalRed} / {totalStatusSlots}", `topicsWithActivity` "{activeTopics} / {totalTopics}", `studentsInWork` "{activeStudents} / {totalStudents}"; plus a "Key takeaway" box: `totalUnfilled > totalSolved` → `bankInsightUnmarked`; else `totalRed > 0` → `bankInsightRed`; else `bankInsightGood` (`totalUnfilled = max(totalStatusSlots − stats.totalMarked, 0)`); plus the explainer text `statistics.bankExplainer`.
3. Card `statistics.contentCompleteness` "Полнота контента"/"Content completeness": four progress rows from `developerStats.content` — `numbersWithCondition / totalNumbers`, `numbersWithAnswer / totalNumbers`, `topicsWithTheory / totalTopics`, `topicsWithHomeworkFile / totalTopics`; and a "Пробелы в контенте"/"Content gaps" list: empty → `statistics.contentComplete`; otherwise the first **6** gaps as links to `/teacher/topics/{topicId}/edit` (topics subsystem) with the topic title and a " · "-joined list of `gapNoTheoryFile` "нет файла теории", `gapNoHomeworkFile` "нет файла заданий", `gapNoCondition` "без условия: {n}", `gapNoAnswer` "без ответа: {n}"; and when more than 6: `plural(locale, gaps.length − 6, statistics.moreGapsForms)` ("И ещё {n} тема с пробелами." …).

Mobile translation (statistics):

- DEVELOPER tab "Statistics" with a top segmented control (3 views). Each view is a vertical scroll of cards.
- Metric cards as a 2×2 grid; ranking cards stack vertically (one column).
- Charts: line/area chart, donut and bar chart drawn with `react-native-svg` (or victory-native); replace hover tooltips with tap-to-show value / always-visible labels.
- Timeline student filter and drilldown selects → bottom-sheet pickers (searchable for long student lists).
- Count-up animation (`CountUpValue`): number animates from 0 to the target over **600 ms** with ease-out cubic (`1 − (1 − p)^3`) on mount/whenever the value changes; skipped when the OS "reduce motion" setting is on. On the site it is used for group-statistics numbers and the overview widget counters (the statistics page metric cards are static).

---

## 2. View models (TypeScript)

Dates are ISO-8601 strings in the mobile contract (the site passes `Date` objects inside server components and ISO strings in JSON).

```ts
// ── shared enums ─────────────────────────────────────────────
export type UserRole = "STUDENT" | "TEACHER" | "DEVELOPER";
export type Subject = "MATH" | "INFORMATICS";
export type AttendanceValue = "UNKNOWN" | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED"; // Prisma AttendanceStatus
export type ParentCallOutcome = "REACHED" | "NO_ANSWER";
export type LessonStatus = "PLANNED" | "ACTIVE" | "FINISHED";
export type HomeworkNumberStatus = "GREEN" | "YELLOW" | "RED";
export type ReportPeriod = "7d" | "30d" | "year";
export type Locale = "ru" | "en";

// ── groups list (getTeacherGroups) ───────────────────────────
export type GroupListMember = {
  id: string;            // student user id
  name: string;
  email: string;
  speed: number | null;  // 1..10
  aiNote: string | null; // ≤ 300 chars
};

export type GroupListItem = {
  id: string;
  name: string;              // ≤ 120 chars
  subject: Subject;          // always "MATH" when created from the UI; not displayed
  grade: number | null;      // 1..11
  createdAt: string;         // ISO
  membersCount: number;      // = members.length (only the viewer's own students)
  members: GroupListMember[]; // ordered by name asc
};

// ── group detail (getGroupDetail) ────────────────────────────
export type GroupMember = GroupListMember & {
  progress: { greenCount: number; yellowCount: number; redCount: number };
};

export type GroupCandidate = {
  id: string;
  name: string;
  email: string;
  groupId: string | null;    // current group of the student (may be this group or another)
};

export type GroupDetail = {
  id: string;
  name: string;
  subject: Subject;
  grade: number | null;
  createdAt: string;
  totalNumbers: number;        // total TopicHomeworkNumber rows in the bank; returned but unused by the UI
  members: GroupMember[];      // name asc
  allStudents: GroupCandidate[]; // ALL of the viewer's students (members included), name asc
};

// ── group lessons block (getTeacherLessons(viewer, { groupId })) ──
export type TeacherLessonListItem = {
  id: string;
  title: string;
  status: LessonStatus;        // derived from schedule (deriveLessonStatus)
  durationMinutes: number;
  createdAt: string;
  startsAt: string | null;
  groupId: string | null;
  groupName: string | null;
  soloStudentName: string | null;
  resultsTotal: number;
  resultsMarked: number;
  participantsCount: number;
  readyCount: number;
  failedCount: number;
};
// The group page uses only: id, title, startsAt, createdAt, durationMinutes (first 3 items) and the list length.

// ── group statistics (lib/group-statistics.ts) ───────────────
export type GroupMemberActivity = {
  id: string;
  name: string;
  closed7: number;            // GREEN/YELLOW marks in the last 7 timeline days
  closed30: number;           // … last 30 days
  red30: number;              // RED marks in the last 30 days
  streak: number;             // current streak, days
  overdueHomeworks: number;   // not completed and deadline passed
  activeHomeworks: number;    // not completed, deadline not passed or not set
  lastActivityAt: string | null;
};

export type GroupMemberRow = GroupMemberActivity & {
  rank: number;               // 1-based position after sorting by activity
  idleDays: number | null;    // floor((now − lastActivityAt) / 24h); null = never active
  attention: string[];        // localized flag strings (site). Mobile contract: use codes, see §6
};

export type GroupStatistics = {
  members: GroupMemberRow[];           // sorted by activity
  mostActive: GroupMemberRow | null;
  leastActive: GroupMemberRow | null;
  totals: {
    closed7: number;
    closed30: number;
    red30: number;
    overdueHomeworks: number;
    attentionCount: number;            // members with ≥ 1 attention flag
  };
};

// ── attendance (getGroupAttendance + page mapping) ───────────
export type GroupAttendanceLessonRaw = {
  id: string;
  title: string;
  startsAt: string;                    // never null here
  status: "ACTIVE" | "FINISHED";       // PLANNED lessons are filtered out
  participants: Array<{
    id: string;                        // LessonParticipant id (used in the PATCH URL)
    studentId: string;
    attendance: AttendanceValue;
    joinedAt: string | null;
  }>;
};

// What the component receives:
export type AttendanceCell = { participantId: string; attendance: AttendanceValue };
export type AttendanceLesson = {
  id: string;
  title: string;
  dateLabel: string;   // "dd.MM"
  dateTitle: string;   // "{title} · dd.MM.yyyy, HH:mm"
  status: "ACTIVE" | "FINISHED";
  cells: Record<string /* studentId */, AttendanceCell | undefined>;
};

export type AttendanceSummary = {
  counted: number;        // attended + absent + excused (UNKNOWN is not counted)
  attended: number;       // PRESENT + LATE
  late: number;
  absent: number;
  excused: number;
  percent: number | null; // round(attended / (counted − excused) × 100); null when base is 0
};

// ── parent calls (lib/parent-calls.ts, lib/parent-call-state.ts) ──
export type ParentCallReminderState = "ok" | "due" | "overdue";

export type ParentCallReminder = {
  state: ParentCallReminderState;
  daysSinceAnchor: number;  // calendar days (Moscow) since last REACHED call or student creation; ≥ 0
  daysUntilDue: number;     // max(0, 30 − daysSinceAnchor)
  hasReachedCall: boolean;
};

export type ParentCallEntry = {
  id: string;
  outcome: ParentCallOutcome;
  comment: string | null;     // PERSONAL DATA
  calledAt: string;           // ISO
  teacherName: string | null; // who made the call (null if that teacher was deleted)
};

export type ParentCallStudentOverview = {
  studentId: string;
  studentName: string;
  teacherId: string | null;
  teacherName: string | null;       // shown to DEVELOPER only
  reminder: ParentCallReminder;
  studentCreatedAt: string;
  lastReachedAt: string | null;
  attemptAfterLastReached: boolean; // latest entry is NO_ANSWER and is newer than the last REACHED (or there is none)
  attemptDaysAgo: number | null;    // calendar days since that attempt; null when attemptAfterLastReached is false
  totalCalls: number;               // all log entries (can exceed history.length)
  history: ParentCallEntry[];       // newest first, at most 20
};

export type ParentCallCounts = { due: number; overdue: number }; // overview widget

// ── statistics: topics overview (getTeacherTopicsOverview) ───
export type StatsStudent = {
  id: string; name: string; email: string;
  greenCount: number; yellowCount: number; redCount: number;
  markedCount: number;   // green + yellow + red
  solvedCount: number;   // green + yellow
};

export type StatsTopic = {
  id: string;
  title: string;
  // (the site also spreads all Topic columns + theoryFile/homeworkFile here; statistics uses only the fields below)
  greenCount: number; yellowCount: number; redCount: number;
  markedCount: number;
  totalStudents: number;
  totalNumbers: number;
  totalSlots: number;            // totalNumbers × totalStudents
  studentsWithActivity: number;  // distinct students with ≥ 1 marked number in the topic
  progressPercent: number;       // completionPercent(markedCount, totalSlots)
};

export type TeacherTopicsOverview = {
  students: StatsStudent[];   // name asc
  topics: StatsTopic[];       // displayOrder asc, createdAt asc
  stats: {
    totalTopics: number;
    totalStudents: number;
    totalFiles: number;
    totalNumbers: number;     // Σ topic.totalNumbers
    totalMarked: number;      // Σ topic.markedCount
  };
};

// ── statistics: timeline (getProgressTimeline) ───────────────
export type TimelineEntry = {
  date: string;        // "YYYY-MM-DD", Moscow local date
  closedCount: number; // statuses that became GREEN or YELLOW that day
  redCount: number;    // statuses that became RED that day
};
// Always 112 consecutive entries, oldest → newest, last = today.
export type TimelinePeriod = "7d" | "4w" | "8w";

// ── statistics: developer statistics (getDeveloperStatistics) ─
export type DeveloperStatistics = {
  homework: {
    total: number;
    completedCount: number;
    overdueCount: number;
    inProgressCount: number;
    withPhotosCount: number;
    photosTotal: number;
    issuedNumbersTotal: number;    // distinct (student, number) pairs issued in any homework
    issuedNumbersSolved: number;   // GREEN or YELLOW
    issuedNumbersGreen: number;
    issuedNumbersYellow: number;
    issuedNumbersRed: number;
    issuedNumbersUnmarked: number; // total − marked
  };
  content: {
    totalTopics: number;
    totalNumbers: number;
    numbersWithCondition: number;
    numbersWithAnswer: number;
    topicsWithTheory: number;
    topicsWithHomeworkFile: number;
    gaps: Array<{
      topicId: string;
      title: string;
      noTheoryFile: boolean;
      noHomeworkFile: boolean;
      missingConditions: number;
      missingAnswers: number;
    }>;
  };
};

// ── statistics: drilldown (GET /api/teacher/statistics/drilldown) ──
export type DrilldownNumber = { status: HomeworkNumberStatus | null; deadlineAt: string | null };
export type DrilldownResponse = { numbers: DrilldownNumber[] }; // topic numbers in displayOrder
export type DrilldownTopicOption = { id: string; title: string; totalNumbers: number };
export type DrilldownStudentOption = { id: string; name: string; email: string };

// ── statistics: by teacher (lib/teacher-statistics.ts) ───────
export type TeacherLessonEntry = {
  id: string;
  title: string;
  topicTitle: string | null;
  groupName: string | null;
  participantsCount: number;
  startsAt: string | null;
  createdAt: string;
  status: LessonStatus;        // stored status
};

export type TeacherStatsEntry = {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  studentsCount: number;
  homeworkTotal: number;
  homework30d: number;
  callsReached: number;
  callsNoAnswer: number;
  lessonsTotal: number;
  lessonsFinished: number;
  lessonsByWeek: number[];                 // length 12, oldest → newest
  recentLessons: TeacherLessonEntry[];     // ≤ 8, newest first
  topTopics: Array<{ title: string; count: number }>; // ≤ 5
};

export type TeacherStatistics = {
  teachers: TeacherStatsEntry[];           // name asc
  weekStarts: string[];                    // 12 ISO timestamps: Mondays 00:00 Moscow, oldest → newest
  unattributed: { students: number; homework: number; calls: number; lessons: number };
};
```

---

## 3. Mutations and queries

Two mechanisms exist on the site: **server actions** (`actions/group.ts`, called from forms/client components; they either `redirect(...)` with a status in the query string or return `{ ok: boolean }`) and **JSON API routes**. Common JSON error shape: `{ "error": "<localized message>" }`.

Rate limiting helper `enforceApiRateLimit(scope, userId, limit, windowMs)` (Postgres-backed, **fixed window** aligned to `floor(now / windowMs)`): on limit → HTTP **429** `{ error: dict.apiCommon.rateLimited }` ("Слишком много запросов. Подождите немного и попробуйте снова." / "Too many requests. Wait a moment and try again.") with a `Retry-After` header (seconds); if the limiter store itself fails → HTTP **503** `{ error: dict.apiCommon.serviceUnavailable }` ("Сервис временно недоступен. Попробуйте снова позже." / "The service is temporarily unavailable. Try again later.") with `Retry-After: 5`.

### 3.1 `createGroupAction(formData)` — server action

- Role: **TEACHER only** (`requireUser(UserRole.TEACHER)`; a developer is redirected to their home).
- Input (FormData): `name` (string), `grade` (string, optional), `subject` (optional; `"INFORMATICS"` → INFORMATICS, anything else → MATH; the UI never sends it).
- Validation / normalization:
  - `name` = `normalizeSingleLineText(name)` (control chars → space, collapse whitespace, trim) then `.slice(0, 120)`. Empty → redirect `/teacher/groups?groupError=invalid`.
  - `grade`: empty → `null`; otherwise must be an integer in `1..11`, **an invalid value is silently stored as `null`** (no error).
- Effect: creates `StudentGroup { name, subject, grade, teacherId: user.id }`.
- Success: redirect `/teacher/groups/{id}?groupCreated=1`.
- Failure (DB error): redirect `/teacher/groups?groupError=save`.
- Side effects: `revalidateTeacherStudentsData()` + revalidate `/teacher/groups` and `/teacher/groups/{id}`; pino `group.created`.
- No rate limit.

### 3.2 `renameGroupAction(formData)` — server action

- Roles: TEACHER (own group), DEVELOPER (any group).
- Input: `groupId`, `name`.
- Validation: `name` normalized as above, sliced to 120. Missing `groupId` or empty `name` → redirect `{base}?groupError=invalid` (**to the list page**, `base` = `/teacher/groups` or `/developer/groups`). Group not accessible → `{base}?groupError=missing`.
- Effect: `StudentGroup.name = name`.
- Success: redirect `{base}/{groupId}?groupSaved=1`. DB failure: `{base}/{groupId}?groupError=save`.
- Side effects: same revalidation; pino `group.renamed`.

### 3.3 `deleteGroupAction(formData)` — server action

- Roles: TEACHER (own), DEVELOPER (any).
- Input: `groupId`. Missing → `{base}?groupError=invalid`; not accessible → `{base}?groupError=missing`.
- Effect: deletes the `StudentGroup`. Students are **not** deleted: `StudentProfile.groupId` → `null` (`onDelete: SetNull`); `Lesson.groupId` → `null` (`onDelete: SetNull`) so the group's lessons survive as group-less lessons (and disappear from any attendance table).
- Success: redirect `{base}?groupDeleted=1`. DB failure: `{base}?groupError=save`.
- Side effects: revalidation; pino `group.deleted`.

### 3.4 `addGroupMemberAction(formData): Promise<{ ok: boolean }>` — server action

- Roles: TEACHER, DEVELOPER.
- Input: `groupId`, `studentId`.
- Returns `{ ok: false }` when: a field is missing; the group is not accessible; the student does not exist, is not a `STUDENT`, or (for TEACHER) is not the teacher's own student (`User.teacherId !== viewer.id`); DB error. No error message/code is returned — the UI just shows "Ошибка"/"Error".
- Effect: `StudentProfile.upsert({ where: { userId }, create: { userId, groupId }, update: { groupId } })` — **a student is in at most one group; adding moves them out of their previous group**. `speed`/`aiNote` are untouched.
- Success: `{ ok: true }`; client then refreshes the page data.
- Side effects: revalidation; pino `group.member_added`.

### 3.5 `removeGroupMemberAction(formData): Promise<{ ok: boolean }>` — server action

- Roles: TEACHER, DEVELOPER.
- Input: `groupId`, `studentId`.
- `{ ok: false }` when a field is missing, the group is not accessible, or DB error.
- Effect: `StudentProfile.updateMany({ where: { userId: studentId, groupId }, data: { groupId: null } })`. If the student is not in this group nothing changes and the result is still `{ ok: true }` (idempotent). Account, progress, speed and note are kept. Past `LessonParticipant` rows are not touched.
- Side effects: revalidation; pino `group.member_removed`.

### 3.6 `setStudentAiProfileAction(formData): Promise<{ ok: boolean }>` — server action (StudentProfile.speed / aiNote)

- Roles: TEACHER (own student), DEVELOPER (any student).
- Input: `studentId`, `speed` (string), `aiNote` (string). **Both fields are always written together** (full overwrite).
- Normalization:
  - `speed`: `""` → `null`; else must be an integer in `1..10` (`MIN_SPEED = 1`, `MAX_SPEED = 10`); invalid → `null` (silently).
  - `aiNote`: `normalizeSingleLineText(...)` then `.slice(0, 300)` (`MAX_AI_NOTE_LENGTH = 300`); empty → `null`.
- `{ ok: false }` when `studentId` is missing, the student is not found / not a STUDENT / not owned by the teacher, or DB error.
- Effect: `StudentProfile.upsert({ create: { userId, speed, aiNote }, update: { speed, aiNote } })`. Not tied to group membership — the profile is per student; the only UI for it is the group member card.
- Downstream use: `speed` and `aiNote` go into the AI lesson/homework planner prompt (student dossier). No other visible effect.
- Side effects: `revalidateTeacherStudentsData()` + `/teacher/groups`; error log `group.ai_profile.failed`.
- No rate limit.

### 3.7 `PATCH /api/teacher/lessons/{lessonId}/participants/{participantId}/attendance`

- Roles: TEACHER, DEVELOPER. Otherwise **401** `{ error: dict.apiCommon.unauthorized }` ("Нет доступа." / "Access denied.").
- Rate limit: scope `api:lesson-attendance`, **240 requests per 60 s** per user.
- Body: `{ "attendance": "UNKNOWN" | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED" }` (any `AttendanceStatus`; the UI cycle never sends `UNKNOWN`).
- Errors:
  - **400** `{ error: dict.apiPlanner.attendance.invalidMark }` — "Некорректная отметка." / "Invalid attendance mark." (missing or unknown value, malformed JSON).
  - **404** `{ error: dict.apiPlanner.attendance.participantNotFound }` — "Участник занятия не найден." / "Lesson participant not found." Returned when the participant does not belong to `lessonId`, the lesson is not `kind = LESSON`, or (TEACHER) the lesson's `teacherId` is not the viewer **or the student is no longer the viewer's student**.
  - **500** `{ error: dict.apiPlanner.attendance.saveFailed }` — "Не удалось сохранить отметку." / "Could not save the attendance mark."
  - 429 / 503 as above.
- Success: **200** `{ "ok": true, "attendance": "<value>" }`.
- Effect: `LessonParticipant.attendance = value`. Does not touch `joinedAt`, results or progress. Works for any lesson status (also individual lessons — the route does not require a group).
- Side effects: `revalidateTeacherStudentsData()`, revalidate `/teacher/lessons/{lessonId}` and, if the lesson has a group, `/teacher/groups/{groupId}`; realtime event `{ kind: "lesson-activity", lessonId, teacherId, studentId }`; pino `lesson_live.attendance_set`.

### 3.8 `GET /teacher/groups/{groupId}/export/pdf?period=7d|30d|year` — group attendance PDF

- Roles: TEACHER (own group), DEVELOPER (any). Otherwise **401** plain text `Unauthorized`.
- Rate limit: scope `api:pdf-export`, **5 requests per 5 minutes** per user — **shared with the student weekly PDF export** (same scope).
- `period`: `"30d"` or `"year"`; anything else (including missing) → `"7d"`. Period start: `7d`/`30d` → now − N×24 h; `year` → `academicYearStart(now)`.
- Errors: **404** plain text `Group not found` (missing or foreign); **500** plain text `Export failed`; 429/503 JSON from the limiter.
- Success: **200**, `Content-Type: application/pdf`, `Cache-Control: no-store`, `Content-Disposition: attachment; filename="attendance-{period}-{asciiGroupName-}{YYYY-MM-DD}.pdf"; filename*=UTF-8''Посещаемость — {group} — {Неделя|30 дней|Учебный год} — {YYYY-MM-DD}.pdf`.
- Data rules: lessons from `getGroupAttendance(user, groupId, since, now)`; rows = **all** group members by name (this route does not apply the own-students filter to members); per student `summarizeAttendance` over the lessons where they were a participant: "Был" = `"{attended} из {counted}"` or "—", late/absent/excused counts, percent or "—"; totals: lessons count, average of the students' non-null percents (rounded) or "—", total ABSENT and EXCUSED marks.
- Side effects: pino `group.export.attendance_pdf_succeeded` / `..._failed`.

### 3.9 `GET /api/teacher/parent-calls?studentId=…` — call history of one student

- Roles: TEACHER (own student), DEVELOPER (any). Otherwise **401** `{ error: "Нет доступа." }`.
- No rate limit.
- Errors: **400** `{ error: dict.apiPlanner.parentCalls.studentRequired }` "Укажите ученика." / "Specify a student."; **404** `{ error: dict.apiCommon.studentNotFound }` "Ученик не найден." / "Student not found." (also for a foreign student — existence is not revealed).
- Success **200**: `{ studentId: string, calls: ParentCallEntry[] }` — newest first (`calledAt desc, id desc`), **at most 100**.
- Not called by the current site UI (the page embeds the latest 20 in the overview); available for a "full history" screen on mobile.

### 3.10 `POST /api/teacher/parent-calls` — record a call

- Role: **TEACHER only** (DEVELOPER gets **401** `{ error: "Нет доступа." }` — developer is read-only).
- Rate limit: scope `api:parent-calls`, **60 requests per 60 s** per user.
- Body: `{ "studentId": string, "outcome": "REACHED" | "NO_ANSWER", "comment"?: string }`.
- Validation:
  - `studentId` trimmed, required → else **400** `parentCalls.studentRequired` "Укажите ученика." / "Specify a student."
  - `outcome` must be exactly `REACHED` or `NO_ANSWER` → else **400** `parentCalls.outcomeRequired` "Укажите исход звонка." / "Specify the call outcome."
  - `comment`: `normalizeMultilineText` (CRLF → LF, control chars removed, trailing spaces per line trimmed, whole text trimmed) then `.slice(0, 4000)` (`MAX_COMMENT_LENGTH = 4000`, silent truncation); empty → `null`.
  - Student must exist, be a STUDENT and belong to the teacher → else **404** `apiCommon.studentNotFound`.
- Success **200**: `{ call: { id, outcome, comment, calledAt (ISO), teacherName } }` (`teacherName` = the current user's name). `calledAt` is always "now" (server default) — a call cannot be back-dated.
- Failure: **500** `{ error: dict.apiPlanner.parentCalls.saveFailed }` "Не удалось сохранить звонок." / "Could not save the call."
- Side effects:
  - `ParentCallLog` is **append-only**: there is no edit or delete endpoint.
  - If `outcome === REACHED`: all the teacher's unread notifications of type `parent_call_due` with `href = /teacher/calls?studentId={studentId}` are marked read.
  - Revalidates `/teacher/calls` and `/teacher` (overview widget).
  - pino `teacher.parent_call.recorded` with ids and outcome only — **the comment is never logged**.
  - The reminder anchor moves only for `REACHED` (see 4.4).

### 3.11 Parent-call overview queries (page data, no public route on the site)

- `getParentCallOverview(viewer)` → `ParentCallStudentOverview[]` (TEACHER: own students; DEVELOPER: all students; other roles: `[]`). Sorted overdue → due → ok, then `daysSinceAnchor` desc. `lastReachedAt` is taken from a separate aggregate (max `calledAt` of `REACHED`), so it is correct even if the last successful call is older than the 20-entry history slice.
- `getParentCallCounts(viewer)` → `{ due, overdue }` for the overview widget.
- `ensureParentCallDueNotifications(teacherId)` — lazy reminder generation, called on entering the calls page (TEACHER) and on every `GET /api/notifications` by a TEACHER (4.4).

### 3.12 `GET /api/teacher/statistics/drilldown?topicId=…&studentId=…`

- Role: **DEVELOPER only**. Otherwise **401** `{ error: dict.apiCommon.developerRightsRequired }` "Нужны права разработчика." / "Developer rights are required."
- Rate limit: scope `api:statistics-drilldown`, **120 requests per 60 s** per user.
- Errors: **400** `{ error: dict.apiContent.statistics.paramsRequired }` "Укажите тему и ученика." / "Specify the topic and the student."; **404** `{ error: dict.apiCommon.studentNotFound }` (student missing / not a STUDENT); **500** `{ error: dict.apiContent.statistics.loadFailed }` "Не удалось загрузить срез." / "Could not load the breakdown."
- Success **200**: `{ numbers: Array<{ status: "GREEN" | "YELLOW" | "RED" | null, deadlineAt: string | null }> }` — one element per number of the topic, in `displayOrder`; an unknown `topicId` yields an empty array (not 404). Cached 60 s server-side. The client fetches with `cache: "no-store"` and aborts the previous request on change.

### 3.13 Statistics page queries (server-side, no route)

| Function | Used by | Cache |
|---|---|---|
| `getTeacherTopicsOverview(viewer)` | views `teacher`, `developer`; also teacher overview | 60 s |
| `getProgressTimeline(studentId \| undefined, 112, viewer)` | view `teacher` chart (and group statistics per member) | 300 s |
| `getDeveloperStatistics(viewer)` | views `teacher`, `developer` | 60 s |
| `getTeacherStatistics(now)` | view `teachers` | none |
| `getGroupStatistics(viewer, members, now, locale)` | group page | none (its timelines are cached 300 s) |
| `getGroupAttendance(viewer, groupId, since?, now)` | group page, group PDF | none |
| `getGroupDetail(viewer, groupId)` | group page | none |
| `getTeacherGroups(viewer)` | groups list | 60 s |

Consequence for the mock/real app: group statistics numbers can lag up to 5 minutes behind a status change; attendance and members are always fresh.

---

## 4. Business rules the mock must imitate

### 4.1 Groups and membership

- A group belongs to exactly one teacher (`StudentGroup.teacherId`). TEACHER sees own groups; DEVELOPER sees all but **cannot create** one (no form, action is TEACHER-only) — it can rename/delete/add/remove members and edit AI profiles in any group.
- A student belongs to **at most one** group (`StudentProfile.groupId`). Adding to a group moves the student. The candidate list shows students of other groups with a "will be moved here" warning; there is no confirmation step.
- Only the teacher's own students can be added (`User.teacherId === teacher.id`); for DEVELOPER any student.
- Members shown on the list/detail are filtered to the viewer's own students: a student transferred to another teacher but still pointing at the old group is hidden from the old owner.
- Group name: required, single line, ≤ 120 chars (longer input is truncated, not rejected). Grade: integer 1..11 or null; only settable at creation; an invalid grade becomes null. Subject: `MATH | INFORMATICS`, default MATH, not editable/visible.
- Deleting a group keeps students, their progress, profile (speed/aiNote) and lessons (which lose their `groupId`).
- Groups list order: `createdAt` asc. Members order: name asc.
- Member progress chips = counts of that student's GREEN / YELLOW / RED statuses over the whole problem bank.

### 4.2 Group statistics (`lib/group-statistics.ts`, `lib/group-statistics-data.ts`)

Per member (inputs):

- Timeline: 112 daily entries `{ date, closedCount, redCount }`. A status row counts on the day of `statusChangedAt` (fallback `updatedAt`); GREEN/YELLOW → `closedCount`, RED → `redCount`. Only the **current** status of each (student, number) row is counted, on the day it last changed.
- `closed7` = Σ `closedCount` of the last 7 entries; `closed30` = Σ last 30; `red30` = Σ `redCount` of the last 30.
- `streak` = `buildStudentStreak(timeline).currentStreak`: walk days from newest to oldest; if today's `closedCount` is 0 start from yesterday; count consecutive days with `closedCount > 0`.
- Homework: for each `HomeworkAssignment` of the student, `completed = total > 0 && every number is GREEN or YELLOW`. Not completed and `deadlineAt < now` → `overdueHomeworks++`; not completed otherwise (deadline in the future or null) → `activeHomeworks++`.
- `lastActivityAt` = max over the student's status rows with a non-null status of `statusChangedAt ?? updatedAt`; null if none.

Derived:

- Sort (`compareByActivity`): `closed7` desc → `closed30` desc → `streak` desc → name asc (`localeCompare(…, "ru")`). `rank` = index + 1.
- `idleDays` = `null` if never active, else `max(0, floor((now − lastActivityAt) / 24h))` (elapsed 24-hour periods, not calendar days).
- Attention flags (strings from `dict.planner.groupStatistics`, in this order):
  1. `overdueHomeworks > 0` → `overdueOne` "просрочено ДЗ" / "overdue homework" when exactly 1, else `overdueMany` "просрочено ДЗ: {n}" / "overdue homework: {n}".
  2. `idleDays === null` → `notStarted` "ещё не начинал" / "not started yet"; else `idleDays >= 7` (`IDLE_ATTENTION_DAYS = 7`) → `idle` "без активности {n} дн." / "no activity for {n} d".
  3. `red30 >= 5` → `redMonth` "красных за месяц: {n}" / "red this month: {n}".
- `mostActive` = first row, only when there are **≥ 2 members and its `closed30 > 0`**; else null.
- `leastActive` = last row, only when there are ≥ 2 members; else null.
- `totals`: sums of `closed7`, `closed30`, `red30`, `overdueHomeworks`; `attentionCount` = rows with at least one flag.
- UI thresholds: `red30 >= 5` → red number; rank-1 gradient badge only when `mostActive !== null`.

### 4.3 Attendance (`lib/attendance.ts`, `lib/lesson-finalize.ts`, student lesson routes)

Values: `UNKNOWN` (default, "not marked") · `PRESENT` · `LATE` · `ABSENT` · `EXCUSED`. Stored per `LessonParticipant`.

Which lessons appear (`getGroupAttendance`): lessons with this `groupId`, `kind = LESSON`, owned by the viewer (TEACHER) / any (DEVELOPER), `startsAt` not null, `since ≤ startsAt ≤ now`, and schedule-derived status ≠ `PLANNED`; ordered by `startsAt` asc. Lessons without a scheduled time never appear. The group page uses `since = academicYearStart(now)`.

Derived lesson status (`deriveLessonStatus`): if `finishedAt ≤ now` → `FINISHED`; else if `startsAt` missing → stored status (fallback `PLANNED`); else `now < startsAt` → `PLANNED`; `now < startsAt + durationMinutes` → `ACTIVE`; otherwise `FINISHED`.

Automatic marks:

1. Student opens the live-lesson tab while the lesson is `ACTIVE` (`POST /api/student/lesson`): first time only — `joinedAt = now` and, **if attendance is `UNKNOWN`**, attendance → `PRESENT`. Emits realtime `lesson-activity`.
2. Student submits a solution photo during the lesson: sets `joinedAt` if empty and attendance `UNKNOWN → PRESENT`.
3. Lesson closing (`finalizeLessonResults`, run lazily when a teacher opens the group page / lesson pages, within **48 h** after the lesson end): for each participant still `UNKNOWN` — `hadActivity = joinedAt !== null || any submission` → `PRESENT`, otherwise `ABSENT` (`decideEndOfLessonAttendance`). Emits `lesson-activity` and stores `Lesson.status = FINISHED`.
4. Automatic rules never overwrite a non-`UNKNOWN` value (a teacher's manual LATE/EXCUSED/ABSENT stays).
5. Rescheduling a finished lesson that nobody submitted to (re-opening) resets auto-`ABSENT` marks of participants with `joinedAt = null` back to `UNKNOWN`.

Manual marks (teacher/developer): tap cycles with `nextAttendance`:

```
PRESENT → LATE → ABSENT → EXCUSED → PRESENT
UNKNOWN → PRESENT          (default branch: anything not PRESENT/LATE/ABSENT goes to PRESENT)
```

`UNKNOWN` can never be reached again through the cycle (the API accepts it, the UI does not send it). Manual marking is allowed for `ACTIVE` and `FINISHED` lessons alike, at any time (no 48-hour limit).

Summary (`summarizeAttendance(values)`):

```
attended = count(PRESENT) + count(LATE)
late     = count(LATE)
absent   = count(ABSENT)
excused  = count(EXCUSED)
counted  = attended + absent + excused        // UNKNOWN ignored
base     = counted − excused                  // excused absences do not hurt the percentage
percent  = base > 0 ? round(attended / base × 100) : null
```

Row total text: `counted > 0 ? "{attended} / {counted}" + (percent !== null ? " · {percent}%" : "") : "—"`.
Text summary helper (used in the student PDF): `formatAttendanceSummary` → `attendance.noLessons` "занятий не было" when `counted === 0`, else " · "-joined: `attendance.attendedOf` "был на {attended} из {counted}", `attendance.late` "опозданий {n}" (if > 0), `attendance.excused` "по уважительной {n}" (if > 0), `"{percent}%"` (if not null).

Report periods (`lib/report-period.ts`): `"7d" | "30d" | "year"`; parse: only `"30d"` and `"year"` are recognised, everything else is `"7d"`. `academicYearStart(now)` = 1 September 00:00 (Moscow) of the current year if the month is September or later, otherwise of the previous year. Titles (Russian, PDF only): `7 ДНЕЙ` / `30 ДНЕЙ` / `УЧЕБНЫЙ ГОД`; file labels `Неделя` / `30 дней` / `Учебный год`.

Attendance exists only for **group** lessons in the UI (the table lives on the group page); the PATCH route itself also works for individual lessons.

### 4.4 Parent calls (`lib/parent-call-state.ts`, `lib/parent-calls.ts`)

Constants: `PARENT_CALL_DUE_DAYS = 30`, `PARENT_CALL_OVERDUE_DAYS = 45`, `PARENT_CALL_HISTORY_LIMIT = 20`, comment ≤ 4000 chars.

Reminder state machine per student:

```
anchor = lastReachedAt ?? student.createdAt       // last call with outcome REACHED, else account creation
daysSinceAnchor = max(0, calendarDaysBetween(anchor, now))   // calendar days in Europe/Moscow ("yesterday" = 1)
state = daysSinceAnchor >= 45 ? "overdue" : daysSinceAnchor >= 30 ? "due" : "ok"
daysUntilDue = max(0, 30 − daysSinceAnchor)
hasReachedCall = lastReachedAt !== null
```

- A `NO_ANSWER` entry is saved to history but **does not move the anchor** — the countdown continues.
- A `REACHED` entry resets the countdown: state becomes `ok`, `daysSinceAnchor = 0`.
- `attemptAfterLastReached` = the newest log entry is `NO_ANSWER` **and** (`lastReachedAt` is null or that entry is newer than `lastReachedAt`). `attemptDaysAgo` = calendar days since that entry (only then).
- `calendarDaysBetween(from, to)` = difference between the local midnights of both dates, rounded.
- List sort: `overdue` (0) < `due` (1) < `ok` (2); ties → larger `daysSinceAnchor` first.
- Log order: `calledAt` desc, then `id` desc.

Reminder notifications (TEACHER only; bell + notification list are in the shell spec):

- Type `parent_call_due`, `href = /teacher/calls?studentId={studentId}`, params `{ state: "due" | "overdue", name, days: daysSinceAnchor, hasReachedCall }`.
- Text (`dict.records.parentCall`): title `titleDue` "Пора позвонить родителям" / "Time to call the parents" or `titleOverdue` "Звонок родителям просрочен" / "Parent call is overdue"; body `bodyReached` "{name}: последний звонок был {days} дн. назад." / "{name}: the last call was {days} days ago." when `hasReachedCall`, else `bodyNoCalls` "{name}: успешных звонков ещё не было." / "{name}: no successful calls yet."
- Created lazily by `ensureParentCallDueNotifications(teacherId)` when the teacher opens the calls page or the notification bell polls `GET /api/notifications`. Throttled per teacher to **once per 60 s** (in-memory; concurrent calls share one run).
- At most **two** notifications per student per debt period (`shouldCreateParentCallNotification`):
  - state `ok` → none;
  - no previous notification for this student → create;
  - previous notification was created at or before the current anchor (previous period) → create;
  - state `overdue` and the previous notification was created before `anchor + 45 days` (i.e. during the `due` phase) → create the escalation;
  - otherwise none.
- Recording a `REACHED` call marks the student's unread `parent_call_due` notifications as read.

Privacy rules (hard requirements for the mobile app and the future API):

- Call comments are personal data. They are returned **only** to the student's owning TEACHER and to DEVELOPER.
- They never appear in notifications, logs/analytics/crash reports, statistics ("By teacher" shows counts only), the overview widget (counts only) or anything the STUDENT role can fetch.
- A teacher must not learn whether a foreign student exists (always 404 "student not found").
- DEVELOPER is read-only for calls (POST → 401) but additionally sees which teacher owns the student and who made each call.
- Mobile-specific: do not cache comments in unencrypted storage, do not put them in push payloads, exclude them from logs.

### 4.5 Progress timeline chart (`lib/progress-timeline.ts`)

Input: 112 `TimelineEntry` (oldest → newest). Periods:

| period | days | points | mode |
|---|---|---|---|
| `7d` | 7 | 7 | daily |
| `4w` | 28 | 4 | weekly buckets |
| `8w` | 56 | 8 | weekly buckets |

- Current window = last `days` entries; previous window = the `days` entries before it.
- Daily point label: `day numeric, month short`. Weekly: entries are split into `buckets` consecutive chunks of `floor(entries / buckets)` days (7), label = first day of the chunk; counts are summed.
- `closedTotal` / `redTotal` = sums over the current points. The line plots `closedCount` only; y-scale max = `max(1, …values)`.
- Trend compares `closedTotal` with the previous window's closed total (`dict.students.timeline.trend`, `comparison` = `periods[period].comparison`: "к прошлой неделе" / "к прошлым 4 неделям" / "к предыдущим 8 неделям"; en "last week" / "the previous 4 weeks" / "the previous 8 weeks"):
  - previous 0 and current 0 → flat, `noChange` "без изменений {comparison}" / "no change vs {comparison}"
  - previous 0 and current > 0 → up, `newActivity` "новая активность {comparison}" / "new activity vs {comparison}"
  - delta 0 → flat, `same` "на уровне {comparison}" / "same as {comparison}"
  - otherwise up/down, `delta` "{sign}{delta} закрыто ({sign}{percent}%) {comparison}" / "{sign}{delta} closed ({sign}{percent}%) vs {comparison}", `percent = completionPercent(|delta|, previous)`.
- Scope of the timeline: a specific student when one is selected; otherwise all students of the viewer (TEACHER) / all students (DEVELOPER).

### 4.6 Statistics drilldown (client logic)

- `numbers` = statuses of the selected student for every number of the selected topic.
- "Homework" options are **inferred**: numbers are grouped by identical `deadlineAt` (numbers with a null deadline are not in any group); groups sorted by date asc; option label `drilldown.homeworkN` "ДЗ {n}" / "Homework {n}" + " · " + `formatDate(deadlineAt)` (`dd MMMM yyyy`); option id = the ISO deadline. If the selected option disappears after a reload, the selection resets to `"__all__"`.
- Scope = all numbers (`__all__`) or numbers whose `deadlineAt` equals the selected option.
- Metrics: `greenCount`, `yellowCount`, `redCount`, `markedCount = g + y + r`, `solvedCount = g + y`, `totalNumbers = scope.length`, `unmarkedCount = max(total − marked, 0)`, `solvedPercent = completionPercent(solved, total)`, `markedPercent = completionPercent(marked, total)`.
- Insight sentence, first match wins:
  1. no topic/student → `pickFirst` "Сначала выберите тему и ученика."
  2. load error → the error text
  3. loading → `loading` "Загружаем срез…"
  4. `totalNumbers === 0` → `noNumbersHomework` / `noNumbersTopic`
  5. `redCount > 0` → `hasRed` "{name}: красных статусов {scope} — {n}. Это хороший кандидат на ближайший разбор."
  6. `solvedCount === totalNumbers` → `closedHomework` "{name} полностью закрыл {label}: …" / `closedTopic`
  7. `markedCount === 0` → `notStartedHomework` / `notStartedTopic`
  8. else `progress` "{name}: разобрано {solved} из {total} {scope}. Осталось добрать ещё {left}."
  where `scope` = `inHomework` "в {label}" (label lower-cased) or `inTopic` "в теме" / "in the topic".

### 4.7 Developer statistics (`getDeveloperStatistics`)

- Homework classification per assignment: `isCompleted = total > 0 && all numbers GREEN/YELLOW` → `completedCount`; else `deadlineAt < now` → `overdueCount`; else `inProgressCount`.
- Photos per assignment = currently attached photos + photos of all its checks; `withPhotosCount` = assignments with > 0; `photosTotal` = sum.
- Issued-number counters are over **distinct** `(studentId, homeworkNumberId)` pairs across all assignments; "solved" = GREEN or YELLOW.
- Content: per topic count numbers with empty (whitespace-only) `conditionLatex` / `answerLatex`; a topic is a "gap" if it lacks a theory file, lacks a homework file, or has any missing condition/answer.
- For DEVELOPER the scope is all students (`ownStudentsWhere` is empty).

### 4.8 "By teacher" statistics (`getTeacherStatistics`)

- Attribution: students and homework → by the student's owner (`User.teacherId`); calls → by `ParentCallLog.teacherId` (who called); lessons → by `Lesson.teacherId`, `kind = LESSON` only (homework drafts are excluded).
- `homework30d` = assignments created in the last 30×24 h.
- `callsReached` / `callsNoAnswer` = all-time counts per teacher by outcome.
- `lessonsTotal` = all-time lessons; `lessonsFinished` = those with **stored** status `FINISHED`.
- Window = last **12** calendar weeks including the current one (`TEACHER_STATS_WEEKS = 12`), weeks start on Monday 00:00 Moscow. A lesson "happens" at `startsAt ?? createdAt`. `lessonsByWeek` counts lessons per bucket (future scheduled lessons inside the current week count too).
- `topTopics` = lesson topics in the window by frequency (desc, then title asc `ru`), top 5; lessons without a topic are skipped.
- `recentLessons` = window lessons with `startsAt ?? createdAt ≤ now`, newest first (tie → id desc), top **8** (`TEACHER_STATS_RECENT_LESSONS = 8`).
- `unattributed`: students without a teacher; homework of such students; calls whose teacher was deleted (`teacherId` null) or is not a TEACHER; lessons created by a non-teacher (developer).

### 4.9 Permission matrix (summary)

| Operation | TEACHER | DEVELOPER | STUDENT |
|---|---|---|---|
| List / view groups | own | all | — |
| Create group | yes | **no** | — |
| Rename / delete group | own | any | — |
| Add / remove member | own group + own student | any group + any student | — |
| Edit speed / AI note | own student | any student | — |
| View attendance table | own group | any | — |
| Set attendance mark | own lesson + own student | any | — (only automatic PRESENT via own activity) |
| Group attendance PDF | own group | any | — |
| View parent-call overview / history (incl. comments) | own students | all students | **never** |
| Record a parent call | own students | **no (401)** | — |
| Statistics screen (3 views) + drilldown | **no** | yes | — |
| Group statistics block | own group | any | — |

---

## 5. Realtime / polling behaviour

- The dashboard shell keeps one SSE connection (`EventSource("/api/realtime")`, `components/dashboard-realtime-listener.tsx`). For TEACHER/DEVELOPER **every** event the server delivers (it pre-filters by the teacher's students/lessons) triggers a debounced page refresh: `router.refresh()` after **1500 ms**, coalesced (a pending timer swallows further events); while the tab is hidden the refresh is deferred until it becomes visible.
- Events relevant here:
  - `lesson-activity` `{ lessonId, teacherId, studentId? }` — published when a student joins a live lesson / submits (auto `PRESENT`), when a teacher PATCHes attendance, and when a lesson is finalized (auto `ABSENT`). Result: the attendance table on an open group page updates within ~1.5 s.
  - `student-progress-changed` / `student-deadlines-changed` / `students-changed` / `topic-content-changed` — cause a refresh of whatever teacher page is open (group statistics, statistics page), subject to the server caches (60 s / 300 s).
- No realtime event exists for parent calls or group membership. Those screens update only through the explicit refresh after the user's own mutation (`router.refresh()` after add/remove member and after saving a call).
- Parent-call reminder notifications are generated by polling side effects (`GET /api/notifications` from the bell, entering the calls page), throttled to once a minute per teacher. There are no push notifications.
- The statistics drilldown is a plain on-demand fetch (abort previous, `no-store`); no polling.
- Client timers used by these screens: member-manager flash 2000 ms; member-editor flash 2200 ms; calls row highlight 1500 ms; count-up 600 ms.

Mobile recommendation: re-fetch on screen focus and on pull-to-refresh; for the group attendance tab poll every 15–30 s while a lesson of the group is `ACTIVE` (or subscribe to an SSE/WebSocket stream when the real API provides one); invalidate the calls overview + overview-widget counts after a successful POST; invalidate group detail/list after member, rename, delete and AI-profile mutations.

---

## 6. Proposed mobile API contract

Base path `/api/mobile/v1`. Auth: bearer session token (see shell spec). All responses JSON unless stated. Error envelope for every non-2xx:

```ts
type ApiError = { error: { code: string; message: string } }; // message localized by Accept-Language (ru | en)
```

Common codes: `unauthorized` (401), `forbidden_role` (403 — the site answers 401 for a wrong role; either is acceptable, pick one consistently), `not_found` (404), `invalid_input` (400), `rate_limited` (429 + `Retry-After`), `service_unavailable` (503), `save_failed` (500).

### 6.1 Groups

```ts
// GET /teacher/groups
type GroupsListResponse = { groups: GroupListItem[]; canCreate: boolean /* false for DEVELOPER */ };

// POST /teacher/groups            (TEACHER only)
type CreateGroupRequest = { name: string; grade?: number | null; subject?: Subject };
type CreateGroupResponse = { group: GroupListItem };
// 400 invalid_input when name is empty after normalization. name truncated to 120. grade outside 1..11 → stored null.

// GET /teacher/groups/:groupId
type GroupDetailResponse = {
  group: GroupDetail;                    // members + allStudents (candidates)
  lessons: { total: number; recent: Array<Pick<TeacherLessonListItem, "id" | "title" | "startsAt" | "createdAt" | "durationMinutes" | "status">> }; // recent = first 3 by createdAt desc
};

// PATCH /teacher/groups/:groupId
type RenameGroupRequest = { name: string };            // ≤ 120 after normalization, non-empty
type RenameGroupResponse = { group: Pick<GroupDetail, "id" | "name"> };

// DELETE /teacher/groups/:groupId  → 204

// POST /teacher/groups/:groupId/members
type AddMemberRequest = { studentId: string };
type AddMemberResponse = { member: GroupMember; movedFromGroupId: string | null };
// 404 not_found for a foreign/missing group or student.

// DELETE /teacher/groups/:groupId/members/:studentId  → 204 (idempotent)

// PATCH /teacher/students/:studentId/ai-profile
type AiProfileRequest = { speed: number | null; aiNote: string | null }; // both required (full overwrite, as on the site)
type AiProfileResponse = { studentId: string; speed: number | null; aiNote: string | null };
// speed must be an integer 1..10 or null (recommend 400 instead of the site's silent null); aiNote single-line, ≤ 300.
```

### 6.2 Group statistics

```ts
// GET /teacher/groups/:groupId/statistics
type AttentionFlag =
  | { code: "overdue_homework"; count: number }  // ru "просрочено ДЗ" (count 1) / "просрочено ДЗ: {n}"
  | { code: "not_started" }
  | { code: "idle"; days: number }               // days ≥ 7
  | { code: "red_month"; count: number };        // count ≥ 5

type GroupStatisticsResponse = {
  generatedAt: string;
  members: Array<Omit<GroupMemberRow, "attention"> & { attention: AttentionFlag[] }>;
  mostActiveId: string | null;
  leastActiveId: string | null;
  totals: GroupStatistics["totals"];
};
```

(The site returns pre-localized flag strings; the mobile contract returns codes and the app formats them with `dict.planner.groupStatistics`.)

### 6.3 Attendance

```ts
// GET /teacher/groups/:groupId/attendance?period=year|30d|7d      (default year, as on the group page)
type GroupAttendanceResponse = {
  period: ReportPeriod;
  since: string;                 // ISO
  until: string;                 // ISO (now)
  members: Array<{ id: string; name: string }>;
  lessons: Array<{
    id: string;
    title: string;
    startsAt: string;
    status: "ACTIVE" | "FINISHED";
    participants: Array<{ participantId: string; studentId: string; attendance: AttendanceValue; joinedAt: string | null }>;
  }>;
};

// PATCH /teacher/lessons/:lessonId/participants/:participantId/attendance
type SetAttendanceRequest = { attendance: AttendanceValue };
type SetAttendanceResponse = { ok: true; attendance: AttendanceValue };
// 400 invalid_input ("Некорректная отметка."), 404 not_found ("Участник занятия не найден."), 500 save_failed, 429 (240/min).

// GET /teacher/groups/:groupId/attendance.pdf?period=7d|30d|year
// → 200 application/pdf (attachment, Russian-only document); 404; 429 (5 per 5 min, shared with student PDF export); 500.
```

### 6.4 Parent calls

```ts
// GET /teacher/parent-calls                 (TEACHER: own students; DEVELOPER: all)
type ParentCallsOverviewResponse = {
  canRecord: boolean;                       // true for TEACHER, false for DEVELOPER
  students: ParentCallStudentOverview[];    // server-sorted; history ≤ 20 newest entries
  counts: { overdue: number; due: number; total: number };
};

// GET /teacher/parent-calls/counts
type ParentCallCountsResponse = ParentCallCounts;   // { due, overdue } — overview widget, no personal data

// GET /teacher/parent-calls/students/:studentId/history?limit=100&before=<callId>
type ParentCallHistoryResponse = { studentId: string; calls: ParentCallEntry[]; hasMore: boolean };
// site equivalent: GET /api/teacher/parent-calls?studentId= (max 100, no paging)

// POST /teacher/parent-calls                (TEACHER only)
type RecordCallRequest = { studentId: string; outcome: ParentCallOutcome; comment?: string };
type RecordCallResponse = { call: ParentCallEntry; reminder: ParentCallReminder /* recomputed for the student */ };
// 400 invalid_input: "Укажите ученика." / "Укажите исход звонка."; 404 "Ученик не найден."; 500 "Не удалось сохранить звонок."; 429 (60/min).
// comment: multiline, trimmed, truncated to 4000. Recommend an optional Idempotency-Key header (the log is append-only and has no delete).
```

### 6.5 Statistics (DEVELOPER only)

```ts
// GET /developer/statistics/progress?studentId=<optional>
type StatisticsProgressResponse = {
  overview: TeacherTopicsOverview;         // students + topics counters
  homework: DeveloperStatistics["homework"];
  timeline: TimelineEntry[];               // 112 days for the selected student or for everyone
  timelineStudentId: string | null;
};

// GET /developer/statistics/timeline?studentId=<optional>&days=112
type TimelineResponse = { entries: TimelineEntry[] };   // days clamped to 1..112

// GET /developer/statistics/drilldown?topicId=&studentId=
type DrilldownResponse = { numbers: DrilldownNumber[] };  // 400 / 404 / 500 as in §3.12; 429 (120/min)

// GET /developer/statistics/teachers
type StatisticsTeachersResponse = TeacherStatistics;

// GET /developer/statistics/platform
type StatisticsPlatformResponse = {
  overview: TeacherTopicsOverview;
  homework: DeveloperStatistics["homework"];
  content: DeveloperStatistics["content"];
};
```

### 6.6 Typed client interface (mock implements this now)

```ts
export interface GroupsCallsStatsApi {
  // groups
  listGroups(): Promise<GroupsListResponse>;
  createGroup(input: CreateGroupRequest): Promise<CreateGroupResponse>;
  getGroup(groupId: string): Promise<GroupDetailResponse>;
  renameGroup(groupId: string, input: RenameGroupRequest): Promise<RenameGroupResponse>;
  deleteGroup(groupId: string): Promise<void>;
  addGroupMember(groupId: string, input: AddMemberRequest): Promise<AddMemberResponse>;
  removeGroupMember(groupId: string, studentId: string): Promise<void>;
  setStudentAiProfile(studentId: string, input: AiProfileRequest): Promise<AiProfileResponse>;
  getGroupStatistics(groupId: string): Promise<GroupStatisticsResponse>;
  // attendance
  getGroupAttendance(groupId: string, period?: ReportPeriod): Promise<GroupAttendanceResponse>;
  setAttendance(lessonId: string, participantId: string, attendance: AttendanceValue): Promise<SetAttendanceResponse>;
  downloadGroupAttendancePdf(groupId: string, period: ReportPeriod): Promise<{ uri: string; fileName: string }>;
  // parent calls
  getParentCallsOverview(): Promise<ParentCallsOverviewResponse>;
  getParentCallCounts(): Promise<ParentCallCountsResponse>;
  getParentCallHistory(studentId: string, page?: { limit?: number; before?: string }): Promise<ParentCallHistoryResponse>;
  recordParentCall(input: RecordCallRequest): Promise<RecordCallResponse>;
  // statistics (developer)
  getStatisticsProgress(studentId?: string): Promise<StatisticsProgressResponse>;
  getStatisticsDrilldown(topicId: string, studentId: string): Promise<DrilldownResponse>;
  getStatisticsTeachers(): Promise<StatisticsTeachersResponse>;
  getStatisticsPlatform(): Promise<StatisticsPlatformResponse>;
}
```

Mock data requirements: at least one teacher with 2–3 groups (one empty, one with > 3 members to exercise "and N more"), a student that belongs to another group (move warning), group lessons spread over the academic year including one `ACTIVE` lesson and a member who was not a participant of some lesson ("·" cell), all five attendance values; students in each call state (`ok` with a recent REACHED call, `ok` new student without calls, `due` at 30–44 days, `overdue` ≥ 45 days, one with `attemptAfterLastReached`, one with > 20 log entries); a second teacher so the DEVELOPER views show teacher names, "By teacher" cards and non-zero `unattributed` counters. Port the pure functions verbatim into the mobile codebase: `nextAttendance`, `summarizeAttendance`, `academicYearStart`, `parseReportPeriod`, `reportPeriodStart`, `resolveParentCallReminder`, `calendarDaysBetween`, `shouldCreateParentCallNotification`, `buildGroupStatistics`/`compareByActivity`, `buildWeekBuckets`/`countByWeek`, `buildProgressTimelineView`, `buildStudentStreak`, `deriveLessonStatus`, `completionPercent` (they have unit tests on the site: `tests/attendance.test.ts`, `report-period.test.ts`, `parent-call-state.test.ts`, `group-statistics.test.ts`, `week-buckets.test.ts`).

---

## 7. Open questions / things that cannot be done natively as-is

- **Q1. Statistics is developer-only.** The subsystem is titled "Teacher … statistics", but `/teacher/statistics` requires `DEVELOPER` and the teacher nav has no statistics tab. Suggested: build the Statistics tab only for DEVELOPER; teachers get only the group statistics block. Confirm whether a teacher-facing statistics screen is wanted in the app (would be new functionality, not a mirror).
- **Q2. Groups for DEVELOPER.** The developer nav has no "groups" (and no "lessons") item, yet `/developer/groups` and `/developer/groups/{id}` work by URL and allow rename/delete/member edits (not creation). Suggested: do not expose a Groups tab for DEVELOPER in v1 (mirror the nav); keep the API permissive. Confirm.
- **Q3. Server actions have no HTTP contract.** Group CRUD, membership and AI-profile edits are Next server actions that return `{ ok: boolean }` or redirect with `?groupError=…`. A real mobile API needs new REST endpoints (§6.1) with proper error codes; the site's silent normalizations (invalid grade/speed → null, over-long text truncated) should be decided explicitly — suggested: keep truncation, return 400 for out-of-range grade/speed.
- **Q4. Attendance matrix on a phone.** A students × lessons table for a whole academic year (dozens of columns) does not fit. Suggested: (a) horizontally scrollable grid with a sticky name column, newest lessons scrolled into view first, and (b) a per-lesson mode (lesson picker → participant list with explicit 4-option control). Hover tooltips (lesson title/time, "did not take part") become long-press popovers. Tap-to-cycle is easy to mis-tap on touch; suggested: tap cycles, long-press opens an action sheet with all values, plus an undo snackbar.
- **Q5. PDF exports.** Both the group attendance PDF and the per-student report links are browser downloads with cookie auth, rate-limited to 5 per 5 minutes (shared bucket), and the documents are Russian-only regardless of UI language. Native approach: authenticated download to the cache directory (`expo-file-system`) → `expo-sharing` / in-app PDF viewer; show the 429 message with the retry time. In the mock: bundled sample PDF. Decide whether English PDFs are needed (would be a server change).
- **Q6. Realtime.** The site relies on SSE (`EventSource`) + whole-page refresh. React Native has no built-in `EventSource`; the realtime layer is in-memory and single-instance. Suggested for v1: focus-refetch + pull-to-refresh + short polling on the attendance tab during an active lesson; later an SSE polyfill or WebSocket with typed events (`lesson-activity` etc.).
- **Q7. Parent-call reminders as push notifications.** Reminders are created lazily when the teacher's client polls (`/api/notifications`, entering the calls page), throttled in memory. With a mobile app the teacher may not open it for weeks, so no reminder is ever generated. A real backend needs a scheduled job + push (payload must **not** contain comments; name + state only). In the mock: generate notifications at app start using `shouldCreateParentCallNotification`.
- **Q8. No phone numbers.** The data model stores no parent/student phone, so the app cannot offer "call" or log a call automatically from the dialer. Mirror the site (manual logging) unless a phone field is added later.
- **Q9. Append-only call log.** There is no edit/delete; a mistaken entry (e.g. wrong outcome, double tap) is permanent and a wrong `REACHED` resets the 30-day countdown. Suggested: disable the Save button while in flight (as the site does), add an idempotency key in the mobile API, and optionally a confirm step for `REACHED`. Also `calledAt` is always "now" — calls cannot be back-dated; confirm this is acceptable on mobile where logging often happens later.
- **Q10. History depth mismatch.** The "History (n)" button shows the total number of entries but the panel shows only the latest 20; older entries are unreachable in the site UI (the 100-entry GET exists but is unused). Suggested: mobile history screen with paging (§6.4).
- **Q11. Time zone.** All day arithmetic (call reminder days, "today/yesterday", academic year, week buckets, timeline keys) is done in `Europe/Moscow` on the server. The app must not recompute these with the device time zone; either take server-computed values (`reminder`, `idleDays`, `attemptDaysAgo`) or compute with an explicit `Europe/Moscow` zone. Note the inconsistency to preserve: group `idleDays` uses elapsed 24-hour periods while call `daysSinceAnchor` uses calendar days.
- **Q12. Localized server strings.** `GroupMemberRow.attention` arrives already translated in the viewer's locale. For the mobile API return codes (§6.2) so the app can switch language offline.
- **Q13. Drilldown "homework" options are heuristic.** They are inferred by grouping numbers with the same mirrored `deadlineAt`, not from real `HomeworkAssignment` rows (two homeworks with the same deadline merge; a homework without a deadline is invisible). Mirror as-is for v1 or have the future API return real assignments.
- **Q14. Stale statistics.** Group statistics rely on a 5-minute cached timeline and overview counters on a 60-second cache; after marking a problem the numbers may lag. Mobile should show a "last updated" time or simply accept the lag; the mock can be instant.
- **Q15. Stored vs derived lesson status.** "By teacher" recent lessons show the stored `Lesson.status` (which becomes `FINISHED` only after lazy finalization), while the group page and attendance use the schedule-derived status. A lesson that ended by schedule but was never finalized shows "запланировано"/"planned" there. Decide whether the mobile API should return the derived status everywhere.
- **Q16. Charts and animations.** Donut (CSS conic-gradient), SVG line/area chart, bar chart with native `<title>` tooltips, count-up numbers and the sliding segmented-control indicator have no direct RN equivalents; implement with `react-native-svg` + Reanimated, replace hover tooltips with tap/press interactions, respect "reduce motion".
- **Q17. Cross-subsystem links.** From these screens the site links to: lesson composer (`/lessons/new?groupId=`), homework plan composer (`/homework-plans/new?groupId=`), lesson board (`/lessons/{id}`), lessons list, student page (`/students/{id}`), student PDF report, topic edit page (`/topics/{id}/edit`, developer content gaps), students list / developer accounts (calls empty state), and the header number search. The mobile navigator must route these to the screens defined in the other subsystem specs (or hide them until those exist).
- **Q18. Group fields not editable.** Grade can only be set at creation and subject never; if the app should allow editing them, that is new server functionality.
