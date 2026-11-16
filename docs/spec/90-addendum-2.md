# 90 — Addendum 2: one mobile API contract across specs, and one screen registry

Closes two gaps found by the completeness review of specs `01`–`09`:

- **Part A** — operations that several specs propose with different method, path or response. One owner
  spec is chosen per operation; every other spec must reference it. Where an existing spec states
  something the site code contradicts, the line starts with **CORRECTION to `<file>`**.
- **Part B** — navigation: screens that exist on the site only by URL, the DEVELOPER restrictions stated
  once, one screen registry, and one `href → screen` mapping.

Marking used below: **[CODE]** = fact read from the site code (file named). **[DECISION]** = choice made
by this addendum between conflicting proposals (the site has no mobile API, so every mobile path is a
proposal; decisions that need the product owner are repeated in Part C).

Source files read for this addendum (web repo): `app/api/teacher/lessons/route.ts`,
`app/api/teacher/lessons/[lessonId]/participants/[participantId]/items/route.ts`, `…/regenerate/route.ts`,
`…/items/[itemId]/result/route.ts`, `…/attendance/route.ts`, `app/api/student/homeworks/find-number/route.ts`,
`app/api/teacher/topics/find-number/route.ts`, `app/api/teacher/topics/conditions/route.ts`,
`app/api/teacher/progress-history/route.ts`, `lib/progress-history.ts`, `lib/progress-write.ts`,
`lib/progress-policy.ts`, `app/files/[fileId]/route.ts`, `lib/image-thumbnail.ts`,
`app/api/notifications/route.ts`, `app/api/student/notifications/route.ts`, `lib/notifications.ts`,
`lib/developer-alerts.ts`, `lib/parent-calls.ts`, `lib/homework-issue.ts`, `lib/solution-check.ts`,
`actions/developer.ts`, `app/api/student/streak/route.ts`, `app/api/student/topic-status/route.ts`,
`app/api/teacher/number-status/route.ts`, `app/api/teacher/student-deadlines/route.ts`,
`app/api/teacher/uploads/route.ts`, `app/api/teacher/parent-calls/route.ts`, `lib/api-rate-limit.ts`,
`lib/auth.ts`, `lib/utils.ts` (`roleHome`), `lib/site-settings.ts`, `lib/lesson-plan.ts`, `lib/homework-plan.ts`,
`lib/platform-data.ts` (`getStudentHomeworks`, `getStudentHomeworkDeadlines`), `lib/developer-panel-tabs.ts`,
`actions/group.ts`, `middleware.ts`, `next.config.ts`, `components/dashboard-nav.tsx`,
`components/teacher-lesson-board.tsx`, `components/teacher-student-lessons.tsx`,
`components/teacher-homework-plan-board.tsx`, `components/teacher-homework-assign-board.tsx`,
`components/group-statistics-section.tsx`, `components/group-attendance-section.tsx`,
`components/teacher-parent-calls-list.tsx`, `components/shbz-number-search.tsx`,
`app/(auth)/login/page.tsx`, every `page.tsx` / `layout.tsx` / `route.ts` under `app/(dashboard)/**`
(role guards), `prisma/schema.prisma` (`ProgressStatusEvent`, `AttendanceStatus`),
`lib/i18n/dictionaries/planner.ts`.

---

# Part A — Cross-spec mobile API contract

## A.0 Conventions that the specs state differently

These are not in the review's list of 19, but the 19 cannot be reconciled without them.

### A.0.1 Error envelope

- **[CODE]** Every site JSON route answers errors as `{ "error": "<localised text>" }` with no machine
  code. `/files/{id}` answers `401`/`404` as plain text (`Unauthorized`, `Not found`).
- **[DECISION]** Owner: `01-shell-auth.md` §6. One envelope for the whole mobile API:

```ts
type ApiError = {
  error: {
    code: string;                                   // camelCase, see A.0.2
    message: string;                                // localised by Accept-Language, same dictionary texts as the site
    retryAfterSeconds?: number;                     // 429 / 503, also sent as Retry-After
    details?: Record<string, string | number | string[]>;   // e.g. { numbers: ["0512"] }, { max: 30 }
  };
};
```

- **CORRECTION to `08-design-system.md` §14**: "Error payloads are `{ error: string }`" describes the site,
  not the mobile contract. The mobile contract uses the nested envelope above.
- **CORRECTION to `09-data-i18n-math.md` Appendix C**: `{ "error": string, "code"?: string }` is replaced by
  the nested envelope above.
- `details` unifies `params` (spec 03), `error.details` (spec 04) and `details.numbers` (spec 05).

### A.0.2 Error-code spelling

Specs 01, 04, 07 use camelCase (`sessionExpired`), specs 02, 03 use upper snake (`SESSION_EXPIRED`,
`UNAUTHENTICATED`), specs 05, 06 use lower snake (`rate_limited`).

**[DECISION]** camelCase everywhere, because the codes then equal the last segment of the site dictionary
key the message comes from (**[CODE]** e.g. `dict.apiCommon.sessionExpired`,
`dict.apiPlanner.lessonItems.participantNotFound`, `dict.apiContent.progressHistory.paramsRequired`).
Conversion of the names already written in the specs is mechanical:

| Canonical | Spec 02 / 03 spelling | Spec 05 / 06 spelling |
|---|---|---|
| `sessionExpired` (401) | `SESSION_EXPIRED`, `UNAUTHENTICATED` | `unauthorized` (401) |
| `unauthorized` (403) | `FORBIDDEN` | `forbidden_role` |
| `developerRightsRequired` (403) | — | — |
| `rateLimited` (429) | `RATE_LIMITED` | `rate_limited` |
| `serviceUnavailable` (503) | `SERVICE_UNAVAILABLE` | `service_unavailable` |
| `invalidData` (400) | `INVALID_DATA`, `VALIDATION` | `invalid_input` |
| any other | `UPPER_SNAKE` → `upperSnake` | `lower_snake` → `lowerSnake` |

### A.0.3 `401` versus `403`

- **[CODE]** The site answers a signed-in user of the wrong role with **401** on almost every route
  (student routes: `401 dict.apiCommon.sessionExpired`; staff routes: `401 dict.apiCommon.unauthorized`;
  developer-only routes: `401 dict.apiCommon.developerRightsRequired`). The only `403` for a wrong role is
  `GET /api/teacher/progress-history` (`dict.apiContent.progressHistory.forbidden`).
- **[DECISION]** Mobile: `401 sessionExpired` **only** when there is no valid session (the client reacts by
  clearing the token and opening Login, `01` §4.1). A valid session with a role that may not call the
  endpoint → `403 unauthorized` (or `403 developerRightsRequired` on developer-only endpoints). Spec 02's
  "401 `SESSION_EXPIRED` otherwise" for non-students and the `401` rows of spec 05 / 06 for wrong roles
  follow this rule.

### A.0.4 `ok` flag and typed client results

- **[CODE]** Site success bodies carry `ok: true` (one exception: `POST /api/notifications` answers
  `{ success: true }`, while `POST /api/student/notifications` answers `{ ok: true }`).
- **[DECISION]** Wire bodies in A.2 are written out exactly. Typed client methods (`*Api` interfaces)
  resolve to the wire body **without** `ok` and reject with `ApiError` otherwise. This removes the
  "§6.x says one shape, the typed client another" class of contradictions (item 19, item 1).

---

## A.1 Ownership table

"Owner" = the spec whose section is authoritative after this addendum. All paths are relative to
`/api/mobile/v1`.

