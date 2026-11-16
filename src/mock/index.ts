/**
 * The mock backend: `createMockApiClient(options)` returns an `ApiClient` that runs entirely in the app.
 * Pure TypeScript — no React, no React Native — so it is testable with `tsx --test`.
 *
 * Only the composition root (and the mock `FileService`) import this module; screens receive the client
 * through `ApiProvider` and never know which implementation they talk to.
 */
export { createMockApiClient } from "./MockApiClient";
export type { MockApiClient, MockApiClientOptions } from "./MockApiClient";

export { MOCK_DOCUMENT_SAMPLES, MOCK_FILE_SAMPLES, MOCK_PHOTO_SAMPLES, MOCK_SAMPLE_SCHEME, isMockFileSample, mockSampleUrl, parseMockSampleUrl } from "./assets";
export type { MockDocumentKind, MockDocumentRequest, MockFileSample } from "./assets";

export { createManualClock, createSystemClock } from "./clock";
export type { ManualMockClock, MockClock, MockTimer } from "./clock";

export { DEFAULT_MOCK_LATENCY, MOCK_CLIENT_IP, PINNED_LOGIN, PINNED_PASSWORD_USER_ID, PINNED_REALTIME_USER_ID, defaultMockControls } from "./controls";
export type {
  ForcedError,
  ForcedPlanOutcome,
  LimiterPin,
  MockControlActions,
  MockControls,
  MockDatasetInfo,
  MockLimiterBucketInfo,
  MockLimiterScope,
} from "./controls";

export { createMockContext } from "./context";
export type { MockCascade, MockContext, MockDocuments, MockSwitches } from "./context";

export { DEMO_PASSWORDS, DEMO_PERSONAS, FIXTURES_REVISION, GROUP, MOCK_COVERAGE, TOPIC, USER, buildFixtures, numberId } from "./fixtures";
export type { BuildFixturesOptions, DemoPersona, MockCoverageRow, MockStateKind } from "./fixtures";

export { DEFAULT_STORAGE_PREFIX, MOCK_STORE_VERSION, MockConstraintError, MockPersistence, MockStore, createMemoryStorage } from "./store";
export type {
  LimiterBucket,
  MockJob,
  MockJobKind,
  MockPlanScript,
  MockPlanScriptOutcome,
  MockRowScript,
  MockRowScriptOutcome,
  MockSnapshot,
  MockStorageAdapter,
  MockStoredFile,
  MockTableName,
  MockTableRows,
  MockUser,
  ScriptedResult,
} from "./store";

export { MOCK_TIMINGS, retryAfterSeconds, shouldReceiveRealtimeEvent } from "./rules";
export type {
  AuditInput,
  CreateNotificationInput,
  FailInit,
  IssueHomeworkInput,
  IssueHomeworkResult,
  MessageSelector,
  MockErrors,
  MockFileInfo,
  MockUploadedFile,
  ProgressWriteInput,
  ProgressWriteResult,
  RateLimitResult,
  RealtimeEventInput,
} from "./rules";

export {
  MOCK_MODEL_NAME,
  VERDICT_CYCLE,
  failedCheckError,
  failureRefundsBudget,
  scriptHomeworkCheck,
  scriptLessonSubmission,
  scriptVerdict,
  scriptedResult,
  selectFoundNumbers,
} from "./verdict-script";
export type { HomeworkCheckNumber } from "./verdict-script";
