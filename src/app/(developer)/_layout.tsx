// DEVELOPER tree (docs/spec/00-unified-contract.md §3.1): the tabs and, above them, the screens with
// several entry points. Mounted only for this role (guard in the root layout).
import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

// The tabs are always the bottom of this stack, also when a screen above them is opened directly.
export const unstable_settings = { anchor: 'developer/(tabs)' };

export default function DeveloperRootLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.pageBg } }}>
      <Stack.Screen name="developer/(tabs)" />
    </Stack>
  );
}
