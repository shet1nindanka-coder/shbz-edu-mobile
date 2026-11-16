# 07 — Developer content: topics CRUD, numbers, LaTeX, import, uploads, dev panel, journal

Scope of this file: everything under `/teacher/topics/**` (list, view, edit, single number), `/teacher/panel` (dev panel) and `/teacher/panel/journal` (action log), plus the server actions and API routes behind them. Sibling specs: `01-shell-auth.md` (shell, number search, notifications, realtime transport), `04-teacher-students.md` (progress history widget), `06-…` (statistics).

Everything below is taken from the site code. Items marked **[PROPOSAL]** are suggestions for the native app, not existing behaviour. Items marked **[QUIRK]** are real behaviours of the site that look accidental; the mock should not blindly copy them (see §7).

Source files read: `app/(dashboard)/teacher/topics/**`, `app/(dashboard)/teacher/panel/**`, `next.config.ts`, `middleware.ts`, `actions/topic.ts`, `actions/developer.ts`, `app/api/teacher/{topics,topics/order,topics/find-number,topics/conditions,number-answers,number-conditions,topic-import,topic-numbers-preview,uploads,progress-history}/route.ts`, `lib/{topic-import,topic-import-prompt,topic-numbers-change,topic-homework-numbers,site-settings,audit,audit-text,ai-pricing,upload-validation,developer-panel-tabs,teacher-topic-selection,latex-line-items,file-access,api-rate-limit,persistent-rate-limit,dashboard-realtime,progress-history,utils,platform-data}.ts`, components `topic-*.tsx`, `teacher-topic-*.tsx`, `teacher-single-number-card.tsx`, `developer-*.tsx`, `file-drop-input.tsx`, `animated-dropzone.tsx`, `file-resource-card.tsx`, `delete-button.tsx`, `confirm-dialog.tsx`, `latex-answer-preview.tsx`, `use-topic-conditions.ts`, dictionaries `topics.ts`, `planner.ts` (`devPanel`, `journal`), `records.ts`, `api-content.ts`, `api-common.ts`.

---

## 0. Global facts for this subsystem

### 0.1 How developer URLs work

- `next.config.ts` rewrites: `/developer` → `/teacher`, `/developer/:path*` → `/teacher/:path*`. There is exactly one set of pages; the developer just sees them under another URL prefix.
- `middleware.ts` (UX only, not security): with a session cookie and the non-secret cookie `tutor_role`:
  - role `DEVELOPER` visiting `/teacher/...` → redirect to the same path under `/developer/...`;
  - any other role visiting `/developer/...` → redirect to `/teacher/...`.
- Real permission checks are `requireUser(role | role[])` in each page and `tryGetCurrentUser()` + role comparison in each API route. `requireUser` redirects to `/login` when there is no session and to `roleHome(role)` when the role is not allowed.
- `roleHome`: `TEACHER → /teacher`, `DEVELOPER → /developer/topics`, `STUDENT → /student`. The developer's home screen **is the topics list** (the `/teacher` overview page is `requireUser(TEACHER)` only).
- Developer top navigation (in this order; `dict.nav.developer.*`): `topics` "темы"/"topics" → `/developer/topics`; `accounts` "аккаунты"/"accounts"; `calls` "звонки"/"calls"; `statistics` "статистика"/"statistics"; `panel` "дев-панель"/"dev panel" → `/developer/panel`; plus a gear for settings.
- Teacher top navigation contains `topics` "темы"/"topics" → `/teacher/topics` (second item, after overview).

For the native app there are no URLs: branch on `user.role` (see matrix below).

### 0.2 Permission matrix (exact)

| Thing | TEACHER | DEVELOPER | STUDENT |
|---|---|---|---|
| Topics list screen (`/teacher/topics`) | view, read-only: cards + "Open", number search. **No** create block, **no** delete, **no** reorder | full: create (AI import / manual), delete, drag reorder | no |
| Topic view screen (`/teacher/topics/[topicId]`) | view, read-only: materials + numbers with statements/answers. No tabs, no delete button | same content + "View / Edit" tabs + "Delete topic" button | no |
| Topic edit screen (`/teacher/topics/[topicId]/edit`) | **no** (`requireUser(DEVELOPER)` → redirected to `/teacher`) | yes | no |
| Single number screen (`/teacher/topics/[topicId]/numbers/[number]`) | view, read-only: statement and answer rendered (answer shown immediately, not collapsed) | editor for statement and answer | no |
| Dev panel (`/teacher/panel`) | **no** | yes | no |
| Journal (`/teacher/panel/journal`) | **no** | yes | no |
| `GET /api/teacher/topics/find-number` | yes | yes | no (401) |
| `GET /api/teacher/topics/conditions` | yes | yes | no (401) |
| `GET /api/teacher/progress-history` | yes, only own students | yes, any student | no (403) |
| `POST /api/teacher/topics` (create) | no (401) | yes | no |
| `POST /api/teacher/topics/order` | no (401) | yes | no |
| `POST/DELETE /api/teacher/number-conditions` | no (401) | yes | no |
| `POST/DELETE /api/teacher/number-answers` | no (401) | yes | no |
| `POST /api/teacher/topic-numbers-preview` | no (401) | yes | no |
| `POST /api/teacher/topic-import` | no (401) | yes | no |
| `POST /api/teacher/uploads` | no (401) | yes | no |
| Server actions `updateTopicAction`, `deleteTopicFileAction`, `deleteTopicAction` | no (redirect) | yes | no |
| Server actions in `actions/developer.ts` (settings, 5 service actions, broadcast) | no (redirect) | yes | no |
| `GET /files/[fileId]` for topic theory/homework/answer files | yes (shared bank) | yes (everything) | theory + homework files only |

Note: DEVELOPER-only API routes answer **401** (not 403) with `dict.apiCommon.developerRightsRequired` ("Нужны права разработчика." / "Developer rights are required.") to any other caller, including a signed-in teacher. Routes open to both staff roles answer 401 with `dict.apiCommon.unauthorized` ("Нет доступа." / "Access denied.").

### 0.3 Core data rules

- Topics, their files, numbers, statements (`conditionLatex`) and answers (`answerLatex`) are **global** — one bank shared by all teachers and students. There is no owner scope on any content endpoint.
- A number (`TopicHomeworkNumber.number`) is a **string of digits; leading zeros are significant** (`"010203"`). Uniqueness in DB is `(topicId, number)` on the raw string, but all comparison/dedup/search goes through the normalised form (leading zeros stripped; see §4.1).
- Deleting a topic or a number cascades (DB `onDelete: Cascade`) to: every student's status/note/deadline for those numbers, homework-assignment entries, AI check verdicts, lesson/homework-plan items, progress history events. That is why both operations have explicit impact previews and server-side acknowledgement checks (§4.3, §4.4).
- UI copy is bilingual; dictionary key paths are given as `dict.<path>`. `format(template, params)` replaces `{name}` placeholders; `plural(locale, n, forms)` picks a word form (ru: 3 forms — `n%10==1 && n%100!=11` → form 0; `n%10 in 2..4 && n%100 not in 12..14` → form 1; else form 2. en: `n==1` → form 0 else form 1) and substitutes `{n}`.

---

## 1. Screens

### 1.1 Topics list

- **Site route:** `/teacher/topics` (developer URL `/developer/topics`). `requireUser([TEACHER, DEVELOPER])`.
- **Data:** `getTeacherTopicsOverview(user)` → uses only `data.topics` (ordered by `displayOrder asc, createdAt asc`).
- **Purpose:** browse the shared topic bank; for the developer also create, delete and reorder topics.

**Layout top to bottom**

1. Page header: kicker `dict.topics.list.kicker` ("Темы" / "Topics"), title `dict.topics.list.title` ("Материалы и номера" / "Materials and problems"), on the right the number search box (§1.7).
2. Notice banner (only after a redirect with a status code in the query string). Codes and texts (`dict.topics.list.notices.*`):
   | Query | Tone | ru | en |
   |---|---|---|---|
   | `created=1` | success | Новая тема успешно создана. | New topic created. |
   | `deleted=1` | success | Тема успешно удалена. | Topic deleted. |
   | `error=invalid` | error | Проверьте форму: название, описание, файлы и список номеров обязательны. | Check the form: title, description, files and the problem list are required. |
   | `error=upload` | error | Не удалось загрузить файлы. Проверьте настройки storage и повторите попытку. | Could not upload the files. Check the storage settings and try again. |
   | `error=save` | error | Не удалось сохранить тему в базе данных. Проверьте подключение к PostgreSQL и логи сервера. | Could not save the topic to the database. Check the PostgreSQL connection and server logs. |
   | `error=delete` | error | Не удалось удалить тему. Проверьте логи сервера и повторите попытку. | Could not delete the topic. Check the server logs and try again. |
3. **DEVELOPER only** — section "Create a new topic" (`dict.topics.list.createSection`: "Создать новую тему"), a card containing a two-option segmented switch (`dict.topics.createSwitch`): `ai` "С помощью ИИ" / "With AI" (**default**) and `manual` "Вручную" / "Manually". Both panels stay mounted when switching (typed text and uploaded files are not lost).
   - In `ai` mode the right end of the switch row shows the button "Скопировать промпт для ИИ" / "Copy the AI prompt" (§1.5.1) and the panel below is the **import panel in create-topic mode** (§1.5).
   - In `manual` mode the panel is the **manual create form** (§1.4).
4. Section "All topics" (`dict.topics.list.allTopics`: "Все темы").
   - Empty state: a card with `dict.topics.list.empty` ("Пока нет ни одной темы" / "No topics yet").
   - Otherwise a grid of topic cards. Each card:
     - kicker `dict.topics.list.cardKicker` ("Тема" / "Topic");
     - title `topic.title` (max 2 lines, always reserves 2 lines);
     - meta line: `plural(locale, topic.totalNumbers, dict.topics.widgets.numberForms)` + ` · ` + `format(dict.topics.list.activeMeta, { count: topic.studentsWithActivity })` — e.g. "24 номера · 3 активных" / "24 problems · 3 active". `studentsWithActivity` = number of distinct students having at least one non-null status on a number of the topic; **for TEACHER counted only among own students** (`User.teacherId = viewer.id`), for DEVELOPER among all students;
     - footer: primary button `dict.topics.list.open` ("Открыть" / "Open") → topic view; **DEVELOPER only**: danger button `dict.topics.widgets.delete` ("Удалить" / "Delete") → confirm dialog (§1.8) → `deleteTopicAction` with `fields = { topicId }` (no impact acknowledgement — see §4.4 [QUIRK]).
   - **DEVELOPER only**: above the grid the hint `dict.topics.reorder.hint` ("Перетащите карточку, чтобы изменить порядок тем — его видят и ученики." / "Drag a card to reorder topics — students see this order too."); cards are draggable (HTML5 DnD; the site comments it deliberately does not work on touch screens). Dropping card A on card B moves A to B's position (after B if A was before B, otherwise before B), applies the order optimistically and POSTs the full id list to `/api/teacher/topics/order`. On failure the order is rolled back to the server order and an error banner shows the server `error` or `dict.topics.reorder.saveFailed` ("Не удалось сохранить порядок тем." / "Could not save the topic order.").
   - TEACHER: plain grid, no hint, no drag.

**States:** route loading shell (generic dashboard skeleton); DB failure → generic dashboard error shell (`dict.shells.errorTitle` "Раздел временно недоступен"). No pagination, no search by title on this screen.

