/**
 * The `ApiClient` contract: nine members, 112 methods, one method per server operation.
 * Sources: docs/spec/00-unified-contract.md §2 (tables) and §2.13 (signatures); 90-addendum-5 Part B.4.
 *
 * Conventions (apply to every method unless its comment says otherwise):
 * - Paths are relative to `/api/mobile/v1`. Roles: S = STUDENT, T = TEACHER, D = DEVELOPER; "own" = only the
 *   caller's own students / lessons / groups — a foreign id is a 404, never a 403.
 * - A method resolves to the wire body WITHOUT the `ok` flag and rejects with `ApiError` (`./errors`).
 * - "Errors" lists endpoint codes only. The global codes apply everywhere and are not repeated:
 *   `401 sessionExpired` (no valid session — the only code that signs the user out), `403 unauthorized`
 *   (wrong role), `403 developerRightsRequired` (developer-only endpoint), `400 invalidData`,
 *   `429 rateLimited` (+ `retryAfterSeconds`), `503 serviceUnavailable` (`retryAfterSeconds: 5`),
 *   `503 migrationMissing`, `500 saveFailed | deleteFailed | internalError`, and the client-only `network`
 *   (`status: 0`: no response, timeout, aborted `signal`).
 * - A method performs exactly one operation and never resolves synchronously (except `getHandoutUrl`).
 *   Polling, optimistic state and query invalidation live in screen hooks above the client.
 * - Screens call across members: ownership follows the operation, not the screen.
 *
 * Implementations: `MockApiClient` (in-process, `src/mock`) now, `HttpApiClient` later. Screens receive the
 * client from `ApiProvider` (`./index`) and never import an implementation.
 */
import type {
  AccountCreateInput,
  AccountsDirectory,
  AddMemberRequest,
  AddMemberResponse,
  AiProfileRequest,
  AiProfileResponse,
  AssignBoardResponse,
  AttendanceStatus,
  BroadcastRequest,
  BroadcastResult,
  ChangePasswordRequest,
  ChangePasswordResponse,
  CreateGroupRequest,
  CreateGroupResponse,
  CreateHomeworkPlanInput,
  CreateHomeworkPlanResponse,
  CreateLessonInput,
  CreateLessonResponse,
  CreateTopicRequest,
  CreatedAccount,
  CreatedStudent,
  DeleteHomeworkPhotoResult,
  DeveloperPanelData,
  DownloadedFile,
  DrilldownResponse,
  FileRef,
  FileUpload,
  FinishLessonResponse,
  GetHomeworkResponse,
  GetHomeworksResponse,
  GetLessonResponse,
  GroupAttendanceResponse,
  GroupDetailResponse,
  GroupStatisticsResponse,
  GroupsListResponse,
  HandoutOptions,
  HintsMode,
  HomeworkDeadlinesResponse,
  HomeworkNumberStatus,
  HomeworkPlanBoardModel,
  HomeworkPlanListItem,
  HomeworkPlanNewModel,
  HomeworkPlanStatus,
  ImportApplyResult,
  ImportPreview,
  ImportTarget,
  InterfacePreferences,
  IsoDateTime,
  IssueHomeworkRequest,
  IssueHomeworkResponse,
  IssueResult,
  JoinLessonResult,
  JournalPage,
  JournalQuery,
  LatestHomeworkCheckResponse,
  LessonBankTopic,
  LessonBoardItem,
  LessonBoardModel,
  LessonItemResult,
  LessonListItem,
  LessonLiveSnapshot,
  LessonNewFormModel,
  LessonPlanStatus,
  LessonStateResponse,
  LessonTargetChooser,
  Locale,
  LoginRequest,
  LoginResponse,
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
  MeResponse,
  MetaResponse,
  NotificationsResponse,
  NumberDetail,
  NumberFindResult,
  NumbersChangePreview,
  OwnerChange,
  PanelAction,
  PanelActionResult,
  ParentCallCounts,
  ParentCallHistoryResponse,
  ParentCallsOverviewResponse,
  PhotoUpload,
  ProgressHistoryPage,
  RealtimeConnectionState,
  RealtimeEvent,
  RecordCallRequest,
  RecordCallResponse,
  RegenerateResponse,
  RenameGroupRequest,
  RenameGroupResponse,
  ReportPeriod,
  SaveNoteResponse,
  SaveSettingsResult,
  ScheduleLessonResponse,
  SetAttendanceResponse,
  SetDeadlinesRequest,
  SetDeadlinesResponse,
  SetItemResultResponse,
  SetNumberStatusResponse,
  SetNumberStatusesRequest,
  SetNumberStatusesResponse,
  SiteSettings,
  StartHomeworkCheckResult,
  StatisticsPlatformResponse,
  StatisticsProgressResponse,
  StatisticsTeachersResponse,
  StoredFileRef,
  StreakResponse,
  StudentCardResponse,
  StudentCreateInput,
  StudentNumberDetailResponse,
  SubmitLessonItemResult,
  TeacherHomeSummary,
  TeacherStudentHomeworks,
  TeacherStudentLesson,
  TeacherStudentListItem,
  TheoryLibraryResponse,
  ThemeMode,
  TopicDetail,
  TopicImpact,
  TopicListItem,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UpdateTopicRequest,
  UploadCallOptions,
  UploadHomeworkPhotosResult,
} from "./types";

// ───────────────────────────── helper types ─────────────────────────────

/** Typed result = wire body without the `ok` flag. */
export type Res<T> = Omit<T, "ok">;

/** Options of a read that may be cancelled. An aborted call rejects with `ApiError { status: 0, code: "network" }`. */
export type Abortable = { signal?: AbortSignal };

/** Options of `shell.subscribeRealtime`. */
export type RealtimeSubscribeOptions = {
  /** Connection state changes, including a refused handshake (never thrown, never shown to the user). */
  onState?: (state: RealtimeConnectionState) => void;
};

/** Options of `content.uploadFile`. `previousFileId` = the file this upload replaces (deleted when unreferenced). */
export type UploadFileOptions = UploadCallOptions & { previousFileId?: string };

