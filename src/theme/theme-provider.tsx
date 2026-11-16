import { createContext, use, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { lightTheme, resolveTheme, type Theme, type ThemeMode } from './theme';

const ThemeContext = createContext<Theme>(lightTheme);

export type ThemeProviderProps = {
  /** The user's preference; `system` follows the OS scheme live for the whole app lifetime. */
  mode?: ThemeMode;
  children: ReactNode;
};

/**
 * Resolves the theme from the user's mode and the OS colour scheme. `useColorScheme()` re-renders on OS
 * changes, so `system` stays in sync without any extra subscription. Providers can be nested (e.g. a
 * forced-light preview inside a dark screen).
 */
export function ThemeProvider({ mode = 'system', children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const theme = resolveTheme(mode, systemScheme);
  return <ThemeContext value={theme}>{children}</ThemeContext>;
}

/** The current theme. Outside a provider it is the light theme. */
export function useTheme(): Theme {
  return use(ThemeContext);
}