| # | Operation | Site source [CODE] | Owner | Canonical method + path | Superseded proposals |
|---|---|---|---|---|---|
| 1 | Number search | `GET /api/student/homeworks/find-number`, `GET /api/teacher/topics/find-number` | **01** §6.6 | `GET /numbers/find?number=` | 02 `GET /student/numbers/lookup`; 03 `GET /student/numbers/find`; 01 §6.9 `findNumber()` return type |
| 2 | Save a lesson / draft set | `PATCH /api/teacher/lessons/{lessonId}/participants/{participantId}/items` | **05** | `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/items` | 05 `PUT …/items`; 05 `PUT /teacher/homework-plans/{planId}/participants/{pid}/items`; 04 response `{ items }` |
| 3 | Create a lesson | `POST /api/teacher/lessons` | **05** | `POST /teacher/lessons` → `201 { lessonId, plan }` | 04 `201 { lessonId, planError: "unavailable" }` |
| 4 | Regenerate one participant | `POST …/participants/{participantId}/regenerate` | **05** | same path → `200 { ok, planRequestedAt }` | 04 `202 { ok: true }` |
| 5 | Lesson item result | `PATCH …/items/{itemId}/result` | **05** | same path → `200 { ok, result, studentStatus }` | 04 `{ result }` |
| 6 | Lesson handout | `GET /teacher/lessons/{id}/pdf`, `…/print` | **05** | `GET /teacher/lessons/{lessonId}/handout?format=&studentId=&answers=` | 04 `GET /teacher/lessons/{id}/handout.pdf` |
| 7 | Lesson compose data | server components `teacher/lessons/new/page.tsx`, `teacher/students/[studentId]/lessons/new/page.tsx`, `teacher/lessons/[lessonId]/page.tsx` | **05** | `GET /teacher/lessons/new-options`, `GET /teacher/lessons/new-form?groupId=\|studentId=`, `GET /teacher/number-bank` | 04 `GET /teacher/students/{id}/lesson-compose`; 05 `GET /teacher/lessons/{id}/bank`; `LessonBoardModel.bank` |
| 8 | Progress history | `GET /api/teacher/progress-history` | **04** §6.4 | `GET /progress-history?studentId=&homeworkNumberId=&cursor=` | 04 path `/teacher/students/{sid}/numbers/{nid}/history` |
| 9 | Topic statements | `GET /api/teacher/topics/conditions?topicId=` | **07** §6.1 | `GET /topics/{topicId}/conditions` → `{ conditions }` | 04, 05 path `/teacher/topics/{id}/conditions` |
| 10 | Files | `GET /files/{fileId}` (`?thumb=1`, `?download=1`) | **09** §5 + App. C | `GET /files/{fileId}[?thumb=1][&download=1]` | 09 App. C `?variant=thumb`; 02 `POST /files/{id}/access-url`; 09 `GET /files/{id}/meta` |
| 11 | Pre-upload a topic file | `POST /api/teacher/uploads` (multipart branch) | **07** §6.5 | `POST /uploads` (`file`, `previousFileId?`) → `201 { file }` | 09 App. C (`purpose` field, `FileRef` response) |
| 12 | Pre-login config / meta | `app/(auth)/login/page.tsx` (`loginHelpContact`) | **09** App. C | `GET /meta` (no auth) | 01 `GET /public/config`; 05 `GET /teacher/planner/meta` |
| 13 | Current user | `lib/auth.ts` `getCurrentUser` | **01** §6.2 | `GET /me` → `{ user, sessionExpiresAt }` | 08 §14 flat `MeResponse` |
| 14 | Save a personal note | `POST /api/student/topic-status` | **02** §6.7 | `PUT /student/numbers/{homeworkNumberId}/note` → `{ ok, status, note, notesEnabled }` | 03 §6.1 response `{ note }` |
| 15 | Student homework lists | `getStudentHomeworkDeadlines` (light), `getStudentHomeworks` (full) | **02** (light) / **03** (full) | `GET /student/homework-deadlines`; `GET /student/homeworks`, `GET /student/homeworks/{assignmentId}` | 02 `GET /student/home` |
| 16 | Streak | `GET /api/student/streak` | **01** §6.5 | `GET /student/streak` → `{ streak }` | 02 `StudentStudyApi.getStreak`; `streak` inside 02 `StudentHomeResponse` |
| 17 | Notifications | `GET`/`POST /api/notifications`, `GET`/`POST /api/student/notifications` | **01** §6.4 | `GET /notifications`, `POST /notifications/read` → `{ ok, unreadCount }` | 09 App. C `NotificationDto`, `{ ok: true }` |
| 18 | Manual attendance | `PATCH …/participants/{participantId}/attendance` | **06** §6.3 | same path → `{ ok, attendance }` | 05 §6 duplicate; type name `AttendanceValue` |
| 19 | Set a number status | `POST /api/teacher/number-status` | **04** §6.4 | `PUT /teacher/students/{studentId}/numbers/{homeworkNumberId}/status` → `{ ok, status, statusChangedAt, decision }` | 04 §6.8 typed return `{ status }` |

---

## A.2 Canonical contracts

### A.2.1 Number search (item 1)

**[CODE] site behaviour**

| | STUDENT route | TEACHER / DEVELOPER route |
|---|---|---|
| Path | `GET /api/student/homeworks/find-number?number=` | `GET /api/teacher/topics/find-number?number=` |
| Rate limit | scope `api:student-find-number`, 120 / 60 s | scope `api:find-number`, 30 / 60 s |
| Validation | trimmed value must match `/^\d{1,20}$/` and `normalizeHomeworkNumber(value) !== "0"` → else `400` | same |
| Match | numbers whose `number` ends with the normalised value, ordered by topic `displayOrder asc, createdAt asc`; first with an equal normalised form | topics having such a number, same order; `findTopicByHomeworkNumber` |
| 200 body | `{ href: "/student/numbers/<encodeURIComponent(recorded number)>" }` | `{ topicId, topicTitle, number /* recorded */, href: "/teacher/topics/<topicId>/numbers/<encodeURIComponent(number)>" }` |
| Not found | `404 dict.apiStudent.findNumber.notFound` | `404 dict.apiCommon.numberNotFound` |
| Other | no `try/catch` around the query | exception → `500 dict.apiContent.findNumber.searchFailed` |

The control `ShbzNumberSearch` is mounted in the page header of 27 page / layout files under
`app/(dashboard)` (every role), which is why the shell spec owns the operation.

**Canonical**

```ts
// GET /numbers/find?number=<digits>          any signed-in role
type NumberFindResult = {
  number: string;       // recorded spelling, leading zeros kept
  topicId: string;
  topicTitle: string;
};
```

- One shape for all roles (no `role` discriminator — the client knows its role; no `href`). The student
  already receives the topic id and title of a number from the number-detail endpoint
  (`02` §6.6 `topic: { id, title, description }`), so returning them here discloses nothing new.
- The client navigates by role: STUDENT → `student.number { number }`; TEACHER / DEVELOPER →
  `content.number { topicId, number }` (Part B.6).
- Errors: `400 invalidNumber` (student text `dict.apiStudent.findNumber.invalidNumber`, staff text
  `dict.apiContent.findNumber.invalidNumber`), `404 numberNotFound` (student
  `dict.apiStudent.findNumber.notFound`, staff `dict.apiCommon.numberNotFound`), `500 searchFailed`,
  `401`, `429` (student 120 / 60 s, staff 30 / 60 s).

**CORRECTION to `01-shell-auth.md` §6.9**: `findNumber(number): Promise<StudentFindNumberResult |
TeacherFindNumberResult>` returns the *site* shapes (`{ href }`) and contradicts §6.6 of the same file.
Canonical: `findNumber(number: string): Promise<NumberFindResult>`. The `role` field of §6.6 is dropped.

**CORRECTION to `02-student-study.md` §6.5 / §6.11** (`GET /student/numbers/lookup`, `lookupNumber`) and
**to `03-student-homework-lesson.md` §6.1** (`GET /student/numbers/find` → `{ number }`): both are removed;
use `ShellApi.findNumber`. `homeworkNumberId` (02) is not part of the search result — it arrives with
`GET /student/numbers/{number}`. `07` §6.1 already references `01`.

### A.2.2 Save a set (item 2)

**[CODE]** `PATCH` (the route exports only `PATCH`). Roles TEACHER / DEVELOPER. Rate limit
`api:lesson-items` 60 / 60 s. Body `{ homeworkNumberIds: string[]; extraHomeworkNumberIds?: string[] }`.
Lists are trimmed, emptied of blanks, de-duplicated and cut to `MAX_PLAN_ITEMS = 40` each; an id in both
lists stays in main; ids missing from the bank are dropped silently. Checks in order: participant found
for this lesson with `lesson.teacherId` **and** `student.teacherId` = caller (both skipped for DEVELOPER)
→ else `404 participantNotFound`; `participant.issuedAssignmentId` set → `409 homeworkAlreadyIssued`;
`homeworkNumberIds` not an array → `400 numbersRequired`; a row to delete has ≥ 1 submission →
`409 blockedNumbers` (nothing written); transaction failure → `500 saveFailed`. Success body
`{ ok: true, items: <number of main items kept> }`. The same route serves homework drafts — the draft board
calls it with `lessonId = planId` (`components/teacher-homework-plan-board.tsx`).

**Canonical**

```ts
// PATCH /teacher/lessons/{lessonId}/participants/{participantId}/items
type SaveSetRequest = { homeworkNumberIds: string[]; extraHomeworkNumberIds?: string[] };
type SaveSetResponse = { ok: true; items: LessonBoardItem[] };   // the whole set after the change, order asc
```

- `LessonBoardItem` (`05` §2) is a superset of the item of `TeacherStudentLesson` (`04` §2.5: `id`,
  `homeworkNumberId`, `number`, `topicTitle`, `isExtra`, `result`), so the student "Lessons" tab reads the
  same response. For a draft, `PATCH /teacher/homework-plans/{planId}/participants/{participantId}/items`
  is an **alias of the same handler**; the draft board ignores `isExtra`, `result`, `submission`.
- Errors: `400 numbersRequired`, `404 participantNotFound`, `409 homeworkAlreadyIssued`,
  `409 blockedNumbers` (`details.numbers: string[]`), `500 saveFailed`, `429`.

**CORRECTION to `05-teacher-lessons-plans.md` §6**: `PUT …/items` (both the lesson and the draft variant)
→ `PATCH`. **CORRECTION to `04-teacher-students.md` §6.5**: response is `{ ok, items: LessonBoardItem[] }`,
not `{ items: TeacherStudentLesson["items"] }`.

### A.2.3 Create a lesson (item 3)

**[CODE]** four success-like outcomes of `POST /api/teacher/lessons` (the lesson row exists in all four):

| Site response | Condition |
|---|---|
| `200 { ok: true, lessonId, skippedPlan: true }` | `skipPlan === true` (participants get `planGeneratedAt = now`) |
| `503 { error: dict.apiPlanner.lessons.plannerUnavailable, lessonId }` | `!aiEnabled \|\| !lessonPlanEnabled \|\| !getAiCheckConfig(settings)`; all participants get `planError = "plan-error:unavailable"` |
| `200 { ok: true, lessonId, planError: "budgetExhausted" \| "queueFull" }` | `reservePlanGenerations(count, aiPlanDailyLimit)` refused; participants get that `planError` |
| `200 { ok: true, lessonId }` | queued for generation |