// ───────────────────────────── 1. shell — 00 §2.1 – §2.4 (11 methods) ─────────────────────────────

/** Session, profile, notifications, streak, number search, realtime (owner spec 01). */
export interface ShellApi {
  /** `GET /meta` · no auth · Errors: — */
  getMeta(): Promise<MetaResponse>;

  /**
   * `POST /auth/login` · no auth · creates a server session and returns its opaque token.
   * Errors: `400 empty` · `401 invalidCredentials` (does NOT sign out) · `429 rateLimited` (`params.minutes` 1..60,
   * `retryAfterSeconds`) · `503 database`.
   */
  login(input: LoginRequest): Promise<LoginResponse>;

  /** `POST /auth/logout` → 204 · S T D · deletes this one session · Errors: — */
  logout(): Promise<void>;

  /** `GET /me` (alias `GET /auth/me`) · S T D · session restore; re-fetched after any 403 · Errors: — */
  getMe(): Promise<MeResponse>;

  /** `PATCH /me` · S T D · Errors: `400 infoInvalid`. */
  updateProfile(input: UpdateProfileRequest): Promise<UpdateProfileResponse>;

  /**
   * `POST /me/password` · S T D · deletes every other session and returns a ROTATED token that replaces the stored one.
   * Errors: `400 passwordInvalid` (`details.problem: PasswordProblem`) · `400 passwordMismatch` ·
   * `403 passwordCurrent` · `429 rateLimited`.
   */
  changePassword(input: ChangePasswordRequest): Promise<ChangePasswordResponse>;

  /**
   * `GET /notifications?limit=20` · S T D · newest 20 + count of all unread; `target` is computed by the server.
   * A TEACHER read lazily creates parent-call reminders, a DEVELOPER read lazily creates alerts. Errors: —
   */
  listNotifications(): Promise<NotificationsResponse>;

  /** `POST /notifications/read` · S T D · `notificationId` omitted = all · Errors: — */
  markNotificationsRead(input: MarkNotificationsReadRequest): Promise<Res<MarkNotificationsReadResponse>>;

  /** `GET /student/streak` · S · Errors: — */
  getStreak(): Promise<StreakResponse>;

  /**
   * `GET /numbers/find?number=<digits>` · S T D · `number` matches `^\d{1,20}$`, normalised value ≠ "0".
   * STUDENT → open `student.number { number }`; TEACHER / DEVELOPER → `content.number { topicId, number }`.
   * Errors: `400 invalidNumber` · `404 numberNotFound` · `500 searchFailed`.
   */
  findNumber(number: string): Promise<NumberFindResult>;

  /**
   * `GET /realtime` (Server-Sent Events) · S T D · returns the unsubscribe function; synchronous, never throws.
   * One underlying stream per signed-in user regardless of the number of listeners (opened on the first
   * subscription, closed after the last unsubscribe, in the background and on logout). The `connected` frame is
   * swallowed. Handshake refusals (`429 tooManyConnections`, `429 rateLimited`, `503 serviceUnavailable`) are
   * reported through `onState` and retried with backoff 5, 10, 20, 40, 60 s; `401 sessionExpired` follows the
   * sign-out rule. Delivery filter: DEVELOPER — every event; TEACHER — `students-changed` and
   * `topic-content-changed` always, `lesson-activity` when `teacherId` is the caller, `student-*` for own
   * students; STUDENT — never `students-changed`, always `topic-content-changed`, the other three only when
   * `studentId` is the caller.
   */
  subscribeRealtime(listener: (event: RealtimeEvent) => void, options?: RealtimeSubscribeOptions): () => void;
}

// ───────────────────────────── 2. studentStudy — 00 §2.5 (4 methods) ─────────────────────────────

/** Deadlines, theory, number detail, note (owner spec 02). Role S on every method. */
export interface StudentStudyApi {
  /** `GET /student/homework-deadlines` · S · light list for home and calendar · Errors: — */
  getHomeworkDeadlines(): Promise<HomeworkDeadlinesResponse>;

  /** `GET /student/theory` · S · only topics with a theory file · Errors: — */
  getTheoryLibrary(): Promise<TheoryLibraryResponse>;

  /**
   * `GET /student/numbers/{number}` · S · `number` = digits, recorded or normalised form; never contains answers.
   * Errors: `400 invalidNumber` · `404 numberNotFound`.
   */
  getNumberDetail(number: string): Promise<StudentNumberDetailResponse>;

  /**
   * `PUT /student/numbers/{homeworkNumberId}/note` · S · the server trims and cuts to 240; "" clears.
   * The student never changes the status. Errors: `403 statusReadOnly` · `404 numberNotFound`.
   */
  saveNumberNote(homeworkNumberId: string, note: string, signal?: AbortSignal): Promise<Res<SaveNoteResponse>>;
}

// ───────────────────────────── 3. studentWork — 00 §2.6 – §2.7 (10 methods) ─────────────────────────────

/** Homeworks, photos, AI check, live lesson (owner spec 03; 90-addendum-5 Part A). Role S on every method. */
export interface StudentHomeworkLessonApi {
  /** `GET /student/homeworks` · S · a missing table → `available: false`, not an error · Errors: — */
  listHomeworks(opts?: Abortable): Promise<GetHomeworksResponse>;

  /** `GET /student/homeworks/{assignmentId}` · S · Errors: `404 homeworkNotFound`. */
  getHomework(assignmentId: string, opts?: Abortable): Promise<GetHomeworkResponse>;

  /**
   * `POST /student/homeworks/{assignmentId}/photos` · S · multipart `files` × 1…N (PNG / JPEG); all stored or none.
   * Errors: upload classes (`uploadInvalid`, `uploadNotMultipart`, `uploadLengthRequired`, `413 uploadTooLarge`,
   * `uploadUnsupportedType`, `uploadBadName`, `uploadRejected`) · `404 homeworkNotFound` ·
   * `400 photoLimit` (`params.max`) · `409 concurrentChange`.
   */
  uploadHomeworkPhotos(assignmentId: string, files: PhotoUpload[], opts?: UploadCallOptions): Promise<UploadHomeworkPhotosResult>;

