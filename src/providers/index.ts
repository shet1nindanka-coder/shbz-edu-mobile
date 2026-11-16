// Composition root and the app-wide hooks.
//
//   <AppProviders>            mounted once by src/app/_layout.tsx
//   useSession()              status, user, signIn / signOut
//   useCurrentUser()          the signed-in user (role trees only)
//   usePreferences()          theme mode, hints, language, app switches + setters
//   useHintsEnabled(), <Hint> render explanatory lines only when hints are on
//   saveStudentNote(), usePendingStudentNote(), getPendingWrites(), usePendingWrite()
export { IS_MOCK_BUILD } from './app-config';
export { AppProviders, type AppProvidersProps } from './app-providers';
export {
  STUDENT_NOTE_WRITE,
  getPendingWrites,
  saveStudentNote,
  usePendingStudentNote,
  usePendingWrite,
  usePendingWritesCount,
  type PendingWriteContext,
  type StudentNotePayload,
  type StudentNoteResult,
} from './pending-writes';
export { Hint, PreferencesProvider, useHintsEnabled, usePreferences, type PreferencesValue } from './preferences-provider';
export { getQueryClient } from './query';
export { getAppRuntime, type AppRuntime } from './services';
export { SessionProvider, useCurrentUser, useRole, useSession, type SessionStatus, type SessionValue } from './session-provider';
export {
  getDemoBackend,
  getDemoPersonas,
  setLoginPrefill,
  subscribeLoginPrefill,
  takeLoginPrefill,
  type DemoPersona,
  type ForcedError,
  type ForcedPlanOutcome,
  type MockControls,
  type MockDatasetInfo,
  type MockLimiterBucketInfo,
} from './demo';