**Phone mapping [PROPOSAL]:** a tab ("Topics") in the bottom bar for DEVELOPER (it is the developer's home) and for TEACHER. Vertical list of cards. Number search → search field in the header (numeric keyboard). DEVELOPER: a "+" header button opening a "New topic" screen with the AI/Manual segmented control; long-press-and-drag reorder (e.g. draggable FlatList) sending the full `orderedTopicIds`, or a dedicated "Reorder" mode; swipe/overflow "Delete" opening the impact dialog (§1.8). Notices → toast/snackbar.

### 1.2 Topic view

- **Site route:** `/teacher/topics/[topicId]`. `requireUser([TEACHER, DEVELOPER])`.
- **Data:** `getTeacherTopicDetail(topicId)` (throws → generic error shell when the id does not exist; there is no dedicated 404).

**Layout**

1. Header: back link `dict.topics.view.back` ("← Ко всем темам" / "← All topics") → list; eyebrow `dict.topics.view.eyebrow` ("Тема" / "Topic"); title `topic.title`; description `topic.description` (may be empty string); number search on the right; **DEVELOPER only** action button `dict.topics.deleteTopic.label` ("Удалить тему" / "Delete topic") → confirm dialog with the *generic* text (`before + «title» + after`, see §1.8) → `deleteTopicAction({ topicId })`.
2. **DEVELOPER only:** two-tab segmented nav (`dict.topics.tabs`): `view` "Просмотр" / "View" (active), `edit` "Редактирование" / "Edit" → edit screen.
3. Section "Materials" (`dict.topics.view.materialsTitle` "Материалы"; description `materialsDescription` "Файлы теории и заданий — так их видит ученик." / "Theory and homework files, as the student sees them."). Two file cards side by side:
   - `dict.topics.view.theory` ("Теория" / "Theory") — `topic.theoryFile`;
   - `dict.topics.view.homework` ("Задания" / "Homework") — `topic.homeworkFile`.
   File card (`FileResourceCard`, strings `dict.student.fileCard.*`): title; when a file exists — buttons "Открыть в браузере" / "Open in browser" (`GET /files/{id}`, inline) and "Скачать файл" / "Download file" (`GET /files/{id}?download=1`); below, an inline preview: PDF → embedded PDF viewer (pdf.js), PNG/JPEG → image, DOCX → text "Для DOCX встроенный предпросмотр зависит от браузера." / "Built-in DOCX preview depends on your browser.". When no file: dashed box "Файл пока не загружен." / "No file uploaded yet.". File name, size and upload date are intentionally **not** shown on this screen.
4. Section "Problems and answers" (`dict.topics.view.numbersTitle` "Номера и ответы"; description `numbersDescription` "Условия и ответы к номерам темы." / "Statements and answers for the topic's problems."):
   - Empty: dashed panel, title `dict.topics.viewNumbers.emptyTitle` ("Номера пока не добавлены" / "No problems yet"), hint `emptyHint` ("Добавьте номера во вкладке «Редактирование»." / "Add problems on the Edit tab.").
   - Otherwise a 2-column grid of cards, **all numbers at once, no pagination**, in `displayOrder`. Each card: title `format(dict.topics.widgets.numberLabel, { number })` ("№ 010203" / "No. 010203"); if `conditionLatex` — label `dict.topics.viewNumbers.condition` ("Условие" / "Statement") + rendered LaTeX (§4.7), else muted text `noCondition` ("Условие не добавлено." / "No statement yet."); if `answerLatex` — a collapsed disclosure with summary `showAnswer` ("Показать ответ" / "Show answer") revealing the rendered answer, else muted `noAnswer` ("Ответ не добавлен." / "No answer yet.").

Cards are not links (the single-number screen is reached only via number search).

**Phone mapping [PROPOSAL]:** pushed screen from the list. Header with title; DEVELOPER gets a segmented "View | Edit" under the header and "Delete topic" in an overflow menu. Materials → two rows with "Open" (in-app PDF/image viewer or system viewer) and "Download/Share". Numbers → virtualised `FlatList` (topics can have hundreds of numbers; the import cap is 300 per file, the numbers field cap is 2000), answer hidden behind a "Show answer" toggle per row.

### 1.3 Topic edit (DEVELOPER only)

- **Site route:** `/teacher/topics/[topicId]/edit` (`/developer/topics/[topicId]/edit`). `requireUser(DEVELOPER)`.
- **Query params read:** `saved=1`, `fileDeleted=theory|homework`, `error=<code>`, `number=<digits>` (pre-selects a number in the answers manager).
- **Data:** `getTeacherTopicDetail(topicId)` + `summarizeTopicImpact(loadTopicNumberFacts(topicId))` + `describeTopicImpact(...)` (for the delete dialog).

**Layout**

1. Notice banner (`dict.topics.edit.notices.*`):
   | Query | Tone | ru | en |
   |---|---|---|---|
   | `saved=1` | success | Изменения по теме сохранены. | Topic changes saved. |
   | `fileDeleted=theory` | success | Файл теории удалён. | Theory file deleted. |
   | `fileDeleted=homework` | success | Файл заданий удалён. | Homework file deleted. |
   | `error=invalid` | error | Проверьте форму: название, описание и список номеров обязательны. | Check the form: title, description and the problem list are required. |
   | `error=upload` | error | Не удалось обработать файл. Попробуйте ещё раз или обновите страницу. | Could not process the file. Try again or reload the page. |
   | `error=fileDelete` | error | Не удалось удалить файл. Повторите попытку. | Could not delete the file. Try again. |
   | `error=save` | error | Не удалось сохранить изменения. Проверьте подключение к базе данных и повторите попытку. | Could not save the changes. Check the database connection and try again. |
   | `error=numbersTwin` | error | Изменения не сохранены: среди новых номеров есть совпадающие с существующими с точностью до ведущих нулей (например, 01 и 1). Это один и тот же номер — оставьте один вариант записи. | Changes not saved: some new problems match existing ones up to leading zeros (for example, 01 and 1). They are the same problem — keep only one spelling. |
   | `error=numbersConfirm` | error | Изменения не сохранены: удаление номеров с работой учеников нужно подтвердить. Обновите страницу и сохраните ещё раз — список последствий покажется перед сохранением. | Changes not saved: removing problems with student work needs confirmation. Reload the page and save again — the list of consequences will be shown before saving. |
   | `error=numbersAssigned` | error | Изменения не сохранены: среди удаляемых есть номера из активных ДЗ. Отметьте согласие в окне подтверждения или сначала отмените эти ДЗ. | Changes not saved: some of the removed problems are in active homework. Tick the acknowledgement in the confirmation dialog or cancel that homework first. |
   | `error=deleteChanged` | error | Тема не удалена: с момента открытия страницы у неё изменился объём работы учеников. Обновите страницу — в окне подтверждения будут актуальные последствия. | Topic not deleted: the amount of student work has changed since the page was opened. Reload the page — the confirmation dialog will show the current consequences. |
2. Header: same as view (back, eyebrow, title, description, number search) + "Delete topic" button with the **detailed impact dialog** (§1.8, variant B) → `deleteTopicAction({ topicId, acknowledgedNumbersWithWork: String(topicImpact.numbersWithWork) })`.
3. Tabs "View | Edit" (Edit active).
4. Section `dict.topics.edit.sectionTitle` ("Редактирование темы" / "Edit topic") — one form posting to `updateTopicAction` (multipart):
   - Block `basicInfo` ("Основная информация" / "Basic information"):
     - `title` — text input, required; label `titleLabel` ("Название темы" / "Topic title"); prefilled.
     - `description` — textarea, 3 rows; label `descriptionLabel` ("Описание — необязательно" / "Description — optional"); prefilled.
   - Block `numbers` ("Номера" / "Problems"): the **numbers field** (§1.6) prefilled with all current numbers joined by `", "`, 5 rows, description `dict.topics.edit.numbersDescription` ("Можно вставлять длинные списки в несколько строк." / "You can paste long lists across several lines."). **This field replaces the topic's whole number set** on save.
   - Block `files` ("Файлы" / "Files"), two cells (theory, homework). Each cell:
     - file card without preview: title, the file's `originalName` (truncated), "Open"/"Download" buttons, and text `dict.student.fileCard.previewHidden` ("Предпросмотр скрыт. Файл можно открыть или скачать." / "Preview hidden. You can open or download the file.") or "Файл пока не загружен.";
     - file picker (`FileDropInput`, form field `theoryFile` / `homeworkFile`): label `replaceTheory` ("Заменить файл теории" / "Replace theory file") / `replaceHomework` ("Заменить файл заданий" / "Replace homework file"); accept `.pdf,.docx,.png,.jpg,.jpeg`; shows the picked file name or `dict.topics.widgets.fileDrop.none` ("Файл пока не выбран" / "No file selected"); button `choose` ("Выбрать файл" / "Choose file") / `replace` ("Заменить файл" / "Replace file"); helper `replaceHint` ("Можно выбрать новый файл или перетащить его сюда." / "Choose a new file or drag it here."). The file is **not** pre-uploaded here; it travels with the form submit;
     - when a file exists: small danger button `deleteTheory.label` ("Удалить файл теории" / "Delete theory file") / `deleteHomework.label` ("Удалить файл заданий" / "Delete homework file") → confirm dialog (title `deleteTheory.title` "Удалить файл теории?" / `deleteHomework.title` "Удалить файл заданий?", description "Файл … будет откреплён от темы и удалён из хранилища. Ученики перестанут его видеть. Это действие нельзя отменить.") → `deleteTopicFileAction({ topicId, fileKind: "theory" | "homework" })`. This is an immediate separate action, independent of the form.
   - Block `saving` ("Сохранение" / "Save"): the **save button with destructive-change preview** (§1.3.1).
5. Section `dict.topics.edit.answersTitle` ("Условия и ответы к заданиям" / "Statements and answers"; description `answersDescription` "LaTeX-условия и ответы к номерам." / "LaTeX statements and answers for each problem.") — the **answers manager** (§1.3.2). Anchor `#topic-answers`.

There is currently **no** "import numbers into this topic" block on this page, although the component and the API support it (see §7, Q4).

#### 1.3.1 Save button flow (`TopicEditSubmitButton`)

Button label: `dict.topics.submit.save` ("Сохранить изменения" / "Save changes"); while previewing `checking` ("Проверяем изменения…" / "Checking changes…"); while submitting `saving` ("Сохраняем изменения…" / "Saving changes…") plus hint `pendingHint` ("Файлы и номера обновляются. Не закрывайте страницу." / "Files and problems are being updated. Keep this page open.").

On press:
1. Run native form validation (title and numbers `required`). Stop if invalid.
2. `POST /api/teacher/topic-numbers-preview` with `{ topicId, numbers: <raw text of the numbers field> }`.
3. If the request fails / non-OK: show an error line (server `error` or `dict.topics.submit.previewFailed` "Не удалось проверить изменения. Сохраняем как есть." / "Could not check the changes. Saving as is.") and **submit the form anyway** with empty confirmation (the server re-checks and rejects destructive changes).
4. If `requiresConfirmation === false`: submit immediately with empty confirmation.
5. Otherwise open a wide confirm dialog:
   - kicker `dict.topics.widgets.confirm.kicker` ("Подтверждение" / "Confirmation");
   - title `dict.topics.submit.dialogTitle` ("Из темы исчезнут номера с работой учеников" / "Problems with student work will be removed");
   - intro `dialogIntro` ("Эти номера пропадут из темы, а вместе с ними — всё, что к ним привязано. Восстановить будет нечем." / "These problems will disappear from the topic along with everything attached to them. There is no way to restore them.");
   - list: one row per removed number **with student work** (`hasStudentWork`): `№ {number} — {summary}` (summary is the server-built consequence string, §4.3);
   - if `added.length > 0`: `format(dict.topics.submit.added, { numbers: added.join(", ") })` ("Появятся новые номера: {numbers}." / "New problems will be added: {numbers}.");
   - `format(dict.topics.submit.kept, { count: keptCount })` ("Останется без изменений: {count}." / "Unchanged: {count}.");
   - if `requiresAssignedConfirmation`: a checkbox with `format(dict.topics.submit.assignedAck, { numbers: "№ a, № b" })` ("Понимаю, что {numbers} сейчас в активных ДЗ — задание у ученика станет короче, и он об этом не узнает." / "I understand that {numbers} are in active homework — the student's assignment will get shorter and they will not be told."). The confirm button is disabled until it is ticked;
   - buttons: `dict.topics.widgets.confirm.cancel` ("Отмена" / "Cancel"); confirm `dict.topics.submit.confirm` ("Да, удалить эти номера" / "Yes, delete these problems"), pending `dict.topics.submit.pending` ("Сохраняем…" / "Saving…").
6. On confirm: submit the form with hidden fields `confirmNumbersRemoval = <numbers with student work joined by ", ">` and `allowAssignedRemoval = "1"` when the checkbox was ticked (else empty).

#### 1.3.2 Answers manager (`TopicAnswerManager`)

Client-side paginated editor over the topic's numbers; **page size 10** (`ANSWERS_PAGE_SIZE`).

- Toolbar: `navTitle` ("Навигация по условиям и ответам" / "Statements and answers"); `format(shownRange, { start, end, total })` ("Показаны номера {start}-{end} из {total}"); `format(savedSummary, { conditions, answers, total, pageSize: 10 })` ("Сохранено условий: {conditions} из {total}. Сохранено ответов: {answers} из {total}. Для больших тем блок разбит на страницы по {pageSize} номеров."); a page select (label `page` "Страница"/"Page", options 1..pageCount); buttons `prev` ("Назад"/"Back") and `next` ("Вперед"/"Next"), disabled at the ends; a row of page-number buttons: all pages if `pageCount ≤ 7`, else `1`, `current-1..current+1`, `pageCount` with "..." between gaps.
- If the screen was opened with `?number=N`, the manager jumps to the page containing the number whose **normalised** form equals `N` normalised and highlights that card with a ring.
- One card per number on the current page:
  - kicker `cardKicker` ("Материалы к номеру" / "Problem materials"), title `№ {number}`;
  - three badges: statement `hasCondition` ("Условие есть"/"Has statement") or `noCondition` ("Без условия"/"No statement"); answer `hasAnswer` ("Ответ есть"/"Has answer") or `noAnswer` ("Без ответа"/"No answer"); overall status `status.full` ("Условие и ответ"/"Statement and answer", green) when both saved values are non-blank, `status.partial` ("Частично заполнено"/"Partially filled", accent) when exactly one, `status.empty` ("Пусто"/"Empty", muted) when none;
  - **Statement block:** textarea (4 rows; label `conditionLabel` "LaTeX-условие"/"LaTeX statement"; placeholder `conditionPlaceholder`; disabled while saving/deleting); hint "Поддерживаются inline-формулы через `$...$` и отдельные блоки через `$$...$$`." / "Inline formulas with `$...$` and display blocks with `$$...$$` are supported."; **live preview of the draft** (label `conditionPreview` "Предпросмотр условия"/"Statement preview") or, when the draft is blank, a dashed box `conditionEmpty` ("Пока условие к этому номеру не добавлено." / "No statement for this problem yet."); inline error banner; button `saveCondition` ("Сохранить условие"/"Save statement"; `saving` "Сохраняем…" while pending; disabled when the draft is blank or a request is running); when a saved statement exists — small danger button `deleteCondition` ("Удалить условие"/"Delete statement") → confirm dialog (title `format(deleteConditionTitle, { number })` "Удалить условие № {number}?", description `deleteConditionDescription` "Сохранённое условие в LaTeX будет удалено. Ученики и ИИ-проверка перестанут его видеть. Это действие нельзя отменить.").
  - **Answer block:** same structure: textarea 5 rows (`answerLabel` "LaTeX-ответ"/"LaTeX answer", `answerPlaceholder`), same hint, draft preview (`answerPreview` "Предпросмотр ответа") or `answerEmpty` ("Пока ответ к этому номеру не добавлен."), error, `saveAnswer` ("Сохранить ответ"/"Save answer"), `deleteAnswer` ("Удалить ответ"/"Delete answer") with dialog title `format(deleteAnswerTitle, { number })` ("Удалить ответ № {number}?") and description `deleteAnswerDescription` ("Сохранённый ответ в LaTeX будет удалён. ИИ-проверка перестанет сверять решения с ним. Это действие нельзя отменить.").
- Save rules (client): trim the draft; do nothing if blank or equal to the trimmed saved value; otherwise `POST /api/teacher/number-conditions` / `number-answers`; on success replace both saved value and draft with the string returned by the server. Delete: `DELETE` same route; on success saved = null, draft = "".
- Client error mapping. Statement save: server `error` else `dict.topics.errors.conditionSave` ("Сохранение условия не удалось."); statement delete: server `error` else `conditionDelete` ("Не удалось удалить условие."). Answer save: server `error`, else by status — 401 `sessionExpired` ("Сессия истекла. Обновите страницу и войдите заново."), 404 `numberGone` ("Номер больше не найден. Обновите страницу."), 400 `answerBind` ("Не удалось привязать ответ к номеру."), other `answerSave` ("Сохранение ответа не удалось."). Answer delete: server `error`, else 401 `sessionExpired`, 404 `numberGone`, other `answerDelete` ("Не удалось удалить ответ.").
- Bottom pager (only when `pageCount > 1`): `format(pageOf, { page, total })` ("Страница {page} из {total}"), buttons `prevPage` ("Предыдущая страница") / `nextPage` ("Следующая страница").

**Phone mapping [PROPOSAL]:** the edit screen is long; split it into sub-screens reachable from the "Edit" tab: (a) "Info & numbers" form (title, description, numbers field, Save with the destructive-change bottom sheet), (b) "Files" (two rows: open / replace via document picker / delete with confirm), (c) "Statements & answers" — a paged or virtualised list of numbers with status badges; tapping a number opens the single-number editor (§1.4b) rather than editing ten cards inline. Confirm dialogs → modal alert / bottom sheet; the assigned-homework acknowledgement stays a checkbox that gates the destructive button.

### 1.4 Manual create form (DEVELOPER only; part of the topics list)

Component `TopicCreateForm`. Fields, top to bottom:

| Field | Control | Required | Copy |
|---|---|---|---|
| `title` | text input | yes | label `dict.topics.createForm.titleLabel` ("Название темы"/"Topic title"), placeholder `titlePlaceholder` ("Например, Логарифмы и их свойства") |
| `description` | textarea | **no** | label `descriptionLabel` ("Описание"/"Description") + `optional` ("— необязательно"/"— optional"), placeholder `descriptionPlaceholder` |
| theory file | file upload field | yes | label `theoryFile` ("Файл теории"/"Theory file"), helper `fileHelper` ("Поддерживаются PDF, DOCX, PNG и JPG. Можно выбрать файл или просто перетащить его в это поле.") |
| homework file | file upload field | yes | label `homeworkFile` ("Файл заданий"/"Homework file"), same helper |
| `numbers` | numbers field (§1.6), 4 rows | yes | description `numbersDescription` ("Подходит и для коротких списков, и для больших тем на сотни номеров.") |

File upload field behaviour: **picking a file uploads it immediately** to `POST /api/teacher/uploads` (multipart `file`, plus `previousFileId` when replacing an already-uploaded file in the same field so the server deletes the orphan). States per field: `idle`; `uploading` with percent bar and text `uploading` ("Загрузка файла…"/"Uploading file…"); `uploaded` — green row `uploaded` ("Загружено:"/"Uploaded:") `{originalName} · {size}` where size uses units `sizeUnits` (Б/КБ/МБ; `<1024` → bytes, `<1024²` → KB with 1 decimal, else MB with 1 decimal); `error` with message. Picking a new file aborts the running upload. Error text: server `error` if present, otherwise 401 → `dict.topics.errors.sessionExpired`, 400 → `fileInvalid` ("Файл не прошёл валидацию. Проверьте формат и размер."), other → `uploadFailed` ("Не удалось загрузить файл. Попробуйте ещё раз."); network failure → `networkUpload` ("Сеть прервалась во время загрузки файла.").

Hint panel under the fields: while any upload is running `hintUploading` ("Дождитесь окончания загрузки файлов. Кнопка создания станет доступной автоматически."); when both files are uploaded `hintReady` ("Оба файла загружены. Теперь можно создавать тему."); otherwise `hintStart` ("Сначала загрузите файл теории и файл заданий.").

Submit button `submit` ("Создать тему"/"Create topic"; `submitting` "Создаем тему…"). **Disabled unless** both uploads are in `uploaded` state with file ids, no upload is running, not already submitting, and `title.trim()` and `numbers.trim()` are non-empty. Submit → `POST /api/teacher/topics` JSON `{ title, description, numbers, theoryFileId, homeworkFileId }`. Success → navigate to the list with the `created` notice. Failure: server `error`, else 401 → `sessionExpired`, 400 → `createInvalid` ("Проверьте форму: название, описание, оба файла и список номеров обязательны."), other → `createFailed` ("Не удалось создать тему. Проверьте подключение к базе данных и повторите попытку."); network error → `networkCreate` ("Сеть прервалась во время создания темы. Попробуйте ещё раз.").

(The web client also supports a Vercel Blob direct-upload variant of the same endpoint — irrelevant for mobile, see §7 Q6.)

### 1.4b Single number

- **Site route:** `/teacher/topics/[topicId]/numbers/[number]`. `requireUser([TEACHER, DEVELOPER])`. The `number` path segment must match `^\d+$` (else 404); lookup is by **normalised** form within the topic; unknown topic/number → 404.
- **Data:** `getTeacherNumberDetail(topicId, number)` → `{ topic: { id, title, description }, number: { id, number, conditionLatex, answerLatex } }`.
- Header: back link `dict.topics.singleNumber.back` ("← К теме" / "← Back to topic") → TEACHER: topic view; DEVELOPER: topic edit, answers section. Eyebrow = topic title. Title `format(dict.topics.singleNumber.title, { number })` ("Номер {number}" / "Problem {number}"), using the **recorded** spelling. Number search on the right.
- **TEACHER (read-only):** section `sectionTitle` ("Условие и ответ" / "Statement and answer"): label "Условие" + rendered statement, or muted "Условие не добавлено."; label "Ответ" + rendered answer (shown directly), or muted "Ответ не добавлен.".
- **DEVELOPER (editor, `TeacherSingleNumberCard`):** section with description `sectionDescription` ("Редактируйте LaTeX-условие и ответ для этого номера."). Heading `№ {number}` + status badge (full / partial / empty as in §1.3.2). Two panels:
  - Statement: kicker `conditionLabel` ("Условие (LaTeX)"/"Statement (LaTeX)"); monospace textarea, 4 rows, placeholder `conditionPlaceholder` ("Введите условие в формате LaTeX"); **preview of the saved value** (label `preview` "Предпросмотр"/"Preview") — unlike the manager it shows the saved text, not the draft; error text; button "Сохранить условие" (disabled when saving, draft blank, or trimmed draft equals trimmed saved); "Удалить условие" with the same confirm dialog as the manager, shown only when a saved value exists.
  - Answer: kicker `answerLabel` ("Ответ (LaTeX)"/"Answer (LaTeX)"), placeholder `answerPlaceholder` ("Введите ответ в формате LaTeX"), same controls ("Сохранить ответ", "Удалить ответ").
  - Same two API routes and server rules as the manager. Fallback errors: `dict.topics.errors.conditionSave`, `conditionDelete`, `answerSave`, `answerDelete`.

**Phone mapping [PROPOSAL]:** pushed screen; destination of number search for staff. For DEVELOPER it doubles as the per-number editor opened from the answers list; show a live preview of the draft under each editor (the manager's behaviour is the better one on a small screen).

### 1.5 Import panel (DEVELOPER only)

Component `TopicImportPanel`. Two modes: `createTopic` (mounted on the topics list, "With AI" tab) and `topicId` (add/fill numbers in an existing topic — implemented in component and API but **not mounted on any page today**, §7 Q4).

Workflow: the developer gives a problem book to any external AI chat together with a fixed prompt, receives one JSON file, and loads it here. The app never calls an AI model for import.

**Layout**

1. Prompt button (hidden inside the panel when `hidePromptButton`, because the list page shows it in the switch row): §1.5.1.
2. Drop zone: title `dict.topics.importPanel.dropTitle` ("Перетащите ответ ИИ сюда или нажмите" / "Drag the AI reply here or click") or the picked file name; subtitle `oneJson` ("Один файл .json · " / "One .json file · ") + link-button `pasteText` ("вставить текстом" / "paste as text") which toggles a textarea; after a file is read the subtitle is `fileRead` ("Файл прочитан — нажмите «Проверить файл»" / "File loaded — click “Check file”"). File input accepts `application/json,.json,.txt`; only the first file is used; it is read as text on the device. Read failure → `readFailed` ("Не удалось прочитать файл."). Drag states: `dragTitle` ("Отпустите файл"), success flash `successTitle` ("Файл добавлен") for 900 ms.
3. Optional textarea (label `jsonLabel` "JSON текстом"/"JSON as text", 5 rows, monospace, placeholder `{"formatVersion": 1, "topic": {...}, "numbers": [...]}`); typing clears the file name and any preview/result.
4. Hint (`hintCreate` in create mode: "Промпт и задачник — в любой чат с ИИ, ответ-файл загрузите сюда. Название, описание и номера темы приедут из файла."; `hintAdd` in add mode: "… Номера с условиями и ответами добавятся в эту тему.") and button `check` ("Проверить файл"/"Check file"; `checking` "Проверяем…"), disabled while pending or when the text is blank → `POST /api/teacher/topic-import` with `mode: "preview"`.
5. Error banner: server `error` (the import validation messages of §3.9 are returned verbatim) or `importFailed` ("Импорт не удался. Попробуйте ещё раз."); network failure → `serverSilent` ("Сервер не ответил. Проверьте соединение и попробуйте снова.").
6. **Preview block** (after a successful preview):
   - `format(fileSummary, { title: fileTitle, count: totalInFile })` ("Файл «{title}», задач внутри: {count}");
   - create mode only (`willCreateTopic`): card with kicker `willCreate` ("Будет создана тема"/"Topic to be created"), the title, the description (if any), and when `duplicateTitle` a red warning `duplicateTitle` ("Тема с таким названием уже существует. Возможно, этот задачник уже импортирован — тогда отмените импорт и добавьте номера в существующую тему с её страницы редактирования."). A duplicate title is a warning only, not a block;
   - four tiles (`tiles.*`): `add` "Добавим"/"Will add" = `willAddNumbers`; `fill` "Заполним пустых"/"Will fill empty" = `willFillEmpty`; `overwrite` "Перезапишем"/"Will overwrite" = `willOverwrite` (red when > 0); `untouched` "Без изменений"/"Unchanged" = `untouched`;
   - when `willOverwrite > 0`: checkbox `overwriteLabel` ("Перезаписывать уже заполненные условия и ответы"/"Overwrite statements and answers that are already filled") with red sub-line `format(overwriteWarning, { count: willOverwrite })` ("Ручные правки этих номеров ({count} шт.) будут потеряны."). Default unchecked;
   - `issues` list (label "Отбраковано при проверке"/"Rejected during validation", red) — entries rejected by the server parser;
   - `warnings` list (label "Предупреждения от модели"/"Warnings from the model") — the AI's own `warnings` array, shown as is;
   - `sample` (label "Как это увидит ученик"/"How the student will see it"): the **first 5** numbers of the file; each card: `format(sampleNumber, { number })` ("Номер {number}"), rendered statement, then either label `answer` ("Ответ") + rendered answer or the hint `noAnswer` ("Ответа нет — автопроверка отправит номер на ручную проверку." / "No answer — AI check will send this problem for manual review.");
   - buttons: primary `applyCreate` ("Создать тему и импортировать"/"Create topic and import") in create mode or `apply` ("Импортировать"/"Import") in add mode (`applying` "Импортируем…" while pending) → same endpoint with `mode: "apply"` (and `overwriteFilled` in add mode); secondary `cancel` ("Отменить"/"Cancel") — just hides the preview.
7. After apply:
   - create mode: navigate to the **edit screen of the new topic** (`/teacher/topics/{topicId}/edit`) so the developer can attach theory/homework files (a topic created by import has no files);
   - add mode: success banner `format(done, { created, filled, overwritten })` ("Готово: добавлено {created}, заполнено {filled}, перезаписано {overwritten}") + when `skipped > 0` `format(doneSkipped, { skipped })` (", пропущено заполненных {skipped}") + "."; the text, file name and overwrite checkbox are reset and the page data is refreshed.

#### 1.5.1 Prompt button

Button `dict.topics.importPrompt.copy` ("Скопировать промпт для ИИ" / "Copy the AI prompt"). Copies the constant `TOPIC_IMPORT_PROMPT` (full text in Appendix A) to the clipboard; shows a "Скопировано"/"Copied" pill for 2 s; if clipboard access fails shows `clipboardDenied` ("Браузер не дал доступ к буферу обмена" / "The browser blocked clipboard access").

**Phone mapping [PROPOSAL]:** "With AI" tab of the "New topic" screen. Document picker for `.json`/`.txt` (or "Paste JSON" text area), "Copy prompt" via the system clipboard plus a "Share prompt" action (share sheet to an AI chat app is the natural mobile flow). Preview → scrollable screen with the four counters as a 2×2 grid; sample statements rendered with the LaTeX renderer.

### 1.6 Numbers field (shared widget)

Component `TopicNumbersField`, used in manual create and in edit.

- Label `dict.topics.numbersField.label` ("Номера заданий" / "Homework problems"); textarea, required; placeholder `placeholder` ("1-5, 8, 12-14").
- The client parses the text live with `parseNumbersInput` (§4.1 — the mobile app must port this function) and shows:
  - badge: `plural(locale, parsed.length, dict.topics.widgets.numberForms)` ("12 номеров") or `empty` ("Пока нет номеров" / "No problems yet");
  - when there are parsed numbers: badge `format(range, { from: first, to: last })` ("Диапазон {from}-{to}" / "Range {from}-{to}") — first and last of the sorted list;
  - while recomputing (deferred value): soft panel `computing` ("Обновляем список номеров…");
  - when the text is non-blank but nothing parses: the textarea turns red and an error panel `unrecognized` ("Не удалось распознать номера. Используйте числа и диапазоны вроде 1-5." / "Could not recognise any problems. Use numbers and ranges like 1-5.");
  - when numbers parse: soft panel with the description text (default `description` "Запятая, пробел, новая строка или диапазон через тире." / "Comma, space, new line, or a range with a dash.") and `format(finalList, { list })` ("Итоговый список: {list}" / "Final list: {list}") where `list` is the parsed list **compressed back into ranges** (consecutive numeric values `a, a+1, …` → `first-last`, segments joined by `", "`; values longer than 15 digits never join a range) and truncated to 120 characters + "...".

### 1.7 Number search box (present on every screen of this subsystem)

`ShbzNumberSearch` with endpoint `/api/teacher/topics/find-number`. Full contract in `01-shell-auth.md` §3.9/§6.6. Summary: digits only input (`inputMode=numeric`, non-digits stripped while typing), placeholder `dict.numberSearch.placeholder` ("Найти номер"/"Find a problem"), while pending `searching` ("Ищем номер…"). Client validation: `^\d+$` and not all zeros, else `invalid` ("Введите корректный номер."). Success → navigate to the single-number screen of the returned `topicId` + recorded `number`. Failure → server `error` or `notFound` ("Не удалось найти тему по этому номеру."). When several topics contain the same number, the first topic by `displayOrder, createdAt` wins.

### 1.8 Confirm / delete dialogs (shared widget)

`ConfirmDialog` (via `DeleteButton`): modal with kicker `dict.topics.widgets.confirm.kicker` ("Подтверждение"/"Confirmation"), title, description, buttons `cancel` ("Отмена"/"Cancel", focused by default) and danger `confirm` ("Да, удалить"/"Yes, delete"; `pending` "Удаляем…"/"Deleting…" while running). Backdrop tap / Esc closes unless pending. After the action finishes the dialog closes; errors thrown by client handlers are routed to the caller's inline error.

Delete-topic dialog texts (`dict.topics.deleteTopic.*`), title "Удалить тему?" / "Delete this topic?":

- **Variant A (list and view screens):** `before` + bold `format(quoted, { title })` + `after` → "Тема **«{title}»** будет удалена вместе с прикреплёнными файлами и статусами по номерам. Это действие нельзя отменить." / "Topic **“{title}”** will be deleted together with its attached files and per-problem statuses. This cannot be undone."
- **Variant B (edit screen, real impact):**
  - "Тема **«{title}»**" + `format(afterWithTotal, { total: impact.totalNumbers })` → " будет удалена вместе с прикреплёнными файлами и всеми номерами ({total}). Это действие нельзя отменить.";
  - if `describeTopicImpact(impact)` returns lines: `workBefore` ("Вместе с темой безвозвратно исчезнет работа по " / "Deleting the topic will permanently erase work on ") + bold `impact.numbersWithWork` + `plural(locale, numbersWithWork, workAfterForms)` (" номеру:" / " номерам:" / " номерам:"; en " problem:" / " problems:"), then a bullet list "— {line}" of the impact lines (§4.4);
  - else `noWork` ("По номерам этой темы пока нет ни прогресса учеников, ни условий и ответов." / "This topic's problems have no student progress, statements or answers yet.").

### 1.9 Dev panel (DEVELOPER only)

- **Site route:** `/teacher/panel` (`/developer/panel`), `force-dynamic`, `requireUser(DEVELOPER)`. Query `?tab=status|actions|broadcast|settings` selects the initial tab (anything else → `status`).
- **Data loaded on each render:** `getSiteSettingsUncached()`; `HomeworkCheck` count with `createdAt ≥ now − 24 h` (`checksLastDay`, 0 on DB error); students count; topics count; `StoredFile` count and sum of `size`; internal setting `internal.retentionLastRunAt`; list of all students `{ id, name }` ordered by name; in-memory queue lengths `getHomeworkCheckQueueLength()` and `getLessonPlanQueueLength()`.

**Layout**

1. Header: kicker `dict.planner.devPanel.kicker` ("Служебный доступ" / "Service access"), title `title` ("Панель разработчика" / "Developer panel"), number search.
2. Row: segmented tab bar — `tabs.status` "Статус"/"Status", `tabs.actions` "Действия"/"Actions", `tabs.broadcast` "Рассылка"/"Broadcast", `tabs.settings` "Настройки"/"Settings", and a fifth item `journal` "Журнал"/"Log" which is a **link to the journal screen** (§1.10). On the right, three status chips:
   - `format(chipQueue, { n: queueLength })` ("Очередь: {n}" / "Queue: {n}") — always green;
   - `format(chipAi, { used: checksLastDay, limit: settings.aiDailyLimit })` ("ИИ: {used} / {limit} за 24 ч" / "AI: {used} / {limit} in 24 h") — yellow when `checksLastDay ≥ aiDailyLimit × 0.8`, else green;
   - `format(chipStorage, { size })` ("Хранилище: {size}" / "Storage: {size}") — yellow when total bytes `> 512 × 1024 × 1024`, else neutral. `size` = `formatFileSize(bytes, locale)` (B / KB with 1 decimal / MB with 1 decimal; never GB).
3. Tab content:

**Tab "Status"** — grid of stat blocks (`dict.planner.devPanel.status.*`):
| Label | Value | Hint |
|---|---|---|
| `queue` "Очередь автопроверки" / "AI check queue" | `queueLength` | `queueHint` "проверок ждут выполнения сейчас" |
| `runs24h` "Запусков за 24 часа" / "Runs in 24 hours" | `{checksLastDay} / {aiDailyLimit}` + progress bar at `min(100, round(checksLastDay / max(1, aiDailyLimit) × 100))` % | `runsHint` "дневной бюджет ИИ" |
| `lessonQueue` "Очередь подбора уроков" / "Lesson selection queue" | `lessonQueueLength` | `lessonQueueHint` "персональных наборов ждут генерации" |
| `files` "Файлы в хранилище" / "Files in storage" | `filesCount` | `filesSizeLabel` |
| `students` "Учеников" / "Students" | `studentsCount` | — |
| `topics` "Тем" / "Topics" | `topicsCount` | — |
| `lastRetention` "Последнее автоудаление фото" / "Last photo auto-delete" | `formatDateTime(internal.retentionLastRunAt, locale)` (`dd.MM.yyyy, HH:mm`) or `retentionNever` "ещё не выполнялся" / "not run yet" | — |

**Tab "Actions"** — five service buttons (`dict.planner.devPanel.actions.*`). Each is an outline button; under it a line that shows the hint initially, `dict.planner.devPanel.actionRunning` ("Действие выполняется…" / "Action in progress…") while pending (button label becomes `running` "Выполняем…" with a spinner), then the action's result message in green (`ok`) or red (`!ok`). After each action the page's server data (stats, chips) is refreshed in the background.
| Button | Hint | Server action |
|---|---|---|
| `testAi` "Проверить подключение к ИИ" / "Test AI connection" | `testAiHint` "Тестовый запрос к модели: доступность и задержка." | `testAiConnectionAction` |
| `retention` "Автоудаление фото сейчас" / "Auto-delete photos now" | `retentionHint` "Не ждать суточного таймера, удалить просроченное." | `runRetentionNowAction` |
| `resetBudget` "Сбросить дневной бюджет ИИ" / "Reset daily AI budget" | `resetBudgetHint` "Обнулить счётчик запусков за сегодня." | `resetAiDailyBudgetAction` |
| `unfreeze` "Разморозить зависшие проверки" / "Unfreeze stale checks" | `unfreezeHint` "Пометить FAILED все проверки старше 15 минут." | `unfreezeChecksAction` |
| `flush` "Сбросить кэши платформы" / "Flush platform caches" | `flushHint` "Принудительно обновить данные на всех страницах." | `flushCachesAction` |

There are **no confirmation dialogs** on these buttons.

**Tab "Broadcast"** (`dict.planner.devPanel.broadcast.*`) — form:
- `title`: text, required, `maxLength 120`; label `titleLabel` ("Заголовок"/"Title"), placeholder `titlePlaceholder` ("Например: завтра занятия не будет").
- `body`: text, optional, `maxLength 300`; label `bodyLabel` ("Текст"/"Text"), hint `bodyHint` ("Необязательно"/"Optional"), placeholder `bodyPlaceholder` ("Подробности"/"Details").
- Recipients: label `recipientsLabel` ("Получатели"), hint `recipientsHint` ("Всем сразу или конкретным ученикам"). Two-option segmented control: `all` "Всем ученикам"/"All students" (**default**) and `selected` "Выбранным"/"Selected".
  - `all`: text `format(allHint, { n: students.length })` ("Уведомление получат все ученики: {n}.").
  - `selected`: search input (placeholder `searchPlaceholder` "Начните вводить имя ученика…"); a dropdown appears while the query is non-blank, listing up to **8** students whose name contains the query (case-insensitive), excluding already-picked ones; empty → `dict.planner.common.nobodyFound` ("Никого не нашлось" / "No one found"). Picking adds a removable chip (remove aria `format(remove, { name })` "Убрать {name}"). Counter `format(picked, { n })` ("Выбрано: {n}") or `nonePicked` ("Пока никто не выбран — найдите ученика по имени.").
- Submit `send` ("Отправить уведомление"/"Send notification"; `sending` "Отправляем…") → `broadcastNotificationAction`. Result message next to the button (green/red). On success the form and the picked list are reset (mode returns to "all").
- Recipients are **students only** (teachers cannot be targeted). No confirmation dialog.

**Tab "Settings"** — one form, groups and fields exactly as listed in §4.5 (table). Submit `settings.save` ("Сохранить настройки"/"Save settings"; `saving` "Сохраняем…"). Status line next to the button: before submit `applyHint` ("Значения перекрывают .env и применяются в течение 15 секунд без рестарта." / "Values override .env and apply within 15 seconds without a restart."), while pending `savingSettings` ("Сохраняем настройки…"), afterwards the action's message (green/red). Field values stay in the form after saving.

**Phone mapping [PROPOSAL]:** a bottom tab "Dev panel" for DEVELOPER. Inside: top segmented control with 5 items (Status / Actions / Broadcast / Settings / Log) or a simple menu list pushing 5 sub-screens. Status chips → a compact header strip. Status → 2-column tiles with pull-to-refresh (the site has no auto-refresh either). Actions → list rows with inline result text; consider a confirm alert for "Reset budget" and "Unfreeze" (site has none). Broadcast → form screen with a student multi-select picker (searchable modal list). Settings → grouped form (iOS-style sections) with switches, numeric inputs with steppers and a 3-option picker for reasoning effort.

### 1.10 Journal (DEVELOPER only)

- **Site route:** `/teacher/panel/journal` (`/developer/panel/journal`), `force-dynamic`, `requireUser(DEVELOPER)`. All filter state lives in the query string: `category`, `actor`, `action`, `outcome`, `days`, `page`.
- **Data:** `AuditLog` rows filtered and paged server-side, **50 per page** (`PAGE_SIZE`), newest first; total count; the list of actors = users that have at least one audit row (`{ id, name, role }`, by name).

**Layout**

1. Same header and tab bar as the dev panel; the four panel tabs are links back to `/developer/panel?tab=<key>`, and "Журнал"/"Log" (`dict.planner.journal.tab`) is the active item.
2. Card with intro `format(dict.planner.journal.intro, { days: retentionDays })` ("Кто и что вызвал на платформе. Записи хранятся {days} дней, потом удаляются автоматически." — `retentionDays` = env `AUDIT_LOG_RETENTION_DAYS`, default **90**) and the filters (`dict.planner.journal.filters.*`), applied immediately on change (no "Apply" button); any filter change resets `page`:
   | Filter | Control | Values |
   |---|---|---|
   | `category` "Категория"/"Category" | select | "" `all` "Все"/"All"; `AI` `catAi` "ИИ и расходы"/"AI and spending"; `DATA` `catData` "Изменения данных"/"Data changes"; `AUTH` `catAuth` "Входы"/"Sign-ins" |
   | `actor` `who` "Кто"/"Who" | select | "" `all`; one option per actor: `{name} — {roleLabel}` (`dict.planner.journal.roles`: "учитель"/"ученик"/"разработчик") |
   | `action` "Действие"/"Action" | text input, `maxLength 60`, placeholder `lesson_plan`, debounced **450 ms** | substring match on the system action name (case-sensitive `contains`; names are lowercase) |
   | `days` `period` "Период"/"Period" | select | `1` `day` "Сутки"/"Day"; `7` `week` "Неделя"/"Week" (**default**); `30` `month` "Месяц"/"Month"; `90` `threeMonths` "Три месяца"/"Three months"; `0` `allTime` "Всё время"/"All time" |
   | `outcome` | checkbox `onlyFailed` "Только ошибки"/"Only errors" | `failed` or absent |
   Server parsing: `category` must be exactly `AI|DATA|AUTH`, else no filter; `days` any finite number in `0..365` (floored), else 7; `page` ≥ 1.
3. Card with the table (min width 880 px, horizontally scrollable) or the empty text `empty` ("За выбранный период записей нет." / "No entries for the selected period."). Columns:
   | Column | Content |
   |---|---|
   | `colWhen` "Когда"/"When" | `formatDateTime(createdAt, locale)` → `dd.MM.yyyy, HH:mm` (server time zone = Europe/Moscow) |
   | `colWho` "Кто"/"Who" | actor name snapshot (system actors translated: "Автопроверка"→"AI check", "Автозавершение урока"→"Lesson auto-finish") or "—"; then ` · {roleLabel}` when `actorRole` is set |
   | `colAction` "Действие"/"Action" | category chip (`dict.planner.journal.categories`: AI "ИИ"/"AI", DATA "Данные"/"Data", AUTH "Входы"/"Sign-ins"; **red chip when `outcome === "failed"`**) + human label `dict.planner.journal.actions[action]` (table in §4.6) or the raw action name when no label exists; when a label exists, the raw system name is repeated below in small monospace (the text filter works on it) |
   | `colWhat` "Что"/"What" | for `progress.status` rows whose target event still exists: bold line `{studentName} · № {number} · {topicTitle}`; then the summary — `auditSummaryFor(entry, locale)` (§4.6) falling back to `targetLabel`, then "—"; for `progress.status` rows with `meta.studentId` and `meta.homeworkNumberId`: the expandable **progress status history** widget (`04-teacher-students.md`; `GET /api/teacher/progress-history`) and a disclosure `details` ("Детали записи"/"Entry details") showing `meta` as pretty-printed JSON; when `error` is set: red text, collapsed behind "{first 140 chars}… `fully`" ("полностью"/"show all") if longer than **140** characters |
   | `colTokens` "Токены"/"Tokens" | "—" when both token fields are null, else `{inputTokens ?? 0} → {outputTokens ?? 0}` |
   | `colCost` "Стоимость"/"Cost" | "—" when `costRub` is null, else `costRub.toFixed(2) + " ₽"` |
4. Pager when `pageCount > 1`: `prev` "Назад"/"Back" (hidden on page 1), `format(pageOf, { page, total })` ("Страница {page} из {total}"), `next` "Дальше"/"Next" (hidden on the last page).

**Phone mapping [PROPOSAL]:** list of cards instead of a table: line 1 = time + category chip (red if failed) + action label; line 2 = actor · role; line 3 = summary; trailing = tokens and cost when present; error text in red, expandable. Tapping a card opens a detail sheet (raw action name, meta JSON, progress history for `progress.status`). Filters → a filter bottom sheet; infinite scroll or "Load more" using `page`.

---

## 2. View models

```ts
type UserRole = "STUDENT" | "TEACHER" | "DEVELOPER";
type Locale = "ru" | "en";

/** StoredFile projection used by topic screens. */
type StoredFileRef = {
  id: string;
  originalName: string;
  mimeType: string;      // "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "image/png" | "image/jpeg"
  size: number;          // bytes
  uploadedAt: string;    // ISO
};

/* ---------- 1.1 Topics list (subset of getTeacherTopicsOverview().topics[i]) ---------- */
type TopicListItem = {
  id: string;
  title: string;
  description: string;           // "" when empty
  displayOrder: number;
  totalNumbers: number;          // _count.homeworkNumbers
  studentsWithActivity: number;  // distinct students with ≥1 non-null status; TEACHER: own students only
  // Also present in the site payload, unused by this screen (used by statistics):
  // greenCount, yellowCount, redCount, markedCount, totalStudents, totalSlots, progressPercent,
  // theoryFile, homeworkFile, theoryFileId, homeworkFileId, answersFileId, createdAt, updatedAt, subject, grade
};

/* ---------- 1.2 / 1.3 Topic detail (getTeacherTopicDetail) ---------- */
type TopicNumber = {
  id: string;                    // homeworkNumberId
  number: string;                // digits, leading zeros significant
  displayOrder: number;          // 1-based within the topic
  estimatedMinutes: number | null; // legacy column, never edited here
  conditionLatex: string | null;
  answerLatex: string | null;
};

type TopicDetail = {
  topic: {
    id: string;
    title: string;
    description: string;
    displayOrder: number;
    theoryFile: StoredFileRef | null;
    homeworkFile: StoredFileRef | null;
    homeworkNumbers: TopicNumber[];   // ordered by displayOrder asc
  };
  stats: {
    totalNumbers: number;
    theoryAttached: boolean;
    homeworkAttached: boolean;
    conditionsCount: number;          // numbers with non-blank conditionLatex
    answersCount: number;             // numbers with non-blank answerLatex
  };
};

/* ---------- 1.4b Single number (getTeacherNumberDetail) ---------- */
type NumberDetail = {
  topic: { id: string; title: string; description: string };
  number: { id: string; number: string; conditionLatex: string | null; answerLatex: string | null };
};

/* ---------- 1.3 delete dialog (summarizeTopicImpact / describeTopicImpact) ---------- */
type TopicImpactSummary = {
  totalNumbers: number;
  numbersWithWork: number;       // numbers for which hasStudentWork() is true — the value to acknowledge on delete
  statusCount: number;           // Σ students with a status, over all numbers
  noteCount: number;             // Σ students with a non-blank note
  activeAssignments: number;     // Σ homework-assignment entries
  checkResults: number;          // Σ AI check verdicts
  lessonItems: number;           // Σ lesson / homework-plan items
  numbersWithCondition: number;
  numbersWithAnswer: number;
};
type TopicImpact = { summary: TopicImpactSummary; lines: string[] /* localized, may be empty */ };

/* ---------- 1.3.1 numbers change preview (POST topic-numbers-preview) ---------- */
type NumbersChangePreview = {
  keptCount: number;
  added: string[];                         // sorted numerically
  requiresConfirmation: boolean;           // any removed number has student work
  requiresAssignedConfirmation: boolean;   // any removed number is in an active homework
  removed: Array<{
    number: string;
    summary: string;                       // localized consequence text, e.g. "статус у 3 учеников, входит в 1 активное ДЗ, условие и ответ"
    hasStudentWork: boolean;
    isAssigned: boolean;
  }>;
};

/* ---------- 1.5 Import ---------- */
type ImportNumber = { number: string; conditionLatex: string; answerLatex: string | null };

type ImportPreview = {
  fileTitle: string;
  fileDescription?: string;      // create mode only
  willCreateTopic?: true;        // create mode only
  duplicateTitle?: boolean;      // create mode only
  totalInFile: number;
  willAddNumbers: number;
  willFillEmpty: number;         // always 0 in create mode
  willOverwrite: number;         // always 0 in create mode
  untouched: number;             // always 0 in create mode
  sample: ImportNumber[];        // first 5 numbers of the parsed file
  warnings: string[];            // from the file, ≤ 50 items, each ≤ 300 chars
  issues: string[];              // produced by the server parser (localized)
};

type ImportApplyResult = {
  topicId?: string;              // create mode only
  created: number;
  filled: number;
  overwritten: number;
  skipped: number;               // filled numbers left alone because overwriteFilled was false
};

/* ---------- 1.4 Upload ---------- */
type UploadedFile = { id: string; originalName: string; mimeType: string; size: number; uploadedAt: string };

/* ---------- 1.9 Dev panel ---------- */
type ReasoningEffort = "low" | "medium" | "high";

type SiteSettings = {
  aiEnabled: boolean;
  aiModel: string;
  aiShortlistModel: string;
  aiReasoningEffort: ReasoningEffort;
  aiMinConfidence: number;
  aiDailyLimit: number;
  aiPerStudentHourlyLimit: number;
  aiCheckConcurrency: number;
  photoRetentionDays: number;              // 0 = auto-delete off
  maxPhotosPerAssignment: number;
  completedChecksKept: number;
  lessonPlanEnabled: boolean;
  lessonPlanShortlistSize: number;
  lessonPlanMaxItems: number;
  lessonPlanConcurrency: number;
  aiPlanDailyLimit: number;
  homeworkPlanEnabled: boolean;
  homeworkPlanMaxItems: number;
  homeworkPlanShortlistSize: number;
  lessonCheckEnabled: boolean;
  lessonCheckDailyLimit: number;
  lessonCheckPerStudentHourlyLimit: number;
  lessonIdleWarnMinutes: number;
  lessonIdleAlertMinutes: number;
  loginHelpContact: string;
};

type DeveloperPanelStats = {
  queueLength: number;          // AI homework-check queue (in memory)
  checksLastDay: number;        // HomeworkCheck rows created in the last 24 h
  studentsCount: number;
  topicsCount: number;
  filesCount: number;
  filesSizeBytes: number;       // site passes a preformatted label; mobile should get bytes
  filesSizeLabel: string;
  lastRetentionAt: string | null; // ISO from internal.retentionLastRunAt
  lastRetentionLabel: string;
  lessonQueueLength: number;    // AI plan queue (lessons + homework plans)
};

type DeveloperPanelData = {
  stats: DeveloperPanelStats;
  settings: SiteSettings;
  students: Array<{ id: string; name: string }>;   // all students, by name — for the broadcast picker
};

type PanelActionResult = { ok: boolean; message: string };   // message already localized

/* ---------- 1.10 Journal ---------- */
type AuditCategory = "AI" | "DATA" | "AUTH";

type AuditLogRow = {
  id: string;
  createdAt: string;                // ISO
  category: AuditCategory;
  action: string;                   // dotted system name, e.g. "lesson_plan.generate"
  outcome: "ok" | "failed";
  actorId: string | null;
  actorName: string | null;         // snapshot, ≤ 200 chars
  actorRole: UserRole | null;
  targetType: string | null;        // ≤ 60
  targetId: string | null;          // ≤ 100
  targetLabel: string | null;       // ≤ 200
  summary: string | null;           // Russian snapshot, ≤ 300 (ends with "…" when clipped)
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costRub: string | null;           // Decimal(12,4); only for category AI
  durationMs: number | null;
  error: string | null;             // ≤ 500
  meta: Record<string, unknown> | null;   // meta.i18n = { key, params? } when translatable
  clientIp: string | null;          // stored, not displayed
};

/** What the journal screen actually needs per row (server-rendered strings). */
type JournalEntry = {
  id: string;
  createdAt: string;
  category: AuditCategory;
  action: string;
  actionLabel: string | null;       // dict.planner.journal.actions[action]
  outcome: "ok" | "failed";
  actorName: string | null;         // localized for system actors
  actorRole: UserRole | null;
  progressTarget: string | null;    // "{student} · № {number} · {topic}" for progress.status rows
  summary: string | null;           // auditSummaryFor ?? targetLabel
  progressRef: { studentId: string; homeworkNumberId: string } | null; // enables the history widget
  meta: Record<string, unknown> | null;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costRub: string | null;
};

type JournalQuery = {
  category?: AuditCategory;
  actor?: string;                   // user id
  action?: string;                  // substring
  outcome?: "failed";
  days?: number;                    // 0..365, default 7; 0 = all time
  page?: number;                    // ≥ 1, default 1
};

type JournalPage = {
  entries: JournalEntry[];
  total: number;
  page: number;
  pageSize: 50;
  pageCount: number;                // max(1, ceil(total / 50))
  actors: Array<{ id: string; name: string; role: UserRole }>;
  retentionDays: number;            // default 90
};
```

---

## 3. Mutations and queries

Common to all `app/api/**` routes here: JSON body; errors are `{ "error": "<localized text>" }`; rate limiting via `enforceApiRateLimit(scope, userId, limit, windowMs)` → **429** `{ error: dict.apiCommon.rateLimited }` ("Слишком много запросов. Подождите немного и попробуйте снова." / "Too many requests. Wait a moment and try again.") with `Retry-After: <seconds>`; if the limiter's DB write fails → **503** `{ error: dict.apiCommon.serviceUnavailable }` with `Retry-After: 5`. Windows are **fixed windows aligned to the epoch** (`floor(now / windowMs) × windowMs`), per user and scope. Server actions have no rate limit.

Every content mutation ends with: invalidate all platform data cache tags, revalidate the dashboard/student/teacher/topic routes, and publish realtime event `{ kind: "topic-content-changed", topicId? }` (§5).

### 3.1 Create topic (manual) — `POST /api/teacher/topics`

- Role: DEVELOPER (else 401 `developerRightsRequired`). Rate limit `api:topics-create`: **12 / 60 s**.
- Body: `{ title?: string; description?: string; numbers?: string; theoryFileId?: string; homeworkFileId?: string }`.
- Processing: `title` → `normalizeSingleLineText` (control chars → space, collapse whitespace, trim); `description` → `normalizeMultilineText` (CRLF→LF, strip control chars, trim line ends, trim); `numbers` → `parseNumbersInput` (§4.1).
- Validation: title non-empty, at least one parsed number, both file ids non-empty → else **400** `dict.apiContent.topics.formInvalid` ("Проверьте форму: название, оба файла и список номеров обязательны." / "Check the form: the title, both files and the problem list are required."). Description is optional. Both files must exist **and have been uploaded by the same user** (`uploadedById = user.id`) → else **400** `filesUnavailable` ("Файлы не найдены или уже недоступны. Загрузите их заново.").
- Effect (one transaction): new `Topic` with `displayOrder = max(displayOrder) + 1` (appended at the end), the two file ids; numbers created with `displayOrder = index + 1` in parsed (numerically sorted) order, in batches of 200.
- Success **200** `{ redirectTo: "/teacher/topics?created=1" }`. DB failure **500** `saveFailed` ("Не удалось сохранить тему в базе данных. Проверьте подключение к PostgreSQL.").
- No audit-log row is written for manual creation (the `topic.created` template exists but is unused).

### 3.2 Update topic — server action `updateTopicAction(formData)`

- Role: DEVELOPER. Multipart form (server-action body limit 15 MB).
- Fields: `topicId`, `title`, `description`, `numbers` (raw text), optional files `theoryFile`, `homeworkFile` (and a legacy `answersFile` with no UI), hidden `confirmNumbersRemoval` (comma-separated numbers), `allowAssignedRemoval` (`"1"` or empty).
- Steps and outcomes (each failure is a redirect to the edit page with `?error=<code>`; see notice table in §1.3):
  1. Normalise as in 3.1. If `topicId`, `title` or parsed numbers are missing → `error=invalid` (on the edit page if `topicId` is known, otherwise on the list).
  2. Topic not found → list with `error=save`.
  3. **Twin check:** `findHomeworkNumberTwins(existingNumbers, newNumbers)` — a new number whose normalised form equals an existing number's normalised form but whose spelling differs → `error=numbersTwin`.
  4. **Destructive-change gate:** recompute `buildTopicNumbersChangePlan(loadTopicNumberFacts(topicId), newNumbers)` (§4.3). If `requiresConfirmation`: the confirmed list (`confirmNumbersRemoval` split by comma, trimmed, digits only) must contain **every** removed number that has student work → else `error=numbersConfirm`; if `requiresAssignedConfirmation` and `allowAssignedRemoval !== "1"` → `error=numbersAssigned`.
  5. Upload new files (only when a file with `size > 0` was sent) through `saveUploadedFile` (§4.8 validation). Any failure → uploaded blobs are cleaned up, `error=upload`.
  6. One DB transaction: create `StoredFile` rows for new uploads; update `title`, `description`, file ids (a new upload replaces the reference, absent upload keeps the old one); **delete** every existing number not present (by exact string) in the new list; update `displayOrder` of kept numbers to their index + 1 in the new sorted list; create missing numbers (batches of 200). Failure → cleanup uploads, `error=save`.
  7. Delete now-unreferenced old files (replaced theory/homework files, answer files of removed numbers) from storage — best effort.
  8. Success → `?saved=1`.
- Kept numbers keep their id, statement, answer and all student data; only the order changes.

### 3.3 Delete a topic file — server action `deleteTopicFileAction(formData)`

- Role: DEVELOPER. Fields: `topicId`, `fileKind` ∈ `"theory" | "homework" | "answers"` (UI sends only the first two).
- Missing/invalid input or unknown topic → list with `error=save`. No file attached → edit page with `?fileDeleted=<kind>` (idempotent success). DB failure → `error=fileDelete`.
- Effect: set the corresponding file id to null, then delete the `StoredFile` row and the stored object if nothing else references it. Success → `?fileDeleted=<kind>`.

### 3.4 Delete topic — server action `deleteTopicAction(formData)`

- Role: DEVELOPER. Fields: `topicId`, optional `acknowledgedNumbersWithWork` (integer as string).
- No `topicId` → silently returns. Unknown topic → list with `error=delete`.
- **Impact gate:** `impact = summarizeTopicImpact(loadTopicNumberFacts(topicId))`. If `impact.numbersWithWork > 0`, `Number(acknowledgedNumbersWithWork)` must be an integer equal to `impact.numbersWithWork`; otherwise redirect to the **edit page** with `error=deleteChanged` and nothing is deleted.
- Effect: delete the `Topic` (DB cascades numbers and everything attached, §0.3); then delete unreferenced files (theory, homework, answers file, per-number answer files). DB failure → list with `error=delete`.
- Writes audit row: category `DATA`, action `topic.delete`, target `Topic`/`topicId`, text key `topic.deleted` with `{ count: <files cleaned> }` ("Удалена тема, файлов вычищено: {count}" / "Topic deleted, files cleaned up: {count}").
- Success → list with `?deleted=1`.

### 3.5 Reorder topics — `POST /api/teacher/topics/order`

- Role: DEVELOPER. Rate limit `api:topics-order`: **30 / 60 s**.
- Body, either form: `{ orderedTopicIds: string[] }` (full order, used by the site) **or** `{ topicId: string; direction: "up" | "down" }` (move by one position; supported by the API, not used by the current UI).
- Neither form valid → **400** `dict.apiContent.topicsOrder.invalidRequest` ("Некорректный запрос на изменение порядка тем.").
- Full order: must be a permutation of the current topic id set (same length, no duplicates, all ids exist) → else **409** `listChanged` ("Список тем изменился. Обновите страницу и повторите перетаскивание." / "The topic list has changed. Refresh the page and drag again.").
- Direction: unknown id or already at the edge → **200** `{ orderedTopicIds: <current>, moved: false }`.
- Effect: every topic gets `displayOrder = index + 1`. Success **200** `{ orderedTopicIds: string[]; moved: true }`. Failure **500** `saveFailed` ("Не удалось сохранить новый порядок тем.").
- The order is global: students' topic lists follow it.

### 3.6 Find number — `GET /api/teacher/topics/find-number?number=<digits>`

- Roles TEACHER, DEVELOPER (else 401 `unauthorized`). Rate limit `api:find-number`: **30 / 60 s**.
- Validation: `^\d{1,20}$` and normalised ≠ `"0"` → else **400** `dict.apiContent.findNumber.invalidNumber` ("Укажите корректный номер.").
- Match: topics having a number whose normalised form equals the query's normalised form; first by `displayOrder asc, createdAt asc`.
- **200** `{ topicId, topicTitle, number /* recorded spelling */, href: "/teacher/topics/{topicId}/numbers/{number}" }`; **404** `dict.apiCommon.numberNotFound` ("Номер не найден."); **500** `searchFailed` ("Не удалось найти тему по номеру.").

### 3.7 Topic statements for pickers — `GET /api/teacher/topics/conditions?topicId=<id>`

- Roles TEACHER, DEVELOPER. Rate limit `api:topic-conditions`: **120 / 60 s**.
- **200** `{ conditions: Record<homeworkNumberId, string | null> }`; missing `topicId` → `{ conditions: {} }`; DB error → empty map (never fails).
- Used by number-selection grids in other subsystems (homework assignment, manual lesson) through the hook `useTopicConditions(topic)`: the page ships statements only for the first topic (`conditionsLoaded: true`); for any other selected topic the hook fetches once and caches per topic id until the screen is left; a failed fetch is ignored (the grid works without statements).

### 3.8 Statement and answer of a number

`POST /api/teacher/number-conditions` — role DEVELOPER; rate limit `api:number-conditions` **60 / 60 s** (shared by POST and DELETE).
- Body `{ homeworkNumberId: string; conditionLatex: string }`. `conditionLatex` → `normalizeMultilineText`.
- Missing id or empty text → **400** `dict.apiContent.numberConditions.latexRequired` ("Введите LaTeX-условие для номера." / "Enter the LaTeX statement for the problem."). Unknown number → **404** `numberNotFound`. DB error → **500** `saveFailed` ("Не удалось сохранить условие к номеру.").
- **200** `{ conditionLatex: string }` (normalised value as stored). No length limit is enforced by this route.

`DELETE /api/teacher/number-conditions` — body `{ homeworkNumberId }`. Missing id → **400** `numberNotFound`; unknown → **404** `numberNotFound`; nothing stored → **200** `{ success: true }` (idempotent); DB error → **500** `deleteFailed` ("Не удалось удалить условие к номеру."). Success **200** `{ success: true }`; sets `conditionLatex = null`.

`POST /api/teacher/number-answers` — role DEVELOPER; rate limit `api:number-answers` **60 / 60 s** (shared by POST and DELETE).
- Body `{ homeworkNumberId: string; answerLatex: string }`. `answerLatex` is only `trim()`-med (no multiline normalisation).
- Missing id or empty text → **400** `dict.apiContent.numberAnswers.latexRequired` ("Введите LaTeX-ответ для номера."). Unknown → **404**. DB error → **500** `saveFailed` ("Не удалось сохранить ответ к номеру.").
- Effect: sets `answerLatex` and clears the legacy per-number `answerFileId` (deleting that file if unreferenced). **200** `{ answerLatex: string }`.

`DELETE /api/teacher/number-answers` — body `{ homeworkNumberId }`. Same status pattern; clears both `answerLatex` and `answerFileId`; **500** `deleteFailed` ("Не удалось удалить ответ к номеру."). **200** `{ success: true }`.

Side effects on other subsystems: the statement is what students, lesson boards and AI checks show/send; the answer is the reference for AI homework/lesson checks. Changes propagate through the `topic-content-changed` event.

### 3.9 Numbers change preview — `POST /api/teacher/topic-numbers-preview`

- Role DEVELOPER. Rate limit `api:topic-numbers-preview`: **60 / 60 s**. Read-only.
- Body `{ topicId: string; numbers: string /* raw field text */ }`.
- Errors: no `topicId` → **400** `dict.apiContent.topicNumbersPreview.topicMissing` ("Не указана тема."); no parsed numbers → **400** `emptyNumbers` ("Список номеров пуст — тема не может остаться без номеров."); unknown topic → **404** `dict.apiCommon.topicNotFound` ("Тема не найдена."); twins → **400** `format(twins, { typed, existing })` for the first twin ("Номера {typed} и {existing} — это один и тот же номер, оставьте один вариант записи.").
- **200** `NumbersChangePreview` (§2).

### 3.10 Import — `POST /api/teacher/topic-import`

- Role DEVELOPER. Rate limit `api:topic-import`: **10 / 60 s** (preview and apply each count).
- Request body limit: `Content-Length > 2 × 1024 × 1024` bytes → **413** `dict.apiContent.topicImport.fileTooBig` ("Файл слишком большой. Разбейте задачник на части по 200–300 задач.").
- Body: `{ mode?: "preview" | "apply" /* anything else = preview */; text: string /* raw file text */; topicId?: string; createTopic?: true; overwriteFilled?: true }`.
- Neither `topicId` nor `createTopic` → **400** `topicMissing` ("Не указана тема для импорта.").
- Parsing (`parseTopicImportText`, §4.2) failure → **400** with the parser's message (list in §4.2).
- **Create mode** (`createTopic: true`):
  - preview → **200** `ImportPreview` with `willCreateTopic: true`, `duplicateTitle` = a topic with exactly this title exists, `willAddNumbers = totalInFile`, other counters 0;
  - apply → transaction: create `Topic` (title, description from the file, `displayOrder = max + 1`, **no files**) and all numbers with statement and answer, `displayOrder = index + 1`, batches of 200. **200** `{ topicId, created: n, filled: 0, overwritten: 0, skipped: 0 }`. Failure **500** `createFailed` ("Не удалось создать тему. Проверьте подключение к PostgreSQL.").
- **Add mode** (`topicId`): unknown topic → **404** `topicDeleted` ("Тема не найдена — возможно, её удалили."). Build `buildImportPlan(parsedNumbers, existingNumbers)` (§4.2):
  - preview → **200** `ImportPreview` (`willAddNumbers = toCreate`, `willFillEmpty = toFill`, `willOverwrite = toOverwrite`, `untouched`);
  - apply → transaction: create `toCreate` appended after the current last `displayOrder`; update `toFill` always and `toOverwrite` only when `overwriteFilled === true`; an update always writes `conditionLatex` and writes `answerLatex` **only when the file has a non-null answer** (a file without answers never erases a manually entered answer). **200** `{ created, filled, overwritten: overwriteFilled ? toOverwrite : 0, skipped: overwriteFilled ? 0 : toOverwrite }`. Failure **500** `writeFailed` ("Не удалось записать номера в базу данных. Проверьте подключение к PostgreSQL.").
- Import never deletes numbers and never touches `estimatedMinutes` or answer files.

### 3.11 Upload — `POST /api/teacher/uploads` (multipart variant)

- Role DEVELOPER. Rate limit `api:teacher-uploads`: **60 / 10 min**.
- Multipart fields: `file` (required), `previousFileId` (optional — the file previously uploaded into the same form slot; it is deleted if it belongs to this user and nothing references it).
- No file / empty file → **400** `dict.apiContent.uploads.fileRequired` ("Выберите файл для загрузки."). Validation failure (§4.8) → **400** with the specific validation message. Other failure → **500** `uploadFailed` ("Не удалось загрузить файл.").
- **200** `{ file: UploadedFile }`. The created `StoredFile` is not attached to anything until used in `POST /api/teacher/topics`; an unused upload is simply an orphan row (cleaned only when replaced via `previousFileId`).
- The same route also implements the Vercel Blob client-upload handshake (`blob.generate-client-token`, `blob.upload-completed`, `action: "register-blob"` with `pathname` starting `uploads/`, ≤ 512 chars, no `..`; 409 `alreadyRegistered`) — web-only, not needed by mobile.

### 3.12 File download — `GET /files/{fileId}` (`?download=1`, `?thumb=1`)

Session required (401 plain text otherwise); access per §0.2 (`canAccessStoredFile`), 404 when not allowed/not found. `download=1` → `Content-Disposition: attachment`, else `inline`; `filename*=UTF-8''<originalName>`. `thumb=1` returns a thumbnail for image types. Supports `ETag`/304.

### 3.13 Dev panel — server actions (`actions/developer.ts`)

All `requireUser(DEVELOPER)`; all return `{ ok: boolean; message: string }` where `message` is an audit template rendered in the developer's UI language; most also write an `AuditLog` row with the same text (`outcome` = `ok`/`failed`).

| Action | Input | Behaviour | Result messages (ru / en) | Audit row |
|---|---|---|---|---|
| `saveSiteSettingsAction(formData)` | all settings fields (§4.5); switches arrive as `"on"` when checked | `parseSiteSettingsForm` → clamp/validate → upsert every key in `SiteSetting` → drop the 15-s in-memory cache | ok: "Настройки сохранены и применены — подействуют в течение 15 секунд." / "Settings saved and applied — they take effect within 15 seconds." · fail: "Не удалось сохранить настройки. Применена ли миграция SiteSetting?" / "Could not save the settings. Has the SiteSetting migration been applied?" | `DATA` · `developer.settings_saved` |
| `testAiConnectionAction` | — | If `aiEnabled` is false or API key/model are not configured → `ok:false` "Автопроверка выключена или не настроен ключ/модель." / "AI check is turned off or the key/model is not configured." (**no audit row**). Else one chat-completion ping to the main model (prompt "Ответь строго одним словом: ok", low effort), **20 s timeout** | ok: "Модель отвечает: {model} · {elapsedMs} мс." / "The model responds: {model} · {elapsedMs} ms." · HTTP error: "Модель недоступна: {reason}." (`reason` = `HTTP <status> <first 140 chars of body>` or the first 140 chars of the exception message) · timeout: "Модель недоступна: таймаут 20 секунд." / "The model is unavailable: 20-second timeout." | `AI` · `developer.ai_ping`, meta `{ model, elapsedMs, mode }` or `{ model, status }` / `{ model, error }` |
| `runRetentionNowAction` | — | `pruneExpiredHomeworkPhotos()` (returns `{ submissionPhotos, checkPhotos, lessonPhotos, files }`), stores `internal.retentionLastRunAt = now` | ok: "Автоудаление выполнено: снято ссылок на фото — {photos}, удалено файлов — {files}." (`photos = submissionPhotos + checkPhotos`) · fail: "Автоудаление не выполнено — подробности в логах сервера." | `DATA` · `developer.retention_run` |
| `resetAiDailyBudgetAction` | — | Resets the persistent rate-limit bucket scope `api:homework-checks:global`, identifier `global` | ok: "Дневной бюджет автопроверки сброшен." / "The daily AI check budget has been reset." · fail: "Не удалось сбросить бюджет — подробности в логах сервера." | `DATA` · `developer.ai_budget_reset` |
| `unfreezeChecksAction` | — | All `HomeworkCheck` rows with status `PENDING` or `CHECKING` and `createdAt < now − 15 min` → status `FAILED`, `activeSlot = null`, `checkedAt = now`, `error = "Проверка снята разработчиком как зависшая. Запустите её заново."` | ok: "Зависших проверок снято: {count}." / "Stuck checks cleared: {count}." · fail: "Не удалось снять зависшие проверки — подробности в логах сервера." | `DATA` · `developer.checks_unfrozen`, meta `{ count }` |
| `flushCachesAction` | — | Invalidates all platform data cache tags and the site-settings cache | ok: "Кэши платформы сброшены." / "Platform caches flushed." | `DATA` · `developer.caches_flushed` |
| `broadcastNotificationAction(formData)` | `title` (trim, cut to 120), `body` (trim, cut to 300), `toAll` = `"on"` or absent, repeated `recipients` = student ids | Invalid when title is empty, or `toAll` is off and no recipients → `ok:false` "Заполните заголовок и выберите получателей." / "Fill in the title and choose recipients." (**no audit row**). Recipients are re-queried with `role = STUDENT` (ids of non-students are dropped silently). One `Notification` per student: `type: "broadcast"`, `title`, `body` (null when empty), `href: null`, no `params` — shown to students **as typed, not translated** | ok: "Уведомление отправлено ученикам: {count}." / "Notification sent to students: {count}." | `DATA` · `developer.broadcast_sent`, meta `{ recipients, toAll, title }` |

Broadcast side effect: recipients see the notification in their bell (`01-shell-auth.md` §1.4) on their next poll; there is no realtime push and no undo.

### 3.14 Journal — server-rendered query (no API route today)

`prisma.auditLog` with `where = { category?, actorId?, action: { contains }?, outcome: "failed"?, createdAt: { gte: now − days×24h }? }`, `orderBy createdAt desc`, `skip (page−1)×50`, `take 50`, plus `count` and the actors list. For `progress.status` rows the page resolves `targetId` (a `ProgressStatusEvent` id) to `{student.name} · № {number} · {topic.title}`. A REST equivalent is proposed in §6.

### 3.15 Progress history — `GET /api/teacher/progress-history?studentId&homeworkNumberId[&cursor]`

Used by the journal for `progress.status` rows. Roles TEACHER (own students) / DEVELOPER; 403 `forbidden`, 400 `paramsRequired`, 404 `notFound`; rate limit `api:progress-history` **90 / 60 s**; 20 entries per page with `nextCursor`. Full contract in `04-teacher-students.md`.

### 3.16 Rate-limit summary

| Scope | Limit | Window | Routes |
|---|---|---|---|
| `api:topics-create` | 12 | 60 s | POST topics |
| `api:topics-order` | 30 | 60 s | POST topics/order |
| `api:find-number` | 30 | 60 s | GET topics/find-number |
| `api:topic-conditions` | 120 | 60 s | GET topics/conditions |
| `api:number-conditions` | 60 | 60 s | POST + DELETE number-conditions |
| `api:number-answers` | 60 | 60 s | POST + DELETE number-answers |
| `api:topic-numbers-preview` | 60 | 60 s | POST topic-numbers-preview |
| `api:topic-import` | 10 | 60 s | POST topic-import (preview + apply) |
| `api:teacher-uploads` | 60 | 10 min | POST uploads |
| `api:progress-history` | 90 | 60 s | GET progress-history |

---

## 4. Business rules the mobile mock must imitate

### 4.1 Number strings

```ts
/** Leading zeros stripped, at least one char kept: "010203" → "10203", "000" → "0". */
normalizeHomeworkNumber(v) = v.trim().replace(/^0+(?=.)/, "");

/** Numeric order without Number(): shorter normalised string first, then lexicographic. */
compareHomeworkNumbers(a, b)

/** New spelling that equals an existing number up to leading zeros but is written differently. */
findHomeworkNumberTwins(existing: string[], next: string[]): Array<{ existing: string; typed: string }>
```

`parseNumbersInput(input: string): string[]` — exact algorithm (port it; it runs on the client for the live preview and on the server for create/update/preview):

1. Replace every dash-like character `‐ ‑ ‒ – — ― − ﹘ ﹣ －` with `-`.
2. Extract tokens with `/(^|[\s,;]+)(\d+\s*-\s*\d+|\d+)(?=$|[\s,;]+)/g` — separators are whitespace, `,`, `;`. A token is either a single digit string or a range `a-b` (spaces around `-` allowed). Anything else (letters, `1.5`, `1--3`) is ignored.
3. Keep a map *normalised → as typed*, capped at **2000** entries (`MAX_NUMBERS`). Adding skips a number whose normalised form is `"0"` or already present (**first spelling wins**: `"01, 1"` → `["01"]`).
4. Range `a-b`: skip if either bound is empty or longer than 15 digits; skip if either value ≤ 0; `start = min`, `end = max`; skip the whole range if `end − start ≥ 2000`; otherwise expand every integer, **left-padded with zeros to `max(len(a), len(b))`** (`"000001-000005"` → six-digit numbers; `"051001-051009"` keeps the zero).
5. Result sorted with `compareHomeworkNumbers`.

### 4.2 Import file format and parsing (`lib/topic-import.ts`)

Expected file (exactly what the prompt in Appendix A asks the AI for):

```json
{
  "formatVersion": 1,
  "topic": { "title": "…", "description": "…" },
  "numbers": [ { "number": "010203", "conditionLatex": "…", "answerLatex": "…" | null } ],
  "warnings": ["…"]
}
```

Constants: `IMPORT_FORMAT_VERSION = 1`, `MAX_IMPORT_NUMBERS = 300`, `MAX_IMPORT_TITLE_LENGTH = 200`, `MAX_IMPORT_DESCRIPTION_LENGTH = 1000`, `MAX_IMPORT_CONDITION_LENGTH = 4000`, `MAX_IMPORT_ANSWER_LENGTH = 2000`, `MAX_IMPORT_WARNINGS = 50`, `MAX_IMPORT_WARNING_LENGTH = 300`, `IMPORT_NUMBER_PATTERN = /^\d{1,12}$/`.

Text → JSON (`parseImportJson`): trim; strip a leading ```` ```json ```` / ```` ``` ```` fence and a trailing ```` ``` ````; empty → error `empty`. Try `JSON.parse`. If it parses **and** no string anywhere in the object contains a control character `U+0000–U+0009` or `U+000B–U+001F` (a sign of un-escaped LaTeX: `\t`ext, `\f`rac, `\r`ight), accept. Otherwise retry on a repaired text where every single backslash is doubled, except `\\`, `\"`, `\/`, and `\n` not followed by a Latin letter (so a real line break survives while `\nu`, `\ne`, `\nabla` are repaired). If the repaired parse fails: use the direct result if it parsed, else error `notJson`.

Validation (`parseTopicImport`) — fatal errors (HTTP 400, message from `dict.topics.lib.import.*`):
| Condition | Key | ru |
|---|---|---|
| text empty | `empty` | Файл пустой. |
| not parseable | `notJson` | Файл не разбирается как JSON. Чаще всего модель не удвоила обратные слэши в формулах — попросите её прислать файл заново, строго по промпту. |
| root is not an object | `notObject` | Файл должен быть JSON-объектом. Проверьте, что скопирован весь ответ модели. |
| `formatVersion` (number or numeric string, rounded) ≠ 1 | `version` | Не та версия формата: ожидается formatVersion 1. Возьмите свежий промпт со страницы импорта. |
| `topic` missing / not an object | `noTopic` | В файле нет блока topic с названием темы. |
| `topic.title` empty after single-line normalisation (then cut to 200) | `emptyTitle` | В файле пустое название темы (topic.title). |
| `numbers` is not an array | `noNumbers` | В файле нет списка задач (numbers). |
| no entry survived | `nothingParsed` | В файле нет ни одной задачи, которую удалось бы разобрать. |

Per-entry rules — a rejected entry adds a line to `issues` and is skipped:
| Condition | Key | ru |
|---|---|---|
| already 300 accepted entries (stop reading) | `tooMany` `{max}` | За один импорт берём не больше 300 задач — остальные пропущены. Разбейте файл на части. |
| entry is not an object | `notObjectEntry` | Пропущена запись: это не объект задачи. |
| bad `number` | `badNumber` `{value}` (JSON-stringified) | Пропущена запись с неверным номером: {value}. |
| duplicate by normalised form (first wins) | `duplicate` `{number}` | Номер {number} встречается несколько раз — взят первый. |
| `conditionLatex` empty after multiline normalisation (then cut to 4000) | `emptyCondition` `{number}` | Номер {number} пропущен: пустое условие. |

`number` accepted as: a string matching `^\d{1,12}$` whose normalised form ≠ `"0"` (kept as typed, trimmed), or a JSON integer `1 … 999 999 999 999` (converted to string). `answerLatex`: string, or finite number (converted to string), anything else → empty; multiline-normalised, cut to 2000; empty → `null`. `description`: multiline-normalised, cut to 1000 (may be empty). `warnings`: array items single-line-normalised, cut to 300 chars, empties dropped, first 50 kept. Accepted numbers are sorted with `compareHomeworkNumbers`.

Matching against an existing topic (`buildImportPlan`), per parsed item, by **normalised** number:
- no existing number → `toCreate`;
- else with `conditionFilled = existing.conditionLatex.trim() != ""`, `answerFilled` likewise, `conditionDiffers = existing.conditionLatex?.trim() !== item.conditionLatex`, `answerDiffers = (existing.answerLatex?.trim() || null) !== item.answerLatex`:
  - `needsOverwrite = (conditionFilled && conditionDiffers) || (answerFilled && item.answerLatex !== null && answerDiffers)` → `toOverwrite`;
  - else `needsFill = (!conditionFilled && conditionDiffers) || (!answerFilled && item.answerLatex !== null)` → `toFill`;
  - else `untouched += 1`.
- Updates are written to the number under its **existing** spelling (file `"010203"` updates topic `"10203"`).

### 4.3 Destructive number-set change (edit form)

Facts per number (`TopicNumberFacts`): `studentsWithStatus` (rows with non-null status), `studentsWithNote` (non-blank note), `studentsWithDeadline`, `activeAssignments` (homework-assignment entries), `checkResults` (AI verdicts), `lessonItems` (lesson / homework-plan items), `hasCondition`, `hasAnswer`, `hasAnswerFile`.

`hasStudentWork` = any counter > 0 or any of the three flags. (So a number that merely has a statement counts as "work".) `isAssigned` = `activeAssignments > 0`.

Plan for a new list: `removed` = existing numbers whose exact string is not in the new list (sorted numerically, each with `hasStudentWork`, `isAssigned`, `summary`); `added` = new strings not existing; `keptCount`; `requiresConfirmation` = some removed has work; `requiresAssignedConfirmation` = some removed is assigned.

`summary` (`describeNumberImpact`, `dict.topics.lib.numbersChange.*`) = the non-empty parts joined by `", "`, in this order:
1. `statusAt` "статус у {students}" / "status for {students}" — `students = plural(n, studentForms)` ("{n} ученика" / "{n} учеников" / "{n} учеников"; en "{n} student(s)");
2. `notesAt` "заметки у {students}";
3. `deadlineAt` "дедлайн у {students}";
4. `inAssignments` "входит в {assignments}" — `assignmentForms` "{n} активное ДЗ" / "{n} активных ДЗ" / "{n} активных ДЗ";
5. `verdictsOfCheck` "{verdicts} ИИ-проверки" — `verdictForms` "{n} вердикт/вердикта/вердиктов";
6. `lessonItems` "{items} в наборах занятий" — `lessonItemForms` "{n} пункт/пункта/пунктов";
7. `conditionAndAnswer` "условие и ответ" | `condition` "условие" | `answer` "ответ";
8. `answerFile` "файл с ответом";
or `nothing` "ничего не потеряется" / "nothing will be lost" when all are empty.

Server enforcement on save (independent of the client dialog): see §3.2 steps 3–4. A stale confirmation (the set of dangerous numbers changed between preview and save) is rejected with `numbersConfirm`.

### 4.4 Topic deletion

`describeTopicImpact(summary)` lines, only non-empty ones, in order:
1. `statusLine` "{statuses} светофора у учеников" — `statusForms` "{n} статус/статуса/статусов" (en: "{n} traffic-light status(es) for students");
2. `noteLine` "{notes} учеников" — `noteForms` "{n} заметка/заметки/заметок";
3. `assignedLine` "{numbers} из активных ДЗ (сами ДЗ тоже удалятся вместе с фото решений)" — `dict.topics.widgets.numberForms`;
4. `verdictLine` "{verdicts} ИИ-проверок";
5. `lessonLine` "{items} в наборах занятий и черновиках ДЗ";
6. `latexLine` "LaTeX: условий — {conditions}, ответов — {answers}" (when either count > 0).

Server rule: when `numbersWithWork > 0` the request must carry the same `numbersWithWork` the user saw (§3.4), otherwise `deleteChanged`.

**[QUIRK]** The list and view screens call the delete action without the acknowledgement, so deleting from there succeeds only for topics with `numbersWithWork === 0`; for any topic with statements/answers/progress the user is bounced to the edit page with the `deleteChanged` notice and must delete from there. The mobile app should always fetch the impact first and show variant B (§7 Q5).

### 4.5 Site settings (`lib/site-settings.ts`) — full list

Stored as strings in table `SiteSetting(key, value, updatedAt)`; read with defaults from env; 15-second in-memory cache on the server (hence "applies within 15 seconds"). Saving always writes **all 25 keys**.

Parsing rules (`applySettingRows` over `getSiteSettingsDefaults()`):
- boolean: `true` only when the form field is checked;
- int: blank or non-numeric → **the env default** (not the previously saved value); otherwise `floor`, then clamped to `[min, max]`;
- float: same without `floor`;
- string: `trim()`, cut to the max length;
- `aiReasoningEffort`: must be one of the three values, otherwise the default.

| Group (dict `planner.devPanel.settings.*`) | Key | Type / control | Default | Min–max (step) | Label ru / en | Hint ru |
|---|---|---|---|---|---|---|
| `aiCheck` "Автопроверка ИИ" / "AI check" | `aiEnabled` | bool switch; sub-label `aiOn` "включена — решения учеников проверяются автоматически" / `aiOff` "выключена — все решения ждут ручной проверки" | `true` iff env `AI_CHECK_API_KEY` and `AI_CHECK_MODEL` are set | — | Автопроверка ИИ / AI check | — |
| | `aiModel` | text ≤ 100 | env `AI_CHECK_MODEL` or `""` (production value per migration: `gpt-6.1-sol`) | — | `model` Модель / Model | `modelHint` Проверки, подбор урока и ДЗ. Например gpt-6.1-sol. Ключ API остаётся в .env |
| | `aiShortlistModel` | text ≤ 100 | env `AI_SHORTLIST_MODEL` or `"gpt-6-luna"` | — | `shortlistModel` Модель отсева / Shortlist model | `shortlistModelHint` Первый, грубый этап подбора урока и ДЗ — дешёвая модель, например gpt-6-luna. Пусто — основная модель. Если не ответит, подбор сам перейдёт на основную |
| | `aiReasoningEffort` | select `low` / `medium` / `high`; option labels `devPanel.effort.*`: "low — быстрый" / "medium — сбалансированный" / "high — максимальная точность" | `high` (env `AI_CHECK_REASONING_EFFORT`) | — | `effort` Reasoning effort | `effortHint` Больше — точнее, но дольше и дороже |
| | `aiMinConfidence` | number | `0.6` (env `AI_CHECK_MIN_CONFIDENCE`) | 0–1 (0.05) | `minConfidence` Порог уверенности / Confidence threshold | `minConfidenceHint` Ниже порога — на ручную проверку (0–1) |
| | `aiDailyLimit` | int | `300` (env `AI_CHECK_DAILY_LIMIT`) | 1–100000 | `dailyLimit` Запусков в день, всего / Runs per day, total | `dailyLimitHint` Общий предохранитель расходов |
| | `aiPerStudentHourlyLimit` | int | `10` | 1–1000 | `hourlyLimit` Запусков в час на ученика / Runs per hour per student | `hourlyLimitHint` Лимит на одного ученика |
| | `aiCheckConcurrency` | int | `3` | 1–8 | `checkConcurrency` Параллельных проверок / Parallel checks | `checkConcurrencyHint` Сколько работ ИИ проверяет одновременно; сдачи на уроке идут вне очереди ДЗ |
| `lessonPlan` "ИИ-подбор уроков" / "AI lesson selection" | `lessonPlanEnabled` | bool switch, label `lessonPlanOn` "Подбор заданий на урок включён" | `true` iff AI key+model set | — | | — |
| | `lessonPlanShortlistSize` | int | `30` | 20–150 | `shortlist` Шорт-лист, номеров / Shortlist, problems | `shortlistHint` Сколько кандидатов уходит во второй этап с полными условиями |
| | `lessonPlanMaxItems` | int | `40` | 5–60 | `maxItems` Максимум задач в плане / Max problems per plan | `maxItemsHint` Потолок задач в наборе одного ученика |
| | `lessonPlanConcurrency` | int | `3` | 1–10 | `concurrency` Параллельных генераций / Parallel generations | `concurrencyHint` Сколько учеников генерируются одновременно |
| | `aiPlanDailyLimit` | int | `300` | 1–100000 | `planDailyLimit` Подборов в день, всего / Selections per day, total | `planDailyLimitHint` Общий потолок ИИ-подбора уроков и ДЗ: один ученик — один подбор |
| `classwork` "Классная работа (урок)" / "Classwork (lesson)" | `lessonCheckEnabled` | bool switch, label `lessonCheckOn` "Проверка сдач на уроке включена", sub-label `lessonCheckHint` "Ученики сдают номера фото прямо на занятии, ИИ проверяет по одному номеру" | `true` iff AI key+model set | — | | — |
| | `lessonCheckDailyLimit` | int | `300` | 1–100000 | `lessonDailyLimit` Сдач в день, всего / Submissions per day, total | `lessonDailyLimitHint` Отдельный кошелёк: урок не тратит бюджет проверок ДЗ |
| | `lessonCheckPerStudentHourlyLimit` | int | `30` | 1–1000 | `lessonHourlyLimit` Сдач в час на ученика / Submissions per hour per student | `lessonHourlyLimitHint` На уроке сдают по одному номеру — лимит выше, чем у ДЗ |
| | `lessonIdleWarnMinutes` | int | `8` | 1–120 | `idleWarn` Простой: предупреждение, мин / Idle: warning, min | `idleWarnHint` Столько минут без сдач — жёлтая метка на панели урока |
| | `lessonIdleAlertMinutes` | int | `15` | 1–240 | `idleAlert` Простой: тревога, мин / Idle: alert, min | `idleAlertHint` Столько минут без сдач — тревожная метка, пора подойти |
| `homeworkPlan` "ИИ-выдача ДЗ" / "AI homework assignment" | `homeworkPlanEnabled` | bool switch, label `homeworkPlanOn` "Подбор домашних заданий включён" | `true` iff AI key+model set | — | | — |
| | `homeworkPlanMaxItems` | int | `40` | 3–60 | `homeworkMaxItems` Максимум задач в ДЗ / Max problems per homework | `homeworkMaxItemsHint` Домашка заметно меньше урочного набора |
| | `homeworkPlanShortlistSize` | int | `60` | 20–150 | `homeworkShortlist` Шорт-лист ДЗ, номеров / Homework shortlist, problems | `homeworkShortlistHint` Сколько кандидатов уходит во второй этап |
| `files` "Файлы и хранение" / "Files and storage" | `photoRetentionDays` | int | `365` (env `HOMEWORK_PHOTO_RETENTION_DAYS`; env value ≤ 0 → `0`) | 0–3650 | `retention` Автоудаление фото ДЗ, дней / Auto-delete homework photos, days | `retentionHint` 0 — не удалять автоматически |
| | `maxPhotosPerAssignment` | int | `10` | 1–30 | `maxPhotos` Максимум фото на одно ДЗ / Max photos per homework | `maxPhotosHint` Действует на новые загрузки |
| | `completedChecksKept` | int | `50` | 1–500 | `checksKept` Хранить завершённых проверок на ученика / Completed checks kept per student | `checksKeptHint` Старые удаляются со снапшотами фото |
| | `loginHelpContact` | text ≤ 200 | env `LOGIN_HELP_CONTACT` or `""` | — | `loginHelp` Контакт для «не получается войти» / Contact for “can't sign in” | `loginHelpHint` Показывается на странице входа; пусто — строка скрыта |

The API key and base URL are **not** settings (env only) and are never shown.

Derived UI rules: AI chip yellow at `checksLastDay ≥ 0.8 × aiDailyLimit`; storage chip yellow above 512 MiB; budget bar percent `min(100, round(checksLastDay / max(1, aiDailyLimit) × 100))`.

### 4.6 Audit log texts and action names

Writing (`writeAuditLog`): never throws; `summary` = Russian rendering of the template, clipped to 300 chars; `meta.i18n = { key, params? }` keeps the template key so the journal can re-render in the viewer's language; `error` clipped to 500; `costRub` is computed **at write time**, only for category `AI`, and never recalculated.

Display (`auditSummaryFor(entry, locale)`): if `meta.i18n.key` is a known template → `renderAuditText({ key, params }, locale)`; else if `summary` exactly equals a parameter-less Russian template → that template in the viewer's language; else `summary` as stored.

`renderAuditText` parameter handling: `null` → `""`; boolean → `"1"`/`"0"`; a string param whose **name ends with `At`** is formatted as date-time in the locale; special cases — `lesson_item.check`: `verdict` code → `dict.audit.verdicts` (correct "верно"/"correct", incorrect "с ошибкой"/"incorrect", uncertain "не распознано"/"unrecognised"); `account.created`: `role` → `dict.roles` (Ученик/Преподаватель/Разработчик); `progress.status`: `source` → `dict.progress.sources`, `decision` → `dict.progress.decisions`, `previousStatus`/`status` → `dict.progress.statuses` (GREEN "Решил"/"Solved", YELLOW "Решил с ошибками"/"Solved with mistakes", RED "Не решил"/"Not solved", none "Без отметки"/"No mark").

Templates (`dict.audit.templates`, ru → en):

| Key | ru | en |
|---|---|---|
| `auth.login` | Вход в систему | Signed in |
| `auth.login.failed` | Неудачный вход: {login} | Failed sign-in: {login} |
| `auth.logout` | Выход из системы | Signed out |
| `student.created` | Создан ученик {name} | Student {name} created |
| `student.deleted` | Удалён ученик {name} со всеми работами | Student {name} deleted with all their work |
| `student.password_reset` | Сброшен пароль ученика | Student's password reset |
| `teacher.password_reset` | Сброшен пароль учителя | Teacher's password reset |
| `account.created` | Создан аккаунт {name} ({role}) | Account {name} created ({role}) |
| `account.owner_changed` | Смена владельца у учеников: {count} | Students reassigned to another teacher: {count} |
| `teacher.deleted` | Удалён учитель {name}; учеников переведено: {count} | Teacher {name} deleted; students reassigned: {count} |
| `topic.created` | Создана тема «{title}», номеров: {count} | Topic “{title}” created, problems: {count} |
| `topic.deleted` | Удалена тема, файлов вычищено: {count} | Topic deleted, files cleaned up: {count} |
| `lesson.scheduled` | Время урока: {startsAt} | Lesson time: {startsAt} |
| `lesson.finished_early` | Урок завершён досрочно | Lesson finished early |
| `lesson.auto_results` | Итоги закрыты автоматически: не решил — {notSolved}, не успел — {skipped}, отметок посещаемости — {attendance} | Results closed automatically: not solved — {notSolved}, not reached — {skipped}, attendance marks — {attendance} |
| `solution.check` | Автопроверка: верно {correct}, с ошибкой {incorrect}, не распознано {uncertain} | AI check: correct {correct}, incorrect {incorrect}, unrecognised {uncertain} |
| `solution.check.failed` | Автопроверка не удалась | AI check failed |
| `lesson_item.check` | Классная работа: № {number} — {verdict} | Classwork: problem {number} — {verdict} |
| `lesson_item.check.failed` | Проверка классной работы не удалась | Classwork check failed |
| `lesson_plan.shortlist` | Отбор кандидатов на урок для ученика {name} | Shortlisting lesson candidates for {name} |
| `lesson_plan.generate` | Подбор набора на урок для ученика {name} | Selecting a lesson set for {name} |
| `homework_plan.shortlist` | Отбор кандидатов в ДЗ для ученика {name} | Shortlisting homework candidates for {name} |
| `homework_plan.generate` | Подбор домашнего задания для ученика {name} | Selecting homework for {name} |
| `developer.*` | see §3.13 | see §3.13 |
| `progress.status` | {source}: {previousStatus} → {status}. {decision} | same |

`dict.progress.sources`: teacher "Отметка учителя"/"Teacher's mark", homework_check "Проверка ДЗ"/"Homework check", lesson_teacher "Итог урока от учителя"/"Lesson result by the teacher", lesson_check "Проверка на уроке"/"In-lesson check", lesson_end "Завершение урока"/"Lesson ended". `dict.progress.decisions`: changed "Статус изменён", reaffirmed "Отметка подтверждена повторно", unchanged "Статус уже совпадает", uncertain "Проверка не дала определённого результата", downgrade_blocked "Проверка ДЗ не понижает достигнутый статус", newer_status "Сохранена отметка, сделанная после запуска проверки", no_status "Этот итог не меняет общий прогресс", lesson_result_preserved "Сохранён ранее выставленный итог урока".

Action-name labels shown in the journal's "Action" column (`dict.planner.journal.actions`; unknown names are shown raw):

| Action | ru | en |
|---|---|---|
| `progress.status` | Решение об изменении прогресса | Progress change decision |
| `auth.login` | Вход в систему | Sign in |
| `auth.logout` | Выход из системы | Sign out |
| `solution.check` | Автопроверка ДЗ | Homework AI check |
| `lesson_plan.shortlist` | ИИ-отсев номеров к уроку | AI shortlist of lesson problems |
| `lesson_plan.generate` | ИИ-план урока | AI lesson plan |
| `homework_plan.shortlist` | ИИ-отсев номеров к ДЗ | AI shortlist of homework problems |
| `homework_plan.generate` | ИИ-план ДЗ | AI homework plan |
| `account.create` | Создание аккаунта | Account created |
| `student.create` | Создание ученика | Student created |
| `student.delete` | Удаление ученика | Student deleted |
| `student.owner_change` | Смена владельца учеников | Student owner changed |
| `student.password_reset` | Сброс пароля ученика | Student password reset |
| `teacher.delete` | Удаление учителя | Teacher deleted |
| `teacher.password_reset` | Сброс пароля учителя | Teacher password reset |
| `topic.create` | Создание темы | Topic created |
| `topic.delete` | Удаление темы | Topic deleted |
| `developer.settings_saved` | Панель: настройки сохранены | Panel: settings saved |
| `developer.ai_ping` | Панель: проверка связи с ИИ | Panel: AI connection test |
| `developer.retention_run` | Панель: очистка по сроку хранения | Panel: retention cleanup |
| `developer.ai_budget_reset` | Панель: сброс бюджета ИИ | Panel: AI budget reset |
| `developer.checks_unfrozen` | Панель: снятие зависших проверок | Panel: stale checks unfrozen |
| `developer.caches_flushed` | Панель: сброс кэшей | Panel: caches flushed |
| `developer.broadcast_sent` | Панель: рассылка уведомлений | Panel: notification broadcast |
| `lesson.schedule` | Время урока | Lesson time set |
| `lesson.finish` | Досрочное завершение урока | Lesson finished early |
| `lesson.auto_results` | Автозакрытие итогов урока | Lesson results closed automatically |
| `lesson_item.check` | Проверка классной работы | Classwork check |

System actor names (`dict.audit.actors`): `autoCheck` "Автопроверка"/"AI check", `lessonAutoFinish` "Автозавершение урока"/"Lesson auto-finish".

Retention: rows older than `AUDIT_LOG_RETENTION_DAYS` (default 90; ≤ 0 disables cleanup) are deleted by a background job. Progress history (`ProgressStatusEvent`) is a separate store that is **not** subject to this retention.

Pricing (`lib/ai-pricing.ts`) — the journal only **displays** the stored `costRub` (2 decimals + " ₽") and token counts. For the mock, cost = `(inputTokens × priceIn + outputTokens × priceOut) / 1 000 000` RUB, prices in RUB per million tokens by model name (lower-cased, provider prefix before `/` dropped): `gpt-6.1-sol` 420 / 2100, `gpt-6-sol` 420 / 2100, `gpt-6-luna` 30 / 150, `gpt-6-astra` 1580 / 7900, `gpt-5.6-sol` 800 / 4700, `gpt-5.6-terra` 400 / 2560; unknown model → 420 / 2100 (env-overridable on the server: `AI_MODEL_PRICES="model=in/out,…"`, `AI_PRICE_INPUT_RUB_PER_MTOK`, `AI_PRICE_OUTPUT_RUB_PER_MTOK`). `null` when both token counts are null; non-AI rows always `null`.

### 4.7 LaTeX rendering rules (`LatexAnswerPreview`)

Statements and answers are plain text with KaTeX math. The same renderer is used everywhere (view cards, editor previews, import sample). Algorithm:

1. `mergeSoftWrappedLines(value)`: display formulas (`$$…$$`, `\[…\]`) are shielded; every line break (with surrounding whitespace) in the remaining prose is replaced by a single space **unless** the previous line is empty, ends a sentence (`/[.!?…:;]["»')\]]*$/`), or the break touches a display formula. I.e. typographic wraps are glued, meaningful breaks kept.
2. Trim; split into blocks on blank lines (`/\n{2,}/`); drop empty blocks. No blocks → render nothing.
3. A block that is entirely `\[ … \]` → display formula.
4. Otherwise split the block into segments by `$$ … $$` (non-greedy, may span lines). A `$$…$$` segment → display formula; other segments → text lines.
5. Text lines: split by `\n`, trim, drop empties. Each line is split into labelled items by `splitLineIntoItems`: an item starts at a label at the start of a word and outside `$…$` — parenthesis form `а)`, `Б)`, `1)`, `10)` (`/^(?:[А-ЯЁа-яёA-Za-z]|\d{1,2})\)/`) anywhere, or dot form `а.`, `1.` (`/^(?:[А-ЯЁа-яёA-Za-z]|\d{1,2})\.(?=\s|$)/`) only when the line itself starts with a dot label. With labels → items are laid out as a wrapping row of unbreakable chunks (each item moves to a new line as a whole); without → one paragraph.
6. Inside a line/item, split by `/(\$[^$]+\$)/`: `$…$` parts → inline math; the rest → plain text.
7. Display formula: `splitMathIntoItems` finds top-level labels (same shapes, also `\text{А)}`), ignoring anything inside `{…}`, `(...)` or `\begin{…}…\end{…}`; with more than one labelled item → each item rendered as inline math in `\displaystyle`, laid out as a wrapping row; otherwise one block formula, horizontally scrollable when wider than the card.
8. KaTeX errors: inline → a small red code chip with the error name; block → red box `ErrorName: message`. Rendering never throws.
9. Line-break rule for long formulas (`lib/math-line-breaks.ts`): when KaTeX wraps a formula after a binary/relation operator, the operator is **repeated at the start of the next line** (Russian math typography). Cosmetic; re-applied on resize.

Supported syntax = KaTeX (not full LaTeX): no `\usepackage`, `\newcommand`, `\label`, `\ref`, `\includegraphics`, `figure`/`table`/`tabular`/`align` environments; `aligned` and `cases` are fine.

### 4.8 Upload validation (`lib/upload-validation.ts`)

Applies to `/api/teacher/uploads` and to files sent with `updateTopicAction`. Messages `dict.topics.lib.upload.*`:

| Rule | Key | ru / en |
|---|---|---|
| name non-empty, ≤ 255 chars | `nameTooLong` | Имя файла должно содержать не больше 255 символов. / The file name must be at most 255 characters. |
| no control characters in the name | `badChars` | Имя файла содержит недопустимые символы. |
| extension ∈ `.pdf .docx .png .jpg .jpeg` | `extension` | Поддерживаются только PDF, DOCX, PNG и JPG. / Only PDF, DOCX, PNG and JPG are supported. |
| size is a positive integer | `emptySize` | Файл пуст или имеет некорректный размер. |
| size ≤ **15 × 1024 × 1024** bytes | `tooBig` | Файл слишком большой. Максимальный размер — 15 МБ. / The file is too big. Maximum size is 15 MB. |
| declared MIME is empty, `application/octet-stream`, or equals the extension's MIME | `mimeMismatch` | Тип файла не соответствует его расширению. |
| byte length equals declared size | `sizeMismatch` | Фактический размер файла не совпадает с заявленным. |
| magic bytes match the extension (PDF `%PDF-`; PNG signature; JPEG `FF D8 FF`; DOCX = ZIP whose central directory contains `[Content_Types].xml` and a `word/…` part, no ZIP64) | `signature` | Содержимое файла не соответствует заявленному формату. |

The stored MIME type is derived from the extension, not from the client.

### 4.9 Editing rules summary (state machines)

- **Upload slot** (manual create): `idle → uploading(progress) → uploaded(file) | error(message)`; picking another file from any state aborts and restarts; clearing → `idle`.
- **Import panel:** `empty → textLoaded → previewing → previewShown → applying → (create: navigate to edit) | (add: appliedBanner, reset to empty)`; any text change returns to `textLoaded` and discards preview/result; any error keeps the current text and shows the banner.
- **Statement/answer editor per number:** `saved value` + `draft`; "Save" enabled iff draft non-blank (single-number card additionally requires draft ≠ saved); save is skipped client-side when trimmed draft equals trimmed saved; delete only offered when a saved value exists; both operations are idempotent server-side.
- **Topic save:** `idle → checking (preview request) → [confirm dialog] → saving → saved | error notice`.
- **Reorder:** optimistic; rollback to server order on any non-200.

---

## 5. Realtime / polling behaviour

- Transport: SSE `GET /api/realtime` (max 2 concurrent connections per user), described in `01-shell-auth.md` §5.
- Every content mutation in this subsystem publishes `{ kind: "topic-content-changed", occurredAt, topicId? }`: topic create/update/delete, file delete, reorder (no `topicId`), statement/answer save/delete, import apply. Delivered to **all** connected users of all roles. The site's reaction is a debounced (1.5 s) refresh of the current server-rendered page; while the tab is hidden the refresh is deferred until it becomes visible.
- Consequence for these screens: an open topic list / topic view / edit screen reloads when another developer changes content. Unsaved text in editors survives a refresh on the site because client state is kept, but the answers manager **re-initialises its cards from server data whenever the numbers prop changes** (drafts on other cards are lost if content actually changed).
- Dev panel: no realtime and no polling. It is rendered fresh on every visit (`force-dynamic`); stats/chips are refreshed after each service action and after saving settings. The two queue lengths are instantaneous in-memory values of the single server instance.
- Journal: no realtime, no polling; the query runs on each navigation / filter change. The "Action" text filter is debounced 450 ms.
- Broadcast: recipients get the notification through their normal notifications polling; no event is pushed.

**[PROPOSAL] mobile:** invalidate the `topics` query family (list, detail, number detail, conditions map) on `topic-content-changed`; refetch dev-panel stats on screen focus, on pull-to-refresh and after every action; no background polling for the journal.

---

## 6. Proposed mobile API contract [PROPOSAL]

Conventions as in `01-shell-auth.md` §6: base path `/api/mobile/v1`, `Authorization: Bearer <sessionToken>`, `Accept-Language: ru | en`, ISO-8601 UTC timestamps, error envelope

```ts
type ApiError = { error: { code: string; message: string; retryAfterSeconds?: number } };
```

Common codes: `401 sessionExpired`, `403 developerRightsRequired` / `403 unauthorized` (the site answers 401 for role failures; a mobile API should use 403 so the client does not log the user out), `429 rateLimited`, `503 serviceUnavailable`. Rate limits as in §3.16.

### 6.1 Topics — read (TEACHER, DEVELOPER)

```
GET /topics
200 → { topics: TopicListItem[] }                       // ordered by displayOrder, createdAt

GET /topics/{topicId}
200 → TopicDetail
404 topicNotFound

GET /topics/{topicId}/numbers/{number}                   // number: digits; matched by normalised form
200 → NumberDetail
404 numberNotFound

GET /topics/{topicId}/conditions
200 → { conditions: Record<string /* homeworkNumberId */, string | null> }

GET /numbers/find?number=<digits>                        // see 01-shell-auth.md §6.6
```

### 6.2 Topics — write (DEVELOPER)

```
POST /topics
body  { title: string; description?: string; numbers: string /* raw field text */; theoryFileId: string; homeworkFileId: string }
201 → { topicId: string }
400 formInvalid | filesUnavailable        500 saveFailed

GET /topics/{topicId}/impact
200 → TopicImpact                                        // { summary, lines }

POST /topics/{topicId}/numbers-preview
body  { numbers: string }
200 → NumbersChangePreview
400 emptyNumbers | numbersTwin            404 topicNotFound

PATCH /topics/{topicId}
body  {
  title: string; description: string; numbers: string;
  theoryFileId?: string;                  // id of a file pre-uploaded via POST /uploads; omit = keep
  homeworkFileId?: string;
  confirmNumbersRemoval?: string[];       // numbers with student work the user confirmed
  allowAssignedRemoval?: boolean;
}
200 → TopicDetail
400 invalid | numbersTwin
409 numbersConfirm | numbersAssigned      // body may include the fresh NumbersChangePreview
404 topicNotFound                         500 save
```
(The site sends replacement files inside the same multipart form; for mobile, pre-uploading and passing ids is simpler and resumable.)

```
DELETE /topics/{topicId}/files/{kind}                    // kind: "theory" | "homework"
200 → { fileDeleted: "theory" | "homework" }             // idempotent
500 fileDelete

DELETE /topics/{topicId}?acknowledgedNumbersWithWork=<int>
200 → { deleted: true; cleanedFileCount: number }
409 deleteChanged  (body: fresh TopicImpact)             404 topicNotFound      500 delete

PUT /topics/order
body  { orderedTopicIds: string[] }
200 → { orderedTopicIds: string[]; moved: true }
409 listChanged                           400 invalidRequest                    500 saveFailed

POST /topics/{topicId}/move                              // optional alternative for up/down buttons
body  { direction: "up" | "down" }
200 → { orderedTopicIds: string[]; moved: boolean }
```

### 6.3 Statement / answer of a number (DEVELOPER)

```
PUT    /numbers/{homeworkNumberId}/condition   body { conditionLatex: string }  → 200 { conditionLatex: string }
DELETE /numbers/{homeworkNumberId}/condition                                    → 200 { success: true }
PUT    /numbers/{homeworkNumberId}/answer      body { answerLatex: string }     → 200 { answerLatex: string }
DELETE /numbers/{homeworkNumberId}/answer                                       → 200 { success: true }
400 latexRequired     404 numberNotFound     500 saveFailed | deleteFailed
```

### 6.4 Import (DEVELOPER)

```
GET /topic-import/prompt
200 → { prompt: string; formatVersion: 1 }               // Appendix A; lets the server change the prompt without an app release

POST /topic-import
body  { mode: "preview" | "apply"; text: string; target: { topicId: string } | { createTopic: true }; overwriteFilled?: boolean }
200 (preview) → ImportPreview
200 (apply)   → ImportApplyResult
400 topicMissing | importInvalid (message = parser text)      404 topicDeleted
413 fileTooBig (> 2 MiB)                                      500 createFailed | writeFailed
```

### 6.5 Uploads and files

```
POST /uploads                                             (DEVELOPER; multipart: file, previousFileId?)
201 → { file: UploadedFile }
400 fileRequired | uploadInvalid (message = validation text)  500 uploadFailed

GET /files/{fileId}            (any signed-in role, access per §0.2)   → file bytes, inline
GET /files/{fileId}?download=1                                          → attachment
GET /files/{fileId}?thumb=1                                             → image thumbnail
```

### 6.6 Dev panel (DEVELOPER)

```
GET /developer/panel
200 → DeveloperPanelData

PUT /developer/settings
body  Partial<SiteSettings>                               // JSON with real types; server clamps (§4.5)
200 → { ok: true; message: string; settings: SiteSettings }   // return the clamped values
500 → { ok: false; message: string } in the error envelope (code "settingsFailed")

POST /developer/actions/{action}                          // action: "test-ai" | "run-retention" | "reset-ai-budget" | "unfreeze-checks" | "flush-caches"
200 → PanelActionResult                                   // ok=false is a normal 200 result, exactly like the site

POST /developer/broadcast
body  { title: string /* 1..120 */; body?: string /* ≤300 */; toAll: boolean; recipientIds?: string[] }
200 → PanelActionResult & { count?: number }
```

### 6.7 Journal (DEVELOPER)

```
GET /developer/journal?category=AI|DATA|AUTH&actor=<userId>&action=<substring>&outcome=failed&days=<0..365>&page=<n>
200 → JournalPage                                         // strings rendered in Accept-Language

GET /progress-history?studentId=&homeworkNumberId=&cursor=    // see 04-teacher-students.md
```

### 6.8 Typed client interface for the mock

```ts
interface ContentApi {
  listTopics(): Promise<TopicListItem[]>;
  getTopic(topicId: string): Promise<TopicDetail>;
  getNumber(topicId: string, number: string): Promise<NumberDetail>;
  getTopicConditions(topicId: string): Promise<Record<string, string | null>>;

  // DEVELOPER
  uploadFile(file: { uri: string; name: string; mimeType: string; size: number }, opts?: { previousFileId?: string; onProgress?: (pct: number) => void; signal?: AbortSignal }): Promise<UploadedFile>;
  createTopic(input: { title: string; description?: string; numbers: string; theoryFileId: string; homeworkFileId: string }): Promise<{ topicId: string }>;
  previewNumbersChange(topicId: string, numbers: string): Promise<NumbersChangePreview>;
  updateTopic(topicId: string, input: { title: string; description: string; numbers: string; theoryFileId?: string; homeworkFileId?: string; confirmNumbersRemoval?: string[]; allowAssignedRemoval?: boolean }): Promise<TopicDetail>;
  deleteTopicFile(topicId: string, kind: "theory" | "homework"): Promise<void>;
  getTopicImpact(topicId: string): Promise<TopicImpact>;
  deleteTopic(topicId: string, acknowledgedNumbersWithWork: number): Promise<void>;
  reorderTopics(orderedTopicIds: string[]): Promise<string[]>;
  saveCondition(homeworkNumberId: string, conditionLatex: string): Promise<string>;
  deleteCondition(homeworkNumberId: string): Promise<void>;
  saveAnswer(homeworkNumberId: string, answerLatex: string): Promise<string>;
  deleteAnswer(homeworkNumberId: string): Promise<void>;
  getImportPrompt(): Promise<string>;
  previewImport(input: { text: string; target: { topicId: string } | { createTopic: true } }): Promise<ImportPreview>;
  applyImport(input: { text: string; target: { topicId: string } | { createTopic: true }; overwriteFilled?: boolean }): Promise<ImportApplyResult>;
}

interface DeveloperApi {
  getPanel(): Promise<DeveloperPanelData>;
  saveSettings(values: SiteSettings): Promise<PanelActionResult & { settings: SiteSettings }>;
  runAction(action: "test-ai" | "run-retention" | "reset-ai-budget" | "unfreeze-checks" | "flush-caches"): Promise<PanelActionResult>;
  broadcast(input: { title: string; body?: string; toAll: boolean; recipientIds?: string[] }): Promise<PanelActionResult>;
  getJournal(query: JournalQuery): Promise<JournalPage>;
}
```

Mock notes: implement `parseNumbersInput`, twin detection, the change plan, `parseTopicImportText` + `buildImportPlan`, upload validation by extension/size, settings clamping, and audit-row creation for the developer actions and topic deletion so the journal has live data. Seed: 4–6 topics (one without files — "created by import", one with zero-padded numbers such as `051001-051020`, one with student progress so the destructive dialogs trigger), a mix of filled/empty statements and answers, ~120 audit rows across the three categories including failed ones, AI rows with tokens and cost, and `progress.status` rows.

---

## 7. Open questions / things that cannot be done natively as-is

1. **LaTeX rendering.** The site renders with KaTeX in the DOM plus custom splitting (§4.7) and a DOM-based operator-repeat pass. React Native has no KaTeX. Options: (a) a WebView per screen (not per card) rendering KaTeX from a bundled HTML template — most faithful, reuses the exact algorithm, and can run the line-break script; (b) a native math library (MathJax-SVG / `react-native-math-view`) — faster lists but different coverage and no operator-repeat rule. Decision needed; it affects every role (students see the same statements). Suggested: one shared `<LatexView>` component backed by an auto-height WebView with a KaTeX bundle, used in lists through virtualisation and height caching.
2. **Live preview while typing LaTeX** (answers manager) needs the same renderer with debouncing; typing LaTeX on a phone keyboard is awkward — should developer content editing be in mobile v1 at all, or read-only + import only? Suggested: ship view + single-number editor + import; keep bulk editing as-is but tap-through per number.
3. **PDF / DOCX preview.** Site embeds pdf.js and shows nothing for DOCX. Native: open PDFs/images in an in-app viewer (`react-native-pdf` / WebView) and hand DOCX to the system via share/open-in; files require the auth header, so download to cache first.
4. **"Import numbers into an existing topic" is not reachable on the site.** `TopicImportPanel` supports `topicId` mode and the API implements it (preview counters, overwrite checkbox), and project docs describe the block on the edit page, but the edit page does not mount it today. Should the mobile edit screen include it? Suggested: yes (it is the only way to bulk-fill statements), pending owner confirmation.
5. **Topic deletion from list/view** only works for empty topics on the site (§4.4 [QUIRK]). Suggested mobile behaviour: every delete entry point first calls `GET /topics/{id}/impact`, shows the detailed dialog and sends the acknowledgement.
6. **Vercel Blob direct upload** (client token handshake) is a browser SDK flow. Mobile should use only the multipart endpoint; the future server must keep it available regardless of the storage backend. Files up to 15 MB over mobile networks need progress, cancel and retry.
7. **Server actions have no HTTP API.** Topic update, topic delete, file delete, all dev-panel actions, settings save and broadcast are Next.js server actions that answer with redirects + query-string codes. The server must add the REST endpoints of §6; the mock maps the redirect codes to error codes one-to-one (`invalid`, `upload`, `save`, `fileDelete`, `numbersTwin`, `numbersConfirm`, `numbersAssigned`, `deleteChanged`, `delete`).
8. **Journal has no API** (server-rendered Prisma query) and is a 6-column, 880-px table. Needs the endpoint of §6.7 and a card layout. Should `clientIp`/`durationMs`/`model` (stored but not shown on the site) be exposed in the mobile detail sheet? Default: no, mirror the site.
9. **Drag-and-drop reorder** is HTML5 DnD and explicitly unsupported on touch on the site. Native: draggable list sending the full order (same endpoint), or up/down buttons using the existing `direction` mode.
10. **Clipboard / sharing the import prompt.** Copy works natively; the prompt is 5,636 characters — embed it in the app (Appendix A) or fetch it (`GET /topic-import/prompt`) so prompt and parser stay in sync (`formatVersion`)? Suggested: fetch with embedded fallback.
11. **Settings quirks:** a blank numeric field resets to the *env default*, not the previous value; out-of-range values are silently clamped; the form does not re-display clamped values until reload. Mobile should validate ranges client-side (min/max from §4.5) and show the server's returned values.
12. **Dev-panel service actions have no confirmation** on the site ("Reset daily AI budget", "Unfreeze stale checks", broadcast to all students). Add confirm alerts on mobile? Suggested: yes for broadcast-to-all and unfreeze.
13. **Broadcast texts are not translated** and go only to students; there is no history of sent broadcasts except the journal row (`developer.broadcast_sent`, meta has `title`, `recipients`, `toAll`). If push notifications are added in the mobile app (`01-shell-auth.md` §6.8), should a broadcast also trigger a push?
14. **Time zone.** Journal times and "last retention" are formatted on the server in `Europe/Moscow` (`dd.MM.yyyy, HH:mm`). Mobile should format ISO timestamps explicitly in MSK (and label "МСК") rather than in device time, to match the site and the progress-history widget.
15. **Realtime in React Native.** `EventSource` is not built in; use an SSE polyfill or fall back to refetch-on-focus. Content screens tolerate staleness; refetch on focus is sufficient for v1.
16. **Error identification.** The site returns localized strings only (`{ error: "…" }`), and clients sometimes branch on HTTP status. The mobile API needs stable `code`s (§6); until then the mock should carry both.
17. **Legacy fields:** `Topic.answersFile` and per-number `answerFile` exist in the schema and in `updateTopicAction` / `deleteTopicFileAction` (`fileKind: "answers"`) but have no UI; `estimatedMinutes` is never edited. Mobile should ignore them (do not render, do not send).
18. **Whole-set replacement via a free-text numbers field** is risky on a phone (one accidental deletion removes numbers and all attached student work, guarded only by the confirm dialog). Keep the same guards; consider an "add numbers" affordance instead of free editing in a later version.
19. **Large topics.** The view screen renders every number with its LaTeX at once (hundreds of formulas). Mobile must virtualise and may need a paged `GET /topics/{id}/numbers?offset&limit` — not present on the site.
20. **Developer home.** The developer has no overview screen; the first tab is Topics. Confirm the mobile tab set for DEVELOPER: Topics, Accounts, Calls, Statistics, Dev panel (+ Settings), mirroring `dict.nav.developer`.

---

## Appendix A — `TOPIC_IMPORT_PROMPT` (runtime string, Russian, not translated)

This is the exact text copied to the clipboard by the "Copy the AI prompt" button (the evaluated value of the constant in `lib/topic-import-prompt.ts`). It must stay byte-for-byte in sync with the parser of §4.2.

````text
Ты — помощник по оцифровке задачников. Тебе дан один файл или два файла с задачами по математике. Извлеки задачи и верни ОДИН JSON-объект — больше ничего.

Сначала определи, что тебе дали. Возможны три случая, разбирайся сам, переспрашивать не нужно:
- ДВА ФАЙЛА: в одном условия задач, в другом ответы к ним. Сопоставь ответы с условиями по номерам задач;
- ОДИН ФАЙЛ с условиями и ответами сразу: ответы обычно идут отдельным разделом в конце, реже сразу после условия. Разбери такой файл на две части сам;
- ОДИН ФАЙЛ только с условиями. Тогда у всех задач answerLatex: null.

Что нужно сделать:
1. Найди пронумерованные задачи. Сохрани нумерацию источника: если задачи идут 101, 102, 103 или 010203, 010204 — так и пиши, вместе с ведущими нулями, не перенумеровывай с единицы.
2. Для каждой задачи запиши условие целиком, вместе со всеми пунктами а), б), в). Сюжетные (текстовые) задачи переноси дословно и целиком: не сокращай и не пересказывай формулировку.
3. НАДПИСЬ НАД ГРУППОЙ ЗАДАЧ. В задачниках общая формулировка часто напечатана один раз над серией номеров: «Сократите дробь:», «Решите уравнение:», «Найдите наибольший корень». Это часть условия каждой задачи серии: повторяй её в начале conditionLatex КАЖДОГО номера серии отдельной строкой (после неё \n), даже если в книге она стоит только над первым. Без неё ученик увидит голое выражение и не поймёт, что с ним делать.
4. Ответы бери только из файлов. Сопоставляй по НОМЕРУ задачи, а не по порядку следования: в разделе ответов нумерация бывает с пропусками или идёт иначе. Если ответа нет или сопоставить уверенно не выходит — ставь null и добавь строку в warnings. НЕ РЕШАЙ задачи сам: придуманный ответ хуже отсутствующего.
5. Ничего не выдумывай. Если условие не читается или обрывается, всё равно включи задачу, запиши что удалось разобрать и добавь строку в warnings.

