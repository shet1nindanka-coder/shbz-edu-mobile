# 90 — Addendum 1: unified mobile API error contract + backend-readiness matrix

Addendum to the mobile-rewrite specs `01`–`09` (Expo / React Native, TypeScript) of "ШБЗ Школа".
It closes two cross-spec gaps found by the completeness review and does **not** edit the existing files:

- **Part A** — one error envelope, one error-code casing and one 401/403 rule for `/api/mobile/v1`, with the
  error tables of `02` §6, `03` §6.6, `05` §6 and `06` §6 regenerated from it, plus explicit corrections to
  `01`, `04`, `07`, `08`, `09`.
- **Part B** — what the proposed `/api/mobile/v1` surface means under the owner's condition "the site is not
  touched for now": a consolidated backend-readiness matrix (every operation of specs 01–07 classified) and
  the question that no spec poses yet.

Everything stated as a fact is taken from the site code (paths relative to the web repo root
`/home/user/web_shetya`). Proposals are marked **[PROPOSAL]**; statements about Next.js itself (not repo
code) are marked **[FRAMEWORK]**. Where an existing spec states something that contradicts the code or the
unified contract, the line starts with **CORRECTION to `<file>`**.

Source files read: `lib/api-rate-limit.ts`, `lib/rate-limit.ts` (`getRetryAfterSeconds`,
`getClientIpFromHeaders`), `lib/auth.ts`, `lib/password.ts`, `middleware.ts`, `next.config.ts`,
`instrumentation.ts`, `lib/i18n/server.ts`, `lib/i18n/locale.ts`,
`lib/i18n/dictionaries/api-common.ts|api-student.ts|api-planner.ts|api-content.ts|planner.ts|topics.ts`,
`lib/plan-error.ts`, `lib/homework-issue.ts`, `lib/upload-validation.ts`, `lib/solution-check-queue.ts`,
`lib/lesson-plan-queue.ts`, `lib/dashboard-realtime.ts`, `lib/platform-data.ts` (exports, cache wrappers),
`actions/auth.ts`, `actions/profile.ts`, `actions/locale.ts`, `actions/student.ts`, `actions/account.ts`,
`actions/group.ts`, `actions/topic.ts`, `actions/developer.ts`, every `route.ts` under `app/api/**`,
`app/files/[fileId]/route.ts`, the four `route.ts` files under `app/(dashboard)/teacher/**` (PDF / print),
every `page.tsx` / `layout.tsx` under `app/**` (role gate + readers), `prisma/schema.prisma` (`Session`),
and the specs `01`–`09` in this folder.

---

# Part A — Unified mobile API contract (gap 1)

## A.0 What the site does today (facts)

### A.0.1 Error shapes actually returned

| Route family | Failure body on the site | Source |
|---|---|---|
| All JSON handlers under `app/api/**` | `{ "error": "<localized text>" }` — no machine code. Text comes from `dict.apiCommon` / `apiStudent` / `apiPlanner` / `apiContent`; language = cookie `shbz-lang` (`getI18n()` → `getLocale()` reads the cookie, default `ru`; **`Accept-Language` is not read anywhere**) | every `route.ts`, `lib/i18n/server.ts` |
| Rate limit (`enforceApiRateLimit`) | `429 { error: dict.apiCommon.rateLimited }` + header `Retry-After: max(1, ceil(retryAfterMs / 1000))` | `lib/api-rate-limit.ts`, `lib/rate-limit.ts` |
| Rate-limit store failure | `503 { error: dict.apiCommon.serviceUnavailable }` + `Retry-After: 5` | `lib/api-rate-limit.ts` |
| A few success-shaped failures carry extra fields next to `error` | `POST /api/teacher/lessons` → `503 { error, lessonId }`; `POST /api/teacher/homework-plans` → `503 { error, planId }`; `POST /api/teacher/homeworks` and `POST /api/teacher/student-deadlines` → `503 { error, deadlinesEnabled: false }` when the `deadlineAt` column is missing | the four routes |
| `GET /api/realtime` | unauthenticated: **plain text** body = `dict.apiCommon.sessionExpired`, status 401; too many streams: JSON `429 { error: dict.apiStudent.realtime.tooManyConnections }` + `Retry-After: 5` | `app/api/realtime/route.ts` |
| `GET /files/{fileId}` | **plain text** `401 "Unauthorized"`, `404 "Not found"` (English, not localized); 429/503 are the JSON bodies of `enforceApiRateLimit` | `app/files/[fileId]/route.ts` |
| `GET /teacher/students/{id}/export/pdf`, `GET /teacher/groups/{id}/export/pdf` | **plain text**: `401 "Unauthorized"`, `404 "Student not found"` / `"Group not found"`, `500 "Export failed"`; student PDF only: `503` plain text `dict.apiCommon.reportsBusy` + `Retry-After: 30` when 2 exports are already running (`MAX_CONCURRENT_PDF_EXPORTS = 2`) | the two PDF routes |
| `GET /teacher/lessons/{id}/pdf`, `…/print` | JSON `{ error }`: `401 unauthorized`, `404 lessonNotFound`, `404 noHomeworkHandout` | the two routes |
| Server actions (`actions/*.ts`) | no HTTP error at all: either `redirect("…?<param>=<code>")` or a returned `{ ok: false, message? }` | Part B, table S |

Machine codes that **do** exist on the site are all lower camelCase: redirect query codes of the server actions
(`error=rateLimited`, `passwordError=mismatch`, `error=numbersTwin`, `error=deleteChanged`,
`accountError=ownerInvalid`, `accountError=teacherTransfer`, `groupError=missing`, …) and `PlanErrorCode`
(`unavailable`, `studentMissing`, `noCandidates`, `homeworkNoCandidates`, `homeworkParams`, `emptyPlan`,
`failed`, `budgetExhausted`, `queueFull` — `lib/plan-error.ts`, keys of `dict.planner.planErrors`). The only
snake_case codes are internal and never reach a client (`IssueHomeworkResult.code`:
`invalid | not_found | conflict | unavailable | already_issued`, `lib/homework-issue.ts`).

### A.0.2 Status returned for "no session" vs "wrong role" (complete list)

Every handler tests both conditions in one `if` (`!user || user.role !== …`), so the site cannot tell them
apart:

| Handlers | Condition tested | Status + body |
|---|---|---|
| All `app/api/student/**` (notifications, streak, find-number, topic-status, homework-submissions, homework-checks, lesson, lesson-submissions) | no session **or** role ≠ STUDENT | `401 { error: dict.apiCommon.sessionExpired }` |
| `GET` / `POST /api/notifications` | no session (any role allowed) | `401 { error: dict.apiCommon.sessionExpired }` |
| `GET /api/realtime` | no session | `401` plain text `sessionExpired` |
| All `app/api/teacher/**` that allow TEACHER + DEVELOPER (homeworks, lessons/**, homework-plans/**, topics/conditions, topics/find-number, parent-calls `GET`) and the lesson `pdf` / `print` routes | no session **or** role ∉ {TEACHER, DEVELOPER} | `401 { error: dict.apiCommon.unauthorized }` |
| TEACHER-only: `POST /api/teacher/number-status`, `POST /api/teacher/student-deadlines`, `POST /api/teacher/parent-calls` | no session **or** role ≠ TEACHER (a DEVELOPER gets this too) | `401 { error: dict.apiCommon.unauthorized }` |
| DEVELOPER-only: `topics` `POST`, `topics/order`, `number-conditions`, `number-answers`, `topic-numbers-preview`, `topic-import`, `uploads`, `statistics/drilldown` | no session **or** role ≠ DEVELOPER | `401 { error: dict.apiCommon.developerRightsRequired }` |
| `GET /api/teacher/progress-history` | no session **or** role ∉ {TEACHER, DEVELOPER} | **`403`** `{ error: dict.apiContent.progressHistory.forbidden }` |
| `POST /api/student/topic-status` with a `status` key in the body | signed-in student, forbidden action | **`403`** `{ error: dict.apiStudent.topicStatus.statusReadOnly }` |
| `GET /files/{id}`, student / group PDF | no session | `401` plain text `"Unauthorized"`; a file the user may not read → `404 "Not found"` |
| Any owned resource (student, group, lesson, draft, participant, item, homework, photo) | foreign = missing | always `404`, never `403` |

**CORRECTION to the review premise and to `01`–`07`:** "the site returns 401 everywhere for a wrong role" is
true for all routes **except** `GET /api/teacher/progress-history`, which returns **403** — and returns it
also for a request with **no session at all** (`04` §3.8 / `07` §3.15 list it as `403 forbidden` without
saying that an unauthenticated caller gets 403 too).

Why the conflation is harmless on the site and harmful in the app: a browser user cannot reach a wrong-role
API in normal use (pages call `requireUser(role)`, which redirects to `roleHome`), while `01` §4.1 tells the
app "any 401 → clear the stored token and go to Login". With the site's statuses a teacher's app that calls a
student endpoint would log itself out.

## A.1 Decisions

1. **One envelope** for every non-2xx response of `/api/mobile/v1`, including binary endpoints (files, PDF,
   handout) and the SSE handshake — §A.2.
2. **One casing**: lower camelCase, `^[a-z][A-Za-z0-9]*$`. Reason from the code: it is the casing of every
   machine code the site already has (A.0.1) and of the dictionary keys the messages come from, and it is
   what `01`, `04` and `07` already use. UPPER_SNAKE (`02`, `03`) and snake_case (`05`, `06`) are retired.
3. **One 401/403 rule**:
   - **401** = the request has no valid session (no token, unknown token, expired session). The code is
     always `sessionExpired`. Single exception: `POST /auth/login` answers 401 `invalidCredentials` for a wrong
     login/password.
   - **403** = the session is valid but the caller may not do this: wrong role (`unauthorized`, or
     `developerRightsRequired` on DEVELOPER-only endpoints) or an action forbidden to this role
     (`statusReadOnly`, `passwordCurrent`). A 403 **never** signs the user out.
   - **404** = missing **or not owned** (unchanged site rule, A.0.2 last row).
4. **`message` is always present and already localized** by the server from `Accept-Language` (the same
   dictionary strings the site uses); `code` is for branching only. The app shows `message` verbatim.

## A.2 Types

```ts
// Body of every non-2xx response of /api/mobile/v1
type ApiErrorBody = {
  error: {
    code: ApiErrorCode;                 // stable machine code, lower camelCase (tables A.4 – A.9)
    message: string;                    // localized (Accept-Language: ru | en, default ru), ready to show
    retryAfterSeconds?: number;         // mirrors the Retry-After header; present whenever the header is
    params?: Record<string, string | number>;   // values substituted into the dictionary template of `message`
                                                // (e.g. { max: 10 }, { number: "0512" }, { what: "Таблица ДЗ" })
    details?: Record<string, unknown>;  // structured machine data the UI needs (e.g. { conflictNumbers: string[] },
                                        // { numbers: string[] }, a fresh preview / impact object, { lessonId })
  };
};

// Client-side error thrown by every API method (replaces `class ApiError` of 01 §6.9)
class ApiError extends Error {
  status: number;                       // HTTP status; 0 = no response (network / timeout / aborted)  [PROPOSAL]
  code: ApiErrorCode | "network";       // "network" is client-only, never sent by the server           [PROPOSAL]
  retryAfterSeconds?: number;
  params?: Record<string, string | number>;
  details?: Record<string, unknown>;
}

// Codes with the same meaning on every endpoint (A.4)
type GlobalErrorCode =
  | "sessionExpired" | "unauthorized" | "developerRightsRequired"
  | "invalidData" | "rateLimited" | "serviceUnavailable" | "migrationMissing"
  | "saveFailed" | "deleteFailed" | "internalError";

type ApiErrorCode = GlobalErrorCode | EndpointErrorCode;   // EndpointErrorCode = union of tables A.6 – A.9 and of 01/04/07 after A.10
```

`params` vs `details`: `params` carries exactly what the site passes to `format()` for that message, so a
client that switches language can re-render the text from its bundled dictionary; `details` carries data the
UI acts on. Fields used by the specs: `03` `params` (`{ max }`, `{ number }`), `04` / `05` `details`
(`{ conflictNumbers }`, `{ numbers }`), `07` (`details` = fresh `NumbersChangePreview` / `TopicImpact`).

## A.3 Business rules for the client and the mock

1. **Sign-out** happens if and only if `code === "sessionExpired"` (only ever sent with 401): clear the stored
   token, reset navigation to Login, show `message` there (`dict.apiCommon.sessionExpired`:
   «Сессия истекла. Войдите заново.» / "Your session has expired. Please sign in again."). A 401
   `invalidCredentials` on `POST /auth/login` shows the form error and does nothing else.
2. **403 `unauthorized` / `developerRightsRequired`**: stay signed in; show `message`; re-fetch `GET /me`; if
   the role differs from the cached one, reset navigation to the new role's home (the native equivalent of
   `requireUser`'s redirect to `roleHome(user.role)`, `lib/auth.ts`). Other 403 codes are ordinary form errors.
3. **429** (any code): `retryAfterSeconds` is always present for `rateLimited` (site formula:
   `max(1, ceil(retryAfterMs / 1000))`, fixed windows, `01` §4.3) and absent for `budgetExhausted` (the site
   sends no `Retry-After` for the AI-planner daily budget). Disable the triggering control until
   `now + retryAfterSeconds`; never auto-retry a mutation.
4. **503**: `serviceUnavailable` → `retryAfterSeconds = 5`; `queueFull` on the student check endpoints → `120`;
   `reportsBusy` → `30`; `checkDisabled`, `plannerUnavailable`, `migrationMissing` carry none (not transient —
   do not offer an automatic retry).
5. **5xx with any other code** (`saveFailed`, `deleteFailed`, `createFailed`, …, `internalError`): show
   `message`, keep the user's input, offer a manual retry. The app never branches on which 5xx code it was.
6. **404**: list/detail screens show the not-found state (`01` §1.6); mutations show `message` and re-fetch the
   parent list (the resource was deleted or re-assigned to another teacher).
7. **Binary endpoints** (files, PDF report, handout) return the JSON envelope with
   `Content-Type: application/json` on failure; the client must check the status before treating the body as
   a file.
8. **Realtime (SSE)**: a failed handshake returns the JSON envelope (`sessionExpired`, `rateLimited`,
   `tooManyConnections` with `retryAfterSeconds: 5`); the stream itself never carries error frames (site
   behaviour, `01` §3.10).
9. **Mock**: every mock method throws `ApiError` built from the row of the tables below — `status`, `code`,
   and `message` = the listed dictionary entry rendered with `format()` / `plural()` in the current app
   locale, `params` / `details` as listed. The mock keeps the debug switches already required by `03` §6.5 and
   `05` §7.17 and adds one for `sessionExpired` and one for `unauthorized`.

Screens affected (no new screens): Login shows the `sessionExpired` message as a notice (`01` §1.2, `08`
§5.10 error notice); every form shows `message` in the inline error notice; list/detail loaders use the
error / not-found shells of `01` §1.6 / `08` §5.18.

## A.4 Global codes (same meaning on every endpoint)

| Code | HTTP | Message (site dictionary) | Extra fields | Site today |
|---|---|---|---|---|
| `sessionExpired` | 401 | `apiCommon.sessionExpired` «Сессия истекла. Войдите заново.» / "Your session has expired. Please sign in again." | — | 401 with the same text on student routes, `/api/notifications`, `/api/realtime`; 401 `unauthorized` / `developerRightsRequired` text on teacher routes; plain `"Unauthorized"` on files / PDF; 403 on progress-history |
| `unauthorized` | 403 | `apiCommon.unauthorized` «Нет доступа.» / "Access denied." (progress history: `apiContent.progressHistory.forbidden` «Нет доступа к истории прогресса.» / "You don't have access to the progress history.") | — | 401 (403 only on progress-history) |
| `developerRightsRequired` | 403 | `apiCommon.developerRightsRequired` «Нужны права разработчика.» / "Developer rights are required." | — | 401 |
| `invalidData` | 400 | endpoint-specific entry when one exists (listed per table), else `apiCommon.invalidData` «Некорректные данные.» / "Invalid data." | — | 400 |
| `rateLimited` | 429 | `apiCommon.rateLimited` «Слишком много запросов. Подождите немного и попробуйте снова.» / "Too many requests. Wait a moment and try again." (login: `login.rateLimitedFor` / `login.errors.rateLimited`; password change: `settings.notices.passwordRateLimited`; server-action limits of `04`: their `…rateLimited` copy) | `retryAfterSeconds` (always) | 429 + `Retry-After` on API routes; redirect code `rateLimited` in actions |
| `serviceUnavailable` | 503 | `apiCommon.serviceUnavailable` «Сервис временно недоступен. Попробуйте снова позже.» / "The service is temporarily unavailable. Try again later." | `retryAfterSeconds: 5` | 503 + `Retry-After: 5` (limiter store failed) |
| `migrationMissing` | 503 | `apiCommon.migrationMissing` «{what} ещё не создана в PostgreSQL. Сначала примените миграцию.» / "{what} hasn't been created in PostgreSQL yet. Apply the migration first." | `params.what` (`apiStudent.upload.photoTable`, `apiStudent.homeworkChecks.checkTable`, `apiStudent.lessonSubmissions.submissionTable`, `apiPlanner.homeworkIssue.homeworkTable`, `apiPlanner.homeworkIssue.deadlineColumn`); `details.deadlinesEnabled: false` where the site sends it | 503 |
| `saveFailed` | 500 | the endpoint's `…saveFailed` / `…save` entry (listed per table) | — | 500 on API routes; redirect code `save` / `{ ok: false }` in actions |
| `deleteFailed` | 500 | the endpoint's `…deleteFailed` / `…delete` entry | — | 500 / redirect code `delete`, `fileDelete`, `teacherDelete` |
| `internalError` | 500 | **[PROPOSAL]** `shells.errorTitle` «Раздел временно недоступен» / "This section is temporarily unavailable" — for an uncaught exception | — | uncaught `throw` → Next.js default 500 without a JSON body |

"Not found" has no single global code: each endpoint uses the entity code whose text the site already has —
`studentNotFound`, `topicNotFound`, `numberNotFound`, `homeworkNotFound`, `lessonNotFound`, `groupNotFound`,
`draftNotFound`, `studentOrNumberNotFound` (all keys of `dict.apiCommon`), `participantNotFound`,
`itemNotFound`, `photoNotFound`, `historyNotFound`, `fileNotFound`, `teacherNotFound`. All are HTTP 404.

## A.5 Naming rules and retired names

- **R1** lower camelCase.
- **R2** a global condition (A.4) always uses the global code, whatever dictionary entry supplies the text.
- **R3** an endpoint-specific condition uses the **leaf key of the site dictionary entry** that supplies its
  text (`apiPlanner.lessonItems.numbersRequired` → `numbersRequired`), or the site's own redirect code where
  the text is a page notice (`numbersTwin`, `deleteChanged`, `ownerInvalid`, `teacherTransfer`).
- **R4** qualified names where the leaf key alone is ambiguous or misleading:
  `disabled` → `checkDisabled`; `notActive` / `lessonNotActive` → `lessonNotActive`;
  `findNumber.notFound` → `numberNotFound`; `progressHistory.notFound` → `historyNotFound`;
  `invalid` (login) → `invalidCredentials`; upload validation leaves are grouped into the `upload*` class
  codes of A.8; `planErrors.unavailable` on an HTTP error → `plannerUnavailable` (its API dictionary key).

| Condition | Canonical code (HTTP) | Retired names → where |
|---|---|---|
| No valid session | `sessionExpired` (401) | `SESSION_EXPIRED` (`02`), `UNAUTHENTICATED` (`03`), `unauthorized` (401) (`05`, `06`) |
| Signed in, wrong role | `unauthorized` (403) | `FORBIDDEN` (`02`), `forbidden_role` (`06`), `forbidden` (`04` §6.4), "401 `SESSION_EXPIRED` otherwise" (`02` §6), "401 … also for non-students" (`01` §6.5), `unauthorized (401)` (`05`) |
| Signed in, not a developer | `developerRightsRequired` (403) | — (`07` already) |
| Rate limit | `rateLimited` (429) | `RATE_LIMITED` (`02`, `03`), `rate_limited` (`05`, `06`), `passwordRateLimited` (`01` §6.3) |
| Limiter store failure | `serviceUnavailable` (503) | `SERVICE_UNAVAILABLE`, `service_unavailable` |
| Undifferentiated bad input | `invalidData` (400) | `INVALID_DATA` (`02`), `VALIDATION` (`03`), `invalid_input` (`06`), `invalid` (`04`, `07`) |
| DB table / column missing | `migrationMissing` (503) | `FEATURE_UNAVAILABLE` (`03`), `unavailable` (`04` §6.3, §6.4) |
| Wrong login / password | `invalidCredentials` (401) | `invalid` (`01` §6.2) |
| Write failed | `saveFailed` (500) | `save_failed` (`06`), `save` (`04`, `07`), `infoSave`, `passwordSave` (`01`), `ownerSave` (`04`), `internal` (`05`, where the site text is a `saveFailed` entry) |
| Delete failed | `deleteFailed` (500) | `delete`, `teacherDelete` (`04`), `delete`, `fileDelete` (`07`), `internal` (`05`, where the site text is a `deleteFailed` entry) |
| AI check switched off | `checkDisabled` (503) | `CHECK_DISABLED`, `LESSON_CHECK_DISABLED` (`03`) |
| AI check queue / planner queue full | `queueFull` (503) | `CHECK_QUEUE_FULL` (`03`), `queue_full` (`05`) |
| One check already running | `alreadyRunning` (409) | `CHECK_ALREADY_RUNNING`, `SUBMISSION_ALREADY_RUNNING` (`03`) |
| Photo count over the limit | `photoLimit` (400) | `PHOTO_LIMIT_EXCEEDED`, `SUBMISSION_PHOTO_LIMIT` (`03`) |
| Lesson is not in progress | `lessonNotActive` (409) | `LESSON_NOT_ACTIVE` (`03`), `not_active` (`05`) |
| Lesson item missing | `itemNotFound` (404) | `LESSON_ITEM_NOT_FOUND` (`03`), `item_not_found` (`05`) |
| Entity missing / not owned | entity code (404), A.4 note | `not_found` (`06`), `notFound` (`04` §6.4), `deleteMissing`, `missing` (`04` §6.1, §6.7), `teacherMissing` (`04` §6.7) |

`CheckErrorCode` of `03` §6 (`"interrupted" | "disabled" | "timeout" | "quota" | "unavailable" | "queue" |
"image" | "unknown"`) and `PlanErrorCode` are **field values of successful responses** (`errorCode` of a
`FAILED` check, `planError` of a participant), not envelope codes; they already satisfy R1 and are unchanged.

## A.6 Regenerated: `02-student-study.md` §6

**CORRECTION to `02-student-study.md` §6 (error envelope block):** the code union is replaced by:

```ts
type StudentStudyErrorCode =
  | "sessionExpired"        // 401
  | "unauthorized"          // 403 — signed in, role is not STUDENT
  | "statusReadOnly"        // 403 — note endpoint called with a `status` key
  | "invalidData"           // 400
  | "invalidNumber"         // 400
  | "numberNotFound"        // 404
  | "fileNotFound"          // 404 (missing or not permitted — indistinguishable by design)
  | "rateLimited"           // 429 (+ Retry-After, retryAfterSeconds)
  | "serviceUnavailable";   // 503 (retryAfterSeconds 5)
```

**CORRECTION to `02-student-study.md` §6:** "All endpoints below require role STUDENT (401 `SESSION_EXPIRED`
otherwise)" → no session: `401 sessionExpired`; signed-in TEACHER / DEVELOPER: `403 unauthorized`. (The
site's `401 sessionExpired` for non-students, `02` §0.2 / §3, stays a correct description of the **site**.)

| Old (`02`) | New | HTTP | Message |
|---|---|---|---|
| `SESSION_EXPIRED` | `sessionExpired` | 401 | `apiCommon.sessionExpired` |
| `FORBIDDEN` | `unauthorized` | 403 | `apiCommon.unauthorized` |
| `STATUS_READ_ONLY` | `statusReadOnly` | 403 | `apiStudent.topicStatus.statusReadOnly` «Статус выставляется автоматической проверкой или учителем.» / "The status is set by the automatic check or by the teacher." |
| `INVALID_DATA` | `invalidData` | 400 | `apiStudent.topicStatus.invalidData` «Некорректные данные для сохранения номера.» / "Invalid data for saving the problem." |
| `INVALID_NUMBER` | `invalidNumber` | 400 | `apiStudent.findNumber.invalidNumber` «Введите корректный номер.» / "Enter a valid problem number." |
| `NUMBER_NOT_FOUND` | `numberNotFound` | 404 | lookup + detail: `apiStudent.findNumber.notFound` «Такой номер не найден.» / "No such problem found."; note: `apiStudent.topicStatus.numberNotFound` «Номер задания для этой темы не найден.» / "Problem not found for this topic." |
| `FILE_NOT_FOUND` | `fileNotFound` | 404 | no site dictionary entry (site body is the plain text `Not found`) — **[PROPOSAL]** mobile overlay string, e.g. reuse `shells.notFoundTitle` |
| `RATE_LIMITED` | `rateLimited` | 429 | `apiCommon.rateLimited` |
| `SERVICE_UNAVAILABLE` | `serviceUnavailable` | 503 | `apiCommon.serviceUnavailable` |

Per endpoint (all also return the global `sessionExpired`, `unauthorized`, `rateLimited`,
`serviceUnavailable`):

| Endpoint (`02` §) | Specific errors | Rate limit (site value) |
|---|---|---|
| 6.1 `GET /student/home`, 6.2 `GET /student/homework-deadlines`, 6.4 `GET /student/theory` | — | none on the site (server-rendered); `02` suggests 120 / 60 s **[PROPOSAL]** |
| 6.3 `GET /student/streak` | — | `api:streak` 120 / 60 s |
| 6.5 `GET /student/numbers/lookup` | 400 `invalidNumber`, 404 `numberNotFound` | `api:student-find-number` 120 / 60 s |
| 6.6 `GET /student/numbers/{number}` | 400 `invalidNumber`, 404 `numberNotFound` | none on the site (page → `notFound()`) |
| 6.7 `PUT /student/numbers/{homeworkNumberId}/note` | 403 `statusReadOnly`, 400 `invalidData`, 404 `numberNotFound` | `api:student-status` 90 / 60 s |
| 6.8 `GET /files/{fileId}`, `POST /files/{fileId}/access-url` | 404 `fileNotFound` | `api:file-read` 120 / 60 s |
| 6.9 `GET /realtime` | 429 `tooManyConnections` (`apiStudent.realtime.tooManyConnections`, `retryAfterSeconds: 5`) | `api:realtime-connect` 30 / 60 s; 2 open streams per user |

## A.7 Regenerated: `03-student-homework-lesson.md` §6.6

**CORRECTION to `03-student-homework-lesson.md` §6.6:** the table is replaced by the one below. Every
endpoint of `03` §6 additionally returns `403 unauthorized` for a signed-in non-student (the old table had no
wrong-role row; the site answers `401 sessionExpired`).

| Code | HTTP | Site dictionary entry (message) | Extra fields | Replaces |
|---|---|---|---|---|
| `sessionExpired` | 401 | `apiCommon.sessionExpired` | — | `UNAUTHENTICATED` |
| `unauthorized` | 403 | `apiCommon.unauthorized` | — | (new row) |
| `rateLimited` | 429 | `apiCommon.rateLimited` — also the answer when the per-student hourly limit or the **global daily AI budget** is exhausted (the site uses the same `enforceApiRateLimit` response for all three) | `retryAfterSeconds` | `RATE_LIMITED` |
| `serviceUnavailable` | 503 | `apiCommon.serviceUnavailable` | `retryAfterSeconds: 5` | `SERVICE_UNAVAILABLE` |
| `migrationMissing` | 503 | `apiCommon.migrationMissing` | `params.what` | `FEATURE_UNAVAILABLE` |
| `invalidData` | 400 | `apiCommon.invalidData` (check status / lesson join / lesson state without an id), `apiStudent.homeworkChecks.invalidData`, `apiStudent.homeworkSubmissions.invalidDeleteData`, `apiStudent.topicStatus.invalidData` | — | `VALIDATION` |
| `homeworkNotFound` | 404 | `apiCommon.homeworkNotFound` | — | `HOMEWORK_NOT_FOUND` |
| `photoNotFound` | 404 | `apiStudent.homeworkSubmissions.photoNotFound` | — | `PHOTO_NOT_FOUND` |
| `photoLimit` | 400 | homework: `apiStudent.homeworkSubmissions.photoLimit` «К одному ДЗ можно прикрепить не больше {count}.»; lesson item: `apiStudent.lessonSubmissions.photoLimit` «К одному номеру можно прикрепить не больше {count}.» — `{count}` = `plural(locale, max, apiStudent.upload.photoCount)` | `params.max` (`maxPhotosPerAssignment` setting, default 10; lesson item: `LESSON_SUBMISSION_MAX_PHOTOS = 3`) | `PHOTO_LIMIT_EXCEEDED`, `SUBMISSION_PHOTO_LIMIT` |
| `concurrentChange` | 409 | `apiStudent.homeworkSubmissions.concurrentChange`, `apiStudent.lessonSubmissions.concurrentChange` | — | `CONCURRENT_CHANGE` |
| `uploadInvalid` | 400 | `apiStudent.upload.invalidPhotoData`, `contentLengthInvalid` | — | `UPLOAD_INVALID` |
| `uploadNotMultipart` | 415 | `apiStudent.upload.multipartExpected` | — | `UPLOAD_NOT_MULTIPART` |
| `uploadLengthRequired` | 411 | `apiStudent.upload.contentLengthRequired` (site: homework route only; the lesson route answers 400 `contentLengthInvalid` for a missing header) | — | `UPLOAD_LENGTH_REQUIRED` |
| `uploadTooLarge` | 413 | `apiStudent.upload.bodyTooLarge`, `photosTooLarge` (site 413); `topics.lib.upload.tooBig` (**site answers 400** for this per-file case — 413 is a **[PROPOSAL]**) | — | `UPLOAD_TOO_LARGE` |
| `uploadUnsupportedType` | 400 | `apiStudent.upload.onlyPngOrJpg`, `topics.lib.upload.extension`, `mimeMismatch`, `signature` | — | `UPLOAD_UNSUPPORTED_TYPE` |
| `uploadBadName` | 400 | `topics.lib.upload.nameTooLong` (`{max}` = 255), `badChars` | `params.max` for `nameTooLong` | `UPLOAD_BAD_NAME` |
| `uploadRejected` | 400 | `apiStudent.upload.fileRejected`, `topics.lib.upload.emptySize`, `sizeMismatch` | — | `UPLOAD_REJECTED` |
| `queueFull` | 503 | `apiStudent.homeworkChecks.queueFull`, `apiStudent.lessonSubmissions.queueFull` (queue length ≥ `MAX_CHECK_QUEUE = 60`) | `retryAfterSeconds: 120` | `CHECK_QUEUE_FULL` |
| `checkDisabled` | 503 | homework: `apiStudent.homeworkChecks.disabled`; lesson: `apiStudent.lessonSubmissions.disabled` | — | `CHECK_DISABLED`, `LESSON_CHECK_DISABLED` |
| `attachPhotosFirst` | 400 | `apiStudent.homeworkChecks.attachPhotosFirst` | — | `CHECK_NO_PHOTOS` |
| `noNumbers` | 400 | `apiStudent.homeworkChecks.noNumbers` | — | `CHECK_NO_NUMBERS` |
| `alreadyRunning` | 409 | `apiStudent.homeworkChecks.alreadyRunning`, `apiStudent.lessonSubmissions.alreadyRunning` | — | `CHECK_ALREADY_RUNNING`, `SUBMISSION_ALREADY_RUNNING` |
| `photosChanged` | 409 | `apiStudent.homeworkChecks.photosChanged` | — | `CHECK_PHOTOS_CHANGED` |
| `statusReadOnly` | 403 | `apiStudent.topicStatus.statusReadOnly` | — | `STATUS_READ_ONLY` |
| `numberNotFound` | 404 | `apiStudent.topicStatus.numberNotFound`, `apiStudent.findNumber.notFound` | — | `NUMBER_NOT_FOUND` |
| `invalidNumber` | 400 | `apiStudent.findNumber.invalidNumber` | — | `INVALID_NUMBER` |
| `lessonNotFound` | 404 | `apiCommon.lessonNotFound` | — | `LESSON_NOT_FOUND` |
| `lessonNotActive` | 409 | join: `apiStudent.lesson.notActive`; submit: `apiStudent.lessonSubmissions.lessonNotActive` | — | `LESSON_NOT_ACTIVE` |
| `itemNotFound` | 404 | `apiStudent.lessonSubmissions.itemNotFound` | — | `LESSON_ITEM_NOT_FOUND` |
| `alreadyAccepted` | 409 | `apiStudent.lessonSubmissions.alreadyAccepted` «№ {number} уже принят.» / "Problem {number} has already been accepted." | `params.number` | `ITEM_ALREADY_ACCEPTED` |
| `extraPartLocked` | 409 | `apiStudent.lessonSubmissions.extraPartLocked` | — | `EXTRA_PART_LOCKED` |

The endpoint tables of `03` §6.1 / §6.2 keep their meaning; read each old name through the "Replaces" column
(`UPLOAD_*` → the seven `upload*` codes; `PHOTO_LIMIT_EXCEEDED {max}` and `SUBMISSION_PHOTO_LIMIT {max: 3}` →
`photoLimit` with `params.max`; `ITEM_ALREADY_ACCEPTED {number}` → `alreadyAccepted` with `params.number`).

## A.8 Shared upload codes (used by `03`, `07`, `09`)

The seven `upload*` class codes of A.7 apply to **every** upload endpoint, because all of them run the same
`validateUploadMetadata` / `saveUploadedFile` checks (`lib/upload-validation.ts`): student homework photos,
lesson submissions and the developer's `POST /uploads`. Developer upload adds `fileRequired` (400,
`apiContent.uploads.fileRequired`) and `uploadFailed` (500, `apiContent.uploads.uploadFailed`).

**CORRECTION to `07-developer-content.md` §6.5:** `400 fileRequired | uploadInvalid (message = validation
text)` → `400 fileRequired | uploadUnsupportedType | uploadBadName | uploadRejected`, `413 uploadTooLarge`.

**CORRECTION to `09-data-i18n-math.md` Appendix C (`POST /uploads`):** `400 { error: dict.topics.lib.upload.*
| dict.apiContent.uploads.fileRequired }, 401, 413, 429` → envelope with the codes above; a signed-in
non-developer gets `403 developerRightsRequired`, not 401.

## A.9 Regenerated: `05-teacher-lessons-plans.md` §6

**CORRECTION to `05-teacher-lessons-plans.md` §6:** the envelope `{ error: { code: string; message: string } }`
gains `retryAfterSeconds?`, `params?`, `details?` (A.2), and the paragraph "Error codes used by this
subsystem: …" is replaced by this table. `unauthorized (401)` in that paragraph is wrong under the unified
rule: no session → `401 sessionExpired`; signed-in STUDENT → `403 unauthorized`.

| Code | HTTP | Site dictionary entry (message) | Extra fields | Endpoints (`05` §6 paths) | Replaces |
|---|---|---|---|---|---|
| `sessionExpired` | 401 | `apiCommon.sessionExpired` | — | all | `unauthorized` (401) |
| `unauthorized` | 403 | `apiCommon.unauthorized` | — | all (role ∉ {TEACHER, DEVELOPER}) | — |
| `rateLimited` | 429 | `apiCommon.rateLimited` | `retryAfterSeconds` | all rate-limited routes (`05` §3) | `rate_limited` |
| `serviceUnavailable` | 503 | `apiCommon.serviceUnavailable` | `retryAfterSeconds: 5` | same | `service_unavailable` |
| `lessonNotFound` | 404 | `apiCommon.lessonNotFound` | — | `GET/PATCH/DELETE /teacher/lessons/{id}`, `/status`, `/live`, `/finish`, `/handout` | `lesson_not_found` |
| `draftNotFound` | 404 | `apiCommon.draftNotFound` | — | `GET/DELETE /teacher/homework-plans/{id}`, `/status`, `/issue` | `draft_not_found` |
| `groupNotFound` | 404 | `apiCommon.groupNotFound` | — | `POST /teacher/lessons`, `POST /teacher/homework-plans` | `group_not_found` |
| `topicNotFound` | 404 | `apiCommon.topicNotFound` | — | `POST /teacher/homework-plans` | `topic_not_found` |
| `participantNotFound` | 404 | items / regenerate: `apiPlanner.lessonItems.participantNotFound` «Участник урока не найден.»; attendance: `apiPlanner.attendance.participantNotFound` «Участник занятия не найден.» | — | `…/participants/{pid}/items`, `/regenerate`, `/attendance` | `participant_not_found` |
| `itemNotFound` | 404 | `apiPlanner.lessonResult.itemNotFound` «Задача урока не найдена.» | — | `…/items/{itemId}/result` | `item_not_found` |
| `selectAtLeastOneStudent` | 400 | `apiPlanner.lessons.selectAtLeastOneStudent` | — | `POST /teacher/lessons`, `POST /teacher/homework-plans` | `select_student` |
| `tooManyStudents` | 400 | lesson: `apiPlanner.lessons.tooManyStudents` «Не больше {max} учеников за один урок.»; draft: `apiPlanner.homeworkPlans.tooManyStudents` «Не больше {max} учеников за раз.» | `params.max` = `MAX_GROUP_SIZE` = 30 | same two | `too_many_students` |
| `invalidStartsAt` | 400 | `apiPlanner.lessons.invalidStartsAt` | — | `POST /teacher/lessons`, `PATCH /teacher/lessons/{id}` | `invalid_starts_at` |
| `numbersRequired` | 400 | `apiPlanner.lessonItems.numbersRequired` | — | `PUT …/participants/{pid}/items` (lesson and draft) | `numbers_required` |
| `invalidResult` | 400 | `apiPlanner.lessonResult.invalidResult` | — | `PATCH …/items/{itemId}/result` | `invalid_result` |
| `invalidMark` | 400 | `apiPlanner.attendance.invalidMark` «Некорректная отметка.» / "Invalid attendance mark." | — | `PATCH …/participants/{pid}/attendance` | `invalid_attendance` |
| `topicAndDeadlineRequired` | 400 | `apiPlanner.homeworkPlans.topicAndDeadlineRequired` | — | `POST /teacher/homework-plans` | `topic_and_deadline_required` |
| `missingTopicOrDeadline` | 400 | `apiPlanner.homeworkPlanIssue.missingTopicOrDeadline` | — | `POST /teacher/homework-plans/{id}/issue` | `draft_missing_topic_or_deadline` |
| `deadlinePassed` | 400 | `apiPlanner.homeworkPlanIssue.deadlinePassed` | — | same | `deadline_passed` |
| `alreadyFinished` | 409 | `apiPlanner.lesson.alreadyFinished` | — | `PATCH /teacher/lessons/{id}` | `already_finished` |
| `alreadyClosed` | 409 | `apiPlanner.lesson.alreadyClosed` | — | same | `already_closed` |
| `lessonNotActive` | 409 | `apiPlanner.lessonFinish.notActive` «Урок сейчас не идёт — завершать нечего.» | — | `POST /teacher/lessons/{id}/finish` | `not_active` |
| `homeworkAlreadyIssued` | 409 | `apiPlanner.lessonItems.homeworkAlreadyIssued` | — | `PUT …/items`, `POST …/regenerate` | `homework_already_issued` |
| `blockedNumbers` | 409 | `apiPlanner.lessonItems.blockedNumbers` «Нельзя убрать номер, по которому ученик уже сдавал решение: {numbers}.» | `params.numbers` (comma-joined, as the site formats it) + `details.numbers: string[]` | `PUT …/items` | `blocked_numbers` |
| `plannerUnavailable` | 503 | `apiPlanner.lessons.plannerUnavailable` | — | `POST …/regenerate` only (on create the mobile contract returns `201 … plan: "unavailable"`, `05` §6) | `planner_unavailable` |
| `budgetExhausted` | 429 | `planner.planErrors.budgetExhausted` | no `retryAfterSeconds` (site sends no `Retry-After`) | `POST …/regenerate` | `budget_exhausted` |
| `queueFull` | 503 | `planner.planErrors.queueFull` | — | `POST …/regenerate` | `queue_full` |
| `noHomeworkHandout` | 404 | `apiPlanner.lessons.noHomeworkHandout` | — | `GET /teacher/lessons/{id}/handout` | `no_homework_handout` |
| `createFailed` | 500 | lesson: `apiPlanner.lessons.createFailed`; draft: `apiPlanner.homeworkPlans.createFailed` | — | the two `POST` creates | `internal` |
| `scheduleFailed` | 500 | `apiPlanner.lesson.scheduleFailed` | — | `PATCH /teacher/lessons/{id}` | `internal` |
| `finishFailed` | 500 | `apiPlanner.lessonFinish.finishFailed` | — | `POST …/finish` | `internal` |
| `saveFailed` | 500 | `apiPlanner.lessonItems.saveFailed`, `apiPlanner.lessonResult.saveFailed`, `apiPlanner.attendance.saveFailed` | — | items, result, attendance | `internal` |
| `deleteFailed` | 500 | `apiPlanner.lesson.deleteFailed`, `apiPlanner.homeworkPlans.deleteFailed` | — | the two `DELETE`s | `internal` |

Per-participant failures inside the **200** body of `POST /teacher/homework-plans/{planId}/issue`
(`failed[].code`; on the site `failed[]` carries only `message` — the codes are a **[PROPOSAL]** of `05`,
renamed here):

| Old (`05`) | New | Message (site) | Extra |
|---|---|---|---|
| `empty_set` | `emptySet` | `apiPlanner.homeworkPlanIssue.emptySet` | — |
| `solved_conflict` | `solvedConflict` | `apiPlanner.homeworkIssue.solvedConflictOne` / `solvedConflictMany` (`{numbers}`) | `conflictNumbers: string[]` |
| `not_found` | `studentOrNumberNotFound` | `apiCommon.studentOrNumberNotFound` | — |
| `invalid` | `invalidData` | `apiPlanner.homeworkIssue.invalidData` | — |
| `internal` | `internalError` | `apiPlanner.homeworkPlanIssue.internalError`; a missing table/column surfaces as `migrationMissing` (`apiCommon.migrationMissing`) | — |

## A.10 Regenerated: `06-teacher-groups-calls-stats.md` §6

**CORRECTION to `06-teacher-groups-calls-stats.md` §6:** the envelope gains `retryAfterSeconds?`, `params?`,
`details?` (A.2); the sentence "Common codes: `unauthorized` (401), `forbidden_role` (403 — the site answers
401 for a wrong role; either is acceptable, pick one consistently), `not_found` (404), `invalid_input` (400),
`rate_limited` (429 + `Retry-After`), `service_unavailable` (503), `save_failed` (500)" is replaced by:
`sessionExpired` (401), `unauthorized` (403), `developerRightsRequired` (403, §6.5 statistics), entity
not-found codes (404), `invalidData` (400), `rateLimited` (429 + `Retry-After` + `retryAfterSeconds`),
`serviceUnavailable` (503), `saveFailed` (500). "Either is acceptable" is withdrawn: wrong role is **403**.

| Endpoint (`06` §) | Code | HTTP | Message (site dictionary / notice) | Site today |
|---|---|---|---|---|
| 6.1 `POST /teacher/groups` | `invalidData` | 400 | `planner.groups.list.notices.invalid` «Проверьте название группы (до 120 символов) и класс (1–11).» | redirect `?groupError=invalid` (only for an empty name; an invalid grade is silently stored as `null`) |
| | `unauthorized` | 403 | `apiCommon.unauthorized` — DEVELOPER may not create groups | `requireUser(TEACHER)` redirects the developer to `/developer/topics` |
| | `saveFailed` | 500 | `planner.groups.list.notices.save` | redirect `?groupError=save` |
| 6.1 `PATCH /teacher/groups/{id}` | `invalidData` | 400 | `planner.groups.list.notices.invalid` (the site redirects to the **list** page for this case; `planner.groups.detail.notices.invalid` «Проверьте заполнение формы.» exists but no action redirects to the detail page with `invalid`) | `{base}?groupError=invalid` |
| | `groupNotFound` | 404 | `planner.groups.list.notices.missing` «Группа не найдена — возможно, её уже удалили.» (or `apiCommon.groupNotFound`) | `?groupError=missing` |
| | `saveFailed` | 500 | `planner.groups.detail.notices.save` | `?groupError=save` |
| 6.1 `DELETE /teacher/groups/{id}` | `groupNotFound` | 404 | as above | `?groupError=missing` |
| | `deleteFailed` | 500 | `planner.groups.list.notices.save` (the site has no separate delete text) | `?groupError=save` |
| 6.1 `POST /teacher/groups/{id}/members` | `groupNotFound` / `studentNotFound` | 404 | `apiCommon.groupNotFound` / `apiCommon.studentNotFound` | `{ ok: false }` — no code, no text |
| | `saveFailed` | 500 | `planner.groups.detail.notices.save` | `{ ok: false }` |
| 6.1 `DELETE /teacher/groups/{id}/members/{studentId}` | `groupNotFound` | 404 | `apiCommon.groupNotFound` | `{ ok: false }` |
| | `saveFailed` | 500 | `planner.groups.detail.notices.save` | `{ ok: false }` |
| 6.1 `PATCH /teacher/students/{id}/ai-profile` | `invalidData` | 400 | `apiCommon.invalidData` — **[PROPOSAL]** of `06` for `speed` outside 1..10 | site stores `null` silently |
| | `studentNotFound` | 404 | `apiCommon.studentNotFound` | `{ ok: false }` |
| | `saveFailed` | 500 | `planner.groups.detail.notices.save` | `{ ok: false }` |
| 6.1 – 6.3 reads (`GET /teacher/groups`, `/{id}`, `/statistics`, `/attendance`) | `groupNotFound` | 404 | `apiCommon.groupNotFound` | page → `notFound()` |
| 6.3 `PATCH …/participants/{pid}/attendance` | `invalidMark` | 400 | `apiPlanner.attendance.invalidMark` | 400 |
| | `participantNotFound` | 404 | `apiPlanner.attendance.participantNotFound` | 404 |
| | `saveFailed` | 500 | `apiPlanner.attendance.saveFailed` | 500 |
| | `rateLimited` | 429 | `apiCommon.rateLimited` (`api:lesson-attendance` 240 / 60 s) | 429 |
| 6.3 `GET …/attendance.pdf` | `groupNotFound` | 404 | `apiCommon.groupNotFound` | plain text `Group not found` |
| | `rateLimited` | 429 | `apiCommon.rateLimited` (`api:pdf-export` 5 / 5 min, shared with the student report) | 429 JSON |
| | `exportFailed` | 500 | no site dictionary entry (plain text `Export failed`) — **[PROPOSAL]** mobile overlay string | 500 plain text |
| 6.4 `GET /teacher/parent-calls`, `/counts` | — (global only) | | | server-rendered |
| 6.4 `GET …/students/{id}/history` | `studentRequired` | 400 | `apiPlanner.parentCalls.studentRequired` (site: missing `studentId` query; unreachable with the path form) | 400 |
| | `studentNotFound` | 404 | `apiCommon.studentNotFound` | 404 |
| 6.4 `POST /teacher/parent-calls` | `studentRequired` | 400 | `apiPlanner.parentCalls.studentRequired` «Укажите ученика.» | 400 |
| | `outcomeRequired` | 400 | `apiPlanner.parentCalls.outcomeRequired` «Укажите исход звонка.» | 400 |
| | `studentNotFound` | 404 | `apiCommon.studentNotFound` | 404 |
| | `unauthorized` | 403 | `apiCommon.unauthorized` — DEVELOPER is read-only | 401 |
| | `saveFailed` | 500 | `apiPlanner.parentCalls.saveFailed` | 500 |
| | `rateLimited` | 429 | `apiCommon.rateLimited` (`api:parent-calls` 60 / 60 s) | 429 |
| 6.5 all `GET /developer/statistics/*` | `developerRightsRequired` | 403 | `apiCommon.developerRightsRequired` | drilldown: 401; page: `requireUser(DEVELOPER)` redirect |
| 6.5 `GET /developer/statistics/drilldown` | `paramsRequired` | 400 | `apiContent.statistics.paramsRequired` | 400 |
| | `studentNotFound` | 404 | `apiCommon.studentNotFound` | 404 |
| | `loadFailed` | 500 | `apiContent.statistics.loadFailed` | 500 |
| | `rateLimited` | 429 | `apiCommon.rateLimited` (`api:statistics-drilldown` 120 / 60 s) | 429 |

The inline comments of `06` §6.3 / §6.4 (`400 invalid_input ("Некорректная отметка.")`, `404 not_found
("Участник занятия не найден.")`, `500 save_failed`, `400 invalid_input: "Укажите ученика." / "Укажите исход
звонка."`) map to the rows above.

## A.11 Corrections to the specs that already use camelCase

**CORRECTION to `01-shell-auth.md` §6 (envelope):** add `params?` and `details?` (A.2).

**CORRECTION to `01-shell-auth.md` §6.2:** `401 → code "invalid"` → `401 invalidCredentials`
(`login.errors.invalid`); it is the only 401 that is not `sessionExpired`. `empty` (400), `rateLimited` (429)
and `database` (503) are unchanged.

**CORRECTION to `01-shell-auth.md` §6.3:** `429 passwordRateLimited` → `429 rateLimited` (message
`settings.notices.passwordRateLimited`, `retryAfterSeconds` from the `profile:password-update` window, 5 per
15 min); `500 infoSave` and `500 passwordSave` → `500 saveFailed` (messages `settings.notices.infoSave` /
`passwordSave`). `infoInvalid`, `passwordInvalid`, `passwordMismatch` (400) and `passwordCurrent` (403) are
unchanged.

**CORRECTION to `01-shell-auth.md` §6.5:** "401 → sessionExpired (also for non-students, as on the site)" →
no session: `401 sessionExpired`; signed-in non-student: `403 unauthorized`.

**CORRECTION to `01-shell-auth.md` §4.1 (mobile consequence):** "any API call may return 401 at any time →
clear the stored token and go to Login" stays true **only** because of rule A.1.3; the trigger is
`code === "sessionExpired"`, not the bare status (login's 401 `invalidCredentials` must not clear anything).

**CORRECTION to `04-teacher-students.md` §6** (codes renamed; statuses unchanged unless stated):

| Where | Old | New |
|---|---|---|
| §6.1 create student, §6.1 reset password, §6.3 issue homework, §6.4 status / deadlines, §6.7 create account / reset teacher password | `400 invalid` | `400 invalidData` |
| §6.1 delete student | `404 deleteMissing` · `500 delete` | `404 studentNotFound` · `500 deleteFailed` |
| §6.1 reset student password | `404 missing` · `500 save` | `404 studentNotFound` · `500 saveFailed` |
| §6.1 create student, §6.7 create account | `500 save` | `500 saveFailed` |
| §6.3 `POST /teacher/homeworks`, `DELETE …`, §6.4 `PUT …/deadlines` | `503 unavailable` | `503 migrationMissing` (`params.what`; `details.deadlinesEnabled: false` when the `deadlineAt` column is missing) |
| §6.4 progress history | `403 forbidden` · `404 notFound` | `403 unauthorized` (message `apiContent.progressHistory.forbidden`) · `404 historyNotFound` (`apiContent.progressHistory.notFound`); no session → `401 sessionExpired` (the site answers 403) |
| §6.5 regenerate | `503 plannerUnavailable \| queueFull`, `429 budgetExhausted` | unchanged (already canonical) |
| §6.7 owners | `500 ownerSave` | `500 saveFailed` (`ownerInvalid` 400 unchanged) |
| §6.7 reset teacher password | `404 missing` · `500 save` | `404 teacherNotFound` · `500 saveFailed` |
| §6.7 delete teacher, create account | `404 teacherMissing` · `500 teacherDelete` | `404 teacherNotFound` · `500 deleteFailed` (`409 teacherTransfer` unchanged) |
| §6 intro, TEACHER-only endpoints called by a DEVELOPER (`…/numbers/{id}/status`, `…/deadlines`) | not stated | `403 unauthorized` (site: 401) |

`409 exists`, `409 solvedConflict` (`details.conflictNumbers`), `409 homeworkAlreadyIssued`,
`409 blockedNumbers` (`details.numbers`), `400 numbersRequired`, `400 invalidResult`, `400 paramsRequired`,
`400 tooManyStudents`, `404 studentOrNumberNotFound`, `404 homeworkNotFound`, `404 participantNotFound`,
`404 itemNotFound`, `503 reportsBusy` (`retryAfterSeconds: 30`), `500 exportFailed` stay as written.

**CORRECTION to `07-developer-content.md` §6** (and to the code list in its §7 item 7):

| Where | Old | New |
|---|---|---|
| §6.2 `PATCH /topics/{id}` | `400 invalid` · `500 save` | `400 invalidData` · `500 saveFailed` |
| §6.2 `DELETE /topics/{id}/files/{kind}` | `500 fileDelete` | `500 deleteFailed` |
| §6.2 `DELETE /topics/{id}` | `500 delete` | `500 deleteFailed` |
| §6.2 `PATCH /topics/{id}` upload failure (site redirect code `upload`) | `upload` | `uploadFailed`, or the `upload*` class code when the cause is a validation error (A.8) |
| §6.5 `POST /uploads` | `400 uploadInvalid` | A.8 |
| §6.6 `PUT /developer/settings` | `500 … (code "settingsFailed")` | `500 saveFailed` (message = the audit template `developer.settings_failed` that `saveSiteSettingsAction` returns with `ok: false`) |
| §6.7 `GET /progress-history` | (refers to `04`) | as corrected for `04` §6.4 |

`formInvalid`, `filesUnavailable`, `emptyNumbers`, `numbersTwin`, `numbersConfirm`, `numbersAssigned`,
`deleteChanged`, `listChanged`, `invalidRequest`, `latexRequired`, `topicMissing`, `importInvalid`,
`topicDeleted`, `fileTooBig`, `createFailed`, `writeFailed`, `fileRequired`, `uploadFailed`, `saveFailed`,
`deleteFailed`, `topicNotFound`, `numberNotFound` stay as written. `403 developerRightsRequired` /
`403 unauthorized` in the §6 intro is already the unified rule.

**CORRECTION to `08-design-system.md` §14:** "Error payloads are `{ error: string }` with an already-localised
message" describes the **site**. The mobile contract uses the envelope of A.2; the app shows
`error.message` in the error notice. `400 { error: "invalid_preferences" }` (optional preferences endpoint)
→ `400 { error: { code: "invalidData", message } }`.

**CORRECTION to `09-data-i18n-math.md` Appendix C:** "Errors: HTTP status + `{ "error": string /* localized
*/, "code"?: string }`" → the envelope of A.2 (`code` is mandatory, not optional). File routes:
`401 { error }, 404 { error }, 429 { error } + Retry-After, 503 { error } + Retry-After` →
`401 sessionExpired`, `404 fileNotFound`, `429 rateLimited`, `503 serviceUnavailable`, all in the envelope.

---

# Part B — "Do not touch the site" vs the proposed `/api/mobile/v1` (gap 2)

## B.0 What the constraint means — facts from the code

1. **`/api/mobile/v1` does not exist.** Nothing under `app/` matches that path; every spec's §6 is a proposal.
2. **The only credential the site accepts is the `tutor_session` cookie.** `getCurrentUser()` reads
   `cookies().get("tutor_session")` and nothing else; there is no `Authorization` / bearer handling anywhere in
   `app/`, `lib/`, `actions/` or `middleware.ts`. The cookie value is the raw session token
   (`createSessionToken()` = 32 random bytes hex); the `Session` row stores `sha256(token)` hex
   (`hashSessionToken`), `userId`, `expiresAt` (`SESSION_TTL_DAYS`, default 30).
3. **A session can only be created by the server action `loginAction`.** `signIn()` has exactly one caller
   (`actions/auth.ts`); `signOut()` and `updatePasswordAndRotateSession()` likewise have one caller each
   (`logoutAction`, `updatePasswordAction`). There is no JSON login, logout or password route.
4. **Server actions are not an HTTP contract.** Every file in `actions/` starts with `"use server"`; the
   functions take `FormData` (or a string) and finish with `redirect("…?code")` or a returned object.
   **[FRAMEWORK]** Next.js exposes them only through its internal form/RPC protocol with build-generated
   action ids, which is not a stable interface a native client can call.
5. **Reads behind pages have no route.** Pages are server components that call `lib/platform-data.ts` readers
   (or Prisma directly) and render HTML; table C lists them.
6. **Existing JSON routes need no browser.** No handler checks `Origin`, `Referer`, `Sec-Fetch-*` or a CSRF
   token (no such check exists in `app/api`, `app/files`, `lib`, `middleware.ts`), and `middleware.ts` matches
   only `/dashboard`, `/student`, `/teacher`, `/developer` — `/api/**` and `/files/**` authenticate
   themselves. A request with `Cookie: tutor_session=<token>` is accepted from any client.
7. **Language on existing routes is the `shbz-lang` cookie**, not `Accept-Language` (A.0.1). A native client
   of the existing routes must send `Cookie: shbz-lang=en` to get English texts and English AI output.
8. **PDF / print routes live under `/teacher/**`, so the middleware applies to them:** without a
   `tutor_session` cookie the answer is a redirect to `/login` (not 401), and with cookie `tutor_role=DEVELOPER` a
   `/teacher/...` URL is redirected to `/developer/...` (rewritten back to `/teacher/...` by `next.config.ts`).
9. **Several pieces of state live in the memory of the site's Node process** (`global.__…__`): the AI check
   queue (`lib/solution-check-queue.ts`), the AI plan queue (`lib/lesson-plan-queue.ts`; resumed only once at
   boot by `instrumentation.ts`), the realtime pub/sub and its per-user connection counter
   (`lib/dashboard-realtime.ts`), the sliding-window limiter used by login / student creation / password
   resets (`lib/rate-limit.ts`). A second process cannot enqueue a check, start a plan generation, publish a
   realtime event or share those limits.
10. **Site reads are cached** with `unstable_cache` (TTL `PLATFORM_CACHE_REVALIDATE_SECONDS = 60`; 300 s for
    the progress timeline; 15 s for the homework readers) and invalidated by `revalidateTag` /
    `revalidatePath` **inside the site process**. A write made by another process straight into Postgres is
    seen by site users only after the TTL.

Consequence: under a strict reading of "do not touch the site", **the app can ship with mocks only**. The 53
existing handlers (table A) are technically callable, but the session they need can only be obtained through
(b). Anything beyond mocks requires one of the decisions of §B.6.

## B.1 Categories

| Cat. | Meaning | Usable by a native client with the site unchanged? |
|---|---|---|
| **(a)** | An existing JSON / binary route handler | Yes, once the client holds a `tutor_session` cookie value: send `Cookie: tutor_session=…; shbz-lang=ru|en`. Errors are `{ error: string }` / plain text without codes (A.0) |
| **(a′)** | Existing route covers the write or part of the read, but the proposed mobile response needs more than it returns | Partly — the missing part is (c) |
| **(b)** | Server action only | No (B.0.4) |
| **(c)** | Server-rendered only (page / layout calls a reader; no JSON route) | No |
| **(d)** | Does not exist on the site in any form (new capability proposed by a spec) | No |

## B.2 Table A — every existing route handler (category (a)): 53 handlers in 43 `route.ts` files

"Auth fail" = the site's answer when the session is missing **or** the role is wrong (A.0.2).
Rate limits are per user unless stated; all are Postgres fixed windows (`enforceApiRateLimit`), shared with the
same user's browser sessions.

| ID | Method + path | Roles | Rate limit (scope: limit / window) | Auth fail on the site |
|---|---|---|---|---|
| A1 | `GET /api/notifications` | any signed-in | none | 401 `sessionExpired` |
| A2 | `POST /api/notifications` | any signed-in | none | 401 `sessionExpired` |
| A3 | `GET /api/realtime` (SSE) | any signed-in | `api:realtime-connect` 30 / 60 s; max 2 open streams per user (in-memory) | 401 plain text |
| A4 | `GET /files/{fileId}` (`?download=1`, `?thumb=1`) | any signed-in + `canAccessStoredFile` / photo ownership | `api:file-read` 120 / 60 s | 401 plain `Unauthorized`; 404 plain `Not found` |
| A5 | `GET /api/student/notifications` | STUDENT | `api:notifications` 60 / 60 s (shared with A6) | 401 `sessionExpired` |
| A6 | `POST /api/student/notifications` | STUDENT | same bucket | 401 `sessionExpired` |
| A7 | `GET /api/student/streak` | STUDENT | `api:streak` 120 / 60 s | 401 `sessionExpired` |
| A8 | `GET /api/student/homeworks/find-number?number=` | STUDENT | `api:student-find-number` 120 / 60 s | 401 `sessionExpired` |
| A9 | `POST /api/student/topic-status` | STUDENT | `api:student-status` 90 / 60 s | 401 `sessionExpired` |
| A10 | `POST /api/student/homework-submissions` (multipart) | STUDENT | `api:homework-submissions` 60 / 60 s (shared with A11) | 401 `sessionExpired` |
| A11 | `DELETE /api/student/homework-submissions` | STUDENT | same bucket | 401 `sessionExpired` |
| A12 | `POST /api/student/homework-checks` | STUDENT | `api:homework-checks` `aiPerStudentHourlyLimit` / 1 h, then the global daily AI budget (`aiDailyLimit`) | 401 `sessionExpired` |
| A13 | `GET /api/student/homework-checks?assignmentId=[&consume=1]` | STUDENT | `api:homework-check-status` 120 / 60 s | 401 `sessionExpired` |
| A14 | `POST /api/student/lesson` (join) | STUDENT | `api:lesson-join` 30 / 60 s | 401 `sessionExpired` |
| A15 | `POST /api/student/lesson-submissions` (multipart) | STUDENT | `api:lesson-checks` `lessonCheckPerStudentHourlyLimit` / 1 h, then the lesson daily budget (`lessonCheckDailyLimit`) | 401 `sessionExpired` |
| A16 | `GET /api/student/lesson-submissions?lessonId=[&consume=1]` | STUDENT | `api:lesson-check-status` 120 / 60 s | 401 `sessionExpired` |
| A17 | `POST /api/teacher/homeworks` | TEACHER (own student), DEVELOPER | `api:teacher-homeworks` 120 / 60 s (shared with A18) | 401 `unauthorized` |
| A18 | `DELETE /api/teacher/homeworks` (JSON body) | TEACHER, DEVELOPER | same bucket | 401 `unauthorized` |
| A19 | `POST /api/teacher/number-status` | **TEACHER only** | `api:teacher-number-status` 240 / 60 s | 401 `unauthorized` |
| A20 | `POST /api/teacher/student-deadlines` | **TEACHER only** | `api:student-deadlines` 240 / 60 s | 401 `unauthorized` |
| A21 | `GET /api/teacher/progress-history?studentId=&homeworkNumberId=[&cursor=]` | TEACHER, DEVELOPER | `api:progress-history` 90 / 60 s | **403** `progressHistory.forbidden` |
| A22 | `GET /api/teacher/topics/conditions?topicId=` | TEACHER, DEVELOPER | `api:topic-conditions` 120 / 60 s | 401 `unauthorized` |
| A23 | `GET /api/teacher/topics/find-number?number=` | TEACHER, DEVELOPER | `api:find-number` 30 / 60 s | 401 `unauthorized` |
| A24 | `POST /api/teacher/lessons` | TEACHER, DEVELOPER | `api:lesson-plan` 10 / 60 s (shared with A31) | 401 `unauthorized` |
| A25 | `PATCH /api/teacher/lessons/{lessonId}` | TEACHER, DEVELOPER | `api:lesson-schedule` 30 / 60 s | 401 `unauthorized` |
| A26 | `DELETE /api/teacher/lessons/{lessonId}` | TEACHER, DEVELOPER | `api:lesson-delete` 30 / 60 s | 401 `unauthorized` |
| A27 | `POST /api/teacher/lessons/{lessonId}/finish` | TEACHER, DEVELOPER | `api:lesson-finish` 30 / 60 s | 401 `unauthorized` |
| A28 | `GET /api/teacher/lessons/{lessonId}/live` | TEACHER, DEVELOPER | `api:lesson-live` 120 / 60 s | 401 `unauthorized` |
| A29 | `GET /api/teacher/lessons/{lessonId}/status` | TEACHER, DEVELOPER | none | 401 `unauthorized` |
| A30 | `PATCH /api/teacher/lessons/{lessonId}/participants/{participantId}/items` | TEACHER, DEVELOPER | `api:lesson-items` 60 / 60 s | 401 `unauthorized` |
| A31 | `POST …/participants/{participantId}/regenerate` | TEACHER, DEVELOPER | `api:lesson-plan` 10 / 60 s | 401 `unauthorized` |
| A32 | `PATCH …/participants/{participantId}/items/{itemId}/result` | TEACHER, DEVELOPER | `api:lesson-item-result` 240 / 60 s | 401 `unauthorized` |
| A33 | `PATCH …/participants/{participantId}/attendance` | TEACHER, DEVELOPER | `api:lesson-attendance` 240 / 60 s | 401 `unauthorized` |
| A34 | `POST /api/teacher/homework-plans` | TEACHER, DEVELOPER | `api:homework-plan` 10 / 60 s | 401 `unauthorized` |
| A35 | `DELETE /api/teacher/homework-plans/{planId}` | TEACHER, DEVELOPER | `api:homework-plan` 30 / 60 s | 401 `unauthorized` |
| A36 | `GET /api/teacher/homework-plans/{planId}/status` | TEACHER, DEVELOPER | none | 401 `unauthorized` |
| A37 | `POST /api/teacher/homework-plans/{planId}/issue` | TEACHER, DEVELOPER | `api:homework-plan` 30 / 60 s | 401 `unauthorized` |
| A38 | `GET /api/teacher/parent-calls?studentId=` | TEACHER (own), DEVELOPER | none | 401 `unauthorized` |
| A39 | `POST /api/teacher/parent-calls` | **TEACHER only** | `api:parent-calls` 60 / 60 s | 401 `unauthorized` |
| A40 | `GET /teacher/lessons/{lessonId}/pdf` | TEACHER, DEVELOPER | `lesson-pdf` 30 / 60 s (shared with A41) | 401 `unauthorized` (JSON); middleware: redirect to `/login` when the cookie is absent |
| A41 | `GET /teacher/lessons/{lessonId}/print` | TEACHER, DEVELOPER | same bucket | same |
| A42 | `GET /teacher/students/{studentId}/export/pdf?period=` | TEACHER (own), DEVELOPER | `api:pdf-export` 5 / 5 min (shared with A43); max 2 concurrent exports per process | 401 plain `Unauthorized` |
| A43 | `GET /teacher/groups/{groupId}/export/pdf?period=` | TEACHER (own), DEVELOPER | `api:pdf-export` 5 / 5 min | 401 plain `Unauthorized` |
| A44 | `POST /api/teacher/topics` | DEVELOPER | `api:topics-create` 12 / 60 s | 401 `developerRightsRequired` |
| A45 | `POST /api/teacher/topics/order` | DEVELOPER | `api:topics-order` 30 / 60 s | 401 `developerRightsRequired` |
| A46 | `POST /api/teacher/number-conditions` | DEVELOPER | `api:number-conditions` 60 / 60 s (shared with A47) | 401 `developerRightsRequired` |
| A47 | `DELETE /api/teacher/number-conditions` | DEVELOPER | same bucket | 401 `developerRightsRequired` |
| A48 | `POST /api/teacher/number-answers` | DEVELOPER | `api:number-answers` 60 / 60 s (shared with A49) | 401 `developerRightsRequired` |
| A49 | `DELETE /api/teacher/number-answers` | DEVELOPER | same bucket | 401 `developerRightsRequired` |
| A50 | `POST /api/teacher/topic-numbers-preview` | DEVELOPER | `api:topic-numbers-preview` 60 / 60 s | 401 `developerRightsRequired` |
| A51 | `POST /api/teacher/topic-import` | DEVELOPER | `api:topic-import` 10 / 60 s | 401 `developerRightsRequired` |
| A52 | `POST /api/teacher/uploads` (multipart; also the Vercel Blob handshake) | DEVELOPER | `api:teacher-uploads` 60 / 10 min | 401 `developerRightsRequired` |
| A53 | `GET /api/teacher/statistics/drilldown?topicId=&studentId=` | DEVELOPER | `api:statistics-drilldown` 120 / 60 s | 401 `developerRightsRequired` |

Caveats when a native client uses these as they are: response fields that are site paths (`href` in A8 / A23
and in notification rows, `redirectTo` in A44); `revalidatePath` side effects are harmless; A3 shares the
2-stream cap with open browser tabs; error texts must be shown verbatim (no codes); A13 / A16 return only the
latest check / latest submissions (see table M).

## B.3 Table S — every server action (category (b)): 28 actions in 8 files

| ID | Action (file) | Role gate | Result channel on the site | Proposed mobile endpoint (spec §) |
|---|---|---|---|---|
| S1 | `loginAction` (`actions/auth.ts`) | none | `redirect("/login?error=empty\|invalid\|database\|rateLimited&min=N")` or `redirect(roleHome)`; sets `tutor_session` + `tutor_role` cookies | `POST /auth/login` (`01` §6.2) |
| S2 | `logoutAction` (`actions/auth.ts`) | session | `redirect("/login")`; clears both cookies | `POST /auth/logout` (`01` §6.2) |
| S3 | `updateProfileInfoAction` (`actions/profile.ts`) | any role | redirect to the role's settings page with `infoError=invalid\|save` or `infoUpdated=1` | `PATCH /me` (`01` §6.3) |
| S4 | `updatePasswordAction` (`actions/profile.ts`) | any role | redirect with `passwordError=invalid\|mismatch\|rateLimited\|current\|save` or `passwordUpdated=1`; rotates the session cookie | `POST /me/password` (`01` §6.3) |
| S5 | `setLocaleAction` (`actions/locale.ts`) | none | returns `{ ok: true, locale }` / `{ ok: false }`; sets cookie `shbz-lang` | none needed — device-local + request header (`01` §3.5, `08` §11.3) |
| S6 | `createStudentAction` (`actions/student.ts`) | TEACHER | returns `{ ok, message }` (`invalid`, `rateLimited`, `exists`, `save`, `created`) | `POST /teacher/students` (`04` §6.1) |
| S7 | `deleteStudentAction` (`actions/student.ts`) | TEACHER, DEVELOPER | redirect `studentError=delete\|deleteMissing` / `studentDeleted=1` | `DELETE /teacher/students/{id}` (`04` §6.1) |
| S8 | `resetStudentPasswordAction` (`actions/student.ts`) | TEACHER, DEVELOPER | redirect `passwordResetError=missing\|invalid\|rateLimited\|save` / `passwordReset=1` | `POST /teacher/students/{id}/password` (`04` §6.1) |
| S9 | `createAccountAction` (`actions/account.ts`) | DEVELOPER | returns `{ ok, message }` (`invalid`, `rateLimited`, `teacherMissing`, `exists`, `save`) | `POST /developer/accounts` (`04` §6.7) |
| S10 | `changeStudentOwnersAction` (`actions/account.ts`) | DEVELOPER | redirect `/developer/accounts?accountError=ownerInvalid\|ownerSave` / `ownerChanged=N` | `PUT /developer/students/owners` (`04` §6.7) |
| S11 | `deleteTeacherAction` (`actions/account.ts`) | DEVELOPER | redirect `accountError=teacherMissing\|teacherTransfer\|teacherDelete` / `teacherDeleted=1` | `DELETE /developer/teachers/{id}` (`04` §6.7) |
| S12 | `resetTeacherPasswordAction` (`actions/account.ts`) | DEVELOPER | redirect `teacherPasswordError=missing\|invalid\|rateLimited\|save` / `teacherPasswordReset=1` | `POST /developer/teachers/{id}/password` (`04` §6.7) |
| S13 | `createGroupAction` (`actions/group.ts`) | TEACHER | redirect `groupError=invalid\|save` / `{id}?groupCreated=1` | `POST /teacher/groups` (`06` §6.1) |
| S14 | `renameGroupAction` (`actions/group.ts`) | TEACHER, DEVELOPER | redirect `groupError=invalid\|missing\|save` / `groupSaved=1` | `PATCH /teacher/groups/{id}` (`06` §6.1) |
| S15 | `deleteGroupAction` (`actions/group.ts`) | TEACHER, DEVELOPER | redirect `groupError=invalid\|missing\|save` / `groupDeleted=1` | `DELETE /teacher/groups/{id}` (`06` §6.1) |
| S16 | `addGroupMemberAction` (`actions/group.ts`) | TEACHER, DEVELOPER | returns `{ ok: boolean }` | `POST /teacher/groups/{id}/members` (`06` §6.1) |
| S17 | `removeGroupMemberAction` (`actions/group.ts`) | TEACHER, DEVELOPER | returns `{ ok: boolean }` | `DELETE /teacher/groups/{id}/members/{studentId}` (`06` §6.1) |
| S18 | `setStudentAiProfileAction` (`actions/group.ts`) | TEACHER, DEVELOPER | returns `{ ok: boolean }` | `PATCH /teacher/students/{id}/ai-profile` (`06` §6.1) |
| S19 | `updateTopicAction` (`actions/topic.ts`) | DEVELOPER | redirect `error=invalid\|save\|numbersTwin\|numbersConfirm\|numbersAssigned\|upload` / `saved=1` | `PATCH /topics/{id}` (`07` §6.2) |
| S20 | `deleteTopicFileAction` (`actions/topic.ts`) | DEVELOPER | redirect `error=save\|fileDelete` / `fileDeleted=<kind>` | `DELETE /topics/{id}/files/{kind}` (`07` §6.2) |
| S21 | `deleteTopicAction` (`actions/topic.ts`) | DEVELOPER | redirect `error=delete\|deleteChanged` / `deleted=1` | `DELETE /topics/{id}` (`07` §6.2) |
| S22 | `saveSiteSettingsAction` (`actions/developer.ts`) | DEVELOPER | returns `{ ok, message }` | `PUT /developer/settings` (`07` §6.6) |
| S23 | `testAiConnectionAction` | DEVELOPER | returns `{ ok, message }` | `POST /developer/actions/test-ai` |
| S24 | `runRetentionNowAction` | DEVELOPER | returns `{ ok, message }` | `POST /developer/actions/run-retention` |
| S25 | `resetAiDailyBudgetAction` | DEVELOPER | returns `{ ok, message }` | `POST /developer/actions/reset-ai-budget` |
| S26 | `unfreezeChecksAction` | DEVELOPER | returns `{ ok, message }` | `POST /developer/actions/unfreeze-checks` |
| S27 | `flushCachesAction` | DEVELOPER | returns `{ ok, message }` | `POST /developer/actions/flush-caches` |
| S28 | `broadcastNotificationAction` | DEVELOPER | returns `{ ok, message }` | `POST /developer/broadcast` (`07` §6.6) |

Note on the project guide `CLAUDE.md` (not a spec file): it describes `actions/topic.ts` as "topic CRUD +
file upload/replace/delete + student status". The code exports only the three actions S19–S21 — topic
**creation** is the JSON route A44 and there is no student-status action — so the count of 28 above is exact.

## B.4 Table C — every server-rendered data screen (category (c)): 35 pages / layouts

"Readers" = what the page calls on the server. None of this data has a JSON route unless the last column
names one.

| ID | Site route (file under `app/`) | Role gate | Readers | Existing JSON that overlaps |
|---|---|---|---|---|
| C1 | `/login` (`(auth)/login/page.tsx`) | none | `getSiteSettings().loginHelpContact` | — |
| C2 | dashboard shell (`(dashboard)/layout.tsx`) | any signed-in (`requireUser()`) | the user (`id`, `name`, `email`, `role`, `createdAt`); STUDENT: `getStudentStreakSnapshot` | streak: A7 |
| C3 | `/student` | STUDENT | `getStudentHomeworkDeadlines`, `getStudentStreakSnapshot` | streak: A7 |
| C4 | `/student/deadlines` | STUDENT | `getStudentHomeworkDeadlines` | — |
| C5 | `/student/theory` | STUDENT | `getStudentTheoryLibrary` | file bytes: A4 |
| C6 | `/student/numbers/[number]` | STUDENT | `findTopicIdByNumber`, `getStudentNumberDetail` | lookup only: A8 (`{ href }`) |
| C7 | `/student/homeworks` | STUDENT | `getStudentHomeworks` | — |
| C8 | `/student/homeworks/[assignmentId]` | STUDENT | `getStudentHomeworks`, `getSiteSettings` | latest check: A13 |
| C9 | `/student/lesson` | STUDENT | `finalizeRecentlyFinishedLessons({ studentId })`, `getStudentLiveLesson` | latest submissions: A16 |
| C10 | `/student/settings` | STUDENT | the user | — |
| C11 | `/student/info` | none of its own (layout: any signed-in) | static dictionary content | — (bundle in the app, `02` §6.10) |
| C12 | `/teacher` | TEACHER | `getTeacherTopicsOverview`, `getParentCallCounts` | — |
| C13 | `/teacher/students` | TEACHER | `getTeacherTopicsOverview` | — |
| C14 | `/teacher/students/[studentId]` (layout + review page) | TEACHER | `getTeacherStudentDetail`, `getTeacherStudentHomeworks` | history: A21; photos: A4 |
| C15 | `/teacher/students/[studentId]/assign` | TEACHER | `getTeacherStudentDetail`, `prisma.topic.findMany` | statements of other topics: A22 |
| C16 | `/teacher/students/[studentId]/lessons` | TEACHER | `getTeacherStudentLessons`, `prisma.topic.findMany` | generation progress: A29 |
| C17 | `/teacher/students/[studentId]/lessons/new` | TEACHER | `getTeacherStudentDetail`, `prisma.studentProfile.findUnique`, topics, `getSiteSettingsUncached`, `getAiCheckConfig` | A22 |
| C18 | `/teacher/lessons` | TEACHER, DEVELOPER | `finalizeRecentlyFinishedLessons`, `getTeacherLessons` | — |
| C19 | `/teacher/lessons/new` | TEACHER, DEVELOPER | `getGroupDetail` / `getTeacherStudentDetail` / group + student lists, topics, settings | A22 |
| C20 | `/teacher/lessons/[lessonId]` | TEACHER, DEVELOPER | `finalizeRecentlyFinishedLessons`, `getLessonDetail`, `prisma.topic.findMany` (bank), settings | live signature: A28; generation: A29 |
| C21 | `/teacher/homework-plans` | TEACHER, DEVELOPER | `getHomeworkPlans` | — |
| C22 | `/teacher/homework-plans/new` | TEACHER, DEVELOPER | lesson / group (`getGroupDetail`) / student lookups, topics | — |
| C23 | `/teacher/homework-plans/[planId]` | TEACHER, DEVELOPER | `getLessonDetail`, topic numbers, source lesson, settings | generation: A36 |
| C24 | `/teacher/groups` | TEACHER, DEVELOPER | `getTeacherGroups` | — |
| C25 | `/teacher/groups/[groupId]` | TEACHER, DEVELOPER | `getGroupDetail`, `getTeacherLessons`, `getGroupStatistics`, `getGroupAttendance`, `finalizeRecentlyFinishedLessons` | attendance PDF: A43 |
| C26 | `/teacher/calls` | TEACHER, DEVELOPER | `ensureParentCallDueNotifications` (TEACHER), `getParentCallOverview` | one student's history: A38 |
| C27 | `/teacher/statistics` | DEVELOPER | `getTeacherTopicsOverview`, `getProgressTimeline`, `getDeveloperStatistics`, `getTeacherStatistics` | drilldown: A53 |
| C28 | `/teacher/accounts` | DEVELOPER | `prisma.user.findMany` × 2 | — |
| C29 | `/teacher/topics` | TEACHER, DEVELOPER | `getTeacherTopicsOverview`, `getStorageBackend`, `getBlobAccessMode` | — |
| C30 | `/teacher/topics/[topicId]` | TEACHER, DEVELOPER | `getTeacherTopicDetail` | statements map: A22 |
| C31 | `/teacher/topics/[topicId]/edit` | DEVELOPER | `getTeacherTopicDetail`, `summarizeTopicImpact(loadTopicNumberFacts)` | change preview: A50 |
| C32 | `/teacher/topics/[topicId]/numbers/[number]` | TEACHER, DEVELOPER | `getTeacherNumberDetail` | lookup: A23 |
| C33 | `/teacher/panel` (URL `/developer/panel`) | DEVELOPER | `getSiteSettingsUncached`, queue lengths, `getInternalSettingValue`, counts, student list | — |
| C34 | `/teacher/panel/journal` | DEVELOPER | `prisma.auditLog` (count + page), actors, `progressStatusEvent` lookup, `getAuditRetentionDays` | A21 for `progress.status` rows |
| C35 | `/teacher/settings` | TEACHER, DEVELOPER | the user | — |

Redirect-only routes (no data): `/` and `/dashboard` (→ `roleHome` or `/login`), `/student/account` and
`/teacher/account` (→ the settings page).

## B.5 Table M — per-operation matrix (every operation proposed in specs 01–09)

`Cat.` uses B.1. `Site` refers to tables A / S / C.

### 01 — shell, auth, notifications, realtime

| Operation | Proposed mobile endpoint | Site | Cat. | Note |
|---|---|---|---|---|
| Login help contact | `GET /public/config` | C1 | (c) | unauthenticated read |
| Sign in | `POST /auth/login` | S1 | (b) | the blocker for everything in (a) |
| Sign out | `POST /auth/logout` | S2 | (b) | |
| Current user + session expiry | `GET /me` | C2 | (c) | `sessionExpiresAt` is not exposed anywhere on the site |
| Update name | `PATCH /me` | S3 | (b) | |
| Change password | `POST /me/password` | S4 | (b) | rotates the session |
| Set language | — (device-local) | S5 | — | on (a) routes the language is the `shbz-lang` cookie |
| Notifications list | `GET /notifications` | A1 (all roles), A5 (student) | (a) | `params` / `target` of `01` §6.4 are not returned — rows carry rendered `title` / `body` + `href` |
| Mark read | `POST /notifications/read` | A2, A6 | (a) | response has no `unreadCount` |
| Streak | `GET /student/streak` | A7 | (a) | |
| Number search | `GET /numbers/find` | A8, A23 | (a′) | A8 returns `{ href }` only (number is the last path segment); A23 returns `topicId`, `topicTitle`, `number`, `href` |
| Realtime | `GET /realtime` | A3 | (a) | cookie auth; 2-stream cap |
| Polling fallback | `GET /sync/changes` | — | (d) | |
| Push device registration | `POST` / `DELETE /devices` | — | (d) | no device table, no push provider |
| Roaming preferences (`08` §14, optional) | `GET` / `PUT /me/preferences` | — | (d) | |
| Client bootstrap (`09` App. C) | `GET /meta` | C1 (help contact only) | (d) | limits / feature flags are compile-time constants + `SiteSetting` |

### 02 — student study

| Operation | Proposed mobile endpoint | Site | Cat. | Note |
|---|---|---|---|---|
| Home (deadlines + streak) | `GET /student/home` | C3 | (c) | streak half is A7 |
| Deadlines calendar | `GET /student/homework-deadlines` | C4 | (c) | |
| Theory library | `GET /student/theory` | C5 | (c) | |
| Number lookup | `GET /student/numbers/lookup` | A8 | (a′) | `homeworkNumberId`, `topicId`, `topicTitle` not returned |
| Number detail | `GET /student/numbers/{number}` | C6 | (c) | |
| Save note | `PUT /student/numbers/{id}/note` | A9 | (a) | site body also needs `topicId` |
| File bytes / thumbnail | `GET /files/{id}` | A4 | (a) | cookie auth |
| Signed file URL | `POST /files/{id}/access-url` | — | (d) | |
| Exam info | none | C11 | — | static; bundled in the app |

### 03 — student homework, photos, AI check, live lesson

| Operation | Proposed mobile endpoint | Site | Cat. | Note |
|---|---|---|---|---|
| Homework list | `GET /student/homeworks` | C7 | (c) | |
| Homework detail | `GET /student/homeworks/{id}` | C8 | (c) | |
| Attach photos | `POST …/photos` | A10 | (a) | |
| Delete photo | `DELETE …/photos/{photoId}` | A11 | (a) | |
| Start AI check | `POST …/checks` | A12 | (a) | returns `{ ok, checkId }` |
| Poll latest check | `GET …/checks/latest` | A13 | (a′) | returns `{ check }` only; refreshed photos / statuses / `solvedCount` come from re-rendering C8; FAILED carries raw `error` text, not `errorCode` |
| Save note | `PUT /student/numbers/{id}/note` | A9 | (a) | |
| Lesson tab (waiting / live) | `GET /student/lesson` | C9 | (c) | |
| Join lesson | `POST /student/lessons/{id}/join` | A14 | (a) | returns `{ ok: true }` (no `joinedAt`) |
| Submit lesson photos | `POST …/items/{itemId}/submissions` | A15 | (a) | returns `{ ok, submissionId }` |
| Poll lesson state | `GET /student/lessons/{id}/state` | A16 | (a′) | returns latest submissions only — no derived lesson status, no item `result` |

### 04 — teacher: students, homework review / assign, accounts

| Operation | Proposed mobile endpoint | Site | Cat. | Note |
|---|---|---|---|---|
| Teacher home | `GET /teacher/home` | C12 | (c) | |
| Students list | `GET /teacher/students` | C13 | (c) | |
| Create student | `POST /teacher/students` | S6 | (b) | |
| Delete student | `DELETE /teacher/students/{id}` | S7 | (b) | |
| Reset student password | `POST /teacher/students/{id}/password` | S8 | (b) | |
| Student card header | `GET /teacher/students/{id}` | C14 | (c) | |
| Homework review data | `GET …/homeworks` | C14 | (c) | photos via A4 |
| Assign board | `GET …/assign-board` | C15 | (c) | |
| Statements of a topic | `GET /teacher/topics/{id}/conditions` | A22 | (a) | |
| Issue homework | `POST /teacher/homeworks` | A17 | (a) | |
| Cancel homework | `DELETE /teacher/homeworks/{id}` | A18 | (a) | site takes the id in the JSON body |
| Set / clear number status | `PUT …/numbers/{id}/status` | A19 | (a) | TEACHER only |
| Batch number statuses | `POST …/number-statuses` | — | (d) | the site sends one request per number |
| Set / clear deadlines | `PUT …/deadlines` | A20 | (a) | TEACHER only |
| Progress history | `GET …/numbers/{id}/history` | A21 | (a) | returns localized labels, not codes |
| Student lessons tab | `GET …/lessons` | C16 | (c) | |
| Number bank | `GET /teacher/number-bank` | C16 / C20 | (c) | |
| Compose-lesson context | `GET …/lesson-compose` | C17 | (c) | |
| Create lesson / status / items / result / regenerate | (owned by `05`) | A24, A29, A30, A32, A31 | (a) | |
| Student PDF report | `GET …/report.pdf` | A42 | (a) | plain-text errors |
| Accounts directory | `GET /developer/accounts` | C28 | (c) | |
| Create account | `POST /developer/accounts` | S9 | (b) | |
| Change student owners | `PUT /developer/students/owners` | S10 | (b) | |
| Reset teacher password | `POST /developer/teachers/{id}/password` | S12 | (b) | |
| Delete teacher | `DELETE /developer/teachers/{id}` | S11 | (b) | |

### 05 — teacher: lessons and homework plans

| Operation | Proposed mobile endpoint | Site | Cat. | Note |
|---|---|---|---|---|
| Planner meta (AI availability, limits) | `GET /teacher/planner/meta` | C19 / C20 / C23 | (c) | settings are read inside pages |
| Lessons list | `GET /teacher/lessons` | C18 | (c) | |
| New-lesson target chooser / form | `GET /teacher/lessons/new-options`, `/new-form` | C19 | (c) | |
| Statements of a topic | `GET /teacher/topics/{id}/conditions` | A22 | (a) | |
| Create lesson | `POST /teacher/lessons` | A24 | (a) | site: 503 + `lessonId` when AI is off |
| Lesson board | `GET /teacher/lessons/{id}` | C20 | (c) | |
| Lesson bank | `GET /teacher/lessons/{id}/bank` | C20 | (c) | |
| Generation status | `GET …/status` | A29 | (a) | |
| Live snapshot | `GET …/live` | A28 | (a) | |
| Schedule / move | `PATCH /teacher/lessons/{id}` | A25 | (a) | |
| Finish early | `POST …/finish` | A27 | (a) | |
| Delete lesson | `DELETE /teacher/lessons/{id}` | A26 | (a) | |
| Replace a set | `PUT …/participants/{pid}/items` | A30 | (a) | site method is `PATCH`; returns `{ ok: true, items: <count> }`, not the item list |
| Regenerate | `POST …/regenerate` | A31 | (a) | serves lessons and drafts |
| Mark result | `PATCH …/items/{itemId}/result` | A32 | (a) | |
| Mark attendance | `PATCH …/attendance` | A33 | (a) | |
| Handout PDF / HTML | `GET …/handout` | A40, A41 | (a) | |
| Drafts list | `GET /teacher/homework-plans` | C21 | (c) | |
| New-draft form | `GET /teacher/homework-plans/new-form` | C22 | (c) | |
| Create draft | `POST /teacher/homework-plans` | A34 | (a) | |
| Draft board | `GET /teacher/homework-plans/{id}` | C23 | (c) | |
| Draft generation status | `GET …/status` | A36 | (a) | |
| Draft set edit / regenerate | `PUT …/items`, `POST …/regenerate` | A30, A31 (called with the plan id as `lessonId`) | (a) | |
| Issue homework from draft | `POST …/issue` | A37 | (a) | `failed[]` has `message` only |
| Delete draft | `DELETE /teacher/homework-plans/{id}` | A35 | (a) | |

### 06 — teacher: groups, attendance, parent calls, statistics

| Operation | Proposed mobile endpoint | Site | Cat. | Note |
|---|---|---|---|---|
| Groups list | `GET /teacher/groups` | C24 | (c) | |
| Create group | `POST /teacher/groups` | S13 | (b) | |
| Group detail | `GET /teacher/groups/{id}` | C25 | (c) | |
| Rename group | `PATCH /teacher/groups/{id}` | S14 | (b) | |
| Delete group | `DELETE /teacher/groups/{id}` | S15 | (b) | |
| Add member | `POST …/members` | S16 | (b) | |
| Remove member | `DELETE …/members/{studentId}` | S17 | (b) | |
| Speed / AI note | `PATCH /teacher/students/{id}/ai-profile` | S18 | (b) | |
| Group statistics | `GET …/statistics` | C25 | (c) | |
| Attendance matrix | `GET …/attendance` | C25 | (c) | |
| Set attendance | `PATCH …/attendance` | A33 | (a) | |
| Attendance PDF | `GET …/attendance.pdf` | A43 | (a) | plain-text errors |
| Calls overview | `GET /teacher/parent-calls` | C26 | (c) | |
| Calls counters | `GET /teacher/parent-calls/counts` | C12 | (c) | |
| Call history of a student | `GET …/students/{id}/history` | A38 | (a) | max 100, no paging |
| Record a call | `POST /teacher/parent-calls` | A39 | (a) | TEACHER only |
| Statistics: progress / timeline / teachers / platform | `GET /developer/statistics/*` | C27 | (c) | |
| Statistics drilldown | `GET /developer/statistics/drilldown` | A53 | (a) | |

### 07 — developer content, dev panel, journal

| Operation | Proposed mobile endpoint | Site | Cat. | Note |
|---|---|---|---|---|
| Topics list | `GET /topics` | C29 | (c) | |
| Topic view | `GET /topics/{id}` | C30 | (c) | |
| Single number | `GET /topics/{id}/numbers/{number}` | C32 | (c) | |
| Statements map | `GET /topics/{id}/conditions` | A22 | (a) | |
| Number search | `GET /numbers/find` | A23 | (a) | |
| Create topic | `POST /topics` | A44 | (a) | returns `{ redirectTo }` |
| Deletion impact | `GET /topics/{id}/impact` | C31 | (c) | |
| Numbers change preview | `POST /topics/{id}/numbers-preview` | A50 | (a) | |
| Update topic | `PATCH /topics/{id}` | S19 | (b) | multipart with files on the site |
| Delete topic file | `DELETE /topics/{id}/files/{kind}` | S20 | (b) | |
| Delete topic | `DELETE /topics/{id}` | S21 | (b) | |
| Reorder / move | `PUT /topics/order`, `POST /topics/{id}/move` | A45 | (a) | one route, two body forms |
| Save / delete statement | `PUT` / `DELETE /numbers/{id}/condition` | A46, A47 | (a) | |
| Save / delete answer | `PUT` / `DELETE /numbers/{id}/answer` | A48, A49 | (a) | |
| Import prompt | `GET /topic-import/prompt` | C29 — the constant `TOPIC_IMPORT_PROMPT` (`lib/topic-import-prompt.ts`) is bundled into the client component `components/topic-import-prompt-button.tsx`; no route | (c) | can be embedded in the app (`07` App. A) |
| Import preview / apply | `POST /topic-import` | A51 | (a) | |
| Upload a file | `POST /uploads` | A52 | (a) | multipart variant |
| Dev panel data | `GET /developer/panel` | C33 | (c) | |
| Save settings | `PUT /developer/settings` | S22 | (b) | |
| Service actions × 5 | `POST /developer/actions/{action}` | S23 – S27 | (b) | |
| Broadcast | `POST /developer/broadcast` | S28 | (b) | |
| Journal | `GET /developer/journal` | C34 | (c) | |
| Progress history | `GET /progress-history` | A21 | (a) | |

### Totals (operations of table M)

| Spec | Rows | (a) | (a′) | (b) | (c) | (d) | no backend needed |
|---|---|---|---|---|---|---|---|
| 01 (+ `08` §14, `09` App. C) | 16 | 4 | 1 | 4 | 2 | 4 | 1 |
| 02 | 9 | 2 | 1 | 0 | 4 | 1 | 1 |
| 03 | 11 | 6 | 2 | 0 | 3 | 0 | 0 |
| 04 | 25 | 8 | 0 | 7 | 9 | 1 | 0 |
| 05 | 25 | 17 | 0 | 0 | 8 | 0 | 0 |
| 06 | 18 | 5 | 0 | 6 | 7 | 0 | 0 |
| 07 | 23 | 10 | 0 | 6 | 7 | 0 | 0 |
| **Total** | **127** | **52** | **4** | **23** | **40** | **6** | **2** |

Counting unit = one row of table M (a few rows bundle sibling endpoints, e.g. "service actions × 5", "save /
delete statement"; the inventories behind them are exact: 53 handlers in table A, 28 actions in table S, 35
pages in table C).

Reading the totals: 56 of 127 rows (44 %) have a site route today (52 fully, 4 partly); 63 rows (50 %) need
new server code whatever option is chosen (23 rows backed only by server actions, 40 reads that exist only
inside pages); 6 rows are new capabilities; 2 need no backend. By role: the two student specs (`02` + `03`,
20 rows) are the closest to being servable — 8 (a) + 3 (a′), 7 (c), 1 (d), no (b) of their own (sign-in and
profile are the (b) rows of `01`); the developer-only rows are the furthest — 17 of the 23 rows of `07` (all
but the six rows a TEACHER also uses: topics list, topic view, single number, statements map, number search,
progress history), the 5 account rows of `04` and the 2 statistics rows of `06` — 24 rows in total, 16 of
them (b) / (c).

## B.6 Sizing notes for the three ways forward **[PROPOSAL]**

The specs' mock-first plan (`ApiClient` interface → `MockApiClient` now, `HttpApiClient` later; `09` App. C)
is unaffected by the choice below; the choice decides what "later" costs and whether it is allowed at all.

| | Option 1 — mocks only for v1 | Option 2 — separate backend-for-frontend (BFF), site code untouched | Option 3 — add `/api/mobile/v1` to the site later |
|---|---|---|---|
| Touches the site repo | no | no code change; but it is a new deployable next to the site | yes (new route handlers only; existing pages / routes unchanged) |
| Touches production data | no | yes — shares the Postgres database and file storage | yes |
| Real accounts / real data in the app | no (demo data of `09` §2) | yes | yes |
| Work for the 52 + 4 (a) rows | mock | thin proxy to the site's routes over HTTP with the user's `tutor_session` value as a cookie (keeps AI queues, realtime, caches and rate limits inside the site process — B.0.9, B.0.10); add codes by mapping status + route to tables A.4 – A.10 | wrap existing handlers / call the same `lib/` functions; return the A.2 envelope |
| Work for the 23 (b) rows | mock | re-implement each action against Postgres (logic of `actions/*.ts`: validation, rate limits, audit rows, file cleanup). Login = verify scrypt `salt:hash`, insert a `Session` row with `sha256(token)` — the same token then works as the site cookie (B.0.2). Not shareable: in-memory limits `login:ip`, `login:ip-login`, `create-student`, `create-account`, `reset-*-password` (B.0.9). Site caches go stale up to 60 s after BFF writes (B.0.10) | one route handler per action calling the same code path; smallest effort |
| Work for the 40 (c) rows | mock | re-implement or import the readers of `lib/platform-data.ts` (2 781 lines) plus `lib/parent-calls.ts`, `lib/group-statistics*.ts`, `lib/lesson-finalize.ts`, settings — outside Next.js (`unstable_cache` and `next/headers` are not available there) | one `GET` handler per reader; the readers already exist and are cached |
| Work for the 6 (d) rows | mock | new code + new tables (devices) — a schema change is a site change | new code + migration |
| Risk | none for the site; the app is a demo until a backend exists | duplicated business logic that must track every site change; two writers on one database | the owner's constraint is lifted, at a time of the owner's choosing |

A fourth, narrow possibility for the student role only — **[PROPOSAL], unverified, needs a spike**: sign in
through a WebView that loads the site's own `/login` page, read the `tutor_session` cookie from the WebView
cookie store, and call the existing (a) routes directly. The cookie is `httpOnly`, `sameSite=lax`, `path=/`,
`secure` when the request is https (`lib/auth.ts`); nothing in the site would change. It covers the 8 (a) + 3
(a′) student rows but none of the 7 student reads in (c) (home, deadlines, theory, number detail, homework
list, homework detail, lesson tab), so it cannot produce a usable student app by itself.

## B.7 Open questions (to be asked before implementation starts)

1. **Backend path under "do not touch the site" (blocking).** Which of the following is meant?
   (1) v1 is a **mock-only** app (demo data, no real accounts) until the site may be changed;
   (2) a **separate BFF** service is allowed (new deployable, same database, site code untouched);
   (3) the app is built mock-first now and `/api/mobile/v1` is **added to the site later**, when the
   constraint is lifted.
   По-русски: «не трогать сайт» — это (1) приложение пока только на моках, (2) можно поднять отдельный
   сервис-прослойку рядом с сайтом на той же базе, или (3) делаем на моках сейчас, а API в сам сайт добавим
   позже? Suggested default: **(3)** — it is the only path where the 28 server actions and the
   readers behind the 35 server-rendered screens are exposed without duplicating their logic (B.6).
2. **Does "not touching the site" also exclude reading production data?** Options 2 and the WebView bridge
   leave the code alone but use the live database / live routes. If the answer is "no production traffic at
   all", only option 1 remains for now.
3. **If (1) or (3): which roles ship in the mock build?** 24 rows of table M are developer-only (see the
   totals) and the role is desktop-oriented (`01` §7 Q17, `07` §7 Q2); confirming "student + teacher first"
   leaves 103 rows for the later backend work.
4. **Wrong-role status (A.1.3).** The unified contract answers 403 where the site answers 401. Confirm the
   mobile API may differ from the site here (the site itself keeps 401).
5. **Per-file "too big" upload status (A.7).** The site answers 400 for a single oversized file and 413 for an
   oversized request; the contract proposes 413 for both. Confirm, or keep 400 for parity.
6. **Missing texts.** `fileNotFound`, `exportFailed` and `internalError` have no dictionary entry on the site
   (plain English bodies / framework default). The app needs overlay strings in both languages (`09` §3.5
   mobile overlay) — wording to be approved.
7. **Language transport.** The site reads the `shbz-lang` cookie only. If option 2 proxies to existing
   routes, the BFF must translate `Accept-Language` into that cookie; with option 3 the new handlers read the
   header directly. No decision needed beyond acknowledging the difference.
