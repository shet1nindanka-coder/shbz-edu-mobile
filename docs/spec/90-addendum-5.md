# 90 — Addendum 5: typed client for spec 03 (`StudentHomeworkLessonApi`) and one `ApiClient` composition

Closes one gap found by the completeness review of specs `01`–`09` (+ addenda `1`–`4`): the mock client layer.

- **Part A** — `03-student-homework-lesson.md` is the only functional spec without a typed client interface.
  This part adds it: `StudentHomeworkLessonApi` (10 methods) with its DTOs, per-method inputs / outputs /
  limits / error codes, mock rules and the mobile endpoints it maps to.
- **Part B** — the composition document: one `ApiClient`, nine member interfaces, **every method assigned to
  exactly one interface** (112 methods, table B.4), every duplicate named by the review resolved, and the two
  non-API services (`FileService`, `PreferencesStore`) placed next to it.

The existing spec files are not edited. Where an existing spec states something the code or an earlier
addendum contradicts, the line starts with **CORRECTION to `<file>`**.

Marking: **[CODE]** = fact read from the site code (file named). **[SPEC]** = statement about the text of an
existing spec file (section named). **[DECISION]** = choice made by this addendum between conflicting
proposals (the site has no mobile API, so every mobile path, DTO and client method is a proposal).

Source files read for this addendum — web repo `/home/user/web_shetya` (read-only):
`app/api/student/homework-submissions/route.ts`, `app/api/student/homework-checks/route.ts`,
`app/api/student/lesson-submissions/route.ts`, `app/api/student/lesson/route.ts`,
`app/api/realtime/route.ts`, `app/(dashboard)/student/homeworks/page.tsx`,
`app/(dashboard)/student/homeworks/[assignmentId]/page.tsx`, `app/(dashboard)/student/lesson/page.tsx`,
`app/(dashboard)/layout.tsx`, `components/student-homework-photos.tsx`, `components/student-homework-check.tsx`,
`components/student-lesson-view.tsx`, `components/student-single-number-card.tsx`,
`components/dashboard-realtime-listener.tsx`, `components/teacher-homework-plan-board.tsx`,
`components/group-attendance-section.tsx`, `lib/platform-data.ts` (`getStudentHomeworks`,
`getTeacherStudentHomeworksUncached`, `getStudentLiveLesson`), `lib/solution-check-student-view.ts`,
`lib/lesson-live.ts`, `lib/lesson-status.ts`, `lib/lesson-finalize.ts`, `lib/upload-validation.ts`,
`lib/utils.ts` (`getMimeTypeFromExtension`), `lib/animation-hooks.ts` (`useUploadProgress`),
`lib/dashboard-realtime.ts`, `actions/student.ts`, `actions/account.ts`, `actions/locale.ts`,
`app/api/teacher/lessons/[lessonId]/finish/route.ts`. Spec files read: `01` §6, `02` §6, `03` (whole file),
`04` §0, §3.1–3.3, §6, `05` §6, `06` §6, `07` §6, `08` §14, `09` §1.6, §2.2, §5.2, App. A–C,
`90-addendum-1.md` Part A and B.5, `90-addendum-2.md` Part A, `90-addendum-3.md`, `90-addendum-4.md` §0–§3.4,
§3.8, §3.12, §5–§7.

Relation to `90-addendum-4.md` (shared type catalogue, written in parallel): this addendum uses its names —
`IsoDateTime`, `DerivedLessonStatus`, `CheckErrorCode`, `AttachedPhoto`, `PhotoRef`, `FileRef`,
`StoredFileRef`, `InterfacePreferences` (its block S, §2) — and its projection rules P1–P7 (§3.12).
`90-addendum-4.md` adds or removes **no** client method; its §7 deltas (`uploadFile` → `StoredFileRef`,
`getLessonStatus` declared in `TeacherPlannerApi` only, the `PreferencesStore` members) agree with table B.4.
"A4" below = `90-addendum-4.md`.

---

## 0. The gap — facts about the spec set

**[SPEC]** `09` Appendix C, last paragraph: "The mock implements the same interface in-process (`ApiClient`
interface → `MockApiClient` over the store of section 2, `HttpApiClient` later)". No file defines `ApiClient`.
The specs declare ten separately named interfaces:

| Spec | Interface | Kind |
|---|---|---|
| `01` §6.9 | `ShellApi` | server API |
| `02` §6.11 | `StudentStudyApi` | server API |
| `03` | — (DTOs in §6.1 / §6.2 and two method/path tables, **no interface**) | server API |
| `04` §6.8 | `TeacherStudentsApi`, `DeveloperAccountsApi` | server API |
| `05` §6 | `TeacherPlannerApi` | server API |
| `06` §6.6 | `GroupsCallsStatsApi` | server API |
| `07` §6.8 | `ContentApi`, `DeveloperApi` | server API |
| `08` §14 | `PreferencesStore` | device storage, no server |
| `09` §5.2 | `FileService` | file bytes (server or bundled assets) |

Status of the duplicates the review lists. "A2" = `90-addendum-2.md`.

| Duplicate | Where | Status before this addendum | Canonical (after this addendum) |
|---|---|---|---|
| `getStreak` | `01` `ShellApi`, `02` `StudentStudyApi` | resolved by A2 A.2.16 | `ShellApi.getStreak()` only |
| `getTopicConditions` (`TopicConditions` vs bare record) | `04`, `05`, `07` | resolved by A2 A.2.9 | `ContentApi.getTopicConditions(topicId): Promise<Record<string, string \| null>>` only |
| `setAttendance` (`void` vs `SetAttendanceResponse`) | `05`, `06` | resolved by A2 A.2.18 | `GroupsCallsStatsApi.setAttendance(...): Promise<{ attendance: AttendanceStatus }>` only |
| `findNumber` vs `lookupNumber` | `01`, `02` (and a path row in `03` §6.1) | resolved by A2 A.2.1 | `ShellApi.findNumber(number): Promise<NumberFindResult>` only |
| `getFileUrl` vs `FileService` | `02`, `09` | resolved by A2 A.2.10 | `FileService` only |
| `deleteStudent`, `resetStudentPassword` | twice in `04` §6.8 (`TeacherStudentsApi` and `DeveloperAccountsApi`) | **open** | `TeacherStudentsApi` only — B.2.1 |
| `subscribeRealtime` vs `subscribe` | `01` `ShellApi`, `02` `StudentStudyApi` | **open** | `ShellApi.subscribeRealtime` only — B.2.2 |
| Typed client for `03` | — | **open** (A2 A.3 only says "note save and number search are NOT redeclared") | `StudentHomeworkLessonApi` — Part A |
| One `ApiClient` | `09` App. C | **open** | Part B |

Found while composing (not in the review's list), resolved in B.2: `saveHomeworkPlanItems` vs
`saveLessonItems` (`05`), `localUri` vs `uri` in the two PDF download results (`04`, `06`), typed
`Promise<void>` where the wire body carries data (`04`, `05`). (`HomeworkPhotoDto.url` / `thumbUrl` of `03`
vs the file decision of A2 A.2.10 is already resolved by A4 §3.8 — the type is `AttachedPhoto`.)

---

# Part A — `StudentHomeworkLessonApi` (spec 03)

**CORRECTION to `03-student-homework-lesson.md` §6:** the file has no typed client interface. Add §6.7
"Typed client interface for the mock" with the content of A.3 – A.5 below. The method/path tables of `03`
§6.1 / §6.2 stay the wire contract; error-code names are those of `90-addendum-1.md` A.7.

## A.1 Screens and the methods they call

Screens are those of `03` §1 (no new screens). `api` = the `ApiClient` of Part B; `files` = `FileService`.

| Screen (`03` §1) | Reads | Writes | Cross-interface calls |
|---|---|---|---|
| H1 Homework list | `api.studentWork.listHomeworks()` | — | header search → `api.shell.findNumber` |
| H2.a Homework detail — photo batch | `api.studentWork.getHomework(id)` | `uploadHomeworkPhotos`, `deleteHomeworkPhoto` | thumbnails → `files.source(fileId, "thumb")` |
| H2.b Homework detail — AI check | `getHomework(id)` (initial `latestCheck`), `getLatestHomeworkCheck(id)` (poll) | `startHomeworkCheck(id)` | — |
| H2.c Homework detail — numbers | `getHomework(id)` | — | note field → `api.studentStudy.saveNumberNote` (A2 A.2.14); header search → `api.shell.findNumber` |
| H3 Photo viewer | — | — | `files.source(fileId)`; saving / sharing → `files.download(…)` (B.7 item 7) |
| H4 Delete-photo confirmation | — | `deleteHomeworkPhoto` | — |
| L1 Lesson tab, waiting | `api.studentWork.getLiveLesson()` | — | — |
| L2 Lesson tab, live | `getLiveLesson()`, `getLiveLessonState(lessonId)` (poll) | `joinLesson(lessonId)`, `submitLessonItem(lessonId, itemId, files)` | — |

**[CODE]** the facts behind the cross-interface column:

- Both homework pages mount `<ShbzNumberSearch endpoint="/api/student/homeworks/find-number" />` in the header
  (`student/homeworks/page.tsx`, `student/homeworks/[assignmentId]/page.tsx`).
- The note of a number card is saved by `StudentSingleNumberCard` with `POST /api/student/topic-status`
  (`components/student-single-number-card.tsx`), not by a homework route.
- The photo grid renders `<img src="/files/{fileId}?thumb=1">` inside `<a href="/files/{fileId}" target="_blank">`
  (`components/student-homework-photos.tsx`).
- The lesson view calls `POST /api/student/lesson` once per mount (`joinedRef`), ignoring the response and any
  failure (`.catch(() => undefined)`) (`components/student-lesson-view.tsx`).

## A.2 What the site does for each operation, and what the mobile method adds

| Method | Site today **[CODE]** | Site success body **[CODE]** | Added by the mobile contract (`03` §6, proposal) |
|---|---|---|---|
| `listHomeworks` | no JSON route — server component `student/homeworks/page.tsx` calls `getStudentHomeworks(user.id)` (cached 15 s) | props: per assignment `id`, `label`, `topicId`, `topicTitle`, `deadlineAt`, `totalNumbers`, `solvedCount`, `solvedPercent`, `photosCount`, `numbers[{ homeworkNumberId, number, status }]` | JSON endpoint; `serverNow`, `limits`, `title` + `orderInTopic` instead of a rendered `label`, `createdAt`, `attentionRank`, `latestCheckStatus` |
| `getHomework` | no JSON route — `student/homeworks/[assignmentId]/page.tsx` calls `getStudentHomeworks(user.id)` + `getSiteSettings()` and picks `assignments.find(id)`; `notFound()` when `!assignmentsEnabled \|\| !assignment` | props: photos `{ id, fileId, originalName }`, `maxPhotos`, `latestCheck { id, status, error, checkedAt, results }` (through `toStudentFacingResults`), numbers `{ homeworkNumberId, number, conditionLatex, status, note }`, `notesEnabled` | JSON endpoint; `aiCheckAvailable`, `limits.noteMaxLength`, `errorCode` instead of raw `error` |
| `uploadHomeworkPhotos` | `POST /api/student/homework-submissions`, multipart `assignmentId` + `files` (repeated) | `{ ok: true, photos: [{ id, fileId }] }` | full `AttachedPhoto[]` of the created photos + `photosCount` |
| `deleteHomeworkPhoto` | `DELETE /api/student/homework-submissions`, JSON `{ photoId }` | `{ ok: true }` | `photosCount` |
| `startHomeworkCheck` | `POST /api/student/homework-checks`, JSON `{ assignmentId }` | `{ ok: true, checkId }` | the whole `StudentCheckDto` (status `PENDING`) |
| `getLatestHomeworkCheck` | `GET /api/student/homework-checks?assignmentId=…&consume=1` (the site client always sends `consume=1`) | `{ check: { id, status, error, checkedAt, results[{ number, verdict, recognizedAnswer, comment }] } \| null }` | `errorCode`, `createdAt`, `results[].homeworkNumberId`; refreshed `photos`, `numbers[].status`, `solvedCount` |
| `getLiveLesson` | no JSON route — `student/lesson/page.tsx`: `finalizeRecentlyFinishedLessons({ studentId })`, then `serverNow = Date.now()` (taken **before** the data query), then `getStudentLiveLesson(user.id)` (uncached) | props: `{ active, upcoming }` (`03` §2.2) | JSON endpoint; `serverNow`, `limits`, `lessonCheckAvailable`, `endsAt`, per-item `closed` / `canSubmit`, `errorCode` |
| `joinLesson` | `POST /api/student/lesson`, JSON `{ lessonId }` | `{ ok: true }` | `joinedAt` |
| `submitLessonItem` | `POST /api/student/lesson-submissions`, multipart `itemId` + `files` | `{ ok: true, submissionId }` | the whole `LessonSubmissionDto` (status `PENDING`) |
| `getLiveLessonState` | `GET /api/student/lesson-submissions?lessonId=…&consume=1` | `{ submissions: [{ id, itemId, status, verdict, recognizedAnswer, comment, error, submittedAt, checkedAt }] }` — the latest submission of every item that has one; `[]` for a foreign / unknown lesson | derived lesson `status`, **every** item with its `result`, `errorCode` instead of raw `error`; `404` for a foreign / unknown lesson |

`consume=1` is a cache-invalidation hint for the site's server-rendered pages (**[CODE]** `revalidateAllPlatformData()`
+ `revalidatePath(...)` in both GET handlers; the lesson handler de-duplicates per submission id for 10 min).
It is **not** part of the typed client: no method takes it.