  /** `DELETE /student/homeworks/{assignmentId}/photos/{photoId}` · S · `photoId` = `AttachedPhoto.id` · Errors: `404 photoNotFound`. */
  deleteHomeworkPhoto(assignmentId: string, photoId: string): Promise<DeleteHomeworkPhotoResult>;

  /**
   * `POST /student/homeworks/{assignmentId}/checks` · S · starts an AI check of the current photo batch (status "PENDING").
   * Errors: `503 queueFull` (`retryAfterSeconds: 120`) · `503 checkDisabled` · `404 homeworkNotFound` ·
   * `400 attachPhotosFirst` · `400 noNumbers` · `409 alreadyRunning` · `409 photosChanged` ·
   * `429 rateLimited` (per-student hourly limit OR the school-wide daily budget).
   */
  startHomeworkCheck(assignmentId: string): Promise<StartHomeworkCheckResult>;

  /** `GET /student/homeworks/{assignmentId}/checks/latest` · S · poll; `check: null` = never checked · Errors: `404 homeworkNotFound`. */
  getLatestHomeworkCheck(assignmentId: string, opts?: Abortable): Promise<LatestHomeworkCheckResponse>;

  /** `GET /student/lesson` · S · no lesson → both `active` and `upcoming` are null; runs lazy finalisation first · Errors: — */
  getLiveLesson(opts?: Abortable): Promise<GetLessonResponse>;

  /**
   * `POST /student/lessons/{lessonId}/join` · S · once per entry; a failure never blocks the screen (marks attendance PRESENT).
   * Errors: `404 lessonNotFound` · `409 lessonNotActive`.
   */
  joinLesson(lessonId: string): Promise<JoinLessonResult>;

  /**
   * `POST /student/lessons/{lessonId}/items/{itemId}/submissions` · S · multipart `files` × 1…3 (status "PENDING").
   * Errors: `503 queueFull` · `503 checkDisabled` · upload classes · `400 photoLimit` (`params.max = 3`) ·
   * `404 itemNotFound` · `409 lessonNotActive` · `409 alreadyAccepted` (`params.number`) · `409 extraPartLocked` ·
   * `409 alreadyRunning` · `409 concurrentChange` · `429 rateLimited` (hourly limit OR daily budget).
   */
  submitLessonItem(lessonId: string, itemId: string, files: PhotoUpload[], opts?: UploadCallOptions): Promise<SubmitLessonItemResult>;

  /** `GET /student/lessons/{lessonId}/state` · S · poll; valid in any status, FINISHED ends the live screen · Errors: `404 lessonNotFound`. */
  getLiveLessonState(lessonId: string, opts?: Abortable): Promise<LessonStateResponse>;
}

// ───────────────────────────── 4. teacherStudents — 00 §2.8 (16 methods) ─────────────────────────────

/** Teacher home, students, homework review / assign, progress history, report (owner spec 04). */
export interface TeacherStudentsApi {
  /** `GET /teacher/home` · T · Errors: — */
  getTeacherHome(): Promise<TeacherHomeSummary>;

  /** `GET /teacher/students` · T · name asc · Errors: — */
  listStudents(): Promise<{ students: TeacherStudentListItem[] }>;

  /** `POST /teacher/students` → 201 · T · Errors: `409 exists` · `429 rateLimited`. */
  createStudent(input: StudentCreateInput): Promise<{ student: CreatedStudent }>;

  /** `DELETE /teacher/students/{studentId}` · T own · D any · Errors: `404 studentNotFound`. */
  deleteStudent(studentId: string): Promise<void>;

  /** `POST /teacher/students/{studentId}/password` · T own · D any · body `{ password }` · Errors: `404 studentNotFound` · `429 rateLimited`. */
  resetStudentPassword(studentId: string, password: string): Promise<void>;

  /** `GET /teacher/students/{studentId}` · T own · header of the student card · Errors: `404 studentNotFound`. */
  getStudentCard(studentId: string): Promise<StudentCardResponse>;

  /** `GET /teacher/students/{studentId}/homeworks` · T own · Errors: `404 studentNotFound`. */
  getStudentHomeworks(studentId: string): Promise<TeacherStudentHomeworks>;

  /** `GET /teacher/students/{studentId}/assign-board` · T own · Errors: `404 studentNotFound`. */
  getAssignBoard(studentId: string): Promise<AssignBoardResponse>;

  /**
   * `POST /teacher/homeworks` → 201 · T own student · D.
   * Errors: `404 studentOrNumberNotFound` · `409 solvedConflict` (`params.numbers`,
   * `details.conflictNumbers: string[]`) · `503 migrationMissing`.
   */
  issueHomework(input: IssueHomeworkRequest): Promise<IssueHomeworkResponse>;

  /** `DELETE /teacher/homeworks/{assignmentId}` · T own student · D · Errors: `404 homeworkNotFound` · `503 migrationMissing`. */
  cancelHomework(assignmentId: string): Promise<void>;

  /**
   * `PUT /teacher/students/{studentId}/numbers/{homeworkNumberId}/status` · T own (D → `403 unauthorized`) · `null` clears.
   * Errors: `404 studentOrNumberNotFound`.
   */
  setNumberStatus(studentId: string, homeworkNumberId: string, status: HomeworkNumberStatus | null): Promise<Res<SetNumberStatusResponse>>;

  /**
   * `POST /teacher/students/{studentId}/number-statuses` · T own · 1..100 changes, one transaction, one history event per item.
   * Errors: `404 studentOrNumberNotFound`.
   */
  setNumberStatuses(studentId: string, changes: SetNumberStatusesRequest["changes"]): Promise<SetNumberStatusesResponse>;

