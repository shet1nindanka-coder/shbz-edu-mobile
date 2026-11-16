// Stack of the teacher's «занятия» tab: the two segments of one section — `planner.lessons` («Уроки»,
// default) and `planner.drafts` («Домашние задания»). A segment switch replaces the list (90-addendum-2 N1).
import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export const unstable_settings = { anchor: 'lessons' };

export default function TeacherPlannerTabLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: theme.colors.pageBg } }} />
  );
}
