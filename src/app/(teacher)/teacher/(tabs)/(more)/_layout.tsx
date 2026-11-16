// Stack of the teacher's «ещё» tab: the list → `content.topics` → `content.topic`, `groups.list` → `groups.detail`.
import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

// The list is always under a detail, also when the detail is opened directly (a notification, a web reload).
export const unstable_settings = { anchor: 'more' };

export default function TeacherMoreTabLayout() {
  const theme = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.pageBg } }} />;
}