## A.3 Types

Final shapes after `90-addendum-1.md` (error envelope, codes), `90-addendum-2.md` (A.2.10 files, A.2.12
limits, A.2.15 `HomeworkSummaryDto`) and `90-addendum-4.md` (§3.8 `AttachedPhoto`, §3.4 `DerivedLessonStatus`,
§3.12 projection rules). `HomeworkNumberStatus`, `SolutionCheckStatus`, `SolutionVerdict`, `LessonItemResult`
are the enums of `09` §1.1; `IsoDateTime`, `DerivedLessonStatus`, `CheckErrorCode`, `AttachedPhoto` are
imported from the shared catalogue (A4 §2) and quoted here only as comments.

```ts
// ---------- shared ----------
// From the shared catalogue (A4 §2) — NOT redeclared by this subsystem:
//   type CheckErrorCode = "interrupted" | "disabled" | "timeout" | "quota" | "unavailable" | "queue" | "image" | "unknown";
//       03 §4.5 classes; a FIELD VALUE of a successful response, not an envelope code; non-null iff status === "FAILED" (A4 P6)
//   interface AttachedPhoto { id: string; fileId: string; originalName: string; mimeType: string; createdAt: IsoDateTime }
//       id = HomeworkSubmissionPhoto id (what deleteHomeworkPhoto takes); fileId = StoredFile id (what FileService takes)
//   type DerivedLessonStatus = "PLANNED" | "ACTIVE" | "FINISHED";     // deriveLessonStatus(lesson, now)

/** One picked / captured image handed to an upload method (same shape as ContentApi.uploadFile's `file`, 07 §6.8). */
type PhotoUpload = {
  uri: string;                              // local file URI
  name: string;                             // must end in .png, .jpg or .jpeg (A.5.3)
  mimeType: "image/png" | "image/jpeg";
  size: number;                             // bytes, > 0
};

type UploadCallOptions = {
  onProgress?: (percent: number) => void;   // 0..100 integer, bytes sent / total (site: XHR upload progress)
  signal?: AbortSignal;
};

// ---------- homeworks ----------
type HomeworkSummaryDto = {                 // = A2 A.2.15
  id: string;
  title: string | null;                     // custom title; label = title ?? format(dict.common.homeworkN, { n: orderInTopic })
  orderInTopic: number;
  topicId: string;
  topicTitle: string;
  deadlineAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  totalNumbers: number;
  solvedCount: number;                      // GREEN + YELLOW
  solvedPercent: number;                    // 0..100
  photosCount: number;                      // attached right now
  attentionRank: 0 | 1 | 2 | 3 | 4 | 5;     // 03 §4.1
  latestCheckStatus: SolutionCheckStatus | null;
  numbers: Array<{ homeworkNumberId: string; number: string; status: HomeworkNumberStatus | null }>;
};

type StudentCheckDto = {
  id: string;
  status: SolutionCheckStatus;
  errorCode: CheckErrorCode | null;         // FAILED only
  createdAt: IsoDateTime;
  checkedAt: IsoDateTime | null;            // DONE and FAILED
  results: Array<{                          // sorted by compareHomeworkNumbers(number); may be [] when DONE
    number: string;
    homeworkNumberId: string;
    verdict: SolutionVerdict;
    recognizedAnswer: string | null;        // null for UNCERTAIN
    comment: string | null;                 // UNCERTAIN: dict.student.uncertainComment in the request language
  }>;
};

type GetHomeworksResponse = {
  serverNow: IsoDateTime;
  available: boolean;                       // site: assignmentsEnabled (false only when the DB table is missing)
  limits: { maxPhotosPerAssignment: number };
  assignments: HomeworkSummaryDto[];        // attention-sorted by the server
};

type GetHomeworkResponse = {
  serverNow: IsoDateTime;
  limits: { maxPhotosPerAssignment: number; noteMaxLength: 240 };
  notesEnabled: boolean;
  aiCheckAvailable: boolean;
  assignment: Omit<HomeworkSummaryDto, "numbers"> & {
    photos: AttachedPhoto[];                // current batch, createdAt asc
    latestCheck: StudentCheckDto | null;
    numbers: Array<{
      homeworkNumberId: string;
      number: string;
      conditionLatex: string | null;
      status: HomeworkNumberStatus | null;
      note: string;                         // "" when none
    }>;                                     // sorted by compareHomeworkNumbers
  };
};

type UploadHomeworkPhotosResult = { photos: AttachedPhoto[]; photosCount: number };      // photos = the created ones
type DeleteHomeworkPhotoResult = { photosCount: number };
type StartHomeworkCheckResult = { check: StudentCheckDto };                             // status "PENDING", results []

type LatestHomeworkCheckResponse = {
  check: StudentCheckDto | null;            // newest by createdAt; null when the homework has never been checked
  photos: AttachedPhoto[];                  // current batch after a possible detach (03 §4.2 item 4)
  numbers: Array<{ homeworkNumberId: string; status: HomeworkNumberStatus | null }>;
  solvedCount: number;
};

// ---------- live lesson ----------
type LessonSubmissionDto = {
  id: string;
  itemId: string;
  status: SolutionCheckStatus;
  verdict: SolutionVerdict | null;          // DONE only
  comment: string | null;                   // DONE only; neutral text for UNCERTAIN
  errorCode: CheckErrorCode | null;         // FAILED only
  submittedAt: IsoDateTime;
  checkedAt: IsoDateTime | null;
};

type LessonItemDto = {
  id: string;                               // LessonAssignmentItem id — the id submitLessonItem takes
  order: number;
  isExtra: boolean;
  number: string;
  homeworkNumberId: string;
  topicId: string;
  topicTitle: string;
  conditionLatex: string | null;
  result: LessonItemResult | null;
  submission: LessonSubmissionDto | null;   // latest by submittedAt
  closed: boolean;                          // isLessonItemClosed (A.6 rule 7)
  canSubmit: boolean;                       // A.6 rule 7
};

type ActiveLessonDto = {
  lessonId: string;
  title: string;
  groupName: string | null;                 // null = individual lesson
  startsAt: IsoDateTime;
  durationMinutes: number;
  endsAt: IsoDateTime;                      // startsAt + durationMinutes · 60 000 ms (A.8 item 2)
  joinedAt: IsoDateTime | null;
  items: LessonItemDto[];                   // order asc
};

type UpcomingLessonDto = {
  lessonId: string;
  title: string;
  startsAt: IsoDateTime;
  durationMinutes: number;
  groupName: string | null;
};

type GetLessonResponse = {
  serverNow: IsoDateTime;
  limits: { maxPhotosPerSubmission: 3 };
  lessonCheckAvailable: boolean;
  active: ActiveLessonDto | null;
  upcoming: UpcomingLessonDto | null;
};

type JoinLessonResult = { joinedAt: IsoDateTime };
type SubmitLessonItemResult = { submission: LessonSubmissionDto };                      // status "PENDING"

type LessonStateResponse = {
  serverNow: IsoDateTime;
  status: DerivedLessonStatus;                                                          // never the stored Lesson.status (A4 §3.4, rule L2)
  items: Array<{
    id: string;
    result: LessonItemResult | null;
    submission: LessonSubmissionDto | null;
    closed: boolean;
    canSubmit: boolean;
  }>;                                                                                   // every item of the participant, order asc
};
```

Where each proposed field comes from **[CODE]**:

