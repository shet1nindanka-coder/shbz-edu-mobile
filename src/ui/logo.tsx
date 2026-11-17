import { type StyleProp, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

export type LogoProps = {
  /** Font size of the lockup: 24 in the top bar (default), 26 on login. */
  size?: number;
  /** `default` — ink + brand; `onDark` — forces white ink; `mono` — one inherited colour. */
  variant?: 'default' | 'onDark' | 'mono';
  /** Colour of the `mono` variant; default is the strong text colour. */
  monoColor?: string;
  /** Accessible name; the brand name is the same in both languages. */
  accessibilityLabel?: string;
  style?: StyleProp<TextStyle>;
};

// The lockup is live text, as on the site: two parts of one word with no space, told apart by colour only.
const INK_PART = 'ШБЗ';
const BRAND_PART = 'Школа';
const BRAND_NAME = `${INK_PART} ${BRAND_PART}`;

/**
 * Logo «ШБЗШкола» in Montserrat Black. The suffix uses the flat brand colour (the site's og:image and
 * print variant); below 22px it switches to the deeper brand tone, as the site's small version does.
 */
export function Logo({ size = 24, variant = 'default', monoColor, accessibilityLabel = BRAND_NAME, style }: LogoProps) {
  const theme = useTheme();
  const mono = variant === 'mono' ? (monoColor ?? theme.colors.textStrong) : null;
  const ink = mono ?? (variant === 'onDark' ? theme.colors.onAccent : theme.colors.logoInk);
  const brand = mono ?? (size < 22 ? theme.colors.brandDeep : theme.colors.brand);
  const lineHeight = Math.round(size * 1.2);
  return (
    <Text
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      numberOfLines={1}
      maxFontSizeMultiplier={1}
      style={[
        {
          fontFamily: theme.fonts.black,
          fontSize: size,
          lineHeight,
          letterSpacing: -0.015 * size,
          color: ink,
        },
        style,
      ]}
    >
      {INK_PART}
      {/* The nested span repeats the lockup's line height: the app Text would otherwise bring the body
          variant's 22pt, and on Android every span's line height shrinks the shared line box. */}
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: theme.fonts.black, fontSize: size, lineHeight, color: brand }}>
        {BRAND_PART}
      </Text>
    </Text>
  );
}
