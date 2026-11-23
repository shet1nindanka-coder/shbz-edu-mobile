// TEACHER — every primary section is a tab: обзор · темы · ученики · группы · занятия · звонки. The dock
// (one overlay for the whole app, `DockHost`) shows обзор · ученики · группы · занятия · ещё on a phone —
// темы and звонки are behind «ещё» — and all six on a tablet.
import { Tabs } from 'expo-router/js-tabs';

import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

// «обзор» is the role home; named explicitly so the first tab never depends on the route sort order
// (a deep entry above the tabs goes back here).
export const unstable_settings = { anchor: '(home)' };

export default function TeacherTabsLayout() {
  const theme = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.pageBg } }} tabBar={() => null}>
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="topics" />
      <Tabs.Screen name="students" />
      <Tabs.Screen name="groups" />
      <Tabs.Screen name="(planner)" />
      <Tabs.Screen name="calls" />
    </Tabs>
  );
}