| Field | Source |
|---|---|
| `GetHomeworksResponse.available` | `getStudentHomeworks` → `assignmentsEnabled` (`false` only on a missing `HomeworkAssignment` table) |
| `limits.maxPhotosPerAssignment` | `getSiteSettings().maxPhotosPerAssignment` — read by the detail page and by the upload route |
| `aiCheckAvailable` | the condition the start route tests: `settings.aiEnabled && getAiCheckConfig(settings)` (else `503 disabled`). The site page does **not** compute it — the student learns it from the 503 |
| `lessonCheckAvailable` | the condition the submit route tests: `settings.aiEnabled && settings.lessonCheckEnabled && getAiCheckConfig(settings)` |
| `AttachedPhoto.mimeType`, `.createdAt` | selected by the reader (`photo.file.mimeType`, `photo.createdAt`); the site page forwards only `id`, `fileId`, `originalName` to the client |
| (no `size` in `AttachedPhoto`) | `StoredFile.size` is written by the upload transaction (`size: storedUpload.size`) but is **not** selected by `getStudentHomeworks` — see B.7 item 7 |
| `StudentCheckDto.createdAt` | `HomeworkCheck.createdAt` — mapped by the reader, not returned by the GET route |
| `results[].homeworkNumberId` | `HomeworkCheckResult.homeworkNumberId` — the reader uses it to resolve `number`; neither the page nor the GET route returns it |
| `LessonSubmissionDto` without `recognizedAnswer` | the site route returns it, the lesson screen does not render it (`03` §7 Q19) |
| `LessonStateResponse.items[].result` | `LessonAssignmentItem.result`; the site poll route does not return it — the site re-fetches the page instead |
| `LessonStateResponse.status` | `deriveLessonStatus({ status, startsAt, finishedAt, durationMinutes })` — the same call the join and submit routes make |
| `closed`, `canSubmit` | `isLessonItemClosed`, `canSubmitLessonItem`, `isExtraPartUnlocked` (`lib/lesson-live.ts`) — the site evaluates them both in the client component and in the submit route |

## A.4 The interface

```ts
interface StudentHomeworkLessonApi {
  // ----- homeworks (H1, H2) -----
  listHomeworks(opts?: { signal?: AbortSignal }): Promise<GetHomeworksResponse>;
  getHomework(assignmentId: string, opts?: { signal?: AbortSignal }): Promise<GetHomeworkResponse>;

  // ----- photo batch (H2.a, H4) -----
  uploadHomeworkPhotos(assignmentId: string, files: PhotoUpload[], opts?: UploadCallOptions): Promise<UploadHomeworkPhotosResult>;
  deleteHomeworkPhoto(assignmentId: string, photoId: string): Promise<DeleteHomeworkPhotoResult>;

  // ----- AI check (H2.b) -----
  startHomeworkCheck(assignmentId: string): Promise<StartHomeworkCheckResult>;
  getLatestHomeworkCheck(assignmentId: string, opts?: { signal?: AbortSignal }): Promise<LatestHomeworkCheckResponse>;

  // ----- live lesson (L1, L2) -----
  getLiveLesson(opts?: { signal?: AbortSignal }): Promise<GetLessonResponse>;
  joinLesson(lessonId: string): Promise<JoinLessonResult>;
  submitLessonItem(lessonId: string, itemId: string, files: PhotoUpload[], opts?: UploadCallOptions): Promise<SubmitLessonItemResult>;
  getLiveLessonState(lessonId: string, opts?: { signal?: AbortSignal }): Promise<LessonStateResponse>;
}
```

Conventions (same as every other member of `ApiClient`):

- Resolves to the wire body **without** `ok` (A2 A.0.4); rejects with `ApiError` (`90-addendum-1.md` A.2)
  whose `code` is one of the codes listed per method in A.5.
- An aborted call (`signal`) rejects with `ApiError { status: 0, code: "network" }`
  (`90-addendum-1.md` A.2: status `0` = no response, including aborted).
- Role: STUDENT. No session → `401 sessionExpired`; signed-in TEACHER / DEVELOPER → `403 unauthorized`
  (`90-addendum-1.md` A.7; **[CODE]** the four site routes answer `401 dict.apiCommon.sessionExpired` for
  both cases: `if (!user || user.role !== UserRole.STUDENT)`).
- **Not** in this interface: saving a note (`StudentStudyApi.saveNumberNote`), number search
  (`ShellApi.findNumber`), file bytes (`FileService`), realtime (`ShellApi.subscribeRealtime`).

## A.5 Operations

Global codes that every method can reject with and that are not repeated below: `sessionExpired` (401),
`unauthorized` (403), `serviceUnavailable` (503, `retryAfterSeconds: 5`, limiter store failure), `network`
(client-only). "Site order" = the order in which the route tests the conditions; the first failing one wins.

### A.5.1 `listHomeworks()` — `GET /student/homeworks`

- **Output:** `GetHomeworksResponse`. `assignments` are attention-sorted (`03` §4.1).
- **Limits:** none on the site (server-rendered, reader cached 15 s).
- **Errors:** global only. A missing table is **not** an error: `available: false`, `assignments: []`
  (**[CODE]** the page then shows the notice `dict.student.homeworks.migrationNotice`).

### A.5.2 `getHomework(assignmentId)` — `GET /student/homeworks/{assignmentId}`

- **Output:** `GetHomeworkResponse`.
- **Errors:** `404 homeworkNotFound` — unknown id, another student's homework, or the table is missing
  (**[CODE]** `if (!assignmentsEnabled || !assignment) notFound()`).

### A.5.3 `uploadHomeworkPhotos(assignmentId, files, opts?)` — `POST /student/homeworks/{assignmentId}/photos`

- **Input:** `files`: 1…N `PhotoUpload`; the request is `multipart/form-data`, repeated field `files`.
- **Output:** `UploadHomeworkPhotosResult`. All files of the call are stored or none.
- **Limits [CODE]:** rate limit scope `api:homework-submissions`, **60 / 60 s** per user, shared with
  `deleteHomeworkPhoto`; request body ≤ 15 MiB + 512 KiB (`MAX_UPLOAD_SIZE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES`
  = 15 728 640 + 524 288 bytes); sum of file sizes ≤ 15 728 640 bytes; `attached + files.length ≤
  maxPhotosPerAssignment` (setting, default 10).
- **Errors, site order:**

