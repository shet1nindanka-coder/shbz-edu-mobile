// The theme objects. Light and dark are equal citizens: components read every colour from
// `useTheme().colors` and never branch on the theme name for a colour. Each colour scheme exists for the
// two layout classes (phone, tablet): the scales are shared, a few tokens differ (screen title 24 / 34,
// card title 17 / 20, gutter 16 / 24), so a component styled from the theme adapts without branching.
import { Platform } from 'react-native';

import { darkColors, gradients, lightColors, type ThemeColors } from './colors';
import { borders, radii, sizesFor, spaceFor, type LayoutClass } from './metrics';
import { motion } from './motion';
import { darkShadows, lightShadows, type ThemeShadows } from './shadows';
import { statusPalette } from './status';
import { fontFamilies, typographyFor, type ThemeTypography } from './typography';

/** Font families: the Onest cuts plus the platform's monospace (formulas of the LaTeX editor, logins). */
export const fonts = {
  ...fontFamilies,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, Consolas, monospace' }),
} as const;

/** The phone type scale, for code that needs a text style outside a component. */
export const typography: ThemeTypography = typographyFor('phone', fonts.mono);

/** The user's choice (settings). */
export type ThemeMode = 'system' | 'light' | 'dark';
/** What is painted. */
export type ThemeName = 'light' | 'dark';

function buildTheme(name: ThemeName, layout: LayoutClass, colors: ThemeColors, shadows: ThemeShadows) {
  const typography: ThemeTypography = typographyFor(layout, fonts.mono);
  return {
    name,
    dark: name === 'dark',
    /** Layout class of the window: `tablet` from 768 pt of width. */
    layout,
    tablet: layout === 'tablet',
    colors,
    gradients,
    shadows,
    radii,
    borders,
    space: spaceFor(layout),
    sizes: sizesFor(layout),
    fonts,
    typography,
    motion,
    status: statusPalette(colors),
    /** `expo-status-bar` style to use on top of `colors.pageBg`. */
    statusBarStyle: name === 'dark' ? ('light' as const) : ('dark' as const),
  };
}

export const lightTheme = buildTheme('light', 'phone', lightColors, lightShadows);
export const darkTheme = buildTheme('dark', 'phone', darkColors, darkShadows);
export const lightTabletTheme = buildTheme('light', 'tablet', lightColors, lightShadows);
export const darkTabletTheme = buildTheme('dark', 'tablet', darkColors, darkShadows);
export type Theme = typeof lightTheme;

export function resolveThemeName(mode: ThemeMode, systemScheme: string | null | undefined): ThemeName {
  if (mode === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return mode;
}

export function resolveTheme(mode: ThemeMode, systemScheme: string | null | undefined, layout: LayoutClass = 'phone'): Theme {
  const dark = resolveThemeName(mode, systemScheme) === 'dark';
  if (layout === 'tablet') return dark ? darkTabletTheme : lightTabletTheme;
  return dark ? darkTheme : lightTheme;
}
