import { useId } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

import { absoluteFill } from './internal/layout';

export type PageGlowProps = {
  /** `dashboard` — faint mint glow in the top-right corner; `login` — stronger glow at the top centre. */
  variant?: 'dashboard' | 'login';
};

/**
 * The site's page glow: a radial mint gradient fading out at 70 %. Purely decorative; put it first
 * inside a screen so the content paints over it.
 */
export function PageGlow({ variant = 'dashboard' }: PageGlowProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const id = useId();
  const { glow } = theme.gradients;
  const spec = variant === 'login' ? glow.login : glow.dashboard;
  const opacity =
    variant === 'login' ? (theme.dark ? glow.login.opacityDark : glow.login.opacityLight) : glow.dashboard.opacity;
  // The ellipse is centered on the corner (dashboard) or just above the top edge (login).
  const centerX = variant === 'login' ? width / 2 : width;
  const centerY = variant === 'login' ? -0.08 * height : 0;
  const boxHeight = Math.max(1, centerY + spec.height);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[absoluteFill, { pointerEvents: 'none' }]}>
      <Svg width={width} height={boxHeight}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
            <Stop offset={0} stopColor={glow.from} stopOpacity={opacity} />
            <Stop offset={glow.fadeAt} stopColor={glow.to} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect
          x={centerX - spec.width}
          y={centerY - spec.height}
          width={spec.width * 2}
          height={spec.height * 2}
          fill={`url(#${id})`}
        />
      </Svg>
    </View>
  );
}