  /**
   * `PUT /teacher/students/{studentId}/deadlines` · T own · no screen calls it in v1.
   * Errors: `404 studentOrNumberNotFound` · `503 migrationMissing`.
   */
  setNumberDeadlines(studentId: string, input: SetDeadlinesRequest): Promise<SetDeadlinesResponse>;

  /**
   * `GET /progress-history?studentId=&homeworkNumberId=&cursor=` · T own student · D any · page size 20;
   * `reference.kind === "homework"` is never sent to a DEVELOPER.
   * Errors: `400 paramsRequired` · `403 unauthorized` · `404 historyNotFound`.
   */
  getProgressHistory(studentId: string, homeworkNumberId: string, cursor?: string): Promise<ProgressHistoryPage>;

  /** `GET /teacher/students/{studentId}/lessons` · T own · `createdAt` desc · Errors: `404 studentNotFound`. */
  listStudentLessons(studentId: string): Promise<{ lessons: TeacherStudentLesson[] }>;

  /**
   * `GET /teacher/students/{studentId}/report.pdf?period=7d|30d|year` · T own · D · downloads into the app cache.
   * Errors: `404 studentNotFound` · `503 reportsBusy` (`retryAfterSeconds: 30`) · `500 exportFailed` · `429 rateLimited`.
   */
  downloadStudentReport(studentId: string, period: ReportPeriod): Promise<DownloadedFile>;
}

// ───────────────────────────── 5. accounts — 00 §2.9 (5 methods) ─────────────────────────────

/** Developer accounts (owner spec 04 S9). Role D on every method (else `403 developerRightsRequired`). */
export interface DeveloperAccountsApi {
  /** `GET /developer/accounts` · D · both lists name asc · Errors: — */
  getAccounts(): Promise<AccountsDirectory>;

  /** `POST /developer/accounts` → 201 · D · `teacherId` required for a STUDENT · Errors: `404 teacherNotFound` · `409 exists` · `429 rateLimited`. */
  createAccount(input: AccountCreateInput): Promise<{ account: CreatedAccount }>;

  /** `PUT /developer/students/owners` · D · body `{ changes }`, non-empty, all-or-nothing · Errors: `400 ownerInvalid`. */
  changeStudentOwners(changes: OwnerChange[]): Promise<{ changed: number }>;

  /** `POST /developer/teachers/{teacherId}/password` · D · body `{ password }` · Errors: `404 teacherNotFound` · `429 rateLimited`. */
  resetTeacherPassword(teacherId: string, password: string): Promise<void>;

  /**
   * `DELETE /developer/teachers/{teacherId}?transferToTeacherId=` · D.
   * Errors: `404 teacherNotFound` · `409 teacherTransfer` (the teacher has students and the transfer target is
   * missing, the same teacher, or not a teacher).
   */
  deleteTeacher(teacherId: string, transferToTeacherId?: string): Promise<{ transferredStudents: number }>;
}

// ───────────────────────────── 6. planner — 00 §2.10 (22 methods) ─────────────────────────────

/**
 * Lessons, live board, homework drafts (owner spec 05). Roles on every method: T own · D any.
 * (The planner screens are not registered for a DEVELOPER in v1, but the endpoints accept the role.)
 */
export interface TeacherPlannerApi {
  /** `GET /teacher/lessons` · T own · D any · runs lazy finalisation first · Errors: — */
  listLessons(): Promise<{ lessons: LessonListItem[]; serverNow: IsoDateTime }>;

  /** `GET /teacher/lessons/new-options` · T own · D any · Errors: — */
  getLessonTargets(): Promise<LessonTargetChooser>;

  /**
   * `GET /teacher/lessons/new-form?groupId=` | `?studentId=` · T own · D any · mode "student" carries the
   * statements of the first compose topic only. Errors: `404 groupNotFound` · `404 studentNotFound`.
   */
  getLessonNewForm(target: { groupId: string } | { studentId: string }): Promise<LessonNewFormModel>;

  /** `GET /teacher/number-bank` · T · D · shared bank, cache on the device · Errors: — */
  getNumberBank(): Promise<{ topics: LessonBankTopic[] }>;

  /**
   * `POST /teacher/lessons` → 201 for EVERY `plan` outcome (including "unavailable") · T own · D any.
   * Errors: `400 selectAtLeastOneStudent` · `400 tooManyStudents` (`params.max = 30`) · `400 invalidStartsAt` ·
   * `404 groupNotFound` · `500 createFailed` · `429 rateLimited`.
   */
  createLesson(input: CreateLessonInput): Promise<CreateLessonResponse>;

  /** `GET /teacher/lessons/{lessonId}` · T own · D any · Errors: `404 lessonNotFound` (also when the id is a draft). */
  getLessonBoard(lessonId: string): Promise<LessonBoardModel>;

  /** `GET /teacher/lessons/{lessonId}/status` · T own · D any · poll · Errors: `404 lessonNotFound`. */
  getLessonStatus(lessonId: string): Promise<LessonPlanStatus>;

  /** `GET /teacher/lessons/{lessonId}/live` · T own · D any · fallback poll (15 s) · Errors: `404 lessonNotFound`. */
  getLessonLive(lessonId: string): Promise<LessonLiveSnapshot>;

  /**
   * `PATCH /teacher/lessons/{lessonId}` · T own · D any · body `{ startsAt }`.
   * Errors: `400 invalidStartsAt` · `404 lessonNotFound` · `409 alreadyFinished` · `409 alreadyClosed` · `500 scheduleFailed`.
   */
  scheduleLesson(lessonId: string, startsAt: IsoDateTime): Promise<Res<ScheduleLessonResponse>>;

  /** `POST /teacher/lessons/{lessonId}/finish` · T own · D any · Errors: `404 lessonNotFound` · `409 lessonNotActive` · `500 finishFailed`. */
  finishLesson(lessonId: string): Promise<Res<FinishLessonResponse>>;

  /** `DELETE /teacher/lessons/{lessonId}` · T own · D any · then open `planner.lessons` · Errors: `404 lessonNotFound`. */
  deleteLesson(lessonId: string): Promise<void>;