**Canonical** — `05` §6:

```ts
// POST /teacher/lessons                       TEACHER · DEVELOPER, rate limit api:lesson-plan 10 / 60 s
type CreatePlanOutcome = "queued" | "skipped" | "unavailable" | "budgetExhausted" | "queueFull";
type CreateLessonResponse = { lessonId: string; plan: CreatePlanOutcome };   // HTTP 201 in all five cases
```

Mapping from the site: `skippedPlan` → `"skipped"`; `503 + lessonId` → `"unavailable"`; `planError` → that
value; otherwise `"queued"`. Errors: `400 selectAtLeastOneStudent`, `400 tooManyStudents`
(`details.max = 30`), `400 invalidStartsAt`, `404 groupNotFound`, `500 createFailed`, `429`.
`POST /teacher/homework-plans` uses the same `plan` field (`05` §6, never `"skipped"`).

**CORRECTION to `04-teacher-students.md` §6.5**: `201 { lessonId, planError: "unavailable" }` →
`201 { lessonId, plan: "unavailable" }`; the field is `plan` for every outcome.

### A.2.4 Regenerate (item 4)

**[CODE]** `200 { ok: true }`; resets `planGeneratedAt = null`, `planError = null`; errors
`404 participantNotFound`, `409 homeworkAlreadyIssued`, `503 plannerUnavailable`,
`429 dict.planner.planErrors.budgetExhausted`, `503 dict.planner.planErrors.queueFull`. `LessonParticipant`
has no "plan requested at" column; the site client restarts its 15-minute stale timer
(`STALE_PLAN_MS = 15 * 60_000`) from a locally patched `createdAt`.

**Canonical**: `200 { ok: true; planRequestedAt: ISODateTime }` — `planRequestedAt` is the server clock at
the moment of the reset; the client uses it as the stale-timer anchor instead of patching `createdAt`.
Whether the value is also persisted and returned by the board is `05` §7 Q5 (unchanged). Typed client:
`regenerateParticipant(...): Promise<{ planRequestedAt: string }>`.

**CORRECTION to `04-teacher-students.md` §6.5**: `202 { ok: true }` → `200 { ok, planRequestedAt }`.

### A.2.5 Lesson item result (item 5)

**[CODE]** `200 { ok: true, result }`. Inside the same transaction `writeProgress(...)` returns the
progress decision (`{ write, status, requestedStatus, reason }`, `lib/progress-write.ts`), so the student's
resulting traffic light is known to the handler although the site does not return it.

**Canonical**: `200 { ok: true; result: LessonItemResult | null; studentStatus: HomeworkNumberStatus | null }`
where `studentStatus` = `decision.status` (the status of the number after the write, unchanged when the
policy kept it). Typed client: `setItemResult(...): Promise<{ result; studentStatus }>`. Errors
`400 invalidResult`, `404 itemNotFound`, `500 saveFailed`, `429` (240 / 60 s).

**CORRECTION to `04-teacher-students.md` §6.5**: response `{ result }` → the shape above.
**CORRECTION to `05-teacher-lessons-plans.md` §6 typed client**: `setItemResult(...): Promise<void>` →
returns `{ result, studentStatus }`.

### A.2.6 Handout (item 6)

**[CODE]** Two routes, `GET /teacher/lessons/{lessonId}/pdf` and `…/print`, rate-limit scope `lesson-pdf`
30 / 60 s shared. Query: `studentId` (only that participant), `answers=1` (answer sheet). `404
lessonNotFound` when the lesson is missing / foreign / has no participants after the filter;
`404 dict.apiPlanner.lessons.noHomeworkHandout` when `kind !== LESSON` and `answers` is not `1`.
`/print` → `200 text/html`. `/pdf` → `200 application/pdf` with
`Content-Disposition: attachment; filename="urok-YYYY-MM-DD.pdf"` (`otvety-…` for answers); when headless
Chromium is unavailable `/pdf` answers **`200 text/html`** with a banner
(`dict.apiPlanner.lessons.pdfRendererFallback`). The student "Lessons" tab links to
`/teacher/lessons/{lessonId}/pdf` **without** `studentId` (`components/teacher-student-lessons.tsx`), i.e.
for a group lesson the file contains every participant.

**Canonical** — `05` §6:

```
GET /teacher/lessons/{lessonId}/handout?format=pdf|html&studentId=<id>&answers=0|1
200 application/pdf   (format=pdf)      200 text/html   (format=html)
404 lessonNotFound · 404 noHomeworkHandout · 429 · 503 pdfRendererUnavailable (format=pdf only)
```

**[DECISION]** `format=pdf` never returns HTML: when the renderer is down the answer is
`503 pdfRendererUnavailable` and the app offers `format=html` (print through the OS). This replaces both
the `X-Handout-Fallback: html` header of `05` §6 and the content-type sniffing of the site, and answers
`04` §7 Q4. The app passes `studentId` when the handout is opened from a student card.

**CORRECTION to `04-teacher-students.md` §6.6**: `GET /teacher/lessons/{lessonId}/handout.pdf` →
`GET /teacher/lessons/{lessonId}/handout?format=pdf&studentId={studentId}`.

### A.2.7 Compose data (item 7)

**[CODE]**

- `/teacher/lessons/new` without params renders a chooser: the caller's groups (`name asc`, with member
  count) and students (`name asc`); DEVELOPER sees all.
- `/teacher/lessons/new?groupId=` → `members` of the group (`id`, `name`, `speed`), `topics`.
- `/teacher/lessons/new?studentId=` and `/teacher/students/{studentId}/lessons/new` render the **same**
  component `TeacherLessonComposeSwitch` with the same props (`aiAvailable`, `student`, `formTopics`,
  `boardTopics`). Difference: the student-card page ships `conditionLatex` only for the first topic
  (`conditionsLoaded: topic.id === topics[0].id`), the `/lessons/new` page ships the statements of the
  whole bank. The comment of the conditions route states the intended rule: pages ship the first topic,
  the rest is fetched on selection.
- `aiAvailable = aiEnabled && lessonPlanEnabled && getAiCheckConfig(settings)`, computed from **uncached**
  settings on every render of: `/teacher/lessons/new` (form branch), `/teacher/lessons/{id}`,
  `/teacher/students/{id}/lessons/new`; for drafts (`homeworkPlanEnabled`) on `/teacher/homework-plans/{id}`.
- The "bank" for manual add on the lesson board is `prisma.topic.findMany` over **all** topics with all
  numbers (`id`, `number`) — it does not depend on the lesson.

**Canonical** — owner `05`:

```ts
// GET /teacher/lessons/new-options            → LessonTargetChooser                     (05 §2)
// GET /teacher/lessons/new-form?groupId=<id> | ?studentId=<id>   → LessonNewFormModel   (05 §2)
//     mode "student": composeTopics[0] has conditionsLoaded = true and conditionLatex filled;
//     every other topic has conditionsLoaded = false → statements via GET /topics/{topicId}/conditions.
//     404 groupNotFound | studentNotFound.
// GET /teacher/number-bank                    → { topics: LessonBankTopic[] }           (04 §2.5 type)
```

- `ComposeContext` of `04` §2.4 is `LessonNewFormModel` in mode `"student"`:
  `student` = `members[0]`, `formTopics` = `topics`, `boardTopics` = `composeTopics`, `aiAvailable` as is.
- `GET /teacher/number-bank` is the single bank endpoint (lesson board manual add, student "Lessons" tab
  manual add). `LessonBoardModel.bank` is removed from the board payload.

**CORRECTION to `04-teacher-students.md` §6.5 / §6.8**: `GET /teacher/students/{studentId}/lesson-compose`
and `getLessonComposeContext` are removed → `TeacherPlannerApi.getLessonNewForm({ studentId })`.
**CORRECTION to `05-teacher-lessons-plans.md` §6**: `GET /teacher/lessons/{lessonId}/bank` →
`GET /teacher/number-bank`; "composeTopics without statements" → statements of the first topic only.

### A.2.8 Progress history (item 8)

**[CODE]** `GET /api/teacher/progress-history?studentId=&homeworkNumberId=&cursor=`. Wrong role / no
session → **403** `dict.apiContent.progressHistory.forbidden`; rate limit `api:progress-history` 90 / 60 s;
missing ids → `400 paramsRequired`; student not found / not own (TEACHER), number not found or unknown
cursor → `404 notFound`; header `Cache-Control: private, no-store`. Page size 20 (`PAGE_SIZE`), order
`createdAt desc, id desc`, `nextCursor` = id of the last returned row when a 21st exists. The site returns
**localised labels** and a `reference: { label, href } | null`: lesson reference when `context.lessonId`
names a lesson that still exists, includes the student and (TEACHER) is taught by the viewer →
`"<prefix>/lessons/<lessonId>"` with `prefix = "/developer"` for a DEVELOPER; otherwise homework reference
when `context.assignmentId` still exists for this student **and the viewer is a TEACHER** →
`"/teacher/students/<studentId>#homework-<assignmentId>"`; else `null`. The event row also stores
`requestedStatus` (`prisma/schema.prisma`), which the site response omits. Three site components call the
route: homework review (TEACHER), lesson board (TEACHER / DEVELOPER), developer journal (DEVELOPER).

**Canonical** — owner `04` §6.4, path changed:

```
GET /progress-history?studentId=<id>&homeworkNumberId=<id>&cursor=<entryId>     TEACHER (own student) · DEVELOPER (any)
200 → ProgressHistoryPage                                    (type exactly as in 04 §6.4: codes, not labels)
400 paramsRequired · 403 forbidden · 404 notFound · 429
```

**[DECISION]** The flat path mirrors the site route and does not imply a `/teacher/students/...` resource,
which a DEVELOPER does not have (Part B.2). `reference` stays the structured union of `04`
(`{ kind: "lesson"; lessonId } | { kind: "homework"; assignmentId } | null`); the homework kind is never
produced for a DEVELOPER (**[CODE]**).

**CORRECTION to `04-teacher-students.md` §6.4**: path
`/teacher/students/{sid}/numbers/{nid}/history?cursor=` → `/progress-history?studentId=&homeworkNumberId=&cursor=`
(`getProgressHistory(studentId, homeworkNumberId, cursor?)` keeps its signature). `07` §6.7 already uses it.

### A.2.9 Topic statements (item 9)

**[CODE]** `GET /api/teacher/topics/conditions?topicId=`; TEACHER / DEVELOPER; rate limit
`api:topic-conditions` 120 / 60 s; empty `topicId` → `{ conditions: {} }`; a failing query is caught and
also yields `{ conditions: {} }`; body `{ conditions: Record<homeworkNumberId, string | null> }`. No owner
scope (the bank is shared).

**Canonical** — owner `07` §6.1:

```ts
// GET /topics/{topicId}/conditions           TEACHER · DEVELOPER
type TopicConditions = { conditions: Record<string /* homeworkNumberId */, string | null> };   // wire body
// one client method, in ContentApi:
getTopicConditions(topicId: string): Promise<Record<string, string | null>>;                   // = body.conditions
```

**CORRECTION to `04-teacher-students.md` §6.2 / §6.8** and **to `05-teacher-lessons-plans.md` §6**: path
`/teacher/topics/{topicId}/conditions` → `/topics/{topicId}/conditions`; `getTopicConditions` is declared
only in `ContentApi` (`07` §6.8) and returns the bare record; `TeacherStudentsApi.getTopicConditions` and
`TeacherPlannerApi.getTopicConditions` are removed.

### A.2.10 Files (item 10)

**[CODE]** `GET /files/{fileId}`: thumbnail is requested with **`thumb=1`**
(`searchParams.get("thumb") === "1" && !download && isThumbnailable(mimeType)`); `download=1` switches the
disposition to `attachment`. There is no `variant` parameter, no metadata route and no signed-URL route
on the site. Thumbnail ETag `"<fileId>-thumb-<bytes>"`, original ETag `"<fileId>-<size>"`, both
`Cache-Control: private, max-age=31536000, immutable`; rate limit `api:file-read` 120 / 60 s; denied and
missing are both `404`.

**Canonical** — owner `09` §5.2 / Appendix C:

```
GET /files/{fileId}                 bytes, inline
GET /files/{fileId}?thumb=1         WebP thumbnail for images (falls back to the original)
GET /files/{fileId}?download=1      attachment
401 sessionExpired · 404 fileNotFound (missing or not permitted) · 429 · 503      (JSON envelope)
```

Auth = bearer header on every request; `FileService.source(fileId, "thumb")` (`09` §5.2) builds the
`?thumb=1` URL plus headers.

**CORRECTION to `09-data-i18n-math.md` Appendix C**: `GET /files/{fileId}?variant=thumb` → `?thumb=1`
(§5.1 of the same file is right).

**[DECISION]** `POST /files/{fileId}/access-url` (`02` §6.8) and `GET /files/{fileId}/meta` (`09` App. C)
are **not part of the v1 contract**: every DTO that references a file already carries its metadata
(`{ id, originalName, mimeType, size, uploadedAt }`), and the native viewers named in `09` §5.2 take
headers or a downloaded local file. `StudentStudyApi.getFileUrl` (`02` §6.11) is removed in favour of
`FileService`. Either endpoint can be added later without changing the rest.

### A.2.11 Upload (item 11)

**[CODE]** Multipart branch of `POST /api/teacher/uploads`: DEVELOPER only (`401
developerRightsRequired` otherwise); rate limit `api:teacher-uploads` 60 / 10 min; fields `file` (required)
and `previousFileId` (optional — deleted through `deleteOwnedStoredFileIfUnused` when it differs from the new
id); missing / empty file → `400 dict.apiContent.uploads.fileRequired`; `UploadValidationError` → `400` with
its message; other failure → `500 uploadFailed`; success `200 { file: { id, originalName, mimeType, size,
uploadedAt } }`. There is **no `purpose` field** in the code.

**Canonical** — owner `07` §6.5:

```ts
// POST /uploads        DEVELOPER; multipart: file, previousFileId?
type UploadedFile = { id: string; originalName: string; mimeType: string; size: number; uploadedAt: string };
// 201 { file: UploadedFile }
// 400 fileRequired | uploadInvalid · 403 developerRightsRequired · 429 · 500 uploadFailed
```

`UploadedFile` = `FileRef & { uploadedAt: string }` (`FileRef` of `09` §5.2).

**CORRECTION to `09-data-i18n-math.md` Appendix C**: `POST /uploads (file, purpose) → { file: FileRef }` →
`(file, previousFileId?) → { file: UploadedFile }`.

### A.2.12 Meta (item 12)

**[CODE]** Before login the site reads exactly one setting: `loginHelpContact`
(`app/(auth)/login/page.tsx`; trimmed, ≤ 200 chars, env default `LOGIN_HELP_CONTACT`). AI availability flags
and the idle thresholds are computed from uncached settings per page render for signed-in staff only
(A.2.7); `maxPhotosPerAssignment` (default 10, range 1..30) is read on the student homework page. The planner
limits are compile-time constants: `MIN_DURATION_MINUTES = 15`, `MAX_DURATION_MINUTES = 240`,
`MIN_SPEED = 1`, `MAX_SPEED = 10`, `MAX_GROUP_SIZE = 30`, `MAX_PLAN_ITEMS = 40`, `MAX_TITLE_LENGTH = 200`,
`MAX_TEACHER_NOTE_LENGTH = 500` (`lib/lesson-plan.ts`); `MIN_DAILY_MINUTES = 15`, `MAX_DAILY_MINUTES = 240`,
`DEFAULT_DAILY_MINUTES = 60` (`lib/homework-plan.ts`).

**Canonical** — owner `09` Appendix C:

```ts
// GET /meta        no auth
interface MetaResponse {
  serverNow: IsoDateTime;
  timeZone: "Europe/Moscow";
  locales: ["ru", "en"];
  loginHelpContact: string;                 // "" hides the help line
  limits: {                                 // compile-time constants only
    uploadMaxBytes: 15728640;
    allowedUploadExtensions: [".pdf", ".docx", ".png", ".jpg", ".jpeg"];
    photoExtensions: [".png", ".jpg", ".jpeg"];
    lessonSubmissionMaxPhotos: 3;
    parentCallDueDays: 30; parentCallOverdueDays: 45;
    lessonDurationMinutes: { min: 15; max: 240; default: 60 };
    homeworkDailyMinutes: { min: 15; max: 240; default: 60 };
    speed: { min: 1; max: 10 };
    maxStudentsPerLesson: 30; maxItemsPerPart: 40; maxTitleLength: 200; maxTeacherNoteLength: 500;
  };
}
```

**[DECISION]** Values that depend on runtime settings are **not** in the public `/meta`; they travel with
the payload of the screen that needs them, exactly where the site computes them:
`limits.maxPhotosPerAssignment` and `aiCheckAvailable` in `GET /student/homeworks[/{id}]` (`03` §6.1),
`lessonCheckAvailable` in `GET /student/lesson` (`03` §6.2), `aiAvailable` in `LessonNewFormModel`,
`LessonBoardModel`, `HomeworkPlanBoardModel`, and `idleWarnMinutes` / `idleAlertMinutes` in
`LessonBoardModel` (`05` §2). Consequently `MetaResponse.features` and
`MetaResponse.limits.maxPhotosPerAssignment` of `09` App. C are dropped.

**CORRECTION to `01-shell-auth.md` §6.1 / §6.9**: `GET /public/config` and `getPublicConfig()` are removed
→ `getMeta(): Promise<MetaResponse>`; the login screen reads `loginHelpContact` from it.
**CORRECTION to `05-teacher-lessons-plans.md` §6**: `GET /teacher/planner/meta` and `getPlannerMeta()` are
removed (flags come with the screen payloads, limits with `/meta`).

### A.2.13 Current user (item 13)

**[CODE]** `authenticatedUserSelect = { id, name, email, role, createdAt }` (`lib/auth.ts`); the settings
screen renders `createdAt` (`components/account-settings-view.tsx`); `Session.expiresAt` is absolute
(`SESSION_TTL_DAYS`, default 30).

**Canonical** — owner `01` §6.2: `GET /me → { user: AuthenticatedUser; sessionExpiresAt: string }`,
`401 sessionExpired`.

**CORRECTION to `08-design-system.md` §14**: the flat `MeResponse = { id, name, email, role }` is wrong for
`GET /me` (it also loses `createdAt`, which the settings screen needs). The shell's `ShellUser` (`08` §10)
is derived on the client: `Pick<AuthenticatedUser, "id" | "name" | "email" | "role">` of `response.user`.

### A.2.14 Note save (item 14)

