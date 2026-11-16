// DEVELOPER — exactly 5 tabs in site order: темы · аккаунты · звонки · статистика · дев-панель.
import { Tabs } from 'expo-router/js-tabs';

import { RoleTabBar } from '@/navigation';
import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

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
