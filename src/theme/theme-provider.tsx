import { createContext, use, type ReactNode } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

import { layoutClassFor } from './metrics';
import { lightTheme, resolveTheme, type Theme, type ThemeMode } from './theme';

const ThemeContext = createContext<Theme>(lightTheme);

export type ThemeProviderProps = {
  /** The user's preference; `system` follows the OS scheme live for the whole app lifetime. */
  mode?: ThemeMode;
  children: ReactNode;
};

/**
 * Resolves the theme from the user's mode, the OS colour scheme and the window width (phone / tablet
 * layout class). `useColorScheme()` and `useWindowDimensions()` re-render on changes, so `system` and a
 * rotated or resized window stay in sync without any extra subscription. Providers can be nested (e.g. a
 * forced-light preview inside a dark screen).
 */
export function ThemeProvider({ mode = 'system', children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const theme = resolveTheme(mode, systemScheme, layoutClassFor(width));
  return <ThemeContext value={theme}>{children}</ThemeContext>;
}

/** The current theme. Outside a provider it is the light phone theme. */
export function useTheme(): Theme {
  return use(ThemeContext);
}