| # | Condition **[CODE]** | Code (HTTP) | In-process mock |
|---|---|---|---|
| 1 | per-user rate limit | `rateLimited` (429, `retryAfterSeconds`) | yes |
| 2 | `Content-Type` does not start with `multipart/form-data;` | `uploadNotMultipart` (415) | n/a (transport) |
| 3 | no `Content-Length` header | `uploadLengthRequired` (411) | n/a (transport) |
| 4 | `Content-Length` not digits / not a safe integer / ≤ 0 | `uploadInvalid` (400) | n/a (transport) |
| 5 | `Content-Length` > 15 MiB + 512 KiB | `uploadTooLarge` (413) | n/a (covered by #7) |
| 6 | form unparsable, no `files` entry, or an entry that is not a file / has `size ≤ 0` | `uploadInvalid` (400) | yes: `files.length === 0` or a `size ≤ 0` |
| 7 | sum of sizes not a safe integer or > 15 728 640 | `uploadTooLarge` (413) | yes |
| 8 | per file, `validateUploadMetadata` in this order: trimmed name empty or > 255 chars; name contains `U+0000–U+001F` or `U+007F`; extension not in `.pdf .docx .png .jpg .jpeg`; declared MIME non-empty, not `application/octet-stream` and ≠ the extension's MIME (`.png` → `image/png`, `.jpg` / `.jpeg` → `image/jpeg`) | `uploadBadName` (400, `params.max = 255` for the length case) · `uploadBadName` · `uploadUnsupportedType` · `uploadUnsupportedType` | yes |
| 9 | extension is not `.png` / `.jpg` / `.jpeg` (a valid `.pdf` / `.docx` reaches this row) | `uploadUnsupportedType` (400) | yes |
| 10 | homework not found for this student | `homeworkNotFound` (404) | yes |
| 11 | `attached + files.length > maxPhotosPerAssignment` | `photoLimit` (400, `params.max`) | yes |
| 12 | per file while storing (`validateUploadedBytes`): byte length ≠ declared size; magic bytes ≠ extension (PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`) | `uploadRejected` · `uploadUnsupportedType` (400) | optional (needs file bytes) |
| 13 | inside the Serializable transaction: homework gone / limit exceeded by a parallel upload | `homeworkNotFound` (404) / `photoLimit` (400) | n/a (single-threaded) |
| 14 | serialization conflict (Prisma `P2034`) | `concurrentChange` (409) | debug switch only |
| — | photo tables missing (Prisma `P2021`) | `migrationMissing` (503, `params.what = dict.apiStudent.upload.photoTable`) | no |

  **[CODE]** two `validateUploadMetadata` branches are unreachable on this route (and on A.5.9): "size ≤ 0"
  (`emptySize`) is caught earlier by row 6, and "size > 15 MiB" (`tooBig`) by row 7, because the aggregate
  check runs before the per-file check. The per-file `400` for `tooBig` discussed in `90-addendum-1.md` A.7
  therefore cannot occur for student uploads.
- **Side effects [CODE]:** one `StoredFile` (`uploadedById` = student) + one `HomeworkSubmissionPhoto` per
  file; realtime `student-progress-changed { studentId, topicId }`; no status change.

### A.5.4 `deleteHomeworkPhoto(assignmentId, photoId)` — `DELETE /student/homeworks/{assignmentId}/photos/{photoId}`

- **Output:** `DeleteHomeworkPhotoResult`.
- **Limits [CODE]:** `api:homework-submissions`, 60 / 60 s (the bucket of A.5.3).
- **Errors, site order:** `rateLimited` (429) → `migrationMissing` (503) → `photoNotFound` (404: the photo
  does not exist or is not attached to a homework **of this student**).
  **[DECISION]** the mobile path carries `assignmentId`; a photo of another homework of the same student is
  also `404 photoNotFound` (the site route looks the photo up by `photoId` + owner only, because its body has
  no `assignmentId`). The site's `400 invalidDeleteData` (empty `photoId`) cannot occur with a path parameter.
- **Side effects [CODE]:** deletes the `HomeworkSubmissionPhoto` row; the stored file is deleted only when
  nothing else references it (`deleteOwnedStoredFileIfUnused`); realtime `student-progress-changed`.

### A.5.5 `startHomeworkCheck(assignmentId)` — `POST /student/homeworks/{assignmentId}/checks`

- **Output:** `StartHomeworkCheckResult` — `check.status === "PENDING"`, `results: []`, `errorCode: null`,
  `checkedAt: null`.
- **Limits [CODE]:** waiting queue < `MAX_CHECK_QUEUE` (60, shared with lesson checks); per-student scope
  `api:homework-checks`, `aiPerStudentHourlyLimit` (default 10) per 3 600 000 ms — **consumed before any
  validation**; school-wide scope `api:homework-checks:global`, identifier `global`, `aiDailyLimit` per fixed
  UTC day (`90-addendum-3.md` §1.3) — consumed **last**.
- **Errors, site order:**

| # | Condition **[CODE]** | Code (HTTP) |
|---|---|---|
| 1 | `getHomeworkCheckQueueLength() >= MAX_CHECK_QUEUE` | `queueFull` (503, `retryAfterSeconds: 120`) |
| 2 | per-student hourly limit | `rateLimited` (429) |
| 3 | `!settings.aiEnabled \|\| !getAiCheckConfig(settings)` | `checkDisabled` (503, no retry-after) |
| 4 | (stale sweep of this homework's checks, `failStaleHomeworkChecks`) | — |
| 5 | homework not found for this student | `homeworkNotFound` (404) |
| 6 | no attached photo | `attachPhotosFirst` (400) |
| 7 | homework has no numbers | `noNumbers` (400) |
| 8 | another check of this homework is active (unique `activeSlot`, Prisma `P2002`) | `alreadyRunning` (409) |
| 9 | a photo disappeared while the snapshot was written (Prisma `P2003`) | `photosChanged` (409) |
| 10 | check tables missing | `migrationMissing` (503, `params.what = dict.apiStudent.homeworkChecks.checkTable`) |
| 11 | daily budget exhausted — the just-created check row is deleted again | `rateLimited` (429) |

  The site's `400 homeworkChecks.invalidData` (empty `assignmentId`) cannot occur with a path parameter.
- **Side effects [CODE]:** `HomeworkCheck { activeSlot: 1 }` + `HomeworkCheckPhoto` snapshot of the attached
  photos ordered by `createdAt asc, id asc` (`order` = index); the queue task carries the request language
  (language of the model's comments).

### A.5.6 `getLatestHomeworkCheck(assignmentId)` — `GET /student/homeworks/{assignmentId}/checks/latest`

- **Output:** `LatestHomeworkCheckResponse`.
- **Limits [CODE]:** scope `api:homework-check-status`, **120 / 60 s** per user.
- **Errors:** `rateLimited` (429); `homeworkNotFound` (404).
  **[DECISION]** unknown / foreign homework → `404 homeworkNotFound`. The site answers `200 { check: null }`
  in that case (**[CODE]** the query filters by `assignment.studentId` and the route has no separate ownership
  test), which is harmless there because the body carries nothing else; the mobile body also carries
  `photos`, `numbers` and `solvedCount`, which do not exist for a foreign id. `check: null` on the mobile
  endpoint means only "this homework has never been checked".
- **Server behaviour [CODE]:** runs the stale sweep for this homework first, so a dead check is returned as
  `FAILED`; then returns the newest check by `createdAt`; results go through `toStudentFacingResults`
  (sorted by `compareHomeworkNumbers`; `UNCERTAIN` → `recognizedAnswer: null`, comment replaced by
  `dict.student.uncertainComment` in the request language).

### A.5.7 `getLiveLesson()` — `GET /student/lesson`

- **Output:** `GetLessonResponse`.
- **Limits:** none on the site (server-rendered, `dynamic = "force-dynamic"`, reader uncached).
- **Errors:** global only. No lesson → `active: null`, `upcoming: null`.
- **Server behaviour [CODE]:** (1) `finalizeRecentlyFinishedLessons({ studentId })`; (2) `serverNow` is taken
  before the data query, so an `upcoming` lesson always starts after `serverNow`; (3) candidates = this
  student's participations in lessons with `kind = LESSON`, `startsAt != null`, `startsAt >= now − 24 h`,
  ordered by `startsAt asc`, first 20; `active` = first whose derived status is `ACTIVE`, `upcoming` = first
  whose derived status is `PLANNED` (computed even when `active` exists); (4) a recoverable DB error
  (`isRecoverablePlatformDataError`) yields `{ active: null, upcoming: null }`; (5) the submissions query is
  separate and failure-tolerant — before the submissions migration the items come back with
  `submission: null`.

### A.5.8 `joinLesson(lessonId)` — `POST /student/lessons/{lessonId}/join`

- **Output:** `JoinLessonResult` — the stored `joinedAt` (the value set by the first successful call; later
  calls return the same value).
- **Limits [CODE]:** scope `api:lesson-join`, **30 / 60 s** per user.
- **Errors, site order:** `rateLimited` (429) → `lessonNotFound` (404: the student is not a participant of a
  lesson with that id and `kind = LESSON`) → `lessonNotActive` (409: derived status ≠ `ACTIVE`).
- **Side effects [CODE]** (only when `joinedAt` was null): `joinedAt = now`; `attendance` `UNKNOWN → PRESENT`
  (any other attendance value is left untouched); realtime `lesson-activity { lessonId, teacherId, studentId }`.
- **Client rule:** call once each time L2 is entered; a rejection must not block the screen (**[CODE]** the
  site swallows it).

### A.5.9 `submitLessonItem(lessonId, itemId, files, opts?)` — `POST /student/lessons/{lessonId}/items/{itemId}/submissions`

- **Input:** `files`: 1…3 `PhotoUpload` (`LESSON_SUBMISSION_MAX_PHOTOS = 3`).
- **Output:** `SubmitLessonItemResult` — `submission.status === "PENDING"`.
- **Limits [CODE]:** queue < 60; per-student scope `api:lesson-checks`, `lessonCheckPerStudentHourlyLimit`
  (default 30) per 3 600 000 ms — consumed before any validation; body ≤ 15 MiB + 512 KiB; sum of sizes ≤
  15 MiB; school-wide scope `api:lesson-checks:global`, `lessonCheckDailyLimit` per fixed UTC day — consumed
  last; one active submission **per item** (other items may be checked in parallel).
- **Errors, site order:**

| # | Condition **[CODE]** | Code (HTTP) | In-process mock |
|---|---|---|---|
| 1 | queue length ≥ 60 | `queueFull` (503, `retryAfterSeconds: 120`) | debug switch |
| 2 | per-student hourly limit | `rateLimited` (429) | yes |
| 3 | `!aiEnabled \|\| !lessonCheckEnabled \|\| !getAiCheckConfig(settings)` | `checkDisabled` (503) | debug switch |
| 4 | not multipart | `uploadNotMultipart` (415) | n/a |
| 5 | `Content-Length` missing **or** not digits / ≤ 0 (missing is **400** here, not 411) | `uploadInvalid` (400) | n/a |
| 6 | `Content-Length` > 15 MiB + 512 KiB | `uploadTooLarge` (413) | n/a |
| 7 | form unparsable, no file, a zero-size entry | `uploadInvalid` (400) | yes |
| 8 | `files.length > 3` | `photoLimit` (400, `params.max = 3`) | yes |
| 9 | sum of sizes > 15 728 640 | `uploadTooLarge` (413) | yes |
| 10 | per-file metadata and PNG / JPG only (A.5.3 rows 8–9) | `uploadBadName` / `uploadUnsupportedType` (400) | yes |
| 11 | item is not part of **this student's** participation in a `LESSON`-kind lesson | `itemNotFound` (404) | yes |
| 12 | derived lesson status ≠ `ACTIVE` | `lessonNotActive` (409) | yes |
| 13 | (stale sweep of this student's submissions in the lesson, `failStaleLessonSubmissions`) | — | yes |
| 14 | `!canSubmitLessonItem(item)` — item closed | `alreadyAccepted` (409, `params.number`) | yes |
| 15 | `item.isExtra && !isExtraPartUnlocked(items)` | `extraPartLocked` (409) | yes |
| 16 | file bytes (A.5.3 row 12) | `uploadRejected` / `uploadUnsupportedType` (400) | optional |
| 17 | another submission of this item is active (Prisma `P2002`) | `alreadyRunning` (409) | yes |
| 18 | serialization conflict (`P2034`) | `concurrentChange` (409) | debug switch |
| 19 | daily lesson budget exhausted — the submission row, its `StoredFile` rows and the stored files are removed again | `rateLimited` (429) | yes |
| — | submission tables missing (Prisma `P2021`; detected when the participant's items are read for rows 14–15, or inside the transaction) | `migrationMissing` (503, `params.what = dict.apiStudent.lessonSubmissions.submissionTable`) | no |

  **[DECISION]** the mobile path carries `lessonId`; an item that belongs to another lesson of the same
  student is `404 itemNotFound` (the site finds the item by `itemId` + owner and derives the lesson from it).
- **Side effects [CODE]**, in the same Serializable transaction as the submission row:
  `LessonItemSubmission { activeSlot: 1 }` + `LessonSubmissionPhoto` rows (`order` = index in the request);
  `joinedAt = now` if it was null; `attendance` `UNKNOWN → PRESENT`. After commit: queue task with the request
  language; realtime `lesson-activity { lessonId, teacherId, studentId }`.

### A.5.10 `getLiveLessonState(lessonId)` — `GET /student/lessons/{lessonId}/state`

- **Output:** `LessonStateResponse`.
- **Limits [CODE]:** scope `api:lesson-check-status`, **120 / 60 s** per user.
- **Errors:** `rateLimited` (429); `lessonNotFound` (404 — **[DECISION]**, same reasoning as A.5.6: the site
  answers `200 { submissions: [] }` for a foreign / unknown lesson).
- **Server behaviour [CODE]:** stale sweep for this student in this lesson first; latest submission per item =
  first row per `itemId` in `submittedAt desc` order; `verdict` / `comment` are filled only for `DONE` rows
  that have a verdict (through `toStudentFacingResult`); the raw `error` is exposed only for `FAILED` rows
  (mobile: its class as `errorCode`).
- The method is valid for a lesson in any status: `status: "FINISHED"` (scheduled end reached or the teacher
  finished early) is how the app learns that L2 is over (`03` §7 Q7).

## A.6 Business rules for the client and the mock

1. **Polling belongs to the screen hook, not to the client method** (one request per call). The algorithm is
   the site's (**[CODE]** `POLL_BASE_DELAY_MS = 4000`, `MAX_POLL_FAILURES = 5` in both
   `student-homework-check.tsx` and `student-lesson-view.tsx`): first poll 4000 ms after something is
   `PENDING` / `CHECKING`; next delay `4000 · min(2^failures, 8)` ms; stop after 5 consecutive failures and
   show the "poll broken" message; a new start / submit resets the counter; timers are cleared on unmount; a
   screen opened while something is running resumes polling. Homework: stop when `check.status` is `DONE` or
   `FAILED`. Lesson: continue while any `submission.status` is `PENDING` / `CHECKING`.
2. **Optimistic state after a start / submit** comes from the method result (`check` / `submission` with
   `PENDING`), replacing the site's locally fabricated snapshot (**[CODE]** the site builds
   `{ id: checkId, status: "PENDING", … }` and, for a lesson, `id: submissionId ?? "local-<timestamp>"`).
3. **Query invalidation** (A2 A.2.15 rule: what invalidates one homework query invalidates the other):

| After | Update in place | Invalidate |
|---|---|---|
| `uploadHomeworkPhotos` / `deleteHomeworkPhoto` resolved | `getHomework(id)`: `photos`, `photosCount` | `listHomeworks` (`photosCount`) |
| `getLatestHomeworkCheck` returned `DONE` | `getHomework(id)`: `latestCheck`, `photos`, number statuses, `solvedCount` | `listHomeworks`, `studentStudy.getHomeworkDeadlines`, `shell.getStreak`, `shell.listNotifications` (`homework-checked`, `03` §4.2 item 8) |
| `getLatestHomeworkCheck` returned `FAILED` | `getHomework(id)`: `latestCheck` | `listHomeworks` (`latestCheckStatus`) |
| `getLiveLessonState` returned a changed `result` | `getLiveLesson`: item `result`, `submission`, `closed`, `canSubmit` | `listHomeworks`, `studentStudy.getHomeworkDeadlines`, `shell.getStreak` (lesson results are mirrored into the number status, `03` §4.7) |
| `getLiveLessonState` returned `status !== "ACTIVE"` | — | `getLiveLesson` (screen switches L2 → L1) |
| a rejection with `lessonNotActive` | — | `getLiveLesson` |

   The site does the same with a full page re-fetch (**[CODE]** `router.refresh()` after an upload, a delete,
   a terminal homework poll, and a lesson poll in which a known submission turned terminal).
4. **Mock — shared store.** `MockApiClient.studentWork` reads and writes the same in-memory store as every
   other namespace (A2 A.4). Consequences that must hold: a status written by a mocked check is visible in
   `studentStudy.getNumberDetail`, `studentStudy.getHomeworkDeadlines`, `shell.getStreak`, the teacher's
   `teacherStudents.getStudentHomeworks` and `planner.getLessonLive`; a file created by an upload is
   resolvable by the mock `FileService` under its `fileId` (`09` §5.2: picked files are stored in the app's
   document directory with a `StoredFile` row carrying the real `size` / `mimeType`).
5. **Mock — check lifecycle.** `startHomeworkCheck` and `submitLessonItem` create the row and schedule the
   transitions of `03` §4.3 with the timings of `09` §2.2 item 4 (`PENDING` → 1 s → `CHECKING` → 6–8 s →
   `DONE` / `FAILED`); verdicts are scripted per fixture. On homework `DONE`: write statuses through the
   ported `decideProgressChange` (`03` §4.4), detach the snapshot photos (`03` §4.2 item 4), create the
   `homework-checked` notification. On lesson `DONE`: `decideAutoLessonResult` + status mirror (`03` §4.7).
   On `FAILED`: nothing else changes. `errorCode` of a mocked failure is set directly from the scenario
   (`03` §4.5 class), not by matching text. **[SPEC]** `03` §4.3 suggests other mock delays (0.5–2 s, then
   2–6 s); **[DECISION]** the values of `09` §2.2 apply, because `09` owns the mock dataset and its clock.
6. **Mock — limits.** The per-student and the daily buckets use the single fixed-window limiter of
   `90-addendum-3.md` §9 with the scopes named in A.5.5 / A.5.9; the order "hourly limit first, daily budget
   last with rollback of the created row" is the site's and must be kept, otherwise a refused attempt leaves
   a `PENDING` row behind. Debug switches (`03` §6.5, `90-addendum-1.md` A.3 rule 9) cover the rows marked
   "debug switch" in A.5.
7. **`closed` / `canSubmit`**, computed by the server and by the mock per item from the pure functions of
   `lib/lesson-live.ts` **[CODE]**:
   - `closed = isLessonItemClosed({ result, latestVerdict })` =
     `result ∈ { SOLVED, PARTIAL, SKIPPED } || latestVerdict === "CORRECT"`;
   - `latestVerdict` has two derivations on the site: the submit route takes the verdict of the newest
     submission **with status `DONE`** (`submissions where status = DONE order by submittedAt desc take 1`);
     the client component takes the verdict of the **latest** submission if that one is `DONE`, else `null`
     (`toLiveState` in `student-lesson-view.tsx`). The mobile server and the mock use the route's derivation;
   - `extraUnlocked = isExtraPartUnlocked(items)` = there are no main items, or every main item is closed;
   - `canSubmit` — the site client's expression is `!locked && !checking && canSubmitLessonItem(state)` with
     `locked` = extra item while `!extraUnlocked` and `checking` = latest submission `PENDING` / `CHECKING`.
     Mobile: the same, and additionally `false` when the derived lesson status is not `ACTIVE` (the submit
     route answers `409 lessonNotActive` then).
   `NOT_SOLVED` does not close an item — the student may re-submit it during the lesson.
8. **Join and attendance.** `joinLesson` and `submitLessonItem` both stamp `joinedAt` (when null) and move
   `attendance` from `UNKNOWN` to `PRESENT`; attendance is never returned to the student (`03` §4.9).
9. **Uploads.** The app validates before calling (`09` §5.2): re-encode camera output to JPEG, name ending
   `.jpg`, MIME `image/jpeg`; cap the picker at `maxPhotosPerAssignment − photos.length` (homework) and 3
   (lesson item) (`03` §7 Q14); pre-check the 15 MiB sum. The methods still reject with the A.5 codes — the
   client checks are a convenience, not the rule.

## A.7 Proposed mobile endpoints (wire contract of the ten methods)

Relative to `/api/mobile/v1`; bearer auth; `Accept-Language`. Success bodies carry `ok: true` where the site
body does (A2 A.0.4); the typed methods drop it.

| Method | Endpoint | Request | 2xx body |
|---|---|---|---|
| `listHomeworks` | `GET /student/homeworks` | — | `GetHomeworksResponse` |
| `getHomework` | `GET /student/homeworks/{assignmentId}` | — | `GetHomeworkResponse` |
| `uploadHomeworkPhotos` | `POST /student/homeworks/{assignmentId}/photos` | multipart, `files` × 1…N | `{ ok: true } & UploadHomeworkPhotosResult` |
| `deleteHomeworkPhoto` | `DELETE /student/homeworks/{assignmentId}/photos/{photoId}` | — | `{ ok: true } & DeleteHomeworkPhotoResult` |
| `startHomeworkCheck` | `POST /student/homeworks/{assignmentId}/checks` | — | `{ ok: true } & StartHomeworkCheckResult` |
| `getLatestHomeworkCheck` | `GET /student/homeworks/{assignmentId}/checks/latest` | — | `LatestHomeworkCheckResponse` |
| `getLiveLesson` | `GET /student/lesson` | — | `GetLessonResponse` |
| `joinLesson` | `POST /student/lessons/{lessonId}/join` | — | `{ ok: true } & JoinLessonResult` |
| `submitLessonItem` | `POST /student/lessons/{lessonId}/items/{itemId}/submissions` | multipart, `files` × 1…3 | `{ ok: true } & SubmitLessonItemResult` |
| `getLiveLessonState` | `GET /student/lessons/{lessonId}/state` | — | `LessonStateResponse` |

The two other rows of `03` §6.1 are not endpoints of this subsystem (A2 A.2.14, A.2.1):
`PUT /student/numbers/{homeworkNumberId}/note` is owned by `02` §6.7, `GET /student/numbers/find` is replaced
by `GET /numbers/find` of `01` §6.6.

## A.8 Corrections to `03-student-homework-lesson.md`

1. **`HomeworkPhotoDto` (`03` §6.1)** — already corrected by A4 §3.8: the type is `AttachedPhoto`, without
   `url` / `thumbUrl`. This addendum uses it in all three places a photo list is returned (`getHomework`,
   `uploadHomeworkPhotos`, `getLatestHomeworkCheck`). One more reason for the removal, specific to the client
   layer: in `MockApiClient` no HTTP URL exists at all, so a DTO field holding a URL could not be filled. The
   app builds image sources with `FileService.source(fileId)` / `FileService.source(fileId, "thumb")`.
   **[CODE]** this mirrors the site, where the props carry only `fileId` and the component builds
   `/files/{fileId}` and `/files/{fileId}?thumb=1` itself.
2. **CORRECTION to `03` §6.2 (`ActiveLessonDto.endsAt`, comment "`finishedAt ?? startsAt + duration`"):**
   `endsAt = startsAt + durationMinutes · 60 000 ms`. **[CODE]** `deriveLessonStatus` returns `FINISHED` as
   soon as `finishedAt <= now`, so a lesson that is `ACTIVE` never has a `finishedAt` in the past, and a
   `finishedAt` in the future is ignored by the function (it falls through to the schedule). The site's end
   timer uses the same formula: `new Date(startsAt).getTime() + Math.max(0, durationMinutes) * 60_000`, plus
   1000 ms grace (`components/student-lesson-view.tsx`). An early finish is observed through
   `LessonStateResponse.status`, not through `endsAt`.
3. **CORRECTION to `03` §6.1 (row `GET …/checks/latest`, errors "`RATE_LIMITED`" only) and §6.2 (row
   `GET …/state`):** add `404 homeworkNotFound` / keep `404 lessonNotFound`, with the meaning of `check: null`
   narrowed as stated in A.5.6. The description of the **site** routes in `03` §3.4 / §3.8 (`null` / `[]` for
   a foreign id) is correct and unchanged.
4. **CORRECTION to `03` §6.1 / §6.2 (path tables):** the `DELETE …/photos/{photoId}` and
   `POST …/items/{itemId}/submissions` rows gain the ownership rule of the extra path parameter (A.5.4,
   A.5.9); response names are those of A.3 (`UploadHomeworkPhotosResult`, …).
5. **CORRECTION to `03` §6.2 (`LessonItemDto.closed`, `canSubmit` — "optional"):** they are **required** in
   `LessonItemDto` and in `LessonStateResponse.items[]` **[DECISION]**. The site keeps this rule in two
   places (client component and submit route) with two derivations of `latestVerdict` (A.6 rule 7); one
   server-computed value per item removes the second implementation, and lets the poll unlock the extra part
   and lock an accepted item without the client recomputing anything. The pure helpers
   (`isLessonItemClosed`, `isExtraPartUnlocked`, `canSubmitLessonItem`) are still ported (`09` §1.6) for the
   mock and for the optimistic state between a submit and the next poll.
6. **CORRECTION to `03` §6.2 (`LessonItemDto.conditionLatex` — "server MAY omit statements of a locked extra
   part"):** not adopted. **[CODE]** `getStudentLiveLesson` selects `conditionLatex` for every item of the
   participant, main and extra alike, and the page passes it on; the mobile contract returns it for every
   item.

---

# Part B — One `ApiClient`: composition and method ownership

**CORRECTION to `09-data-i18n-math.md` Appendix C** (last paragraph, "`ApiClient` interface →
`MockApiClient` …, `HttpApiClient` later"): the `ApiClient` is the composition defined in B.3. It contains
only server operations; `FileService` and `PreferencesStore` are separate services next to it.

## B.1 Decisions

1. **[DECISION] `ApiClient` is an object of nine named members**, one per existing interface plus the new
   one. Not a flat intersection: with 112 methods the member name tells the reader which spec owns a call,
   and the mock can be written and tested one member at a time.
2. **[DECISION] Two implementations of the whole object**: `MockApiClient` (now) and `HttpApiClient`
   (later). A screen never imports either class — it receives `ApiClient` from a provider, so switching is
   one line in the composition root.
3. **[DECISION] One method — one interface.** A method name appears in exactly one member interface, and no
   name is used twice across the whole client (so the members could also be flattened without conflicts).
   Table B.4 is the complete list. A superseded method must not exist in `MockApiClient` (A2 A.4).
4. **[DECISION] Screens call across members.** Ownership follows the operation, not the screen: a screen of
   spec `04` calls `api.planner.*` and `api.content.*` where B.5 says so. No member re-exports another
   member's method.
5. **[DECISION] `FileService` and `PreferencesStore` are not members of `ApiClient`.**
   `FileService` has a mock and an HTTP implementation but returns sources / local URIs, not DTOs
   (`09` §5.2). `PreferencesStore` has **one** implementation for both modes: **[CODE]** theme and hints live
   in `localStorage` (keys `shbz-theme`, `shbz-hints`; `components/interface-settings-panel.tsx`,
   `app/layout.tsx`) and the language in a device cookie written by `setLocaleAction`, whose own comment
   says "Язык — настройка устройства, как тема: … аккаунт не нужен и в базу ничего не пишется"
   (`actions/locale.ts`); `08` §14 states that v1 needs no endpoint.
6. **Typed results** follow A2 A.0.4 (wire body without `ok`); **errors** follow `90-addendum-1.md` A.2 — the
   single `ApiError` class is thrown by every method of every member, in both implementations.

## B.2 Resolutions made by this addendum

### B.2.1 `deleteStudent`, `resetStudentPassword` — declared twice in `04` §6.8

**[CODE]** There is one server action for each, serving both roles: `deleteStudentAction` and
`resetStudentPasswordAction` in `actions/student.ts` both start with
`requireUser([UserRole.TEACHER, UserRole.DEVELOPER])`; a TEACHER is limited to own students, a DEVELOPER may
target any; the only role difference is the redirect target (`/teacher/students` vs `/developer/accounts`).
The developer-only actions live in a different file (`actions/account.ts`: `createAccountAction`,
`changeStudentOwnersAction`, `deleteTeacherAction`, `resetTeacherPasswordAction`, all
`requireUser(UserRole.DEVELOPER)`). **[SPEC]** `04` §6.7 already says "Student password reset and student
deletion reuse 6.1".

**CORRECTION to `04-teacher-students.md` §6.8:** `DeveloperAccountsApi.deleteStudent` and
`DeveloperAccountsApi.resetStudentPassword` are removed. The Accounts screen (DEVELOPER, `04` S9) calls
`api.teacherStudents.deleteStudent(studentId)` and `api.teacherStudents.resetStudentPassword(studentId,
password)` — endpoints `DELETE /teacher/students/{studentId}` and `POST /teacher/students/{studentId}/password`
(`04` §6.1, roles "TEACHER own · DEVELOPER any"). After either call the Accounts screen invalidates
`api.accounts.getAccounts`; the teacher's list invalidates `api.teacherStudents.listStudents`.

### B.2.2 `subscribeRealtime` (`01`) vs `subscribe` (`02`)

**[CODE]** The site opens exactly one stream per signed-in user: `new EventSource("/api/realtime")` inside
`DashboardRealtimeListener`, mounted once in `app/(dashboard)/layout.tsx` for every role. The server allows
`DASHBOARD_REALTIME_MAX_CONNECTIONS_PER_USER = 2` streams per user (third → `429
dict.apiStudent.realtime.tooManyConnections`, `Retry-After: 5`), connect rate limit `api:realtime-connect`
30 / 60 s, first frame `{ kind: "connected", occurredAt }`, comment `: ping` every 25 000 ms. Events are the
five kinds of `DashboardRealtimeEvent` (`lib/dashboard-realtime.ts`): `students-changed`,
`topic-content-changed`, `student-progress-changed`, `student-deadlines-changed`, `lesson-activity`.
Server-side filter (`shouldReceiveDashboardRealtimeEvent`):

| Viewer | Receives |
|---|---|
| DEVELOPER | every event |
| TEACHER | `students-changed`, `topic-content-changed` always; `lesson-activity` when `event.teacherId === user.id`; `student-progress-changed` / `student-deadlines-changed` when `event.studentId` is one of the teacher's students (list loaded at connect and reloaded on every `students-changed`; until it is loaded, all of them) |
| STUDENT | never `students-changed`; `topic-content-changed` always; the other three only when `event.studentId === user.id` (a `lesson-activity` without `studentId` is therefore not delivered) |

**CORRECTION to `02-student-study.md` §6.11:** `StudentStudyApi.subscribe` is removed. The only realtime
method is

```ts
// ShellApi (01 §6.9)
subscribeRealtime(listener: (event: DashboardRealtimeEvent) => void): () => void;   // returns unsubscribe
```

Rules for both implementations: one underlying stream per signed-in user regardless of the number of
listeners (opened on the first subscription, closed after the last unsubscribe and on logout); the
`connected` frame is swallowed, listeners receive only the five event kinds; `MockApiClient` is one
in-process emitter that every mocked mutation publishes to and that applies the filter table above for the
signed-in mock user. Screens of `02`–`07` subscribe through `api.shell.subscribeRealtime`.

### B.2.3 `saveHomeworkPlanItems` vs `saveLessonItems` (`05`)

**[CODE]** The homework-draft board saves a participant's set with
`PATCH /api/teacher/lessons/${plan.id}/participants/${participantId}/items` and regenerates with
`POST /api/teacher/lessons/${plan.id}/participants/${participantId}/regenerate`
(`components/teacher-homework-plan-board.tsx`) — the lesson routes, with the draft id in place of the lesson
id. Only status, issue and delete use `/api/teacher/homework-plans/{planId}/…`. A2 A.2.2 already makes the
draft path an alias of the same handler and A2 A.3 renamed the first parameter to `lessonOrPlanId`.

**CORRECTION to `05-teacher-lessons-plans.md` §6 (typed client):** `saveHomeworkPlanItems(planId,
participantId, ids): Promise<HomeworkPlanItem[]>` is removed. The draft board calls
`api.planner.saveLessonItems(planId, participantId, ids)` and reads from the returned `LessonBoardItem[]`
only the fields a draft has (A2 A.2.2: it ignores `isExtra`, `result`, `submission`).

### B.2.4 Download results: `localUri` (`04`) vs `uri` (`06`)

**[SPEC]** `04` §6.8 `downloadStudentReport(...): Promise<{ localUri: string; fileName: string }>`; `06` §6.6
`downloadGroupAttendancePdf(...): Promise<{ uri: string; fileName: string }>`; `09` §5.2
`FileService.download(...): Promise<string>` (a local file URI).

**[DECISION]** one result type for every client method that downloads a generated document:

```ts
type DownloadedFile = { uri: string; fileName: string };   // uri = local file URI in the app cache
```

**CORRECTION to `04-teacher-students.md` §6.8:** `downloadStudentReport` returns `DownloadedFile`
(`localUri` → `uri`). `06` is unchanged. `FileService.download` keeps returning the bare URI (its caller
already holds the `FileRef` with the name).

### B.2.5 Typed `Promise<void>` where the wire body carries data

A2 A.0.4 ("typed methods resolve to the wire body without `ok`") was applied by A2 A.3 only to the methods it
touched. **[SPEC]** the remaining mismatches inside the specs:

| Method | Wire body in the owner spec | Typed result (canonical) |
|---|---|---|
| `DeveloperAccountsApi.deleteTeacher` | `04` §6.7: `{ ok: true; transferredStudents: number }` | `Promise<{ transferredStudents: number }>` |
| `TeacherStudentsApi.setNumberStatuses` | `04` §6.4: `{ results: Array<{ homeworkNumberId; status }> }` | `Promise<{ results: Array<{ homeworkNumberId: string; status: HomeworkNumberStatus \| null }> }>` |
| `TeacherStudentsApi.setNumberDeadlines` | `04` §6.4: `{ deadlineAt; homeworkNumberIds }` | `Promise<{ deadlineAt: IsoDateTime \| null; homeworkNumberIds: string[] }>` |
| `TeacherPlannerApi.finishLesson` | `05` §6: `{ ok: true; finalized: { notSolved: number; skipped: number } }` | `Promise<{ finalized: { notSolved: number; skipped: number } }>` |

**[CODE]** for the last row: the site route `POST /api/teacher/lessons/{lessonId}/finish` answers
`{ ok: true }` only; `finalized` is a field the mobile endpoint adds.

Methods whose wire body is exactly `{ ok: true }` (or `204`) stay `Promise<void>`.

## B.3 The composition

```ts
/** Every server operation of the app. Implemented by MockApiClient now and HttpApiClient later. */
interface ApiClient {
  shell: ShellApi;                          // 01 — session, profile, notifications, streak, number search, realtime
  studentStudy: StudentStudyApi;            // 02 — deadlines, theory, number detail, note
  studentWork: StudentHomeworkLessonApi;    // 03 — homeworks, photos, AI check, live lesson (Part A)
  teacherStudents: TeacherStudentsApi;      // 04 — teacher home, students, homework review / assign, progress history, report
  accounts: DeveloperAccountsApi;           // 04 — developer accounts
  planner: TeacherPlannerApi;               // 05 — lessons, live board, homework drafts
  groups: GroupsCallsStatsApi;              // 06 — groups, attendance, parent calls, statistics
  content: ContentApi;                      // 07 — topics, numbers, statements / answers, import, upload
  developer: DeveloperApi;                  // 07 — dev panel, settings, actions, broadcast, journal
}

/** What the composition root provides to the UI. */
interface AppServices {
  api: ApiClient;
  files: FileService;                       // 09 §5.2 — source(fileId, variant?) / download(fileRef, onProgress?)
  preferences: PreferencesStore;            // 08 §14 — device storage; the same implementation in both modes
}
```

Cross-cutting inputs every implementation takes at construction (they are not methods of any member):

| Input | `MockApiClient` | `HttpApiClient` |
|---|---|---|
| Current session | id of the signed-in mock user, set by `shell.login`, cleared by `shell.logout` | bearer token from secure storage (`01` §7 item 3); replaced after `shell.login` and `shell.changePassword` (both return a new `token`) |
| Language | `preferences` locale → language of `ApiError.message`, of rendered notification text and of mocked AI comments | header `Accept-Language: ru \| en` on every request (`08` §14) |
| Session-expired hook | fired when a method rejects with `code === "sessionExpired"` | same (`90-addendum-1.md` A.3 rule 1) |
| Clock | the mock clock of `09` §2.2 (seed anchor `T0`) | device clock corrected by `serverNow` of the responses |
| Store | the in-memory dataset of `09` §2, shared by all nine members and by the mock `FileService` | — |

`FileService` shares the session input: the HTTP implementation sends the same bearer token on
`GET /files/{fileId}[?thumb=1][&download=1]` (A2 A.2.10); the mock implementation resolves `fileId` in the
shared store (bundled assets for seeded files, document-directory files for uploads).

## B.4 Method ownership — the complete list (112 methods)

Signatures: the owner section named in each heading, as amended by A2 A.3 and by B.2 above. Endpoints are
relative to `/api/mobile/v1`, with the corrections of `90-addendum-1.md` and A2 applied.

### `ShellApi` — owner `01` §6.9 (11 methods)

| Method | Endpoint | Note |
|---|---|---|
| `getMeta` | `GET /meta` | replaces `getPublicConfig` (A2 A.2.12); no auth |
| `login` | `POST /auth/login` | |
| `logout` | `POST /auth/logout` | |
| `getMe` | `GET /me` | |
| `updateProfile` | `PATCH /me` | |
| `changePassword` | `POST /me/password` | returns the rotated token |
| `listNotifications` | `GET /notifications` | returns `NotificationsResponse` (A2 A.2.17) |
| `markNotificationsRead` | `POST /notifications/read` | |
| `getStreak` | `GET /student/streak` | STUDENT; the only streak method (A2 A.2.16) |
| `findNumber` | `GET /numbers/find?number=` | the only number-search method (A2 A.2.1) |
| `subscribeRealtime` | `GET /realtime` (SSE) | the only realtime method (B.2.2) |

### `StudentStudyApi` — owner `02` §6.11 (4 methods)

| Method | Endpoint | Note |
|---|---|---|
| `getHomeworkDeadlines` | `GET /student/homework-deadlines` | light list for home and calendar (A2 A.2.15) |
| `getTheoryLibrary` | `GET /student/theory` | |
| `getNumberDetail` | `GET /student/numbers/{number}` | |
| `saveNumberNote` | `PUT /student/numbers/{homeworkNumberId}/note` | the only note method (A2 A.2.14); also called by `03` H2.c |

Removed: `getHome`, `getStreak`, `lookupNumber`, `getFileUrl` (A2), `subscribe` (B.2.2).

### `StudentHomeworkLessonApi` — owner `03` §6.7 = Part A of this addendum (10 methods)

| Method | Endpoint |
|---|---|
| `listHomeworks` | `GET /student/homeworks` |
| `getHomework` | `GET /student/homeworks/{assignmentId}` |
| `uploadHomeworkPhotos` | `POST /student/homeworks/{assignmentId}/photos` |
| `deleteHomeworkPhoto` | `DELETE /student/homeworks/{assignmentId}/photos/{photoId}` |
| `startHomeworkCheck` | `POST /student/homeworks/{assignmentId}/checks` |
| `getLatestHomeworkCheck` | `GET /student/homeworks/{assignmentId}/checks/latest` |
| `getLiveLesson` | `GET /student/lesson` |
| `joinLesson` | `POST /student/lessons/{lessonId}/join` |
| `submitLessonItem` | `POST /student/lessons/{lessonId}/items/{itemId}/submissions` |
| `getLiveLessonState` | `GET /student/lessons/{lessonId}/state` |

### `TeacherStudentsApi` — owner `04` §6.8 (16 methods)

| Method | Endpoint | Note |
|---|---|---|
| `getTeacherHome` | `GET /teacher/home` | |
| `listStudents` | `GET /teacher/students` | |
| `createStudent` | `POST /teacher/students` | TEACHER only |
| `deleteStudent` | `DELETE /teacher/students/{studentId}` | TEACHER own · DEVELOPER any; the only declaration (B.2.1) |
| `resetStudentPassword` | `POST /teacher/students/{studentId}/password` | TEACHER own · DEVELOPER any; the only declaration (B.2.1) |
| `getStudentCard` | `GET /teacher/students/{studentId}` | |
| `getStudentHomeworks` | `GET /teacher/students/{studentId}/homeworks` | |
| `getAssignBoard` | `GET /teacher/students/{studentId}/assign-board` | |
| `issueHomework` | `POST /teacher/homeworks` | |
| `cancelHomework` | `DELETE /teacher/homeworks/{assignmentId}` | |
| `setNumberStatus` | `PUT /teacher/students/{studentId}/numbers/{homeworkNumberId}/status` | result per A2 A.2.19 |
| `setNumberStatuses` | `POST /teacher/students/{studentId}/number-statuses` | result per B.2.5 |
| `setNumberDeadlines` | `PUT /teacher/students/{studentId}/deadlines` | result per B.2.5; **[CODE]** no site component calls the site route `POST /api/teacher/student-deadlines` (`04` §7 Q2) |
| `getProgressHistory` | `GET /progress-history?studentId=&homeworkNumberId=&cursor=` | path per A2 A.2.8; also called by `05` (lesson board) and `07` (journal) |
| `listStudentLessons` | `GET /teacher/students/{studentId}/lessons` | |
| `downloadStudentReport` | `GET /teacher/students/{studentId}/report.pdf?period=` | result `DownloadedFile` (B.2.4) |

Removed: `getTopicConditions`, `getNumberBank`, `getLessonComposeContext` (A2). The comment line
"create lesson / status / items / result / regenerate — from the lessons subsystem client" in `04` §6.8 means
`api.planner.*`.

### `DeveloperAccountsApi` — owner `04` §6.8 (5 methods)

| Method | Endpoint | Note |
|---|---|---|
| `getAccounts` | `GET /developer/accounts` | |
| `createAccount` | `POST /developer/accounts` | |
| `changeStudentOwners` | `PUT /developer/students/owners` | |
| `resetTeacherPassword` | `POST /developer/teachers/{teacherId}/password` | |
| `deleteTeacher` | `DELETE /developer/teachers/{teacherId}?transferToTeacherId=` | result per B.2.5 |

Removed: `deleteStudent`, `resetStudentPassword` (B.2.1).

### `TeacherPlannerApi` — owner `05` §6 (22 methods)

| Method | Endpoint | Note |
|---|---|---|
| `listLessons` | `GET /teacher/lessons` | |
| `getLessonTargets` | `GET /teacher/lessons/new-options` | |
| `getLessonNewForm` | `GET /teacher/lessons/new-form?groupId=` \| `?studentId=` | also the compose data of `04` S7 (A2 A.2.7) |
| `getNumberBank` | `GET /teacher/number-bank` | the only bank method (A2 A.2.7) |
| `createLesson` | `POST /teacher/lessons` | |
| `getLessonBoard` | `GET /teacher/lessons/{lessonId}` | |
| `getLessonStatus` | `GET /teacher/lessons/{lessonId}/status` | |
| `getLessonLive` | `GET /teacher/lessons/{lessonId}/live` | |
| `scheduleLesson` | `PATCH /teacher/lessons/{lessonId}` | |
| `finishLesson` | `POST /teacher/lessons/{lessonId}/finish` | result per B.2.5 |
| `deleteLesson` | `DELETE /teacher/lessons/{lessonId}` | |
| `saveLessonItems` | `PATCH /teacher/lessons/{lessonOrPlanId}/participants/{participantId}/items` | lessons **and** drafts (B.2.3) |
| `regenerateParticipant` | `POST /teacher/lessons/{lessonOrPlanId}/participants/{participantId}/regenerate` | lessons and drafts (A2 A.2.4) |
| `setItemResult` | `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/items/{itemId}/result` | |
| `getHandoutUrl` | `GET /teacher/lessons/{lessonId}/handout?format=&studentId=&answers=` | synchronous URL builder, see B.7 item 2 |
| `listHomeworkPlans` | `GET /teacher/homework-plans` | |
| `getHomeworkPlanNewForm` | `GET /teacher/homework-plans/new-form` | |
| `createHomeworkPlan` | `POST /teacher/homework-plans` | |
| `getHomeworkPlanBoard` | `GET /teacher/homework-plans/{planId}` | |
| `getHomeworkPlanStatus` | `GET /teacher/homework-plans/{planId}/status` | |
| `issueHomeworkPlan` | `POST /teacher/homework-plans/{planId}/issue` | |
| `deleteHomeworkPlan` | `DELETE /teacher/homework-plans/{planId}` | |

Removed: `getPlannerMeta`, `getTopicConditions`, `setAttendance` (A2), `saveHomeworkPlanItems` (B.2.3).

### `GroupsCallsStatsApi` — owner `06` §6.6 (20 methods)

| Method | Endpoint | Note |
|---|---|---|
| `listGroups` | `GET /teacher/groups` | |
| `createGroup` | `POST /teacher/groups` | |
| `getGroup` | `GET /teacher/groups/{groupId}` | |
| `renameGroup` | `PATCH /teacher/groups/{groupId}` | |
| `deleteGroup` | `DELETE /teacher/groups/{groupId}` | |
| `addGroupMember` | `POST /teacher/groups/{groupId}/members` | |
| `removeGroupMember` | `DELETE /teacher/groups/{groupId}/members/{studentId}` | |
| `setStudentAiProfile` | `PATCH /teacher/students/{studentId}/ai-profile` | |
| `getGroupStatistics` | `GET /teacher/groups/{groupId}/statistics` | |
| `getGroupAttendance` | `GET /teacher/groups/{groupId}/attendance?period=` | |
| `setAttendance` | `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/attendance` | the only attendance method (A2 A.2.18); **[CODE]** the single site caller is `components/group-attendance-section.tsx` |
| `downloadGroupAttendancePdf` | `GET /teacher/groups/{groupId}/attendance.pdf?period=` | result `DownloadedFile` |
| `getParentCallsOverview` | `GET /teacher/parent-calls` | |
| `getParentCallCounts` | `GET /teacher/parent-calls/counts` | |
| `getParentCallHistory` | `GET /teacher/parent-calls/students/{studentId}/history` | |
| `recordParentCall` | `POST /teacher/parent-calls` | |
| `getStatisticsProgress` | `GET /developer/statistics/progress` | |
| `getStatisticsDrilldown` | `GET /developer/statistics/drilldown` | |
| `getStatisticsTeachers` | `GET /developer/statistics/teachers` | |
| `getStatisticsPlatform` | `GET /developer/statistics/platform` | |

### `ContentApi` — owner `07` §6.8 (19 methods)

| Method | Endpoint | Note |
|---|---|---|
| `listTopics` | `GET /topics` | |
| `getTopic` | `GET /topics/{topicId}` | |
| `getNumber` | `GET /topics/{topicId}/numbers/{number}` | |
| `getTopicConditions` | `GET /topics/{topicId}/conditions` | the only conditions method (A2 A.2.9); also called by `04` and `05` screens |
| `uploadFile` | `POST /uploads` | the only upload method for topic files (A2 A.2.11); returns `StoredFileRef` (A4 §3.8); student photos go through `studentWork` |
| `createTopic` | `POST /topics` | |
| `previewNumbersChange` | `POST /topics/{topicId}/numbers-preview` | |
| `updateTopic` | `PATCH /topics/{topicId}` | |
| `deleteTopicFile` | `DELETE /topics/{topicId}/files/{kind}` | |
| `getTopicImpact` | `GET /topics/{topicId}/impact` | |
| `deleteTopic` | `DELETE /topics/{topicId}?acknowledgedNumbersWithWork=` | |
| `reorderTopics` | `PUT /topics/order` | |
| `saveCondition` | `PUT /numbers/{homeworkNumberId}/condition` | |
| `deleteCondition` | `DELETE /numbers/{homeworkNumberId}/condition` | |
| `saveAnswer` | `PUT /numbers/{homeworkNumberId}/answer` | |
| `deleteAnswer` | `DELETE /numbers/{homeworkNumberId}/answer` | |
| `getImportPrompt` | `GET /topic-import/prompt` | |
| `previewImport` | `POST /topic-import` (`mode: "preview"`) | |
| `applyImport` | `POST /topic-import` (`mode: "apply"`) | |

### `DeveloperApi` — owner `07` §6.8 (5 methods)

| Method | Endpoint |
|---|---|
| `getPanel` | `GET /developer/panel` |
| `saveSettings` | `PUT /developer/settings` |
| `runAction` | `POST /developer/actions/{action}` |
| `broadcast` | `POST /developer/broadcast` |
| `getJournal` | `GET /developer/journal` |

Totals: 11 + 4 + 10 + 16 + 5 + 22 + 20 + 19 + 5 = **112**.

### Not in `ApiClient`

| Interface | Owner | Members | Why outside |
|---|---|---|---|
| `FileService` | `09` §5.2 | `source(fileId, variant?)`, `download(file, onProgress?)` | returns image sources / local URIs for `GET /files/{fileId}`; replaces `StudentStudyApi.getFileUrl` (A2 A.2.10) |
| `PreferencesStore` | `08` §14, members as restated in A4 §7 | `load()`, `setThemeMode(mode)`, `setHints(hints)`, `setLocale(locale)` | device storage only (B.1.5); `load()` returns `InterfacePreferences` (A4 §3.1); `setLocale` keeps the result shape of the site's `setLocaleAction` — **[CODE]** `{ ok: true, locale }` or `{ ok: false }` when the value is not a known locale |

### Endpoints proposed in the specs that have no client method

**[SPEC]** These paths appear in a "proposed mobile API" section but in no typed interface. They are **not**
part of `ApiClient` v1; adding one later means adding one row to B.4.

| Endpoint | Where proposed | Status |
|---|---|---|
| `GET /sync/changes?since=` | `01` §6.7 (polling fallback for realtime) | no method; does not exist on the site (`90-addendum-1.md` B.5: category (d)) |
| `POST /devices`, `DELETE /devices/{pushToken}` | `01` §6.8 (push) | no method; category (d) |
| `GET` / `PUT /me/preferences` | `08` §14 ("optional") | no method; preferences are device-local (B.1.5) |
| `GET /developer/statistics/timeline` | `06` §6.5 | no method; the same `timeline` already arrives in `getStatisticsProgress` (`StatisticsProgressResponse.timeline`) |
| `POST /topics/{topicId}/move` | `07` §6.2 ("optional alternative for up/down buttons") | no method; `reorderTopics` sends the full order |

## B.5 Which screens call which member (cross-member calls only)

A screen's own member is implied by its spec; this table lists calls that cross a member boundary.

| Caller (spec, screen) | Calls | Basis |
|---|---|---|
| Every screen with the header search (all roles) | `shell.findNumber` | A2 A.2.1 |
| `02` student home | `studentStudy.getHomeworkDeadlines` + `shell.getStreak` | A2 A.2.15, A.2.16 |
| `03` H2.c number cards | `studentStudy.saveNumberNote` | **[CODE]** `StudentSingleNumberCard` → `POST /api/student/topic-status` |
| `03` H2.a / H3, `04` review gallery, `05` live board photos, `02` theory, `07` topic files | `files.source` / `files.download` | A2 A.2.10 |
| `04` assign board, `04` S7 / `05` compose (statements of a topic other than the first) | `content.getTopicConditions` | A2 A.2.9 |
| `04` S6 Lessons tab, S7 compose | `planner.getLessonNewForm({ studentId })`, `planner.createLesson`, `planner.getLessonStatus`, `planner.saveLessonItems`, `planner.setItemResult`, `planner.regenerateParticipant`, `planner.getNumberBank`, `planner.getHandoutUrl` | A2 A.2.2 – A.2.7 |
| `04` review tab, `05` lesson board, `07` journal — progress-history widget | `teacherStudents.getProgressHistory` | A2 A.2.8 |
| `04` S9 Accounts (DEVELOPER) | `accounts.*` + `teacherStudents.deleteStudent`, `teacherStudents.resetStudentPassword` | B.2.1 |
| `06` group page attendance table | `groups.setAttendance` | A2 A.2.18 |
| `05` homework-draft board | `planner.saveLessonItems(planId, …)`, `planner.regenerateParticipant(planId, …)` | B.2.3 |
| Every screen that reacts to live changes | `shell.subscribeRealtime` | B.2.2 |

## B.6 Rules for `MockApiClient` and for the future `HttpApiClient`

1. **Completeness test.** A unit test enumerates the own method names of the nine members of
   `MockApiClient` and asserts: (a) the set equals the 112 names of B.4; (b) no name occurs in two members.
   The same test runs against `HttpApiClient` when it exists.
2. **One store, one emitter, one limiter.** All nine mock members and the mock `FileService` share the
   dataset of `09` §2; every mutation publishes on the one emitter behind `shell.subscribeRealtime` the
   event the site publishes for it (e.g. **[CODE]** photo upload / delete → `student-progress-changed`; join
   and lesson submit → `lesson-activity`); rate limits and AI budgets use the single limiter of
   `90-addendum-3.md` §9.
3. **Same errors in both implementations.** A mock method throws the `ApiError` (`status`, `code`, localized
   `message`, `params` / `details`, `retryAfterSeconds`) that the HTTP method would build from the envelope
   (`90-addendum-1.md` A.3 rule 9). Rows marked "n/a (transport)" in A.5 exist only in `HttpApiClient`.
4. **Role checks in the mock.** Each mock method applies the role rule of its endpoint with the split of
   `90-addendum-1.md` A.1.3: no signed-in mock user → `401 sessionExpired`; wrong role → `403 unauthorized`
   (or `403 developerRightsRequired`). This is what makes a cross-member call such as B.2.1 safe.
5. **No screen-specific state in the client.** Polling, optimistic updates and query invalidation (A.6
   rules 1–3) live in hooks above `ApiClient`; a method performs exactly one operation.
6. **Simulated latency** is applied uniformly by the mock (`09` §2.2 item 4 for AI operations); a method
   never resolves synchronously, so loading states are exercised.

## B.7 Open questions

1. **Member object vs flat client.** B.1.1 chooses nine members (`api.studentWork.getHomework`). A flat
   `ApiClient` (`api.getHomework`) is equally possible because B.1.3 keeps names unique. Confirm before the
   first screen is written — it is the one decision that touches every call site.
2. **Generated documents in the mock.** `planner.getHandoutUrl` is the only synchronous, non-`Promise`
   member, and a URL means nothing without a server; `teacherStudents.downloadStudentReport` and
   `groups.downloadGroupAttendancePdf` need a PDF the mock cannot render. `04` §7 Q3, `05` §7 Q2 and `06` §7
   Q5 leave "bundled sample PDF or hidden action" open. Suggested: in the mock all three resolve to a
   `DownloadedFile` pointing at a bundled sample, and `getHandoutUrl` becomes
   `downloadHandout(lessonId, opts): Promise<DownloadedFile>` so that the three behave alike. Not decided
   here because it changes a signature that A2 A.3 kept.
3. **`404` instead of an empty body on the two poll endpoints** (A.5.6, A.5.10). The site answers
   `{ check: null }` / `{ submissions: [] }` for a foreign id. Confirm the stricter mobile behaviour.
4. **`setNumberDeadlines`.** The site route exists but nothing calls it (B.4 note). Keep the method in
   `TeacherStudentsApi` (as listed) or drop it from v1, as `04` §7 Q2 suggests?
5. **Path of the two student-account operations for a DEVELOPER.** B.2.1 keeps
   `/teacher/students/{studentId}` and `…/password` for both roles (as `04` §6.1 / §6.7 state). A2 Part B.2
   notes that a DEVELOPER has no `/teacher/students/…` screens; a `/developer/students/{studentId}` alias of
   the same handlers would be cosmetic. The client method is the same either way.
6. **Endpoints without a method** (last table of B.4): confirm that polling fallback, push device
   registration and roaming preferences are out of the v1 client.
7. **Saving / sharing a solution photo (H3).** `FileService.download(file: FileRef, …)` takes the four-field
   `FileRef` (`id`, `originalName`, `mimeType`, `size`), but `AttachedPhoto` has no `size`: **[CODE]** the site
   reader does not select `StoredFile.size` for photos, and the site itself needs none (the photo opens in a
   new tab through `<a href="/files/{fileId}">`). Either the mobile reader adds `file.size` to the photo
   select and `AttachedPhoto` gains `size`, or `FileService.download` accepts a reference without `size`
   (progress can then be reported only when the response has `Content-Length`). Suggested: the second — it
   needs no change to the shared catalogue; H3 displays the image through `files.source(fileId)` either way.
