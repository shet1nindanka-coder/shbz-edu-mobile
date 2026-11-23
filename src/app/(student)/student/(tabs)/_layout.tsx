// STUDENT — every primary section is a tab: обзор · урок · дз · дедлайны · теория · инфа. The dock (one
// overlay for the whole app, `DockHost`) shows the first five on a phone and all six on a tablet.
import { Tabs } from 'expo-router/js-tabs';

import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

// «обзор» is the role home; named explicitly so the first tab never depends on the route sort order
// (a deep entry above the tabs goes back here).
export const unstable_settings = { anchor: '(home)' };

export default function StudentTabsLayout() {
  const theme = useTheme();
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.pageBg } }} tabBar={() => null}>
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="lesson" />
      <Tabs.Screen name="homeworks" />
      <Tabs.Screen name="deadlines" />
      <Tabs.Screen name="theory" />
      <Tabs.Screen name="info" />
    </Tabs>
  );
}