**[CODE]** `POST /api/student/topic-status` success body
`{ ok: true, status: <unchanged status | null>, note: <saved value, "" when cleared>, notesEnabled }`; on a
database without the `note` column `{ ok: true, status, note: "", notesEnabled: false }` and nothing is
written. A body containing a `status` key → `403 statusReadOnly`; missing ids or missing `note` key →
`400 invalidData`; number not in the topic → `404 numberNotFound`; rate limit `api:student-status` 90 / 60 s.

**Canonical** — owner `02` §6.7:
`PUT /student/numbers/{homeworkNumberId}/note`, body `{ note: string }` →
`200 { ok: true; status: HomeworkNumberStatus | null; note: string; notesEnabled: boolean }`.

**CORRECTION to `03-student-homework-lesson.md` §6.1** (table row `PUT /student/numbers/{homeworkNumberId}/note`):
response `{ note }` → the body above (`notesEnabled: false` must hide the note field, as on the site); the
row references `02` §6.7 instead of redefining the endpoint. Error codes per A.0.2: `invalidData`,
`statusReadOnly`, `numberNotFound`.

### A.2.15 Student homework lists (item 15)

**[CODE]** The site has **two** readers, on purpose (comment above `getStudentHomeworkDeadlinesUncached`:
the full reader "pulls statements, answers, photos and the check history of the whole year — megabytes on
every opening of the home page"):

| Reader | Used by | Returns per assignment |
|---|---|---|
| `getStudentHomeworkDeadlines(studentId)` (cache 15 s) | `/student` (home), `/student/deadlines` | `id`, `title`, `orderInTopic`, `topicTitle`, `deadlineAt`, `totalNumbers`, `solvedCount`; order `createdAt asc`; `[]` when the table is missing |
| `getStudentHomeworks(studentId)` (cache 15 s) | `/student/homeworks`, `/student/homeworks/{assignmentId}` | the full `StudentHomework` (`03` §2.1), attention-sorted |

`orderInTopic` is computed identically in both (running counter per topic over `createdAt asc`).

**Canonical**

```ts
// owner 02 — light list for the home screen and the calendar
// GET /student/homework-deadlines → { serverNow: IsoDateTime; today: DateKey; items: HomeworkDeadlineSummary[] }
type HomeworkDeadlineSummary = {
  id: string; title: string | null; orderInTopic: number; topicTitle: string;
  deadlineAt: IsoDateTime | null; totalNumbers: number; solvedCount: number;
};

// owner 03 — full list and detail
// GET /student/homeworks, GET /student/homeworks/{assignmentId}           (03 §6.1, unchanged)
type HomeworkSummaryDto = HomeworkDeadlineSummary & {
  topicId: string; createdAt: IsoDateTime; solvedPercent: number; photosCount: number;
  attentionRank: 0 | 1 | 2 | 3 | 4 | 5; latestCheckStatus: SolutionCheckStatus | null;
  numbers: Array<{ homeworkNumberId: string; number: string; status: HomeworkNumberStatus | null }>;
};
```

- The seven shared fields have one meaning in both DTOs; the label is built on the client in both places
  (`title ?? format(dict.common.homeworkN, { n: orderInTopic })`).
- **[DECISION]** `GET /student/home` (`02` §6.1) is removed: the home screen runs two queries,
  `GET /student/homework-deadlines` and `GET /student/streak`, which the calendar and the shell already
  need. `StudentStudyApi.getHome` and `StudentHomeResponse` are removed.
- Cache rule for the client: any event that invalidates one of the two homework queries invalidates the
  other (`student-deadlines-changed`, `student-progress-changed`, a finished check, a note save).

### A.2.16 Streak (item 16)

**[CODE]** One route, `GET /api/student/streak` → `{ streak }`, STUDENT only, rate limit `api:streak`
120 / 60 s; the streak context is created in `app/(dashboard)/layout.tsx` (shell), the home page only
renders it.

**Canonical** — owner `01` §6.5: `GET /student/streak → { streak: StudentStreak }`;
`ShellApi.getStreak()` is the only client method. **CORRECTION to `02-student-study.md` §6.3 / §6.11**:
`StudentStudyApi.getStreak` is removed (the home screen reads the shell's streak query).

### A.2.17 Notifications (item 17)

**[CODE]** `listNotifications(userId, 20, locale)` returns `{ notifications: StudentNotification[],
unreadCount }` with `StudentNotification = { id, type, title, body, href, readAt, createdAt }` (`params`
are read for rendering but not returned). `POST /api/student/notifications` → `{ ok: true }`;
`POST /api/notifications` → `{ success: true }`; neither returns the new unread count. The student route
is rate-limited (`api:notifications` 60 / 60 s, shared by GET and POST), the generic route is not. All
`href` values the code can produce are listed in Part B.6.

**Canonical** — owner `01` §6.4:

```ts
// GET /notifications            any role
type NotificationItem = {
  id: string;
  type: string;
  title: string; body: string | null;                       // rendered for Accept-Language
  params: Record<string, string | number | boolean | null> | null;
  href: string | null;                                      // stored site path, returned verbatim (diagnostics only)
  target: NavTarget | null;                                 // B.6 — the ONLY thing the app navigates by
  readAt: string | null; createdAt: string;
};
type NotificationsResponse = { notifications: NotificationItem[]; unreadCount: number };

// POST /notifications/read      body { notificationId?: string }     → 200 { ok: true; unreadCount: number }
```

- `target` is computed by the server (and by the mock) with the single pure function
  `resolveHrefTarget(href, role)` of Part B.6. The app never parses `href`. `target === null` → the row is
  only marked read.
- **CORRECTION to `09-data-i18n-math.md` Appendix C**: `NotificationDto` ("`href` … the app maps it to a
  route") and `POST /notifications/read → { ok: true }` are replaced by the shapes above; the mapping
  comment inside `NotificationDto` is superseded by Part B.6.
- **CORRECTION to `01-shell-auth.md` §6.4 / §6.9**: `NotificationTarget` is replaced by `NavTarget` (B.6;
  one rename: `teacher.calls` → `calls.list`); `listNotifications()` returns `NotificationsResponse`
  (items include `params` and `target`), not the site's `NotificationsPayload`.

### A.2.18 Attendance (item 18)

**[CODE]** `PATCH /api/teacher/lessons/{lessonId}/participants/{participantId}/attendance`, body
`{ attendance }` with the Prisma enum **`AttendanceStatus`** (`UNKNOWN | PRESENT | LATE | ABSENT | EXCUSED`);
lessons of kind `LESSON` only; rate limit `api:lesson-attendance` 240 / 60 s; `400 invalidMark`,
`404 participantNotFound`, `500 saveFailed`; success `{ ok: true, attendance }`. The route's own comment
places the UI on the group page.

**Canonical** — owner `06` §6.3 (path and body unchanged). The type name is `AttendanceStatus` everywhere.
**CORRECTION to `06-teacher-groups-calls-stats.md` §6.3 / §6.6**: `AttendanceValue` → `AttendanceStatus`
(same five values). **CORRECTION to `05-teacher-lessons-plans.md` §6**: the attendance endpoint and
`TeacherPlannerApi.setAttendance` are removed from the planner contract and reference `06` §6.3.

### A.2.19 Number status (item 19)

**[CODE]** `POST /api/teacher/number-status`, **TEACHER only** (`user.role !== TEACHER` → `401
unauthorized`, so a DEVELOPER is refused); rate limit `api:teacher-number-status` 240 / 60 s; the `status`
key must be present (`GREEN | YELLOW | RED | null`) → else `400 dict.apiPlanner.numberStatus.invalidData`;
student not own or number missing → `404 studentOrNumberNotFound`; success `{ ok: true, status }`. The write
goes through `writeProgress({ source: "teacher" })`, whose decision for this source is always written with
reason `"reaffirmed"` (previous = requested) or `"changed"` (`lib/progress-policy.ts`), and stamps
`statusChangedAt = recordedAt`.

**Canonical** — owner `04` §6.4:

```ts
// PUT /teacher/students/{studentId}/numbers/{homeworkNumberId}/status       TEACHER (own student)
// body { status: HomeworkNumberStatus | null }
type SetNumberStatusResponse = {
  ok: true;
  status: HomeworkNumberStatus | null;
  statusChangedAt: ISODateTime;
  decision: "changed" | "reaffirmed";
};
// 400 invalidData · 403 unauthorized (DEVELOPER, STUDENT) · 404 studentOrNumberNotFound · 429
```

**CORRECTION to `04-teacher-students.md` §6.8**: `setNumberStatus(...)` returns
`Promise<{ status; statusChangedAt; decision }>` (wire body minus `ok`), not `Promise<{ status }>`.

---

## A.3 Typed client interfaces after this addendum (deltas only)

```ts
// 01 — ShellApi
getMeta(): Promise<MetaResponse>;                                   // replaces getPublicConfig()
getMe(): Promise<{ user: AuthenticatedUser; sessionExpiresAt: string }>;
listNotifications(): Promise<NotificationsResponse>;
markNotificationsRead(input: { notificationId?: string }): Promise<{ unreadCount: number }>;
getStreak(): Promise<{ streak: StudentStreak }>;                     // the only streak method
findNumber(number: string): Promise<NumberFindResult>;

// 02 — StudentStudyApi: removed getHome, getStreak, lookupNumber, getFileUrl
getHomeworkDeadlines(): Promise<{ serverNow: string; today: string; items: HomeworkDeadlineSummary[] }>;
saveNumberNote(homeworkNumberId: string, note: string, signal?: AbortSignal):
  Promise<{ status: HomeworkNumberStatus | null; note: string; notesEnabled: boolean }>;   // the only note method

// 03 — student homework / lesson client: note save and number search are NOT redeclared (use 02 / 01)

// 04 — TeacherStudentsApi: removed getTopicConditions, getNumberBank, getLessonComposeContext
setNumberStatus(studentId: string, homeworkNumberId: string, status: HomeworkNumberStatus | null):
  Promise<{ status: HomeworkNumberStatus | null; statusChangedAt: string; decision: "changed" | "reaffirmed" }>;
getProgressHistory(studentId: string, homeworkNumberId: string, cursor?: string): Promise<ProgressHistoryPage>;

// 05 — TeacherPlannerApi: removed getPlannerMeta, getTopicConditions, setAttendance
getNumberBank(): Promise<{ topics: LessonBankTopic[] }>;
getLessonNewForm(target: { groupId: string } | { studentId: string }): Promise<LessonNewFormModel>;
createLesson(input: CreateLessonInput): Promise<{ lessonId: string; plan: CreatePlanOutcome }>;
saveLessonItems(lessonOrPlanId: string, participantId: string, main: string[], extra?: string[]): Promise<LessonBoardItem[]>;
regenerateParticipant(lessonOrPlanId: string, participantId: string): Promise<{ planRequestedAt: string }>;
setItemResult(lessonId: string, participantId: string, itemId: string, result: LessonItemResult | null):
  Promise<{ result: LessonItemResult | null; studentStatus: HomeworkNumberStatus | null }>;
getHandoutUrl(lessonId: string, opts: { format: "pdf" | "html"; studentId?: string; answers?: boolean }): string;

// 06 — GroupsCallsStatsApi
setAttendance(lessonId: string, participantId: string, attendance: AttendanceStatus): Promise<{ attendance: AttendanceStatus }>;

// 07 — ContentApi
getTopicConditions(topicId: string): Promise<Record<string, string | null>>;   // the only conditions method
uploadFile(file, opts?): Promise<UploadedFile>;                                // the only upload method

// 09 — FileService.source(fileId, "thumb") builds "…/files/{fileId}?thumb=1"
```

## A.4 Rules for the mock

- One in-process implementation per canonical operation; a superseded method must not exist in
  `MockApiClient` (otherwise two screens drift apart on the same data).
- The mock produces the envelope of A.0.1 with camelCase codes and the status split of A.0.3.
- `resolveHrefTarget` (B.6) is shared code used by the mock notification store; notification fixtures store
  the site `href` values listed in B.6 verbatim.
- Keep the site numbers: rate limits quoted in A.2, page size 20 for history, 20 newest notifications,
  40 items per part of a set, 30 students per lesson.

---

# Part B — Navigation

## B.1 Site facts [CODE]

**Navigation items** (`buildNavItems`, `components/dashboard-nav.tsx`):

- STUDENT: `/student`, `/student/lesson`, `/student/homeworks`, `/student/deadlines`, `/student/theory`,
  `/student/info`, `/student/settings`.
- TEACHER: `/teacher`, `/teacher/topics`, `/teacher/students`, `/teacher/groups`, `/teacher/lessons`
  (active for `/teacher/lessons*` **and** `/teacher/homework-plans*`, `isPlannerPath`), `/teacher/calls`,
  `/teacher/settings`.
- DEVELOPER: `/developer/topics`, `/developer/accounts`, `/developer/calls`, `/developer/statistics`,
  `/developer/panel`, `/developer/settings`.
- The item whose path ends with `/settings` is rendered as the gear, not as a tab. On a phone-width
  browser the hamburger lists all remaining items in this order.

**URL plumbing with no native equivalent**: `next.config.ts` rewrites `/developer` and
`/developer/:path*` onto `/teacher…`; `middleware.ts` only checks that a `tutor_session` cookie is present
and swaps the `/teacher` ↔ `/developer` prefix by the non-secret `tutor_role` cookie. Real access control
is `requireUser(role | role[])` in each page (`lib/auth.ts`): no session → `/login`; role not allowed →
`roleHome(role)` (`/teacher`, `/developer/topics`, `/student`).

**Role guards of every page** (file → guard):

| Site path (under `/teacher`, developer alias `/developer`) | Guard |
|---|---|
| `/teacher` | `requireUser(TEACHER)` |
| `/teacher/students`, `/teacher/students/[studentId]` (layout + page), `…/assign`, `…/lessons`, `…/lessons/new` | `requireUser(TEACHER)` |
| `/teacher/topics`, `/teacher/topics/[topicId]`, `…/numbers/[number]` | `requireUser([TEACHER, DEVELOPER])` |
| `/teacher/topics/[topicId]/edit` | `requireUser(DEVELOPER)` |
| `/teacher/groups`, `/teacher/groups/[groupId]` | `requireUser([TEACHER, DEVELOPER])` |
| `/teacher/lessons`, `/teacher/lessons/new`, `/teacher/lessons/[lessonId]` | `requireUser([TEACHER, DEVELOPER])` |
| `/teacher/homework-plans`, `…/new`, `…/[planId]` | `requireUser([TEACHER, DEVELOPER])` |
| `/teacher/calls` | `requireUser([TEACHER, DEVELOPER])` |
| `/teacher/accounts`, `/teacher/statistics`, `/teacher/panel`, `/teacher/panel/journal` | `requireUser(DEVELOPER)` |
| `/teacher/settings` | `requireUser([TEACHER, DEVELOPER])` |
| `/student`, `/student/lesson`, `/student/homeworks`, `/student/homeworks/[assignmentId]`, `/student/deadlines`, `/student/theory`, `/student/numbers/[number]`, `/student/settings` | `requireUser(STUDENT)` |
| `/student/info` | none of its own (only the dashboard layout's `requireUser()`) |

**Homework drafts list `/teacher/homework-plans`** — no navigation item and no link from the lessons list,
the lesson board or the group page. Those pages link to the **create form**:

| From | Link |
|---|---|
| Group page | `{prefix}/homework-plans/new?groupId={groupId}` |
| Lesson board | `{prefix}/homework-plans/new?lessonId={lessonId}` |
| Student "Lessons" tab | `/teacher/homework-plans/new?lessonId={lessonId}&studentId={studentId}` |
| Student "Assign" tab | `{routePrefix}/homework-plans/new?studentId={studentId}` |

After creation the form navigates to `{prefix}/homework-plans/{planId}`. The **only** in-app navigation to
the list is `router.push("{prefix}/homework-plans")` after a draft is deleted
(`components/teacher-homework-plan-board.tsx`); the only link to a draft board is the list itself. A teacher
who leaves a draft board therefore cannot return to it on the site without the URL or browser history. The
list has no "create" control; its empty hint is `dict.planner.homeworkPlans.list.emptyHint` («Создайте
черновик со страницы урока («Выдать ДЗ по итогам занятия»), группы или ученика.» / "Create a draft from a
lesson page (“Assign homework from results”), a group or a student.").

**DEVELOPER and the planner / groups pages** — guards allow them, the developer nav has no item. Clickable
paths that exist on the site for a DEVELOPER:

- Developer journal → a `progress.status` row → status-history widget → reference "open lesson"
  → `/developer/lessons/{lessonId}` (`lib/progress-history.ts` builds the href with `prefix = "/developer"`).
  This is the only link from a developer nav section into the planner.
- From that lesson board: `…/homework-plans/new?lessonId=`, the handout routes, and (after deleting the
  lesson) `/developer/lessons`; from the lessons list: `/developer/lessons/new`; from a draft board (after
  delete): `/developer/homework-plans`.
- `/developer/groups` and `/developer/groups/{groupId}`: no clickable path at all (URL only).

**Links that are dead for a DEVELOPER on the site** (they render with the `/developer` prefix but the
target is `requireUser(TEACHER)` → redirect to `/developer/topics`): the student name in the group
statistics block (`{prefix}/students/{id}`, `components/group-statistics-section.tsx`) and "student's
homework" on an issued draft participant (`{prefix}/students/{studentId}`,
`components/teacher-homework-plan-board.tsx`). The calls page avoids this: its empty-state link is
`/developer/accounts` for a DEVELOPER and `/teacher/students` for a TEACHER.

## B.2 What a DEVELOPER does not have (stated once) [CODE]

1. **No teacher overview, no students list, no student card** (review / assign / lessons tabs, compose
   for a student): `/teacher` and everything under `/teacher/students/**` is `requireUser(TEACHER)`.
2. **Cannot create a group**: `createGroupAction` is `requireUser(TEACHER)` and the groups page hides the
   create form for a DEVELOPER. Rename, delete, member edits and the AI profile are allowed
   (`requireUser([TEACHER, DEVELOPER])`).
3. **Cannot record a parent call**: `POST /api/teacher/parent-calls` → `401 unauthorized` unless the role
   is TEACHER (`GET` is allowed for both).
4. **Cannot set a number status or a per-number deadline**: `POST /api/teacher/number-status` and
   `POST /api/teacher/student-deadlines` → `401 unauthorized` unless the role is TEACHER. (Mobile: `403
   unauthorized`, A.0.3.)
5. Never receives a `homework` reference in the progress history (the code adds it only for a TEACHER) and
   never receives `parent_call_due` notifications (generated only when `user.role === TEACHER`).

Rule for the app: a link, notification target or history reference whose screen is not registered for
the current role (B.4) is **not offered** — rendered as plain text or omitted, never as a tappable element
that bounces to the home screen (the site's behaviour for the two dead links above must not be copied).

## B.3 Decisions [DECISION]

| # | Subject | Decision | Basis |
|---|---|---|---|
| N1 | TEACHER: homework drafts list | Reachable from the root of the "занятия / lessons" section through a two-segment control: «Уроки» / "Lessons" (`dict.planner.lessonsList.kicker`) and «Домашние задания» / "Homework" (`dict.planner.homeworkPlans.list.kicker`). Default segment: lessons. No "create draft" button on the list (the site has none); the empty state keeps `homeworkPlans.list.emptyTitle` + `emptyHint`. | `isPlannerPath` treats both URL trees as one section; without an entry a created draft becomes unreachable in an app without a URL bar. Confirms `05` §7 Q1. |
| N2 | DEVELOPER: lessons list, new lesson, lesson board, drafts list / new / board | **Out of scope for the DEVELOPER navigator in v1.** The history reference of kind `lesson` is shown to a DEVELOPER as non-tappable text. | The developer nav has no planner item; the only clickable path is the journal's history reference, and following it would pull the whole planner tree into the developer app through a side door. Closes `01` §7 Q17 (planner part), `05` §7 Q16. |
| N3 | DEVELOPER: groups list, group detail, group attendance PDF | **Out of scope for the DEVELOPER navigator in v1.** | No nav item and no clickable path on the site. Confirms the suggestion of `06` §7 Q2. |
| N4 | One compose screen | `/teacher/students/{id}/lessons/new` (`04` S7) and `/teacher/lessons/new?studentId=` (`05` §1.2.c) are **one** mobile screen `planner.lessonNew { studentId }`; the student card's "Lessons" tab is an entry point to it, not a second screen. | Both site pages render `TeacherLessonComposeSwitch` with the same props (A.2.7). |
| N5 | Number search | A shell-level action available on every root screen of every role (owner `01`); screens do not embed their own copy. | The control is in the header of every dashboard page. Confirms `04` §7 Q17, `01` §7 Q20 stays open only for its visual form. |
| N6 | Placement of primary sections (tab vs "more") | Not decided here. The registry records which screens are **primary sections** and their site order; every primary section is reachable from the role's root navigator. `01` §1.3 and `08` §15 Q4 propose different tab sets (teacher: `01` puts topics and groups under "more", `08` puts topics and calls there; student: `01` keeps theory as a tab and moves info to a row, `08` moves both under "more"). `01` owns the shell, so its proposal is the working default until the owner answers. | No code fact favours either split. |

If the owner overrides N2 / N3 (developer should keep URL-level parity): add two rows «занятия» / "lessons"
(`dict.nav.teacher.lessons`) and «группы» / "groups" (`dict.nav.teacher.groups`) at the top of the
developer's Settings screen, register the `planner.*` and `groups.*` screens for DEVELOPER, hide every
link to `teacher.student.*` on them, and add `teacherName` to list items (`05` §7 Q16). Nothing else in
this addendum changes.

## B.4 Screen registry

Columns: **T / D / S** = registered for TEACHER / DEVELOPER / STUDENT (`●` yes, `—` no, `○` allowed by the
site guard but out of scope per B.3). "Section" marks a primary section of that role (site order number).
Dialogs, sheets and tabs inside a screen are part of the screen and are specified by the owner spec.

### Shell and shared

| ScreenId | Site route | T | D | S | Entry points in the app | Owner |
|---|---|---|---|---|---|---|
| `auth.launch` | `/`, `/dashboard` | ● | ● | ● | app start | 01 §1.1 |
| `auth.login` | `/login` | ● | ● | ● | no / expired session; logout; any `401 sessionExpired` | 01 §1.2 |
| `shell.notifications` | bell panel (no route) | ● | ● | ● | bell in the top bar of every root screen | 01 §1.4 |
| `shell.settings` | `/teacher/settings`, `/developer/settings`, `/student/settings` | ● | ● | ● | gear in the top bar | 01 §1.5 (+ 08 §9.2 block) |
| `shell.numberSearch` | header control on every page | ● | ● | ● | search action on every root screen (N5) → `student.number` or `content.number` | 01 §3.9 / A.2.1 |
| `shared.fileViewer` | `/files/{fileId}` | ● | ● | ● | file cards, theory rows, photo grids, handout / report downloads | 09 §5.2 |

### STUDENT

| ScreenId | Site route | Section | Entry points in the app | Owner |
|---|---|---|---|---|
| `student.home` | `/student` | 1 | root; logo | 02 S1 |
| `student.lesson` | `/student/lesson` | 2 | root | 03 L1 / L2 |
| `student.homeworks` | `/student/homeworks` | 3 | root; notification `homework-assigned` | 03 H1 |
| `student.homework` | `/student/homeworks/{assignmentId}` | — | row of `student.homeworks`; deadline item on `student.home`; day item on `student.deadlines`; notification `homework-checked` | 03 H2 |
| `student.deadlines` | `/student/deadlines` | 4 | root | 02 S4 |
| `student.theory` | `/student/theory` | 5 | root | 02 S2 |
| `student.info` | `/student/info` | 6 | root | 02 S5 |
| `student.number` | `/student/numbers/{number}` | — | `shell.numberSearch` only (the site has no other link to it) | 02 S3 |

### TEACHER and DEVELOPER

| ScreenId | Site route (`/teacher…`) | T | D | Section (T / D) | Entry points in the app | Owner |
|---|---|---|---|---|---|---|
| `teacher.home` | `/teacher` | ● | — | 1 / — | root; logo | 04 S1 |
| `content.topics` | `/topics` | ● | ● | 2 / 1 | root; card on `teacher.home`; DEVELOPER: logo (role home) | 07 §1.1 (+ §1.4 create block, DEVELOPER) |
| `content.topic` | `/topics/{topicId}` | ● | ● | — | card of `content.topics` | 07 §1.2 |
| `content.topicEdit` | `/topics/{topicId}/edit` | — | ● | — | "edit" tab of `content.topic`; after an import is applied; content-gap row of `stats.main` | 07 §1.3 (+ §1.5 import) |
| `content.number` | `/topics/{topicId}/numbers/{number}` | ● | ● | — | `shell.numberSearch` only (the site has no other link to it) | 07 §1.4b |
| `teacher.students` | `/students` | ● | — | 3 / — | root; card on `teacher.home`; empty state of `calls.list` (TEACHER) | 04 S2 |
| `teacher.student.review` | `/students/{studentId}` | ● | — | — | row of `teacher.students`; student name in the statistics block of `groups.detail`; "student's homework" on an issued participant of `planner.draftBoard`; history reference of kind `homework` | 04 S3 + S4 |
| `teacher.student.assign` | `/students/{studentId}/assign` | ● | — | — | tab of the student card | 04 S5 |
| `teacher.student.lessons` | `/students/{studentId}/lessons` | ● | — | — | tab of the student card | 04 S6 |
| `groups.list` | `/groups` | ● | ○ | 4 / — | root | 06 §1.1 |
| `groups.detail` | `/groups/{groupId}` | ● | ○ | — | card of `groups.list` | 06 §1.2 |
| `planner.lessons` | `/lessons` | ● | ○ | 5 / — | root (segment «Уроки», N1); "all lessons" on `groups.detail`; after a lesson is deleted | 05 §1.1 |
| `planner.drafts` | `/homework-plans` | ● | ○ | (5) | second segment of the same section (N1); after a draft is deleted | 05 §1.5 |
| `planner.lessonNew` | `/lessons/new[?groupId=\|?studentId=]`, `/students/{studentId}/lessons/new` | ● | ○ | — | compose card on `planner.lessons` (chooser); "compose a lesson" on a card of `groups.list` and on `groups.detail` (`groupId`); compose button on `teacher.student.lessons` (`studentId`, N4) | 05 §1.2 |
| `planner.lessonBoard` | `/lessons/{lessonId}` | ● | ○ | — | row of `planner.lessons`; lesson rows and attendance column headers on `groups.detail`; lesson card on `teacher.student.lessons`; "source lesson" on `planner.draftBoard`; after `planner.lessonNew`; history reference of kind `lesson` | 05 §1.3 (+ §1.4 handout action) |
| `planner.draftNew` | `/homework-plans/new?lessonId=\|groupId=\|studentId=` | ● | ○ | — | `groups.detail` (`groupId`); `planner.lessonBoard` (`lessonId`); `teacher.student.lessons` (`lessonId` + `studentId`); `teacher.student.assign` "pick with AI" (`studentId`). Never opened without one of the three parameters (the site answers 404) | 05 §1.6 |
| `planner.draftBoard` | `/homework-plans/{planId}` | ● | ○ | — | row of `planner.drafts`; after `planner.draftNew` | 05 §1.7 |
| `calls.list` | `/calls` | ● | ● | 6 / 3 | root; card on `teacher.home`; notification `parent_call_due` (TEACHER) | 06 §1.4 |
| `developer.accounts` | `/accounts` | — | ● | — / 2 | root; empty state of `calls.list` (DEVELOPER) | 04 S9 |
| `stats.main` | `/statistics` | — | ● | — / 4 | root | 06 §1.6 |
| `developer.panel` | `/panel` (tabs `status`, `actions`, `broadcast`, `settings`) | — | ● | — / 5 | root; notifications `dev_ai_budget_warn`, `dev_ai_budget_out`, `dev_stale_checks`, `dev_storage` | 07 §1.9 |
| `developer.journal` | `/panel/journal` | — | ● | — | tab strip of `developer.panel`; notification `dev_errors` | 07 §1.10 |

Downloads that are actions, not screens: student PDF report (`04` S8, TEACHER; the API also accepts a
DEVELOPER but no developer screen offers it), group attendance PDF (`06` §1.3, TEACHER), lesson handout
(`05` §1.4, TEACHER) — all open `shared.fileViewer`.

## B.5 Navigation model (replaces the two existing ones)

**CORRECTION to `01-shell-auth.md` §2** (`NavItemId`, `NavItem`) and **to `08-design-system.md` §10**
(`NavItem = { key, route, labelKey, isSettings }`): both list only the site tabs. One model, owned by `01`:

```ts
type ScreenId =
  | "auth.launch" | "auth.login" | "shell.notifications" | "shell.settings" | "shell.numberSearch" | "shared.fileViewer"
  | "student.home" | "student.lesson" | "student.homeworks" | "student.homework" | "student.deadlines"
  | "student.theory" | "student.info" | "student.number"
  | "teacher.home" | "teacher.students" | "teacher.student.review" | "teacher.student.assign" | "teacher.student.lessons"
  | "content.topics" | "content.topic" | "content.topicEdit" | "content.number"
  | "groups.list" | "groups.detail"
  | "planner.lessons" | "planner.drafts" | "planner.lessonNew" | "planner.lessonBoard" | "planner.draftNew" | "planner.draftBoard"
  | "calls.list" | "developer.accounts" | "stats.main" | "developer.panel" | "developer.journal";

/** A primary section of a role's root navigator (B.4 "Section" column), in site order. */
type NavSection = {
  screen: ScreenId;
  labelKey: string;                       // dict.nav.<role>.<item>
  webPath: string;                        // site route, kept for traceability only
  placement: "tab" | "more" | "gear";     // "gear" = shell.settings; tab / more per decision N6
};

const SECTIONS: Record<UserRole, ScreenId[]> = {
  STUDENT:   ["student.home", "student.lesson", "student.homeworks", "student.deadlines", "student.theory", "student.info"],
  TEACHER:   ["teacher.home", "content.topics", "teacher.students", "groups.list", "planner.lessons", "calls.list"],
  DEVELOPER: ["content.topics", "developer.accounts", "calls.list", "stats.main", "developer.panel"]
};
const HOME: Record<UserRole, ScreenId> = { STUDENT: "student.home", TEACHER: "teacher.home", DEVELOPER: "content.topics" };
```

Mapping of the old ids: `student.overview` → `student.home`; `teacher.overview` → `teacher.home`;
`teacher.topics`, `developer.topics` → `content.topics`; `teacher.groups` → `groups.list`;
`teacher.lessons` → `planner.lessons`; `teacher.calls`, `developer.calls` → `calls.list`;
`developer.statistics` → `stats.main`; `*.settings` → `shell.settings` (`placement: "gear"`); the other ids
are unchanged. Label keys stay `dict.nav.<role>.<item>` as in `01` §1.3.

## B.6 Link targets — one mapping

```ts
type NavTarget =
  | { screen: "student.homeworks" }
  | { screen: "student.homework"; assignmentId: string }
  | { screen: "student.number"; number: string }
  | { screen: "content.number"; topicId: string; number: string }
  | { screen: "calls.list"; studentId: string }
  | { screen: "developer.panel"; tab: "status" | "actions" | "broadcast" | "settings" }
  | { screen: "developer.journal"; outcome?: "failed"; days?: number }
  | { screen: "planner.lessonBoard"; lessonId: string }
  | { screen: "teacher.student.review"; studentId: string; assignmentId?: string };

/** Pure; shared by the future server and the mock. Returns null when nothing may be opened. */
function resolveHrefTarget(href: string | null, role: UserRole): NavTarget | null;
```

Every site path that reaches a client as data **[CODE]**, and its target:

| Site `href` (exactly as produced) | Produced by | NavTarget |
|---|---|---|
| `/student/homeworks` | notification `homework-assigned` (`lib/homework-issue.ts`; `app/api/teacher/student-deadlines/route.ts`) | `{ screen: "student.homeworks" }` |
| `/student/homeworks/{assignmentId}` | notification `homework-checked` (`lib/solution-check.ts`) | `{ screen: "student.homework", assignmentId }` |
| `/teacher/calls?studentId={studentId}` | notification `parent_call_due` (`lib/parent-calls.ts`) | `{ screen: "calls.list", studentId }` |
| `/developer/panel/journal?outcome=failed&days=1` | notification `dev_errors` (`lib/developer-alerts.ts`) | `{ screen: "developer.journal", outcome: "failed", days: 1 }` |
| `/developer/panel` | notifications `dev_ai_budget_out`, `dev_ai_budget_warn` | `{ screen: "developer.panel", tab: "status" }` |
| `/developer/panel?tab=actions` | notifications `dev_stale_checks`, `dev_storage` | `{ screen: "developer.panel", tab: "actions" }` |
| `null` | notification `broadcast` (`actions/developer.ts`) | `null` |
| `/student/numbers/{number}` | student number search | `{ screen: "student.number", number }` — mobile gets the fields directly (A.2.1) |
| `/teacher/topics/{topicId}/numbers/{number}` | staff number search | `{ screen: "content.number", topicId, number }` — same |
| `/teacher/lessons/{lessonId}`, `/developer/lessons/{lessonId}` | progress-history reference | `{ screen: "planner.lessonBoard", lessonId }` — mobile gets `{ kind: "lesson", lessonId }` (A.2.8) |
| `/teacher/students/{studentId}#homework-{assignmentId}` | progress-history reference (TEACHER only) | `{ screen: "teacher.student.review", studentId, assignmentId }` — mobile gets `{ kind: "homework", assignmentId }` |

Rules of `resolveHrefTarget`:

1. `/developer/…` and `/teacher/…` are the same path (rewrite); path segments are URL-decoded.
2. `tab` is parsed like `parseDeveloperPanelTab`: one of `status | actions | broadcast | settings`,
   anything else → `"status"`. `days` like the journal page: finite number in `0..365` (floored), anything
   else → `7`; `outcome` is honoured only when it equals `"failed"`.
3. If the resolved screen is not registered for `role` in B.4 → `null` (this is where N2 makes the lesson
   reference inert for a DEVELOPER).
4. Any other `href` → `null`. The app does not open unknown paths in a browser.

Behaviour on arrival **[CODE]**:

- `calls.list { studentId }`: the row is scrolled into view and highlighted for 1500 ms
  (`HIGHLIGHT_FLASH_MS`); no panel is opened; a `studentId` that is not in the list changes nothing.
  **CORRECTION to `01-shell-auth.md` §1.4** (deep-link table: "focused/expanded on `{studentId}`"): the row
  is only scrolled to and flashed, not expanded.
- `student.homework { assignmentId }`: the site page answers "not found" when the assignment no longer
  exists (a cancelled homework is deleted while its notification row stays). Mobile: on
  `404 homeworkNotFound` open `student.homeworks` instead.
- `teacher.student.review { assignmentId }`: the site scrolls to the element `homework-{assignmentId}`;
  mobile scrolls the review list to that assignment.
- `developer.journal`: the filters are applied as the initial filter state and remain editable.

**CORRECTION to `01-shell-auth.md` §1.4 / §6.4 and `09-data-i18n-math.md` Appendix C**: the two
`href → screen` mappings are replaced by the table above; `09`'s "`/developer/panel[...]` → dev panel (tab /
journal filters from the query)" is split into the two explicit targets.

## B.7 Navigation rules for the mock and the app

- Three root navigators chosen by `user.role` (`01` §1.3); a screen is mounted in a role's navigator only
  when B.4 marks it `●` for that role.
- A request for a screen of another role cannot happen by URL; the only sources are `NavTarget`s, and
  `resolveHrefTarget` rule 3 already filters them. The site's "redirect to role home" has no visible
  equivalent.
- `planner.lessons` and `planner.drafts` share one section and one highlight, like `isPlannerPath`.
- After deleting a lesson → `planner.lessons`; after deleting a draft → `planner.drafts` (same as the site's
  `router.push`).
- After creating a lesson → `planner.lessonBoard` for every `plan` outcome of A.2.3 (the site navigates
  whenever a `lessonId` is returned, including the 503 case); after creating a draft → `planner.draftBoard`.

---

# Part C — Decisions that need the owner's confirmation

1. **N2 / N3** — DEVELOPER gets no lessons, homework drafts or groups screens in v1 (the site allows them
   by URL only). Alternative described under B.3.
2. **N1** — the teacher's homework drafts list becomes a second segment of the "занятия" section.
3. **N6** — which primary sections are bottom tabs and which sit under "more" (`01` §1.3 versus `08` Q4).
4. **A.0.3** — the mobile API answers a wrong role with `403` instead of the site's `401`.
5. **A.2.6** — `format=pdf` answers `503 pdfRendererUnavailable` instead of falling back to an HTML page.
6. **A.2.12** — runtime switches (AI availability, photo limit, idle thresholds) are delivered with screen
   payloads, not through a public `/meta`.
7. **A.2.15** — the student home screen uses two requests (deadlines, streak) instead of one aggregated
   `GET /student/home`.
8. **A.2.10** — no signed file URLs and no file-metadata endpoint in v1.
