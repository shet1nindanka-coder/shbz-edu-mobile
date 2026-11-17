// STUDENT — 5 tabs in site order: обзор · урок · дз · дедлайны · теория («общая инфа» is a row on Home and in Settings).
import { Tabs } from 'expo-router/js-tabs';

import { RoleTabBar } from '@/navigation';
import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

// «обзор» is the role home; named explicitly so the first tab never depends on the route sort order
// (a deep entry above the tabs goes back here).
export const unstable_settings = { anchor: '(home)' };

export default function StudentTabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.pageBg } }}
      tabBar={(props) => <RoleTabBar {...props} role="STUDENT" />}
    >
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="lesson" />
      <Tabs.Screen name="homeworks" />
      <Tabs.Screen name="deadlines" />
      <Tabs.Screen name="theory" />
    </Tabs>
  );
}