Разметка формул:
- Обычный текст пиши как есть, по-русски. В доллары оборачивай только математику, а не предложения целиком.
- Формула внутри строки — между одинарными долларами: Решите уравнение $x^2-5x+6=0$.
- Крупная отдельно стоящая формула — отдельный абзац целиком между двойными долларами: $$\int_0^1 x^2\,dx$$
- Абзацы разделяются пустой строкой.
- Пункты пиши подряд в одну строку, метками «а)», «б)», «в)»: а) $2^x=8$ б) $3^x=81$. Сайт сам разложит их по строкам, переносы здесь ставить не нужно.
- ПЕРЕНОСЫ СТРОК: сохраняй только смысловые. Если в задачнике условие записано в несколько строк — перечисление столбиком, таблица значений, несколько отдельных требований — ставь между ними \n; пустая строка (\n\n) — новый абзац. А вот типографские переносы, которыми длинное предложение разбито по ширине страницы, НЕ переноси в JSON: предложение пиши одной строкой, сюжетную (текстовую) задачу — сплошным абзацем. Ориентир: перенос нужен там, где начинается новая мысль или новая строка перечисления, а не там, где верстальщику кончилась строка.
- Слова внутри формулы — через \text{}: $S_{\text{полн}}$.
- Дроби — \dfrac или \frac, корни — \sqrt, системы — \begin{cases}...\end{cases}.

