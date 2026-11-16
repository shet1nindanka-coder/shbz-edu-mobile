// Shell: the screens the shell owns and the chrome every area reuses.
//
// For area screens:
//   <Screen header={<ShellAppBar title={m.shell.tabs.homeworks} />} bottomInset={false}>   tab roots
//   <Screen header={<DetailAppBar title={…} />}>                                           pushed screens
//   <NotFoundScreen />                       a detail whose entity is gone (404)
//   <PlannerSegments active="lessons" />     root of the teacher's «занятия» section
//   <StreakBadge currentStreak={…} />, useStudentStreak(), useNotifications()
//   export { RouteErrorBoundary as ErrorBoundary }   already done by every route file
export { DemoDataScreen } from './DemoDataScreen';
export { DetailAppBar, type DetailAppBarProps } from './DetailAppBar';
export { FileViewerScreen, type FileViewerScreenProps } from './FileViewerScreen';
export { LaunchScreen } from './LaunchScreen';
export { LockGate } from './LockGate';
export { LoginScreen } from './LoginScreen';
export { NotFoundScreen, type NotFoundScreenProps } from './NotFoundScreen';
export { NotificationsScreen } from './NotificationsScreen';
export { NumberSearchScreen } from './NumberSearchScreen';
export { PlannerSegments, type PlannerSegmentsProps } from './PlannerSegments';
export { ReminderOpener } from './ReminderOpener';
export { RouteErrorBoundary } from './RouteErrorBoundary';
export { ScreenPlaceholder, type ScreenPlaceholderProps } from './ScreenPlaceholder';
export { SettingsScreen } from './SettingsScreen';
export { ShellAppBar, type ShellAppBarProps } from './ShellAppBar';
export { StreakBadge, type StreakBadgeProps } from './StreakBadge';
export { TeacherMoreScreen } from './TeacherMoreScreen';
export { screenTitle } from './screen-titles';
export { formatWait, useCountdown } from './use-countdown';
export { useNotifications, useStudentStreak } from './use-shell-data';
