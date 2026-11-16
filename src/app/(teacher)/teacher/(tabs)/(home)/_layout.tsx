// Stack of the teacher's first tab: `teacher.home`.
import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

// The list is always under a detail, also when the detail is opened directly (a notification, a web reload).
export const unstable_settings = { anchor: 'index' };

export default function TeacherHomeTabLayout() {
  const theme = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.pageBg } }} />;
}