  /**
   * `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/items` · T own · D any · lessons AND drafts
   * (alias `PATCH /teacher/homework-plans/{planId}/participants/{participantId}/items`, same handler).
   * Body `SaveSetRequest` (`main` → `homeworkNumberIds`, `extra` → `extraHomeworkNumberIds`; each ≤ 40).
   * Resolves to the whole set after the change; a draft reads only the fields a draft has.
   * Errors: `400 numbersRequired` · `404 participantNotFound` · `409 homeworkAlreadyIssued` ·
   * `409 blockedNumbers` (`details.numbers: string[]`).
   */
  saveLessonItems(lessonOrPlanId: string, participantId: string, main: string[], extra?: string[]): Promise<LessonBoardItem[]>;

  /**
   * `POST /teacher/lessons/{lessonId}/participants/{participantId}/regenerate` · T own · D any · lessons AND drafts
   * (alias under `/teacher/homework-plans/{planId}/…`). `planRequestedAt` anchors the 15-minute stale timer.
   * Errors: `404 participantNotFound` · `409 homeworkAlreadyIssued` · `429 budgetExhausted` (NO
   * `retryAfterSeconds`; optional `details.resetAt`) · `503 plannerUnavailable` · `503 queueFull` · `429 rateLimited`.
   */
  regenerateParticipant(lessonOrPlanId: string, participantId: string): Promise<Res<RegenerateResponse>>;

  /**
   * `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/items/{itemId}/result` · T own · D any ·
   * `null` clears; the result mirrors onto the number status. Errors: `400 invalidResult` · `404 itemNotFound`.
   */
  setItemResult(lessonId: string, participantId: string, itemId: string, result: LessonItemResult | null): Promise<Res<SetItemResultResponse>>;

  /**
   * `GET /teacher/lessons/{lessonId}/handout?format=pdf|html&studentId=&answers=0|1` · T own · D any.
   * Synchronous URL builder — the only non-Promise member; the request itself is made by the file viewer.
   * Errors of that request: `404 lessonNotFound` · `404 noHomeworkHandout` · `503 pdfRendererUnavailable`
   * (`format=pdf` only; the app then offers `format=html`).
   */
  getHandoutUrl(lessonId: string, opts: HandoutOptions): string;

  /** `GET /teacher/homework-plans` · T own · D any · resolves to the bare `plans` array · Errors: — */
  listHomeworkPlans(): Promise<HomeworkPlanListItem[]>;

  /**
   * `GET /teacher/homework-plans/new-form?lessonId=[&studentId=]` | `?groupId=` | `?studentId=` · T own · D any.
   * Errors: `404 lessonNotFound` · `404 groupNotFound` · `404 studentNotFound`.
   */
  getHomeworkPlanNewForm(src: { lessonId: string; studentId?: string } | { groupId: string } | { studentId: string }): Promise<HomeworkPlanNewModel>;

  /**
   * `POST /teacher/homework-plans` → 201 · T own · D any · then open the draft board for every `plan` outcome.
   * Errors: `400 selectAtLeastOneStudent` · `400 tooManyStudents` · `400 topicAndDeadlineRequired` ·
   * `404 groupNotFound` · `404 topicNotFound` · `500 createFailed` · `429 rateLimited`.
   */
  createHomeworkPlan(input: CreateHomeworkPlanInput): Promise<CreateHomeworkPlanResponse>;

  /** `GET /teacher/homework-plans/{planId}` · T own · D any · Errors: `404 draftNotFound`. */
  getHomeworkPlanBoard(planId: string): Promise<HomeworkPlanBoardModel>;

  /** `GET /teacher/homework-plans/{planId}/status` · T own · D any · poll · Errors: `404 draftNotFound`. */
  getHomeworkPlanStatus(planId: string): Promise<HomeworkPlanStatus>;

  /**
   * `POST /teacher/homework-plans/{planId}/issue` · T own · D any · body `{ participantIds? }` (empty = all).
   * Partial success is a 200: per-participant failures are in `failed[]`.
   * Errors: `400 missingTopicOrDeadline` · `400 deadlinePassed` · `404 draftNotFound`.
   */
  issueHomeworkPlan(planId: string, participantIds?: string[]): Promise<Res<IssueResult>>;

  /** `DELETE /teacher/homework-plans/{planId}` · T own · D any · then open `planner.drafts` · Errors: `404 draftNotFound`. */
  deleteHomeworkPlan(planId: string): Promise<void>;
}

// ───────────────────────────── 7. groups — 00 §2.11 (20 methods) ─────────────────────────────

/** Groups, attendance, parent calls, statistics (owner spec 06). */
export interface GroupsCallsStatsApi {
  /** `GET /teacher/groups` · T · D · Errors: — */
  listGroups(): Promise<GroupsListResponse>;

  /** `POST /teacher/groups` → 201 · T only (D → `403 unauthorized`) · Errors: — (`400 invalidData` for an empty name). */
  createGroup(input: CreateGroupRequest): Promise<CreateGroupResponse>;

  /** `GET /teacher/groups/{groupId}` · T own · D · Errors: `404 groupNotFound`. */
  getGroup(groupId: string): Promise<GroupDetailResponse>;

  /** `PATCH /teacher/groups/{groupId}` · T own · D · Errors: `404 groupNotFound`. */
  renameGroup(groupId: string, input: RenameGroupRequest): Promise<RenameGroupResponse>;

  /** `DELETE /teacher/groups/{groupId}` → 204 · T own · D · then open `groups.list` · Errors: `404 groupNotFound`. */
  deleteGroup(groupId: string): Promise<void>;

  /** `POST /teacher/groups/{groupId}/members` · T own · D · moves the student out of a previous group · Errors: `404 groupNotFound` · `404 studentNotFound`. */
  addGroupMember(groupId: string, input: AddMemberRequest): Promise<AddMemberResponse>;

  /** `DELETE /teacher/groups/{groupId}/members/{studentId}` → 204 (idempotent) · T own · D · Errors: `404 groupNotFound`. */
  removeGroupMember(groupId: string, studentId: string): Promise<void>;

