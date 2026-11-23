import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { absoluteFill } from './internal/layout';

export type GlassProps = {
  /** Corner radius; default: a capsule / circle. */
  radius?: number;
  /** Layout of the outer box (size, position). The outer box carries the shadow. */
  style?: StyleProp<ViewStyle>;
  /** Layout of the content box (padding, flex direction). */
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
};

/**
 * Glass (`.glass`): translucent fill over a blurred backdrop, a light rim and a deep soft shadow. It is
 * for navigation only — the dock and the round header buttons — never for content.
 *
 * iOS and web blur what is behind (`backdrop-filter: blur(24px) saturate(190%)` in the mockups). Android's
 * blur needs the screen content wrapped in a blur target and is costly, so there the glass is a nearly
 * opaque fill instead (the handoff allows exactly that).
 */
export function Glass({ radius, style, contentStyle, testID, children }: GlassProps) {
  const theme = useTheme();
  const styles = useStyles();
  const blurs = Platform.OS !== 'android';
  const borderRadius = radius ?? theme.radii.full;
  return (
    <View testID={testID} style={[theme.shadows.glass, { borderRadius }, style]}>
      <View style={[styles.clip, { borderRadius, backgroundColor: blurs ? 'transparent' : theme.colors.glassSolid }]}>
        {blurs ? (
          <BlurView intensity={48} tint={theme.dark ? 'dark' : 'light'} style={absoluteFill} />
        ) : null}
        {blurs ? <View style={[absoluteFill, { backgroundColor: theme.colors.glass }]} /> : null}
        <View style={[styles.rim, { borderRadius }]} />
      </View>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // The blur and the tint are clipped to the shape; the shadow stays on the outer box (a clipping view
  // would cut its own shadow on iOS).
  clip: { ...absoluteFill, overflow: 'hidden' },
  rim: { ...absoluteFill, borderWidth: t.borders.hairline, borderColor: t.colors.glassLine, pointerEvents: 'none' },
}));
