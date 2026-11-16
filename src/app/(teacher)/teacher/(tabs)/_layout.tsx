// TEACHER — 4 tabs in site order + «ещё»: обзор · ученики · занятия · звонки · ещё (темы, группы).
import { Tabs } from 'expo-router/js-tabs';

import { RoleTabBar } from '@/navigation';
import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function TeacherTabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.pageBg } }}
      tabBar={(props) => <RoleTabBar {...props} role="TEACHER" />}
    >
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="students" />
      <Tabs.Screen name="(planner)" />
      <Tabs.Screen name="calls" />
      <Tabs.Screen name="(more)" />
    </Tabs>
  );
}