Ограничения движка (сайт рендерит KaTeX, не полный LaTeX):
- Нельзя: \usepackage, \newcommand, \label, \ref, \includegraphics, окружения figure, table, tabular, align. Для выравнивания используй aligned внутри $$...$$.
- Если задача опирается на чертёж или картинку, которых нет в тексте, включи задачу и добавь строку в warnings: без рисунка она не решается.

КАК ЭКРАНИРОВАТЬ — самая частая ошибка, из-за неё файл не загружается:
Это JSON, поэтому каждый обратный слэш внутри строки должен быть удвоен. Одиночных обратных слэшей в файле быть не должно ни одного — проверь это отдельным проходом перед отправкой.
Правильно:   "conditionLatex": "Решите $\\dfrac{1}{2\\sin x}=1$."
Неправильно: "conditionLatex": "Решите $\dfrac{1}{2\sin x}=1$."

КАК ОТДАТЬ ОТВЕТ:
Пришли результат ОДНИМ ФАЙЛОМ с расширением .json и ничего не пиши в чате: ни пояснений, ни комментариев, ни markdown-обёртки ```json. Если приложить файл нельзя, выведи в чат только сам JSON-объект, начиная с { и заканчивая }.

Содержимое файла — строго один JSON-объект такого вида:

{
  "formatVersion": 1,
  "topic": {
    "title": "Логарифмические уравнения",
    "description": "Простейшие логарифмические уравнения и уравнения, сводящиеся к ним."
  },
  "numbers": [
    { "number": "010203", "conditionLatex": "Решите уравнение $\\log_2(x+1)=3$.", "answerLatex": "$x=7$" },
    { "number": "010204", "conditionLatex": "а) $\\lg x=2$ б) $\\ln x=1$", "answerLatex": "а) $x=100$ б) $x=e$" },
    { "number": "010205", "conditionLatex": "Найдите область определения функции $y=\\log_5(x-2)$.", "answerLatex": null },
    { "number": "010206", "conditionLatex": "Сократите дробь:\n$\\dfrac{x^2-4}{x+2}$", "answerLatex": "$x-2$" }
  ],
  "warnings": ["Номер 14: часть условия не читается на скане"]
}

Правила заполнения полей:
- title — короткое название темы, до 200 символов. Если в файле есть заголовок раздела, возьми его.
- description — 1-2 предложения о содержании темы, до 1000 символов. Необязательное: если брать нечего, поставь пустую строку.
- number — СТРОКА с номером ровно как в задачнике, включая ведущие нули: "010203". В JSON число с ведущим нулём недопустимо, поэтому номер всегда в кавычках. Каждый номер встречается один раз.
- conditionLatex — обязательно, непустое. Общая надпись над группой задач входит в условие каждой задачи группы первой строкой (см. пункт 3 и номер "010206" в примере).
- answerLatex — строка или null.
- warnings — список строк; если всё чисто, пустой список.

Перед отправкой перечитай файл и проверь три вещи: это валидный JSON, все обратные слэши удвоены, номера не повторяются.
````