  /** `PATCH /teacher/students/{studentId}/ai-profile` · T own · D · full overwrite (speed integer 1..10 or null; aiNote ≤ 300) · Errors: `404 studentNotFound`. */
  setStudentAiProfile(studentId: string, input: AiProfileRequest): Promise<AiProfileResponse>;

  /** `GET /teacher/groups/{groupId}/statistics` · T own · D · Errors: `404 groupNotFound`. */
  getGroupStatistics(groupId: string): Promise<GroupStatisticsResponse>;

  /** `GET /teacher/groups/{groupId}/attendance?period=year|30d|7d` · T own · D · default "year" · Errors: `404 groupNotFound`. */
  getGroupAttendance(groupId: string, period?: ReportPeriod): Promise<GroupAttendanceResponse>;

  /**
   * `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/attendance` · T own · D · lessons of kind LESSON only.
   * Errors: `400 invalidMark` · `404 participantNotFound`.
   */
  setAttendance(lessonId: string, participantId: string, attendance: AttendanceStatus): Promise<Res<SetAttendanceResponse>>;

  /**
   * `GET /teacher/groups/{groupId}/attendance.pdf?period=7d|30d|year` · T own · D · Russian-only document, downloaded into the app cache.
   * Errors: `404 groupNotFound` · `500 exportFailed` · `429 rateLimited`.
   */
  downloadGroupAttendancePdf(groupId: string, period: ReportPeriod): Promise<DownloadedFile>;

  /** `GET /teacher/parent-calls` · T own students · D all (read-only) · Errors: — */
  getParentCallsOverview(): Promise<ParentCallsOverviewResponse>;

  /** `GET /teacher/parent-calls/counts` · T · D · Errors: — */
  getParentCallCounts(): Promise<ParentCallCounts>;

  /** `GET /teacher/parent-calls/students/{studentId}/history?limit=100&before=<callId>` · T own · D · Errors: `404 studentNotFound`. */
  getParentCallHistory(studentId: string, page?: { limit?: number; before?: string }): Promise<ParentCallHistoryResponse>;

  /**
   * `POST /teacher/parent-calls` → 201 · T own only (D → `403 unauthorized`) · `comment` ≤ 4000, personal data.
   * Errors: `400 studentRequired` · `400 outcomeRequired` · `404 studentNotFound`.
   */
  recordParentCall(input: RecordCallRequest): Promise<RecordCallResponse>;

  /** `GET /developer/statistics/progress?studentId=` · D · optional `studentId` filters the timeline · Errors: — */
  getStatisticsProgress(studentId?: string): Promise<StatisticsProgressResponse>;

  /** `GET /developer/statistics/drilldown?topicId=&studentId=` · D · both required · Errors: `400 paramsRequired` · `404 studentNotFound` · `500 loadFailed`. */
  getStatisticsDrilldown(topicId: string, studentId: string): Promise<DrilldownResponse>;

  /** `GET /developer/statistics/teachers` · D · the only response with the STORED `LessonStatus` · Errors: — */
  getStatisticsTeachers(): Promise<StatisticsTeachersResponse>;

  /** `GET /developer/statistics/platform` · D · Errors: — */
  getStatisticsPlatform(): Promise<StatisticsPlatformResponse>;
}

// ───────────────────────────── 8. content — 00 §2.12 + POST /uploads (19 methods) ─────────────────────────────

/** Topics, numbers, statements / answers, import, upload (owner spec 07). T reads; D manages. */
export interface ContentApi {
  /** `GET /topics` · T · D · ordered by displayOrder, createdAt; resolves to the bare `topics` array · Errors: — */
  listTopics(): Promise<TopicListItem[]>;

  /** `GET /topics/{topicId}` · T · D · Errors: `404 topicNotFound`. */
  getTopic(topicId: string): Promise<TopicDetail>;

  /** `GET /topics/{topicId}/numbers/{number}` · T · D · `number` = digits, matched by normalised form · Errors: `404 numberNotFound`. */
  getNumber(topicId: string, number: string): Promise<NumberDetail>;

  /**
   * `GET /topics/{topicId}/conditions` · T · D · resolves to the bare record `homeworkNumberId → conditionLatex | null`.
   * Errors: — (a failing query yields `{}`).
   */
  getTopicConditions(topicId: string): Promise<Record<string, string | null>>;

  /**
   * `POST /uploads` → 201 · D · multipart `file`, `previousFileId?`; ≤ 15 MiB; `.pdf .docx .png .jpg .jpeg`.
   * Errors: `400 fileRequired` · `400 uploadUnsupportedType` · `400 uploadBadName` (`params.max = 255`) ·
   * `400 uploadRejected` · `413 uploadTooLarge` · `500 uploadFailed` · `429 rateLimited`.
   */
  uploadFile(file: FileUpload, opts?: UploadFileOptions): Promise<StoredFileRef>;

  /** `POST /topics` → 201 · D · files pre-uploaded by the same user · Errors: `400 formInvalid` · `400 filesUnavailable`. */
  createTopic(input: CreateTopicRequest): Promise<{ topicId: string }>;

  /** `POST /topics/{topicId}/numbers-preview` · D · body `{ numbers }`, read-only · Errors: `400 emptyNumbers` · `400 numbersTwin` · `404 topicNotFound`. */
  previewNumbersChange(topicId: string, numbers: string): Promise<NumbersChangePreview>;

  /**
   * `PATCH /topics/{topicId}` · D · the `numbers` field replaces the whole set.
   * Errors: `400 numbersTwin` · `409 numbersConfirm` · `409 numbersAssigned` (`details` = fresh
   * `NumbersChangePreview` for both) · `404 topicNotFound`.
   */
  updateTopic(topicId: string, input: UpdateTopicRequest): Promise<TopicDetail>;

  /** `DELETE /topics/{topicId}/files/{kind}` · D · idempotent · Errors: — */
  deleteTopicFile(topicId: string, kind: "theory" | "homework"): Promise<void>;

