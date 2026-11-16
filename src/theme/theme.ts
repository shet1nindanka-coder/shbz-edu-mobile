// The two theme objects. Light and dark are equal citizens: components read every colour from
// `useTheme().colors` and never branch on the theme name for a colour.
import { darkColors, gradients, lightColors, type ThemeColors } from './colors';
import { borders, radii, sizes, space } from './metrics';
import { motion } from './motion';
import { darkShadows, lightShadows, type ThemeShadows } from './shadows';
import { statusPalette } from './status';
import { fonts, typography } from './typography';

/** The user's choice (settings). */
export type ThemeMode = 'system' | 'light' | 'dark';
/** What is painted. */
export type ThemeName = 'light' | 'dark';

function buildTheme(name: ThemeName, colors: ThemeColors, shadows: ThemeShadows) {
  return {
    name,
    dark: name === 'dark',
    colors,
    gradients,
    shadows,
    radii,
    borders,
    space,
    sizes,
    fonts,
    typography,
    motion,
    status: statusPalette(colors),
    /** `expo-status-bar` style to use on top of `colors.pageBg`. */
    statusBarStyle: name === 'dark' ? ('light' as const) : ('dark' as const),
  };
}

export const lightTheme = buildTheme('light', lightColors, lightShadows);
export const darkTheme = buildTheme('dark', darkColors, darkShadows);
export type Theme = typeof lightTheme;

export function resolveThemeName(mode: ThemeMode, systemScheme: string | null | undefined): ThemeName {
  if (mode === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return mode;
}

export function resolveTheme(mode: ThemeMode, systemScheme: string | null | undefined): Theme {
  return resolveThemeName(mode, systemScheme) === 'dark' ? darkTheme : lightTheme;
}
