// DEVELOPER — exactly 5 tabs in site order: темы · аккаунты · звонки · статистика · дев-панель.
import { Tabs } from 'expo-router/js-tabs';

import { RoleTabBar } from '@/navigation';
import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

// «темы» is the role home (roleHome). Without it the navigator would start on the shortest route name
// («calls»): a deep entry into a screen above the tabs went back to «звонки», and /developer opened Calls.
export const unstable_settings = { anchor: 'topics' };

export default function DeveloperTabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.pageBg } }}
      tabBar={(props) => <RoleTabBar {...props} role="DEVELOPER" />}
    >
      <Tabs.Screen name="topics" />
      <Tabs.Screen name="accounts" />
      <Tabs.Screen name="calls" />
      <Tabs.Screen name="statistics" />
      <Tabs.Screen name="panel" />
    </Tabs>
  );
}