  /** `GET /topics/{topicId}/impact` · D · what deleting the topic destroys · Errors: `404 topicNotFound`. */
  getTopicImpact(topicId: string): Promise<TopicImpact>;

  /**
   * `DELETE /topics/{topicId}?acknowledgedNumbersWithWork=<int>` · D · pass `TopicImpact.summary.numbersWithWork`
   * the user saw; then open `content.topics`. Errors: `409 deleteChanged` (`details` = fresh `TopicImpact`) ·
   * `404 topicNotFound`.
   */
  deleteTopic(topicId: string, acknowledgedNumbersWithWork: number): Promise<void>;

  /** `PUT /topics/order` · D · body `{ orderedTopicIds }` (the full order); resolves to the stored order · Errors: `409 listChanged` · `400 invalidRequest`. */
  reorderTopics(orderedTopicIds: string[]): Promise<string[]>;

  /** `PUT /numbers/{homeworkNumberId}/condition` · D · resolves to the stored `conditionLatex` · Errors: `400 latexRequired` · `404 numberNotFound`. */
  saveCondition(homeworkNumberId: string, conditionLatex: string): Promise<string>;

  /** `DELETE /numbers/{homeworkNumberId}/condition` · D · Errors: `404 numberNotFound`. */
  deleteCondition(homeworkNumberId: string): Promise<void>;

  /** `PUT /numbers/{homeworkNumberId}/answer` · D · resolves to the stored `answerLatex` · Errors: `400 latexRequired` · `404 numberNotFound`. */
  saveAnswer(homeworkNumberId: string, answerLatex: string): Promise<string>;

  /** `DELETE /numbers/{homeworkNumberId}/answer` · D · Errors: `404 numberNotFound`. */
  deleteAnswer(homeworkNumberId: string): Promise<void>;

  /** `GET /topic-import/prompt` · D · resolves to the bare prompt text · Errors: — */
  getImportPrompt(): Promise<string>;

  /**
   * `POST /topic-import` with `mode: "preview"` · D · writes nothing.
   * Errors: `400 topicMissing` · `400 importInvalid` · `404 topicDeleted` · `413 fileTooBig` (> 2 MiB) · `429 rateLimited`.
   */
  previewImport(input: { text: string; target: ImportTarget }): Promise<ImportPreview>;

  /**
   * `POST /topic-import` with `mode: "apply"` · D · never deletes numbers; filled statements / answers are
   * overwritten only with `overwriteFilled`.
   * Errors: `400 topicMissing` · `400 importInvalid` · `404 topicDeleted` · `413 fileTooBig` · `500 createFailed` ·
   * `500 writeFailed` · `429 rateLimited`.
   */
  applyImport(input: { text: string; target: ImportTarget; overwriteFilled?: boolean }): Promise<ImportApplyResult>;
}

// ───────────────────────────── 9. developer — 00 §2.12 panel / journal (5 methods) ─────────────────────────────

/** Developer panel, settings, actions, broadcast, journal (owner spec 07). Role D on every method. */
export interface DeveloperApi {
  /** `GET /developer/panel` · D · Errors: — */
  getPanel(): Promise<DeveloperPanelData>;

  /** `PUT /developer/settings` · D · body `Partial<SiteSettings>` (the server clamps) · Errors: `500 saveFailed`. */
  saveSettings(values: Partial<SiteSettings>): Promise<SaveSettingsResult>;

  /** `POST /developer/actions/{action}` · D · `ok: false` is a normal 200 (`ok` is DATA here) · Errors: — */
  runAction(action: PanelAction): Promise<PanelActionResult>;

  /** `POST /developer/broadcast` · D · `ok: false` is a normal 200 · Errors: — */
  broadcast(input: BroadcastRequest): Promise<BroadcastResult>;

  /** `GET /developer/journal?category=&actor=&action=&outcome=failed&days=&page=` · D · strings rendered for the request language · Errors: — */
  getJournal(query: JournalQuery): Promise<JournalPage>;
}

// ───────────────────────────── composition ─────────────────────────────

/** Every server operation of the app. Implemented by `MockApiClient` now and `HttpApiClient` later. */
export interface ApiClient {
  /** 01 — session, profile, notifications, streak, number search, realtime (11). */
  shell: ShellApi;
  /** 02 — deadlines, theory, number detail, note (4). */
  studentStudy: StudentStudyApi;
  /** 03 — homeworks, photos, AI check, live lesson (10). */
  studentWork: StudentHomeworkLessonApi;
  /** 04 — teacher home, students, homework review / assign, progress history, report (16). */
  teacherStudents: TeacherStudentsApi;
  /** 04 — developer accounts (5). */
  accounts: DeveloperAccountsApi;
  /** 05 — lessons, live board, homework drafts (22). */
  planner: TeacherPlannerApi;
  /** 06 — groups, attendance, parent calls, statistics (20). */
  groups: GroupsCallsStatsApi;
  /** 07 — topics, numbers, statements / answers, import, upload (19). */
  content: ContentApi;
  /** 07 — dev panel, settings, actions, broadcast, journal (5). */
  developer: DeveloperApi;
}

export type ApiMember = keyof ApiClient;
export type ApiMethodName<M extends ApiMember> = keyof ApiClient[M] & string;

/**
 * The complete method list (B.4), checked by the compiler against the interfaces above: a missing or an
 * extra name is a type error. Used by the completeness test of each implementation and by `qk`.
 */
