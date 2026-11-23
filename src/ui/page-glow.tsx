import { useId } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

import { absoluteFill } from './internal/layout';

export type PageGlowProps = {
  /** Kept for the callers of the previous design; every screen has the same glow now. */
  variant?: 'dashboard' | 'login';
};

/** `rgba(r, g, b, a)` → the opaque colour and its alpha (react-native-svg stops take them separately). */
function splitRgba(value: string): { color: string; opacity: number } {
  const match = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(value);
  if (!match) return { color: value, opacity: 1 };
  return { color: `rgb(${match[1]}, ${match[2]}, ${match[3]})`, opacity: Number(match[4]) };
}

/**
 * The page glow of the design: a soft sky → mint radial gradient behind the top of every screen
 * (`radial-gradient(420px 240px at 50% -70px, glow1, glow2 48%, transparent 72%)`; wider on a tablet).
 * Purely decorative; put it first inside a screen so the content paints over it.
 */
export function PageGlow(_props: PageGlowProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const id = useId();
  const { glow } = theme.gradients;
  const spec = theme.tablet ? glow.tablet : glow.phone;
  const from = splitRgba(theme.colors.glow1);
  const mid = splitRgba(theme.colors.glow2);
  const boxHeight = Math.max(1, spec.cy + spec.ry);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[absoluteFill, { pointerEvents: 'none' }]}>
      <Svg width={width} height={boxHeight}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
            <Stop offset={0} stopColor={from.color} stopOpacity={from.opacity} />
            <Stop offset={glow.midAt} stopColor={mid.color} stopOpacity={mid.opacity} />
            <Stop offset={glow.fadeAt} stopColor={mid.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={width / 2 - spec.rx} y={spec.cy - spec.ry} width={spec.rx * 2} height={spec.ry * 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