const API_METHOD_TABLE = {
  shell: {
    getMeta: true, login: true, logout: true, getMe: true, updateProfile: true, changePassword: true,
    listNotifications: true, markNotificationsRead: true, getStreak: true, findNumber: true, subscribeRealtime: true,
  },
  studentStudy: { getHomeworkDeadlines: true, getTheoryLibrary: true, getNumberDetail: true, saveNumberNote: true },
  studentWork: {
    listHomeworks: true, getHomework: true, uploadHomeworkPhotos: true, deleteHomeworkPhoto: true,
    startHomeworkCheck: true, getLatestHomeworkCheck: true, getLiveLesson: true, joinLesson: true,
    submitLessonItem: true, getLiveLessonState: true,
  },
  teacherStudents: {
    getTeacherHome: true, listStudents: true, createStudent: true, deleteStudent: true, resetStudentPassword: true,
    getStudentCard: true, getStudentHomeworks: true, getAssignBoard: true, issueHomework: true, cancelHomework: true,
    setNumberStatus: true, setNumberStatuses: true, setNumberDeadlines: true, getProgressHistory: true,
    listStudentLessons: true, downloadStudentReport: true,
  },
  accounts: {
    getAccounts: true, createAccount: true, changeStudentOwners: true, resetTeacherPassword: true, deleteTeacher: true,
  },
  planner: {
    listLessons: true, getLessonTargets: true, getLessonNewForm: true, getNumberBank: true, createLesson: true,
    getLessonBoard: true, getLessonStatus: true, getLessonLive: true, scheduleLesson: true, finishLesson: true,
    deleteLesson: true, saveLessonItems: true, regenerateParticipant: true, setItemResult: true, getHandoutUrl: true,
    listHomeworkPlans: true, getHomeworkPlanNewForm: true, createHomeworkPlan: true, getHomeworkPlanBoard: true,
    getHomeworkPlanStatus: true, issueHomeworkPlan: true, deleteHomeworkPlan: true,
  },
  groups: {
    listGroups: true, createGroup: true, getGroup: true, renameGroup: true, deleteGroup: true, addGroupMember: true,
    removeGroupMember: true, setStudentAiProfile: true, getGroupStatistics: true, getGroupAttendance: true,
    setAttendance: true, downloadGroupAttendancePdf: true, getParentCallsOverview: true, getParentCallCounts: true,
    getParentCallHistory: true, recordParentCall: true, getStatisticsProgress: true, getStatisticsDrilldown: true,
    getStatisticsTeachers: true, getStatisticsPlatform: true,
  },
  content: {
    listTopics: true, getTopic: true, getNumber: true, getTopicConditions: true, uploadFile: true, createTopic: true,
    previewNumbersChange: true, updateTopic: true, deleteTopicFile: true, getTopicImpact: true, deleteTopic: true,
    reorderTopics: true, saveCondition: true, deleteCondition: true, saveAnswer: true, deleteAnswer: true,
    getImportPrompt: true, previewImport: true, applyImport: true,
  },
  developer: { getPanel: true, saveSettings: true, runAction: true, broadcast: true, getJournal: true },
} as const satisfies { [M in ApiMember]: Record<keyof ApiClient[M], true> };

function methodNames<M extends ApiMember>(member: M): readonly ApiMethodName<M>[] {
  return Object.keys(API_METHOD_TABLE[member]) as ApiMethodName<M>[];
}

/** The nine member names, in composition order. */
export const API_MEMBERS = Object.keys(API_METHOD_TABLE) as readonly ApiMember[];

/** Method names per member — 11 + 4 + 10 + 16 + 5 + 22 + 20 + 19 + 5 = 112, each name in exactly one member. */
export const API_METHODS: { readonly [M in ApiMember]: readonly ApiMethodName<M>[] } = {
  shell: methodNames("shell"),
  studentStudy: methodNames("studentStudy"),
  studentWork: methodNames("studentWork"),
  teacherStudents: methodNames("teacherStudents"),
  accounts: methodNames("accounts"),
  planner: methodNames("planner"),
  groups: methodNames("groups"),
  content: methodNames("content"),
  developer: methodNames("developer"),
};

export const API_METHOD_COUNT = 112;

// ───────────────────────────── services that live next to ApiClient ─────────────────────────────

/** A file reference `FileService.download` accepts: a `FileRef`, or one without `size` (e.g. an `AttachedPhoto` mapped to its file). */
export type DownloadableFile = FileRef | { id: string; originalName: string; mimeType: string };

/**
 * File bytes (`GET /files/{fileId}[?thumb=1][&download=1]`). NOT a member of `ApiClient`: it returns image
 * sources / local URIs, not DTOs. A response never contains a URL — screens pass a `fileId` / `FileRef` here.
 * Access: a student reads topic theory / homework files and own photos only; a missing or not permitted file
 * is `404 fileNotFound`. Files are immutable, so downloads are cached by `fileId` and never re-validated.
 */
export interface FileService {
  /** Remote URL + auth headers for streaming components (images). `"thumb"` = WebP thumbnail (falls back to the original). */
  source(fileId: string, variant?: "original" | "thumb"): { uri: string; headers: Record<string, string> };

  /**
   * Downloads once into the app cache and resolves to a local file URI. `onProgress` receives a fraction 0..1
   * (only when the size is known). Rejects with `ApiError` (`404 fileNotFound`, `429 rateLimited`, `network`).
   */
  download(file: DownloadableFile, onProgress?: (fraction: number) => void): Promise<string>;

  /**
   * The stored file's own name, type and size, after the same access check as `download` (HTTP: the
   * `Content-Type` / `Content-Disposition` / `Content-Length` of the file response). The viewer route types a
   * file its link names by id alone from this, never from the link. Rejects like `download`.
   */
  describe(fileId: string): Promise<FileRef>;
}

/**
 * Device preferences (theme, hints, language). NOT a member of `ApiClient`: device storage only, one
 * implementation for both modes, never sent to a server in v1, survives logout.
 */
export interface PreferencesStore {
  /** Validated per field, defaults applied (`DEFAULT_INTERFACE_PREFERENCES`). */
  load(): Promise<InterfacePreferences>;
  setThemeMode(mode: ThemeMode): Promise<void>;
  setHints(hints: HintsMode): Promise<void>;
  /** `{ ok: false }` when the value is not a known locale. */
  setLocale(locale: Locale): Promise<{ ok: true; locale: Locale } | { ok: false }>;
}

/** What the composition root provides to the UI. */
export interface AppServices {
  api: ApiClient;
  files: FileService;
  preferences: PreferencesStore;
}
